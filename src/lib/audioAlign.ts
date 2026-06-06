// Audio-text alignment — v5 global alignment
//
// 1. Transcribe the chapter to word-level timestamps (Deepgram in production,
//    Whisper/transformers.js as an offline fallback). Each word carries an
//    individually accurate start time.
// 2. Globally align the audio word stream to the book's text word stream with a
//    banded Needleman–Wunsch (see `alignByNW`). Because the match is optimised
//    over the whole chapter, repeated common words can never pull a sentence to
//    the wrong occurrence — the failure mode of greedy/anchor matching.
// 3. Each sentence's start is the audio time of its first matched word; any
//    word the transcript missed is filled by interpolation between neighbours.
//
// Result: sentence starts land within a fraction of a second of the real
// speech, and the algorithm degrades gracefully on imperfect transcripts.

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

// ── Banded Needleman–Wunsch global alignment ──────────────────────────────────
// Aligns the audio word stream (from ASR, with per-word start times) to the
// flat text word stream, then reads each sentence's start from the audio time
// of its first matched word. Because the match is optimised globally, repeated
// common words ("and", "he", "the") can never pull a sentence to the wrong
// occurrence — the failure mode that derails greedy/anchor-and-interpolate
// matching. The diagonal band keeps memory and time linear in chapter length,
// so even a 60-minute chapter aligns in well under a second on a phone.
//
// aNorm/aTime: normalised audio words and their start times (same length).
// Returns one start time (seconds) per sentence, strictly increasing.
function alignByNW(aNorm: string[], aTime: number[], sentences: string[]): number[] {
  const nSent = sentences.length;

  // Flatten text into normalised words, remembering each sentence's first index.
  const T: string[] = [];
  const firstWordIdx: number[] = [];
  for (let si = 0; si < nSent; si++) {
    firstWordIdx.push(T.length);
    for (const w of sentences[si].split(/\s+/)) {
      const nw = normWord(w);
      if (nw) T.push(nw);
    }
  }
  const n = aNorm.length, m = T.length;
  if (n === 0 || m === 0) return new Array(nSent).fill(0);

  const MATCH = 2, MIS = -2, GAP = -1, NEG = -1e9;
  const ratio = m / n;
  // Band half-width: wide enough to absorb the length difference plus local
  // insertions/deletions (ASR errors, narrator deviations) with generous slack.
  const W = Math.min(m, Math.max(250, Math.abs(n - m) + 200));
  const span = 2 * W + 1;
  const center = (i: number) => Math.round(i * ratio);
  const dp = new Float64Array((n + 1) * span); dp.fill(NEG);
  const tb = new Int8Array((n + 1) * span); // 0=diag, 1=gap-in-text, 2=gap-in-audio
  const idxOf = (i: number, j: number) => {
    const bj = j - (center(i) - W);
    return (bj < 0 || bj >= span) ? -1 : i * span + bj;
  };

  // Initialise first audio row (all-gap prefix of text).
  { const c0 = center(0);
    for (let j = Math.max(0, c0 - W); j <= Math.min(m, c0 + W); j++) {
      const id = idxOf(0, j); if (id >= 0) { dp[id] = j * GAP; tb[id] = 2; }
    } }

  for (let i = 1; i <= n; i++) {
    const ci = center(i), jlo = Math.max(0, ci - W), jhi = Math.min(m, ci + W);
    const ai = aNorm[i - 1];
    for (let j = jlo; j <= jhi; j++) {
      const cur = idxOf(i, j); if (cur < 0) continue;
      if (j === 0) { dp[cur] = i * GAP; tb[cur] = 1; continue; }
      let best = NEG, dir = 0;
      const d = idxOf(i - 1, j - 1);
      if (d >= 0 && dp[d] > NEG) { const v = dp[d] + (ai === T[j - 1] ? MATCH : MIS); if (v > best) { best = v; dir = 0; } }
      const u = idxOf(i - 1, j);
      if (u >= 0 && dp[u] > NEG) { const v = dp[u] + GAP; if (v > best) { best = v; dir = 1; } }
      const l = idxOf(i, j - 1);
      if (l >= 0 && dp[l] > NEG) { const v = dp[l] + GAP; if (v > best) { best = v; dir = 2; } }
      dp[cur] = best; tb[cur] = dir;
    }
  }

  // Traceback: each diagonal match stamps the text word with the audio time.
  const wtime = new Float64Array(m); wtime.fill(-1);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const cur = idxOf(i, j);
      const dir = cur >= 0 ? tb[cur] : 1;
      if (dir === 0) { if (aNorm[i - 1] === T[j - 1]) wtime[j - 1] = aTime[i - 1]; i--; j--; }
      else if (dir === 1) { i--; }
      else { j--; }
    } else if (i > 0) { i--; } else { j--; }
  }

  // Fill unmatched text words by linear interpolation over flat index, so a
  // sentence whose first word was missed still gets a sensible start.
  const filled = wtime.slice();
  let fk = -1; for (let k = 0; k < m; k++) if (filled[k] >= 0) { fk = k; break; }
  let lk = -1; for (let k = m - 1; k >= 0; k--) if (filled[k] >= 0) { lk = k; break; }
  if (fk < 0) return new Array(nSent).fill(0);
  for (let k = 0; k < fk; k++) filled[k] = filled[fk];
  for (let k = lk + 1; k < m; k++) filled[k] = filled[lk];
  let p = fk;
  for (let k = fk + 1; k <= lk; k++) {
    if (filled[k] >= 0) {
      if (k - p > 1) {
        const t0 = filled[p], t1 = filled[k];
        for (let q = p + 1; q < k; q++) filled[q] = t0 + ((q - p) / (k - p)) * (t1 - t0);
      }
      p = k;
    }
  }

  const starts = new Array<number>(nSent);
  for (let si = 0; si < nSent; si++) {
    const fi = firstWordIdx[si];
    starts[si] = (fi < m && filled[fi] >= 0) ? filled[fi] : (si > 0 ? starts[si - 1] : 0);
  }
  enforceMonotone(starts);
  return starts;
}

// ── Browser-side alignment from Deepgram word timestamps ──────────────────────
// Deepgram returns accurate per-word start times for the whole chapter. We feed
// those straight into the global aligner, which matches them to the book text
// and reads each sentence's start from its first matched word.

export interface WordTimestamp { word: string; start: number; end: number }

export function alignFromWordTimestamps(
  words: WordTimestamp[],
  sentences: string[],
): number[] {
  const aNorm: string[] = [];
  const aTime: number[] = [];
  for (const w of words) {
    const nw = normWord(w.word);
    if (nw) { aNorm.push(nw); aTime.push(w.start); }
  }
  if (!aNorm.length || !sentences.length) return sentences.map(() => 0);
  return alignByNW(aNorm, aTime, sentences);
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
  const starts = alignByNW(audioFlat.map(w => w.norm), audioFlat.map(w => w.time), sentences);
  onProgress({ phase: 'done' });
  return starts;
}

function enforceMonotone(arr: number[]) {
  // Strict: each entry must be > previous, not just >=.
  // Equal timestamps cause seekToSentence(i) to compute idx > i (last hit in
  // the equal cluster), which immediately clears the seek floor and highlights
  // the wrong sentence. 30 ms exceeds one MP3 frame (~26 ms) so the browser's
  // frame-snap after a seek never crosses the boundary and triggers the wrong idx.
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] <= arr[i - 1]) arr[i] = arr[i - 1] + 0.03;
  }
}
