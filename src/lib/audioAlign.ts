// Audio-text alignment — v4 two-pass algorithm
//
// Pass 1 (coarse): Whisper word-level timestamps + anchor-word matching
//   - Word-level timestamps are produced by Whisper's attention mechanism
//     and are individually accurate (no interpolation needed).
//   - Falls back to segment-level timestamps with linear interpolation when
//     the transformers.js version does not support return_timestamps:'word'.
//   - Words ≥ 5 chars are used as anchors. A dual search window (greedy
//     position + fraction-based expected position) prevents the scan from
//     getting permanently stuck behind the real audio position.
//   - Piecewise linear interpolation between matched anchors fills in all
//     sentence positions.
//
// Pass 2 (fine): sentence-start word matching near the interpolated time
//   - For each sentence, search a ±2 s window around the Pass-1 estimate
//     for the sentence's first words. If a 2-of-3 word run is found, use
//     its timestamp as the exact sentence start.
//
// Result: typically within half a sentence of the correct position even
// when Whisper misses or mispronounces several words.

export type AlignPhase = 'loading-model' | 'decoding' | 'transcribing' | 'aligning' | 'done';
export interface AlignProgress { phase: AlignPhase; pct?: number; }

interface Chunk { text: string; timestamp: [number, number | null] }

async function decodeTo16kMono(buffer: ArrayBuffer): Promise<Float32Array> {
  const Ctx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const tmp = new Ctx();
  const decoded = await tmp.decodeAudioData(buffer.slice(0));
  await tmp.close();
  const frames = Math.ceil(decoded.duration * 16000);
  const offline = new OfflineAudioContext(1, frames, 16000);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  return (await offline.startRendering()).getChannelData(0);
}

let transcriberPromise: Promise<unknown> | null = null;
async function getTranscriber(onProgress: (p: AlignProgress) => void) {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');
      return pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
        progress_callback: (e: { status?: string; progress?: number }) => {
          if (e?.status === 'progress' && typeof e.progress === 'number') {
            onProgress({ phase: 'loading-model', pct: Math.round(e.progress) });
          }
        },
      });
    })();
  }
  return transcriberPromise;
}

const normWord = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Build a flat word list from Whisper output.
// First attempts word-level timestamps (return_timestamps: 'word') which are
// individually accurate. Falls back to segment-level with linear interpolation
// when the installed transformers.js does not support word-level output.
async function buildAudioWordList(
  audioUrl: string,
  onProgress: (p: AlignProgress) => void,
): Promise<Array<{ norm: string; time: number }>> {
  onProgress({ phase: 'loading-model' });
  const transcriber = await getTranscriber(onProgress) as (
    audio: Float32Array,
    opts: Record<string, unknown>,
  ) => Promise<{ chunks?: Chunk[] }>;

  onProgress({ phase: 'decoding' });
  const res = await fetch(audioUrl);
  const audio = await decodeTo16kMono(await res.arrayBuffer());

  onProgress({ phase: 'transcribing' });

  // ── Attempt 1: word-level timestamps ────────────────────────────────────────
  let out = await transcriber(audio, {
    return_timestamps: 'word',
    chunk_length_s: 30,
    stride_length_s: 5,
  });

  const chunks = (out.chunks ?? []).filter(c => typeof c.timestamp?.[0] === 'number');

  // Detect whether we got true word-level output. Word-level chunks each contain
  // a single word, so avgWordsPerChunk will be close to 1. Segment-level chunks
  // contain many words, so the average is much higher.
  let isWordLevel = false;
  if (chunks.length > 0) {
    const totalWords = chunks.reduce(
      (sum, c) => sum + c.text.trim().split(/\s+/).filter(Boolean).length,
      0,
    );
    const avgWordsPerChunk = totalWords / chunks.length;
    isWordLevel = avgWordsPerChunk < 1.5;
  }

  // ── Attempt 2: segment-level fallback ───────────────────────────────────────
  if (!isWordLevel) {
    out = await transcriber(audio, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    });
  }

  const segs = (out.chunks ?? []).filter(c => typeof c.timestamp?.[0] === 'number');
  const result: Array<{ norm: string; time: number }> = [];

  if (isWordLevel) {
    // Word-level: each chunk is a single word — use its timestamp directly.
    for (const chunk of segs) {
      const norm = normWord(chunk.text);
      if (!norm) continue;
      result.push({ norm, time: chunk.timestamp![0] as number });
    }
  } else {
    // Segment-level fallback: linearly interpolate word times within each segment.
    for (let si = 0; si < segs.length; si++) {
      const words = segs[si].text.trim().split(/\s+/).map(normWord).filter(Boolean);
      if (!words.length) continue;
      const start = segs[si].timestamp![0] as number;
      // Use the next segment's start as this segment's end (more accurate than Whisper's end)
      const end = (si + 1 < segs.length && typeof segs[si + 1].timestamp?.[0] === 'number')
        ? segs[si + 1].timestamp![0] as number
        : start + words.length * 0.35; // ~0.35 s/word fallback
      for (let k = 0; k < words.length; k++) {
        result.push({ norm: words[k], time: start + (k / words.length) * (end - start) });
      }
    }
  }

  return result;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

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

