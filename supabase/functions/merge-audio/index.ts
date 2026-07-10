import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function skipId3v2(b: Uint8Array): number {
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    const size =
      ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) |
      ((b[8] & 0x7f) << 7)  |  (b[9] & 0x7f);
    return 10 + size;
  }
  return 0;
}

function trimId3v1(b: Uint8Array): number {
  if (b.length >= 128 &&
      b[b.length - 128] === 0x54 &&
      b[b.length - 127] === 0x41 &&
      b[b.length - 126] === 0x47) {
    return b.length - 128;
  }
  return b.length;
}

function findSync(b: Uint8Array, start: number): number {
  for (let i = start; i < b.length - 3; i++) {
    if (b[i] !== 0xFF) continue;
    const h1 = b[i + 1];
    if ((h1 & 0xE0) !== 0xE0) continue;
    const layer      = (h1 >> 1) & 0x3;
    const bitrateIdx = (b[i + 2] >> 4) & 0xF;
    const srIdx      = (b[i + 2] >> 2) & 0x3;
    if (layer === 0 || bitrateIdx === 0 || bitrateIdx === 0xF || srIdx === 3) continue;
    return i;
  }
  return start;
}

function bytesPerSec(b: Uint8Array, frameAt: number): number {
  const bitrateTable = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0];
  const idx = (b[frameAt + 2] >> 4) & 0xF;
  const kbps = bitrateTable[idx];
  return kbps > 0 ? (kbps * 1000) / 8 : 16000;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // This function runs with the SERVICE ROLE key (bypasses RLS) and can
  // overwrite/DELETE arbitrary chapter audio, driven entirely by the caller.
  // It is no longer invoked from the browser — only from trusted tooling — so
  // gate it behind a secret that is NOT in the client bundle. Refuse everything
  // unless MERGE_SECRET is configured AND matches, closing it to the public.
  const secret = Deno.env.get('MERGE_SECRET');
  if (!secret || req.headers.get('x-merge-secret') !== secret) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: CORS });
  }

  let body: { bookId: string; chapters: number[]; outputChapter?: number; trimSeconds?: number };
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: CORS }); }

  const { bookId, chapters, outputChapter = chapters[0], trimSeconds = 0 } = body;
  if (!bookId || !/^[a-z0-9_-]{1,32}$/i.test(bookId) || !Array.isArray(chapters) ||
      chapters.length === 0 || chapters.length > 30 ||
      !chapters.every(c => Number.isInteger(c) && c >= 1 && c <= 99)) {
    return new Response(JSON.stringify({ error: 'invalid bookId/chapters' }), { status: 400, headers: CORS });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const BUCKET = 'taylor-audio';
  const chPath = (ch: number) => `v1/${bookId}/ch${ch}.mp3`;

  // 1. Download all chapter files in parallel
  const downloads = await Promise.all(
    chapters.map(async (ch) => {
      const { data, error } = await supabase.storage.from(BUCKET).download(chPath(ch));
      if (error) throw new Error(`Download ch${ch}: ${error.message}`);
      return { ch, bytes: new Uint8Array(await data!.arrayBuffer()) };
    }),
  );

  // 2. Process each chunk
  const segments: Uint8Array[] = downloads.map(({ bytes }, idx) => {
    let start = skipId3v2(bytes);
    const end = idx < downloads.length - 1 ? trimId3v1(bytes) : bytes.length;
    start = findSync(bytes, start);
    if (idx > 0 && trimSeconds > 0) {
      const bps = bytesPerSec(bytes, start);
      const skip = Math.floor(trimSeconds * bps);
      start = findSync(bytes, Math.min(start + skip, end - 1));
    }
    return bytes.subarray(start, end);
  });

  // 3. Concatenate
  const total = segments.reduce((s, c) => s + c.length, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const seg of segments) { merged.set(seg, off); off += seg.length; }

  // 4. Upload merged file to the output chapter slot
  const outPath = chPath(outputChapter);
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(outPath, merged, { contentType: 'audio/mpeg', upsert: true });
  if (upErr) {
    return new Response(JSON.stringify({ error: `Upload failed: ${upErr.message}` }),
      { status: 500, headers: CORS });
  }

  // 5. Get & store new public URL for the output chapter
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(outPath);
  await supabase.from('taylor_app_data').upsert(
    { key: `chapter_${bookId}_${outputChapter}_audio`, value: publicUrl },
    { onConflict: 'key' },
  );

  // 6. Delete source chapters that are NOT the output (storage + KV entry)
  //    This prevents the merge banner from reappearing on subsequent app loads.
  const toDelete = chapters.filter(ch => ch !== outputChapter);
  if (toDelete.length > 0) {
    await supabase.storage.from(BUCKET).remove(toDelete.map(chPath));
    for (const ch of toDelete) {
      await supabase.from('taylor_app_data')
        .delete().eq('key', `chapter_${bookId}_${ch}_audio`);
    }
  }

  // 7. Delete stale timings for all merged chapters
  for (const ch of chapters) {
    await supabase.from('taylor_app_data')
      .delete().eq('key', `chapter_${bookId}_${ch}_times`);
  }

  return new Response(
    JSON.stringify({
      success: true,
      path: outPath,
      publicUrl,
      totalMB: +(merged.length / 1_048_576).toFixed(2),
      segmentBytes: segments.map(s => s.length),
      deletedChapters: toDelete,
    }),
    { headers: { ...CORS, 'Content-Type': 'application/json' } },
  );
});
