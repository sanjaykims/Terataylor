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

// ── Browser-side alignment from Deepgram output ───────────────────────────────
// Two strategies, tried in order:
//
// 1. alignFromUtterances (preferred): Deepgram returns sentence-level "utterances"
//    with accurate start/end times when utterances=true is passed. We match each
//    book sentence to the utterance with the highest significant-word overlap.
//    This is far more accurate than word-by-word alignment because we use
//    Deepgram's own sentence boundaries instead of trying to reconstruct them.
//
// 2. alignFromWordTimestamps (fallback): Forward-scanning sentence-by-sentence
//    search. For each book sentence we look for its first significant words
//    (length >= 4) in the next 150 Deepgram words, with gap tolerance so
//    articles/prepositions between content words don't break the match.

export interface WordTimestamp { word: string; start: number; end: number }
export interface UtteranceTimestamp { start: number; end: number; transcript: string }

// Normalised word list for overlap scoring.
function normWords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
}

// Fraction of sentence's significant words (len > 3) that appear in utterance.
function overlapScore(sentWords: string[], uttWords: string[]): number {
  const sig = sentWords.filter(w => w.length > 3);
  if (!sig.length) return 0;
  const uttSet = new Set(uttWords.filter(w => w.length > 3));
  return sig.filter(w => uttSet.has(w)).length / sig.length;
}

// Primary: match each book sentence to the Deepgram utterance with the best
// word overlap, then use that utterance's start time. Processes sentences in
// order so the search window only moves forward.
export function alignFromUtterances(
  utterances: UtteranceTimestamp[],
  sentences: string[],
): number[] {
  if (!utterances.length || !sentences.length) return sentences.map(() => 0);

  const uttWords = utterances.map(u => normWords(u.transcript));
  const starts: number[] = [];
  let uttPos = 0;

  for (let si = 0; si < sentences.length; si++) {
    const sentW = normWords(sentences[si]);
    const searchEnd = Math.min(utterances.length - 1, uttPos + 20);

    let bestIdx = uttPos;
    let bestScore = -1;
    for (let ui = uttPos; ui <= searchEnd; ui++) {
      const score = overlapScore(sentW, uttWords[ui]);
      if (score > bestScore) { bestScore = score; bestIdx = ui; }
    }

    starts.push(utterances[bestIdx].start);
    // Only advance the pointer when we're confident — prevents a bad match
    // from permanently skipping ahead and leaving later sentences unmatched.
    if (bestScore >= 0.3) uttPos = Math.min(bestIdx + 1, utterances.length - 1);
  }

  enforceMonotone(starts);
  return starts;
}

// Fallback: forward-scanning word-level alignment.
// Processes sentences in order. For each sentence we search up to 150 audio
// words ahead for the sentence's significant first words, with gap tolerance.
export function alignFromWordTimestamps(
  words: WordTimestamp[],
  sentences: string[],
): number[] {
  const audioFlat = words
    .map(w => ({ norm: normWord(w.word), time: w.start }))
    .filter(w => w.norm.length > 0);

  if (!audioFlat.length || !sentences.length) return sentences.map(() => 0);

  const starts: number[] = [];
  let audioPos = 0;
  const SEARCH_WINDOW = 150;

  for (let si = 0; si < sentences.length; si++) {
    // Significant words (length >= 4) from the first 8 words of this sentence.
    const sigWords = sentences[si]
      .split(/\s+/).slice(0, 8)
      .map(normWord).filter(w => w.length >= 4);

    if (!sigWords.length || audioPos >= audioFlat.length) {
      starts.push(starts.length > 0 ? starts[starts.length - 1] : 0);
      continue;
    }

    const fw = sigWords[0];
    const verifyWords = sigWords.slice(1, 4);   // up to 3 more to verify
    const minScore = Math.min(2, sigWords.length);
    const searchEnd = Math.min(audioFlat.length - 1, audioPos + SEARCH_WINDOW);

    let bestAi = -1;
    let bestScore = 0;

    for (let ai = audioPos; ai <= searchEnd; ai++) {
      if (audioFlat[ai].norm !== fw) continue;

      // Check how many verifyWords appear in the next 8 audio positions
      // (gap tolerance: short words between content words are ignored).
      let score = 1;
      let cursor = ai;
      for (const vw of verifyWords) {
        for (let k = cursor + 1; k <= cursor + 8 && k < audioFlat.length; k++) {
          if (audioFlat[k].norm === vw) { score++; cursor = k; break; }
        }
      }

      if (score > bestScore) { bestScore = score; bestAi = ai; }
      if (score >= minScore) break; // good enough — stop scanning
    }

    if (bestAi >= 0 && bestScore >= minScore) {
      starts.push(audioFlat[bestAi].time);
      audioPos = bestAi + 1;
    } else {
      // No confident match: hold position, use previous time.
      starts.push(starts.length > 0 ? starts[starts.length - 1] : audioFlat[audioPos].time);
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
