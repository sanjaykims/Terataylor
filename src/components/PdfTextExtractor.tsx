import { useState, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { SCHEDULE, BOOKS, type BookId } from '../data/syllabus';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Parse "pp. 27~65" → { start: 27, end: 65 }
function parsePageRange(pages: string): { start: number; end: number } | null {
  const m = pages.match(/(\d+)\s*[~–-]\s*(\d+)/);
  if (!m) return null;
  return { start: parseInt(m[1]), end: parseInt(m[2]) };
}

function fmtDate(s: string) {
  const d = new Date(s); d.setHours(0,0,0,0);
  return `${d.getMonth()+1}/${d.getDate()}(수)`;
}

async function extractPages(file: File, startPage: number, endPage: number): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const total = pdf.numPages;
  const from  = Math.max(1, startPage);
  const to    = Math.min(total, endPage);
  const parts: string[] = [];
  for (let i = from; i <= to; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text    = content.items
      .map((item: unknown) => {
        const it = item as { str: string; hasEOL?: boolean };
        return it.str + (it.hasEOL ? '\n' : ' ');
      })
      .join('');
    parts.push(text.trim());
  }
  return parts.join('\n\n');
}

interface Props {
  bookId: BookId;
  onExtracted: (text: string) => void;
  savedSummary?: string;
  onClear?: () => void;
}

