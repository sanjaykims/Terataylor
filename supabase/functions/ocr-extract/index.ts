// Translation/OCR/dictionary edge function. Deployed via GitHub Actions
// (.github/workflows/deploy-functions.yml) on changes to supabase/functions/**.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Anthropic from 'npm:@anthropic-ai/sdk';

// One model for everything this function does — reading photos, telling a photo's
// orientation, translating and defining words — so quality doesn't differ by mode
// and switching models is a one-line change.
const MODEL = 'claude-sonnet-5-5';

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

// ── Vocabulary-page extraction ───────────────────────────────────────────────
// A textbook vocabulary page is a table, not a plain word list: row number,
// a phrase whose KEY word is printed bold, a part of speech, an English
// definition followed by the Korean meaning in ≪ ≫, and sometimes a synonym.
// The old prompt said only "word, definition, korean", so the model had to guess
// which column was which, and one reply covering a whole stack of photos could
// run into the token ceiling and be cut off mid-array — leaving no closing "]"
// for the client to find, which surfaced as "단어 목록을 파싱할 수 없어요".
const VOCAB_PROMPT = `This is a photo of a textbook vocabulary page. Extract EVERY row.

Pages are usually a table with these columns: row number | a phrase in which the KEY word is printed in bold | part of speech | English definition followed by the Korean meaning inside ≪ ≫ | (sometimes) a synonym.

For each row return:
- no: the row number printed at the left, as a number (null if the page has none)
- word: the KEY word — the bold part of the phrase — NOT the whole phrase. "disgusting smell" with "disgusting" in bold → "disgusting". Keep a bold multi-word expression whole ("end up", "pros and cons"). If nothing is bold, use the whole phrase.
- definition: the English definition only, without the ≪ ≫ part and without the part-of-speech letter
- korean: the Korean meaning from inside ≪ ≫, without the ≪ ≫ marks ("" if there is none)

Ignore the synonym column, page headers ("Vocabulary"), page numbers, fingers, and anything outside the table. Do not skip rows and do not invent rows. If the page uses a different layout (a plain word/meaning list), still return word, a short English definition (write one if the page gives none) and the Korean meaning (translate if absent).

Return ONLY a JSON array, no other text:
[{"no":1,"word":"habitat","definition":"the natural home of an organism","korean":"서식지"}]`;

interface VocabRow { no: number | null; word: string; definition: string; korean: string }

