const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('DEEPGRAM_API_KEY');
    if (!apiKey) {
      return json({ message: 'DEEPGRAM_API_KEY is not configured' }, 500);
    }

    const contentType = req.headers.get('content-type') ?? '';

    // Mode: issue a short-lived Deepgram key so the browser can call Deepgram
    // directly (avoids the 25-second edge-function wall-clock timeout for long audio).
    if (!contentType.includes('audio/')) {
      const body = await req.json() as { mode?: string; audioUrl?: string };

      if (body.mode === 'get_temp_key') {
        // 1. Get the project ID
        const projRes = await fetch('https://api.deepgram.com/v1/projects', {
          headers: { Authorization: `Token ${apiKey}` },
        });
        if (!projRes.ok) {
          const detail = await projRes.text();
          return json({ message: `Deepgram projects failed (${projRes.status}): ${detail}` }, 502);
        }
        const projData = await projRes.json() as { projects?: { project_id: string }[] };
        const projectId = projData.projects?.[0]?.project_id;
        if (!projectId) {
          return json({ message: 'No Deepgram project found' }, 502);
        }

        // 2. Create a 120-second key scoped to transcription only
        const keyRes = await fetch(
          `https://api.deepgram.com/v1/projects/${projectId}/keys`,
          {
            method: 'POST',
            headers: {
              Authorization: `Token ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              comment: 'temp-browser',
              scopes: ['usage:write'],
              time_to_live_in_seconds: 120,
            }),
          },
        );
        if (!keyRes.ok) {
          const detail = await keyRes.text();
          return json({ message: `Deepgram key creation failed (${keyRes.status}): ${detail}` }, 502);
        }
        const keyData = await keyRes.json() as { key?: string };
        if (!keyData.key) {
          return json({ message: 'Deepgram returned no key' }, 502);
        }
        return json({ tempKey: keyData.key });
      }

      // URL path: client sent { audioUrl } JSON — Deepgram fetches the file itself.
      // Restrict to THIS project's own public Storage bucket so the endpoint
      // can't be used to transcribe arbitrary internet audio (SSRF / bill-farming
      // a stranger's 10-hour podcast on the owner's Deepgram account).
      const { audioUrl } = body;
      const ALLOWED_PREFIX = `${Deno.env.get('SUPABASE_URL') ?? ''}/storage/v1/object/public/taylor-audio/`;
      if (!audioUrl || !audioUrl.startsWith(ALLOWED_PREFIX)) {
        return json({ message: 'audioUrl must be a taylor-audio Storage URL' }, 400);
      }
      const dgRes = await fetch(
        'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true',
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: audioUrl }),
        },
      );
      if (!dgRes.ok) {
        const detail = await dgRes.text();
        return json({ message: `Deepgram failed (${dgRes.status}): ${detail}` }, dgRes.status);
      }
      const dgData = await dgRes.json();
      const words = (
        dgData?.results?.channels?.[0]?.alternatives?.[0]?.words ?? []
      ) as DeepgramWord[];
      return json({ words });
    }

    // Raw binary path: client sent MP3 bytes directly (used for boundary detection
    // on locally-held files that aren't yet in Supabase Storage).
    const dgBody = await req.arrayBuffer();
    // Cap upload size so a stranger can't stream unbounded audio on the owner's
    // Deepgram bill. A single lesson chapter is well under this.
    if (dgBody.byteLength > 80 * 1024 * 1024) {
      return json({ message: 'audio too large (max 80 MB)' }, 413);
    }
    const dgRes = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': 'audio/mpeg',
        },
        body: dgBody,
      },
    );
    if (!dgRes.ok) {
      const detail = await dgRes.text();
      return json({ message: `Deepgram failed (${dgRes.status}): ${detail}` }, dgRes.status);
    }
    const dgData = await dgRes.json();
    const words = (
      dgData?.results?.channels?.[0]?.alternatives?.[0]?.words ?? []
    ) as DeepgramWord[];
    return json({ words });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
