import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Anthropic from 'npm:@anthropic-ai/sdk';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Audio alignment helpers ────────────────────────────────────────────────────

const normWord = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function dedupeMonotone(pts: { pos: number; time: number }[]) {
  const out: typeof pts = [];
  for (const p of pts) {
    if (!out.length || p.pos > out[out.length - 1].pos) out.push(p);
  }
  return out;
}

function lerp(pts: { pos: number; time: number }[], x: number): number {
  if (!pts.length) return 0;
  if (x <= pts[0].pos) return pts[0].time;
  if (x >= pts[pts.length - 1].pos) return pts[pts.length - 1].time;
  let lo = 0, hi = pts.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].pos <= x) lo = mid; else hi = mid;
  }
  const range = pts[hi].pos - pts[lo].pos;
  return pts[lo].time + (range > 0 ? (x - pts[lo].pos) / range : 0) * (pts[hi].time - pts[lo].time);
}

function enforceMonotone(arr: number[]) {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < arr[i - 1]) arr[i] = arr[i - 1];
  }
}

function alignWordsToSentences(
  words: { word: string; start: number; end: number }[],
  sentences: string[],
): number[] {
  const audioFlat = words
    .map(w => ({ norm: normWord(w.word), time: w.start }))
    .filter(w => w.norm.length > 0);

  if (!audioFlat.length || !sentences.length) return sentences.map(() => 0);

  const textFlat: { si: number; norm: string }[] = [];
  for (let si = 0; si < sentences.length; si++) {
    for (const w of sentences[si].split(/\s+/).filter(Boolean)) {
      const n = normWord(w);
      if (n) textFlat.push({ si, norm: n });
    }
  }
  if (!textFlat.length) return sentences.map(() => 0);

  const WINDOW = 35;
  const JUMP   = WINDOW * 2;
  const anchors: { pos: number; time: number }[] = [];
  let textPos = 0;

  for (let ai = 0; ai < audioFlat.length; ai++) {
    const aw = audioFlat[ai];
    if (aw.norm.length < 5) continue;

    const expectedTi = Math.round((ai / audioFlat.length) * textFlat.length);
    const searchStart = (expectedTi - textPos > JUMP)
      ? Math.max(textPos, expectedTi - Math.floor(WINDOW / 4))
      : textPos;
    const searchEnd = Math.min(
      textFlat.length - 1,
      Math.max(textPos + WINDOW, expectedTi + Math.floor(WINDOW / 2)),
    );

    for (let ti = searchStart; ti <= searchEnd; ti++) {
      if (textFlat[ti].norm === aw.norm) {
        anchors.push({ pos: ti, time: aw.time });
        textPos = ti + 1;
        break;
      }
    }
  }

  if (!anchors.length) {
    const totalTime = audioFlat[audioFlat.length - 1].time;
    return sentences.map((_, si) => (si / sentences.length) * totalTime);
  }

  const pts = dedupeMonotone([
    { pos: 0,               time: anchors[0].time },
    ...anchors,
    { pos: textFlat.length, time: audioFlat[audioFlat.length - 1].time },
  ]);

  const starts = new Array(sentences.length).fill(-1) as number[];
  for (let ti = 0; ti < textFlat.length; ti++) {
    const si = textFlat[ti].si;
    if (starts[si] < 0) starts[si] = lerp(pts, ti);
  }
  let last = audioFlat[0].time;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] < 0) starts[i] = last; else last = starts[i];
  }
  enforceMonotone(starts);

  const REFINE_S = 2.0;
  for (let si = 0; si < sentences.length; si++) {
    const target = starts[si];
    const fw = sentences[si].split(/\s+/).slice(0, 5).map(normWord).filter(w => w.length >= 3);
    if (!fw.length) continue;

    const lo = audioFlat.findIndex(w => w.time >= target - REFINE_S);
    if (lo < 0) continue;

    for (let ai = lo; ai < audioFlat.length && audioFlat[ai].time <= target + REFINE_S; ai++) {
      if (audioFlat[ai].norm !== fw[0]) continue;
      let matched = 1;
      for (let k = 1; k < fw.length && ai + k < audioFlat.length; k++) {
        if (audioFlat[ai + k].norm === fw[k]) matched++;
      }
      if (matched >= Math.min(2, fw.length)) {
        starts[si] = audioFlat[ai].time;
        break;
      }
    }
  }

  enforceMonotone(starts);
  return starts;
}