// Pulls rows out of a model reply. Tries the whole array first; if the reply was
// cut off (no closing bracket) or has stray text, falls back to recovering each
// COMPLETE {...} object so rows that were finished are kept instead of lost.
function parseVocabRows(raw: string): VocabRow[] {
  let arr: unknown[] = [];
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try { const v = JSON.parse(raw.slice(start, end + 1)); if (Array.isArray(v)) arr = v; } catch { /* salvage below */ }
  }
  if (arr.length === 0) {
    for (const m of raw.matchAll(/\{[^{}]*\}/g)) {
      try { arr.push(JSON.parse(m[0])); } catch { /* skip a mangled object */ }
    }
  }
  const rows: VocabRow[] = [];
  for (const o of arr) {
    const r = o as Record<string, unknown>;
    const word = typeof r?.word === 'string' ? r.word.trim() : '';
    if (!word) continue;
    rows.push({
      no: typeof r.no === 'number' && Number.isFinite(r.no) ? r.no : null,
      word,
      definition: typeof r.definition === 'string' ? r.definition.trim() : '',
      korean: typeof r.korean === 'string' ? r.korean.trim() : '',
    });
  }
  return rows;
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
      mode: 'text' | 'vocab' | 'detect_orientation' | 'translate' | 'translate_sentences' | 'translate_one' | 'define_word';
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
        model: MODEL,
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
          model: MODEL,
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
        model: MODEL,
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

      // No prefill (not every model accepts a prefilled turn), so find the object
      // in the reply instead of assuming the reply IS the object.
      const raw = response.content[0].type === 'text' ? response.content[0].text : '{}';
      let obj: Record<string, unknown> = {};
      try {
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        obj = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : '{}');
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
        model: MODEL,
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

    // ── Photo orientation ────────────────────────────────────────────────────
    // A phone photo of a page often arrives on its side or upside down, and text
    // read sideways is read worse. Before the real OCR the client sends FOUR small
    // copies of the photo — turned 0, 90, 180 and 270 degrees clockwise, in that
    // order — and this picks the one whose text reads upright. The client then
    // turns the full photo by that many degrees.
    //
    // Why four images instead of asking about one: asked "how many degrees must
    // this be turned" the model answered 0 for every photo; asked "which side is
    // the top on" it caught upside-down but called every sideways page upright.
    // Judging one rotated page against an imagined upright one is the weak spot;
    // choosing the upright one out of four is easy. An unclear answer is 0
    // ("leave it").
    if (mode === 'detect_orientation') {
      const imgs = body.images ?? [];
      if (imgs.length !== 4) {
        return new Response(JSON.stringify({ rotation: 0 }), {
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      const content: Array<Record<string, unknown>> = [];
      imgs.forEach((img, i) => {
        content.push({ type: 'text', text: `Image ${i + 1}:` });
        content.push({ type: 'image', source: { type: 'base64', media_type: img.type, data: img.data } });
      });
      content.push({ type: 'text', text: 'These four images are the SAME photo of a printed page, each turned a different way. In exactly one of them the text reads upright: horizontal lines, read left-to-right and top-to-bottom, letters not rotated or upside down. In the others the text is sideways or upside down.\n\nWhich image has the upright text? Answer with exactly one digit: 1, 2, 3 or 4.' });
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 16,
        // deno-lint-ignore no-explicit-any
        messages: [{ role: 'user', content: content as any }],
      });
      const raw = resp.content[0].type === 'text' ? resp.content[0].text : '';
      const pick = parseInt(raw.match(/[1-4]/)?.[0] ?? '1', 10);
      const rotation = [0, 90, 180, 270][pick - 1];
      return new Response(JSON.stringify({ rotation, pick }), {
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

    // ── Vocabulary photos ────────────────────────────────────────────────────
    // One request PER photo, in parallel: each reply stays small (one page of
    // rows), one bad photo can't sink the others, and the results are merged.
    if (mode === 'vocab') {
      const readOne = async (img: typeof imageContent[number]): Promise<VocabRow[]> => {
        // A stronger model than the rest of this function uses: the Korean in
        // ≪ ≫ is small print, and the cheap model misread uncommon words
        // (어둑한→어두운, 흩뿌리다→을뿌리다, 거친→거칠은). A wrong meaning gets
        // memorised, so accuracy matters more than cost here — and this runs a
        // few times a week, not per sentence. No prefill: the parser below
        // already copes with stray prose around the array.
        const resp = await client.messages.create({
          model: MODEL,
          max_tokens: 4096,
          messages: [
            { role: 'user', content: [img, { type: 'text', text: VOCAB_PROMPT }] },
          ],
        });
        const text = resp.content[0].type === 'text' ? resp.content[0].text : '';
        return parseVocabRows(text);
      };

      const settled = await Promise.allSettled(imageContent.map(readOne));
      const pages = settled.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []));
      const failures = settled.filter(r => r.status === 'rejected').length;

      // Merge in photo order, drop a word that appears twice (the same page
      // uploaded twice), and if every row carries its printed number put them in
      // that order — photos are often selected out of order (rows 16-30 first).
      const seen = new Set<string>();
      let merged = pages.flat().filter(r => {
        const k = r.word.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (merged.length > 0 && merged.every(r => r.no !== null)) {
        merged = [...merged].sort((a, b) => (a.no as number) - (b.no as number));
      }

      if (merged.length === 0) {
        return new Response(JSON.stringify({
          error: failures > 0
            ? '사진을 읽는 중 오류가 났어요. 잠시 후 다시 시도해 주세요.'
            : '사진에서 단어를 찾지 못했어요. 글자가 또렷하게 나온 사진으로 다시 시도해 주세요.',
        }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      // Same contract as before — a JSON array in `result` — minus the helper `no`.
      const items = merged.map(({ word, definition, korean }) => ({ word, definition, korean }));
      return new Response(JSON.stringify({ result: JSON.stringify(items), skippedPhotos: failures }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const prompt = `Extract all English text from these images in reading order.\nIf multiple images, combine in order.\nReturn only the extracted English text with no commentary.`;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
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
