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
import { migrateChaptersFromLocalStorage, loadChapterVocab, loadChapterCount } from './lib/chapterStorage';
import type { VocabItem } from './lib/types';
import { BOOKS, activeBookIds, defaultBookId, type BookId } from './data/syllabus';

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
  // Intentionally frozen to the two books that existed pre-migration — this
  // describes historical localStorage data, not the live book set, so it
  // does NOT need to grow as new books (e.g. bridge_c1/c2) are added.
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
  // of this week's class (or the first active book, if that one's archived).
  // Manual switching still works within a session.
  const [v1Book, setV1BookState] = useState<BookId>(defaultBookId());
  const [v1Vocab, setV1Vocab] = useState<Record<number, VocabItem[] | null>>({});
  const [v1VocabCh, setV1VocabCh] = useState<number>(1);
  // Novel books discover their chapter count from uploaded content; topical
  // (Bridge) books know it upfront from the syllabus. See BookInfo.lessonCount.
  const [v1ChapterCount, setV1ChapterCount] = useState<number>(6);
  const [v1StudiedWords, setV1StudiedWords] = useState<string[]>([]);

  const resolveChapterCount = async (b: BookId): Promise<number> => {
    return BOOKS[b]?.lessonCount ?? loadChapterCount(b);
  };
  const loadAllVocab = async (b: BookId, count: number): Promise<Record<number, VocabItem[] | null>> => {
    const chapters = Array.from({ length: count }, (_, i) => i + 1);
    const results = await Promise.all(chapters.map(ch => loadChapterVocab(b, ch).catch(() => null)));
    const out: Record<number, VocabItem[] | null> = {};
    chapters.forEach((ch, i) => { if (results[i]) out[ch] = results[i] as VocabItem[]; });
    return out;
  };

  // ── Load everything from Supabase on mount ──────────────────────────────
  // Mount-only by design: v1Book's initial value (set above via defaultBookId)
  // is what should load here; a later book switch is handled by setV1Book, not
  // by re-running this effect.
  useEffect(() => {
    migrateFromLocalStorage()
      .catch(() => {})
      .finally(async () => {
        try {
          const count = await resolveChapterCount(v1Book);
          setV1ChapterCount(count);
          setV1Vocab(await loadAllVocab(v1Book, count));
        } catch { /* ignore */ } finally {
          // csGetAppState primes the cloud-storage cache used across the app.
          try { await csGetAppState(); } catch { /* ignore */ }
          setAppReady(true);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persisting setters (fire-and-forget to Supabase) ────────────────────
  const setV1Book = (b: BookId) => {
    setV1BookState(b);
    setV1VocabCh(1);
    setV1StudiedWords([]);
    setV1Vocab({});
    csSet('v1_book', b).catch(() => {});
    const seq = ++v1BookSeqRef;
    resolveChapterCount(b).then(async count => {
      if (seq !== v1BookSeqRef) return;
      setV1ChapterCount(count);
      const vocab = await loadAllVocab(b, count);
      if (seq !== v1BookSeqRef) return;
      setV1Vocab(vocab);
    });
  };
  const setV1ChVocab = (ch: number, v: VocabItem[] | null) => {
    setV1Vocab(prev => ({ ...prev, [ch]: v }));
    const key = `chapter_${v1Book}_${ch}_vocab`;
    if (v) csSet(key, JSON.stringify(v)).catch(() => {});
    else csDel(key).catch(() => {});
  };
  // Mirror the current book in a ref so a late vocab callback from a just-
  // unmounted BookReader (book switch) can't drop old vocab into new slots.
  const v1BookRef = useRef(v1Book);
  useEffect(() => {
    v1BookRef.current = v1Book;
  }, [v1Book]);
  const handleV1VocabLoad = (vocab: VocabItem[], chapter: number, forBook: BookId) => {
    if (forBook !== v1BookRef.current) return;
    setV1Vocab(prev => ({ ...prev, [chapter]: vocab }));
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

  // Tab label reflects whichever book is currently active — "V1 소설" only
  // makes sense while a novel-kind book is what's actually being studied.
  const mainTabLabel = BOOKS[v1Book]?.lessonKind === 'topical' ? '이번 주 학습' : 'V1 소설';
  const MAIN_TABS: { id: MainTab; icon: IconName; label: string; preload: () => void }[] = [
    { id: 'v1', icon: 'book', label: mainTabLabel, preload: () => {
        import('./components/VocabularyPanel'); import('./components/GamesPanel'); import('./components/ImageUploadInput');
      } },
    { id: 'progress', icon: 'chart', label: '성장 기록', preload: () => { import('./components/ProgressDashboard'); } },
  ];

  const chLabel = (ch: number) => `Ch.${String(ch).padStart(2, '0')} 단어장`;

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
              {activeBookIds().map(bid => {
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
                { id: 'reading',    label: BOOKS[v1Book]?.hasListening ? '읽기·듣기' : '원서 읽기' },
                { id: 'vocabulary', label: '단어장' },
                { id: 'games',      label: '게임' },
              ] as { id: V1Tab; label: string }[]).map(t => (
                <button key={t.id} onClick={() => { if (t.id !== v1Tab) { sessionSwitch('v1', t.id); setV1Tab(t.id); } }}
                  className={`seg-btn ${v1Tab === t.id ? 'seg-btn-active' : ''}`}>{t.label}</button>
              ))}
            </div>

            {v1Tab === 'reading' && <Suspense fallback={<TabSpinner />}><BookReader key={v1Book} bookId={v1Book} onLessonVocabLoad={handleV1VocabLoad} /></Suspense>}

            {v1Tab === 'vocabulary' && (() => {
              const activeVocab = v1Vocab[v1VocabCh] ?? null;
              const activeSummary = activeVocab?.length ? `저장됨 (${activeVocab.length}개)` : undefined;
              return (
                <>
                  {/* Chapter selector — 3-col grid so any lesson count wraps cleanly on phones */}
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl"
                       style={{ background: 'var(--paper-3)', border: '1px solid var(--rule)' }}>
                    {Array.from({ length: v1ChapterCount }, (_, i) => i + 1).map(ch => (
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
                  vocab={v1Vocab[v1VocabCh] ?? null}
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
