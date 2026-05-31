import { useState, useEffect, useRef } from 'react';
import ShadowingPlayer from './components/ShadowingPlayer';
import VocabularyPanel from './components/VocabularyPanel';
import OpinionWriter from './components/OpinionWriter';
import GamesPanel from './components/GamesPanel';
import ProgressDashboard from './components/ProgressDashboard';
import ImageUploadInput from './components/ImageUploadInput';
import LessonScheduleWidget from './components/LessonScheduleWidget';
import LiteraryAnalysisWriter from './components/LiteraryAnalysisWriter';
import PdfTextExtractor from './components/PdfTextExtractor';
import BookReader from './components/BookReader';
import { trackSession } from './lib/tracker';
import { saveAudio, loadAudio, deleteAudio } from './lib/audioStorage';
import type { VocabItem } from './lib/types';
import { BOOKS, type BookId } from './data/syllabus';

type MainTab = 'a2' | 'v1' | 'progress';
type A2Tab   = 'shadowing' | 'vocabulary' | 'opinion' | 'games';
type V1Tab   = 'writing' | 'vocabulary' | 'games' | 'reading';

// ── localStorage helpers ───────────────────────────────────────────────────
function lsGet<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota */ }
}
function lsDel(key: string) { try { localStorage.removeItem(key); } catch { /* ignore */ } }