// ── Translation alignment helper ──────────────────────────────────────────────
// When the model returns more items than requested (it split one English sentence
// into two Korean sentences), merge the shortest adjacent pair repeatedly until
// the count matches. This preserves correct alignment for all other sentences.
function mergeToLength(arr: string[], targetLen: number): string[] {
  const out = arr.map(s => (s ?? '').trim());
  while (out.length > targetLen && out.length > 1) {
    let bestIdx = 0;
    let bestLen = (out[0]?.length ?? 0) + (out[1]?.length ?? 0);
    for (let k = 1; k < out.length - 1; k++) {
      const l = (out[k]?.length ?? 0) + (out[k + 1]?.length ?? 0);
      if (l < bestLen) { bestLen = l; bestIdx = k; }
    }
    out[bestIdx] = ((out[bestIdx] ?? '') + ' ' + (out[bestIdx + 1] ?? '')).trim();
    out.splice(bestIdx + 1, 1);
  }
  while (out.length < targetLen) out.push('');
  return out;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json() as {
      images?: { data: string; type: string }[];
      text?: string;
      sentences?: string[];
      word?: string;
      audioUrl?: string;
      mode: 'text' | 'vocab' | 'translate' | 'translate_sentences' | 'define_word' | 'align_audio';
    };
    const { mode } = body;

    // ── Server-side audio alignment via Deepgram ──────────────────────────
    if (mode === 'align_audio') {
      const audioUrl = body.audioUrl ?? '';
      const sentences = body.sentences ?? [];
      if (!audioUrl || !sentences.length) {
        return new Response(JSON.stringify({ starts: [] }), {
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      const dgRes = await fetch(
        'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true',
        {
          method: 'POST',
          headers: {
            'Authorization': `Token ${Deno.env.get('DEEPGRAM_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: audioUrl }),
        },
      );

      if (!dgRes.ok) {
        const errText = await dgRes.text();
        throw new Error(`Deepgram error: ${errText}`);
      }

      const dgData = await dgRes.json() as {
        results: {
          channels: [{
            alternatives: [{
              words: { word: string; start: number; end: number }[];
            }];
          }];
        };
      };

      const dgWords = dgData?.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];
      if (!dgWords.length) {
        return new Response(JSON.stringify({ starts: [] }), {
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      const starts = alignWordsToSentences(dgWords, sentences);
      return new Response(JSON.stringify({ starts }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
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

    // ── Sentence-aligned translate mode ───────────────────────────────────
    if (mode === 'translate_sentences') {
      const sentences = body.sentences ?? [];
      if (sentences.length === 0) {
        return new Response(JSON.stringify({ result: [] }), {
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      const numbered = sentences.map((s, i) => `${i + 1}. ${s}`).join('\n');

      // Prefill "[" forces the model directly into JSON array output,
      // eliminating prose preamble and reducing the chance of stray splits.
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        system: `You are a professional literary translator (English → Korean) working on a children's novel. Translate numbered English sentences into Korean.

CRITICAL ALIGNMENT RULE: Each numbered English line must produce EXACTLY ONE Korean string — never split one English sentence into two Korean entries. This applies even when a sentence contains both dialogue and an attribution tag (e.g. "Hello," said Jane. must remain a single Korean string). Violating this rule breaks the entire reader alignment.`,
        messages: [
          {
            role: 'user',
            content: `Translate the following ${sentences.length} English sentences into Korean.\nReturn ONLY a JSON array of exactly ${sentences.length} strings — one translation per input sentence, in the same order.\n\n${numbered}`,
          },
          // Prefill forces the response to start as a JSON array
          { role: 'assistant', content: '[' },
        ],
      });

      // The model continues from "[", so prepend it back before parsing
      const continuation = response.content[0].type === 'text' ? response.content[0].text : ']';
      const raw = '[' + continuation;
      let arr: string[] = [];
      try {
        const end = raw.lastIndexOf(']');
        arr = JSON.parse(end >= 0 ? raw.slice(0, end + 1) : raw + ']');
      } catch { arr = []; }

      // Enforce exact length: merge extra items (split sentences) rather than
      // truncating, which would shift all subsequent translations.
      arr = mergeToLength(arr, sentences.length);

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
