// Decides how much of the Coraline World intro Taylor sees on a given app
// open. The whole point of the cinematic journey is to make him *want* to
// study — forcing him through five scroll-scenes every single time he opens
// the app to do homework would do the opposite. So:
//   - the very first visit ever gets the full five-scene journey (the "wow")
//   - the first visit of each new day gets a short, warm "welcome back" beat
//     that surfaces the streak and gets him studying fast
//   - any later visit the same day skips straight into the app — his time
//     matters more than a repeat animation
// Always re-watchable in full via the header's 🌙 다른 세계 button.

import { kstToday } from '../data/syllabus';

const EVER_KEY = 'taylor_world_ever_seen';
const DAY_KEY  = 'taylor_world_last_day';

export type WorldMode = 'full' | 'return' | null;

export function decideWorldMode(): WorldMode {
  let everSeen: boolean;
  let lastDay: string | null;
  try {
    everSeen = localStorage.getItem(EVER_KEY) === '1';
    lastDay = localStorage.getItem(DAY_KEY);
  } catch { return 'full'; }

  if (!everSeen) return 'full';
  if (lastDay !== kstToday()) return 'return';
  return null;
}

/** Call once Taylor has entered the app, whichever mode was shown. */
export function markWorldSeen(): void {
  try {
    localStorage.setItem(EVER_KEY, '1');
    localStorage.setItem(DAY_KEY, kstToday());
  } catch { /* ignore */ }
}
