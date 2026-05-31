import { supabase } from './supabase';
import { csGet, csSet, csDel, csDelPattern, csSetBatch, csKeyExists, csGetKeysByPattern } from './cloudStorage';
import type { BookId } from '../data/syllabus';

export async function saveChapterEn(bookId: BookId, lesson: number, text: string): Promise<void> {
  if (!text.trim()) return;
  await csSet(`chapter_${bookId}_${lesson}_en`, text);
}

export async function saveChapterKo(bookId: BookId, lesson: number, text: string): Promise<void> {
  if (!text.trim()) return;
  await csSet(`chapter_${bookId}_${lesson}_ko`, text);
}

export async function loadChapterEn(bookId: BookId, lesson: number): Promise<string | null> {
  const { data } = await supabase
    .from('taylor_app_data')
    .select('value')
    .eq('key', `chapter_${bookId}_${lesson}_en`)
    .maybeSingle();
  return (data as { value: string } | null)?.value ?? null;
}

export async function loadChapterKo(bookId: BookId, lesson: number): Promise<string | null> {
  const { data } = await supabase
    .from('taylor_app_data')
    .select('value')
    .eq('key', `chapter_${bookId}_${lesson}_ko`)
    .maybeSingle();
  return (data as { value: string } | null)?.value ?? null;
}

export async function hasBook(bookId: BookId): Promise<boolean> {
  return csKeyExists(`chapter_${bookId}_%_en`);
}

export async function clearBook(bookId: BookId): Promise<void> {
  await csDelPattern(`chapter_${bookId}_`);
}

export async function getTranslatedChapters(bookId: BookId): Promise<number[]> {
  const keys = await csGetKeysByPattern(`chapter_${bookId}_%_ko`);
  return keys
    .map(k => {
      const m = k.match(/chapter_\w+_(\d+)_ko/);
      return m ? parseInt(m[1]) : null;
    })
    .filter((n): n is number => n !== null);
}

export async function saveChapterCount(bookId: BookId, count: number): Promise<void> {
  await csSet(`chapter_${bookId}_count`, String(count));
}

export async function loadChapterCount(bookId: BookId): Promise<number> {
  const val = await csGet(`chapter_${bookId}_count`);
  if (val) return parseInt(val);
  // Fallback: count existing chapter keys (for data saved before count tracking)
  const keys = await csGetKeysByPattern(`chapter_${bookId}_%_en`);
  return keys.length;
}

// Batch-save all English chapter texts after PDF extraction.
export async function saveBookChapters(
  bookId: BookId,
  chapters: { chapter: number; text: string }[],
): Promise<void> {
  await csSetBatch(
    chapters
      .filter(c => c.text.trim())
      .map(c => ({ key: `chapter_${bookId}_${c.chapter}_en`, value: c.text })),
  );
}

// One-time localStorage → Supabase migration (runs once per device, harmless to re-run).
export async function migrateChaptersFromLocalStorage(): Promise<void> {
  const entries: { key: string; value: string }[] = [];
  const bookIds = ['edward', 'coraline'] as const;
  for (const bookId of bookIds) {
    for (let i = 1; i <= 12; i++) {
      for (const lang of ['en', 'ko'] as const) {
        const val = localStorage.getItem(`taylor_ch_${bookId}_${i}_${lang}`);
        if (val?.trim()) entries.push({ key: `chapter_${bookId}_${i}_${lang}`, value: val });
      }
    }
  }
  if (entries.length > 0) await csSetBatch(entries);
}

// Re-export csDel so callers don't need to import cloudStorage directly.
export { csDel as deleteKey };
