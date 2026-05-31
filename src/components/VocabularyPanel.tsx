import { useState, useEffect } from 'react';
import { extractVocabulary } from '../utils/textUtils';
import { supabase } from '../lib/supabase';
import type { VocabItem } from '../lib/types';

interface Props {
  text: string;
  vocab?: VocabItem[] | null;
}

// True if the string contains any Korean syllable characters.
const isKorean = (s: string) => /[가-힣]/.test(s);

export default function VocabularyPanel({ text, vocab }: Props) {
  const [flipped, setFlipped]   = useState<Set<number>>(new Set());
  const [studied, setStudied]   = useState<Set<number>>(new Set());

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

      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
          style={{ width: `${(studiedCount / words.length) * 100}%` }} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {words.map((item, i) => {
          // ── Classify what we have ──────────────────────────────────────
          // New v6 data:  item.korean = Korean, item.definition = English
          // Legacy Korean: item.korean absent, item.definition has Korean chars
          // Legacy English: item.korean absent, item.definition is English text
          // Auto-extracted: no definition at all
          const explicitKorean = item.korean ?? null;
          const defIsKorean    = !explicitKorean && !!item.definition && isKorean(item.definition);

          const koreanText  = explicitKorean ?? (defIsKorean ? item.definition! : null);
          // English: from definition when (a) new format or (b) legacy English
          const englishText = explicitKorean
            ? (item.definition ?? null)          // new format — definition IS English
            : defIsKorean
              ? null                             // legacy Korean-only — no English stored
              : (item.definition ?? null);       // English definition needs Korean lookup

          const needsLookup = !koreanText; // no Korean available locally → call edge fn

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
                <div className="mt-2 pt-2 border-t border-indigo-200">
                  {needsLookup ? (
                    // No Korean stored — fetch from edge function, show English hint immediately
                    <VocabDefinitionFull word={item.word} englishHint={englishText} />
                  ) : (
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-indigo-800 leading-snug">
                        🇰🇷 {koreanText}
                      </div>
                      {englishText && (
                        <div className="text-xs text-gray-500 leading-snug mt-1">
                          🇺🇸 {englishText}
                        </div>
                      )}
                    </div>
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

// Module-level cache: persists as long as the page is open.
// Re-flipping a card never re-fetches — second flip is always instant.
const defCache = new Map<string, { korean: string; english: string }>();

// Fetches Korean meaning from the edge function on first flip only.
// englishHint: already-stored English definition, shown immediately.
function VocabDefinitionFull({ word, englishHint }: { word: string; englishHint?: string | null }) {
  const cached = defCache.get(word);
  const [result, setResult] = useState<{ korean: string; english: string } | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (defCache.has(word)) return; // already cached — nothing to fetch
    supabase.functions.invoke('ocr-extract', {
      body: { word, mode: 'define_word' },
    })
      .then(({ data }) => {
        const d = data as { english: string; korean: string };
        defCache.set(word, d);
        setResult(d);
      })
      .catch(() => {
        const fallback = { english: englishHint ?? '', korean: '(조회 실패)' };
        defCache.set(word, fallback);
        setResult(fallback);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word]);

  const displayEnglish = result?.english || englishHint || null;

  return (
    <div className="space-y-1">
      {loading
        ? <div className="text-xs text-indigo-400 animate-pulse">한국어 뜻 찾는 중…</div>
        : result?.korean && <div className="text-sm font-semibold text-indigo-800 leading-snug">🇰🇷 {result.korean}</div>
      }
      {displayEnglish && (
        <div className="text-xs text-gray-500 leading-snug mt-1">🇺🇸 {displayEnglish}</div>
      )}
    </div>
  );
}
