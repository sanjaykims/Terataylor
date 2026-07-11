// Daily study streak — a lightweight, offline habit-builder that rewards Taylor
// for opening the app every day. Stored in localStorage (a set of active
// 'YYYY-MM-DD' days in KST), so it works with no network and survives reloads.

import { kstToday } from '../data/syllabus';

const KEY = 'taylor_streak_v1';

type Store = { dates: string[] };

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw); if (Array.isArray(s?.dates)) return s; }
  } catch { /* ignore */ }
  return { dates: [] };
}

function save(s: Store) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

const dayNum = (s: string) => Math.round(Date.parse(`${s}T00:00:00Z`) / 86_400_000);
const addDays = (s: string, n: number) => new Date((dayNum(s) + n) * 86_400_000).toISOString().slice(0, 10);

/** Mark today as an active study day (idempotent). Call when Taylor shows up. */
export function recordVisit(): void {
  const today = kstToday();
  const s = load();
  if (!s.dates.includes(today)) {
    s.dates.push(today);
    s.dates.sort();
    if (s.dates.length > 90) s.dates = s.dates.slice(-90); // keep it small
    save(s);
  }
}

export type Streak = {
  count: number;                 // consecutive active days ending today (or yesterday)
  activeToday: boolean;
  best: number;                  // longest streak on record
  last7: { date: string; active: boolean; isToday: boolean }[];
};

export function getStreak(): Streak {
  const today = kstToday();
  const set = new Set(load().dates);

  // Current streak: count back from today, or from yesterday (a grace day so the
  // fire doesn't look "dead" before today's session is logged).
  const anchor = set.has(today) ? today : (set.has(addDays(today, -1)) ? addDays(today, -1) : null);
  let count = 0;
  if (anchor) { let d = anchor; while (set.has(d)) { count++; d = addDays(d, -1); } }

  // Best streak over the stored window.
  let best = 0, run = 0, prev: string | null = null;
  for (const d of [...set].sort()) {
    run = (prev && addDays(prev, 1) === d) ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, active: set.has(date), isToday: date === today };
  });

  return { count, activeToday: set.has(today), best, last7 };
}