// ── Browser-side alignment from Deepgram word timestamps ──────────────────────
// Three-phase algorithm:
//
// Phase 1 – VERIFIED PAIR ANCHORS
//   For every significant audio word (≥4 chars), find it in the text inside a
//   sliding window. Before committing the anchor, verify that the NEXT significant
//   text word also appears within 6 audio positions (gap tolerance handles inserted
//   short words like articles). Two-word verification eliminates almost all false
//   matches while still finding enough anchors even in imperfect transcripts.
//   Falls back to single-word anchors (≥5 chars) if too few verified pairs.
//
// Phase 2 – PIECEWISE LINEAR INTERPOLATION
//   Anchors become control points for lerp. Every sentence gets a unique time —
//   no duplicate timestamps (the bug caused by greedy/utterance approaches).
//   Content gaps (narrator deviates from text) are handled gracefully by spreading
//   time proportionally between surrounding anchors.
//
// Phase 3 – PER-SENTENCE REFINEMENT WITH GAP TOLERANCE
//   For each sentence, search ±3 s around the Phase-2 estimate for the sentence's
//   first 2+ significant words. Gap tolerance (up to 5 audio words between
//   matches) handles prepositions and minor wording differences between text and
//   audio. Requires 2 confirmed word matches before snapping.

export interface WordTimestamp { word: string; start: number; end: number }

