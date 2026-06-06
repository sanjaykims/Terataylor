import { useState, useRef, useEffect, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { BOOKS, SCHEDULE, type BookId } from '../data/syllabus';
import { supabase } from '../lib/supabase';
import {
  hasBook, clearBook, loadChapterEn, loadChapterKo,
  saveChapterKo, saveBookChapters, getTranslatedChapters,
  saveChapterCount, loadChapterCount,
  saveChapterAudio, loadChapterAudio, deleteChapterAudio,
  saveChapterTimings, loadChapterTimings, deleteChapterTimings,
  loadChapterVocab,
} from '../lib/chapterStorage';
import type { VocabItem } from '../lib/types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// ── Chapter heading detection ─────────────────────────────────────────────────
// Matches lines like "One", "Two", ..., "Twenty-five", "Chapter One",
// "Chapter 1", or bare digits 1-30. Used to detect where chapters start.
const NUMBER_WORDS = [
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen',
  'eighteen','nineteen','twenty',
  'twenty-one','twenty-two','twenty-three','twenty-four','twenty-five',
  'twenty-six','twenty-seven','twenty-eight','twenty-nine','thirty',
];
const CHAPTER_HEADING = new RegExp(
  `^(chapter\\s+\\w+|${NUMBER_WORDS.join('|')}|\\d{1,2}|prologue|epilogue)$`,
  'i',
);

function splitIntoChapters(pages: string[]): string[] | null {
  const starts: number[] = [];

  for (let i = 0; i < pages.length; i++) {
    const pageText = pages[i].trim();
    const lines = pageText.split('\n').map(l => l.trim()).filter(Boolean);

    if (pageText.length < 80) {
      // Short page (e.g. a page that just says "One"): check each line individually
      // because stray page refs like "10/108" may have survived the number filter.
      if (lines.some(l => CHAPTER_HEADING.test(l))) starts.push(i);
      continue;
    }

    // Skip table-of-contents pages: 4+ chapter headings on one page
    const headingCount = lines.filter(l => CHAPTER_HEADING.test(l)).length;
    if (headingCount > 3) continue;
    // Search ALL lines — the heading may appear after front-matter text
    // (dedication, epigraph) on the same page
    if (lines.some(l => CHAPTER_HEADING.test(l))) {
      starts.push(i);
    }
  }

  if (starts.length < 2) return null;

  return starts.map((start, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1] : pages.length;
    return pages.slice(start, end).join('\n\n');
  });
}

// Lines that repeat on many pages are running headers/footers (title, author, chapter name).
function detectRunningHeaders(pages: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const page of pages) {
    const lines = page.split('\n').map(l => l.trim()).filter(Boolean);
    const candidates = new Set([...lines.slice(0, 2), ...lines.slice(-2)]);
    for (const line of candidates) {
      if (line.length > 0 && line.length < 60 && line.split(/\s+/).length <= 6) {
        counts.set(line, (counts.get(line) ?? 0) + 1);
      }
    }
  }
  const threshold = Math.max(3, pages.length * 0.15);
  const headers = new Set<string>();
  for (const [line, count] of counts) {
    if (count >= threshold) headers.add(line);
  }
  return headers;
}

// Strip URLs from within a line rather than deleting the whole line.
function stripUrls(line: string): string {
  return line.replace(/\s*https?:\/\/\S+/gi, '').trim();
}

function cleanPageText(text: string, runningHeaders: Set<string>): string {
  return text
    .split('\n')
    .map(l => stripUrls(l.trim()))
    .filter(l => l.length > 0)
    .filter(l => !/^\d{1,4}(\/\d{1,4})?$/.test(l))  // "9" or "10/108" page refs
    .filter(l => !runningHeaders.has(l))
    .join('\n');
}

// Remove known front-matter lines wherever they appear in a chapter.
const FRONT_MATTER_LINE = /^(table of contents|cover title|copyright|all rights reserved|dedication|published by|isbn|first published|first edition|printed in|also by|about the author|coda\b)/i;

// Applied after the chapter heading has been stripped. Skips the front matter
// paragraphs that appear just after the heading (TOC remnant, dedication,
// epigraph, book-title list) and keeps everything once story prose begins.
function cleanChapterText(text: string): string {
  const paras = text
    .split(/\n\n+/)
    .map(p => p.split('\n').map(l => stripUrls(l.trim())).filter(Boolean).join('\n'))
    .filter(Boolean);

  const result: string[] = [];
  let storyStarted = false;

  for (const p of paras) {
    const t = p.trim();
    if (FRONT_MATTER_LINE.test(t)) continue;  // always remove

    if (!storyStarted) {
      // Chapter heading line ("One", "Chapter One", etc.)
      if (CHAPTER_HEADING.test(t)) continue;
      // TOC: 2+ "Chapter N" numeric refs on one line
      if ((t.match(/\bchapter\s+\d+/gi) ?? []).length >= 2) continue;
      // Epigraph: last line of paragraph starts with an attribution dash
      const lastLine = t.split('\n').filter(Boolean).pop()?.trim() ?? '';
      if (/^[—–―]/.test(lastLine)) continue;
      // Dedication: "For/To Firstname Lastname …" — short, two proper nouns
      if (/^(for|to) [A-Z][a-z]+ [A-Z][a-z]+/.test(t) && t.split(/\s+/).length < 25) continue;
      const words = t.split(/\s+/).length;
      const hasSentence = /\w[.!?](\s|$)/.test(t);
      // Book-title run-on list (many words, no sentence punctuation)
      if (words > 8 && !hasSentence) continue;
      // Short title / author name line (≤8 words, no sentence, no comma)
      if (words <= 8 && !hasSentence && !/[,;:]/.test(t)) continue;

      storyStarted = true;
    }

    result.push(p);
  }

  return result.join('\n\n').trim();
}

// Strip everything up to and including the first chapter heading.
// Used on individual chapters (searches first 20 lines) and on the full
// book text in the fallback path (searches all lines).
function stripToFirstChapterHeading(text: string, maxLines = 20): string {
  const lines = text.split('\n');
  const limit = maxLines === Infinity ? lines.length : Math.min(maxLines, lines.length);
  for (let i = 0; i < limit; i++) {
    if (CHAPTER_HEADING.test(lines[i].trim())) {
      return lines.slice(i + 1).join('\n').trimStart();
    }
  }
  return text;
}

// ── PDF helpers ───────────────────────────────────────────────────────────────
async function extractAllPages(
  file: File,
  onProgress: (done: number, total: number) => void,
): Promise<string[]> {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const c = await page.getTextContent();
    const text = c.items
      .map((x: unknown) => {
        const it = x as { str: string; hasEOL?: boolean };
        return it.str + (it.hasEOL ? '\n' : ' ');
      })
      .join('');
    pages.push(text.trim());
    onProgress(i, pdf.numPages);
  }
  return pages;
}

// Canonical sentence splitter — used BOTH when translating and when
// rendering, so English sentence count always matches the stored Korean
// sentence count and the paired reader stays aligned 1:1.
function splitToSentences(text: string): string[] {
  // Rejoin lines wrapped mid-sentence (PDF inserts \n at every visual line end),
  // then split only on real sentence boundaries (.!? + Capital/Korean).
  const normalized = text.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim();
  if (!normalized) return [];
  return normalized
    .split(/(?<=[.!?…]['"”’]?)\s+(?=[A-Z"“‘'가-힣])/)
    .map(s => s.trim())
    .filter(Boolean);
}

