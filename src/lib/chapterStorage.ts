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
  // Remove any chapter audio files from Storage before dropping the marker rows.
  const audioChapters = await getChaptersWithAudio(bookId).catch(() => [] as number[]);
  if (audioChapters.length > 0) {
    await supabase.storage
      .from('taylor-audio')
      .remove(audioChapters.map(n => `v1/${bookId}/ch${n}.mp3`))
      .catch(() => {});
  }
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

// ── Chapter audio (mp3) ───────────────────────────────────────────────────
// Stored in the 'taylor-audio' Storage bucket under v1/<book>/ch<n>.mp3.
// We keep a marker row in taylor_app_data so we can list which chapters have
// audio without hitting Storage.
const AUDIO_BUCKET = 'taylor-audio';
const audioPath = (bookId: BookId, chapter: number) => `v1/${bookId}/ch${chapter}.mp3`;

export async function saveChapterAudio(bookId: BookId, chapter: number, file: File): Promise<string> {
  const path = audioPath(bookId, chapter);
  const { error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(path, file, { upsert: true, contentType: 'audio/mpeg' });
  if (error) throw error;
  const { data } = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(path);
  await csSet(`chapter_${bookId}_${chapter}_audio`, data.publicUrl);
  return data.publicUrl;
}

export async function loadChapterAudio(bookId: BookId, chapter: number): Promise<string | null> {
  const url = await csGet(`chapter_${bookId}_${chapter}_audio`);
  return url ? `${url}?t=${Date.now()}` : null; // cache-bust so re-uploads show
}

export async function deleteChapterAudio(bookId: BookId, chapter: number): Promise<void> {
  await supabase.storage.from(AUDIO_BUCKET).remove([audioPath(bookId, chapter)]).catch(() => {});
  await csDel(`chapter_${bookId}_${chapter}_audio`).catch(() => {});
}

export async function getChaptersWithAudio(bookId: BookId): Promise<number[]> {
  const keys = await csGetKeysByPattern(`chapter_${bookId}_%_audio`);
  return keys
    .map(k => { const m = k.match(/chapter_\w+_(\d+)_audio/); return m ? parseInt(m[1]) : null; })
    .filter((n): n is number => n !== null);
}

// Per-sentence start times (seconds) derived from real speech alignment.
export async function saveChapterTimings(bookId: BookId, chapter: number, times: number[]): Promise<void> {
  await csSet(`chapter_${bookId}_${chapter}_times`, JSON.stringify(times));
}

export async function loadChapterTimings(bookId: BookId, chapter: number): Promise<number[] | null> {
  const raw = await csGet(`chapter_${bookId}_${chapter}_times`);
  if (!raw) return null;
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a as number[] : null; } catch { return null; }
}

export async function deleteChapterTimings(bookId: BookId, chapter: number): Promise<void> {
  await csDel(`chapter_${bookId}_${chapter}_times`).catch(() => {});
}

// Per-lesson curated vocabulary (set by teacher / pre-loaded per chapter).
export async function saveChapterVocab(bookId: BookId, chapter: number, vocab: unknown[]): Promise<void> {
  await csSet(`chapter_${bookId}_${chapter}_vocab`, JSON.stringify(vocab));
}

export async function loadChapterVocab(bookId: BookId, chapter: number): Promise<unknown[] | null> {
  const raw = await csGet(`chapter_${bookId}_${chapter}_vocab`);
  if (!raw) return null;
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : null; } catch { return null; }
}


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
