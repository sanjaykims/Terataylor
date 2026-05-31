// Real speech→text alignment.
// Transcribes audio with Whisper (word-level timestamps) and aligns
// detected words to chapter sentences by matching word CONTENT, not
// just position fractions. This handles variable pacing, intros, and
// Whisper omissions correctly.

export type AlignPhase = 'loading-model' | 'decoding' | 'transcribing' | 'aligning' | 'done';
export interface AlignProgress {
  phase: AlignPhase;
  pct?: number;   // 0..100 for model download
}

interface WordChunk { text: string; timestamp: [number, number | null] }

// Decode any audio file to the 16 kHz mono Float32 that Whisper expects.
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

// Transcribe the audio and return each detected word with its start timestamp.
async function transcribeWords(
  audioUrl: string,
  onProgress: (p: AlignProgress) => void,
): Promise<Array<{ text: string; time: number }>> {
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

  return (out.chunks ?? [])
    .filter(c => typeof c.timestamp?.[0] === 'number' && !isNaN(c.timestamp[0]))
    .map(c => ({ text: c.text.trim(), time: c.timestamp![0] as number }));
}

// Normalize a word for comparison: lowercase, alphanumeric only.
const normWord = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Content-based sentence alignment.
 *
 * Flattens all text sentences into a word list, then does a greedy
 * forward scan through the audio words: for each audio word, check if
 * it matches any of the next LOOKAHEAD text words. When a match is
 * found, record that audio timestamp for those text words and advance
 * the text pointer. Any sentence's start time = the audio time of its
 * first matched word.
 *
 * This is far more accurate than fraction-based mapping because it
 * anchors on actual spoken word content, handling variable pacing,
 * audio intros, and Whisper omissions naturally.
 */
function contentAlignSentences(
  sentences: string[],
  audioWords: Array<{ text: string; time: number }>,
): number[] {
  if (sentences.length === 0 || audioWords.length === 0) return [];

  // Flatten all text words, preserving which sentence each belongs to.
  const textFlat: Array<{ si: number; norm: string }> = [];
  for (let si = 0; si < sentences.length; si++) {
    for (const w of sentences[si].split(/\s+/).filter(Boolean)) {
      const n = normWord(w);
      if (n) textFlat.push({ si, norm: n });
    }
  }

  const audioNorm = audioWords.map(w => normWord(w.text));

  // wordTimes[i] = audio timestamp matched to textFlat[i], or -1 if unmatched.
  const wordTimes: number[] = new Array(textFlat.length).fill(-1);
  let ti = 0; // next unmatched text word position
  const LOOKAHEAD = 12; // tolerate up to 12 skipped text words (Whisper omissions)

  for (let ai = 0; ai < audioNorm.length && ti < textFlat.length; ai++) {
    const aw = audioNorm[ai];
    if (aw.length < 2) continue; // skip single-char tokens / punctuation

    for (let k = 0; k < LOOKAHEAD && ti + k < textFlat.length; k++) {
      if (textFlat[ti + k].norm === aw) {
        // Assign this audio timestamp to every skipped text word as well.
        for (let g = 0; g <= k; g++) {
          if (wordTimes[ti + g] < 0) wordTimes[ti + g] = audioWords[ai].time;
        }
        ti = ti + k + 1;
        break;
      }
    }
  }

  // Build sentence start times: first matched word of each sentence.
  const sentenceStarts: number[] = new Array(sentences.length).fill(-1);
  for (let i = 0; i < textFlat.length; i++) {
    const { si } = textFlat[i];
    if (sentenceStarts[si] < 0 && wordTimes[i] >= 0) {
      sentenceStarts[si] = wordTimes[i];
    }
  }

  // Fill any unmatched sentences by propagating the last known timestamp.
  let last = audioWords[0]?.time ?? 0;
  for (let i = 0; i < sentenceStarts.length; i++) {
    if (sentenceStarts[i] >= 0) {
      last = sentenceStarts[i];
    } else {
      sentenceStarts[i] = last;
    }
  }

  // Enforce monotonic non-decreasing.
  for (let i = 1; i < sentenceStarts.length; i++) {
    if (sentenceStarts[i] < sentenceStarts[i - 1]) sentenceStarts[i] = sentenceStarts[i - 1];
  }

  return sentenceStarts;
}

export async function alignChapterAudio(
  audioUrl: string,
  sentences: string[],
  onProgress: (p: AlignProgress) => void,
): Promise<number[]> {
  const audioWords = await transcribeWords(audioUrl, onProgress);
  onProgress({ phase: 'aligning' });

  if (audioWords.length === 0 || sentences.length === 0) return [];

  const result = contentAlignSentences(sentences, audioWords);
  onProgress({ phase: 'done' });
  return result;
}
