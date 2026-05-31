import { useState, useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { BOOKS, SCHEDULE, type BookId } from '../data/syllabus';
import { supabase } from '../lib/supabase';
import {
  hasBook, clearBook, loadChapterEn, loadChapterKo,
  saveChapterKo, saveBookChapters, getTranslatedChapters,
  saveChapterCount, loadChapterCount,
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

async function translateChunked(
  text: string,
  onChunk: (done: number, total: number) => void,
): Promise<string> {
  const LIMIT = 1200;
  const paras = text.split(/\n\n+/).filter(p => p.trim());
  const chunks: string[][] = [];
  let cur: string[] = [];
  let curW = 0;

  for (const p of paras) {
    const w = p.split(/\s+/).length;
    if (curW + w > LIMIT && cur.length > 0) {
      chunks.push(cur); cur = [p]; curW = w;
    } else {
      cur.push(p); curW += w;
    }
  }
  if (cur.length > 0) chunks.push(cur);

  const parts: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onChunk(i, chunks.length);
    const { data, error } = await supabase.functions.invoke('ocr-extract', {
      body: { text: chunks[i].join('\n\n'), mode: 'translate' },
    });
    if (error) throw new Error(String((error as { message?: string }).message ?? error));
    parts.push((data as { result: string }).result);
  }
  onChunk(chunks.length, chunks.length);
  return parts.join('\n\n');
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

  // Current lesson chapter range for this book (to highlight lesson chapters)
  const lessonChapterRange = (() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const past = SCHEDULE.filter(l => l.book === bookId && new Date(l.date) <= now && l.chapters);
    const entry = past.at(-1) ?? SCHEDULE.find(l => l.book === bookId && l.chapters);
    return entry?.chapters ?? null;
  })();

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
    const [en, ko] = await Promise.all([
      loadChapterEn(bid, chapter).catch(() => null),
      loadChapterKo(bid, chapter).catch(() => null),
    ]);
    setEnText(en);
    setKoText(ko);
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

      // Split into chapters and strip the heading line from each chapter
      const detected = splitIntoChapters(cleanedPages);

      let chapterTexts: string[];
      let note: string;

      if (detected && detected.length >= 2) {
        // Strip the heading line then clean each chapter
        chapterTexts = detected.map(t => cleanChapterText(stripToFirstChapterHeading(t, 20)));
        note = `${detected.length}개 챕터 감지됨`;
      } else {
        // Detection failed: cleanChapterText scans the whole book from the start,
        // filtering front matter until it reaches the first story paragraph.
        chapterTexts = [cleanChapterText(cleanedPages.join('\n\n'))];
        note = '챕터를 자동 감지하지 못해 전체를 1개로 저장했어요.';
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
      const ko = await translateChunked(enText, (done, total) => setTxProgress({ done, total }));
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
    setTotalChapters(0);
    setTranslatedChaps(new Set());
    setDetectedNote('');
  };

  const enParas   = enText ? enText.split(/\n\n+/).map(p => p.trim()).filter(Boolean) : [];
  const koParas   = koText ? koText.split(/\n\n+/).map(p => p.trim()).filter(Boolean) : [];
  const maxParas  = Math.max(enParas.length, koParas.length);

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

      {/* Chapter selector */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {Array.from({ length: totalChapters }, (_, i) => i + 1).map(ch => {
          const isLesson = lessonChapterRange && ch >= lessonChapterRange[0] && ch <= lessonChapterRange[1];
          return (
            <button key={ch} onClick={() => selectChapter(ch)}
              className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-all border relative ${
                selectedChapter === ch
                  ? `${bk.badge} text-white border-transparent shadow-sm`
                  : isLesson
                  ? `bg-white ${bk.border} ${bk.color} shadow-sm`
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}>
              Ch.{String(ch).padStart(2, '0')}
              {isLesson && selectedChapter !== ch && (
                <span className="absolute -top-1 -left-1 text-[9px] leading-none bg-orange-400 text-white rounded-full px-1 font-bold">수업</span>
              )}
              {translatedChaps.has(ch) && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border border-white" />
              )}
            </button>
          );
        })}
      </div>

      {/* Current chapter info bar */}
      <div className="bg-white rounded-xl border border-gray-100 px-3 py-2 flex items-center justify-between">
        <span className={`text-xs font-bold ${bk.color}`}>
          Chapter {selectedChapter} / {totalChapters}
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
        <div className="px-1">
          <span className="text-xs text-emerald-600 font-semibold">✓ 번역 저장됨</span>
        </div>
      )}

      {/* Reader */}
      {chapterLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-xs text-gray-400 animate-pulse">챕터 불러오는 중...</div>
        </div>
      ) : enText ? (
        <>
          {/* Desktop: paired paragraph grid */}
          <div className="hidden sm:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-2 border-b border-gray-100">
              <div className="px-4 py-2.5 border-r border-gray-100">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">🇺🇸 English</span>
              </div>
              <div className="px-4 py-2.5">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">🇰🇷 한국어</span>
              </div>
            </div>
            {Array.from({ length: maxParas }).map((_, i) => (
              <div key={i} className="grid grid-cols-2 border-b border-gray-50 last:border-0 hover:bg-gray-50/40 transition-colors">
                <div className="px-4 py-3 border-r border-gray-100">
                  <p className="text-sm text-gray-800 leading-relaxed">{enParas[i] ?? ''}</p>
                </div>
                <div className="px-4 py-3">
                  {koParas[i] ? (
                    <p className="text-sm text-gray-700 leading-relaxed">{koParas[i]}</p>
                  ) : (i === 0 && !koText ? (
                    <p className="text-xs text-gray-400 italic">번역 버튼을 눌러주세요</p>
                  ) : null)}
                </div>
              </div>
            ))}
          </div>

          {/* Mobile: single column */}
          <div className="sm:hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
            {mobileView === 'en'
              ? enParas.map((p, i) => (
                  <p key={i} className="text-sm text-gray-800 leading-relaxed border-b border-gray-50 pb-3 last:border-0 last:pb-0">{p}</p>
                ))
              : koParas.length > 0
              ? koParas.map((p, i) => (
                  <p key={i} className="text-sm text-gray-700 leading-relaxed border-b border-gray-50 pb-3 last:border-0 last:pb-0">{p}</p>
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
