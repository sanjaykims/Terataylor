# Taylor's English — 청담어학원 예습 도우미

A web-based English learning companion for one student (Taylor), following the
curriculum at Cheongdam Language School (청담어학원). The app currently
supports the **Bridge C1 + C2** curriculum; the previous **V1 + A2** curriculum
(two novels: *The Miraculous Journey of Edward Tulane* and *Coraline*) is
archived — its data is untouched in the database and it can be restored to the
book selector any time the academy switches curricula again.

## Curriculum model

- **Bridge C1 / C2** (active): 13 independent weekly topics per book, each
  with its own separate Reading passage and Listening passage/audio — not a
  continuous story.
- **V1 / A2** (archived): two novels read chapter-by-chapter, each chapter
  narrated by a matching audiobook segment.
- Book metadata and the class schedule live in
  [`src/data/syllabus.ts`](src/data/syllabus.ts). Actual lesson content
  (chapter text, vocab, audio) lives in Supabase, not in this repo — see
  [`src/lib/chapterStorage.ts`](src/lib/chapterStorage.ts).

## Features

| Area | What it does |
|------|---------------|
| **Reading** | Per-lesson photo upload → OCR-extracted English text, one-click Korean translation, sentence-by-sentence audio shadowing with real-time highlight (for books with chapter audio) |
| **Listening** | (Bridge books only) Separate per-lesson script + audio upload, translation, plain audio playback |
| **Vocabulary** | Per-lesson vocab list, photo upload → auto-extracted word list, click to mark studied |
| **Games** | Vocab quiz, sentence scramble, and a space-themed vocab game, all driven by the active lesson's word list |
| **Progress** | Study session history, vocab progress, and game scores across lessons |

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

Other commands:

```bash
npm run build     # TypeScript check + production bundle
npm run lint       # ESLint
npm run preview    # Preview the production build locally
```

A pre-push git hook (`.githooks/pre-push`) runs the production build before
every push so a broken bundle never reaches Vercel; enable it once per clone
with `git config core.hooksPath .githooks`.

## Supabase

All lesson content (chapter text, vocabulary, audio) and app state live in a
Supabase project — see [`src/lib/supabase.ts`](src/lib/supabase.ts) for the
client and [`src/lib/chapterStorage.ts`](src/lib/chapterStorage.ts) /
[`src/lib/cloudStorage.ts`](src/lib/cloudStorage.ts) for the storage layer.

Edge Functions (`supabase/functions/`):

- `ocr-extract` — photo → English text or a structured vocab list
- `deepgram-listen` — short-lived Deepgram key for browser-side audio/sentence alignment
- `merge-audio` — server-side audiobook chapter merging (used by the legacy novel content scripts)

Configure secrets before deploying:

```bash
supabase secrets set DEEPGRAM_API_KEY=...
supabase functions deploy deepgram-listen
```

## Tech Stack

- Vite + React 19 + TypeScript
- Tailwind CSS v4
- Supabase (Postgres + Storage + Edge Functions) for all content and app state
- Deepgram for audio transcription/alignment; `pdfjs-dist` for PDF text extraction
