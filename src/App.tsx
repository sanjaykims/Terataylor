import { useState, useEffect, useRef } from 'react';
import ShadowingPlayer from './components/ShadowingPlayer';
import VocabularyPanel from './components/VocabularyPanel';
import OpinionWriter from './components/OpinionWriter';
import GamesPanel from './components/GamesPanel';
import ProgressDashboard from './components/ProgressDashboard';
import ImageUploadInput from './components/ImageUploadInput';
import LessonScheduleWidget from './components/LessonScheduleWidget';
import LiteraryAnalysisWriter from './components/LiteraryAnalysisWriter';
import A2PhotoViewer from './components/A2PhotoViewer';
import BookReader from './components/BookReader';
import { trackSession } from './lib/tracker';
import { supabase } from './lib/supabase';
import {
  csGet, csSet, csSetJSON, csDel, csGetAppState, csSetBatch,
} from './lib/cloudStorage';
import { migrateChaptersFromLocalStorage } from './lib/chapterStorage';
import type { VocabItem } from './lib/types';
import { BOOKS, type BookId } from './data/syllabus';

type MainTab = 'a2' | 'v1' | 'progress';
type A2Tab   = 'reading' | 'shadowing' | 'vocabulary' | 'opinion' | 'games';
type V1Tab   = 'writing' | 'vocabulary' | 'games' | 'reading';

// ── One-time migration from localStorage → Supabase ───────────────────────
async function migrateFromLocalStorage(): Promise<void> {
  try {
    const flag = await csGet('_migrated');
    if (flag) return;
  } catch { return; }

  const entries: { key: string; value: string }[] = [];

  const map: [string, string][] = [
    ['v1_book',  'taylor_v1_book'],
    ['a2_text',  'taylor_a2_text'],
    ['a2_vocab', 'taylor_a2_vocab'],
    ['v1_text',  'taylor_v1_text'],
    ['v1_vocab', 'taylor_v1_vocab'],
  ];
  for (const [newKey, lsKey] of map) {
    const val = localStorage.getItem(lsKey);
    if (val) entries.push({ key: newKey, value: val });
  }

  // Essays
  const bookIds = ['edward', 'coraline'] as const;
  const promptIds = [
    'dynamic-character', 'symbolism', 'love-loss', 'response-journal',
    'mood-tone', 'compare-contrast', 'true-bravery',
  ];
  for (const bid of bookIds) {
    for (const pid of promptIds) {
      const val = localStorage.getItem(`taylor_essay_${bid}_${pid}`);
      if (val) entries.push({ key: `essay_${bid}_${pid}`, value: val });
    }
  }

  if (entries.length > 0) await csSetBatch(entries);

  // Chapters live in chapterStorage — delegate
  await migrateChaptersFromLocalStorage();

  await csSet('_migrated', '1');
}

