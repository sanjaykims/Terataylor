// Split ONE full-book audio file (mp3/mp4/m4a — anything ffmpeg reads) into the
// per-lesson chapter slots. Pipeline: fetch the source (external share link OR
// the taylor-audio bucket) → mint a temp Deepgram key via the deepgram-listen
// edge function → transcribe the RAW BYTES → locate the "Chapter N"
// announcements that begin lessons 2..K → cut with ffmpeg (audio only,
// re-encoded to MP3) → upsert each segment to v1/<book>/ch<n>.mp3 → set the
// chapter audio KV keys → clear stale timings.
//
// SRC_URL exists because a full audiobook (e.g. 167 MB) exceeds the Supabase
// free-plan 50 MB upload limit: the big file never touches Supabase — only the
// cut segments (~20-30 MB each) are stored. Google Drive / Dropbox share links
// are rewritten to their direct-download forms automatically.
//
// Runs in GitHub Actions (open network; the dev sandbox can't reach Supabase).
// Uses only the public anon key. Exits GREEN with a "not uploaded yet" notice
// when no source is available, so the push that adds/edits this tool doesn't
// produce a misleading red run before the user has provided the audiobook.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const SUPABASE_URL = 'https://aeygqjuhqjvlhjrslbxd.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleWdxanVocWp2bGhqcnNsYnhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NjQ4MDUsImV4cCI6MjA5NTE0MDgwNX0.Yf2nzQ8prYmUx7kI7vDp1lTlxAq3wWb9GeEKn65N7aY';

const bookId  = process.env.BOOK_ID  || 'coraline';
const srcPath = process.env.SRC_PATH || `v1/${bookId}/ch1.mp3`;
const srcUrlRaw = (process.env.SRC_URL || '').trim();
// Book chapters that START lessons 2..K (lesson 1 starts at 0:00).
const boundaries = (process.env.BOUNDARIES || '3,5,7,10,12').split(',').map(Number);

// Rewrite common share links to direct-download URLs.
function directDownloadUrl(url) {
  const drive = url.match(/drive\.google\.com\/(?:file\/d\/([-\w]+)|open\?id=([-\w]+)|uc\?.*?id=([-\w]+))/);
  if (drive) {
    const id = drive[1] ?? drive[2] ?? drive[3];
    return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
  }
  if (/dropbox\.com/.test(url)) return url.replace(/[?&]dl=0/, m => m.replace('dl=0', 'dl=1'));
  return url;
}

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

// ── 0. Fetch the source (external link preferred, else the storage bucket) ──
const srcUrl = srcUrlRaw ? directDownloadUrl(srcUrlRaw) : publicUrlOf(srcPath);
if (!srcUrlRaw) {
  const head = await fetch(srcUrl, { method: 'HEAD' });
  if (!head.ok) {
    console.log(`Source ${srcPath} not found (${head.status}) and no SRC_URL given — nothing to do.`);
    process.exit(0);
  }
}
console.log(`▶ downloading source: ${srcUrlRaw ? srcUrl : srcPath}`);
const srcRes = await fetch(srcUrl);
if (!srcRes.ok) fail(`source download failed: ${srcRes.status}`);
const srcCT = srcRes.headers.get('content-type') ?? '';
if (/text\/html/.test(srcCT)) {
  fail('source link returned an HTML page, not the file — make sure the share link is set to "Anyone with the link"');
}
const buf = Buffer.from(await srcRes.arrayBuffer());
writeFileSync('src.bin', buf);
const total = parseFloat(execFileSync('ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', 'src.bin']).toString().trim());
console.log(`✓ downloaded ${(buf.length / 1_048_576).toFixed(1)} MB — duration ${mmss(total)} → ${boundaries.length + 1} lessons`);

// ── 1. Temp Deepgram key → transcribe the raw bytes ─────────────────────────
// (Key minted AFTER the download so its 120 s TTL isn't spent on the transfer.)
const keyRes = await fetch(`${SUPABASE_URL}/functions/v1/deepgram-listen`, {
  method: 'POST',
  headers: { ...sbHeaders, 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode: 'get_temp_key' }),
});
const keyData = await keyRes.json().catch(() => ({}));
if (!keyRes.ok || !keyData.tempKey) fail(`temp key: ${keyRes.status} ${JSON.stringify(keyData)}`);
console.log('✓ temp Deepgram key issued');

const nameForType = srcUrlRaw || srcPath;
const audioCT = /\.(m4a|m4b|mp4)\b/i.test(nameForType) ? 'audio/mp4'
  : /\.mp3\b/i.test(nameForType) ? 'audio/mpeg' : 'application/octet-stream';
const dgRes = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true', {
  method: 'POST',
  headers: { Authorization: `Token ${keyData.tempKey}`, 'Content-Type': audioCT },
  body: buf,
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

// ── 3. Cut + transcode each lesson to MP3 (src.bin from step 0) ──────────────
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
