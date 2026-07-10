import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import LessonScheduleWidget from './components/LessonScheduleWidget';
import BookReader from './components/BookReader';

// Non-default-view components — loaded on demand to keep the initial bundle lean.
const ShadowingPlayer   = lazy(() => import('./components/ShadowingPlayer'));
const VocabularyPanel   = lazy(() => import('./components/VocabularyPanel'));
const OpinionWriter     = lazy(() => import('./components/OpinionWriter'));
const GamesPanel        = lazy(() => import('./components/GamesPanel'));
const ProgressDashboard = lazy(() => import('./components/ProgressDashboard'));
const ImageUploadInput  = lazy(() => import('./components/ImageUploadInput'));
const A2PhotoViewer     = lazy(() => import('./components/A2PhotoViewer'));

const TabSpinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
  </div>
);
import { sessionFlush, sessionSwitch, sessionSetDetail, sessionPause, sessionResume } from './lib/tracker';
import { supabase } from './lib/supabase';
import {
  csGet, csSet, csSetJSON, csDel, csGetAppState, csSetBatch,
} from './lib/cloudStorage';
import { migrateChaptersFromLocalStorage, loadChapterVocab } from './lib/chapterStorage';
import type { VocabItem } from './lib/types';
import { BOOKS, currentLesson, type BookId } from './data/syllabus';

type MainTab = 'a2' | 'v1' | 'progress';
type A2Tab   = 'reading' | 'shadowing' | 'vocabulary' | 'opinion' | 'games';
type V1Tab   = 'reading' | 'vocabulary' | 'games';

// Bumped on every V1 book switch; a late vocab load checks it before writing.
let v1BookSeqRef = 0;

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

  // Mark migrated NOW, before the chapter step. If chapters fail, the flag still
  // stops a re-run from re-pushing these legacy app-state values over data the
  // user has since changed in the cloud. Chapters are re-derivable via re-upload.
  await csSet('_migrated', '1');

  // Chapters live in chapterStorage — delegate
  await migrateChaptersFromLocalStorage();
}