export default function App() {
  const [mainTab, setMainTab] = useState<MainTab>('a2');
  const [a2Tab,   setA2Tab]   = useState<A2Tab>('shadowing');
  const [v1Tab,   setV1Tab]   = useState<V1Tab>('writing');

  // ── V1 book selection ──────────────────────────────────────────────────
  const [v1Book, setV1BookState] = useState<BookId>(
    () => (lsGet<BookId>('taylor_v1_book') ?? 'edward')
  );
  const setV1Book = (b: BookId) => { setV1BookState(b); lsSet('taylor_v1_book', b); };

  // ── A2 content ─────────────────────────────────────────────────────────
  const [a2Text,     setA2TextState]  = useState<string>(() => lsGet<string>('taylor_a2_text') ?? '');
  const [a2Vocab,    setA2VocabState] = useState<VocabItem[] | null>(() => lsGet<VocabItem[]>('taylor_a2_vocab'));
  const [a2AudioUrl, setA2AudioUrl]   = useState<string | null>(null);
  const [showA2Input, setShowA2Input] = useState(true);

  // ── V1 content ─────────────────────────────────────────────────────────
  const [v1Text,  setV1TextState]  = useState<string>(() => lsGet<string>('taylor_v1_text') ?? '');
  const [v1Vocab, setV1VocabState] = useState<VocabItem[] | null>(() => lsGet<VocabItem[]>('taylor_v1_vocab'));
  const [showV1Input, setShowV1Input] = useState(true);

  // Persisting setters
  const setA2Text  = (t: string)            => { setA2TextState(t);  lsSet('taylor_a2_text',  t); };
  const setA2Vocab = (v: VocabItem[] | null) => { setA2VocabState(v); v ? lsSet('taylor_a2_vocab', v) : lsDel('taylor_a2_vocab'); };
  const setV1Text  = (t: string)            => { setV1TextState(t);  lsSet('taylor_v1_text',  t); };
  const setV1Vocab = (v: VocabItem[] | null) => { setV1VocabState(v); v ? lsSet('taylor_v1_vocab', v) : lsDel('taylor_v1_vocab'); };

  // ── Audio (IndexedDB) ──────────────────────────────────────────────────
  useEffect(() => {
    loadAudio('a2').then(file => { if (file) setA2AudioUrl(URL.createObjectURL(file)); });
  }, []);

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (a2AudioUrl) URL.revokeObjectURL(a2AudioUrl);
    await saveAudio('a2', file);
    setA2AudioUrl(URL.createObjectURL(file));
  };
  const clearAudio = async () => {
    if (a2AudioUrl) URL.revokeObjectURL(a2AudioUrl);
    await deleteAudio('a2');
    setA2AudioUrl(null);
  };

  // ── Session tracking ───────────────────────────────────────────────────
  const sessionStart   = useRef(Date.now());
  const currentMode    = useRef<'a2' | 'v1'>('a2');
  const currentFeature = useRef<string>('shadowing');

  const flushSession = () => {
    trackSession(currentMode.current, currentFeature.current, (Date.now() - sessionStart.current) / 1000);
    sessionStart.current = Date.now();
  };
  const switchTab = (mode: 'a2' | 'v1', feature: string) => {
    flushSession(); currentMode.current = mode; currentFeature.current = feature;
  };
  useEffect(() => {
    const h = () => flushSession();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Saved summaries for "already uploaded" banners ─────────────────────
  const wc = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
  const a2TextSummary  = a2Text  ? `저장됨 (${wc(a2Text)}단어)` : undefined;
  const a2VocabSummary = a2Vocab?.length ? `저장됨 (${a2Vocab.length}개)` : undefined;
  const v1TextSummary  = v1Text  ? `저장됨 (${wc(v1Text)}단어)` : undefined;
  const v1VocabSummary = v1Vocab?.length ? `저장됨 (${v1Vocab.length}개)` : undefined;

  const bk = BOOKS[v1Book];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">T</div>
            <div>
              <div className="font-bold text-gray-900 leading-tight">Taylor's English</div>
              <div className="text-xs text-gray-400">청담어학원 Tera 예습 도우미</div>
            </div>
          </div>
          <span className="text-sm text-gray-500 hidden sm:inline">안녕, Taylor! 👋</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">

        {/* ── MAIN TABS ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {([
            { id: 'a2',       icon: '🎧', label: 'A2 읽기/듣기', sub: '섀도잉 · 쓰기',  active: 'bg-indigo-600 shadow-indigo-200', dim: 'text-indigo-200' },
            { id: 'v1',       icon: '📖', label: 'V1 소설',       sub: '문학 분석 · 글쓰기', active: 'bg-purple-600 shadow-purple-200', dim: 'text-purple-200' },
            { id: 'progress', icon: '📊', label: '성장 기록',      sub: '단어 · 점수',    active: 'bg-emerald-600 shadow-emerald-200', dim: 'text-emerald-200' },
          ] as { id: MainTab; icon: string; label: string; sub: string; active: string; dim: string }[]).map(t => (
            <button key={t.id} onClick={() => { flushSession(); setMainTab(t.id); }}
              className={`py-4 rounded-2xl font-bold text-base transition-all flex flex-col items-center gap-1 ${
                mainTab === t.id ? `${t.active} text-white shadow-lg` : 'bg-white text-gray-500 hover:bg-gray-50 shadow-sm'
              }`}>
              <span className="text-2xl">{t.icon}</span>
              <span className="text-sm">{t.label}</span>
              <span className={`text-xs font-normal ${mainTab === t.id ? t.dim : 'text-gray-400'}`}>{t.sub}</span>
            </button>
          ))}
        </div>

        {/* ── V1: LESSON SCHEDULE WIDGET ────────────────────────────────── */}
        {mainTab === 'v1' && <LessonScheduleWidget />}

        {/* ── V1: BOOK SELECTOR ─────────────────────────────────────────── */}
        {mainTab === 'v1' && (
          <div className="grid grid-cols-2 gap-3">
            {(['edward', 'coraline'] as BookId[]).map(bid => {
              const b = BOOKS[bid];
              const active = v1Book === bid;
              return (
                <button key={bid} onClick={() => setV1Book(bid)}
                  className={`rounded-2xl p-4 text-left transition-all border-2 ${
                    active ? `${b.bg} ${b.border} shadow-md` : 'bg-white border-gray-100 hover:border-gray-200 shadow-sm'
                  }`}>
                  <div className="text-2xl mb-1">{b.emoji}</div>
                  <div className={`font-bold text-sm leading-tight ${active ? b.color : 'text-gray-700'}`}>
                    {b.shortTitle}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{b.author}</div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {b.themes.slice(0, 2).map(th => (
                      <span key={th} className={`text-xs px-1.5 py-0.5 rounded-md font-semibold ${
                        active ? `${b.badge} text-white` : 'bg-gray-100 text-gray-500'
                      }`}>{th}</span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ── A2 INPUT PANEL ────────────────────────────────────────────── */}
        {mainTab === 'a2' && a2Tab !== 'opinion' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button onClick={() => setShowA2Input(!showA2Input)}
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
              <span className="font-semibold text-gray-700 flex items-center gap-2">
                📸 교재 입력
                <span className="text-xs font-normal text-gray-400">지문 · 단어 · 오디오</span>
              </span>
              <span className="text-gray-400 text-sm">{showA2Input ? '▲ 접기' : '▼ 펼치기'}</span>
            </button>
            {showA2Input && (
              <div className="px-5 pb-5 space-y-4">
                <ImageUploadInput mode="text" label="📄 지문 사진" hint="교재 본문 페이지 — 여러 장 가능"
                  savedSummary={a2TextSummary} onClear={() => setA2Text('')} onExtracted={setA2Text} />
                <hr className="border-gray-100" />
                <ImageUploadInput mode="vocab" label="📚 단어 사진" hint="책에서 지정한 단어 목록 사진"
                  savedSummary={a2VocabSummary} onClear={() => setA2Vocab(null)} onExtracted={setA2Vocab} />
                <hr className="border-gray-100" />
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-gray-700">🎵 본문 오디오 (mp3)</div>
                  {a2AudioUrl ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between">
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">✓ 저장됨</span>
                      <button onClick={clearAudio} className="text-xs text-gray-400 hover:text-red-500 transition-colors">🗑 삭제</button>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <div className="border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all">
                        🎵 mp3 파일 클릭해서 선택
                      </div>
                      <input type="file" accept="audio/mp3,audio/mpeg,audio/*" className="hidden" onChange={handleAudioUpload} />
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── V1 INPUT PANEL ────────────────────────────────────────────── */}
        {mainTab === 'v1' && v1Tab !== 'writing' && v1Tab !== 'reading' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button onClick={() => setShowV1Input(!showV1Input)}
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
              <span className="font-semibold text-gray-700 flex items-center gap-2">
                {bk.emoji} {bk.shortTitle} 지문 입력
              </span>
              <span className="text-gray-400 text-sm">{showV1Input ? '▲ 접기' : '▼ 펼치기'}</span>
            </button>
            {showV1Input && (
              <div className="px-5 pb-5 space-y-4">
                {/* PDF extractor for Edward Tulane (has PDF); photo fallback for others */}
                {v1Book === 'edward' ? (
                  <PdfTextExtractor
                    bookId="edward"
                    savedSummary={v1TextSummary}
                    onClear={() => setV1Text('')}
                    onExtracted={setV1Text}
                  />
                ) : (
                  <ImageUploadInput mode="text" label="📄 소설 지문 사진" hint="이번 주 읽을 페이지 — 여러 장 가능"
                    savedSummary={v1TextSummary} onClear={() => setV1Text('')} onExtracted={setV1Text} />
                )}
                <hr className="border-gray-100" />
                <ImageUploadInput mode="vocab" label="📚 단어 사진" hint="소설에서 지정한 단어 목록 사진"
                  savedSummary={v1VocabSummary} onClear={() => setV1Vocab(null)} onExtracted={setV1Vocab} />
              </div>
            )}
          </div>
        )}

        {/* ── A2 CONTENT ────────────────────────────────────────────────── */}
        {mainTab === 'a2' && (
          <>
            <div className="flex bg-white rounded-2xl shadow-sm border border-gray-100 p-1 gap-1">
              {([
                { id: 'shadowing',  label: '🎧 섀도잉' },
                { id: 'vocabulary', label: '📚 단어장' },
                { id: 'opinion',    label: '✍️ 의견 쓰기' },
                { id: 'games',      label: '🎮 게임' },
              ] as { id: A2Tab; label: string }[]).map(t => (
                <button key={t.id} onClick={() => { switchTab('a2', t.id); setA2Tab(t.id); }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    a2Tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
                  }`}>{t.label}</button>
              ))}
            </div>
            {a2Tab === 'shadowing'  && <ShadowingPlayer text={a2Text} audioUrl={a2AudioUrl} />}
            {a2Tab === 'vocabulary' && <VocabularyPanel text={a2Text} vocab={a2Vocab} />}
            {a2Tab === 'opinion'    && <OpinionWriter />}
            {a2Tab === 'games'      && <GamesPanel text={a2Text} vocab={a2Vocab} />}
          </>
        )}

        {/* ── V1 CONTENT ────────────────────────────────────────────────── */}
        {mainTab === 'v1' && (
          <>
            <div className="flex bg-white rounded-2xl shadow-sm border border-gray-100 p-1 gap-1">
              {([
                { id: 'writing',    label: '📝 글쓰기' },
                { id: 'reading',    label: '📖 원서 읽기' },
                { id: 'vocabulary', label: '📚 단어장' },
                { id: 'games',      label: '🎮 게임' },
              ] as { id: V1Tab; label: string }[]).map(t => (
                <button key={t.id} onClick={() => { switchTab('v1', t.id); setV1Tab(t.id); }}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                    v1Tab === t.id ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
                  }`}>{t.label}</button>
              ))}
            </div>
            {v1Tab === 'writing'    && <LiteraryAnalysisWriter book={v1Book} />}
            {v1Tab === 'reading'    && <BookReader key={v1Book} bookId={v1Book} />}
            {v1Tab === 'vocabulary' && <VocabularyPanel text={v1Text} vocab={v1Vocab} />}
            {v1Tab === 'games'      && <GamesPanel text={v1Text} vocab={v1Vocab} />}
          </>
        )}

        {/* ── PROGRESS ──────────────────────────────────────────────────── */}
        {mainTab === 'progress' && <ProgressDashboard />}
      </div>
    </div>
  );
}
