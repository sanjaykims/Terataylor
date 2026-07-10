// Trim the head of a stored chapter MP3 so it starts at a given book-chapter
// announcement. Runs in GitHub Actions (see .github/workflows/trim-audio-head.yml)
// because that runner has open network access to Supabase/Deepgram, unlike the
// sandboxed dev session. Uses only the public anon key (already public in
// src/lib/supabase.ts) + the deepgram-listen temp-key mode.
//
// Steps: mint a temp Deepgram key → transcribe the stored file by URL → locate
// the "Chapter N" announcement → ffmpeg-copy from that point → re-upload
// (upsert) → clear the stale per-sentence timings key.
//
// Idempotent: if the announcement is already within the first MIN_CUT_S seconds,
// the file already starts at the target chapter and nothing is changed.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const SUPABASE_URL = 'https://aeygqjuhqjvlhjrslbxd.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleWdxanVocWp2bGhqcnNsYnhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NjQ4MDUsImV4cCI6MjA5NTE0MDgwNX0.Yf2nzQ8prYmUx7kI7vDp1lTlxAq3wWb9GeEKn65N7aY';

const bookId   = process.env.BOOK_ID || 'edward';
const lesson   = parseInt(process.env.LESSON || '6', 10);
const targetCh = parseInt(process.env.TARGET_BOOK_CH || '23', 10);
const MIN_CUT_S = 5; // announcement already this close to 0 → nothing to trim

const audioPath = `v1/${bookId}/ch${lesson}.mp3`;
const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/taylor-audio/${audioPath}`;

const sbHeaders = { Authorization: `Bearer ${ANON}`, apikey: ANON };

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// Spelled-out + digit forms of a chapter number (Deepgram smart_format usually
// emits digits, but cover both).
function numberForms(n) {
  const ones  = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens  = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const forms = new Set([String(n)]);
  let word = '';
  if (n < 10) word = ones[n];
  else if (n < 20) word = teens[n - 10];
  else word = ones[n % 10] ? `${tens[Math.floor(n / 10)]}-${ones[n % 10]}` : tens[Math.floor(n / 10)];
  if (word) { forms.add(word); forms.add(word.replace('-', ' ')); }
  return [...forms];
}

function findAnnouncement(words, ch) {
  const forms = numberForms(ch);
  const tok = i => (words[i]?.word ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const matches = i => forms.includes(tok(i)) || forms.includes(`${tok(i)} ${tok(i + 1)}`.trim());
  for (let i = 0; i < words.length - 1; i++) {
    if (tok(i) === 'chapter' && matches(i + 1)) return Math.max(0, words[i].start - 0.5);
  }
  // Fallback only when a bare number is spoken >30s in AND after a clear pause
  // (>1s), so a number flowing inside prose isn't mistaken for the heading.
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].start;
    if (words[i].start > 30 && gap > 1.0 && matches(i)) return Math.max(0, words[i].start - 0.5);
  }
  return null;
}

const dur = f => parseFloat(execFileSync('ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

console.log(`▶ ${audioPath}: trim head so it starts at book chapter ${targetCh}`);

// 1. Temp Deepgram key (browser-direct pattern; avoids the edge-fn timeout)
const keyRes = await fetch(`${SUPABASE_URL}/functions/v1/deepgram-listen`, {
  method: 'POST',
  headers: { ...sbHeaders, 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode: 'get_temp_key' }),
});
const keyData = await keyRes.json().catch(() => ({}));
if (!keyRes.ok || !keyData.tempKey) fail(`temp key: ${keyRes.status} ${JSON.stringify(keyData)}`);
console.log('✓ temp Deepgram key issued');

// 2. Transcribe the stored file by URL
const dgRes = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true', {
  method: 'POST',
  headers: { Authorization: `Token ${keyData.tempKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: publicUrl }),
});
if (!dgRes.ok) fail(`Deepgram: ${dgRes.status} ${await dgRes.text()}`);
const dgData = await dgRes.json();
const words = dgData?.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];
if (!words.length) fail('Deepgram returned no words');
console.log(`✓ transcribed — ${words.length} words`);

// 3. Locate the target chapter announcement
const cut = findAnnouncement(words, targetCh);
if (cut === null) fail(`"Chapter ${targetCh}" announcement not found in audio`);
console.log(`✓ Chapter ${targetCh} starts at ${mmss(cut)} (${cut.toFixed(1)}s)`);
if (cut < MIN_CUT_S) {
  console.log(`✓ file already starts at chapter ${targetCh} — nothing to trim`);
  process.exit(0);
}

// 4. Download and cut from the announcement (stream copy, no re-encode)
const inBuf = Buffer.from(await (await fetch(publicUrl)).arrayBuffer());
writeFileSync('in.mp3', inBuf);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(cut), '-i', 'in.mp3', '-c', 'copy', 'out.mp3']);
console.log(`✓ trimmed: ${mmss(dur('in.mp3'))} → ${mmss(dur('out.mp3'))}`);

// 5. Upsert back to Storage (same path → same URL; client cache-busts with ?t=)
const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/taylor-audio/${audioPath}`, {
  method: 'POST',
  headers: { ...sbHeaders, 'Content-Type': 'audio/mpeg', 'x-upsert': 'true' },
  body: readFileSync('out.mp3'),
});
if (!upRes.ok) fail(`upload: ${upRes.status} ${await upRes.text()}`);
console.log('✓ uploaded');

// 6. Clear stale per-sentence timings so highlights fall back to estimates
//    until 음성 분석 is re-run on the trimmed file.
await fetch(`${SUPABASE_URL}/rest/v1/taylor_app_data?key=eq.chapter_${bookId}_${lesson}_times`, {
  method: 'DELETE', headers: sbHeaders,
});
console.log(`✓ cleared chapter_${bookId}_${lesson}_times — done`);
