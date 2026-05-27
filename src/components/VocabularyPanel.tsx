import { useState } from 'react';
import { extractVocabulary } from '../utils/textUtils';

interface Props {
  text: string;
}

export default function VocabularyPanel({ text }: Props) {
  const vocab = extractVocabulary(text);
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [studied, setStudied] = useState<Set<number>>(new Set());

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

  if (vocab.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-lg">
        본문을 입력하면 핵심 단어를 자동으로 추출해드려요!
      </div>
    );
  }

  const studiedCount = studied.size;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          본문에서 <strong className="text-indigo-600">{vocab.length}개</strong> 단어 추출 · 카드를 클릭하면 발음 기호가 나와요
        </div>
        <div className="text-sm font-semibold text-emerald-600">
          ✅ {studiedCount} / {vocab.length} 완료
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
          style={{ width: `${(studiedCount / vocab.length) * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {vocab.map((item, i) => (
          <div
            key={item.word}
            onClick={() => toggleFlip(i)}
            className={`relative rounded-xl p-4 cursor-pointer transition-all select-none border-2 ${
              studied.has(i)
                ? 'bg-emerald-50 border-emerald-300 opacity-70'
                : flipped.has(i)
                ? 'bg-indigo-50 border-indigo-300 shadow-md'
                : 'bg-white border-gray-100 hover:border-indigo-200 hover:shadow-sm'
            }`}
          >
            <button
              onClick={e => toggleStudied(e, i)}
              className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all ${
                studied.has(i) ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              }`}
              title="학습 완료 표시"
            >
              ✓
            </button>
            <div className={`font-bold text-base mb-1 ${studied.has(i) ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
              {item.word}
            </div>
            {item.count > 1 && (
              <div className="text-xs text-gray-400 mb-1">{item.count}회 등장</div>
            )}
            {flipped.has(i) && !studied.has(i) && (
              <div className="mt-2 pt-2 border-t border-indigo-200">
                <VocabDefinition word={item.word} />
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 text-center">
        💡 단어 카드를 클릭해서 펼쳐 보고, ✓ 버튼으로 외운 단어를 표시하세요
      </p>
    </div>
  );
}

// Simple definition lookup using Free Dictionary API
function VocabDefinition({ word }: { word: string }) {
  const [def, setDef] = useState<string | null>(null);
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
