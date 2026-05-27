import { useState } from 'react';
import { extractVocabulary } from '../utils/textUtils';
import type { VocabItem } from '../lib/types';

interface Props {
  text: string;
  vocab?: VocabItem[] | null;
}

export default function VocabularyPanel({ text, vocab }: Props) {
  const [flipped, setFlipped]   = useState<Set<number>>(new Set());
  const [studied, setStudied]   = useState<Set<number>>(new Set());

  // Prefer book-provided vocab; fall back to auto-extraction
  const words: { word: string; definition?: string; count?: number }[] = vocab?.length
    ? vocab
    : extractVocabulary(text);

  const toggleFlip = (i: number) => {
    setFlipped(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const toggleStudied = (e: React.MouseEvent, i: number) => {
    e.stopPropagation();
    setStudied(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  if (words.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-lg">
        지문 또는 단어 사진을 업로드하면 단어장이 만들어져요!
      </div>
    );
  }

  const studiedCount = studied.size;
  const usingBookVocab = !!vocab?.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {usingBookVocab
            ? <><strong className="text-indigo-600">책 지정 단어 {words.length}개</strong> · 카드를 클릭해 뜻을 확인하세요</>
            : <>본문에서 <strong className="text-indigo-600">{words.length}개</strong> 단어 추출 · 카드를 클릭하면 뜻이 나와요</>}
        </div>
        <div className="text-sm font-semibold text-emerald-600">
          ✅ {studiedCount} / {words.length} 완료
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
          style={{ width: `${(studiedCount / words.length) * 100}%` }} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {words.map((item, i) => (
          <div key={item.word + i} onClick={() => toggleFlip(i)}
            className={`relative rounded-xl p-4 cursor-pointer transition-all select-none border-2 ${
              studied.has(i)
                ? 'bg-emerald-50 border-emerald-300 opacity-70'
                : flipped.has(i)
                ? 'bg-indigo-50 border-indigo-300 shadow-md'
                : 'bg-white border-gray-100 hover:border-indigo-200 hover:shadow-sm'
            }`}>
            <button onClick={e => toggleStudied(e, i)}
              className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all ${
                studied.has(i) ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              }`} title="학습 완료 표시">✓</button>

            <div className={`font-bold text-base mb-1 ${studied.has(i) ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
              {item.word}
            </div>

            {'count' in item && item.count && item.count > 1 && (
              <div className="text-xs text-gray-400 mb-1">{item.count}회 등장</div>
            )}

            {flipped.has(i) && !studied.has(i) && (
              <div className="mt-2 pt-2 border-t border-indigo-200">
                {'definition' in item && item.definition
                  ? <div className="text-xs text-indigo-700 leading-snug">{item.definition}</div>
                  : <VocabDefinition word={item.word} />}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 text-center">
        💡 단어 카드를 클릭해 뜻을 보고, ✓ 버튼으로 외운 단어를 표시하세요
      </p>
    </div>
  );
}

function VocabDefinition({ word }: { word: string }) {
  const [def, setDef]       = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  if (!fetched) {
    setFetched(true);
    setLoading(true);
    fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`)
      .then(r => r.json())
      .then(data => {
        const meaning = data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
        setDef(meaning ?? '(정의를 찾을 수 없어요)');
      })
      .catch(() => setDef('(사전 연결 실패)'))
      .finally(() => setLoading(false));
  }

  if (loading) return <div className="text-xs text-indigo-400 animate-pulse">찾는 중...</div>;
  return <div className="text-xs text-indigo-700 leading-snug">{def}</div>;
}
