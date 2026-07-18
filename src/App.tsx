import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import LessonScheduleWidget from './components/LessonScheduleWidget';
import Icon, { type IconName } from './components/Icon';

// Non-default-view components — loaded on demand to keep the initial bundle lean.
const BookReader        = lazy(() => import('./components/BookReader'));
const VocabularyPanel   = lazy(() => import('./components/VocabularyPanel'));
const GamesPanel        = lazy(() => import('./components/GamesPanel'));
const ProgressDashboard = lazy(() => import('./components/ProgressDashboard'));
const ImageUploadInput  = lazy(() => import('./components/ImageUploadInput'));

const TabSpinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-8 h-8 border-2 rounded-full animate-spin"
      style={{ borderColor: 'var(--rule-2)', borderTopColor: 'var(--accent)' }} />
  </div>
);

import { sessionFlush, sessionSwitch, sessionSetDetail, sessionPause, sessionResume } from './lib/tracker';
import { csGet, csSet, csDel, csGetAppState, csSetBatch } from './lib/cloudStorage';
import { migrateChaptersFromLocalStorage, loadChapterVocab } from './lib/chapterStorage';
import type { VocabItem } from './lib/types';
import { BOOKS, currentLesson, type BookId } from './data/syllabus';

type MainTab = 'v1' | 'progress';
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
    ['v1_text',  'taylor_v1_text'],
    ['v1_vocab', 'taylor_v1_vocab'],
  ];
  for (const [newKey, lsKey] of map) {
    const val = localStorage.getItem(lsKey);
    if (val) entries.push({ key: newKey, value: val });
  }

  // Essays
  const bookIds = ['edward', 'coraline'] as const;
  const promptIds = ['dynamic-character', 'symbolism', 'love-loss', 'response-journal', 'mood-tone', 'compare-contrast', 'true-bravery'];
  for (const bid of bookIds) {
    for (const pid of promptIds) {
      const val = localStorage.getItem(`taylor_essay_${bid}_${pid}`);
      if (val) entries.push({ key: `essay_${bid}_${pid}`, value: val });
    }
  }

  if (entries.length > 0) await csSetBatch(entries);
  await csSet('_migrated', '1');
  await migrateChaptersFromLocalStorage();
}

