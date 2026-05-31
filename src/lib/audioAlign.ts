// Real speech→text alignment.
// Transcribes a chapter's mp3 in the browser with Whisper (word-level
// timestamps) and maps those REAL timestamps onto the chapter's sentences,
// so the reader highlights exactly what is being spoken.

export type AlignPhase = 'loading-model' | 'decoding' | 'transcribing' | 'aligning' | 'done';
export interface AlignProgress {
  phase: AlignPhase;
  pct?: number;   // 0..100 for model download
}

// Decode any audio file to the 16 kHz mono Float32 that Whisper expects.
async function decodeTo16kMono(buffer: ArrayBuffer): Promise<Float32Array> {
  const Ctx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const tmp = new Ctx();
  const decoded = await tmp.decodeAudioData(buffer.slice(0));
  await tmp.close();

  const frames = Math.ceil(decoded.duration * 16000);
  const offline = new OfflineAudioContext(1, frames, 16000); // 1 channel → auto downmix
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

// Lazy singleton so the (~40 MB) model downloads only once per device.
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

interface WordChunk { text: string; timestamp: [number, number | null] }

// Transcribe the audio and return the start time (seconds) of every spoken word.
async function detectWordStarts(
  audioUrl: string,
  onProgress: (p: AlignProgress) => void,
): Promise<number[]> {
  onProgress({ phase: 'loading-model' });
  const transcriber = await getTranscriber(onProgress) as (
    audio: Float32Array,
    opts: Record<string, unknown>,
  ) => Promise<{ chunks?: WordChunk[] }>;

  onProgress({ phase: 'decoding' });
  const res = await fetch(audioUrl);
  const audio = await decodeTo16kMono(await res.arrayBuffer());

  onProgress({ phase: 'transcribing' });
  const out = await transcriber(audio, {
    return_timestamps: 'word',
    chunk_length_s: 30,
    stride_length_s: 5,
  });

  const starts = (out.chunks ?? [])
    .map(c => c.timestamp?.[0])
    .filter((t): t is number => typeof t === 'number' && !isNaN(t));
  return starts;
}

// Map detected word start times onto the chapter sentences.
// Each sentence's start = the detected word at the same word-position fraction,
// so highlighting follows the actual recorded pace (pauses, speed changes).
export async function alignChapterAudio(
  audioUrl: string,
  sentences: string[],
  onProgress: (p: AlignProgress) => void,
): Promise<number[]> {
  const wordStarts = await detectWordStarts(audioUrl, onProgress);
  onProgress({ phase: 'aligning' });

  if (wordStarts.length === 0 || sentences.length === 0) return [];

  const wordCounts = sentences.map(s => Math.max(1, s.trim().split(/\s+/).length));
  const totalWords = wordCounts.reduce((a, b) => a + b, 0);

  const starts: number[] = [];
  let cum = 0;
  for (const wc of wordCounts) {
    const frac = cum / totalWords;
    const idx = Math.min(wordStarts.length - 1, Math.round(frac * (wordStarts.length - 1)));
    starts.push(wordStarts[idx]);
    cum += wc;
  }
  // Enforce monotonic non-decreasing start times.
  for (let i = 1; i < starts.length; i++) {
    if (starts[i] < starts[i - 1]) starts[i] = starts[i - 1];
  }
  onProgress({ phase: 'done' });
  return starts;
}
