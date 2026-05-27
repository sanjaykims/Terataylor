import { supabase } from './supabase';

// ── Vocab ─────────────────────────────────────────────────────────────────────
export async function trackVocabResult(word: string, correct: boolean) {
  try {
    const { data } = await supabase
      .from('taylor_vocab_progress')
      .select('correct_count, wrong_count, streak')
      .eq('word', word)
      .maybeSingle();

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
  durationSeconds: number
) {
  try {
    if (durationSeconds < 10) return; // ignore accidental tab switches
    await supabase.from('taylor_study_sessions').insert({
      mode, feature, duration_seconds: Math.round(durationSeconds),
      started_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('tracker:session', e);
  }
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
  const { data } = await supabase
    .from('taylor_vocab_progress')
    .select('*')
    .order('wrong_count', { ascending: false });
  return (data ?? []) as VocabProgress[];
}

export async function fetchGameScores(limit = 30): Promise<GameScore[]> {
  const { data } = await supabase
    .from('taylor_game_scores')
    .select('*')
    .order('played_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as GameScore[];
}

export async function fetchStudySessions(limit = 50): Promise<StudySession[]> {
  const { data } = await supabase
    .from('taylor_study_sessions')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as StudySession[];
}
