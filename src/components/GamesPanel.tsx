import { useState } from 'react';
import SentenceScramble from './SentenceScramble';
import VocabQuizGame from './VocabQuizGame';

type GameType = 'scramble' | 'quiz';

export default function GamesPanel({ text }: { text: string }) {
  const [game, setGame] = useState<GameType>('scramble');

  return (
    <div className="space-y-4">
      <div className="flex bg-white rounded-2xl shadow-sm border border-gray-100 p-1 gap-1">
        <button
          onClick={() => setGame('scramble')}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            game === 'scramble'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-gray-500 hover:bg-gray-50'
          }`}
        >
          🎮 문장 퍼즐
        </button>
        <button
          onClick={() => setGame('quiz')}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            game === 'quiz'
              ? 'bg-orange-500 text-white shadow-sm'
              : 'text-gray-500 hover:bg-gray-50'
          }`}
        >
          ⚡ 단어 퀴즈
        </button>
      </div>

      {game === 'scramble' ? (
        <SentenceScramble text={text} />
      ) : (
        <VocabQuizGame text={text} />
      )}
    </div>
  );
}