export function alignFromWordTimestamps(
  words: WordTimestamp[],
  sentences: string[],
): number[] {
  const audioFlat = words
    .map(w => ({ norm: normWord(w.word), time: w.start }))
    .filter(w => w.norm.length > 0);

  if (!audioFlat.length || !sentences.length) return sentences.map(() => 0);

  // Flat word list from all sentences, tagged with sentence index
  const textFlat: { si: number; norm: string }[] = [];
  for (let si = 0; si < sentences.length; si++) {
    for (const w of sentences[si].split(/\s+/).filter(Boolean)) {
      const n = normWord(w);
      if (n) textFlat.push({ si, norm: n });
    }
  }
  if (!textFlat.length) return sentences.map(() => 0);

  const WINDOW = 70, JUMP = 120;
  let anchors: { pos: number; time: number }[] = [];

  // ── Phase 1A: verified pair anchors (audio word ≥4 chars + next sig text word) ──
  {
    let textPos = 0;
    for (let ai = 0; ai < audioFlat.length; ai++) {
      const aw = audioFlat[ai];
      if (aw.norm.length < 4) continue;

      const expTi = Math.round((ai / audioFlat.length) * textFlat.length);
      const ss = (expTi - textPos > JUMP) ? Math.max(textPos, expTi - 25) : textPos;
      const se = Math.min(textFlat.length - 1, Math.max(textPos + WINDOW, expTi + 35));

      for (let ti = ss; ti <= se; ti++) {
        if (textFlat[ti].norm !== aw.norm) continue;

        // Find the next significant text word after ti
        let nextNorm = '';
        for (let j = ti + 1; j < Math.min(textFlat.length, ti + 8); j++) {
          if (textFlat[j].norm.length >= 4) { nextNorm = textFlat[j].norm; break; }
        }

        // Verify: nextNorm must appear within next 6 audio positions
        let verified = !nextNorm; // if no next sig word, accept without verification
        if (nextNorm) {
          for (let g = 1; g <= 6 && ai + g < audioFlat.length; g++) {
            if (audioFlat[ai + g].norm === nextNorm) { verified = true; break; }
          }
        }

        if (verified) {
          anchors.push({ pos: ti, time: aw.time });
          textPos = ti + 1;
          break;
        }
      }
    }
  }

  // ── Phase 1B: fallback — single-word anchors (≥5 chars) ──────────────
  const MIN_ANCHORS = Math.max(6, Math.floor(sentences.length / 10));
  if (anchors.length < MIN_ANCHORS) {
    anchors = [];
    let textPos = 0;
    for (let ai = 0; ai < audioFlat.length; ai++) {
      const aw = audioFlat[ai];
      if (aw.norm.length < 5) continue;
      const expTi = Math.round((ai / audioFlat.length) * textFlat.length);
      const ss = (expTi - textPos > JUMP) ? Math.max(textPos, expTi - 25) : textPos;
      const se = Math.min(textFlat.length - 1, Math.max(textPos + WINDOW, expTi + 35));
      for (let ti = ss; ti <= se; ti++) {
        if (textFlat[ti].norm === aw.norm) {
          anchors.push({ pos: ti, time: aw.time });
          textPos = ti + 1;
          break;
        }
      }
    }
  }

  if (!anchors.length) {
    const totalTime = audioFlat[audioFlat.length - 1].time;
    return sentences.map((_, si) => (si / sentences.length) * totalTime);
  }

  // ── Phase 2: piecewise linear interpolation ────────────────────────────
  // Every sentence gets a unique interpolated time — no duplicate timestamps.
  const pts = dedupeMonotone([
    { pos: 0,               time: anchors[0].time },
    ...anchors,
    { pos: textFlat.length, time: audioFlat[audioFlat.length - 1].time },
  ]);

  const starts = new Array<number>(sentences.length).fill(-1);
  for (let ti = 0; ti < textFlat.length; ti++) {
    const si = textFlat[ti].si;
    if (starts[si] < 0) starts[si] = lerp(pts, ti);
  }
  let last = audioFlat[0].time;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] < 0) starts[i] = last; else last = starts[i];
  }
  enforceMonotone(starts);

  // ── Phase 3: per-sentence refinement with gap tolerance ──────────────
  // Search ±3 s around each Phase-2 estimate. Require 2+ significant words to
  // match (with up to 5-word gap between them) before snapping. This handles
  // articles/prepositions that appear between content words.
  const REFINE_S = 3.0;
  for (let si = 0; si < sentences.length; si++) {
    const target = starts[si];
    const fw = sentences[si]
      .split(/\s+/).slice(0, 8)
      .map(normWord).filter(w => w.length >= 4);
    if (fw.length < 2) continue; // need 2+ sig words to safely refine

    const lo = audioFlat.findIndex(w => w.time >= target - REFINE_S);
    if (lo < 0) continue;

    for (let ai = lo; ai < audioFlat.length && audioFlat[ai].time <= target + REFINE_S; ai++) {
      if (audioFlat[ai].norm !== fw[0]) continue;

      // Verify subsequent sig words with gap tolerance (up to 5 words apart)
      let matched = 1, cursor = ai;
      for (let k = 1; k < fw.length; k++) {
        let found = false;
        for (let g = 1; g <= 5 && cursor + g < audioFlat.length; g++) {
          if (audioFlat[cursor + g].norm === fw[k]) { matched++; cursor += g; found = true; break; }
        }
        if (!found) break;
      }

      if (matched >= 2) { starts[si] = audioFlat[ai].time; break; }
    }
  }

  enforceMonotone(starts);
  return starts;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function alignChapterAudio(
  audioUrl: string,
  sentences: string[],
  onProgress: (p: AlignProgress) => void,
): Promise<number[]> {
  const audioFlat = await buildAudioWordList(audioUrl, onProgress);
  onProgress({ phase: 'aligning' });
  if (!audioFlat.length || !sentences.length) return [];

  // Flat text word list with sentence indices
  const textFlat: { si: number; norm: string }[] = [];
  for (let si = 0; si < sentences.length; si++) {
    for (const w of sentences[si].split(/\s+/).filter(Boolean)) {
      const n = normWord(w);
      if (n) textFlat.push({ si, norm: n });
    }
  }
  if (!textFlat.length) return sentences.map(() => 0);

  // ── Pass 1: anchor matching ───────────────────────────────────────────────
  // For each audio word (length ≥ 4), search the text using a window that
  // combines the greedy forward position with the fraction-based expected
  // position. If the greedy scan has fallen far behind, jump the search start
  // forward so it stays close to the expected position.
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
    // Fallback: proportional time across audio duration
    const totalTime = audioFlat[audioFlat.length - 1].time;
    return sentences.map((_, si) => (si / sentences.length) * totalTime);
  }

  // Build piecewise linear interpolation control points
  const pts = dedupeMonotone([
    { pos: 0,               time: anchors[0].time },
    ...anchors,
    { pos: textFlat.length, time: audioFlat[audioFlat.length - 1].time },
  ]);

  // Map each sentence to the interpolated time of its first text word
  const starts = new Array(sentences.length).fill(-1);
  for (let ti = 0; ti < textFlat.length; ti++) {
    const si = textFlat[ti].si;
    if (starts[si] < 0) starts[si] = lerp(pts, ti);
  }
  let last = audioFlat[0].time;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] < 0) starts[i] = last; else last = starts[i];
  }
  enforceMonotone(starts);

  // ── Pass 2: sentence-start refinement ────────────────────────────────────
  // For each sentence, search a ±2 s window around the Pass-1 estimate for a
  // run of 2-of-3 first words. If found, snap the sentence start to that time.
  const REFINE_S = 2.0;

  for (let si = 0; si < sentences.length; si++) {
    const target = starts[si];
    const fw = sentences[si].split(/\s+/).slice(0, 3).map(normWord).filter(w => w.length >= 3);
    if (!fw.length) continue;

    const lo = audioFlat.findIndex(w => w.time >= target - REFINE_S);
    if (lo < 0) continue;

    for (let ai = lo; ai < audioFlat.length && audioFlat[ai].time <= target + REFINE_S; ai++) {
      if (audioFlat[ai].norm !== fw[0]) continue;
      // Check how many of the next words also match
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
  onProgress({ phase: 'done' });
  return starts;
}

function enforceMonotone(arr: number[]) {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < arr[i - 1]) arr[i] = arr[i - 1];
  }
}
