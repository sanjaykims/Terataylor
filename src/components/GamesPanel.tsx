import { useState } from 'react';
import SentenceScramble from './SentenceScramble';
import VocabQuizGame from './VocabQuizGame';
import SpaceGame from './SpaceGame';
import type { VocabItem } from '../lib/types';

type GameType = 'scramble' | 'quiz' | 'space';

const TABS: { id: GameType; label: string; active: string }[] = [
  { id: 'scramble', label: '🎮 문장 퍼즐',  active: 'bg-indigo-600 text-white shadow-sm' },
  { id: 'quiz',     label: '⚡ 단어 퀴즈',  active: 'bg-orange-500 text-white shadow-sm' },
  { id: 'space',    label: '🛸 우주 게임',  active: 'bg-slate-800 text-green-400 shadow-sm' },
];

interface Props {
  text: string;
  vocab?: VocabItem[] | null;
}

export default function GamesPanel({ text, vocab }: Props) {
  const [game, setGame] = useState<GameType>('space');

  return (
    <div className="space-y-4">
      <div className="flex bg-white rounded-2xl shadow-sm border border-gray-100 p-1 gap-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setGame(t.id)}
            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
              game === t.id ? t.active : 'text-gray-500 hover:bg-gray-50'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {game === 'scramble' && <SentenceScramble text={text} />}
      {game === 'quiz'     && <VocabQuizGame text={text} bookVocab={vocab} />}
      {game === 'space'    && <SpaceGame text={text} bookVocab={vocab} />}
    </div>
  );
}
