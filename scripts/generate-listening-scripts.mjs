// Transcribes each Bridge lesson's 듣기 audio and stores the result as that
// lesson's listening script, so the 듣기 tab has readable text (and something to
// translate) before the textbook photos are taken.
//
// WHY: the listening script normally arrives as a photo of the textbook page,
// OCR'd on device. That is the accurate source and stays the preferred one. But
// a term's audio lands months before those photos do, and until then the 듣기 tab
// is audio with no text to read, follow, or translate. A machine transcript is
// strictly better than an empty panel — as long as it is clearly marked as one
// and can be replaced.
//
// SAFETY RULES, in order of importance:
//   1. Never overwrite an existing script. A textbook-OCR'd script is more
//      accurate than anything Deepgram returns; clobbering it would be a silent
//      downgrade. Lessons that already have text are skipped, so this is safe to
//      re-run as new audio arrives.
//   2. Every generated script is tagged `..._listening_en_src = 'asr'`, which is
//      what the reader uses to label it as auto-generated and to keep offering
//      the "replace with the textbook photo" path.
//   3. Transcription is per-lesson and failures are isolated — one bad file
//      reports and moves on rather than aborting the batch.
//
// Runs in CI (network access to Supabase); DRY_RUN=1 lists what it would do.

const SUPABASE_URL = 'https://aeygqjuhqjvlhjrslbxd.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleWdxanVocWp2bGhqcnNsYnhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NjQ4MDUsImV4cCI6MjA5NTE0MDgwNX0.Yf2nzQ8prYmUx7kI7vDp1lTlxAq3wWb9GeEKn65N7aY';

const sbHeaders = { Authorization: `Bearer ${ANON}`, apikey: ANON };
const REST = `${SUPABASE_URL}/rest/v1/taylor_app_data`;
const DG_FN = `${SUPABASE_URL}/functions/v1/deepgram-listen`;

const DRY_RUN = process.env.DRY_RUN === '1';
const ONLY_BOOK = (process.env.ONLY_BOOK || '').trim();
// Escape hatch for a lesson whose transcript came out wrong: FORCE=1 with
// ONLY_LESSON re-transcribes it even though text already exists.
const FORCE = process.env.FORCE === '1';
const ONLY_LESSON = (process.env.ONLY_LESSON || '').trim();

const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

async function getRows(pattern) {
  const res = await fetch(`${REST}?key=like.${encodeURIComponent(pattern)}&select=key,value`, { headers: sbHeaders });
  if (!res.ok) fail(`read ${pattern}: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Work out which lessons have listening audio but no script yet ─────────────
const audioRows = await getRows('chapter_%_listening_audio');
const scriptRows = await getRows('chapter_%_listening_en');
const haveScript = new Set(scriptRows.map(r => r.key));

const targets = [];
for (const row of audioRows) {
  const m = row.key.match(/^chapter_(.+)_(\d+)_listening_audio$/);
  if (!m) continue;
  const [, bookId, lessonStr] = m;
  const lesson = Number(lessonStr);
  if (ONLY_BOOK && bookId !== ONLY_BOOK) continue;
  if (ONLY_LESSON && lesson !== Number(ONLY_LESSON)) continue;
  const scriptKey = `chapter_${bookId}_${lesson}_listening_en`;
  if (haveScript.has(scriptKey) && !FORCE) {
    console.log(`· ${bookId} L${lesson}: script already exists — skipping`);
    continue;
  }
  // The stored value carries a ?t= cache-buster from the reader; Deepgram needs
  // the bare object URL, and the function's allow-list matches on prefix anyway.
  targets.push({ bookId, lesson, scriptKey, audioUrl: row.value.split('?')[0] });
}

targets.sort((a, b) => a.bookId.localeCompare(b.bookId) || a.lesson - b.lesson);

if (targets.length === 0) {
  console.log('Nothing to do — every lesson with listening audio already has a script.');
  process.exit(0);
}

console.log(`${targets.length} lesson(s) to transcribe${DRY_RUN ? ' — DRY RUN' : ''}:`);
for (const t of targets) console.log(`  ${t.bookId} L${String(t.lesson).padStart(2, '0')}`);
if (DRY_RUN) process.exit(0);

// ── Transcribe ────────────────────────────────────────────────────────────────
const done = [];
const failed = [];

for (const t of targets) {
  try {
    const res = await fetch(DG_FN, {
      method: 'POST',
      headers: { ...sbHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioUrl: t.audioUrl }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
    const transcript = (body.transcript || '').trim();
    // An empty transcript means the audio was silent, unreadable, or the
    // function is an older build with no `transcript` field. Either way, writing
    // "" would mark the lesson as "has a script" and hide the upload prompt.
    if (!transcript) throw new Error('empty transcript returned');
    done.push({ ...t, transcript });
    console.log(`✓ ${t.bookId} L${t.lesson}: ${transcript.split(/\s+/).length} words`);
  } catch (e) {
    failed.push({ ...t, error: e.message });
    console.error(`✗ ${t.bookId} L${t.lesson}: ${e.message}`);
  }
}

// ── Store scripts + their 'generated' marker ─────────────────────────────────
if (done.length > 0) {
  const rows = [];
  for (const d of done) {
    rows.push({ key: d.scriptKey, value: d.transcript });
    rows.push({ key: `${d.scriptKey}_src`, value: 'asr' });
  }
  const res = await fetch(REST, {
    method: 'POST',
    headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!res.ok) fail(`storing scripts: ${res.status} ${await res.text()}`);
  console.log(`✓ stored ${done.length} script(s), each tagged as auto-generated`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} lesson(s) failed:`);
  for (const f of failed) console.error(`  ${f.bookId} L${f.lesson}: ${f.error}`);
  process.exit(1);
}
console.log('done');