export default function PdfTextExtractor({ bookId, onExtracted, savedSummary, onClear }: Props) {
  const [file, setFile]       = useState<File | null>(null);
  const [status, setStatus]   = useState<'idle' | 'extracting' | 'review' | 'done'>('idle');
  const [startPage, setStart] = useState('1');
  const [endPage,   setEnd]   = useState('24');
  const [preview,   setPreview] = useState('');
  const [error,     setError] = useState('');
  const [totalPages, setTotal] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const bk = BOOKS[bookId];

  // Today's lesson info for quick-fill buttons
  const today = new Date(); today.setHours(0,0,0,0);
  const pastLessons   = SCHEDULE.filter(l => l.book === bookId && new Date(l.date) <= today);
  const futureLessons = SCHEDULE.filter(l => l.book === bookId && new Date(l.date) > today);
  const currentLesson = pastLessons.at(-1) ?? null;
  const nextLesson    = futureLessons[0] ?? null;

  const handleFile = async (f: File) => {
    if (!f.name.endsWith('.pdf')) { setError('PDF 파일만 지원합니다.'); return; }
    setFile(f);
    setError('');
    // Read total pages
    try {
      const ab  = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
      setTotal(pdf.numPages);
    } catch { /* ignore */ }
  };

  const quickFill = (pages: string) => {
    const r = parsePageRange(pages);
    if (r) { setStart(String(r.start)); setEnd(String(r.end)); }
  };

  const extract = async () => {
    if (!file) return;
    setStatus('extracting'); setError('');
    try {
      const text = await extractPages(file, parseInt(startPage), parseInt(endPage));
      if (!text.trim()) throw new Error('텍스트를 추출할 수 없었어요. 페이지 범위를 확인해 주세요.');
      setPreview(text);
      setStatus('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : '추출 실패');
      setStatus('idle');
    }
  };

  const confirm = () => { onExtracted(preview); setStatus('done'); };

  // Already saved
  if (savedSummary && status !== 'review') {
    return (
      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
        <div>
          <span className="text-sm font-semibold text-gray-700 mr-2">📄 소설 지문</span>
          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">✓ {savedSummary}</span>
        </div>
        <button onClick={onClear} className="text-xs text-gray-400 hover:text-red-500 transition-colors ml-3 shrink-0">
          🗑 삭제
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-gray-700">📄 소설 지문 (PDF)</div>

      {/* File drop zone */}
      {!file ? (
        <div onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          className={`border-2 border-dashed ${bk.border} ${bk.bg} rounded-xl p-5 text-center cursor-pointer hover:opacity-80 transition-all`}>
          <div className="text-3xl mb-1">{bk.emoji}</div>
          <div className={`text-sm font-semibold ${bk.color}`}>
            {bk.shortTitle} PDF 파일 업로드
          </div>
          <div className="text-xs text-gray-400 mt-1">클릭하거나 드래그해서 파일 선택</div>
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      ) : (
        <div className={`flex items-center gap-3 ${bk.bg} border ${bk.border} rounded-xl px-4 py-3`}>
          <span className="text-2xl">📄</span>
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-semibold ${bk.color} truncate`}>{file.name}</div>
            <div className="text-xs text-gray-400">
              {(file.size / 1024 / 1024).toFixed(1)}MB{totalPages ? ` · 총 ${totalPages}페이지` : ''}
            </div>
          </div>
          <button onClick={() => { setFile(null); setStatus('idle'); setTotal(null); }}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors shrink-0">✕</button>
        </div>
      )}

      {/* Page range selector */}
      {file && status !== 'done' && (
        <div className="space-y-2">
          {/* Quick-fill buttons from syllabus */}
          {(currentLesson || nextLesson) && (
            <div className="space-y-1">
              <div className="text-xs text-gray-400 font-semibold">빠른 선택:</div>
              <div className="flex flex-wrap gap-2">
                {currentLesson && (
                  <button onClick={() => quickFill(currentLesson.pages)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold border ${bk.border} ${bk.bg} ${bk.color} hover:opacity-80 transition-all`}>
                    ✅ Lesson {String(currentLesson.lesson).padStart(2,'0')} · {currentLesson.pages}
                    <span className="text-gray-400 font-normal ml-1">{fmtDate(currentLesson.date)}</span>
                  </button>
                )}
                {nextLesson && (
                  <button onClick={() => quickFill(nextLesson.pages)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold border ${bk.border} ${bk.bg} ${bk.color} hover:opacity-80 transition-all`}>
                    📌 Lesson {String(nextLesson.lesson).padStart(2,'0')} · {nextLesson.pages}
                    <span className="text-gray-400 font-normal ml-1">{fmtDate(nextLesson.date)}</span>
                  </button>
                )}
                {/* Homework pages */}
                {currentLesson && currentLesson.homework.startsWith('Read') && (() => {
                  const r = parsePageRange(currentLesson.homework);
                  if (!r) return null;
                  return (
                    <button onClick={() => { setStart(String(r.start)); setEnd(String(r.end)); }}
                      className="text-xs px-3 py-1.5 rounded-lg font-semibold border border-amber-300 bg-amber-50 text-amber-700 hover:opacity-80 transition-all">
                      📝 숙제 {currentLesson.homework.replace('Read ', '')}
                    </button>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Manual page range */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">페이지 범위</span>
            <input type="number" min="1" max={totalPages ?? 999} value={startPage}
              onChange={e => setStart(e.target.value)}
              className="w-16 border-2 border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:border-indigo-400" />
            <span className="text-gray-400">~</span>
            <input type="number" min="1" max={totalPages ?? 999} value={endPage}
              onChange={e => setEnd(e.target.value)}
              className="w-16 border-2 border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:border-indigo-400" />
            <span className="text-xs text-gray-400">페이지</span>
          </div>

          <button onClick={extract} disabled={status === 'extracting'}
            className={`w-full py-2.5 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2 ${bk.badge}`}>
            {status === 'extracting'
              ? <><span className="animate-spin inline-block">⟳</span> 추출 중...</>
              : `📖 pp. ${startPage}~${endPage} 텍스트 추출`}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {/* Review */}
      {status === 'review' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-semibold">
            추출 완료 ({preview.trim().split(/\s+/).length}단어) — 확인 후 사용하세요:
          </p>
          <textarea value={preview} onChange={e => setPreview(e.target.value)}
            className="w-full h-44 border-2 border-indigo-200 bg-indigo-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none leading-relaxed" />
          <button onClick={confirm}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-all">
            ✓ 이 텍스트로 사용하기
          </button>
        </div>
      )}

      {status === 'done' && (
        <button onClick={() => setStatus('review')} className="text-xs text-indigo-400 hover:underline">
          다시 편집하기
        </button>
      )}
    </div>
  );
}
