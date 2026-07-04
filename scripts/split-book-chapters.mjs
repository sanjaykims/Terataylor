// Split a book stored as ONE chapter blob (chapter_<book>_1_en) into per-lesson
// texts according to RANGES (book-chapter ranges per lesson). Runs in GitHub
// Actions (open network to Supabase; the dev sandbox is blocked). Uses the
// public anon key — the same access level the app itself has.
//
// Safety: aborts WITHOUT writing unless the number of detected chapter headings
// exactly matches the last book chapter in RANGES. After a successful split,
// re-running finds far fewer headings in slot 1 and aborts — i.e. idempotent.

const SUPABASE_URL = 'https://aeygqjuhqjvlhjrslbxd.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleWdxanVocWp2bGhqcnNsYnhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NjQ4MDUsImV4cCI6MjA5NTE0MDgwNX0.Yf2nzQ8prYmUx7kI7vDp1lTlxAq3wWb9GeEKn65N7aY';

const bookId = process.env.BOOK_ID || 'coraline';
// "1-2,3-4,5-6,7-9,10-11,12-13" → [[1,2],[3,4],...]
const RANGES = (process.env.RANGES || '1-2,3-4,5-6,7-9,10-11,12-13')
  .split(',').map(r => r.split('-').map(Number));
const lastCh = RANGES[RANGES.length - 1][1];

const headers = {
  Authorization: `Bearer ${ANON}`, apikey: ANON, 'Content-Type': 'application/json',
};
const REST = `${SUPABASE_URL}/rest/v1/taylor_app_data`;
const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

// Same shapes the app's CHAPTER_HEADING accepts: "Chapter One", number words,
// bare digits, Roman numerals ("I." needs its period — a lone "I" is a pronoun),
// each with an optional trailing period; whole line only.
const NUM_WORDS = ['one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen',
  'nineteen','twenty','twenty-one','twenty-two','twenty-three','twenty-four','twenty-five',
  'twenty-six','twenty-seven','twenty-eight','twenty-nine','thirty'];
const ROMAN = ['ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii','xiii','xiv','xv'];
const HEADING = new RegExp(
  `^(chapter\\s+\\w+\\.?|(?:${NUM_WORDS.join('|')})\\.?|\\d{1,2}\\.?|i\\.|(?:${ROMAN.join('|')})\\.?)$`, 'i');

// ── 1. Fetch the whole-book blob ────────────────────────────────────────────
const res = await fetch(`${REST}?key=eq.chapter_${bookId}_1_en&select=value`, { headers });
const rows = await res.json();
const text = rows?.[0]?.value;
if (!text) fail(`chapter_${bookId}_1_en not found`);
console.log(`✓ loaded chapter_${bookId}_1_en — ${text.length} chars`);

// ── 2. Locate chapter headings ──────────────────────────────────────────────
const lines = text.split('\n');
const headingIdx = [];
for (let i = 0; i < lines.length; i++) {
  if (HEADING.test(lines[i].trim())) headingIdx.push(i);
}
console.log(`✓ found ${headingIdx.length} heading lines (expected ${lastCh}):`);
headingIdx.slice(0, 20).forEach(i => console.log(`   line ${i}: "${lines[i].trim()}"`));
if (headingIdx.length !== lastCh) {
  fail(`heading count ${headingIdx.length} != expected ${lastCh} — not writing anything`);
}

// ── 3. Slice per book chapter (heading line included), group into lessons ───
const chapters = headingIdx.map((start, k) => {
  const end = k + 1 < headingIdx.length ? headingIdx[k + 1] : lines.length;
  return lines.slice(start, end).join('\n').trim();
});
const lessons = RANGES.map(([a, b]) => {
  const parts = chapters.slice(a - 1, b);
  // Drop the lesson's LEADING heading line (matches how Edward lesson texts
  // start with prose); interior chapter headings stay as natural dividers.
  parts[0] = parts[0].split('\n').slice(1).join('\n').trimStart();
  return parts.join('\n\n').trim();
});

lessons.forEach((t, i) => {
  const words = t.split(/\s+/).filter(Boolean).length;
  console.log(`   ch0${i + 1} (Ch.${RANGES[i][0]}~${RANGES[i][1]}): ${words} words — "${t.slice(0, 60).replace(/\n/g, ' ')}…"`);
  if (words < 200) fail(`lesson ${i + 1} looks too short (${words} words) — aborting before write`);
});

// ── 4. Write lesson texts + count; clear stale ko/times ─────────────────────
const upserts = lessons.map((t, i) => ({ key: `chapter_${bookId}_${i + 1}_en`, value: t }));
upserts.push({ key: `chapter_${bookId}_count`, value: String(RANGES.length) });
const up = await fetch(REST, {
  method: 'POST',
  headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(upserts),
});
if (!up.ok) fail(`upsert failed: ${up.status} ${await up.text()}`);
console.log(`✓ wrote ${RANGES.length} lesson texts + count`);

for (let i = 1; i <= RANGES.length; i++) {
  for (const suffix of ['ko', 'times']) {
    await fetch(`${REST}?key=eq.chapter_${bookId}_${i}_${suffix}`, { method: 'DELETE', headers });
  }
}
console.log('✓ cleared stale translations/timings — done');