// When the edge function splits one English sentence into two Korean sentences,
// the returned array is longer than the batch. Detect attribution fragments
// (short sentences ending in Korean speech verbs like 말했다/물었다) and merge
// them with their preceding sentence. Fall back to shortest-pair for other cases.
function alignKoreanToEnglish(raw: string[], targetLen: number): string[] {
  const out = raw.map(s => (s ?? '').replace(/\s*\n\s*/g, ' ').trim());
  // Attribution verbs that indicate a sentence fragment belonging to the prior sentence
  const ATTR_VERB = /(?:말했다|물었다|대답했다|속삭였다|외쳤다|소리쳤다|중얼거렸다|덧붙였다)[.。]?["']?\s*$/;
  while (out.length > targetLen && out.length > 1) {
    // Prefer merging attribution fragments (index > 0, short, ends with speech verb)
    let attrIdx = -1;
    for (let k = 1; k < out.length; k++) {
      if (out[k].length <= 20 && ATTR_VERB.test(out[k])) {
        if (attrIdx === -1 || out[k].length < out[attrIdx].length) attrIdx = k;
      }
    }
    if (attrIdx !== -1) {
      out[attrIdx - 1] = out[attrIdx - 1] + ' ' + out[attrIdx];
      out.splice(attrIdx, 1);
    } else {
      // Fallback: merge globally shortest adjacent pair
      let pairLen = out[0].length + out[1].length, pairIdx = 0;
      for (let k = 1; k < out.length - 1; k++) {
        const l = out[k].length + out[k + 1].length;
        if (l < pairLen) { pairLen = l; pairIdx = k; }
      }
      out[pairIdx] = out[pairIdx] + (out[pairIdx] && out[pairIdx + 1] ? ' ' : '') + out[pairIdx + 1];
      out.splice(pairIdx + 1, 1);
    }
  }
  while (out.length < targetLen) out.push('');
  return out;
}

async function translateSentences(
  enText: string,
  onChunk: (done: number, total: number) => void,
): Promise<string> {
  const sentences = splitToSentences(enText);
  if (sentences.length === 0) return '';

  // Batch sentences to stay within token limits while keeping alignment.
  const BATCH = 30;
  const batches: string[][] = [];
  for (let i = 0; i < sentences.length; i += BATCH) {
    batches.push(sentences.slice(i, i + BATCH));
  }

  const ko: string[] = [];
  for (let i = 0; i < batches.length; i++) {
    onChunk(i, batches.length);
    const { data, error } = await supabase.functions.invoke('ocr-extract', {
      body: { sentences: batches[i], mode: 'translate_sentences' },
    });
    if (error) throw new Error(String((error as { message?: string }).message ?? error));
    const arr = (data as { result: string[] }).result ?? [];
    ko.push(...alignKoreanToEnglish(arr, batches[i].length));
  }
  onChunk(batches.length, batches.length);

  // Store Korean sentences one-per-line, index-aligned to splitToSentences(enText).
  return ko.join('\n');
}

// ── Audio helpers ─────────────────────────────────────────────────────────────
// Build a mapping: book chapter number → lesson-chapter index (1-based).
// Only works for books whose SCHEDULE entries have "Ch. N~M" page strings.
function buildBookChapterToLessonMap(bid: BookId): Map<number, number> {
  const map = new Map<number, number>();
  SCHEDULE.filter(l => l.book === bid && l.pdfPages).forEach((lesson, idx) => {
    const m = lesson.pages.match(/Ch\.\s*(\d+)\s*[~–]\s*(\d+)/i);
    if (m) {
      for (let ch = parseInt(m[1]); ch <= parseInt(m[2]); ch++) map.set(ch, idx + 1);
    }
  });
  return map;
}

// ── MP3 frame-level merge (mirrors the server-side merge-audio function) ──────
// Concatenates MP3 files at the byte/frame level: strip each file's ID3 tags,
// align to the first audio frame, and splice the raw frames together. This is
// O(bytes) with tiny memory (compressed audio stays compressed) — unlike
// decode→OfflineAudioContext→WAV, which buffers ~200 MB of PCM per chapter and
// can hang the tab on long files.

// ID3v2 tag at the start: 'ID3' + 4 syncsafe size bytes → bytes to skip.
function skipId3v2(b: Uint8Array): number {
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) { // "ID3"
    const size =
      ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) |
      ((b[8] & 0x7f) << 7)  |  (b[9] & 0x7f);
    return 10 + size;
  }
  return 0;
}

// ID3v1 trailer (last 128 bytes starting with 'TAG') → strip from inner files.
function trimId3v1(b: Uint8Array): number {
  if (b.length >= 128 &&
      b[b.length - 128] === 0x54 && // T
      b[b.length - 127] === 0x41 && // A
      b[b.length - 126] === 0x47) { // G
    return b.length - 128;
  }
  return b.length;
}

// Scan forward to the first valid MPEG audio frame sync (11 set bits + sane
// layer/bitrate/samplerate fields), so we never splice mid-header.
function findMp3Sync(b: Uint8Array, start: number): number {
  for (let i = start; i < b.length - 3; i++) {
    if (b[i] !== 0xFF) continue;
    const h1 = b[i + 1];
    if ((h1 & 0xE0) !== 0xE0) continue;
    const layer      = (h1 >> 1) & 0x3;
    const bitrateIdx = (b[i + 2] >> 4) & 0xF;
    const srIdx      = (b[i + 2] >> 2) & 0x3;
    if (layer === 0 || bitrateIdx === 0 || bitrateIdx === 0xF || srIdx === 3) continue;
    return i;
  }
  return start;
}

// Parse the MPEG audio frame at offset `i`. Returns its geometry, or null when
// the bytes there are not a valid Layer III frame header.
function parseMp3Frame(b: Uint8Array, i: number) {
  if (i + 4 > b.length) return null;
  if (b[i] !== 0xFF || (b[i + 1] & 0xE0) !== 0xE0) return null;
  const verBits   = (b[i + 1] >> 3) & 0x3;   // 0=MPEG2.5, 2=MPEG2, 3=MPEG1
  const layerBits = (b[i + 1] >> 1) & 0x3;   // 1=Layer III
  if (layerBits !== 1) return null;
  const brIdx    = (b[i + 2] >> 4) & 0xF;
  const srIdx    = (b[i + 2] >> 2) & 0x3;
  const padding  = (b[i + 2] >> 1) & 0x1;
  const chanMode = (b[i + 3] >> 6) & 0x3;     // 3=mono
  if (brIdx === 0 || brIdx === 0xF || srIdx === 3) return null;
  const BR_V1  = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0];
  const BR_V2  = [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0];
  const SR_V1  = [44100,48000,32000,0];
  const SR_V2  = [22050,24000,16000,0];
  const SR_V25 = [11025,12000,8000,0];
  let bitrate = 0, sampleRate = 0, samples = 0, sideInfo = 0;
  if (verBits === 3)      { bitrate = BR_V1[brIdx]; sampleRate = SR_V1[srIdx];  samples = 1152; sideInfo = chanMode === 3 ? 17 : 32; }
  else if (verBits === 2) { bitrate = BR_V2[brIdx]; sampleRate = SR_V2[srIdx];  samples = 576;  sideInfo = chanMode === 3 ? 9  : 17; }
  else if (verBits === 0) { bitrate = BR_V2[brIdx]; sampleRate = SR_V25[srIdx]; samples = 576;  sideInfo = chanMode === 3 ? 9  : 17; }
  else return null;
  if (!bitrate || !sampleRate) return null;
  const frameLen = Math.floor((samples / 8 * bitrate * 1000) / sampleRate) + padding;
  if (frameLen < 4) return null;
  return { frameLen, samples, sampleRate, sideInfo, verBits, srIdx, chanMode };
}

