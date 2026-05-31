import { useState, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { SCHEDULE, BOOKS, type BookId } from '../data/syllabus';
import { supabase } from '../lib/supabase';
import {
  saveChapterEn, saveChapterKo,
  loadChapterEn, loadChapterKo,
  hasBook, clearBook,
} from '../lib/chapterStorage';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function parseRange(pages: string): { start: number; end: number } | null {
  const m = pages.match(/(\d+)\s*[~–-]\s*(\d+)/);
  return m ? { start: +m[1], end: +m[2] } : null;
}

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
      chunks.push(cur);
      cur = [p];
      curW = w;
    } else {
      cur.push(p);
      curW += w;
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

interface Props {
  bookId: BookId;
}

export default function BookReader({ bookId }: Props) {
  const bk = BOOKS[bookId];
  const bookLessons = SCHEDULE.filter(l => l.book === bookId);
  const firstLesson = bookLessons[0]?.lesson ?? 1;

  const [loaded, setLoaded] = useState(() => hasBook(bookId));
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [uploadError, setUploadError] = useState('');

  const [selectedLesson, setSelectedLesson] = useState(firstLesson);
  const [enText, setEnText] = useState<string | null>(() =>
    hasBook(bookId) ? loadChapterEn(bookId, firstLesson) : null,
  );
  const [koText, setKoText] = useState<string | null>(() =>
    hasBook(bookId) ? loadChapterKo(bookId, firstLesson) : null,
  );

  const [translating, setTranslating] = useState(false);
  const [txProgress, setTxProgress] = useState({ done: 0, total: 0 });
  const [txError, setTxError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const [mobileView, setMobileView] = useState<'en' | 'ko'>('en');

  const fileRef = useRef<HTMLInputElement>(null);

  const selectLesson = (lesson: number) => {
    setSelectedLesson(lesson);
    setEnText(loadChapterEn(bookId, lesson));
    setKoText(loadChapterKo(bookId, lesson));
    setTxError('');
    setMobileView('en');
  };

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('PDF 파일만 지원합니다.');
      return;
    }
    setUploadError('');
    setExtracting(true);
    setProgress({ done: 0, total: 0 });
    try {
      const pages = await extractAllPages(file, (done, total) =>
        setProgress({ done, total }),
      );
      for (const lesson of bookLessons) {
        const r = parseRange(lesson.pages);
        if (!r) continue;
        const text = pages.slice(r.start - 1, r.end).join('\n\n');
        saveChapterEn(bookId, lesson.lesson, text);
      }
      setLoaded(true);
      setExtracting(false);
      selectLesson(firstLesson);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '추출 실패');
      setExtracting(false);
    }
  };

  const handleTranslate = async () => {
    if (!enText) return;
    setTranslating(true);
    setTxError('');
    setTxProgress({ done: 0, total: 0 });
    try {
      const ko = await translateChunked(enText, (done, total) =>
        setTxProgress({ done, total }),
      );
      saveChapterKo(bookId, selectedLesson, ko);
      setKoText(ko);
    } catch (e) {
      setTxError(e instanceof Error ? e.message : '번역 실패');
    } finally {
      setTranslating(false);
    }
  };

  const handleClearBook = () => {
    clearBook(bookId);
    setLoaded(false);
    setEnText(null);
    setKoText(null);
    setConfirmClear(false);
    setUploadError('');
  };

  const enParas = enText ? enText.split(/\n\n+/).map(p => p.trim()).filter(Boolean) : [];
  const koParas = koText ? koText.split(/\n\n+/).map(p => p.trim()).filter(Boolean) : [];
  const maxParas = Math.max(enParas.length, koParas.length);

  const currentEntry = SCHEDULE.find(l => l.lesson === selectedLesson);

  // ── Upload view ─────────────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <div className="space-y-4">
        <div className={`${bk.bg} border-2 ${bk.border} rounded-2xl p-4`}>
          <div className={`font-bold text-sm ${bk.color} mb-1`}>
            {bk.emoji} {bk.shortTitle} — 전체 원서 읽기
          </div>
          <div className="text-xs text-gray-500 leading-relaxed">
            PDF 전체를 업로드하면 매 수업 챕터별로 나눠서 한/영 대역으로 읽을 수 있어요.
            <br />
            <span className="text-gray-400">※ PDF 페이지 번호 = 책 페이지 번호라고 가정합니다.</span>
          </div>
        </div>

        {extracting ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-3">
            <div className="text-sm font-semibold text-gray-700 text-center">📖 페이지 추출 중...</div>
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
            onDrop={e => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            className={`border-2 border-dashed ${bk.border} ${bk.bg} rounded-2xl p-10 text-center cursor-pointer hover:opacity-80 transition-all`}
          >
            <div className="text-4xl mb-3">{bk.emoji}</div>
            <div className={`text-sm font-bold ${bk.color}`}>{bk.shortTitle} PDF 업로드</div>
            <div className="text-xs text-gray-400 mt-1.5">클릭하거나 드래그해서 파일 선택</div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>
        )}

        {uploadError && (
          <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{uploadError}</p>
        )}
      </div>
    );
  }

  // ── Reader view ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className={`text-sm font-bold ${bk.color}`}>
          {bk.emoji} {bk.shortTitle} 원서 읽기
        </div>
        {confirmClear ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">정말 삭제할까요?</span>
            <button
              onClick={handleClearBook}
              className="text-xs text-red-500 font-semibold hover:text-red-700 transition-colors"
            >
              삭제
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmClear(true)}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            🗑 삭제
          </button>
        )}
      </div>

      {/* Chapter selector */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {bookLessons.map(l => {
          const hasKo = !!loadChapterKo(bookId, l.lesson);
          return (
            <button
              key={l.lesson}
              onClick={() => selectLesson(l.lesson)}
              className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-all border relative ${
                selectedLesson === l.lesson
                  ? `${bk.badge} text-white border-transparent shadow-sm`
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <div>L{String(l.lesson).padStart(2, '0')}</div>
              <div className="font-normal opacity-75">{l.pages.replace('pp. ', '')}</div>
              {hasKo && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border border-white" />
              )}
            </button>
          );
        })}
      </div>

      {/* Chapter info bar */}
      {currentEntry && (
        <div className="bg-white rounded-xl border border-gray-100 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${bk.color}`}>
              Lesson {String(currentEntry.lesson).padStart(2, '0')}
            </span>
            <span className="text-xs text-gray-500">{currentEntry.pages}</span>
          </div>
          {enText && (
            <span className="text-xs text-gray-400">
              {enText.trim().split(/\s+/).length}단어
            </span>
          )}
        </div>
      )}

      {/* Mobile: view toggle */}
      <div className="sm:hidden flex bg-white rounded-xl border border-gray-100 p-0.5 gap-0.5">
        <button
          onClick={() => setMobileView('en')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
            mobileView === 'en' ? `${bk.badge} text-white` : 'text-gray-500'
          }`}
        >
          🇺🇸 영어
        </button>
        <button
          onClick={() => setMobileView('ko')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
            mobileView === 'ko' ? `${bk.badge} text-white` : 'text-gray-500'
          }`}
        >
          🇰🇷 한국어
        </button>
      </div>

      {/* Translation controls */}
      {enText && !koText && !translating && (
        <button
          onClick={handleTranslate}
          className={`w-full py-3 ${bk.badge} text-white rounded-xl font-semibold text-sm shadow-sm hover:opacity-90 transition-all`}
        >
          🌏 이 챕터 한국어로 번역하기
        </button>
      )}
      {translating && (
        <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 space-y-2">
          <div className="text-xs text-gray-600 font-semibold text-center">번역 중...</div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${bk.badge}`}
              style={{
                width: txProgress.total
                  ? `${(txProgress.done / txProgress.total) * 100}%`
                  : '15%',
              }}
            />
          </div>
          {txProgress.total > 0 && (
            <div className="text-xs text-gray-400 text-center">
              {txProgress.done} / {txProgress.total} 구간
            </div>
          )}
        </div>
      )}
      {txError && (
        <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{txError}</p>
      )}
      {koText && !translating && (
        <div className="px-1">
          <span className="text-xs text-emerald-600 font-semibold">✓ 번역 저장됨</span>
        </div>
      )}

      {/* Reader */}
      {enText ? (
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
              <div
                key={i}
                className="grid grid-cols-2 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors"
              >
                <div className="px-4 py-3 border-r border-gray-100">
                  <p className="text-sm text-gray-800 leading-relaxed">{enParas[i] ?? ''}</p>
                </div>
                <div className="px-4 py-3">
                  {koParas[i] ? (
                    <p className="text-sm text-gray-700 leading-relaxed">{koParas[i]}</p>
                  ) : (
                    i === 0 && !koText ? (
                      <p className="text-xs text-gray-400 italic">번역 버튼을 눌러주세요</p>
                    ) : null
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Mobile: single column */}
          <div className="sm:hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
            {mobileView === 'en'
              ? enParas.map((p, i) => (
                  <p key={i} className="text-sm text-gray-800 leading-relaxed border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                    {p}
                  </p>
                ))
              : koParas.length > 0
              ? koParas.map((p, i) => (
                  <p key={i} className="text-sm text-gray-700 leading-relaxed border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                    {p}
                  </p>
                ))
              : (
                <div className="text-center py-8">
                  <p className="text-xs text-gray-400">번역 버튼을 눌러서 한국어 번역을 불러오세요</p>
                </div>
              )}
          </div>
        </>
      ) : (
        <div className="bg-gray-50 rounded-2xl p-8 text-center text-sm text-gray-400">
          이 챕터의 텍스트를 불러올 수 없어요.
          <br />
          PDF를 다시 업로드해 주세요.
        </div>
      )}
    </div>
  );
}
