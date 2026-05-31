import { supabase } from './supabase';
import { csSet, csDel, csDelPattern, csSetBatch, csKeyExists, csGetKeysByPattern } from './cloudStorage';
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

export async function getTranslatedLessons(bookId: BookId): Promise<number[]> {
  const keys = await csGetKeysByPattern(`chapter_${bookId}_%_ko`);
  return keys
    .map(k => {
      const m = k.match(/chapter_\w+_(\d+)_ko/);
      return m ? parseInt(m[1]) : null;
    })
    .filter((n): n is number => n !== null);
}

// Batch-save all English chapter texts after PDF extraction.
export async function saveBookChapters(
  bookId: BookId,
  chapters: { lesson: number; text: string }[],
): Promise<void> {
  await csSetBatch(
    chapters
      .filter(c => c.text.trim())
      .map(c => ({ key: `chapter_${bookId}_${c.lesson}_en`, value: c.text })),
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
