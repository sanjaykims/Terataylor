# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This App Is

**Taylor's English** is a web-based English learning companion for students in the Tera C1 curriculum at Cheongdam Language School (청담어학원). It supports two distinct curricula:
- **A2** — listening/reading with sentence shadowing and opinion writing
- **V1** — literature analysis for novels (*Edward* and *Coraline*) with chapter reading, vocab, and essay prompts

## Commands

```bash
npm run dev       # Start Vite dev server (localhost:5173)
npm run build     # TypeScript type-check + Vite bundle
npm run lint      # ESLint check
npm run preview   # Preview production build locally
```

There are no tests. Deployment is via Vercel (auto-deploy on push to main).

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript, Vite 8, Tailwind CSS 4 |
| Backend | Supabase (PostgreSQL, Edge Functions, Storage) |
| Speech | Browser Web Speech API (no API key required) |
| PDF | PDF.js + Hugging Face Transformers (client-side extraction) |

## Architecture

### Data Flow

All user data, progress, and uploaded media live in Supabase — there is no local-only state beyond in-memory React state. On first load, any legacy `localStorage` data is automatically migrated to Supabase.

```
App.tsx (tab router: a2 | v1 | progress)
  ├── A2 tab  → ShadowingPlayer, VocabularyPanel, OpinionWriter, StoryWriter, ImageUploadInput
  ├── V1 tab  → BookReader, VocabularyPanel, LiteraryAnalysisWriter, GamesPanel
  └── Progress tab → ProgressDashboard, LessonScheduleWidget
```

### Key Source Directories

- `src/components/` — All React UI components; each is a self-contained feature
- `src/lib/` — Backend integration layer:
  - `supabase.ts` — client init (credentials hardcoded as public anon key — safe)
  - `cloudStorage.ts` — CRUD abstraction over the `taylor_app_data` key-value table
  - `chapterStorage.ts` — Chapter-level persistence (text, Korean translation, audio URL, vocab)
  - `tracker.ts` — Logs session times, vocab quiz results, and game scores to Supabase tables
  - `audioAlign.ts` — Audio/text synchronization logic
- `src/hooks/useSpeechSynthesis.ts` — Manages sentence-level TTS playback, speed (0.5–1×), and shadow mode (read → pause → student repeats)
- `src/utils/textUtils.ts` — `parseSentences()` and `extractVocabulary()` with stopword filtering
- `src/data/syllabus.ts` — Static curriculum data: book metadata, lesson schedule, writing prompts. Update this file (not the DB) to change curriculum content.

### Supabase Schema Key Points

- `taylor_app_data` — Generic key-value store (UPSERT semantics) for app state
- Separate tables track vocab progress, game scores, and session analytics
- Edge Functions handle: OCR (image → text), dictionary lookup (English + Korean definitions), and serve as a proxy for external APIs
- Audio files are stored in a Supabase Storage bucket and referenced by URL in chapter records

### Navigation / Routing

There is no client-side routing library. `App.tsx` manages a `mainTab` state (`a2 | v1 | progress`) with nested tab states per section. Tab switches flush analytics via `tracker.ts`.

### Curriculum Content Updates

- Lesson schedule, writing prompts, and book metadata → edit `src/data/syllabus.ts`
- Chapter text, Korean translations, audio, and vocabulary → managed at runtime via the V1 BookReader UI and persisted to Supabase; no code change needed
