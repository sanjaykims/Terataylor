import { useEffect, useState } from 'react';
import {
  fetchVocabProgress, fetchGameScores, fetchStudySessions,
} from '../lib/tracker';
import type { VocabProgress, GameScore, StudySession } from '../lib/tracker';
import Icon, { type IconName } from './Icon';
import { BOOKS } from '../data/syllabus';

// Labels are plain text; icons live in a separate map so the two are styled
// independently (no emoji baked into a string, then split back off with
// .split(' ')[0]).
const GAME_LABELS: Record<string, string> = { space: '우주게임', quiz: '단어퀴즈', scramble: '문장퍼즐' };
const FEATURE_LABELS: Record<string, string> = {
  reading: '원서 읽기', shadowing: '섀도잉', vocabulary: '단어장',
  opinion: '의견쓰기', story: '스토리쓰기', games: '게임',
};
const FEATURE_ICONS: Record<string, IconName> = {
  reading: 'book', shadowing: 'headphones', vocabulary: 'book',
  opinion: 'document', story: 'document', games: 'target',
};
// Derived from BOOKS so archived/new books resolve automatically — no
// separate list to keep in sync.
const BOOK_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(BOOKS).map(([id, b]) => [id, b.shortTitle]),
);

// Sessions store detail inside the feature column: "reading:coraline:ch3".
// Legacy rows are just "reading" — both shapes parse here.
function parseFeature(feature: string): { base: string; where: string | null } {
  const [base, book, ch] = feature.split(':');
  if (book && BOOK_LABELS[book]) {
    const n = parseInt((ch ?? '').replace(/\D/g, ''), 10);
    const chLabel = Number.isFinite(n) ? ` Ch.${String(n).padStart(2, '0')}` : '';
    return { base, where: `${BOOK_LABELS[book]}${chLabel}` };
  }
  return { base: feature, where: null };
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}초`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분`;
  return `${Math.floor(seconds / 3600)}시간 ${Math.floor((seconds % 3600) / 60)}분`;
}

