# Graph Report - Terataylor  (2026-09-06)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 449 nodes · 814 edges · 28 communities (22 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4986b9e6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27

## God Nodes (most connected - your core abstractions)
1. `BookReader()` - 52 edges
2. `csSet()` - 19 edges
3. `App()` - 19 edges
4. `compilerOptions` - 17 edges
5. `compilerOptions` - 16 edges
6. `csGet()` - 15 edges
7. `VocabItem` - 13 edges
8. `csDel()` - 12 edges
9. `ProgressDashboard()` - 12 edges
10. `react` - 12 edges

## Surprising Connections (you probably didn't know these)
- `VocabProps` --references--> `VocabItem`  [EXTRACTED]
  src/components/ImageUploadInput.tsx → src/lib/types.ts
- `Props` --references--> `VocabItem`  [EXTRACTED]
  src/components/GamesPanel.tsx → src/lib/types.ts
- `Props` --references--> `VocabItem`  [EXTRACTED]
  src/components/SentenceScramble.tsx → src/lib/types.ts
- `Props` --references--> `VocabItem`  [EXTRACTED]
  src/components/VocabularyPanel.tsx → src/lib/types.ts
- `ListeningPanelProps` --references--> `BookId`  [EXTRACTED]
  src/components/BookReader.tsx → src/data/syllabus.ts

## Import Cycles
- None detected.

## Communities (28 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (90): BookReader, migrateFromLocalStorage(), BookReader(), buildBookChapterToLessonMap(), buildXingFrame(), CHAPTER_HEADING, CHAPTER_NUMBER_WORDS, chapterNumberForms() (+82 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (40): react, @supabase/supabase-js, App(), ImageUploadInput, MainTab, V1Tab, VocabularyPanel, Icon() (+32 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (40): GamesPanel, GameType, Props, TABS, isKorean(), Props, SentenceScramble(), shuffle() (+32 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (25): ProgressDashboard, BOOK_LABELS, dayKeyToDate(), dayNum(), dayNumToKey(), FEATURE_ICONS, FEATURE_LABELS, formatDate() (+17 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (20): ListeningPanelProps, BookScheduleSection(), daysDiff(), fmtDate(), LessonCard(), utcDays(), BookId, BookInfo (+12 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (13): boundaries, buf, candidates, cuts, ends, kv, ONES, sbHeaders (+5 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+9 more)

### Community 8 - "Community 8"
Cohesion: 0.13
Nodes (15): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, tailwindcss, @tailwindcss/vite (+7 more)

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (13): name, private, type, version, eslint, @huggingface/transformers, pdfjs-dist, react-dom (+5 more)

### Community 10 - "Community 10"
Cohesion: 0.24
Nodes (12): alignByNW(), alignChapterAudio(), alignFromWordTimestamps(), AlignPhase, AlignProgress, buildAudioWordList(), Chunk, decodeTo16kMono() (+4 more)

### Community 11 - "Community 11"
Cohesion: 0.17
Nodes (10): books, kv, LESSONS_PER_UNIT, ONLY_BOOK, plan, publicUrlOf(), readingChapters, sbHeaders (+2 more)

### Community 12 - "Community 12"
Cohesion: 0.17
Nodes (10): chapters, headers, HEADING, headingIdx, lessons, lines, NUM_WORDS, RANGES (+2 more)

### Community 13 - "Community 13"
Cohesion: 0.20
Nodes (10): done, fail(), failed, getRows(), haveScript, ONLY_BOOK, ONLY_LESSON, WHY: the listening script normally arrives as a photo of the textbook page, (+2 more)

### Community 14 - "Community 14"
Cohesion: 0.20
Nodes (7): cut, findAnnouncement(), inBuf, lesson, numberForms(), sbHeaders, targetCh

### Community 15 - "Community 15"
Cohesion: 0.28
Nodes (7): COUNT, fixOpeningLine(), fixText(), headers, PROPER, sentenceCaseToken(), upserts

### Community 16 - "Community 16"
Cohesion: 0.52
Nodes (6): alignKoreanToEnglish(), main(), sbGet(), sbUpsert(), splitToSentences(), translateBatch()

### Community 17 - "Community 17"
Cohesion: 0.33
Nodes (5): @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, typescript-eslint

### Community 18 - "Community 18"
Cohesion: 0.33
Nodes (6): dependencies, @huggingface/transformers, pdfjs-dist, react, react-dom, @supabase/supabase-js

### Community 20 - "Community 20"
Cohesion: 0.40
Nodes (5): scripts, build, dev, lint, preview

### Community 21 - "Community 21"
Cohesion: 0.40
Nodes (3): COUNT, cutDur, headers

### Community 23 - "Community 23"
Cohesion: 0.50
Nodes (3): @tailwindcss/vite, vite, @vitejs/plugin-react

## Knowledge Gaps
- **181 isolated node(s):** `InitState`, `MobileRowProps`, `RowProps`, `SentenceRowsProps`, `KnowledgeMapBranch` (+176 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 213 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Community 1` to `Community 0`, `Community 9`, `Community 2`, `Community 3`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Community 8` to `Community 9`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `pdfjs-dist` connect `Community 9` to `Community 0`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `InitState`, `MobileRowProps`, `RowProps` to the rest of the system?**
  _181 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05375139977603583 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08244680851063829 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07624113475177305 - nodes in this community are weakly interconnected._