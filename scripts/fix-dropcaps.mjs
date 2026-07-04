// Clean PDF drop-cap artifacts at chapter openings in stored lesson texts.
// Print books render each chapter's first letter as a huge drop cap and the
// first phrase in small caps; PDF text extraction turns that into e.g.
//   "C ORALINE DISCOVERED THE DOOR   a little while after…"
//   "…THE DOOR O f the drawing room…"        (split word inside the caps run)
// This fixes each opening to normal prose: "Coraline discovered the door a…"
//
// Openings = the first content line of the text, plus the first content line
// after each interior chapter-heading line ("II.", "XII." …). Every change is
// logged before→after for auditing. Runs in GitHub Actions (Supabase reachable
// there); anon key only — same access the app has.

const SUPABASE_URL = 'https://aeygqjuhqjvlhjrslbxd.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleWdxanVocWp2bGhqcnNsYnhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NjQ4MDUsImV4cCI6MjA5NTE0MDgwNX0.Yf2nzQ8prYmUx7kI7vDp1lTlxAq3wWb9GeEKn65N7aY';

const bookId = process.env.BOOK_ID || 'coraline';
const COUNT = parseInt(process.env.CHAPTER_COUNT || '6', 10);

const headers = { Authorization: `Bearer ${ANON}`, apikey: ANON, 'Content-Type': 'application/json' };
const REST = `${SUPABASE_URL}/rest/v1/taylor_app_data`;
const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

// Proper nouns that may appear inside a chapter-opening caps run.
const PROPER = new Map(
  ['Coraline', 'Miss', 'Misses', 'Mr', 'Mrs', 'Spink', 'Forcible', 'Bobo', 'Lovat',
   'Edward', 'Tulane', 'Abilene', 'Pellegrina', 'Bryce', 'Sarah', 'Ruth', 'Nellie',
   'Lawrence', 'Bull', 'Lucy', 'Amos', 'Martin', 'Neal', 'Lolly', 'Marlene', 'God',
  ].map(w => [w.toLowerCase(), w]),
);

const HEADING_LINE = /^[ivxlc]+\.$|^\d{1,2}\.?$/i;

function sentenceCaseToken(tok, isFirst) {
  const lower = tok.toLowerCase();
  const word = (lower.match(/^[a-z]+/) ?? [''])[0];   // leading letters only
  const proper = PROPER.get(word);
  if (proper) return proper + lower.slice(word.length);
  return isFirst && word ? lower[0].toUpperCase() + lower.slice(1) : lower;
}

// Fix ONE opening line; returns the fixed line or null if nothing changed.
function fixOpeningLine(line) {
  const tokens = line.split(/\s+/).filter(Boolean);
  const before = tokens.join(' ');

  // 0) PDF extraction can split punctuation into its own token ("INSIDE ,",
  //    "CORALINE ’ S"). Re-attach: punctuation joins the previous token, and a
  //    lone letter after an apostrophe-ending token is a possessive 's.
  for (let k = tokens.length - 1; k > 0; k--) {
    if (/^[,.;:!?…”"’']+$/.test(tokens[k])) tokens.splice(k - 1, 2, tokens[k - 1] + tokens[k]);
  }
  for (let k = tokens.length - 1; k > 0; k--) {
    if (/[’']$/.test(tokens[k - 1]) && /^[A-Za-z]$/.test(tokens[k])) {
      tokens.splice(k - 1, 2, tokens[k - 1] + tokens[k]);
    }
  }

  // 1) Re-attach the drop cap: leading single capital + capital-starting word.
  while (tokens.length > 1 && /^[A-Z]$/.test(tokens[0]) && /^[A-Z]/.test(tokens[1])) {
    tokens.splice(0, 2, tokens[0] + tokens[1]);
  }

  // 2) Find the first small-caps run near the line start (ALL-CAPS words,
  //    punctuation ignored; lone "A"/"I" are real words and may sit inside it).
  const isCaps = (t) => {
    const letters = t.replace(/[^A-Za-z]/g, '');
    return letters.length > 0 && letters === letters.toUpperCase()
      && (letters.length >= 2 || letters === 'A' || letters === 'I');
  };
  let s = 0;
  while (s < Math.min(tokens.length, 8) && !isCaps(tokens[s])) s++;
  let j = s;
  while (j < tokens.length && isCaps(tokens[j])) j++;

  // 2b) Split word at the run's edge: "…DOOR O f the…" → "…DOOR Of the…".
  if (j < tokens.length - 1 && /^[A-Z]$/.test(tokens[j]) && /^[a-z]$/.test(tokens[j + 1])) {
    tokens.splice(j, 2, tokens[j] + tokens[j + 1]);
    j++;
  }

  // 3) Sentence-case the caps run (2+ words so normal prose is never touched).
  if (j - s >= 2) {
    for (let k = s; k < j; k++) tokens[k] = sentenceCaseToken(tokens[k], k === 0);
  }

  const after = tokens.join(' ');
  return after !== before ? after : null;
}

// Fix all openings in a chapter text; returns { text, changes: [before, after][] }.
function fixText(text) {
  const lines = text.split('\n');
  const changes = [];
  const openingIdx = [];
  const firstContent = (from) => {
    for (let i = from; i < lines.length; i++) if (lines[i].trim()) return i;
    return -1;
  };
  const start = firstContent(0);
  if (start >= 0) openingIdx.push(start);
  for (let i = 0; i < lines.length; i++) {
    if (HEADING_LINE.test(lines[i].trim())) {
      const next = firstContent(i + 1);
      if (next >= 0 && !openingIdx.includes(next)) openingIdx.push(next);
    }
  }
  for (const li of openingIdx) {
    const fixed = fixOpeningLine(lines[li]);
    if (fixed !== null) {
      changes.push([lines[li].slice(0, 70), fixed.slice(0, 70)]);
      lines[li] = fixed;
    }
  }
  return { text: lines.join('\n'), changes };
}

// ── Run over every lesson chapter ────────────────────────────────────────────
const upserts = [];
for (let ch = 1; ch <= COUNT; ch++) {
  const key = `chapter_${bookId}_${ch}_en`;
  const res = await fetch(`${REST}?key=eq.${key}&select=value`, { headers });
  const rows = await res.json();
  const text = rows?.[0]?.value;
  if (!text) { console.log(`- ${key}: not found, skipping`); continue; }
  const { text: fixed, changes } = fixText(text);
  if (changes.length === 0) { console.log(`- ${key}: no artifacts found`); continue; }
  console.log(`✓ ${key}: ${changes.length} opening(s) fixed`);
  for (const [before, after] of changes) {
    console.log(`    "${before}…"`);
    console.log(`  → "${after}…"`);
  }
  upserts.push({ key, value: fixed });
}

if (upserts.length === 0) { console.log('Nothing to write — all clean.'); process.exit(0); }

const up = await fetch(REST, {
  method: 'POST',
  headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(upserts),
});
if (!up.ok) fail(`upsert failed: ${up.status} ${await up.text()}`);
console.log(`✓ wrote ${upserts.length} updated chapter text(s) — done`);
