import { supabase, SUPABASE_URL, SUPABASE_KEY } from './supabase';

// ── Vocab ─────────────────────────────────────────────────────────────────────
// Serialize writes PER WORD. Results are fire-and-forget (never awaited by the
// quiz), so two answers to the same word can otherwise read-modify-write
// concurrently and lose an increment. Chaining on a per-word promise makes each
// read see the previous write's result.
const vocabLocks = new Map<string, Promise<void>>();

export function trackVocabResult(word: string, correct: boolean): Promise<void> {
  const run = (vocabLocks.get(word) ?? Promise.resolve()).then(async () => {
    try {
      const { data, error } = await supabase
        .from('taylor_vocab_progress')
        .select('correct_count, wrong_count, streak')
        .eq('word', word)
        .maybeSingle();
      // A failed READ returns error with data=null. Do NOT treat that as "new
      // word" — writing {0,0} back would wipe a real history. Abort instead.
      if (error) return;
      const prev = data ?? { correct_count: 0, wrong_count: 0, streak: 0 };
      await supabase.from('taylor_vocab_progress').upsert({
        word,
        correct_count: prev.correct_count + (correct ? 1 : 0),
        wrong_count:   prev.wrong_count   + (correct ? 0 : 1),
        streak:        correct ? prev.streak + 1 : 0,
        last_seen:     new Date().toISOString(),
      }, { onConflict: 'word' });
    } catch (e) {
      console.warn('tracker:vocab', e);
    }
  });
  // Keep the chain but drop it from the map once settled (avoid unbounded growth).
  vocabLocks.set(word, run);
  void run.finally(() => { if (vocabLocks.get(word) === run) vocabLocks.delete(word); });
  return run;
}

// ── Game score ────────────────────────────────────────────────────────────────
export async function trackGameScore(
  gameType: 'space' | 'quiz' | 'scramble',
  score: number,
  opts: { wave?: number; correct?: number; total?: number; details?: Record<string, unknown> } = {}
) {
  try {
    await supabase.from('taylor_game_scores').insert({
      game_type: gameType,
      score,
      wave:    opts.wave    ?? null,
      correct: opts.correct ?? null,
      total:   opts.total   ?? null,
      details: opts.details ?? null,
      played_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('tracker:game', e);
  }
}

// ── Study session ─────────────────────────────────────────────────────────────
export async function trackSession(
  mode: 'a2' | 'v1',
  feature: string,
  durationSeconds: number,
  startedAtIso?: string,
  keepalive = false,
) {
  try {
    if (durationSeconds < 10) return; // ignore accidental tab switches
    const row = {
      mode, feature, duration_seconds: Math.round(durationSeconds),
      // The segment's true START (not the flush moment), so 학습 기록 shows
      // when studying actually began.
      started_at: startedAtIso ?? new Date().toISOString(),
    };
    if (keepalive) {
      // On page unload a normal supabase-js insert is aborted. A keepalive fetch
      // survives the teardown, so the final session isn't silently lost.
      await fetch(`${SUPABASE_URL}/rest/v1/taylor_study_sessions`, {
        method: 'POST',
        keepalive: true,
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(row),
      });
    } else {
      await supabase.from('taylor_study_sessions').insert(row);
    }
  } catch (e) {
    console.warn('tracker:session', e);
  }
}

// ── Live session engine ───────────────────────────────────────────────────────
// One "segment" is a contiguous stretch of studying one feature — and, for V1,
// one specific book+chapter. Segments end on tab switch, chapter switch, page
// hide, or unload, so every stored row says exactly WHAT was studied and for
// how long. The detail is encoded into the feature column ("reading:edward:ch6")
// so no schema change is needed; old rows ("reading") still parse fine.
const MAX_SEGMENT_S = 3 * 3600; // a forgotten open tab can't record a 20h "session"

let segMode: 'a2' | 'v1' = 'v1';
let segFeature = 'reading';
let segDetail: string | null = null; // e.g. "coraline:ch3"
let segStart = Date.now();
let paused = false; // true while the page is hidden or the Progress tab is open

export function sessionFlush(keepalive = false) {
  // While paused, no studying is happening — record nothing but keep the clock
  // reset so a later resume measures only visible time.
  if (paused) { segStart = Date.now(); return; }
  const startedAt = new Date(segStart).toISOString();
  const dur = Math.min((Date.now() - segStart) / 1000, MAX_SEGMENT_S);
  segStart = Date.now();
  const feature = segDetail ? `${segFeature}:${segDetail}` : segFeature;
  void trackSession(segMode, feature, dur, startedAt, keepalive);
}

export function sessionSwitch(mode: 'a2' | 'v1', feature: string) {
  sessionFlush();
  segMode = mode;
  segFeature = feature;
  segDetail = null; // the new view re-announces its own book/chapter
  paused = false;   // studying resumes on the new tab
  segStart = Date.now();
}

// Called by views that know their book/chapter (BookReader, the V1 vocab tab).
// A change closes the current segment so time is attributed per chapter.
export function sessionSetDetail(detail: string | null) {
  if (detail === segDetail) return;
  sessionFlush();
  segDetail = detail;
}

// Stop accruing study time (page hidden, or Progress dashboard open). The
// visible stretch so far is recorded; nothing accrues until resume.
export function sessionPause() {
  if (paused) return;
  sessionFlush();
  paused = true;
}

export function sessionResume() {
  paused = false;
  segStart = Date.now();
}

// ── Fetch progress data ───────────────────────────────────────────────────────
export interface VocabProgress {
  word: string; correct_count: number; wrong_count: number;
  streak: number; last_seen: string;
}
export interface GameScore {
  id: string; game_type: string; score: number;
  wave: number | null; correct: number | null; total: number | null;
  played_at: string;
}
export interface StudySession {
  mode: string; feature: string; duration_seconds: number; started_at: string;
}

export async function fetchVocabProgress(): Promise<VocabProgress[]> {
  const { data, error } = await supabase
    .from('taylor_vocab_progress')
    .select('*')
    .order('wrong_count', { ascending: false });
  if (error) throw error;
  return (data ?? []) as VocabProgress[];
}

// Limits raised so the dashboard's "total" figures cover a full term rather
// than a rolling window that made all-time stats shrink over time.
export async function fetchGameScores(limit = 2000): Promise<GameScore[]> {
  const { data, error } = await supabase
    .from('taylor_game_scores')
    .select('*')
    .order('played_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as GameScore[];
}

export async function fetchStudySessions(limit = 5000): Promise<StudySession[]> {
  const { data, error } = await supabase
    .from('taylor_study_sessions')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as StudySession[];
}
