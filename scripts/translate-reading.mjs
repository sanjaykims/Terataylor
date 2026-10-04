// Fills in the Korean column for reading passages that have English but no
// Korean yet — the same result as pressing "이 챕터 한국어로 번역하기" in the app
// on each lesson, done in one go.
//
// It mirrors the app's own translateSentences(): ONE sentence per request (so a
// sentence can never split across rows or shift the ones after it), stored one
// per line, index-aligned to splitToSentences(english). splitToSentences and
// looksLikeMetaReply are copied from src/components/BookReader.tsx — keep them
// identical, or the stored Korean will no longer line up with what the reader
// splits the English into.
//
// A lesson that already has Korean is never touched (a hand-corrected or
// previously generated translation is not overwritten); FORCE=1 + ONLY_LESSON
// re-translates one on purpose. DRY_RUN=1 lists what would be done.

const SUPABASE_URL = 'https://aeygqjuhqjvlhjrslbxd.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleWdxanVocWp2bGhqcnNsYnhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NjQ4MDUsImV4cCI6MjA5NTE0MDgwNX0.Yf2nzQ8prYmUx7kI7vDp1lTlxAq3wWb9GeEKn65N7aY';
const H = { Authorization: `Bearer ${ANON}`, apikey: ANON };
const REST = `${SUPABASE_URL}/rest/v1/taylor_app_data`;
const FN = `${SUPABASE_URL}/functions/v1/ocr-extract`;

const BOOK = (process.env.BOOK || 'bridge_c1').trim();
const DRY_RUN = process.env.DRY_RUN === '1';
const FORCE = process.env.FORCE === '1';
const ONLY_LESSON = (process.env.ONLY_LESSON || '').trim();
const fail = m => { console.error(`✗ ${m}`); process.exit(1); };

// ── copied from BookReader.tsx ───────────────────────────────────────────────
function splitToSentences(text) {
  const normalized = text.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim();
  if (!normalized) return [];
  return normalized
    .split(/(?<=[.!?…]['"”’]?)(?<!\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|Prof|Rev|Gen|Col|Sgt|Lt|Capt|vs|etc|Inc|Ltd)\.)(?<!\b[A-Z]\.)\s+(?=[A-Z"“‘'가-힣])/)
    .map(s => s.trim())
    .filter(Boolean);
}
function looksLikeMetaReply(ko, source) {
  if (!ko) return true;
  const hasHangul = /[가-힣]/.test(ko);
  if (/[A-Za-z]/.test(source) && !hasHangul) return true;
  if (/\b(I apologize|I'm sorry|target sentence|could you (?:please )?provide|appears to be (?:incomplete|a fragment)|transcription error|complete (?:sentence|thought)|please provide)\b/i.test(ko)) return true;
  if (ko.length > source.length * 6 + 120) return true;
  return false;
}

async function rows(pattern) {
  const r = await fetch(`${REST}?key=like.${encodeURIComponent(pattern)}&select=key,value`, { headers: H });
  if (!r.ok) fail(`read ${pattern}: ${r.status} ${await r.text()}`);
  return r.json();
}

const enRows = await rows(`chapter_${BOOK}_*_en`);
if (enRows.length === 0) fail(`no English passages found for ${BOOK} — check the query`);
const koKeys = new Set((await rows(`chapter_${BOOK}_*_ko`)).map(r => r.key));

const targets = [];
for (const r of enRows) {
  const m = r.key.match(/^chapter_.+_(\d+)_en$/);   // reading only: *_listening_en has a non-numeric tail
  if (!m) continue;
  const lesson = Number(m[1]);
  if (ONLY_LESSON && lesson !== Number(ONLY_LESSON)) continue;
  const koKey = `chapter_${BOOK}_${lesson}_ko`;
  if (koKeys.has(koKey) && !FORCE) { console.log(`· L${lesson}: already has Korean — skipping`); continue; }
  targets.push({ lesson, koKey, sentences: splitToSentences(r.value) });
}
targets.sort((a, b) => a.lesson - b.lesson);
if (targets.length === 0) { console.log('Nothing to do.'); process.exit(0); }
console.log(`${targets.length} lesson(s)${DRY_RUN ? ' — DRY RUN' : ''}:`);
for (const t of targets) console.log(`  L${t.lesson}: ${t.sentences.length} sentences`);
if (DRY_RUN) process.exit(0);

async function translateOne(sentences, i) {
  let last = 'no response';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 800 * attempt));
    try {
      const res = await fetch(FN, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'translate_one', sentence: sentences[i], prev: sentences[i - 1] ?? '', next: sentences[i + 1] ?? '' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) { last = body.error || `HTTP ${res.status}`; continue; }
      const ko = String(body.result ?? '').replace(/\s*\n\s*/g, ' ').trim();
      if (!looksLikeMetaReply(ko, sentences[i])) return ko;
      last = 'non-Korean reply';
    } catch (e) { last = e.message; }
  }
  console.error(`  ! sentence ${i + 1} left blank (${last})`);
  return '';
}

let failedLessons = 0;
for (const t of targets) {
  const ko = new Array(t.sentences.length).fill('');
  const queue = [...t.sentences.keys()];
  await Promise.all(Array.from({ length: 5 }, async () => {
    for (;;) { const i = queue.shift(); if (i === undefined) return; ko[i] = await translateOne(t.sentences, i); }
  }));
  const blanks = ko.filter(s => s === '').length;
  // Mostly-blank means the function was failing, not that the text is odd; storing
  // it would mark the lesson "translated" and hide the translate button.
  if (blanks > Math.max(2, t.sentences.length * 0.15)) { console.error(`✗ L${t.lesson}: ${blanks}/${t.sentences.length} blank — not saved`); failedLessons++; continue; }
  // Blank cell stored as a single space, never an empty line (see translateSentences).
  const value = ko.map(s => (s === '' ? ' ' : s)).join('\n');
  const w = await fetch(REST, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ key: t.koKey, value }]) });
  if (!w.ok) { console.error(`✗ L${t.lesson}: save failed ${w.status} ${await w.text()}`); failedLessons++; continue; }
  console.log(`✓ L${t.lesson}: ${t.sentences.length} sentences, ${blanks} blank`);
}
process.exit(failedLessons ? 1 : 0);
