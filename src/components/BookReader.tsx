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
} from '../lib/chapterStorage';

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
    // Edge function guarantees same length, but enforce defensively.
    // Strip any stray newlines so '\n' stays a clean per-sentence delimiter.
    for (let j = 0; j < batches[i].length; j++) {
      ko.push((arr[j] ?? '').replace(/\s*\n\s*/g, ' ').trim());
    }
  }
  onChunk(batches.length, batches.length);

  // Store Korean sentences one-per-line, index-aligned to splitToSentences(enText).
  return ko.join('\n');
}

// ── Component ─────────────────────────────────────────────────────────────────
type InitState = 'loading' | 'no-book' | 'has-book';

export default function BookReader({ bookId }: { bookId: BookId }) {
  const bk = BOOKS[bookId];

  const [initState,       setInitState]       = useState<InitState>('loading');
  const [totalChapters,   setTotalChapters]   = useState(0);
  const [selectedChapter, setSelectedChapter] = useState(1);
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
  const [timings,       setTimings]       = useState<number[] | null>(null);
  const [analyzing,     setAnalyzing]     = useState(false);
  const [analyzeMsg,    setAnalyzeMsg]    = useState('');
  const [audioUploadMsg,setAudioUploadMsg]= useState('');
  const [uploadProgress,setUploadProgress]= useState({ done: 0, total: 0 });
  // isSeekingRef: gates ALL timeupdate events while the browser is mid-seek
  // (on mobile, timeupdate fires with stale currentTime values during seeking).
  // seekFloorRef: after seek settles, prevents idx from jumping back by 1 sentence
  // if the audio frame boundary landed a few ms before sentenceStarts[i].
  const isSeekingRef        = useRef(false);
  const seekFloorRef        = useRef(-1);
  // Wall-clock time until which any seeking event is treated as programmatic.
  // Covers both the currentTime seek and the extra seeking that play() fires on mobile.
  const seekProtectUntilRef = useRef(0);
  // Adaptive timing correction: records ACTUAL sentence-start times observed during
  // natural (non-seek) playback. Whisper alignment has ±1-2s accumulated error per
  // sentence; these live corrections replace stored values once 10+ are collected and
  // are persisted back to Supabase so future sessions also benefit.
  const liveTimingsRef  = useRef<(number | undefined)[]>([]);
  const prevLiveIdxRef  = useRef(-1);  // last idx seen during natural play
  const pendingCorrRef  = useRef(0);   // corrections not yet flushed to state
  const [nextChapHasAudio, setNextChapHasAudio] = useState(false);
  const [merging,       setMerging]       = useState(false);
  const [mergeMsg,      setMergeMsg]      = useState('');
  const audioRef    = useRef<HTMLAudioElement>(null);
  const audioFileRef = useRef<HTMLInputElement>(null);
  const rowRefs       = useRef<(HTMLDivElement | null)[]>([]);
  const mobileRowRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  // Index (1-based) of the chapter stored for the current/upcoming lesson.
  // When pdfPages are defined, each lesson is stored as one chapter in order.
  const currentLessonChapter = (() => {
    const bookLessons = SCHEDULE.filter(l => l.book === bookId && l.pdfPages);
    if (bookLessons.length === 0) return null;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    // Show the next upcoming lesson; fall back to most recent past if none
    const future = bookLessons.filter(l => new Date(l.date) > now);
    const target = future[0] ?? bookLessons.at(-1)!;
    return bookLessons.indexOf(target) + 1; // 1-based chapter index
  })();
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
        await loadChapter(bookId, 1);
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
    liveTimingsRef.current      = [];
    prevLiveIdxRef.current      = -1;
    pendingCorrRef.current      = 0;
    isSeekingRef.current        = false;
    seekFloorRef.current        = -1;
    seekProtectUntilRef.current = 0;
    const [en, ko, audio, times, nextAudio] = await Promise.all([
      loadChapterEn(bid, chapter).catch(() => null),
      loadChapterKo(bid, chapter).catch(() => null),
      loadChapterAudio(bid, chapter).catch(() => null),
      loadChapterTimings(bid, chapter).catch(() => null),
      loadChapterAudio(bid, chapter + 1).catch(() => null),
    ]);
    setEnText(en);
    setKoText(ko);
    setAudioUrl(audio);
    setTimings(times);
    setNextChapHasAudio(!!nextAudio);
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
  // Filenames like "ch3.mp3", "chapter 03.mp3", "lesson2.mp3" → chapter number.
  const chapterFromFilename = (name: string): number | null => {
    const m = name.match(/(?:ch(?:apter)?|lesson|l)\s*0*(\d{1,2})/i) ?? name.match(/\b0*(\d{1,2})\b/);
    return m ? parseInt(m[1]) : null;
  };

  const handleChapterAudioUpload = async (files: File[]) => {
    if (files.length === 0) return;
    setAudioUploading(true);
    setUploadError('');
    setAudioUploadMsg('');
    setUploadProgress({ done: 0, total: files.length });

    const uploadedChapters: number[] = [];
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const guessed = chapterFromFilename(file.name);
      const target = guessed && guessed >= 1 && guessed <= totalChapters ? guessed : selectedChapter;
      setUploadProgress({ done: i, total: files.length });
      try {
        const url = await saveChapterAudio(bookId, target, file);
        await deleteChapterTimings(bookId, target).catch(() => {});
        uploadedChapters.push(target);
        // Refresh current chapter's player if this file targets it.
        if (target === selectedChapter) {
          setTimings(null);
          setAudioUrl(`${url}?t=${Date.now()}`);
          setActiveIdx(-1);
        }
      } catch (e) {
        errors.push(`${file.name}: ${e instanceof Error ? e.message : '업로드 실패'}`);
      }
      setUploadProgress({ done: i + 1, total: files.length });
    }

    setAudioUploading(false);
    if (audioFileRef.current) audioFileRef.current.value = '';

    if (errors.length > 0) {
      setUploadError(errors.join(' | '));
    }
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

  const syncHighlight = () => {
    const t = audioRef.current?.currentTime ?? 0;
    if (sentenceStarts.length === 0) return;

    let idx = 0;
    for (let i = 0; i < sentenceStarts.length; i++) {
      if (t >= sentenceStarts[i]) idx = i; else break;
    }

    // After a programmatic seek, currentTime can briefly report a value BEFORE
    // the target sentence (mobile backward-blip). If that happens, skip this
    // syncHighlight call entirely — seekToSentence already called setActiveIdx
    // with the correct sentence, so the highlight is already right.
    if (seekFloorRef.current >= 0) {
      const floorTime = sentenceStarts[seekFloorRef.current];
      if (t < floorTime) return; // backward blip — wait for audio to settle
      if (idx > seekFloorRef.current) seekFloorRef.current = -1;
    }

    setActiveIdx(idx);

    // ── Adaptive timing correction ────────────────────────────────────────
    // When audio naturally advances to the next sentence (no seek floor active),
    // record the ACTUAL timestamp. Whisper alignment has ±1-2 s accumulated error;
    // these live observations correct that drift. After 10 new observations the
    // Session-local timing refinement: record actual transition times during
    // natural playback so seekToSentence uses them within this session.
    // We do NOT write these back to Supabase — server-side OpenAI Whisper
    // timestamps are already accurate and timeupdate fires up to 250ms late,
    // so writing back would corrupt good stored timings.
    const prev = prevLiveIdxRef.current;
    if (
      seekFloorRef.current < 0 &&
      prev >= 0 &&
      idx === prev + 1 &&
      liveTimingsRef.current[idx] === undefined
    ) {
      liveTimingsRef.current[idx] = t;
    }
    prevLiveIdxRef.current = idx;

    // ── Word-level highlight ──────────────────────────────────────────────
    const sentStart = sentenceStarts[idx];
    const sentEnd   = idx + 1 < sentenceStarts.length
      ? sentenceStarts[idx + 1]
      : (audioDuration || t + 5);
    const words    = (enRows[idx] ?? '').split(/\s+/).filter(Boolean);
    const progress = Math.max(0, Math.min(1, (t - sentStart) / Math.max(0.1, sentEnd - sentStart)));
    setActiveWordIdx(Math.min(Math.floor(progress * words.length), words.length - 1));
  };

  // Gate ALL timeupdate events while the browser is mid-seek.
  const handleAudioTimeUpdate = () => {
    if (isSeekingRef.current) return;
    // Also suppress timeupdate events for the full 800 ms protection window after any
    // programmatic seek. handleSeeked sets isSeekingRef=false at ~50 ms, so without this
    // gate the very first timeupdate (~250 ms post-seek) calls syncHighlight while the
    // floor is still active. With synthetic 0.03 s timestamps, t+0.25 s jumps idx by
    // many sentences, immediately clearing the floor and showing the wrong highlight.
    if (Date.now() <= seekProtectUntilRef.current) return;
    syncHighlight();
  };

  const handleSeeking = () => {
    isSeekingRef.current = true;
    // Only clear the floor for genuine native-player drags (outside the protection window).
    // Inside the window, this seeking might be from play() firing on mobile — keep the floor.
    if (Date.now() > seekProtectUntilRef.current) {
      seekFloorRef.current = -1;
    }
  };

  const handleSeeked = () => {
    isSeekingRef.current = false;
    // If we're still inside the programmatic-seek window, seekToSentence already called
    // setActiveIdx with the correct sentence. Running syncHighlight here would compute idx
    // from the freshly-settled currentTime and overwrite that correct value — skip it.
    // The next timeupdate (~250 ms later) will call syncHighlight once the floor is active.
    if (Date.now() <= seekProtectUntilRef.current) return;
    syncHighlight();
  };

  const seekToSentence = (i: number) => {
    if (!audioRef.current || i >= sentenceStarts.length) return;
    seekProtectUntilRef.current = Date.now() + 800;
    seekFloorRef.current = i;
    prevLiveIdxRef.current = i;
    setActiveIdx(i);
    setActiveWordIdx(0);
    try {
      audioRef.current.currentTime = sentenceStarts[i];
      if (audioRef.current.paused) {
        audioRef.current.play().catch(() => {});
      }
    } catch {
      // currentTime assignment can throw on some mobile browsers when the audio
      // element is not ready; ensure we don't leave isSeekingRef stuck.
      isSeekingRef.current = false;
    }
    // Safety net: if seeked never fires (mobile stall / iOS buffering), unblock
    // timeupdate after 1.5 s so the highlight doesn't freeze permanently.
    setTimeout(() => { isSeekingRef.current = false; }, 1500);
  };

  // Keep the active sentence in view while audio plays (scroll whichever
  // layout is currently visible; the hidden one is a harmless no-op).
  useEffect(() => {
    if (activeIdx < 0) return;
    rowRefs.current[activeIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    mobileRowRefs.current[activeIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeIdx]);

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
    <div className="space-y-3">
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
          ? Array.from({ length: lessonChapterRange[1] - lessonChapterRange[0] + 1 }, (_, i) => lessonChapterRange[0] + i)
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
                controls
                src={audioUrl}
                className="w-full rounded-xl"
                onLoadedMetadata={e => setAudioDuration(e.currentTarget.duration || 0)}
                onTimeUpdate={handleAudioTimeUpdate}
                onSeeking={handleSeeking}
                onSeeked={handleSeeked}
                onEnded={() => { setActiveIdx(-1); setActiveWordIdx(-1); isSeekingRef.current = false; seekFloorRef.current = -1; }}
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
    </div>
  );
}
