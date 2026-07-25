# Graph Report - .  (2026-07-25)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 390 nodes · 620 edges · 24 communities (19 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ebbc1aae`
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

## God Nodes (most connected - your core abstractions)
1. `BookReader()` - 42 edges
2. `compilerOptions` - 17 edges
3. `compilerOptions` - 16 edges
4. `VocabItem` - 12 edges
5. `csSet()` - 11 edges
6. `csGet()` - 9 edges
7. `mergeMp3Files()` - 8 edges
8. `ProgressDashboard()` - 8 edges
9. `SpaceGame()` - 8 edges
10. `extractVocabulary()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `BookReader()` --calls--> `kstToday()`  [EXTRACTED]
  src/components/BookReader.tsx → src/data/syllabus.ts
- `BookReader()` --calls--> `alignFromWordTimestamps()`  [EXTRACTED]
  src/components/BookReader.tsx → src/lib/audioAlign.ts
- `BookReader()` --calls--> `sessionSetDetail()`  [EXTRACTED]
  src/components/BookReader.tsx → src/lib/tracker.ts
- `Props` --references--> `VocabItem`  [EXTRACTED]
  src/components/GamesPanel.tsx → src/lib/types.ts
- `VocabProps` --references--> `VocabItem`  [EXTRACTED]
  src/components/ImageUploadInput.tsx → src/lib/types.ts

## Import Cycles
- None detected.

## Communities (24 total, 5 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (69): BookReader(), buildBookChapterToLessonMap(), buildXingFrame(), CHAPTER_HEADING, CHAPTER_NUMBER_WORDS, chapterNumberForms(), cleanChapterText(), cleanPageText() (+61 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (39): GameType, Props, TABS, isKorean(), Props, SentenceScramble(), shuffle(), VocabPuzzle (+31 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (29): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, devDependencies, eslint, @eslint/js (+21 more)

### Community 3 - "Community 3"
Cohesion: 0.13
Nodes (24): BOOK_LABELS, FEATURE_ICONS, FEATURE_LABELS, formatDate(), formatDuration(), formatSessionWhen(), GAME_LABELS, KST_DATE (+16 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (22): DOM, src, vite/client, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib (+14 more)

### Community 5 - "Community 5"
Cohesion: 0.13
Nodes (18): Icon(), IconName, PATHS, SOLID, STROKE, BaseProps, compressImage(), ImageEntry (+10 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (20): @huggingface/transformers, dependencies, @huggingface/transformers, pdfjs-dist, react, react-dom, @supabase/supabase-js, name (+12 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (20): node, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+12 more)

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (13): boundaries, buf, candidates, cuts, ends, kv, ONES, sbHeaders (+5 more)

### Community 9 - "Community 9"
Cohesion: 0.19
Nodes (15): daysDiff(), fmtDate(), LessonScheduleWidget(), utcDays(), BookId, BookInfo, BOOKS, currentLesson() (+7 more)

### Community 10 - "Community 10"
Cohesion: 0.27
Nodes (12): alignByNW(), alignChapterAudio(), alignFromWordTimestamps(), AlignPhase, AlignProgress, buildAudioWordList(), Chunk, decodeTo16kMono() (+4 more)

### Community 11 - "Community 11"
Cohesion: 0.17
Nodes (10): chapters, headers, HEADING, headingIdx, lessons, lines, NUM_WORDS, RANGES (+2 more)

### Community 12 - "Community 12"
Cohesion: 0.18
Nodes (9): App(), BookReader, GamesPanel, ImageUploadInput, MainTab, migrateFromLocalStorage(), ProgressDashboard, V1Tab (+1 more)

### Community 13 - "Community 13"
Cohesion: 0.20
Nodes (7): cut, findAnnouncement(), inBuf, lesson, numberForms(), sbHeaders, targetCh

### Community 14 - "Community 14"
Cohesion: 0.31
Nodes (7): COUNT, fixOpeningLine(), fixText(), headers, PROPER, sentenceCaseToken(), upserts

### Community 15 - "Community 15"
Cohesion: 0.52
Nodes (6): alignKoreanToEnglish(), main(), sbGet(), sbUpsert(), splitToSentences(), translateBatch()

### Community 17 - "Community 17"
Cohesion: 0.40
Nodes (3): COUNT, cutDur, headers

## Knowledge Gaps
- **157 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+152 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `VocabItem` connect `Community 1` to `Community 0`, `Community 5`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `BookReader()` connect `Community 0` to `Community 9`, `Community 10`, `Community 3`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Community 2` to `Community 6`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _157 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06627175120325805 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07678075855689177 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._