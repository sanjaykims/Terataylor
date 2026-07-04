// READ-ONLY diagnostic: report the true state of a book's chapter audio.
// For each lesson slot: the KV row(s) for chapter_<book>_<n>_audio, the storage
// file's size, and its REAL duration (ffprobe) vs what a Xing-less player might
// estimate. Also verifies ffmpeg's input `-ss X -to Y` semantics on a generated
// tone, to rule out a mis-cut in the splitter.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const SUPABASE_URL = 'https://aeygqjuhqjvlhjrslbxd.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleWdxanVocWp2bGhqcnNsYnhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NjQ4MDUsImV4cCI6MjA5NTE0MDgwNX0.Yf2nzQ8prYmUx7kI7vDp1lTlxAq3wWb9GeEKn65N7aY';

const bookId = process.env.BOOK_ID || 'coraline';
const COUNT = parseInt(process.env.CHAPTER_COUNT || '6', 10);
const headers = { Authorization: `Bearer ${ANON}`, apikey: ANON };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ── ffmpeg -ss/-to semantics check ───────────────────────────────────────────
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=100', '-c:a', 'libmp3lame', '-q:a', '6', 'tone.mp3']);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '30', '-to', '50', '-i', 'tone.mp3', '-c:a', 'libmp3lame', '-q:a', '6', 'cut.mp3']);
const cutDur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', 'cut.mp3']).toString().trim());
console.log(`ffmpeg check: -ss 30 -to 50 on a 100s tone → ${cutDur.toFixed(1)}s (expected 20.0 if absolute, 50.0 if duration-like)`);

// ── KV rows ──────────────────────────────────────────────────────────────────
const kvRes = await fetch(
  `${SUPABASE_URL}/rest/v1/taylor_app_data?key=like.chapter_${bookId}_%25_audio&select=key,value`,
  { headers },
);
const rows = await kvRes.json();
console.log(`\nKV rows matching chapter_${bookId}_%_audio: ${rows.length}`);
for (const r of rows) console.log(`  ${r.key} = ${r.value.slice(0, 90)}`);

// ── Storage files ────────────────────────────────────────────────────────────
console.log('');
for (let k = 1; k <= COUNT; k++) {
  const url = `${SUPABASE_URL}/storage/v1/object/public/taylor-audio/v1/${bookId}/ch${k}.mp3`;
  const res = await fetch(url);
  if (!res.ok) { console.log(`ch${k}.mp3: MISSING (${res.status})`); continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(`f${k}.mp3`, buf);
  const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `f${k}.mp3`]).toString().trim());
  // What a player would estimate WITHOUT a Xing header: size / first-frame bitrate
  const br = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=bit_rate', '-of', 'csv=p=0', `f${k}.mp3`]).toString().trim());
  const est = Number.isFinite(br) && br > 0 ? (buf.length * 8) / br : NaN;
  console.log(`ch${k}.mp3: ${(buf.length / 1_048_576).toFixed(1)} MB, real ${mmss(dur)}, naive-estimate ${Number.isFinite(est) ? mmss(est) : 'n/a'}`);
}