export default function App() {
  const [appReady,  setAppReady]  = useState(false);
  const [mainTab,   setMainTab]   = useState<MainTab>('v1');
  const [a2Tab,     setA2Tab]     = useState<A2Tab>('shadowing');
  const [v1Tab,     setV1Tab]     = useState<V1Tab>('reading');
  const [showA2Input, setShowA2Input] = useState(true);

  // ── Content state (loaded from Supabase on mount) ───────────────────────
  // The book follows the academy schedule: opening the app lands on the book
  // of this week's class (Edward through 7/8, Coraline from 7/9). Manual
  // switching still works within a session.
  const [v1Book,   setV1BookState]  = useState<BookId>(currentLesson().book);
  const [a2Text,   setA2TextState]  = useState('');
  const [a2Vocab,  setA2VocabState] = useState<VocabItem[] | null>(null);
  const [a2AudioUrl, setA2AudioUrl] = useState<string | null>(null);
  const [v1Vocab1, setV1Vocab1]     = useState<VocabItem[] | null>(null);
  const [v1Vocab2, setV1Vocab2]     = useState<VocabItem[] | null>(null);
  const [v1Vocab3, setV1Vocab3]     = useState<VocabItem[] | null>(null);
  const [v1Vocab4, setV1Vocab4]     = useState<VocabItem[] | null>(null);
  const [v1Vocab5, setV1Vocab5]     = useState<VocabItem[] | null>(null);
  const [v1Vocab6, setV1Vocab6]     = useState<VocabItem[] | null>(null);
  const [v1VocabCh, setV1VocabCh]   = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [a2StudiedWords, setA2StudiedWords] = useState<string[]>([]);
  const [v1StudiedWords, setV1StudiedWords] = useState<string[]>([]);

  // ── Load everything from Supabase on mount ──────────────────────────────
  useEffect(() => {
    migrateFromLocalStorage()
      .catch(() => {})
      .finally(async () => {
        try {
          const data = await csGetAppState();
          // Deliberately NOT restoring data.v1_book: the schedule decides which
          // book the app opens on, so it advances by itself between terms.
          const book = currentLesson().book;
          if (data.a2_text)      setA2TextState(data.a2_text);
          if (data.a2_vocab) {
            try {
              setA2VocabState(JSON.parse(data.a2_vocab));
            } catch {
              // Ignore malformed legacy cache and continue loading the app.
            }
          }
          // Cache-bust: Storage serves the public object with a long max-age, so
          // a re-uploaded a2.mp3 (same URL) would otherwise play last week's file.
          if (data.a2_audio_url) setA2AudioUrl(`${data.a2_audio_url}?t=${Date.now()}`);
          const [vc1, vc2, vc3, vc4, vc5, vc6] = await Promise.all([
            loadChapterVocab(book, 1).catch(() => null),
            loadChapterVocab(book, 2).catch(() => null),
            loadChapterVocab(book, 3).catch(() => null),
            loadChapterVocab(book, 4).catch(() => null),
            loadChapterVocab(book, 5).catch(() => null),
            loadChapterVocab(book, 6).catch(() => null),
          ]);
          if (vc1) setV1Vocab1(vc1 as VocabItem[]);
          if (vc2) setV1Vocab2(vc2 as VocabItem[]);
          if (vc3) setV1Vocab3(vc3 as VocabItem[]);
          if (vc4) setV1Vocab4(vc4 as VocabItem[]);
          if (vc5) setV1Vocab5(vc5 as VocabItem[]);
          if (vc6) setV1Vocab6(vc6 as VocabItem[]);
        } catch {
          // ignore
        } finally {
          setAppReady(true);
        }
      });
  }, []);

  // ── Persisting setters (fire-and-forget to Supabase) ────────────────────
  const setV1Book = (b: BookId) => {
    setV1BookState(b);
    setV1VocabCh(1);
    setV1StudiedWords([]);   // don't carry one book's studied words into the other's games
    setV1Vocab1(null);
    setV1Vocab2(null);
    setV1Vocab3(null);
    setV1Vocab4(null);
    setV1Vocab5(null);
    setV1Vocab6(null);
    csSet('v1_book', b).catch(() => {});
    // Generation guard: a quick Coraline→Edward switch must not let the slower
    // first request land its vocab under the second book's slots.
    const seq = ++v1BookSeqRef;
    Promise.all([
      loadChapterVocab(b, 1).catch(() => null),
      loadChapterVocab(b, 2).catch(() => null),
      loadChapterVocab(b, 3).catch(() => null),
      loadChapterVocab(b, 4).catch(() => null),
      loadChapterVocab(b, 5).catch(() => null),
      loadChapterVocab(b, 6).catch(() => null),
    ]).then(([vc1, vc2, vc3, vc4, vc5, vc6]) => {
      if (seq !== v1BookSeqRef) return; // a newer book switch superseded this
      if (vc1) setV1Vocab1(vc1 as VocabItem[]);
      if (vc2) setV1Vocab2(vc2 as VocabItem[]);
      if (vc3) setV1Vocab3(vc3 as VocabItem[]);
      if (vc4) setV1Vocab4(vc4 as VocabItem[]);
      if (vc5) setV1Vocab5(vc5 as VocabItem[]);
      if (vc6) setV1Vocab6(vc6 as VocabItem[]);
    });
  };
  const setA2Text = (t: string) => {
    setA2TextState(t);
    if (t) csSet('a2_text', t).catch(() => {});
    else csDel('a2_text').catch(() => {});
  };
  const setA2Vocab = (v: VocabItem[] | null) => {
    setA2VocabState(v);
    setA2StudiedWords([]); // a new/cleared vocab list invalidates the old studied set
    if (v) csSetJSON('a2_vocab', v).catch(() => {});
    else csDel('a2_vocab').catch(() => {});
  };
  const setV1ChVocab = (ch: 1 | 2 | 3 | 4 | 5 | 6, v: VocabItem[] | null) => {
    if (ch === 1) setV1Vocab1(v);
    else if (ch === 2) setV1Vocab2(v);
    else if (ch === 3) setV1Vocab3(v);
    else if (ch === 4) setV1Vocab4(v);
    else if (ch === 5) setV1Vocab5(v);
    else setV1Vocab6(v);
    const key = `chapter_${v1Book}_${ch}_vocab`;
    if (v) csSet(key, JSON.stringify(v)).catch(() => {});
    else csDel(key).catch(() => {});
  };
  // Mirror the current book in a ref so a late vocab callback from a just-
  // unmounted BookReader (book switch) can't drop the old book's vocab into the
  // new book's slots.
  const v1BookRef = useRef(v1Book);
  v1BookRef.current = v1Book;
  const handleV1VocabLoad = (vocab: VocabItem[], chapter: number, forBook: BookId) => {
    if (forBook !== v1BookRef.current) return;
    if (chapter === 1) setV1Vocab1(vocab);
    else if (chapter === 2) setV1Vocab2(vocab);
    else if (chapter === 3) setV1Vocab3(vocab);
    else if (chapter === 4) setV1Vocab4(vocab);
    else if (chapter === 5) setV1Vocab5(vocab);
    else if (chapter === 6) setV1Vocab6(vocab);
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

  // ── Session tracking (engine lives in lib/tracker) ───────────────────────
  useEffect(() => {
    // Pause (not flush) while hidden so a phone on the home screen or an
    // overnight background tab records no time — and a close WHILE hidden can't
    // dump the hidden hours as study time.
    const vis = () => (document.hidden ? sessionPause() : sessionResume());
    const unload = () => sessionFlush(true); // keepalive so the final row survives teardown
    window.addEventListener('pagehide', unload);   // fires reliably on mobile
    window.addEventListener('beforeunload', unload);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('pagehide', unload);
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

  // The V1 vocab tab studies a specific book+chapter — attribute time to it.
  useEffect(() => {
    if (mainTab === 'v1' && v1Tab === 'vocabulary') {
      sessionSetDetail(`${v1Book}:ch${v1VocabCh}`);
    }
  }, [mainTab, v1Tab, v1Book, v1VocabCh]);

  // ── Saved summary banners ────────────────────────────────────────────────
  const wc = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
  const a2TextSummary  = a2Text  ? `저장됨 (${wc(a2Text)}단어)` : undefined;
  const a2VocabSummary = a2Vocab?.length ? `저장됨 (${a2Vocab.length}개)` : undefined;

  const containerW = 'max-w-[1600px]';

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
            {
              id: 'a2', icon: '🎧', label: 'A2 읽기/듣기', sub: '섀도잉 · 쓰기',
              active: 'bg-indigo-600 shadow-indigo-200', dim: 'text-indigo-200',
              preload: () => {
                import('./components/ShadowingPlayer');
                import('./components/VocabularyPanel');
                import('./components/OpinionWriter');
                import('./components/GamesPanel');
                import('./components/ImageUploadInput');
                import('./components/A2PhotoViewer');
              },
            },
            {
              id: 'v1', icon: '📖', label: 'V1 소설', sub: '원서읽기 · 단어장',
              active: 'bg-purple-600 shadow-purple-200', dim: 'text-purple-200',
              preload: () => {
                import('./components/VocabularyPanel');
                import('./components/GamesPanel');
                import('./components/ImageUploadInput');
              },
            },
            {
              id: 'progress', icon: '📊', label: '성장 기록', sub: '단어 · 점수',
              active: 'bg-emerald-600 shadow-emerald-200', dim: 'text-emerald-200',
              preload: () => { import('./components/ProgressDashboard'); },
            },
          ] as { id: MainTab; icon: string; label: string; sub: string; active: string; dim: string; preload: () => void }[]).map(t => (
            <button key={t.id}
              onClick={() => {
                if (t.id === mainTab) return; // re-tapping the active tab is a no-op
                // Browsing the dashboard is not studying — pause the clock.
                if (t.id === 'progress') sessionPause();
                else sessionSwitch(t.id, t.id === 'a2' ? a2Tab : v1Tab);
                setMainTab(t.id);
              }}
              onMouseEnter={t.preload}
              onTouchStart={t.preload}
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
                <Suspense fallback={<TabSpinner />}>
                  <ImageUploadInput mode="text" label="📄 지문 사진" hint="교재 본문 페이지 — 여러 장 가능"
                    savedSummary={a2TextSummary} onClear={() => setA2Text('')} onExtracted={setA2Text} />
                  <hr className="border-gray-100" />
                  <ImageUploadInput mode="vocab" label="📚 단어 사진" hint="책에서 지정한 단어 목록 사진"
                    savedSummary={a2VocabSummary} onClear={() => setA2Vocab(null)} onExtracted={setA2Vocab} />
                </Suspense>
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
                <button key={t.id} onClick={() => { if (t.id !== a2Tab) { sessionSwitch('a2', t.id); setA2Tab(t.id); } }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    a2Tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
                  }`}>{t.label}</button>
              ))}
            </div>
            {a2Tab === 'reading'    && <Suspense fallback={<TabSpinner />}><A2PhotoViewer /></Suspense>}
            {a2Tab === 'shadowing'  && (
              <Suspense fallback={<TabSpinner />}>
                <ShadowingPlayer
                  text={a2Text} audioUrl={a2AudioUrl}
                  audioUploading={audioUploading}
                  onAudioUpload={handleAudioUpload}
                  onClearAudio={clearAudio}
                />
              </Suspense>
            )}
            {a2Tab === 'vocabulary' && <Suspense fallback={<TabSpinner />}><VocabularyPanel text={a2Text} vocab={a2Vocab} onStudiedChange={setA2StudiedWords} onVocabUpdate={setA2Vocab} /></Suspense>}
            {a2Tab === 'opinion'    && <Suspense fallback={<TabSpinner />}><OpinionWriter /></Suspense>}
            {a2Tab === 'games'      && <Suspense fallback={<TabSpinner />}><GamesPanel text={a2Text} vocab={a2Vocab} selectedWords={a2StudiedWords} /></Suspense>}
          </>
        )}

        {/* ── V1 CONTENT ────────────────────────────────────────────────── */}
        {mainTab === 'v1' && (
          <>
            <div className="flex bg-white rounded-2xl shadow-sm border border-gray-100 p-1 gap-1">
              {([
                { id: 'reading',    label: '📖 원서 읽기' },
                { id: 'vocabulary', label: '📚 단어장' },
                { id: 'games',      label: '🎮 게임' },
              ] as { id: V1Tab; label: string }[]).map(t => (
                <button key={t.id} onClick={() => { if (t.id !== v1Tab) { sessionSwitch('v1', t.id); setV1Tab(t.id); } }}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                    v1Tab === t.id ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
                  }`}>{t.label}</button>
              ))}
            </div>
            {v1Tab === 'reading' && <BookReader key={v1Book} bookId={v1Book} onLessonVocabLoad={handleV1VocabLoad} />}
            {v1Tab === 'vocabulary' && (() => {
              const vocabByChapter: Record<number, VocabItem[] | null> = {
                1: v1Vocab1, 2: v1Vocab2, 3: v1Vocab3,
                4: v1Vocab4, 5: v1Vocab5, 6: v1Vocab6,
              };
              const activeVocab = vocabByChapter[v1VocabCh];
              const activeSummary = activeVocab?.length ? `저장됨 (${activeVocab.length}개)` : undefined;
              const chLabel = (ch: number) => `Ch.0${ch} 단어장`;
              return (
                <>
                  {/* Chapter selector — two rows of 3 */}
                  <div className="grid grid-cols-3 gap-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-1">
                    {([1, 2, 3, 4, 5, 6] as const).map(ch => (
                      <button key={ch}
                        onClick={() => { setV1VocabCh(ch); setV1StudiedWords([]); }}
                        className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                          v1VocabCh === ch ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
                        }`}>
                        {chLabel(ch)}
                      </button>
                    ))}
                  </div>
                  {/* Per-chapter vocab photo upload + panel */}
                  <Suspense fallback={<TabSpinner />}>
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                      <ImageUploadInput
                        key={`vocab-upload-${v1Book}-ch${v1VocabCh}`}
                        mode="vocab"
                        label={`📚 ${chLabel(v1VocabCh)} 사진`}
                        hint="단어장 사진을 올리면 자동으로 목록이 만들어져요"
                        savedSummary={activeSummary}
                        onClear={() => setV1ChVocab(v1VocabCh, null)}
                        onExtracted={vocab => setV1ChVocab(v1VocabCh, vocab)}
                      />
                    </div>
                    <VocabularyPanel
                      key={`vocab-panel-${v1Book}-ch${v1VocabCh}`}
                      text=""
                      vocab={activeVocab}
                      onStudiedChange={setV1StudiedWords}
                      onVocabUpdate={vocab => setV1ChVocab(v1VocabCh, vocab)}
                    />
                  </Suspense>
                </>
              );
            })()}
            {v1Tab === 'games' && (
              <Suspense fallback={<TabSpinner />}>
                <GamesPanel
                  text=""
                  vocab={
                    v1VocabCh === 1 ? v1Vocab1 :
                    v1VocabCh === 2 ? v1Vocab2 :
                    v1VocabCh === 3 ? v1Vocab3 :
                    v1VocabCh === 4 ? v1Vocab4 :
                    v1VocabCh === 5 ? v1Vocab5 :
                    v1Vocab6
                  }
                  selectedWords={v1StudiedWords}
                />
              </Suspense>
            )}
          </>
        )}

        {/* ── PROGRESS ──────────────────────────────────────────────────── */}
        {mainTab === 'progress' && <Suspense fallback={<TabSpinner />}><ProgressDashboard /></Suspense>}
      </div>
    </div>
  );
}
