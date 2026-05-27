import { useState, useEffect, useRef, useCallback } from 'react';
import { extractVocabulary } from '../utils/textUtils';
import { trackVocabResult, trackGameScore } from '../lib/tracker';

interface WordDef { word: string; definition: string; }
interface Question { word: string; correct: string; options: string[]; }

const TIME_LIMIT = 10;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchDef(word: string): Promise<string | null> {
  try {
    const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
    if (!r.ok) return null;
    const data = await r.json();
    return data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition ?? null;
  } catch {
    return null;
  }
}

function buildQuestions(defs: WordDef[]): Question[] {
  return shuffle(defs).map(wd => {
    const others = shuffle(defs.filter(d => d.word !== wd.word)).slice(0, 3);
    return {
      word: wd.word,
      correct: wd.definition,
      options: shuffle([wd.definition, ...others.map(o => o.definition)]),
    };
  });
}

type GameState = 'idle' | 'loading' | 'playing' | 'done';

export default function VocabQuizGame({ text }: { text: string }) {
  const vocab = extractVocabulary(text);
  const [, setWordDefs] = useState<WordDef[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [results, setResults] = useState<boolean[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answeredRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleTimeout = useCallback(() => {
    if (answeredRef.current) return;
    answeredRef.current = true;
    clearTimer();
    setSelected('__timeout__');
    setStreak(0);
    setResults(r => [...r, false]);
    setTimeLeft(0);
  }, [clearTimer]);

  // Start timer when question loads
  useEffect(() => {
    if (gameState !== 'playing') return;
    answeredRef.current = false;
    setTimeLeft(TIME_LIMIT);

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return clearTimer;
  }, [gameState, qIndex, clearTimer, handleTimeout]);

  const startGame = async () => {
    setGameState('loading');
    const candidates = vocab.slice(0, 10);
    const results = await Promise.all(
      candidates.map(v => fetchDef(v.word).then(d => d ? { word: v.word, definition: d } : null))
    );
    const valid = results.filter(Boolean) as WordDef[];
    if (valid.length < 4) {
      setGameState('idle');
      return;
    }
    const defs = valid.slice(0, 8);
    setWordDefs(defs);
    const qs = buildQuestions(defs);
    setQuestions(qs);
    setQIndex(0);
    setScore(0);
    setStreak(0);
    setResults([]);
    setSelected(null);
    setGameState('playing');
  };

  const handleSelect = (option: string) => {
    if (answeredRef.current || selected !== null) return;
    answeredRef.current = true;
    clearTimer();

    const correct = option === questions[qIndex]?.correct;
    setSelected(option);
    trackVocabResult(questions[qIndex].word, correct);
    if (correct) {
      const bonus = Math.ceil(timeLeft * 0.5);
      setScore(s => s + 10 + streak * 3 + bonus);
      setStreak(s => s + 1);
    } else {
      setStreak(0);
    }
    setResults(r => [...r, correct]);
  };

  const nextQuestion = () => {
    if (qIndex + 1 >= questions.length) {
      const correctCount = results.filter(Boolean).length + (selected === questions[qIndex]?.correct ? 1 : 0);
      trackGameScore('quiz', score, { correct: correctCount, total: questions.length });
      setGameState('done');
    } else {
      setSelected(null);
      setQIndex(i => i + 1);
    }
  };

  if (vocab.length < 4) {
    return (
      <div className="text-center py-12 text-gray-400 text-lg">
        단어 퀴즈를 위해 지문을 먼저 입력해 주세요 (단어 4개 이상 필요)
      </div>
    );
  }

  if (gameState === 'idle') {
    return (
      <div className="text-center space-y-6 py-10">
        <div className="text-6xl">⚡</div>
        <div>
          <div className="text-2xl font-bold text-gray-800">단어 스피드 퀴즈</div>
          <div className="text-gray-500 mt-2">지문에서 최대 8개 단어 · 문제당 {TIME_LIMIT}초</div>
          <div className="text-sm text-gray-400 mt-1">빨리 맞출수록 보너스 점수!</div>
        </div>
        <button
          onClick={startGame}
          className="px-10 py-4 bg-orange-500 text-white font-bold rounded-2xl text-lg shadow-lg hover:bg-orange-600 transition-all active:scale-95"
        >
          게임 시작! 🚀
        </button>
      </div>
    );
  }

  if (gameState === 'loading') {
    return (
      <div className="text-center py-12 space-y-4">
        <div className="text-4xl animate-spin">⚙️</div>
        <div className="text-gray-500 font-semibold">단어 뜻을 불러오는 중...</div>
      </div>
    );
  }

  if (gameState === 'done') {
    const correctCount = results.filter(Boolean).length;
    const pct = Math.round((correctCount / questions.length) * 100);
    const emoji = pct >= 80 ? '🏆' : pct >= 60 ? '🎉' : '💪';
    return (
      <div className="space-y-5 py-4">
        <div className="text-center">
          <div className="text-5xl mb-3">{emoji}</div>
          <div className="text-2xl font-bold text-gray-800">결과</div>
          <div className="text-4xl font-bold text-indigo-600 mt-2">{score}점</div>
          <div className="text-gray-500 mt-1">{correctCount}/{questions.length} 정답 ({pct}%)</div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {questions.map((q, i) => (
            <div key={i} className={`flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm ${results[i] ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
              <span className="shrink-0">{results[i] ? '✅' : '❌'}</span>
              <span className="font-bold">{q.word}</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => setGameState('idle')}
          className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all active:scale-95"
        >
          다시 하기 🔄
        </button>
      </div>
    );
  }

  // Playing
  const q = questions[qIndex];
  const isTimeout = selected === '__timeout__';
  const timerPct = (timeLeft / TIME_LIMIT) * 100;
  const timerColor = timeLeft <= 3 ? 'bg-red-500' : timeLeft <= 6 ? 'bg-orange-400' : 'bg-green-500';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-500">
          {qIndex + 1} / {questions.length}
        </div>
        <div className="flex items-center gap-3">
          {streak >= 2 && <span className="text-orange-500 font-bold text-sm">🔥 {streak}연속</span>}
          <span className="text-xl font-bold text-indigo-600">{score}점</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-1.5">
        <div
          className="bg-indigo-500 h-1.5 rounded-full transition-all"
          style={{ width: `${(qIndex / questions.length) * 100}%` }}
        />
      </div>

      {/* Timer bar */}
      <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${timerColor}`}
          style={{ width: `${timerPct}%` }}
        />
      </div>
      <div className={`text-right text-xs font-bold -mt-2 ${timeLeft <= 3 ? 'text-red-500' : 'text-gray-400'}`}>
        {timeLeft}초
      </div>

      {/* Word card */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-2xl p-8 text-center shadow-lg">
        <div className="text-xs uppercase tracking-widest text-indigo-300 mb-2">이 단어의 뜻은?</div>
        <div className="text-4xl font-bold">{q.word}</div>
      </div>

      {/* Options */}
      <div className="space-y-2.5">
        {q.options.map((opt, i) => {
          const isCorrect = opt === q.correct;
          const isSelected = opt === selected;
          let cls = 'bg-white border-2 border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50';
          if (selected !== null && !isTimeout) {
            if (isCorrect) cls = 'bg-green-500 border-green-500 text-white';
            else if (isSelected) cls = 'bg-red-400 border-red-400 text-white';
            else cls = 'bg-gray-50 border-gray-200 text-gray-400 opacity-50';
          } else if (isTimeout) {
            if (isCorrect) cls = 'bg-green-100 border-green-400 text-green-700';
            else cls = 'bg-gray-50 border-gray-200 text-gray-400 opacity-50';
          }

          return (
            <button
              key={i}
              onClick={() => handleSelect(opt)}
              disabled={selected !== null}
              className={`w-full p-4 rounded-xl text-left text-sm leading-snug font-medium transition-all ${cls}`}
            >
              <span className="font-bold mr-2 opacity-60">{String.fromCharCode(65 + i)}.</span>
              {opt}
            </button>
          );
        })}
      </div>

      {/* Feedback & next */}
      {selected !== null && (
        <div className="space-y-3">
          <div className={`rounded-xl p-3 text-sm font-semibold ${
            isTimeout ? 'bg-orange-50 text-orange-700' :
            selected === q.correct ? 'bg-green-100 text-green-700' :
            'bg-red-50 text-red-600'
          }`}>
            {isTimeout
              ? '⏰ 시간 초과! 정답을 확인하세요.'
              : selected === q.correct
              ? `✅ 정답! +${10 + (streak - 1) * 3 + Math.ceil(timeLeft * 0.5)}점`
              : `❌ 오답`
            }
          </div>
          <button
            onClick={nextQuestion}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all active:scale-95"
          >
            {qIndex + 1 >= questions.length ? '결과 보기 🏆' : '다음 문제 →'}
          </button>
        </div>
      )}
    </div>
  );
}