export default function App() {
  const [appReady,  setAppReady]  = useState(false);
  const [mainTab,   setMainTab]   = useState<MainTab>('a2');
  const [a2Tab,     setA2Tab]     = useState<A2Tab>('shadowing');
  const [v1Tab,     setV1Tab]     = useState<V1Tab>('writing');
  const [showA2Input, setShowA2Input] = useState(true);
  const [showV1Input, setShowV1Input] = useState(true);

  // ── Content state (loaded from Supabase on mount) ───────────────────────
  const [v1Book,  setV1BookState]  = useState<BookId>('edward');
  const [a2Text,  setA2TextState]  = useState('');
  const [a2Vocab, setA2VocabState] = useState<VocabItem[] | null>(null);
  const [a2AudioUrl, setA2AudioUrl] = useState<string | null>(null);
  const [v1Text,  setV1TextState]  = useState('');
  const [v1Vocab, setV1VocabState] = useState<VocabItem[] | null>(null);

  // ── Load everything from Supabase on mount ──────────────────────────────
  useEffect(() => {
    migrateFromLocalStorage()
      .catch(() => {})
      .finally(() => {
        csGetAppState()
          .then(data => {
            if (data.v1_book)    setV1BookState(data.v1_book as BookId);
            if (data.a2_text)    setA2TextState(data.a2_text);
            if (data.a2_vocab)   { try { setA2VocabState(JSON.parse(data.a2_vocab)); } catch {} }
            if (data.v1_text)    setV1TextState(data.v1_text);
            if (data.v1_vocab)   { try { setV1VocabState(JSON.parse(data.v1_vocab)); } catch {} }
            if (data.a2_audio_url) setA2AudioUrl(data.a2_audio_url);
          })
          .catch(() => {})
          .finally(() => setAppReady(true));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persisting setters (fire-and-forget to Supabase) ────────────────────
  const setV1Book = (b: BookId) => {
    setV1BookState(b);
    csSet('v1_book', b).catch(() => {});
  };
  const setA2Text = (t: string) => {
    setA2TextState(t);
    t ? csSet('a2_text', t).catch(() => {}) : csDel('a2_text').catch(() => {});
  };
  const setA2Vocab = (v: VocabItem[] | null) => {
    setA2VocabState(v);
    v ? csSetJSON('a2_vocab', v).catch(() => {}) : csDel('a2_vocab').catch(() => {});
  };
  const setV1Text = (t: string) => {
    setV1TextState(t);
    t ? csSet('v1_text', t).catch(() => {}) : csDel('v1_text').catch(() => {});
  };
  const setV1Vocab = (v: VocabItem[] | null) => {
    setV1VocabState(v);
    v ? csSetJSON('v1_vocab', v).catch(() => {}) : csDel('v1_vocab').catch(() => {});
  };

  // ── Audio (Supabase Storage) ─────────────────────────────────────────────
  const [audioUploading, setAudioUploading] = useState(false);

  const handleAudioUpload = async (file: File) => {
    setAudioUploading(true);
    try {
      const { error } = await supabase.storage
        .from('taylor-audio')
        .upload('a2.mp3', file, { upsert: true, contentType: 'audio/mpeg' });
      if (error) throw error;
      const { data } = supabase.storage.from('taylor-audio').getPublicUrl('a2.mp3');
      const url = `${data.publicUrl}?t=${Date.now()}`; // cache-bust
      await csSet('a2_audio_url', data.publicUrl);
      setA2AudioUrl(url);
    } catch (err) {
      console.error('Audio upload failed:', err);
    } finally {
      setAudioUploading(false);
    }
  };

  const clearAudio = async () => {
    await supabase.storage.from('taylor-audio').remove(['a2.mp3']).catch(() => {});
    await csDel('a2_audio_url').catch(() => {});
    setA2AudioUrl(null);
  };

  // ── Session tracking ─────────────────────────────────────────────────────
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

  // ── Saved summary banners ────────────────────────────────────────────────
  const wc = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
  const a2TextSummary  = a2Text  ? `저장됨 (${wc(a2Text)}단어)` : undefined;
  const a2VocabSummary = a2Vocab?.length ? `저장됨 (${a2Vocab.length}개)` : undefined;
  const v1TextSummary  = v1Text  ? `저장됨 (${wc(v1Text)}단어)` : undefined;
  const v1VocabSummary = v1Vocab?.length ? `저장됨 (${v1Vocab.length}개)` : undefined;

  const bk = BOOKS[v1Book];

  // The two-column 원서 읽기 (EN/KO) benefits from the full PC width; other
  // single-column views stay at a comfortable reading width. Mobile is full
  // width either way.
  const wideLayout = mainTab === 'v1' && v1Tab === 'reading';
  const containerW = wideLayout ? 'max-w-7xl' : 'max-w-4xl';

  // ── Loading screen ───────────────────────────────────────────────────────
  if (!appReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-bold text-3xl mx-auto animate-pulse">
            T
          </div>
          <div className="text-sm text-gray-500">데이터 불러오는 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-10">
        <div className={`${containerW} mx-auto px-4 py-3 flex items-center justify-between transition-all`}>
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

      <div className={`${containerW} mx-auto px-4 py-5 space-y-5 transition-all`}>

        {/* ── MAIN TABS ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {([
            { id: 'a2',       icon: '🎧', label: 'A2 읽기/듣기', sub: '섀도잉 · 쓰기',       active: 'bg-indigo-600 shadow-indigo-200',  dim: 'text-indigo-200'  },
            { id: 'v1',       icon: '📖', label: 'V1 소설',       sub: '문학 분석 · 글쓰기',  active: 'bg-purple-600 shadow-purple-200',  dim: 'text-purple-200'  },
            { id: 'progress', icon: '📊', label: '성장 기록',      sub: '단어 · 점수',         active: 'bg-emerald-600 shadow-emerald-200', dim: 'text-emerald-200' },
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
                  <div className={`font-bold text-sm leading-tight ${active ? b.color : 'text-gray-700'}`}>{b.shortTitle}</div>
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
        {mainTab === 'a2' && a2Tab !== 'opinion' && a2Tab !== 'reading' && (
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
                <ImageUploadInput mode="text" label="📄 소설 지문 사진" hint="이번 주 읽을 페이지 — 여러 장 가능"
                  savedSummary={v1TextSummary} onClear={() => setV1Text('')} onExtracted={setV1Text} />
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
                { id: 'reading',    label: '📄 지문 보기' },
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
            {a2Tab === 'reading'    && <A2PhotoViewer />}
            {a2Tab === 'shadowing'  && (
              <ShadowingPlayer
                text={a2Text} audioUrl={a2AudioUrl}
                audioUploading={audioUploading}
                onAudioUpload={handleAudioUpload}
                onClearAudio={clearAudio}
              />
            )}
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