// True when the frame at `start` carries a Xing/Info VBR header rather than audio.
function isXingFrame(b: Uint8Array, start: number, sideInfo: number): boolean {
  const k = start + 4 + sideInfo;
  if (k + 4 > b.length) return false;
  return (b[k] === 0x58 && b[k + 1] === 0x69 && b[k + 2] === 0x6e && b[k + 3] === 0x67) || // "Xing"
         (b[k] === 0x49 && b[k + 1] === 0x6e && b[k + 2] === 0x66 && b[k + 3] === 0x6f);   // "Info"
}

// Build a single Xing-header frame describing the *merged* stream, so the player
// reports the right duration and seeks accurately. A stale per-segment header
// (carried over from the first input file) is the classic cause of "playback is
// fine but tapping to seek jumps to the wrong place / desyncs".
function buildXingFrame(
  tmpl: { verBits: number; srIdx: number; chanMode: number },
  audioFrames: number, frameOffsets: number[], frameTimes: number[],
  totalDuration: number, bodyLength: number,
): Uint8Array {
  const brIdx      = tmpl.verBits === 3 ? 9 : 12;        // 128 kbps in both tables
  const samples    = tmpl.verBits === 3 ? 1152 : 576;
  const sampleRate = (tmpl.verBits === 3 ? [44100,48000,32000,0]
                    : tmpl.verBits === 2 ? [22050,24000,16000,0]
                    : [11025,12000,8000,0])[tmpl.srIdx];
  const sideInfo = tmpl.verBits === 3 ? (tmpl.chanMode === 3 ? 17 : 32)
                                      : (tmpl.chanMode === 3 ? 9  : 17);
  const frameLen = Math.floor((samples / 8 * 128 * 1000) / sampleRate);
  const f = new Uint8Array(new ArrayBuffer(frameLen)); // zero-filled (silent) frame
  f[0] = 0xFF;
  f[1] = 0xE0 | (tmpl.verBits << 3) | (1 << 1) | 1; // sync + version + Layer III + no CRC
  f[2] = (brIdx << 4) | (tmpl.srIdx << 2);          // bitrate + samplerate, no padding
  f[3] = (tmpl.chanMode << 6);
  const x = 4 + sideInfo;
  f[x] = 0x58; f[x + 1] = 0x69; f[x + 2] = 0x6e; f[x + 3] = 0x67; // "Xing"
  const totalBytes = frameLen + bodyLength;
  const w32 = (o: number, v: number) => { f[o] = (v >>> 24) & 0xff; f[o + 1] = (v >>> 16) & 0xff; f[o + 2] = (v >>> 8) & 0xff; f[o + 3] = v & 0xff; };
  w32(x + 4, 0x0007);       // flags: frames | bytes | TOC
  w32(x + 8, audioFrames);  // total audio frames (excludes this header frame)
  w32(x + 12, totalBytes);  // total stream bytes
  const tocOff = x + 16;
  for (let k = 0; k < 100; k++) {
    const target = (k / 100) * totalDuration;
    let lo = 0, hi = frameTimes.length - 1, idx = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (frameTimes[mid] <= target) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
    const fileByte = frameLen + frameOffsets[idx];
    let v = Math.floor(256 * fileByte / totalBytes);
    if (v < 0) v = 0; if (v > 255) v = 255;
    f[tocOff + k] = v;
  }
  return f;
}

async function mergeMp3Files(files: File[]): Promise<Blob> {
  const parts: Uint8Array[] = [];
  for (let idx = 0; idx < files.length; idx++) {
    const bytes = new Uint8Array(await files[idx].arrayBuffer());
    let start = skipId3v2(bytes);
    start = findMp3Sync(bytes, start);
    // Drop a leading Xing/Info VBR header frame: it describes only this one file
    // and would otherwise mislead the player about the whole merged stream.
    const f = parseMp3Frame(bytes, start);
    if (f && isXingFrame(bytes, start, f.sideInfo)) start += f.frameLen;
    // Strip trailing ID3v1 from every file except the last so the player
    // doesn't stop early at an embedded tag mid-stream.
    const end = idx < files.length - 1 ? trimId3v1(bytes) : bytes.length;
    parts.push(bytes.subarray(start, end));
  }

  // Concatenate the raw audio frames into a single body buffer.
  const bodyLength = parts.reduce((n, p) => n + p.length, 0);
  const body = new Uint8Array(new ArrayBuffer(bodyLength));
  let o = 0;
  for (const p of parts) { body.set(p, o); o += p.length; }

  // Walk the body to measure frame count / timing, then prepend a correct Xing
  // header so duration and seeking are accurate for the merged file.
  const offsets: number[] = [];
  const times: number[] = [];
  let duration = 0, i = 0;
  let tmpl: { verBits: number; srIdx: number; chanMode: number } | null = null;
  while (i + 4 <= body.length) {
    const fr = parseMp3Frame(body, i);
    if (!fr) { i++; continue; }
    if (!tmpl) tmpl = { verBits: fr.verBits, srIdx: fr.srIdx, chanMode: fr.chanMode };
    offsets.push(i);
    times.push(duration);
    duration += fr.samples / fr.sampleRate;
    i += fr.frameLen;
  }
  if (!tmpl || offsets.length === 0) {
    return new Blob([body as BlobPart], { type: 'audio/mpeg' }); // unparseable — plain concat
  }
  const header = buildXingFrame(tmpl, offsets.length, offsets, times, duration, bodyLength);
  return new Blob([header as BlobPart, body as BlobPart], { type: 'audio/mpeg' });
}

// ── Component ─────────────────────────────────────────────────────────────────
type InitState = 'loading' | 'no-book' | 'has-book';

