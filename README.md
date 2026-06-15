# Taylor's English — 청담어학원 Tera 예습 도우미

A web-based English learning tool tailored for the **Tera C1 + V1** curriculum at Cheongdam Language School (청담어학원).

## Features

| Mode | Features |
|------|----------|
| **C1 Shadowing** | Paste a passage → sentence-by-sentence TTS playback with highlight, speed control (0.5×–1×), shadow mode (read → pause → repeat) |
| **C1 Vocabulary** | Auto-extract key words from text, click to look up definition, mark studied |
| **C1 Opinion Writing** | Structured template: Topic sentence → Reason 1 → Reason 2 → Conclusion |
| **V1 Story Writing** | 3-stage story guide: Beginning / Middle / End with sentence starters |

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Supabase Edge Functions

Audio alignment calls Deepgram through `supabase/functions/deepgram-listen` so the API key is not exposed in the browser bundle. Configure the function secret before deploying:

```bash
supabase secrets set DEEPGRAM_API_KEY=...
supabase functions deploy deepgram-listen
```

## Tech Stack

- Vite + React + TypeScript
- Tailwind CSS v4
- Browser Web Speech API (no API key required)
- Supabase Edge Functions for OCR, audio merge, and Deepgram transcription
