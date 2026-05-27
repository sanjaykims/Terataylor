import { useEffect, useState } from 'react';
import {
  fetchVocabProgress, fetchGameScores, fetchStudySessions,
} from '../lib/tracker';
import type { VocabProgress, GameScore, StudySession } from '../lib/tracker';

const GAME_LABELS: Record<string, string> = { space: '🛸 우주게임', quiz: '⚡ 단어퀴즈', scramble: '🎮 문장퍼즐' };
const FEATURE_LABELS: Record<string, string> = {
  shadowing: '🎧 섀도잉', vocabulary: '📚 단어장', opinion: '✍️ 의견쓰기', story: '📖 스토리쓰기', games: '🎮 게임',
};

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}초`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분`;
  return `${Math.floor(seconds / 3600)}시간 ${Math.floor((seconds % 3600) / 60)}분`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
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
  const [activeSection, setActiveSection] = useState<'overview' | 'vocab' | 'games' | 'sessions'>('overview');

  const load = async () => {
    setLoading(true);
    const [v, g, s] = await Promise.all([fetchVocabProgress(), fetchGameScores(), fetchStudySessions()]);
    setVocab(v); setScores(g); setSessions(s);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="text-center py-16 space-y-3">
      <div className="text-4xl animate-spin inline-block">📊</div>
      <div className="text-gray-500 font-medium">기록 불러오는 중...</div>
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

  const featureTime = sessions.reduce<Record<string, number>>((acc, s) => {
    acc[s.feature] = (acc[s.feature] ?? 0) + s.duration_seconds;
    return acc;
  }, {});

  const SECTIONS = [
    { id: 'overview', label: '📊 요약' },
    { id: 'vocab',    label: '📚 단어 마스터리' },
    { id: 'games',    label: '🏆 게임 기록' },
    { id: 'sessions', label: '⏱ 학습 기록' },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Sub-nav */}
      <div className="flex bg-white rounded-2xl shadow-sm border border-gray-100 p-1 gap-1 overflow-x-auto">
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
              activeSection === s.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
            }`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Refresh */}
      <div className="flex justify-end">
        <button onClick={load} className="text-xs text-gray-400 hover:text-indigo-600 transition-colors flex items-center gap-1">
          🔄 새로고침
        </button>
      </div>

      {/* ── OVERVIEW ─────────────────────────────────────────────────────────── */}
      {activeSection === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: '학습한 단어', value: totalWords, sub: `${masteredWords}개 마스터`, color: 'text-indigo-600' },
              { label: '게임 플레이', value: `${totalGames}회`, sub: `최고 ${bestScore}점`, color: 'text-orange-500' },
              { label: '총 학습시간', value: formatDuration(totalStudySecs), sub: `${sessions.length}세션`, color: 'text-emerald-600' },
              { label: '취약 단어', value: `${weakWords.length}개`, sub: '집중 필요', color: 'text-red-500' },
            ].map(stat => (
              <div key={stat.label} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
                <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-xs text-gray-400 mt-1">{stat.sub}</div>
                <div className="text-xs font-semibold text-gray-600 mt-0.5">{stat.label}</div>
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
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="font-bold text-gray-700 mb-3">기능별 학습 시간</div>
              <div className="space-y-3">
                {Object.entries(featureTime).sort((a, b) => b[1] - a[1]).map(([feat, secs]) => (
                  <div key={feat}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">{FEATURE_LABELS[feat] ?? feat}</span>
                      <span className="font-semibold text-gray-800">{formatDuration(secs)}</span>
                    </div>
                    <MiniBar value={secs} max={Math.max(...Object.values(featureTime))} color="bg-indigo-400" />
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
            <div className="text-center py-12 text-gray-400">
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
                      {w.streak >= 3 && <span className="text-orange-500 text-sm shrink-0">🔥{w.streak}</span>}
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
            <div className="text-center py-12 text-gray-400">
              아직 게임 기록이 없어요. 게임 탭에서 플레이해 보세요!
            </div>
          ) : (
            <>
              {/* Score bar chart (last 8 games) */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="font-bold text-gray-700 mb-3 text-sm">최근 게임 점수</div>
                <div className="flex items-end gap-2 h-28">
                  {recentGames.reverse().map((g) => (
                    <div key={g.id} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-xs text-gray-400 font-bold">{g.score}</div>
                      <div
                        className={`w-full rounded-t-lg ${
                          g.game_type === 'space' ? 'bg-slate-600' :
                          g.game_type === 'quiz'  ? 'bg-orange-400' : 'bg-indigo-400'
                        }`}
                        style={{ height: `${Math.max(8, (g.score / maxRecentScore) * 80)}px` }}
                      />
                      <div className="text-xs text-gray-300">
                        {g.game_type === 'space' ? '🛸' : g.game_type === 'quiz' ? '⚡' : '🎮'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Score list */}
              <div className="space-y-2">
                {scores.map(g => (
                  <div key={g.id} className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3">
                    <span className="text-xl shrink-0">
                      {g.game_type === 'space' ? '🛸' : g.game_type === 'quiz' ? '⚡' : '🎮'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800 text-sm">{GAME_LABELS[g.game_type]}</div>
                      <div className="text-xs text-gray-400">
                        {formatDate(g.played_at)}
                        {g.wave != null ? ` · Wave ${g.wave}` : ''}
                        {g.correct != null && g.total != null ? ` · ${g.correct}/${g.total} 정답` : ''}
                      </div>
                    </div>
                    <div className="font-bold text-lg text-indigo-600 shrink-0">{g.score}점</div>
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
            <div className="text-center py-12 text-gray-400">
              학습 기록이 아직 없어요. 각 기능을 사용하면 자동으로 기록됩니다!
            </div>
          ) : sessions.map((s, idx) => (
            <div key={idx} className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3">
              <span className="text-xl shrink-0">{FEATURE_LABELS[s.feature]?.split(' ')[0] ?? '📖'}</span>
              <div className="flex-1">
                <div className="font-semibold text-gray-800 text-sm">
                  {FEATURE_LABELS[s.feature] ?? s.feature}
                </div>
                <div className="text-xs text-gray-400">
                  {s.mode.toUpperCase()} · {formatDate(s.started_at)}
                </div>
              </div>
              <div className="font-semibold text-emerald-600 text-sm shrink-0">
                {formatDuration(s.duration_seconds)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
