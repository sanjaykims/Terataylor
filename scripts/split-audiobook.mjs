// Split ONE full-book audio file (mp3/mp4/m4a — anything ffmpeg reads) into the
// per-lesson chapter slots. Pipeline: mint a temp Deepgram key via the
// deepgram-listen edge function → transcribe the stored file by URL → locate the
// "Chapter N" announcements that begin lessons 2..K → cut with ffmpeg (audio
// only, re-encoded to MP3) → upsert each segment to v1/<book>/ch<n>.mp3 → set
// the chapter audio KV keys → clear stale timings.
//
// Runs in GitHub Actions (open network; the dev sandbox can't reach Supabase).
// Uses only the public anon key. Exits GREEN with a "not uploaded yet" notice
// when the source file is absent, so the push that adds/edits this tool doesn't
// produce a misleading red run before the user has uploaded the audiobook.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const SUPABASE_URL = 'https://aeygqjuhqjvlhjrslbxd.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleWdxanVocWp2bGhqcnNsYnhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NjQ4MDUsImV4cCI6MjA5NTE0MDgwNX0.Yf2nzQ8prYmUx7kI7vDp1lTlxAq3wWb9GeEKn65N7aY';

const bookId  = process.env.BOOK_ID  || 'coraline';
const srcPath = process.env.SRC_PATH || `v1/${bookId}/ch1.mp3`;
// Book chapters that START lessons 2..K (lesson 1 starts at 0:00).
const boundaries = (process.env.BOUNDARIES || '3,5,7,10,12').split(',').map(Number);

const sbHeaders = { Authorization: `Bearer ${ANON}`, apikey: ANON };
const REST = `${SUPABASE_URL}/rest/v1/taylor_app_data`;
const publicUrlOf = (p) => `${SUPABASE_URL}/storage/v1/object/public/taylor-audio/${p}`;
const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// word → number for spoken chapter numbers 1..30 ("three", "twenty-three", "23")
const ONES = ['','one','two','three','four','five','six','seven','eight','nine'];
const TEENS = ['ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const WORD2NUM = new Map();
for (let n = 1; n <= 30; n++) {
  let w = '';
  if (n < 10) w = ONES[n];
  else if (n < 20) w = TEENS[n - 10];
  else w = ONES[n % 10] ? `twenty-${ONES[n % 10]}` : 'twenty';
  if (n === 30) w = 'thirty';
  WORD2NUM.set(w, n); WORD2NUM.set(w.replace('-', ' '), n); WORD2NUM.set(String(n), n);
}

// ── 0. Source present? ───────────────────────────────────────────────────────
const head = await fetch(publicUrlOf(srcPath), { method: 'HEAD' });
if (!head.ok) {
  console.log(`Source ${srcPath} not found (${head.status}) — not uploaded yet. Nothing to do.`);
  process.exit(0);
}
const srcBytes = Number(head.headers.get('content-length') || 0);
console.log(`▶ splitting ${srcPath} (${(srcBytes / 1_048_576).toFixed(1)} MB) into ${boundaries.length + 1} lessons`);

// ── 1. Temp Deepgram key → transcribe by URL ────────────────────────────────
const keyRes = await fetch(`${SUPABASE_URL}/functions/v1/deepgram-listen`, {
  method: 'POST',
  headers: { ...sbHeaders, 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode: 'get_temp_key' }),
});
const keyData = await keyRes.json().catch(() => ({}));
if (!keyRes.ok || !keyData.tempKey) fail(`temp key: ${keyRes.status} ${JSON.stringify(keyData)}`);
console.log('✓ temp Deepgram key issued');

const dgRes = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true', {
  method: 'POST',
  headers: { Authorization: `Token ${keyData.tempKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: publicUrlOf(srcPath) }),
});
if (!dgRes.ok) fail(`Deepgram: ${dgRes.status} ${await dgRes.text()}`);
const dgData = await dgRes.json();
const words = dgData?.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];
if (!words.length) fail('Deepgram returned no words');
console.log(`✓ transcribed — ${words.length} words`);

// ── 2. Collect "chapter <N>" announcements ──────────────────────────────────
const tok = (i) => (words[i]?.word ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '');
const candidates = [];
for (let i = 0; i < words.length - 1; i++) {
  if (tok(i) !== 'chapter') continue;
  const two = `${tok(i + 1)} ${tok(i + 2)}`.trim();
  const n = WORD2NUM.get(two) ?? WORD2NUM.get(tok(i + 1));
  if (n !== undefined) candidates.push({ n, start: words[i].start });
}
console.log(`✓ ${candidates.length} chapter announcements found:`,
  candidates.map(c => `Ch.${c.n}@${mmss(c.start)}`).join(' '));

// Each boundary: first announcement of that chapter AFTER the previous cut.
const cuts = [];
let prev = 0;
for (const b of boundaries) {
  const hit = candidates.find(c => c.n === b && c.start > prev + 10);
  if (!hit) fail(`"Chapter ${b}" announcement not found after ${mmss(prev)}`);
  const cut = Math.max(0, hit.start - 0.5);
  cuts.push(cut);
  prev = hit.start;
  console.log(`   lesson boundary Ch.${b} → ${mmss(cut)}`);
}

// ── 3. Download source, cut + transcode each lesson to MP3 ──────────────────
const buf = Buffer.from(await (await fetch(publicUrlOf(srcPath))).arrayBuffer());
writeFileSync('src.bin', buf);
const total = parseFloat(execFileSync('ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', 'src.bin']).toString().trim());
console.log(`✓ downloaded — duration ${mmss(total)}`);

const starts = [0, ...cuts];
const ends   = [...cuts, total];
for (let k = 0; k < starts.length; k++) {
  const out = `ch${k + 1}.mp3`;
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-ss', String(starts[k]), '-to', String(ends[k]), '-i', 'src.bin',
    '-vn', '-c:a', 'libmp3lame', '-q:a', '4', out,
  ]);
  console.log(`✓ ch0${k + 1}: ${mmss(starts[k])}–${mmss(ends[k])} (${mmss(ends[k] - starts[k])})`);
}

// ── 4. Upload segments; set audio KV; clear stale timings ───────────────────
for (let k = 1; k <= starts.length; k++) {
  const path = `v1/${bookId}/ch${k}.mp3`;
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/taylor-audio/${path}`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Content-Type': 'audio/mpeg', 'x-upsert': 'true' },
    body: readFileSync(`ch${k}.mp3`),
  });
  if (!up.ok) fail(`upload ch${k}: ${up.status} ${await up.text()}`);
}
console.log('✓ all segments uploaded');

const kv = [];
for (let k = 1; k <= starts.length; k++) {
  kv.push({ key: `chapter_${bookId}_${k}_audio`, value: publicUrlOf(`v1/${bookId}/ch${k}.mp3`) });
}
const kvRes = await fetch(REST, {
  method: 'POST',
  headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(kv),
});
if (!kvRes.ok) fail(`KV upsert: ${kvRes.status} ${await kvRes.text()}`);
for (let k = 1; k <= starts.length; k++) {
  await fetch(`${REST}?key=eq.chapter_${bookId}_${k}_times`, { method: 'DELETE', headers: sbHeaders });
}
console.log('✓ audio keys set, stale timings cleared — done');
