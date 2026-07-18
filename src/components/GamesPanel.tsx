import { useState } from 'react';
import SentenceScramble from './SentenceScramble';
import VocabQuizGame from './VocabQuizGame';
import SpaceGame from './SpaceGame';
import type { VocabItem } from '../lib/types';

type GameType = 'scramble' | 'quiz' | 'space';

const TABS: { id: GameType; label: string }[] = [
  { id: 'scramble', label: '문장 퍼즐' },
  { id: 'quiz',     label: '단어 퀴즈' },
  { id: 'space',    label: '우주 게임' },
];

interface Props {
  text: string;
  vocab?: VocabItem[] | null;
  selectedWords?: string[];
}

export default function GamesPanel({ text, vocab, selectedWords }: Props) {
  const [game, setGame] = useState<GameType>('space');

  return (
    <div className="space-y-4">
      <div className="seg">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setGame(t.id)}
            className={`seg-btn ${game === t.id ? 'seg-btn-active' : ''}`}>
            {t.label}
          </button>
        ))}
      </div>

      {game === 'scramble' && <SentenceScramble text={text} vocab={vocab} selectedWords={selectedWords} />}
      {game === 'quiz'     && <VocabQuizGame text={text} bookVocab={vocab} />}
      {game === 'space'    && <SpaceGame text={text} bookVocab={vocab} selectedWords={selectedWords} />}
    </div>
  );
}
