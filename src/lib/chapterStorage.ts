import type { BookId } from '../data/syllabus';

const key = (bookId: BookId, lesson: number, lang: 'en' | 'ko') =>
  `taylor_ch_${bookId}_${lesson}_${lang}`;

export function saveChapterEn(bookId: BookId, lesson: number, text: string): void {
  try { localStorage.setItem(key(bookId, lesson, 'en'), text); } catch { /* quota */ }
}

export function saveChapterKo(bookId: BookId, lesson: number, text: string): void {
  if (!text.trim()) return;
  try { localStorage.setItem(key(bookId, lesson, 'ko'), text); } catch { /* quota */ }
}

export function loadChapterEn(bookId: BookId, lesson: number): string | null {
  return localStorage.getItem(key(bookId, lesson, 'en'));
}

export function loadChapterKo(bookId: BookId, lesson: number): string | null {
  return localStorage.getItem(key(bookId, lesson, 'ko'));
}

export function hasBook(bookId: BookId): boolean {
  for (let i = 1; i <= 12; i++) {
    if (localStorage.getItem(key(bookId, i, 'en'))) return true;
  }
  return false;
}

export function clearBook(bookId: BookId): void {
  for (let i = 1; i <= 12; i++) {
    localStorage.removeItem(key(bookId, i, 'en'));
    localStorage.removeItem(key(bookId, i, 'ko'));
  }
}
