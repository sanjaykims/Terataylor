import { useState, useEffect, useMemo } from 'react';
import { parseSentences } from '../utils/textUtils';
import { trackGameScore } from '../lib/tracker';
import type { VocabItem } from '../lib/types';

interface WordToken { id: number; word: string; }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const isKorean = (s: string) => /[가-힣]/.test(s);

interface VocabPuzzle { word: string; korean: string; meaning: string; sentence: string; }

interface Props {
  text: string;
  vocab?: VocabItem[] | null;
  selectedWords?: string[];
}

export default function SentenceScramble({ text, vocab, selectedWords }: Props) {
  // All state declarations first
  const [sentIdx, setSentIdx] = useState(0);
  const [bank, setBank] = useState<WordToken[]>([]);
  const [placed, setPlaced] = useState<WordToken[]>([]);
  const [checked, setChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());

  // Build puzzle list — vocab terms take priority over text sentences.
  // Hint = English meaning (definition); puzzle = arrange the term's words in order.
  const { sentences, vocabPuzzles, mode } = useMemo(() => {
    let items = vocab?.length ? [...vocab] : [];
    if (selectedWords?.length) {
      const sel = new Set(selectedWords);
      items = items.filter(v => sel.has(v.word));
    }
    const puzzles: VocabPuzzle[] = items
      // The term itself must have 2+ words so there's something to order
      .filter(v => v.word.trim().split(/\s+/).filter(Boolean).length >= 2)
      // Need an English meaning to show as the hint
      .filter(v => v.definition && !isKorean(v.definition))
      .map(v => ({
        word: v.word,
        korean: v.korean ?? '',
        meaning: v.definition,
        sentence: v.word.trim(),
      }));

    if (puzzles.length >= 3) {
      return { sentences: [] as string[], vocabPuzzles: shuffle(puzzles), mode: 'vocab' as const };
    }

    const sents = parseSentences(text).filter(s => {
      const wc = s.split(/\s+/).filter(Boolean).length;
      return wc >= 4 && wc <= 14;
    });
    return { sentences: sents, vocabPuzzles: [] as VocabPuzzle[], mode: 'text' as const };
  }, [vocab, text, selectedWords]);

  const totalCount = mode === 'vocab' ? vocabPuzzles.length : sentences.length;
  const currentSentence = mode === 'vocab'
    ? (vocabPuzzles[sentIdx]?.sentence ?? '')
    : (sentences[sentIdx] ?? '');
  const currentHint: VocabPuzzle | null = mode === 'vocab' ? (vocabPuzzles[sentIdx] ?? null) : null;

  // Reset counters when puzzle source changes
  useEffect(() => {
    setSentIdx(0);
    setScore(0);
    setStreak(0);
    setCompleted(new Set());
  }, [mode, vocabPuzzles.length, sentences.length]);

  // Shuffle new puzzle when sentence index or source changes
  useEffect(() => {
    if (!currentSentence) return;
    const words = currentSentence.split(/\s+/).filter(Boolean);
    const tokens: WordToken[] = words.map((w, i) => ({ id: i, word: w }));
    let shuffled = shuffle(tokens);
    let attempts = 0;
    while (
      shuffled.map(t => t.word).join(' ') === words.join(' ') &&
      words.length > 1 &&
      attempts < 10
    ) {
      shuffled = shuffle(tokens);
      attempts++;
    }
    setBank(shuffled);
    setPlaced([]);
    setChecked(false);
    setIsCorrect(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentIdx, mode, vocabPuzzles.length, sentences.length]);

  if (totalCount === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-lg">
        {vocab?.length
          ? '여러 단어로 된 표현(숙어/구문)이 3개 이상 있어야 표현 맞추기를 할 수 있어요. 단어장에서 영어 뜻을 먼저 불러오세요.'
          : '지문을 입력하면 문장 퍼즐 게임이 시작돼요!'}
      </div>
    );
  }

  const originalWords = currentSentence.split(/\s+/).filter(Boolean);

  const pickWord = (token: WordToken) => {
    if (checked) return;
    setBank(prev => prev.filter(t => t.id !== token.id));
    setPlaced(prev => [...prev, token]);
  };

  const returnWord = (token: WordToken) => {
    if (checked) return;
    setPlaced(prev => prev.filter(t => t.id !== token.id));
    setBank(prev => [...prev, token]);
  };

  const checkAnswer = () => {
    if (placed.length !== originalWords.length) return;
    const answer = placed.map(t => t.word).join(' ');
    const correct = answer === currentSentence;
    setIsCorrect(correct);
    setChecked(true);
    if (correct) {
      const newScore = score + 10 + streak * 2;
      setScore(newScore);
      setStreak(s => s + 1);
      setCompleted(prev => {
        const next = new Set([...prev, sentIdx]);
        if (next.size === totalCount) {
          trackGameScore('scramble', newScore, { correct: next.size, total: totalCount });
        }
        return next;
      });
    } else {
      setStreak(0);
    }
  };

  const nextSentence = () => setSentIdx(prev => (prev + 1) % totalCount);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="surface flex items-center justify-between p-4">
        <div>
          <div className="text-sm text-gray-700 font-semibold">
            {mode === 'vocab' ? '표현 맞추기' : '문장 퍼즐'} {sentIdx + 1} / {totalCount}
          </div>
          <div className="text-xs text-gray-500">{completed.size}개 완료</div>
        </div>
        <div className="flex items-center gap-4">
          {streak >= 2 && (
            <div className="text-amber-500 font-bold text-sm">🔥 {streak}연속!</div>
          )}
          <div className="text-right">
            <div className="text-2xl font-bold text-violet-600">{score}</div>
            <div className="text-xs text-gray-500">점수</div>
          </div>
        </div>
      </div>

      {/* Vocab hint card — shows the English meaning; user arranges the term */}
      {mode === 'vocab' && currentHint && (
        <div className="surface-soft border-2 border-violet-200 px-5 py-4 space-y-1">
          <div className="eyebrow text-violet-500">English meaning</div>
          <div className="text-lg font-bold text-gray-800 leading-snug">{currentHint.meaning}</div>
          {currentHint.korean && (
            <div className="text-sm text-violet-600 font-semibold">{currentHint.korean}</div>
          )}
          <div className="text-xs text-gray-500 pt-1">아래 단어들로 알맞은 표현을 순서대로 완성하세요</div>
        </div>
      )}

      {/* Progress bar */}
      <div className="w-full bg-violet-100 rounded-full h-2">
        <div
          className="progress-fill h-2 transition-[width] duration-500"
          style={{ width: `${totalCount > 0 ? (completed.size / totalCount) * 100 : 0}%` }}
        />
      </div>

      {/* Answer area */}
      <div className={`min-h-20 rounded-[1.25rem] border-2 p-4 flex flex-wrap gap-2 items-center transition-[background-color,border-color] ${
        checked
          ? isCorrect ? 'bg-emerald-50 border-emerald-400' : 'bg-red-50 border-red-300'
          : 'surface border-black/5'
      }`}>
        {placed.length === 0 && (
          <span className="text-muted text-sm">
            {mode === 'vocab' ? '아래 단어들로 표현을 순서대로 완성하세요…' : '아래 단어를 클릭해서 문장을 완성하세요…'}
          </span>
        )}
        {placed.map((token, i) => {
          const wordCorrect = checked && token.word === originalWords[i];
          const wordWrong = checked && token.word !== originalWords[i];
          return (
            <button
              key={token.id}
              onClick={() => returnWord(token)}
              className={`px-3 py-2 rounded-xl text-base font-medium ${
                wordCorrect ? 'bg-emerald-500 text-white' :
                wordWrong ? 'bg-red-400 text-white' :
                'bg-violet-100 text-violet-800 hover:bg-violet-200'
              }`}
            >
              {token.word}
            </button>
          );
        })}
      </div>

      {/* Feedback */}
      {checked && (
        <div className={`rounded-xl p-3 text-sm font-semibold ${
          isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-red-50 text-red-600'
        }`}>
          {isCorrect
            ? <>✅ 정답! {streak >= 2 ? `🔥 ${streak}연속!` : ''} +{10 + (streak - 1) * 2}점</>
            : <>❌ 정답: <span className="font-semibold text-emerald-700">{currentSentence}</span></>
          }
        </div>
      )}

      {/* Word bank */}
      <div className="surface-soft border-2 border-dashed border-violet-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="eyebrow">단어 뱅크</span>
          <button
            onClick={() => !checked && setBank(prev => shuffle(prev))}
            disabled={checked}
            className="text-xs text-gray-500 hover:text-violet-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            🔀 섞기
          </button>
        </div>
        <div className="flex flex-wrap gap-2 min-h-10">
          {bank.map(token => (
            <button
              key={token.id}
              onClick={() => pickWord(token)}
              className="px-3 py-2 rounded-xl bg-white border-2 border-gray-200 text-base font-medium text-gray-700 hover:border-violet-400 hover:text-violet-700 shadow-sm"
            >
              {token.word}
            </button>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        {!checked ? (
          <button
            onClick={checkAnswer}
            disabled={placed.length !== originalWords.length}
            className="btn-primary flex-1"
          >
            확인하기 ✓
          </button>
        ) : (
          <button
            onClick={nextSentence}
            className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 shadow-sm"
          >
            다음 →
          </button>
        )}
        <button
          onClick={() => setSentIdx(prev => (prev - 1 + totalCount) % totalCount)}
          className="btn-soft px-4"
        >
          ← 이전
        </button>
      </div>
    </div>
  );
}
