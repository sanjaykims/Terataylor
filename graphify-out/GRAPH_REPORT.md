# Graph Report - Terataylor  (2026-09-06)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 435 nodes · 795 edges · 22 communities (16 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9db6ffca`
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
1. `BookReader()` - 51 edges
2. `csSet()` - 19 edges
3. `App()` - 19 edges
4. `compilerOptions` - 17 edges
5. `compilerOptions` - 16 edges
6. `csGet()` - 14 edges
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

## Communities (22 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (89): BookReader, migrateFromLocalStorage(), BookReader(), buildBookChapterToLessonMap(), buildXingFrame(), CHAPTER_HEADING, CHAPTER_NUMBER_WORDS, chapterNumberForms() (+81 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (55): react, @supabase/supabase-js, App(), ImageUploadInput, MainTab, ProgressDashboard, V1Tab, Icon() (+47 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (46): GamesPanel, VocabularyPanel, GameType, Props, TABS, isKorean(), Props, SentenceScramble() (+38 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (31): dependencies, @huggingface/transformers, pdfjs-dist, react, react-dom, @supabase/supabase-js, name, private (+23 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (23): ListeningPanelProps, BookScheduleSection(), daysDiff(), fmtDate(), LessonCard(), LessonScheduleWidget(), utcDays(), activeBookIds() (+15 more)

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
Cohesion: 0.22
Nodes (13): @huggingface/transformers, alignByNW(), alignChapterAudio(), alignFromWordTimestamps(), AlignPhase, AlignProgress, buildAudioWordList(), Chunk (+5 more)

### Community 10 - "Community 10"
Cohesion: 0.17
Nodes (10): books, kv, LESSONS_PER_UNIT, ONLY_BOOK, plan, publicUrlOf(), readingChapters, sbHeaders (+2 more)

### Community 11 - "Community 11"
Cohesion: 0.17
Nodes (10): chapters, headers, HEADING, headingIdx, lessons, lines, NUM_WORDS, RANGES (+2 more)

### Community 12 - "Community 12"
Cohesion: 0.20
Nodes (7): cut, findAnnouncement(), inBuf, lesson, numberForms(), sbHeaders, targetCh

### Community 13 - "Community 13"
Cohesion: 0.28
Nodes (7): COUNT, fixOpeningLine(), fixText(), headers, PROPER, sentenceCaseToken(), upserts

### Community 14 - "Community 14"
Cohesion: 0.52
Nodes (6): alignKoreanToEnglish(), main(), sbGet(), sbUpsert(), splitToSentences(), translateBatch()

### Community 16 - "Community 16"
Cohesion: 0.40
Nodes (3): COUNT, cutDur, headers

## Knowledge Gaps
- **174 isolated node(s):** `InitState`, `MobileRowProps`, `RowProps`, `SentenceRowsProps`, `KnowledgeMapBranch` (+169 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 204 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Community 1` to `Community 0`, `Community 2`, `Community 3`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Community 8` to `Community 3`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `pdfjs-dist` connect `Community 3` to `Community 0`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `InitState`, `MobileRowProps`, `RowProps` to the rest of the system?**
  _174 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05422100205902539 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05952380952380952 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._