// Always Korea time (Asia/Seoul), regardless of the viewing device's timezone.
const KST_DATE = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short',
});
const KST_TIME = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
});

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${KST_DATE.format(d)} ${KST_TIME.format(d)}`;
}

// "7/5 (토) 19:39 ~ 20:31" — when the study stretch started and ended, in KST.
function formatSessionWhen(startedIso: string, durationSeconds: number) {
  const start = new Date(startedIso);
  const end = new Date(start.getTime() + durationSeconds * 1000);
  const range = durationSeconds >= 60 ? ` ~ ${KST_TIME.format(end)}` : '';
  return `${KST_DATE.format(start)} ${KST_TIME.format(start)}${range}`;
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
    </div>
  );
}

export default function ProgressDashboard() {
  const [vocab, setVocab] = useState<VocabProgress[]>([]);
  const [scores, setScores] = useState<GameScore[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState<'overview' | 'vocab' | 'games' | 'sessions'>('overview');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [v, g, s] = await Promise.all([fetchVocabProgress(), fetchGameScores(), fetchStudySessions()]);
      setVocab(v); setScores(g); setSessions(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : '기록을 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="text-center py-16 space-y-3">
      <Icon name="chart" className="h-9 w-9 mx-auto text-violet-400 animate-pulse" />
      <div className="text-gray-500 font-medium">기록 불러오는 중...</div>
    </div>
  );

  if (error) return (
    <div className="text-center py-16 space-y-4">
      <div className="text-red-500 font-semibold">기록을 불러오지 못했어요.</div>
      <div className="text-xs text-muted">{error}</div>
      <button onClick={load} className="btn-primary px-4 py-2 text-sm">
        다시 시도
      </button>
    </div>
  );

  // ── Computed stats ──────────────────────────────────────────────────────────
  const totalWords = vocab.length;
  const masteredWords = vocab.filter(v => v.correct_count >= 3 && v.wrong_count === 0).length;
  const weakWords = vocab.filter(v => v.wrong_count > v.correct_count).slice(0, 5);
  const totalGames = scores.length;
  const bestScore = scores.length ? Math.max(...scores.map(s => s.score)) : 0;
  const totalStudySecs = sessions.reduce((s, r) => s + r.duration_seconds, 0);
  const recentGames = scores.slice(0, 8);
  const maxRecentScore = recentGames.length ? Math.max(...recentGames.map(s => s.score)) : 1;

  // Group by the base feature so "reading:coraline:ch3" rolls up into 원서 읽기.
  const featureTime = sessions.reduce<Record<string, number>>((acc, s) => {
    const base = parseFeature(s.feature).base;
    acc[base] = (acc[base] ?? 0) + s.duration_seconds;
    return acc;
  }, {});

  const SECTIONS = [
    { id: 'overview', label: '요약' },
    { id: 'vocab',    label: '단어 마스터리' },
    { id: 'games',    label: '게임 기록' },
    { id: 'sessions', label: '학습 기록' },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Sub-nav */}
      <div className="seg overflow-x-auto">
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            className={`seg-btn flex-1 whitespace-nowrap ${activeSection === s.id ? 'seg-btn-active' : ''}`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Refresh */}
      <div className="flex justify-end">
        <button onClick={load} className="text-xs text-muted hover:text-violet-600 transition-colors inline-flex items-center gap-1.5">
          <Icon name="refresh" className="h-3.5 w-3.5" /> 새로고침
        </button>
      </div>

      {/* ── OVERVIEW ─────────────────────────────────────────────────────────── */}
      {activeSection === 'overview' && (
        <div className="space-y-4">
          {/* Hero stat leads; three secondary stats follow — breaks the
              four-identical-tile dashboard symmetry without losing a metric. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="surface p-5 sm:col-span-2 sm:row-span-1 flex flex-col justify-center">
              <div className="text-4xl font-extrabold text-violet-600 leading-none">{totalWords}</div>
              <div className="text-sm font-bold text-gray-800 mt-2">학습한 단어</div>
              <div className="text-xs text-muted mt-0.5">{masteredWords}개 마스터</div>
            </div>
            {[
              { label: '게임 플레이', value: `${totalGames}회`, sub: `최고 ${bestScore}점`, color: 'text-amber-500' },
              { label: '총 학습시간', value: formatDuration(totalStudySecs), sub: `${sessions.length}세션`, color: 'text-emerald-600' },
              { label: '취약 단어', value: `${weakWords.length}개`, sub: '집중 필요', color: 'text-red-500' },
            ].map(stat => (
              <div key={stat.label} className="surface p-4">
                <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-xs font-semibold text-gray-700 mt-1">{stat.label}</div>
                <div className="text-xs text-muted mt-0.5">{stat.sub}</div>
              </div>
            ))}
          </div>

          {weakWords.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <div className="font-bold text-red-700 mb-3 flex items-center gap-2">
                ⚠️ 집중해야 할 단어
              </div>
              <div className="flex flex-wrap gap-2">
                {weakWords.map(w => (
                  <div key={w.word} className="bg-white border border-red-200 rounded-xl px-3 py-2 text-sm">
                    <span className="font-bold text-gray-800">{w.word}</span>
                    <span className="text-red-500 ml-2 text-xs">✗{w.wrong_count} ✓{w.correct_count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(featureTime).length > 0 && (
            <div className="surface p-4">
              <div className="font-bold text-gray-700 mb-3">기능별 학습 시간</div>
              <div className="space-y-3">
                {Object.entries(featureTime).sort((a, b) => b[1] - a[1]).map(([feat, secs]) => (
                  <div key={feat}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">{FEATURE_LABELS[feat] ?? feat}</span>
                      <span className="font-semibold text-gray-800">{formatDuration(secs)}</span>
                    </div>
                    <MiniBar value={secs} max={Math.max(...Object.values(featureTime))} color="bg-violet-500" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── VOCAB ────────────────────────────────────────────────────────────── */}
      {activeSection === 'vocab' && (
        <div className="space-y-3">
          {vocab.length === 0 ? (
            <div className="text-center py-12 text-muted">
              아직 단어 퀴즈를 풀지 않았어요. 게임 탭에서 단어 퀴즈를 플레이해 보세요!
            </div>
          ) : (
            <>
              <div className="text-xs text-gray-500 flex justify-between">
                <span>{totalWords}개 단어 학습 중 · {masteredWords}개 마스터 (3회 이상 정답)</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {vocab.map(w => {
                  const total = w.correct_count + w.wrong_count;
                  const pct = total > 0 ? Math.round((w.correct_count / total) * 100) : 0;
                  const status = pct >= 80 ? 'good' : pct >= 50 ? 'ok' : 'weak';
                  return (
                    <div key={w.word} className={`flex items-center gap-3 p-3 rounded-xl border ${
                      status === 'good' ? 'bg-green-50 border-green-200' :
                      status === 'ok'   ? 'bg-yellow-50 border-yellow-200' :
                                          'bg-red-50 border-red-200'
                    }`}>
                      <div className="w-28 font-bold text-gray-800 shrink-0">{w.word}</div>
                      <div className="flex-1">
                        <MiniBar value={w.correct_count} max={total} color={
                          status === 'good' ? 'bg-green-500' : status === 'ok' ? 'bg-yellow-400' : 'bg-red-400'
                        } />
                      </div>
                      <div className="text-xs text-gray-500 shrink-0 w-24 text-right">
                        ✓{w.correct_count} ✗{w.wrong_count} · {pct}%
                      </div>
                      {w.streak >= 3 && (
                        <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ color: 'var(--accent-ink)', background: 'var(--accent-wash)' }}>
                          <Icon name="target" className="h-3 w-3" />{w.streak}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── GAMES ────────────────────────────────────────────────────────────── */}
      {activeSection === 'games' && (
        <div className="space-y-4">
          {scores.length === 0 ? (
            <div className="text-center py-12 text-muted">
              아직 게임 기록이 없어요. 게임 탭에서 플레이해 보세요!
            </div>
          ) : (
            <>
              {/* Score bar chart (last 8 games) */}
              <div className="surface p-4">
                <div className="font-bold text-gray-700 mb-3 text-sm">최근 게임 점수</div>
                <div className="flex items-end gap-2 h-28">
                  {recentGames.reverse().map((g) => (
                    <div key={g.id} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-xs text-muted font-bold">{g.score}</div>
                      <div
                        className={`w-full rounded-t-lg ${
                          g.game_type === 'space' ? 'bg-slate-600' :
                          g.game_type === 'quiz'  ? 'bg-amber-400' : 'bg-violet-500'
                        }`}
                        style={{ height: `${Math.max(8, (g.score / maxRecentScore) * 80)}px` }}
                      />
                      <div className="text-[10px] font-semibold text-muted truncate max-w-full">
                        {GAME_LABELS[g.game_type]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Score list */}
              <div className="space-y-2">
                {scores.map(g => (
                  <div key={g.id} className="surface surface-hover flex items-center gap-3 px-4 py-3">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      g.game_type === 'space' ? 'bg-slate-600' : g.game_type === 'quiz' ? 'bg-amber-400' : 'bg-violet-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800 text-sm">{GAME_LABELS[g.game_type]}</div>
                      <div className="text-xs text-muted">
                        {formatDate(g.played_at)}
                        {g.wave != null ? ` · Wave ${g.wave}` : ''}
                        {g.correct != null && g.total != null ? ` · ${g.correct}/${g.total} 정답` : ''}
                      </div>
                    </div>
                    <div className="font-bold text-lg text-violet-600 shrink-0">{g.score}점</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── SESSIONS ─────────────────────────────────────────────────────────── */}
      {activeSection === 'sessions' && (
        <div className="space-y-2">
          {sessions.length === 0 ? (
            <div className="text-center py-12 text-muted">
              학습 기록이 아직 없어요. 각 기능을 사용하면 자동으로 기록됩니다!
            </div>
          ) : sessions.slice(0, 100).map((s, idx) => {
            const f = parseFeature(s.feature);
            return (
              <div key={idx} className="surface surface-hover flex items-center gap-3 px-4 py-3">
                <Icon name={FEATURE_ICONS[f.base] ?? 'book'} className="h-5 w-5 shrink-0 text-violet-500" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800 text-sm truncate">
                    {FEATURE_LABELS[f.base] ?? f.base}
                    {f.where && <span className="text-violet-600"> · {f.where}</span>}
                  </div>
                  <div className="text-xs text-muted truncate">
                    {s.mode.toUpperCase()} · {formatSessionWhen(s.started_at, s.duration_seconds)}
                  </div>
                </div>
                <div className="font-semibold text-emerald-600 text-sm shrink-0">
                  {formatDuration(s.duration_seconds)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
