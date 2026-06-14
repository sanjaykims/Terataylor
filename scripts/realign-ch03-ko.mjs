// One-shot script: re-translate Ch03 Korean to align sentence-for-sentence with English.
// Run: node scripts/realign-ch03-ko.mjs

const SUPABASE_URL = 'https://aeygqjuhqjvlhjrslbxd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleWdxanVocWp2bGhqcnNsYnhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NjQ4MDUsImV4cCI6MjA5NTE0MDgwNX0.Yf2nzQ8prYmUx7kI7vDp1lTlxAq3wWb9GeEKn65N7aY';

// Same canonical splitter as BookReader.tsx
function splitToSentences(text) {
  const normalized = text.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim();
  if (!normalized) return [];
  return normalized
    .split(/(?<=[.!?…]['""']?)\s+(?=[A-Z""''가-힣])/)
    .map(s => s.trim())
    .filter(Boolean);
}

// Same alignment fixer as BookReader.tsx
const ATTR_VERB = /(?:말했다|물었다|대답했다|속삭였다|외쳤다|소리쳤다|중얼거렸다|덧붙였다)[.。]?["']?\s*$/;
function alignKoreanToEnglish(raw, targetLen) {
  const out = raw.map(s => (s ?? '').replace(/\s*\n\s*/g, ' ').trim());
  while (out.length > targetLen && out.length > 1) {
    let attrIdx = -1;
    for (let k = 1; k < out.length; k++) {
      if (out[k].length <= 20 && ATTR_VERB.test(out[k])) {
        if (attrIdx === -1 || out[k].length < out[attrIdx].length) attrIdx = k;
      }
    }
    if (attrIdx !== -1) {
      out[attrIdx - 1] = out[attrIdx - 1] + ' ' + out[attrIdx];
      out.splice(attrIdx, 1);
    } else {
      let pairLen = out[0].length + out[1].length, pairIdx = 0;
      for (let k = 1; k < out.length - 1; k++) {
        const l = out[k].length + out[k + 1].length;
        if (l < pairLen) { pairLen = l; pairIdx = k; }
      }
      out[pairIdx] = out[pairIdx] + ' ' + out[pairIdx + 1];
      out.splice(pairIdx + 1, 1);
    }
  }
  while (out.length < targetLen) out.push('');
  return out;
}

async function sbGet(key) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/taylor_app_data?key=eq.${encodeURIComponent(key)}&select=value`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } },
  );
  const rows = await res.json();
  return rows[0]?.value ?? null;
}

async function sbUpsert(key, value) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/taylor_app_data`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) throw new Error(`upsert failed: ${await res.text()}`);
}

async function translateBatch(sentences) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ocr-extract`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sentences, mode: 'translate_sentences' }),
  });
  if (!res.ok) throw new Error(`translate failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.result ?? [];
}

async function main() {
  console.log('Fetching chapter_edward_3_en…');
  const en = await sbGet('chapter_edward_3_en');
  if (!en) { console.error('No English text found'); process.exit(1); }

  const sentences = splitToSentences(en);
  console.log(`English sentences: ${sentences.length}`);

  const BATCH = 30;
  const batches = [];
  for (let i = 0; i < sentences.length; i += BATCH) batches.push(sentences.slice(i, i + BATCH));
  console.log(`Batches: ${batches.length} (${BATCH} sentences each)`);

  const ko = [];
  for (let i = 0; i < batches.length; i++) {
    process.stdout.write(`  Batch ${i + 1}/${batches.length}… `);
    const raw = await translateBatch(batches[i]);
    const aligned = alignKoreanToEnglish(raw, batches[i].length);
    ko.push(...aligned);
    console.log(`done (${aligned.length} sentences)`);
  }

  const result = ko.join('\n');
  console.log(`\nSaving ${ko.length} Korean sentences (${result.length} chars)…`);
  await sbUpsert('chapter_edward_3_ko', result);
  console.log('✓ chapter_edward_3_ko saved. Ch.03 Korean is now sentence-aligned with English.');
}

main().catch(e => { console.error(e); process.exit(1); });
