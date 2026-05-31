import { useState, useEffect } from 'react';
import { extractVocabulary } from '../utils/textUtils';
import { supabase } from '../lib/supabase';
import type { VocabItem } from '../lib/types';

interface Props {
  text: string;
  vocab?: VocabItem[] | null;
}

export default function VocabularyPanel({ text, vocab }: Props) {
  const [flipped, setFlipped]   = useState<Set<number>>(new Set());
  const [studied, setStudied]   = useState<Set<number>>(new Set());

  // Prefer book-provided vocab; fall back to auto-extraction
  const words: { word: string; definition?: string; korean?: string; count?: number }[] = vocab?.length
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
        {words.map((item, i) => {
          // Determine Korean and English strings.
          // New data (v6+): item.korean = Korean, item.definition = English.
          // Old/legacy data: item.definition = Korean (no separate korean field).
          const korean = item.korean ?? item.definition ?? null;
          const english = item.korean && item.definition ? item.definition : null;
          const hasAnyDef = !!(item.korean || item.definition);

          return (
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

              <div className={`font-bold text-base mb-1 pr-7 ${studied.has(i) ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                {item.word}
              </div>

              {'count' in item && item.count && item.count > 1 && (
                <div className="text-xs text-gray-400 mb-1">{item.count}회 등장</div>
              )}

              {flipped.has(i) && !studied.has(i) && (
                <div className="mt-2 pt-2 border-t border-indigo-200 space-y-1">
                  {hasAnyDef ? (
                    <>
                      {/* Korean meaning — primary, prominent */}
                      {korean && (
                        <div className="text-sm font-semibold text-indigo-800 leading-snug">
                          🇰🇷 {korean}
                        </div>
                      )}
                      {/* English definition — secondary, smaller */}
                      {english && (
                        <div className="text-xs text-gray-500 leading-snug mt-1">
                          🇺🇸 {english}
                        </div>
                      )}
                    </>
                  ) : (
                    // Auto-extracted word: fetch definition + Korean from edge function
                    <VocabDefinitionFull word={item.word} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 text-center">
        💡 단어 카드를 클릭해 한국어 뜻을 보고, ✓ 버튼으로 외운 단어를 표시하세요
      </p>
    </div>
  );
}

// Used for auto-extracted words that have no stored definition.
// Calls the edge function to get both English definition and Korean meaning.
function VocabDefinitionFull({ word }: { word: string }) {
  const [result, setResult] = useState<{ english: string; korean: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.functions.invoke('ocr-extract', {
      body: { word, mode: 'define_word' },
    })
      .then(({ data }) => setResult(data as { english: string; korean: string }))
      .catch(() => setResult({ english: '(lookup failed)', korean: '(조회 실패)' }))
      .finally(() => setLoading(false));
  }, [word]);

  if (loading) return <div className="text-xs text-indigo-400 animate-pulse">찾는 중...</div>;
  return (
    <div className="space-y-1">
      {result?.korean && (
        <div className="text-sm font-semibold text-indigo-800 leading-snug">🇰🇷 {result.korean}</div>
      )}
      {result?.english && (
        <div className="text-xs text-gray-500 leading-snug">🇺🇸 {result.english}</div>
      )}
    </div>
  );
}