export default function App() {
  const [appReady, setAppReady] = useState(false);
  const [mainTab, setMainTab]   = useState<MainTab>('v1');
  const [v1Tab, setV1Tab]       = useState<V1Tab>('reading');

  // ── Content state ────────────────────────────────────────────────────────
  // The book follows the academy schedule: opening the app lands on the book
  // of this week's class. Manual switching still works within a session.
  const [v1Book, setV1BookState] = useState<BookId>(currentLesson().book);
  const [v1Vocab1, setV1Vocab1] = useState<VocabItem[] | null>(null);
  const [v1Vocab2, setV1Vocab2] = useState<VocabItem[] | null>(null);
  const [v1Vocab3, setV1Vocab3] = useState<VocabItem[] | null>(null);
  const [v1Vocab4, setV1Vocab4] = useState<VocabItem[] | null>(null);
  const [v1Vocab5, setV1Vocab5] = useState<VocabItem[] | null>(null);
  const [v1Vocab6, setV1Vocab6] = useState<VocabItem[] | null>(null);
  const [v1VocabCh, setV1VocabCh] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [v1StudiedWords, setV1StudiedWords] = useState<string[]>([]);

  // ── Load everything from Supabase on mount ──────────────────────────────
  useEffect(() => {
    migrateFromLocalStorage()
      .catch(() => {})
      .finally(async () => {
        try {
          const book = currentLesson().book;
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
        } catch { /* ignore */ } finally {
          // csGetAppState primes the cloud-storage cache used across the app.
          try { await csGetAppState(); } catch { /* ignore */ }
          setAppReady(true);
        }
      });
  }, []);

  // ── Persisting setters (fire-and-forget to Supabase) ────────────────────
  const setV1Book = (b: BookId) => {
    setV1BookState(b);
    setV1VocabCh(1);
    setV1StudiedWords([]);
    setV1Vocab1(null); setV1Vocab2(null); setV1Vocab3(null);
    setV1Vocab4(null); setV1Vocab5(null); setV1Vocab6(null);
    csSet('v1_book', b).catch(() => {});
    const seq = ++v1BookSeqRef;
    Promise.all([
      loadChapterVocab(b, 1).catch(() => null), loadChapterVocab(b, 2).catch(() => null),
      loadChapterVocab(b, 3).catch(() => null), loadChapterVocab(b, 4).catch(() => null),
      loadChapterVocab(b, 5).catch(() => null), loadChapterVocab(b, 6).catch(() => null),
    ]).then(([vc1, vc2, vc3, vc4, vc5, vc6]) => {
      if (seq !== v1BookSeqRef) return;
      if (vc1) setV1Vocab1(vc1 as VocabItem[]); if (vc2) setV1Vocab2(vc2 as VocabItem[]);
      if (vc3) setV1Vocab3(vc3 as VocabItem[]); if (vc4) setV1Vocab4(vc4 as VocabItem[]);
      if (vc5) setV1Vocab5(vc5 as VocabItem[]); if (vc6) setV1Vocab6(vc6 as VocabItem[]);
    });
  };
  const setV1ChVocab = (ch: 1 | 2 | 3 | 4 | 5 | 6, v: VocabItem[] | null) => {
    if (ch === 1) setV1Vocab1(v); else if (ch === 2) setV1Vocab2(v);
    else if (ch === 3) setV1Vocab3(v); else if (ch === 4) setV1Vocab4(v);
    else if (ch === 5) setV1Vocab5(v); else setV1Vocab6(v);
    const key = `chapter_${v1Book}_${ch}_vocab`;
    if (v) csSet(key, JSON.stringify(v)).catch(() => {});
    else csDel(key).catch(() => {});
  };
  // Mirror the current book in a ref so a late vocab callback from a just-
  // unmounted BookReader (book switch) can't drop old vocab into new slots.
  const v1BookRef = useRef(v1Book);
  v1BookRef.current = v1Book;
  const handleV1VocabLoad = (vocab: VocabItem[], chapter: number, forBook: BookId) => {
    if (forBook !== v1BookRef.current) return;
    if (chapter === 1) setV1Vocab1(vocab); else if (chapter === 2) setV1Vocab2(vocab);
    else if (chapter === 3) setV1Vocab3(vocab); else if (chapter === 4) setV1Vocab4(vocab);
    else if (chapter === 5) setV1Vocab5(vocab); else if (chapter === 6) setV1Vocab6(vocab);
  };

  // ── Session tracking (engine lives in lib/tracker) ───────────────────────
  useEffect(() => {
    const vis = () => (document.hidden ? sessionPause() : sessionResume());
    const unload = () => sessionFlush(true);
    window.addEventListener('pagehide', unload);
    window.addEventListener('beforeunload', unload);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('pagehide', unload);
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

  useEffect(() => {
    if (mainTab === 'v1' && v1Tab === 'vocabulary') sessionSetDetail(`${v1Book}:ch${v1VocabCh}`);
  }, [mainTab, v1Tab, v1Book, v1VocabCh]);

  const containerW = 'max-w-[1120px]';

  if (!appReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div style={{ display: 'grid', gap: 14, placeItems: 'center' }}>
          <span style={{ width: 16, height: 16, background: 'var(--accent)', borderRadius: 3, transform: 'rotate(45deg)' }} className="animate-pulse" />
          <div className="text-sm text-muted">데이터 불러오는 중…</div>
        </div>
      </div>
    );
  }

  const MAIN_TABS: { id: MainTab; icon: IconName; label: string; preload: () => void }[] = [
    { id: 'v1', icon: 'book', label: 'V1 소설', preload: () => {
        import('./components/VocabularyPanel'); import('./components/GamesPanel'); import('./components/ImageUploadInput');
      } },
    { id: 'progress', icon: 'chart', label: '성장 기록', preload: () => { import('./components/ProgressDashboard'); } },
  ];

  const chLabel = (ch: number) => `Ch.0${ch} 단어장`;

  return (
    <div className="min-h-screen">
      {/* Topbar — warm paper, hairline rule, Newsreader wordmark + mono eyebrow */}
      <header className="sticky top-0 z-20" style={{ background: 'var(--paper)', borderBottom: '1px solid var(--rule)' }}>
        <div className={`${containerW} mx-auto px-6`} style={{ display: 'flex', alignItems: 'center', gap: 16, minHeight: 68 }}>
          <span style={{ width: 15, height: 15, background: 'var(--accent)', borderRadius: 3, transform: 'rotate(45deg)', flex: '0 0 auto' }} />
          <div className="min-w-0" style={{ flex: 1 }}>
            <div className="eyebrow" style={{ fontSize: '0.6rem' }}>청담어학원 Tera</div>
            <h1 className="font-display" style={{ fontSize: 'var(--text-md)', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1 }}>Taylor's English</h1>
          </div>
          <span className="text-muted hidden md:inline" style={{ fontSize: '0.85rem' }}>안녕, 태윤아</span>
        </div>
        <div className={`${containerW} mx-auto px-6`}>
          <div className="hearth-tabs" role="tablist">
            {MAIN_TABS.map(t => (
              <button key={t.id} role="tab" type="button" aria-selected={mainTab === t.id} className="hearth-tab"
                onClick={() => {
                  if (t.id === mainTab) return;
                  if (t.id === 'progress') sessionPause();
                  else sessionSwitch('v1', v1Tab);
                  setMainTab(t.id);
                }}
                onMouseEnter={t.preload} onTouchStart={t.preload}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Icon name={t.icon} className="h-4 w-4" />{t.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className={`${containerW} mx-auto px-6 py-6 space-y-5`}>

        {/* ── V1 ─────────────────────────────────────────────────────────── */}
        {mainTab === 'v1' && (
          <>
            <LessonScheduleWidget />

            {/* Book selector */}
            <div className="grid grid-cols-2 gap-3">
              {(['edward', 'coraline'] as BookId[]).map(bid => {
                const b = BOOKS[bid];
                const active = v1Book === bid;
                return (
                  <button key={bid} onClick={() => setV1Book(bid)}
                    className="surface p-4 text-left transition-[border-color,transform] duration-200"
                    style={active ? { borderColor: 'var(--accent)', boxShadow: 'inset 0 0 0 1px var(--accent)' } : { opacity: 0.9 }}>
                    <div className="eyebrow">{active ? '학습 중' : '선택'}</div>
                    <div className="font-display" style={{ fontSize: 'var(--text-md)', fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--ink)', marginTop: 2 }}>{b.shortTitle}</div>
                    <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>{b.author}</div>
                    <div className="flex flex-wrap gap-1.5" style={{ marginTop: 10 }}>
                      {b.themes.slice(0, 2).map(th => <span key={th} className="chip" style={{ fontSize: '0.72rem' }}>{th}</span>)}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* V1 sub-tabs */}
            <div className="seg">
              {([
                { id: 'reading',    label: '원서 읽기' },
                { id: 'vocabulary', label: '단어장' },
                { id: 'games',      label: '게임' },
              ] as { id: V1Tab; label: string }[]).map(t => (
                <button key={t.id} onClick={() => { if (t.id !== v1Tab) { sessionSwitch('v1', t.id); setV1Tab(t.id); } }}
                  className={`seg-btn ${v1Tab === t.id ? 'seg-btn-active' : ''}`}>{t.label}</button>
              ))}
            </div>

            {v1Tab === 'reading' && <Suspense fallback={<TabSpinner />}><BookReader key={v1Book} bookId={v1Book} onLessonVocabLoad={handleV1VocabLoad} /></Suspense>}

            {v1Tab === 'vocabulary' && (() => {
              const vocabByChapter: Record<number, VocabItem[] | null> = { 1: v1Vocab1, 2: v1Vocab2, 3: v1Vocab3, 4: v1Vocab4, 5: v1Vocab5, 6: v1Vocab6 };
              const activeVocab = vocabByChapter[v1VocabCh];
              const activeSummary = activeVocab?.length ? `저장됨 (${activeVocab.length}개)` : undefined;
              return (
                <>
                  {/* Chapter selector — real 3-col grid so 6 chapters wrap to two rows on phones */}
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl"
                       style={{ background: 'var(--paper-3)', border: '1px solid var(--rule)' }}>
                    {([1, 2, 3, 4, 5, 6] as const).map(ch => (
                      <button key={ch} onClick={() => { setV1VocabCh(ch); setV1StudiedWords([]); }}
                        className={`seg-btn text-center justify-center ${v1VocabCh === ch ? 'seg-btn-active' : ''}`}>
                        {chLabel(ch)}
                      </button>
                    ))}
                  </div>
                  <Suspense fallback={<TabSpinner />}>
                    <div className="surface p-4">
                      <ImageUploadInput
                        key={`vocab-upload-${v1Book}-ch${v1VocabCh}`}
                        mode="vocab"
                        label={`${chLabel(v1VocabCh)} 사진`}
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
                    v1VocabCh === 1 ? v1Vocab1 : v1VocabCh === 2 ? v1Vocab2 : v1VocabCh === 3 ? v1Vocab3 :
                    v1VocabCh === 4 ? v1Vocab4 : v1VocabCh === 5 ? v1Vocab5 : v1Vocab6
                  }
                  selectedWords={v1StudiedWords}
                />
              </Suspense>
            )}
          </>
        )}

        {/* ── PROGRESS ─────────────────────────────────────────────────────── */}
        {mainTab === 'progress' && <Suspense fallback={<TabSpinner />}><ProgressDashboard /></Suspense>}
      </div>
    </div>
  );
}
