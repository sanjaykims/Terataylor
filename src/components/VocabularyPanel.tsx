import { useState, useMemo, useCallback, useRef } from 'react';
import { extractVocabulary } from '../utils/textUtils';
import { supabase } from '../lib/supabase';
import { csGet, csSet } from '../lib/cloudStorage';
import type { VocabItem } from '../lib/types';

interface Props {
  text: string;
  vocab?: VocabItem[] | null;
}

// Card display states
// 0: word only  1: word + English  2: word + English + Korean
type CardState = 0 | 1 | 2;

interface DefEntry { en: string; ko: string; loading: boolean }

const isKorean = (s: string) => /[가-힣]/.test(s);

// Session-level memory cache (survives re-renders, cleared on page refresh)
const sessionCache = new Map<string, { en: string; ko: string }>();

export default function VocabularyPanel({ text, vocab }: Props) {
  const words = useMemo(
    () => (vocab?.length ? vocab : extractVocabulary(text)) as
      { word: string; definition?: string; korean?: string; count?: number }[],
    [vocab, text],
  );

  const [cardStates, setCardStates] = useState<Map<number, CardState>>(() => new Map());
  const [studied,    setStudied]    = useState<Set<number>>(new Set());
  const [defs,       setDefs]       = useState<Map<number, DefEntry>>(() => new Map());

  // Track which indices have had loadDef triggered (per component instance)
  const loadTriggered = useRef(new Set<number>());

  const getState = (i: number): CardState => cardStates.get(i) ?? 0;
  const setCardState = (i: number, s: CardState) =>
    setCardStates(prev => new Map(prev).set(i, s));

  // Load definition for word i — checks memory → Supabase → API in order.
  const loadDef = useCallback(async (i: number) => {
    if (loadTriggered.current.has(i)) return;
    loadTriggered.current.add(i);

    const item = words[i];
    if (!item) return;

    // ── Already has Korean from v6 extraction ──────────────────────────
    if (item.korean) {
      setDefs(prev => new Map(prev).set(i, {
        en: item.definition ?? '',
        ko: item.korean!,
        loading: false,
      }));
      return;
    }

    // ── Legacy: definition field contains Korean text ──────────────────
    if (item.definition && isKorean(item.definition)) {
      setDefs(prev => new Map(prev).set(i, { en: '', ko: item.definition!, loading: false }));
      return;
    }

    // ── English definition stored, need Korean from cache / API ─────────
    const knownEn = item.definition && !isKorean(item.definition) ? item.definition : '';
    const dbKey   = `vocab_def_${item.word.toLowerCase()}`;

    // 1. Session memory cache — instant
    const mem = sessionCache.get(item.word.toLowerCase());
    if (mem) {
      setDefs(prev => new Map(prev).set(i, { en: knownEn || mem.en, ko: mem.ko, loading: false }));
      return;
    }

    // Show English immediately while loading Korean
    setDefs(prev => new Map(prev).set(i, { en: knownEn, ko: '', loading: true }));

    // 2. Supabase persistent cache
    try {
      const stored = await csGet(dbKey);
      if (stored) {
        const parsed = JSON.parse(stored) as { en: string; ko: string };
        sessionCache.set(item.word.toLowerCase(), parsed);
        setDefs(prev => new Map(prev).set(i, {
          en: knownEn || parsed.en,
          ko: parsed.ko,
          loading: false,
        }));
        return;
      }
    } catch { /* fall through */ }

    // 3. API call — result is persisted to Supabase for all future loads
    try {
      const { data } = await supabase.functions.invoke('ocr-extract', {
        body: { word: item.word, mode: 'define_word' },
      });
      const d = data as { english: string; korean: string };
      const result = { en: knownEn || d.english || '', ko: d.korean || '' };
      await csSet(dbKey, JSON.stringify(result)).catch(() => {});
      sessionCache.set(item.word.toLowerCase(), result);
      setDefs(prev => new Map(prev).set(i, { ...result, loading: false }));
    } catch {
      setDefs(prev => new Map(prev).set(i, { en: knownEn, ko: '(조회 실패)', loading: false }));
    }
  }, [words]);

  // ── Click handlers ────────────────────────────────────────────────────
  const handleCardClick = (i: number) => {
    if (studied.has(i)) return;
    const s = getState(i);
    if (s === 0) { setCardState(i, 1); loadDef(i); }
    else if (s === 1) { setCardState(i, 2); }
    // s === 2: clicking background does nothing
  };

  // Click English text → remove English (back to word-only)
  const handleEnClick = (e: React.MouseEvent, i: number) => {
    e.stopPropagation();
    setCardState(i, 0);
  };

  // Click Korean text → remove Korean only (back to English)
  const handleKoClick = (e: React.MouseEvent, i: number) => {
    e.stopPropagation();
    setCardState(i, 1);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {vocab?.length
            ? <><strong className="text-indigo-600">책 지정 단어 {words.length}개</strong> · 카드를 클릭해 뜻을 확인하세요</>
            : <>본문에서 <strong className="text-indigo-600">{words.length}개</strong> 단어 추출</>}
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
          const state     = getState(i);
          const def       = defs.get(i);
          const isStudied = studied.has(i);

          return (
            <div key={item.word + i}
              onClick={() => handleCardClick(i)}
              className={`relative rounded-xl p-4 cursor-pointer transition-all select-none border-2 ${
                isStudied
                  ? 'bg-emerald-50 border-emerald-300 opacity-70'
                  : state > 0
                  ? 'bg-indigo-50 border-indigo-300 shadow-md'
                  : 'bg-white border-gray-100 hover:border-indigo-200 hover:shadow-sm'
              }`}>

              {/* ✓ button */}
              <button onClick={e => toggleStudied(e, i)}
                className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all ${
                  isStudied ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}>✓</button>

              {/* Word */}
              <div className={`font-bold text-base pr-7 ${isStudied ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                {item.word}
              </div>
              {'count' in item && item.count && item.count > 1 && (
                <div className="text-xs text-gray-400">{item.count}회</div>
              )}

              {/* English — state 1 or 2 */}
              {state >= 1 && !isStudied && (
                <div className="mt-2 pt-2 border-t border-indigo-200">
                  {def?.en ? (
                    <div
                      onClick={e => handleEnClick(e, i)}
                      title="클릭하면 사라져요"
                      className="text-xs text-gray-600 leading-snug cursor-pointer hover:line-through hover:text-gray-400 transition-all">
                      🇺🇸 {def.en}
                    </div>
                  ) : def?.loading ? (
                    <div className="text-xs text-indigo-300 animate-pulse">찾는 중…</div>
                  ) : null}

                  {/* Nudge to second click */}
                  {state === 1 && !def?.loading && (
                    <div className="mt-1 text-xs text-indigo-300">한 번 더 클릭 → 🇰🇷</div>
                  )}
                </div>
              )}

              {/* Korean — state 2 only */}
              {state === 2 && !isStudied && (
                <div className="mt-1">
                  {def?.loading ? (
                    <div className="text-xs text-indigo-400 animate-pulse">한국어 뜻 찾는 중…</div>
                  ) : def?.ko ? (
                    <div
                      onClick={e => handleKoClick(e, i)}
                      title="클릭하면 사라져요"
                      className="text-sm font-semibold text-indigo-800 leading-snug cursor-pointer hover:line-through hover:text-indigo-400 transition-all">
                      🇰🇷 {def.ko}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 text-center">
        💡 1번 클릭 → 영어 뜻 &nbsp;·&nbsp; 2번 클릭 → 한국어 뜻 &nbsp;·&nbsp; 각 뜻을 클릭하면 사라져요
      </p>
    </div>
  );
}
