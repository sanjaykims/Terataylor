// Bulk-uploads the Bridge C1/C2 class audio into the taylor-audio bucket and
// points the app's per-lesson audio keys at it.
//
// WHY THIS EXISTS: the in-app flow uploads one mp3 at a time from the reader,
// which is fine when a single lesson's audio arrives with its textbook photos.
// A whole term's audio (30 files) arriving at once is a different job, and
// doing it by hand is 30 chances to put a file on the wrong lesson.
//
// Uses only the public anon key — the same key the browser already uploads
// with, so this grants CI nothing the app doesn't already have.
//
// FILENAME → SLOT MAPPING. Each Bridge lesson has two independent passages in
// the app (읽기 / 듣기), so each source file has to land in the right one. Per
// the curriculum flow in .claude/skills/bridge-study-guide:
//
//   C1 week = ... Reading (Skim → Summarize → Scan) ... Listening (Activate →
//   Comprehend → Scan) ...
//     Lesson<N>-skim.mp3        → reading   slot  (Skim is a Reading step)
//     Lesson<N>-comprehend.mp3  → listening slot  (Comprehend is a Listening step)
//
//   C2 Input day = Connect → Background listening → Focus reading → ...
//     Unit<U>-Lesson<L>-understand.mp3 → reading   slot  (the focus passage)
//     Unit<U>-Lesson<L>-build.mp3      → listening slot  (background/"build" audio)
//   C2 lessons flatten to a single index: ch = (U - 1) * LESSONS_PER_UNIT + L.
//
// Set DRY_RUN=1 to print the resolved plan without writing anything.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SUPABASE_URL = 'https://aeygqjuhqjvlhjrslbxd.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleWdxanVocWp2bGhqcnNsYnhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NjQ4MDUsImV4cCI6MjA5NTE0MDgwNX0.Yf2nzQ8prYmUx7kI7vDp1lTlxAq3wWb9GeEKn65N7aY';

const sbHeaders = { Authorization: `Bearer ${ANON}`, apikey: ANON };
const REST = `${SUPABASE_URL}/rest/v1/taylor_app_data`;
const BUCKET = 'taylor-audio';
const publicUrlOf = (p) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${p}`;
const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

const ROOT = process.env.AUDIO_DIR || 'assets/bridge-audio';
const DRY_RUN = process.env.DRY_RUN === '1';
const ONLY_BOOK = (process.env.ONLY_BOOK || '').trim(); // optional: bridge_c1 | bridge_c2
const LESSONS_PER_UNIT = Number(process.env.LESSONS_PER_UNIT || 2);

// A "slot" is one of the two passages a Bridge lesson owns in the reader.
// The storage path and the KV key both differ per slot, so they travel together.
const SLOT = {
  reading:   { path: (b, n) => `v1/${b}/ch${n}.mp3`,           key: (b, n) => `chapter_${b}_${n}_audio` },
  listening: { path: (b, n) => `v1/${b}/ch${n}_listening.mp3`, key: (b, n) => `chapter_${b}_${n}_listening_audio` },
};

// Returns { chapter, slot } or null when a filename doesn't match either book's
// naming. Unknown names are reported rather than silently skipped — a typo in a
// filename would otherwise mean a lesson quietly has no audio.
function resolve(bookId, filename) {
  const name = filename.replace(/\.mp3$/i, '');
  if (bookId === 'bridge_c1') {
    const m = name.match(/^Lesson(\d+)-(skim|comprehend)$/i);
    if (!m) return null;
    return { chapter: Number(m[1]), slot: m[2].toLowerCase() === 'skim' ? 'reading' : 'listening' };
  }
  if (bookId === 'bridge_c2') {
    const m = name.match(/^Unit(\d+)-Lesson(\d+)-(understand|build)$/i);
    if (!m) return null;
    const chapter = (Number(m[1]) - 1) * LESSONS_PER_UNIT + Number(m[2]);
    return { chapter, slot: m[3].toLowerCase() === 'understand' ? 'reading' : 'listening' };
  }
  return null;
}

const books = ['bridge_c1', 'bridge_c2'].filter(b => !ONLY_BOOK || b === ONLY_BOOK);
const plan = [];

for (const bookId of books) {
  const dir = join(ROOT, bookId);
  if (!existsSync(dir)) { console.log(`· ${bookId}: no ${dir}, skipping`); continue; }
  const files = readdirSync(dir).filter(f => /\.mp3$/i.test(f)).sort();
  for (const file of files) {
    const hit = resolve(bookId, file);
    if (!hit) fail(`${bookId}/${file}: filename doesn't match the expected pattern`);
    plan.push({ bookId, file, abs: join(dir, file), ...hit });
  }
}

if (plan.length === 0) fail('no mp3 files found to upload');

// Two files must never claim the same slot on the same lesson — that would mean
// one silently overwrote the other.
const seen = new Map();
for (const p of plan) {
  const id = `${p.bookId}:ch${p.chapter}:${p.slot}`;
  if (seen.has(id)) fail(`${p.file} and ${seen.get(id)} both map to ${id}`);
  seen.set(id, p.file);
}

plan.sort((a, b) => a.bookId.localeCompare(b.bookId) || a.chapter - b.chapter || a.slot.localeCompare(b.slot));
console.log(`Plan (${plan.length} files)${DRY_RUN ? ' — DRY RUN, nothing will be written' : ''}:`);
for (const p of plan) {
  console.log(`  ${p.bookId} L${String(p.chapter).padStart(2, '0')} ${p.slot.padEnd(9)} ← ${p.file}`);
}
if (DRY_RUN) process.exit(0);

// ── Upload ────────────────────────────────────────────────────────────────────
for (const p of plan) {
  const path = SLOT[p.slot].path(p.bookId, p.chapter);
  const body = readFileSync(p.abs);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Content-Type': 'audio/mpeg', 'x-upsert': 'true' },
    body,
  });
  if (!res.ok) fail(`upload ${path}: ${res.status} ${await res.text()}`);
  console.log(`✓ ${path} (${(body.length / 1024 / 1024).toFixed(1)} MB)`);
}

// ── Point the app's keys at the uploaded files ────────────────────────────────
const kv = plan.map(p => ({
  key: SLOT[p.slot].key(p.bookId, p.chapter),
  value: publicUrlOf(SLOT[p.slot].path(p.bookId, p.chapter)),
}));
const kvRes = await fetch(REST, {
  method: 'POST',
  headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(kv),
});
if (!kvRes.ok) fail(`KV upsert: ${kvRes.status} ${await kvRes.text()}`);
console.log(`✓ ${kv.length} audio keys set`);

// Sentence timings were aligned against whatever audio used to sit in the
// reading slot. New audio invalidates them, and stale timings highlight the
// wrong sentence rather than simply doing nothing — so drop them.
const readingChapters = plan.filter(p => p.slot === 'reading');
for (const p of readingChapters) {
  await fetch(`${REST}?key=eq.chapter_${p.bookId}_${p.chapter}_times`, { method: 'DELETE', headers: sbHeaders });
}
console.log(`✓ cleared stale timings for ${readingChapters.length} reading chapters — done`);
