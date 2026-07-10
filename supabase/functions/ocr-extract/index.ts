// Translation/OCR/dictionary edge function. Deployed via GitHub Actions
// (.github/workflows/deploy-functions.yml) on changes to supabase/functions/**.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Anthropic from 'npm:@anthropic-ai/sdk';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Detects when the model broke character and returned an English meta-reply
// (asking for clarification, apologizing, explaining) instead of a translation.
function looksLikeMetaReply(ko: string, source: string): boolean {
  if (!ko) return true;
  const hasHangul = /[가-힣]/.test(ko);
  const sourceHasLetters = /[A-Za-z]/.test(source);
  // A genuine translation of letter-bearing English almost always has Hangul.
  if (sourceHasLetters && !hasHangul) return true;
  // Conversational/meta phrases the model emits when it refuses to translate.
  if (/\b(I apologize|I'm sorry|target sentence|could you (?:please )?provide|appears to be (?:incomplete|a fragment)|transcription error|complete (?:sentence|thought)|please provide)\b/i.test(ko)) {
    return true;
  }
  // A single source sentence should never balloon into a long paragraph.
  if (ko.length > source.length * 6 + 120) return true;
  return false;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json() as {
      images?: { data: string; type: string }[];
      text?: string;
      sentences?: string[];
      sentence?: string;
      prev?: string;
      next?: string;
      word?: string;
      mode: 'text' | 'vocab' | 'translate' | 'translate_sentences' | 'translate_one' | 'define_word';
    };
    const { mode } = body;

    // Input caps: this endpoint runs on the owner's Anthropic key with only the
    // public anon key for auth, so bound every request to normal app sizes to
    // deny bulk credit-farming. Real usage (one sentence, one word, one chapter's
    // vocab photos) sits far under these limits.
    const tooBig =
      (body.text && body.text.length > 20_000) ||
      (body.sentence && body.sentence.length > 4_000) ||
      (body.prev && body.prev.length > 4_000) ||
      (body.next && body.next.length > 4_000) ||
      (body.word && body.word.length > 200) ||
      (body.sentences && (body.sentences.length > 60 ||
        body.sentences.some(s => (s?.length ?? 0) > 4_000))) ||
      (body.images && (body.images.length > 6 ||
        body.images.some(i => (i?.data?.length ?? 0) > 8_000_000)));
    if (tooBig) {
      return new Response(JSON.stringify({ error: 'input too large' }), {
        status: 413, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

    // ── Single-word definition + Korean meaning ───────────────────────────
    if (mode === 'define_word') {
      const word = body.word ?? '';
      if (!word.trim()) {
        return new Response(JSON.stringify({ english: '', korean: '' }), {
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: `For the English word "${word}", provide:\n1. A brief English definition (one short sentence)\n2. The Korean translation/meaning\n\nReturn ONLY a JSON object — no other text:\n{"english":"brief English definition","korean":"한국어 뜻"}`,
        }],
      });
      const raw = response.content[0].type === 'text' ? response.content[0].text : '{}';
      let result = { english: '', korean: '' };
      try {
        const start = raw.indexOf('{'); const end = raw.lastIndexOf('}');
        result = JSON.parse(start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw);
      } catch { /* keep defaults */ }
      return new Response(JSON.stringify(result), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // ── Single-sentence translate (guaranteed 1:1 alignment) ──────────────
    // The client sends ONE target sentence at a time (plus neighbors purely as
    // context). Because the unit is a single sentence, the model cannot split it
    // across rows or renumber anything — whatever it returns is THIS sentence's
    // translation, and the client drops it at the matching index. This is what
    // keeps English and Korean meaning-aligned 1:1, which batch translation
    // (positional array or numbered keys) could not guarantee.
    if (mode === 'translate_one') {
      const sentence = (body.sentence ?? '').trim();
      if (!sentence) {
        return new Response(JSON.stringify({ result: '' }), {
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      const prev = (body.prev ?? '').trim();
      const next = (body.next ?? '').trim();

      const baseSystem = `You are a professional English→Korean literary translator for a children's novel. Translate ONLY the TARGET sentence into one natural Korean rendering. The surrounding sentences are context for pronouns/tone only — do NOT translate them. Keep dialogue together with its attribution (e.g. «"Pretty," she said.» stays one Korean rendering).

ABSOLUTE OUTPUT RULES:
- Output ONLY the Korean translation as plain text. No English words, no explanations, no notes, no numbering, no surrounding quotes around the whole line.
- NEVER ask a question, NEVER ask for clarification, and NEVER comment on the input.
- The TARGET may be a fragment, a single word or letter, stammering, or punctuation only (e.g. «"I.», «"I—I—», «—»). In that case translate it as-is into the closest natural Korean (e.g. «"I.» → «"저...», «"I—I—» → «"저, 저—») and output ONLY that. Do not refuse.`;

      const callModel = async (strict: boolean): Promise<string> => {
        const resp = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: strict
            ? baseSystem + `\n\nThe previous attempt did not return a Korean translation. Output Korean characters ONLY — absolutely no English sentences or apologies.`
            : baseSystem,
          messages: [{
            role: 'user',
            content: `Context before: ${prev || '(none)'}\nContext after: ${next || '(none)'}\n\nTARGET sentence to translate:\n${sentence}`,
          }],
        });
        return resp.content[0].type === 'text'
          ? resp.content[0].text.replace(/\s*\n\s*/g, ' ').trim()
          : '';
      };

      // Guard against the model breaking character (e.g. replying in English to
      // ask about a fragment). A real translation of letter-bearing source must
      // contain Hangul; meta-replies don't. Retry strictly, then fall back to the
      // source so a row can never fill with an English paragraph.
      let ko = await callModel(false);
      if (looksLikeMetaReply(ko, sentence)) ko = await callModel(true);
      if (looksLikeMetaReply(ko, sentence)) ko = sentence;

      return new Response(JSON.stringify({ result: ko }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // ── Sentence-aligned translate mode (legacy batch; kept for compatibility) ──
    if (mode === 'translate_sentences') {
      const sentences = body.sentences ?? [];
      if (sentences.length === 0) {
        return new Response(JSON.stringify({ result: [] }), {
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      const numbered = sentences.map((s, i) => `${i + 1}. ${s}`).join('\n');

      // Return a JSON OBJECT keyed by sentence number ({"1":"…","2":"…"}) rather
      // than a positional array. We then read each translation BY KEY, so even if
      // the model splits or merges a sentence it can never shift the translations
      // that follow — alignment errors stay local instead of cascading. Prefill
      // "{" forces the model straight into the JSON object.
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        system: `You are a professional literary translator (English → Korean) working on a children's novel. Translate the numbered English sentences into natural Korean.

OUTPUT: Return ONLY a JSON object whose keys are the sentence numbers (as strings "1","2",…) and whose values are the Korean translation of that exact sentence: {"1":"…","2":"…"}.

RULES:
- Produce EXACTLY one key for every input number from 1 to ${sentences.length}.
- Put the ENTIRE translation of a sentence in its single value, even when the sentence mixes dialogue with an attribution tag or subordinate clauses (e.g. «"Pretty," she said as she lined up the buttons.» → one value). NEVER split one sentence across two keys.
- Do not add, omit, merge, or renumber keys.`,
        messages: [
          {
            role: 'user',
            content: `Translate these ${sentences.length} English sentences into Korean.\n\n${numbered}`,
          },
          // Prefill forces the response to start as a JSON object
          { role: 'assistant', content: '{' },
        ],
      });

      // If the model hit the token ceiling, the JSON is truncated and would parse
      // to mostly-empty — report it instead of silently returning blank Korean
      // with a 200 (which is indistinguishable from success).
      if (response.stop_reason === 'max_tokens') {
        return new Response(JSON.stringify({ error: 'translation truncated (max_tokens) — send fewer sentences' }), {
          status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      // The model continues from "{", so prepend it back before parsing
      const continuation = response.content[0].type === 'text' ? response.content[0].text : '}';
      const raw = '{' + continuation;
      let obj: Record<string, unknown> = {};
      try {
        const end = raw.lastIndexOf('}');
        obj = JSON.parse(end >= 0 ? raw.slice(0, end + 1) : raw + '}');
      } catch { obj = {}; }

      // Build an exactly-length, index-aligned array by reading each sentence's
      // translation by its 1-based key. Missing keys become '' (rendered as a
      // blank Korean cell) instead of pulling the next sentence up.
      const arr = sentences.map((_, i) => {
        const v = obj[String(i + 1)];
        return typeof v === 'string' ? v.replace(/\s*\n\s*/g, ' ').trim() : '';
      });

      return new Response(JSON.stringify({ result: arr }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // ── Translate mode (whole text, legacy) ───────────────────────────────
    if (mode === 'translate') {
      const inputText = body.text ?? '';
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: `Translate the following English text to Korean.\nPreserve all paragraph breaks exactly — keep the same number of paragraphs as the original.\nReturn ONLY the Korean translation with no commentary or extra text.\n\n${inputText}`,
        }],
      });
      const result = response.content[0].type === 'text' ? response.content[0].text : '';
      return new Response(JSON.stringify({ result }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // ── OCR modes (text / vocab) ───────────────────────────────────────────
    const images = body.images ?? [];
    const imageContent = images.map(img => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: img.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: img.data,
      },
    }));

    const prompt = mode === 'vocab'
      ? `Extract the vocabulary list from these images.\nFor each entry return:\n- word: the English word\n- definition: a brief English definition (one short phrase)\n- korean: the Korean translation/meaning\n\nReturn ONLY a JSON array, no other text:\n[{"word":"habitat","definition":"the natural home of an organism","korean":"서식지"},{"word":"reluctant","definition":"unwilling to do something","korean":"꺼리는, 내키지 않는"}]`
      : `Extract all English text from these images in reading order.\nIf multiple images, combine in order.\nReturn only the extracted English text with no commentary.`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: [...imageContent, { type: 'text', text: prompt }] }],
    });

    const result = response.content[0].type === 'text' ? response.content[0].text : '';
    return new Response(JSON.stringify({ result }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
