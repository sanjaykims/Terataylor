# Graph Report - Terataylor  (2026-08-30)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 418 nodes · 743 edges · 23 communities (17 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c38bfaf8`
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

## God Nodes (most connected - your core abstractions)
1. `BookReader()` - 50 edges
2. `csSet()` - 19 edges
3. `App()` - 19 edges
4. `compilerOptions` - 17 edges
5. `compilerOptions` - 16 edges
6. `csGet()` - 14 edges
7. `VocabItem` - 13 edges
8. `csDel()` - 12 edges
9. `SpaceGame()` - 9 edges
10. `mergeMp3Files()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Props` --references--> `VocabItem`  [EXTRACTED]
  src/components/VocabularyPanel.tsx → src/lib/types.ts
- `Props` --references--> `VocabItem`  [EXTRACTED]
  src/components/GamesPanel.tsx → src/lib/types.ts
- `Props` --references--> `VocabItem`  [EXTRACTED]
  src/components/SentenceScramble.tsx → src/lib/types.ts
- `App()` --calls--> `csDel()`  [EXTRACTED]
  src/App.tsx → src/lib/cloudStorage.ts
- `deleteListeningTimings()` --calls--> `csDel()`  [EXTRACTED]
  src/lib/chapterStorage.ts → src/lib/cloudStorage.ts

## Import Cycles
- None detected.

## Communities (23 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (90): BookReader, migrateFromLocalStorage(), BookReader(), buildBookChapterToLessonMap(), buildXingFrame(), CHAPTER_HEADING, CHAPTER_NUMBER_WORDS, chapterNumberForms() (+82 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (47): GamesPanel, ImageUploadInput, GameType, Props, TABS, BaseProps, compressImage(), ImageEntry (+39 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (42): App(), ProgressDashboard, VocabularyPanel, Icon(), IconName, PATHS, SOLID, STROKE (+34 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (29): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, devDependencies, eslint, @eslint/js (+21 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (23): MainTab, V1Tab, BookScheduleSection(), daysDiff(), fmtDate(), LessonCard(), LessonScheduleWidget(), utcDays() (+15 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (22): DOM, src, vite/client, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib (+14 more)

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
Cohesion: 0.27
Nodes (12): alignByNW(), alignChapterAudio(), alignFromWordTimestamps(), AlignPhase, AlignProgress, buildAudioWordList(), Chunk, decodeTo16kMono() (+4 more)

### Community 10 - "Community 10"
Cohesion: 0.17
Nodes (10): chapters, headers, HEADING, headingIdx, lessons, lines, NUM_WORDS, RANGES (+2 more)

### Community 11 - "Community 11"
Cohesion: 0.20
Nodes (7): cut, findAnnouncement(), inBuf, lesson, numberForms(), sbHeaders, targetCh

### Community 12 - "Community 12"
Cohesion: 0.28
Nodes (7): COUNT, fixOpeningLine(), fixText(), headers, PROPER, sentenceCaseToken(), upserts

### Community 13 - "Community 13"
Cohesion: 0.52
Nodes (6): alignKoreanToEnglish(), main(), sbGet(), sbUpsert(), splitToSentences(), translateBatch()

### Community 15 - "Community 15"
Cohesion: 0.40
Nodes (3): COUNT, cutDur, headers

## Knowledge Gaps
- **158 isolated node(s):** `Row`, `InitState`, `ListeningPanelProps`, `MobileRowProps`, `RowProps` (+153 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `VocabItem` connect `Community 1` to `Community 0`, `Community 2`, `Community 4`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `BookReader()` connect `Community 0` to `Community 9`, `Community 2`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Community 3` to `Community 6`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `Row`, `InitState`, `ListeningPanelProps` to the rest of the system?**
  _158 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.053992221459620224 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06428571428571428 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06802721088435375 - nodes in this community are weakly interconnected._