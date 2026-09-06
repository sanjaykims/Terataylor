# Bridge class audio drops

Staging area for a batch of Bridge C1/C2 class mp3s on their way into the
`taylor-audio` Supabase bucket. **These files are not part of the app build** —
Vite only bundles `public/`, and they are deliberately kept off `main`, which
would otherwise carry ~26 MB per term forever.

## How a drop works

1. Branch off `main` as `audio-drop/<something>`.
2. Drop the mp3s into `bridge_c1/` / `bridge_c2/` using the naming below.
3. Push the branch. The **Upload Bridge Audio** workflow fires on any push to
   `audio-drop/**` that touches this directory, uploads each file, and points
   the app's per-lesson audio keys at it.
4. Once the run is green, delete the branch. Supabase is the system of record
   from then on.

Run the workflow manually with `dry_run` first if a batch uses unfamiliar
filenames — it prints the resolved file → lesson mapping and writes nothing.

## Naming → where the file lands

Each Bridge lesson owns two independent passages in the reader (읽기 / 듣기), so
the filename decides which slot a file fills. The split follows the curriculum
flow recorded in `.claude/skills/bridge-study-guide`:

| Book | Filename | Lesson | Slot |
|---|---|---|---|
| C1 | `Lesson<N>-skim.mp3` | `N` | 읽기 (reading) — Skim is a Reading step |
| C1 | `Lesson<N>-comprehend.mp3` | `N` | 듣기 (listening) — Comprehend is a Listening step |
| C2 | `Unit<U>-Lesson<L>-understand.mp3` | `(U-1)*2 + L` | 읽기 — the focus reading passage |
| C2 | `Unit<U>-Lesson<L>-build.mp3` | `(U-1)*2 + L` | 듣기 — the background listening |

C2 units flatten to one lesson index because the reader addresses lessons as a
flat `L1..L13`, not as unit/lesson pairs. Two lessons per unit is the observed
shape; override with `LESSONS_PER_UNIT` if a later book differs.

The uploader **fails** on a filename it cannot parse, or on two files claiming
the same lesson+slot, rather than skipping one — a quietly missing lesson is
much harder to notice than a failed run.

## Audio can arrive before text

A term's audio lands in one batch; each lesson's passage text only arrives when
its textbook photos are uploaded. That is expected. A lesson with audio but no
text shows a plain audio player, and upgrades itself to the full sentence-level
shadowing UI (click-to-seek, live highlighting) once the passage exists.