export default function BookReader({ bookId, onLessonVocabLoad }: { bookId: BookId; onLessonVocabLoad?: (vocab: VocabItem[], chapter: number) => void }) {
  const bk = BOOKS[bookId];

  // Compute the current/upcoming lesson chapter BEFORE useState so it can be
  // used as the initial value. bookId changes cause remount via key={v1Book}.
  const initialLessonChapter = (() => {
    const bookLessons = SCHEDULE.filter(l => l.book === bookId && l.pdfPages);
    if (bookLessons.length === 0) return 1;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const future = bookLessons.filter(l => new Date(l.date) > now);
    const target = future[0] ?? bookLessons.at(-1)!;
    return bookLessons.indexOf(target) + 1;
  })();

  const [initState,       setInitState]       = useState<InitState>('loading');
  const [totalChapters,   setTotalChapters]   = useState(0);
  const [selectedChapter, setSelectedChapter] = useState(initialLessonChapter);
  const [translatedChaps, setTranslatedChaps] = useState<Set<number>>(new Set());

  const [enText,        setEnText]        = useState<string | null>(null);
  const [koText,        setKoText]        = useState<string | null>(null);
  const [chapterLoading,setChapterLoading]= useState(false);

  const [extracting,   setExtracting]   = useState(false);
  const [progress,     setProgress]     = useState({ done: 0, total: 0 });
  const [uploadError,  setUploadError]  = useState('');
  const [detectedNote, setDetectedNote] = useState('');

  const [translating,  setTranslating]  = useState(false);
  const [txProgress,   setTxProgress]   = useState({ done: 0, total: 0 });
  const [txError,      setTxError]      = useState('');

  const [confirmClear, setConfirmClear] = useState(false);
  const [mobileView,   setMobileView]   = useState<'en' | 'ko'>('en');
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Chapter audio + real-time sentence highlight ──────────────────────────
  const [audioUrl,      setAudioUrl]      = useState<string | null>(null);
  const [audioUploading,setAudioUploading]= useState(false);
  const [activeIdx,     setActiveIdx]     = useState(-1);
  const [activeWordIdx, setActiveWordIdx] = useState(-1);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [isPlaying,     setIsPlaying]     = useState(false);
  const [playbackRate,  setPlaybackRate]  = useState(1);
  const [timings,       setTimings]       = useState<number[] | null>(null);
  const [analyzing,     setAnalyzing]     = useState(false);
  const [analyzeMsg,    setAnalyzeMsg]    = useState('');
  const [audioUploadMsg,setAudioUploadMsg]= useState('');
  const [uploadProgress,setUploadProgress]= useState({ done: 0, total: 0 });
  const isSeekingRef  = useRef(false); // true while a programmatic seek is in flight
  const seekTargetRef = useRef(-1);   // position a tap sought to; -1 once the audio lands there
  const seekFloorRef  = useRef(-1);   // min allowed sentence idx after a tap-seek; -1 when inactive
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const debugLogsRef = useRef<string[]>([]);
  const dlog = (msg: string) => {
    console.log(msg);
    const next = [...debugLogsRef.current.slice(-49), msg];
    debugLogsRef.current = next;
    setDebugLogs([...next]);
  };
  const [nextChapHasAudio, setNextChapHasAudio] = useState(false);
  const [merging,       setMerging]       = useState(false);
  const [mergeMsg,      setMergeMsg]      = useState('');
  const audioRef    = useRef<HTMLAudioElement>(null);
  const audioFileRef = useRef<HTMLInputElement>(null);
  const rowRefs       = useRef<(HTMLDivElement | null)[]>([]);
  const mobileRowRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  // Incremented on every loadChapter call; background re-translation checks this
  // to avoid updating stale chapter after user navigates away.
  const loadSeqRef = useRef(0);

  // Maps book chapter numbers (e.g. 7) → lesson chapter index (e.g. 2).
  // Empty map for books without "Ch. N~M" page strings (Coraline).
  const bookChapterToLessonMap = useMemo(() => buildBookChapterToLessonMap(bookId), [bookId]);

  // null when the book has no pdfPages-based schedule (e.g. Coraline).
  const currentLessonChapter = SCHEDULE.some(l => l.book === bookId && l.pdfPages)
    ? initialLessonChapter
    : null;
  const lessonChapterRange = currentLessonChapter
    ? [currentLessonChapter, currentLessonChapter] as [number, number]
    : null;

  // ── On mount ─────────────────────────────────────────────────────────────
  useEffect(() => {
    setInitState('loading');
    hasBook(bookId)
      .then(async has => {
        if (!has) { setInitState('no-book'); return; }
        const count = await loadChapterCount(bookId).catch(() => 0);
        setTotalChapters(count);
        setInitState('has-book');
        const translated = await getTranslatedChapters(bookId).catch(() => [] as number[]);
        setTranslatedChaps(new Set(translated));
        await loadChapter(bookId, initialLessonChapter);
      })
      .catch(() => setInitState('no-book'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  const loadChapter = async (bid: BookId, chapter: number) => {
    setChapterLoading(true);
    setEnText(null);
    setKoText(null);
    setAudioUrl(null);
    setActiveIdx(-1);
    setActiveWordIdx(-1);
    setAudioDuration(0);
    setTimings(null);
    setAnalyzeMsg('');
    setMergeMsg('');
    setNextChapHasAudio(false);
    isSeekingRef.current  = false;
    seekTargetRef.current = -1;
    seekFloorRef.current  = -1;
    const [en, ko, audio, times, nextAudio, vocab] = await Promise.all([
      loadChapterEn(bid, chapter).catch(() => null),
      loadChapterKo(bid, chapter).catch(() => null),
      loadChapterAudio(bid, chapter).catch(() => null),
      loadChapterTimings(bid, chapter).catch(() => null),
      loadChapterAudio(bid, chapter + 1).catch(() => null),
      loadChapterVocab(bid, chapter).catch(() => null),
    ]);
    setEnText(en);
    // Self-heal only on UNAMBIGUOUS corruption signals so we never overwrite a
    // correctly-aligned translation:
    //   • line count ≠ English sentence count  → not stored one-per-sentence
    //   • trailing empty-line padding (a blank line) → legacy "aligned" artifact
    // Correctly-aligned data (N lines, no blanks, N == enCount) is left untouched.
    // A short line ending in 말했다/물었다 is NOT a corruption signal — a one-line
    // "「…」 said X." is perfectly valid and must not trigger a re-translation.
    const finalKo = ko;
    if (en && ko) {
      const koRaw = ko.split('\n');
      const koLines = koRaw.map((s: string) => s.trim()).filter(Boolean);
      const enCount = splitToSentences(en).length;
      const hasPadding = koRaw.length > koLines.length + 1;
      if ((koLines.length !== enCount || hasPadding) && koLines.length > 0 && enCount > 0) {
        const seq = ++loadSeqRef.current;
        translateSentences(en, () => {}).then(newKo => {
          if (loadSeqRef.current !== seq) return;
          saveChapterKo(bid, chapter, newKo).catch(() => {});
          setKoText(newKo);
        }).catch(() => {});
      }
    }
    setKoText(finalKo);
    setAudioUrl(audio);
    setTimings(times);
    setNextChapHasAudio(!!nextAudio);
    if (vocab?.length && onLessonVocabLoad) onLessonVocabLoad(vocab as VocabItem[], chapter);
    setChapterLoading(false);
  };

  const selectChapter = async (chapter: number) => {
    setSelectedChapter(chapter);
    setTxError('');
    setMobileView('en');
    await loadChapter(bookId, chapter);
  };

  // ── PDF upload & chapter splitting ────────────────────────────────────────
  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('PDF 파일만 지원합니다.');
      return;
    }
    setUploadError('');
    setDetectedNote('');
    setExtracting(true);
    setProgress({ done: 0, total: 0 });

    try {
      const pages = await extractAllPages(file, (done, total) => setProgress({ done, total }));

      // Remove page numbers and running headers (title / author lines on every page)
      const runningHeaders = detectRunningHeaders(pages);
      const cleanedPages = pages.map(p => cleanPageText(p, runningHeaders));

      let chapterTexts: string[];
      let note: string;

      // Prefer explicit PDF page ranges from the syllabus (one entry per lesson)
      const lessonsWithPages = SCHEDULE.filter(l => l.book === bookId && l.pdfPages);
      if (lessonsWithPages.length > 0) {
        chapterTexts = lessonsWithPages.map(lesson => {
          const [startPage, endPage] = lesson.pdfPages!;
          // cleanedPages is 0-indexed; PDF pages are 1-indexed
          const lessonPages = cleanedPages.slice(startPage - 1, endPage);
          return cleanChapterText(lessonPages.join('\n\n'));
        });
        note = `${chapterTexts.length}개 수업 분량 추출됨`;
      } else {
        // Fallback: auto-detect chapter headings
        const detected = splitIntoChapters(cleanedPages);
        if (detected && detected.length >= 2) {
          chapterTexts = detected.map(t => cleanChapterText(stripToFirstChapterHeading(t, 20)));
          note = `${detected.length}개 챕터 감지됨`;
        } else {
          chapterTexts = [cleanChapterText(cleanedPages.join('\n\n'))];
          note = '챕터를 자동 감지하지 못해 전체를 1개로 저장했어요.';
        }
      }

      const chapters = chapterTexts.map((text, i) => ({ chapter: i + 1, text }));
      await saveBookChapters(bookId, chapters);
      await saveChapterCount(bookId, chapters.length);

      setTotalChapters(chapters.length);
      setDetectedNote(note);
      setExtracting(false);
      setInitState('has-book');
      setSelectedChapter(1);
      setTranslatedChaps(new Set());
      await loadChapter(bookId, 1);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '추출 실패');
      setExtracting(false);
    }
  };

  // ── Translation ───────────────────────────────────────────────────────────
  const handleTranslate = async () => {
    if (!enText) return;
    setTranslating(true);
    setTxError('');
    setTxProgress({ done: 0, total: 0 });
    try {
      const ko = await translateSentences(enText, (done, total) => setTxProgress({ done, total }));
      await saveChapterKo(bookId, selectedChapter, ko);
      setKoText(ko);
      setTranslatedChaps(prev => new Set([...prev, selectedChapter]));
    } catch (e) {
      setTxError(e instanceof Error ? e.message : '번역 실패');
    } finally {
      setTranslating(false);
    }
  };

  const handleClearBook = async () => {
    setConfirmClear(false);
    setInitState('loading');
    await clearBook(bookId).catch(() => {});
    setInitState('no-book');
    setEnText(null);
    setKoText(null);
    setAudioUrl(null);
    setTotalChapters(0);
    setTranslatedChaps(new Set());
    setDetectedNote('');
  };

  // ── Chapter audio handlers ────────────────────────────────────────────────
  const handleChapterAudioUpload = async (files: File[]) => {
    if (files.length === 0) return;
    setAudioUploading(true);
    setUploadError('');
    setAudioUploadMsg('');
    setUploadProgress({ done: 0, total: files.length });

    const uploadedChapters: number[] = [];
    const errors: string[] = [];

    // Group files by their target LESSON chapter.
    // Filenames use book chapter numbers (ch4, ch7…); map them via the schedule.
    type Entry = { file: File; bookCh: number };
    const groups = new Map<number, Entry[]>();
    for (const file of files) {
      const m = file.name.match(/(?:ch(?:apter)?|lesson|l)\s*0*(\d{1,2})/i)
              ?? file.name.match(/\b0*(\d{1,2})\b/);
      const rawCh = m ? parseInt(m[1]) : null;
      const mapped = rawCh !== null ? bookChapterToLessonMap.get(rawCh) : undefined;
      const lessonCh = mapped !== undefined
        ? mapped
        : (rawCh !== null && rawCh >= 1 && rawCh <= totalChapters ? rawCh : selectedChapter);
      if (!groups.has(lessonCh)) groups.set(lessonCh, []);
      groups.get(lessonCh)!.push({ file, bookCh: rawCh ?? 0 });
    }

    let done = 0;
    for (const [lessonCh, entries] of groups) {
      // Sort by book chapter number so merged audio plays ch4→ch5→…→ch8
      entries.sort((a, b) => a.bookCh - b.bookCh);
      setUploadProgress({ done, total: files.length });

      let uploadFile: File;
      if (entries.length === 1) {
        uploadFile = entries[0].file;
      } else {
        const labels = entries.map(e => `Ch.${e.bookCh}`).join('+');
        setAudioUploadMsg(`🔀 ${labels} 합치는 중...`);
        try {
          const merged = await mergeMp3Files(entries.map(e => e.file));
          uploadFile = new File([merged], `ch${lessonCh}.mp3`, { type: 'audio/mpeg' });
        } catch (e) {
          errors.push(`Ch.${lessonCh} 병합 실패: ${e instanceof Error ? e.message : '오류'}`);
          done += entries.length;
          setUploadProgress({ done, total: files.length });
          continue;
        }
      }

      try {
        const url = await saveChapterAudio(bookId, lessonCh, uploadFile);
        await deleteChapterTimings(bookId, lessonCh).catch(() => {});
        uploadedChapters.push(lessonCh);
        if (lessonCh === selectedChapter) {
          setTimings(null);
          setAudioUrl(`${url}?t=${Date.now()}`);
          setActiveIdx(-1);
        }
      } catch (e) {
        errors.push(`Ch.${String(lessonCh).padStart(2,'0')}: ${e instanceof Error ? e.message : '업로드 실패'}`);
      }
      done += entries.length;
      setUploadProgress({ done, total: files.length });
    }

    setAudioUploading(false);
    if (audioFileRef.current) audioFileRef.current.value = '';

    if (errors.length > 0) setUploadError(errors.join(' | '));
    if (uploadedChapters.length > 0) {
      const chList = [...new Set(uploadedChapters)].sort((a, b) => a - b)
        .map(n => `Ch.${String(n).padStart(2, '0')}`).join(', ');
      setAudioUploadMsg(`✓ ${chList} 오디오 업로드 완료`);
    }
  };

  const handleDeleteAudio = async () => {
    await deleteChapterAudio(bookId, selectedChapter).catch(() => {});
    await deleteChapterTimings(bookId, selectedChapter).catch(() => {});
    setAudioUrl(null);
    setActiveIdx(-1);
    setAudioDuration(0);
    setTimings(null);
  };

  // Merge current chapter's audio with the next chapter's audio into one seamless file.
  const handleMergeAudio = async () => {
    setMerging(true);
    setMergeMsg('병합 중… Supabase에서 파일을 처리하고 있어요');
    try {
      const { data, error } = await supabase.functions.invoke('merge-audio', {
        body: {
          bookId,
          chapters: [selectedChapter, selectedChapter + 1],
          outputChapter: selectedChapter,
          trimSeconds: 0,
        },
      });
      if (error) throw new Error(error.message);
      const result = data as { success: boolean; publicUrl: string; totalMB: number };
      if (!result.success) throw new Error('병합 실패');
      // Reload current chapter audio with new merged file
      const freshUrl = `${result.publicUrl}?t=${Date.now()}`;
      setAudioUrl(freshUrl);
      setTimings(null);
      setActiveIdx(-1);
      setAudioDuration(0);
      setNextChapHasAudio(false);
      setMergeMsg(`✓ 병합 완료! (${result.totalMB} MB) 이제 하나의 파일로 재생돼요. 음성 분석을 다시 실행해 주세요.`);
    } catch (e) {
      setMergeMsg(`오류: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
    }
    setMerging(false);
  };

  // Browser-side audio alignment via Deepgram (URL-based, no file upload).
  // Deepgram fetches the audio directly — no edge function, no timeout.
  const handleAnalyzeAudio = async () => {
    if (!audioUrl) return;
    const sentences = enText ? splitToSentences(enText) : [];
    if (sentences.length === 0) return;
    setAnalyzing(true);
    setAnalyzeMsg('음성 분석 중… (30~90초)');
    try {
      const cleanUrl = audioUrl.split('?')[0];
      const dgRes = await fetch(
        'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true',
        {
          method: 'POST',
          headers: {
            'Authorization': `Token ${import.meta.env.VITE_DEEPGRAM_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: cleanUrl }),
        },
      );
      if (!dgRes.ok) throw new Error(`Deepgram: ${await dgRes.text()}`);
      const dgData = await dgRes.json() as {
        results: { channels: [{ alternatives: [{ words: import('../lib/audioAlign').WordTimestamp[] }] }] };
      };
      const words = dgData.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];
      if (!words.length) throw new Error('음성을 인식하지 못했어요. 다시 시도해 주세요.');

      const { alignFromWordTimestamps } = await import('../lib/audioAlign');
      const times = alignFromWordTimestamps(words, sentences);
      await saveChapterTimings(bookId, selectedChapter, times);
      setTimings(times);
      setAnalyzeMsg('✓ 음성 분석 완료 — 실제 발화에 맞춰 하이라이트돼요');
    } catch (e) {
      setAnalyzeMsg(e instanceof Error ? `분석 실패: ${e.message}` : '분석 실패');
    } finally {
      setAnalyzing(false);
    }
  };

  // English sentences (canonical split) paired with stored Korean sentences.
  // Korean is stored one-per-line, already index-aligned to splitToSentences(enText).
  const enRows  = enText ? splitToSentences(enText) : [];
  const koRows  = koText
    ? (koText.includes('\n') && !koText.includes('\n\n')
        ? koText.split('\n').map(s => s.trim())          // new aligned format
        : splitToSentences(koText))                      // legacy paragraph format
    : [];
  const maxRows = Math.max(enRows.length, koRows.length);

  // Start time (seconds) of each sentence. Prefer REAL per-sentence times from
  // speech alignment; fall back to a word-count estimate until analysis is run.
  // Memoized on the underlying state values (not derived arrays) so the array
  // reference stays stable across renders that don't change timing data.
  const sentenceStarts = useMemo(() => {
    const rows = enText ? splitToSentences(enText) : [];
    let raw: number[];
    if (timings && timings.length > 0) {
      if (timings.length === rows.length) {
        raw = timings;
      } else if (Math.abs(timings.length - rows.length) <= 5) {
        // Small mismatch: pad or trim rather than falling back to inaccurate estimate
        if (timings.length > rows.length) {
          raw = timings.slice(0, rows.length);
        } else {
          raw = [...timings];
          const avgGap = timings.length > 1 ? (timings[timings.length - 1] - timings[0]) / (timings.length - 1) : 3;
          for (let k = timings.length; k < rows.length; k++) {
            raw.push(raw[raw.length - 1] + avgGap);
          }
        }
      } else {
        raw = [];
      }
    } else {
      raw = [];
    }

    if (raw.length === 0) {
      if (!audioDuration || rows.length === 0) return [];
      const weights = rows.map(s => Math.max(1, s.split(/\s+/).length));
      const total = weights.reduce((a, b) => a + b, 0);
      raw = [];
      let acc = 0;
      for (const w of weights) { raw.push((acc / total) * audioDuration); acc += w; }
    }

    // Enforce strict monotonicity. A 30 ms minimum gap exceeds one MP3 frame (~26 ms)
    // so the browser's frame-snap after a seek never crosses the boundary.
    const strict = raw === timings ? [...raw] : raw; // don't mutate the stored array
    for (let i = 1; i < strict.length; i++) {
      if (strict[i] <= strict[i - 1]) strict[i] = strict[i - 1] + 0.03;
    }
    return strict;
  }, [timings, enText, audioDuration]);

  // ── Sentence + word sync via timeupdate ──────────────────────────────────
  // Map the audio position to the active sentence. Tap-to-seek uses the SAME
  // sentenceStarts array that drives natural playback, so seeking to a sentence
  // and playing into it land on the identical mapping — no special cases needed
  // beyond (a) ignoring stale pre-seek timeupdates and (b) absorbing the one-
  // cycle MP3 frame-snap that can read ~26 ms before the target.
  const syncHighlight = () => {
    const t = audioRef.current?.currentTime ?? 0;
    if (sentenceStarts.length === 0) return;

    // (a) Right after a tap-to-seek the browser may still emit a timeupdate
    // carrying the PRE-seek position. Ignore those until the audio actually
    // lands near the requested sentence, then resume normal tracking.
    if (seekTargetRef.current >= 0) {
      if (Math.abs(t - seekTargetRef.current) > 0.5) return;
      seekTargetRef.current = -1;
    }

    let idx = 0;
    for (let i = 0; i < sentenceStarts.length; i++) {
      if (t >= sentenceStarts[i]) idx = i; else break;
    }

    // After a tap-seek the browser may land slightly before the tapped sentence
    // (TOC rounding). Don't flip the highlight backward until the audio genuinely
    // plays past the floor; clear once the audio crosses it.
    if (seekFloorRef.current >= 0) {
      if (idx < seekFloorRef.current) {
        idx = seekFloorRef.current;
      } else {
        seekFloorRef.current = -1;
      }
    }

    // (b) Backward-blip: an MP3 frame-snap can land just before the target for
    // a single cycle, making idx = activeIdx-1. Hold while within 0.2 s below.
    if (idx === activeIdx - 1 && activeIdx > 0 && t >= sentenceStarts[activeIdx] - 0.2) return;

    if (idx !== activeIdx) dlog('[SYNC] '+activeIdx+'→'+idx+' t='+t.toFixed(3));
    setActiveIdx(idx);

    // Word-level karaoke within the active sentence.
    const sentStart = sentenceStarts[idx];
    const sentEnd   = idx + 1 < sentenceStarts.length
      ? sentenceStarts[idx + 1]
      : (audioDuration || t + 5);
    const words    = (enRows[idx] ?? '').split(/\s+/).filter(Boolean);
    const progress = Math.max(0, Math.min(1, (t - sentStart) / Math.max(0.1, sentEnd - sentStart)));
    setActiveWordIdx(Math.min(Math.floor(progress * words.length), words.length - 1));
  };

  const handleAudioTimeUpdate = () => {
    const t = audioRef.current?.currentTime ?? 0;
    setAudioCurrentTime(t);
    if (isSeekingRef.current) return;
    syncHighlight();
  };

  const handleSeeking = () => { isSeekingRef.current = true; };
  const handleSeeked  = () => { isSeekingRef.current = false; };

  const seekToSentence = (i: number) => {
    const audio = audioRef.current;
    if (!audio || i < 0 || i >= sentenceStarts.length) return;
    const target = sentenceStarts[i];

    // Ignore stale pre-seek timeupdates until the audio lands at `target`.
    seekTargetRef.current = target;
    seekFloorRef.current  = i;   // highlight must not go below the tapped sentence
    isSeekingRef.current  = true;
    setActiveIdx(i);
    setActiveWordIdx(0);
    debugLogsRef.current = [];
    setDebugLogs([]);
    dlog('[TAP] i='+i+' tgt='+target.toFixed(3));
    try {
      audio.currentTime = target;
      if (audio.paused) audio.play().catch(() => {});
    } catch {
      seekTargetRef.current = -1;
    }
    // Safety net: clear the in-flight flag even if the browser omits 'seeked'
    // for a tiny jump, so timeupdates aren't blocked forever.
    window.setTimeout(() => { isSeekingRef.current = false; }, 400);
  };


  // ── Word-level karaoke renderer ──────────────────────────────────────────
  // Returns the sentence text with spoken words (0..upToWord) colored blue.
  const renderWords = (text: string, upToWord: number) => {
    const words = text.split(/\s+/).filter(Boolean);
    return words.map((word, wi) => (
      <span key={wi}>
        <span className={wi <= upToWord ? 'text-blue-600 font-bold' : 'text-gray-900'}>
          {word}
        </span>
        {wi < words.length - 1 ? ' ' : ''}
      </span>
    ));
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (initState === 'loading') {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center space-y-2">
          <div className="text-3xl animate-pulse">{bk.emoji}</div>
          <div className="text-xs text-gray-400">불러오는 중...</div>
        </div>
      </div>
    );
  }

  // ── Upload view ───────────────────────────────────────────────────────────
  if (initState === 'no-book') {
    return (
      <div className="space-y-4">
        <div className={`${bk.bg} border-2 ${bk.border} rounded-2xl p-4`}>
          <div className={`font-bold text-sm ${bk.color} mb-1`}>
            {bk.emoji} {bk.shortTitle} — 전체 원서 읽기
          </div>
          <div className="text-xs text-gray-500 leading-relaxed">
            PDF를 업로드하면 챕터별로 자동 분리해서 한/영 대역으로 읽을 수 있어요.
          </div>
        </div>

        {extracting ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-3">
            <div className="text-sm font-semibold text-gray-700 text-center">📖 챕터 분석 중...</div>
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-200 ${bk.badge}`}
                style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : '0%' }}
              />
            </div>
            <div className="text-xs text-gray-400 text-center">
              {progress.done} / {progress.total} 페이지
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            className={`border-2 border-dashed ${bk.border} ${bk.bg} rounded-2xl p-10 text-center cursor-pointer hover:opacity-80 transition-all`}
          >
            <div className="text-4xl mb-3">{bk.emoji}</div>
            <div className={`text-sm font-bold ${bk.color}`}>{bk.shortTitle} PDF 업로드</div>
            <div className="text-xs text-gray-400 mt-1.5">클릭하거나 드래그해서 파일 선택</div>
            <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
        )}

        {uploadError && (
          <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{uploadError}</p>
        )}
      </div>
    );
  }

  // ── Reader view ───────────────────────────────────────────────────────────
  return (
    <div className={`space-y-3 ${audioUrl ? 'pb-28' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${bk.color}`}>{bk.emoji} {bk.shortTitle}</span>
          {detectedNote && (
            <span className="text-xs text-gray-400">{detectedNote}</span>
          )}
        </div>
        {confirmClear ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">정말 삭제할까요?</span>
            <button onClick={handleClearBook} className="text-xs text-red-500 font-semibold hover:text-red-700">삭제</button>
            <button onClick={() => setConfirmClear(false)} className="text-xs text-gray-400 hover:text-gray-600">취소</button>
          </div>
        ) : (
          <button onClick={() => setConfirmClear(true)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">🗑 삭제</button>
        )}
      </div>

      {/* Chapter selector — only show chapters in the current lesson range */}
      {(() => {
        const visibleChapters = lessonChapterRange
          ? Array.from({ length: lessonChapterRange[1] }, (_, i) => i + 1)
              .filter(ch => ch <= totalChapters)
          : Array.from({ length: totalChapters }, (_, i) => i + 1);
        return (
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {visibleChapters.map(ch => (
              <button key={ch} onClick={() => selectChapter(ch)}
                className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-all border relative ${
                  selectedChapter === ch
                    ? `${bk.badge} text-white border-transparent shadow-sm`
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}>
                Ch.{String(ch).padStart(2, '0')}
                {translatedChaps.has(ch) && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border border-white" />
                )}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Current chapter info bar */}
      <div className="bg-white rounded-xl border border-gray-100 px-3 py-2 flex items-center justify-between">
        <span className={`text-xs font-bold ${bk.color}`}>
          Chapter {selectedChapter}
          {lessonChapterRange
            ? ` (이번 수업: Ch. ${lessonChapterRange[0]}~${lessonChapterRange[1]})`
            : ` / ${totalChapters}`}
        </span>
        {enText && (
          <span className="text-xs text-gray-400">{enText.trim().split(/\s+/).length}단어</span>
        )}
      </div>

      {/* Mobile view toggle */}
      <div className="sm:hidden flex bg-white rounded-xl border border-gray-100 p-0.5 gap-0.5">
        {(['en', 'ko'] as const).map(v => (
          <button key={v} onClick={() => setMobileView(v)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              mobileView === v ? `${bk.badge} text-white` : 'text-gray-500'
            }`}>
            {v === 'en' ? '🇺🇸 영어' : '🇰🇷 한국어'}
          </button>
        ))}
      </div>

      {/* Translation controls */}
      {!chapterLoading && enText && !koText && !translating && (
        <button onClick={handleTranslate}
          className={`w-full py-3 ${bk.badge} text-white rounded-xl font-semibold text-sm shadow-sm hover:opacity-90 transition-all`}>
          🌏 이 챕터 한국어로 번역하기
        </button>
      )}
      {translating && (
        <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 space-y-2">
          <div className="text-xs text-gray-600 font-semibold text-center">번역 중...</div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-300 ${bk.badge}`}
              style={{ width: txProgress.total ? `${(txProgress.done / txProgress.total) * 100}%` : '15%' }} />
          </div>
          {txProgress.total > 0 && (
            <div className="text-xs text-gray-400 text-center">{txProgress.done} / {txProgress.total} 구간</div>
          )}
        </div>
      )}
      {txError && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{txError}</p>}
      {koText && !translating && (
        <div className="px-1 flex items-center justify-between">
          <span className="text-xs text-emerald-600 font-semibold">✓ 번역 저장됨</span>
          <button onClick={handleTranslate}
            className="text-xs text-gray-400 hover:text-indigo-600 transition-colors font-semibold">
            🔄 다시 번역 (문장 정렬)
          </button>
        </div>
      )}
      {/* Chapter audio — shadowing with real-time sentence highlight */}
      {!chapterLoading && enText && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              🎧 섀도잉 오디오
            </span>
            <div className="flex items-center gap-2">
              {audioUrl && (
                <button onClick={handleDeleteAudio}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors">🗑 삭제</button>
              )}
              <button onClick={() => audioFileRef.current?.click()} disabled={audioUploading}
                className={`px-3 py-1.5 ${bk.badge} text-white rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all`}>
                {audioUploading
                  ? `⏳ ${uploadProgress.done}/${uploadProgress.total} 업로드 중…`
                  : audioUrl ? '📁 추가 업로드' : '+ mp3 업로드'}
              </button>
            </div>
            <input ref={audioFileRef} type="file" accept="audio/mp3,audio/mpeg,audio/*" className="hidden"
              multiple
              onChange={e => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) handleChapterAudioUpload(files);
                e.target.value = '';
              }} />
          </div>
          {audioUploadMsg && (
            <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">{audioUploadMsg}</p>
          )}

          {/* Merge banner: shown when current + next chapter both have audio */}
          {audioUrl && nextChapHasAudio && !merging && !mergeMsg && (
            <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5">
              <span className="text-xs text-indigo-700 flex-1">
                🔗 Ch.{selectedChapter}과 Ch.{selectedChapter + 1} 오디오가 모두 있어요. 하나로 이어 붙일까요?
              </span>
              <button onClick={handleMergeAudio}
                className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shrink-0 transition-all">
                Merge →
              </button>
            </div>
          )}
          {merging && (
            <p className="text-xs text-indigo-500 bg-indigo-50 rounded-lg px-3 py-2 animate-pulse">{mergeMsg}</p>
          )}
          {mergeMsg && !merging && (
            <p className={`text-xs rounded-lg px-3 py-2 ${mergeMsg.startsWith('✓') ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
              {mergeMsg}
            </p>
          )}

          {audioUrl ? (
            <>
              <audio
                ref={audioRef}
                src={audioUrl}
                className="hidden"
                onLoadedMetadata={e => setAudioDuration(e.currentTarget.duration || 0)}
                onTimeUpdate={handleAudioTimeUpdate}
                onSeeking={handleSeeking}
                onSeeked={handleSeeked}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => { setIsPlaying(false); setActiveIdx(-1); setActiveWordIdx(-1); isSeekingRef.current = false; seekTargetRef.current = -1; }}
              />

              {/* Real speech alignment */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {timings && timings.length === enRows.length ? (
                  <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                    🎯 음성 분석 적용됨 — 실제 발화에 맞춰 하이라이트
                  </span>
                ) : (
                  <span className="text-xs text-amber-600 font-semibold">
                    ⚠️ 아직 추정 타이밍이에요. 정확히 맞추려면 음성 분석을 실행하세요.
                  </span>
                )}
                <button onClick={handleAnalyzeAudio} disabled={analyzing}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 ${
                    timings ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : `${bk.badge} text-white hover:opacity-90`
                  }`}>
                  {analyzing ? '⏳ 분석 중…' : timings ? '🔄 음성 다시 분석' : '🎙 음성 분석 실행'}
                </button>
              </div>
              {(analyzing || analyzeMsg) && (
                <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                  {analyzing && <span className="inline-block animate-pulse mr-1">●</span>}
                  {analyzeMsg}
                </p>
              )}
              <p className="text-xs text-gray-400">
                💡 재생하면 영어·한국어 문장이 실시간으로 하이라이트돼요. 문장을 클릭하면 그 부분부터 들을 수 있어요.
              </p>
            </>
          ) : (
            <button onClick={() => audioFileRef.current?.click()} disabled={audioUploading}
              className={`w-full border-2 border-dashed ${bk.border} rounded-xl py-3 text-xs ${bk.color} hover:opacity-80 disabled:opacity-50 transition-all`}>
              {audioUploading
                ? `⏳ ${uploadProgress.done}/${uploadProgress.total} 업로드 중…`
                : '클릭해서 mp3 선택 · 여러 파일 한 번에 가능 · 파일명에 챕터 번호 포함 시 자동 분류'}
            </button>
          )}
        </div>
      )}

      {/* Reader */}
      {chapterLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-xs text-gray-400 animate-pulse">챕터 불러오는 중...</div>
        </div>
      ) : enText ? (
        <>
          {/* Desktop: sentence-paired grid — one EN sentence : one KO sentence per row */}
          <div className="hidden sm:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-2 border-b border-gray-100">
              <div className="px-4 py-2.5 border-r border-gray-100">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">🇺🇸 English</span>
              </div>
              <div className="px-4 py-2.5">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">🇰🇷 한국어</span>
              </div>
            </div>
            {Array.from({ length: maxRows }).map((_, i) => {
              const active = i === activeIdx;
              return (
                <div key={i}
                  ref={el => { rowRefs.current[i] = el; }}
                  onClick={() => audioUrl && seekToSentence(i)}
                  className={`grid grid-cols-2 items-start border-b border-gray-50 last:border-0 transition-colors ${
                    active ? 'bg-yellow-50' : 'hover:bg-gray-50/40'
                  } ${audioUrl ? 'cursor-pointer' : ''}`}>
                  <div className={`px-4 py-3 border-r border-gray-100 ${active ? 'border-l-4 border-l-yellow-400' : ''}`}>
                    <p className={`text-sm leading-relaxed ${active ? 'text-gray-900 font-semibold bg-yellow-200/60 rounded px-1' : 'text-gray-800'}`}>
                      {active ? renderWords(enRows[i] ?? '', activeWordIdx) : (enRows[i] ?? '')}
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    {koRows[i] ? (
                      <p className={`text-sm leading-relaxed ${active ? 'text-gray-900 font-semibold bg-yellow-200/60 rounded px-1' : 'text-gray-700'}`}>{koRows[i]}</p>
                    ) : (i === 0 && !koText ? (
                      <p className="text-xs text-gray-400 italic">번역 버튼을 눌러주세요</p>
                    ) : null)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile: single column */}
          <div className="sm:hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
            {mobileView === 'en'
              ? enRows.map((p, i) => (
                  <p key={i}
                    ref={el => { mobileRowRefs.current[i] = el; }}
                    onClick={() => audioUrl && seekToSentence(i)}
                    className={`text-sm leading-relaxed border-b border-gray-50 pb-3 last:border-0 last:pb-0 transition-colors ${
                      i === activeIdx ? 'text-gray-900 font-semibold bg-yellow-200/60 rounded px-1' : 'text-gray-800'
                    }`}>
                    {i === activeIdx ? renderWords(p, activeWordIdx) : p}
                  </p>
                ))
              : koRows.filter(Boolean).length > 0
              ? koRows.map((p, i) => (
                  <p key={i}
                    ref={el => { mobileRowRefs.current[i] = el; }}
                    onClick={() => audioUrl && seekToSentence(i)}
                    className={`text-sm leading-relaxed border-b border-gray-50 pb-3 last:border-0 last:pb-0 transition-colors ${
                      i === activeIdx ? 'text-gray-900 font-semibold bg-yellow-200/60 rounded px-1' : 'text-gray-700'
                    }`}>{p}</p>
                ))
              : <div className="text-center py-8"><p className="text-xs text-gray-400">번역 버튼을 눌러서 한국어 번역을 불러오세요</p></div>}
          </div>
        </>
      ) : (
        <div className="bg-gray-50 rounded-2xl p-8 text-center text-sm text-gray-400">
          이 챕터의 텍스트를 불러올 수 없어요.
        </div>
      )}

      {/* ── STICKY AUDIO PLAYER BAR ── */}
      {audioUrl && (() => {
        const fmt = (s: number) => {
          const m = Math.floor(s / 60);
          const sec = Math.floor(s % 60);
          return `${m}:${sec.toString().padStart(2, '0')}`;
        };
        const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];
        const togglePlay = () => {
          const a = audioRef.current;
          if (!a) return;
          if (a.paused) a.play().catch(() => {});
          else a.pause();
        };
        const changeSpeed = (rate: number) => {
          setPlaybackRate(rate);
          if (audioRef.current) audioRef.current.playbackRate = rate;
        };
        const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
          const t = Number(e.target.value);
          if (audioRef.current) audioRef.current.currentTime = t;
          setAudioCurrentTime(t);
        };
        return (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9990,
            background: 'rgba(15,23,42,0.96)', backdropFilter: 'blur(8px)',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            padding: '10px 16px 10px 16px',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            {/* Progress scrubber */}
            <input type="range" min={0} max={audioDuration || 100} step={0.5}
              value={audioCurrentTime}
              onChange={seek}
              style={{ width: '100%', accentColor: '#6366f1', cursor: 'pointer', height: 4 }}
            />
            {/* Controls row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Play / Pause */}
              <button onClick={togglePlay} style={{
                width: 40, height: 40, borderRadius: '50%', border: 'none',
                background: '#6366f1', color: '#fff', fontSize: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}>
                {isPlaying ? '⏸' : '▶'}
              </button>
              {/* Time */}
              <span style={{ color: '#94a3b8', fontSize: 12, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {fmt(audioCurrentTime)} / {fmt(audioDuration)}
              </span>
              {/* Speed buttons */}
              <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                {SPEEDS.map(s => (
                  <button key={s} onClick={() => changeSpeed(s)} style={{
                    padding: '3px 8px', borderRadius: 6, border: 'none',
                    background: playbackRate === s ? '#6366f1' : 'rgba(255,255,255,0.1)',
                    color: playbackRate === s ? '#fff' : '#94a3b8',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}>
                    {s}×
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── DEBUG OVERLAY ── tap the button to show/hide ── */}
      <button
        onClick={() => setShowDebug(v => !v)}
        style={{ position:'fixed', bottom: audioUrl ? 88 : 16, right:16, zIndex:9999,
          background:'#1e293b', color:'#f8fafc', border:'none',
          borderRadius:8, padding:'6px 12px', fontSize:12, opacity:0.85 }}
      >
        {showDebug ? 'Hide Log' : 'Debug Log'}
      </button>
      {showDebug && (
        <div style={{
          position:'fixed', bottom: audioUrl ? 140 : 52, right:8, left:8, zIndex:9998,
          background:'rgba(15,23,42,0.95)', color:'#86efac',
          fontFamily:'monospace', fontSize:11, lineHeight:1.5,
          borderRadius:10, padding:10, maxHeight:'50vh',
          overflowY:'auto', wordBreak:'break-all',
        }}>
          <div style={{color:'#94a3b8', marginBottom:4}}>
            activeIdx={activeIdx} | seekTarget={seekTargetRef.current.toFixed(1)} | isSeeking={String(isSeekingRef.current)}
          </div>
          {debugLogs.length === 0
            ? <div style={{color:'#64748b'}}>No logs yet. Tap a sentence.</div>
            : debugLogs.map((l, i) => (
                <div key={i} style={{color: l.startsWith('[TAP]') ? '#fbbf24' : l.startsWith('[SYNC] idx') ? '#f87171' : '#86efac'}}>
                  {l}
                </div>
              ))
          }
        </div>
      )}
    </div>
  );
}
