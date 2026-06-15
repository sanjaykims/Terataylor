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
      return json({ error: 'DEEPGRAM_API_KEY is not configured' }, 500);
    }

    const contentType = req.headers.get('content-type') ?? '';

    let dgBody: BodyInit;
    let dgContentType: string;

    if (contentType.includes('audio/')) {
      // Raw binary path: client sent MP3 bytes directly (used for boundary detection
      // on locally-held files that aren't yet in Supabase Storage).
      dgBody = await req.arrayBuffer();
      dgContentType = 'audio/mpeg';
    } else {
      // URL path: client sent { audioUrl } JSON — Deepgram fetches the file itself.
      const { audioUrl } = await req.json() as { audioUrl?: string };
      if (!audioUrl || !/^https?:\/\//.test(audioUrl)) {
        return json({ error: 'A public audioUrl is required' }, 400);
      }
      dgBody = JSON.stringify({ url: audioUrl });
      dgContentType = 'application/json';
    }

    const dgRes = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': dgContentType,
        },
        body: dgBody,
      },
    );

    if (!dgRes.ok) {
      const detail = await dgRes.text();
      return json({ error: `Deepgram failed: ${detail}` }, dgRes.status);
    }

    const dgData = await dgRes.json();
    const words = (
      dgData?.results?.channels?.[0]?.alternatives?.[0]?.words ?? []
    ) as DeepgramWord[];

    return json({ words });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
