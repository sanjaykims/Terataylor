# Graph Report - Terataylor  (2026-10-04)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 457 nodes · 872 edges · 19 communities (14 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e511d0d2`
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

## God Nodes (most connected - your core abstractions)
1. `BookReader()` - 58 edges
2. `App()` - 28 edges
3. `csSet()` - 19 edges
4. `Icon()` - 19 edges
5. `compilerOptions` - 17 edges
6. `compilerOptions` - 16 edges
7. `csGet()` - 15 edges
8. `ProgressDashboard()` - 14 edges
9. `VocabItem` - 13 edges
10. `react` - 13 edges

## Surprising Connections (you probably didn't know these)
- `ListeningPanelProps` --references--> `BookId`  [EXTRACTED]
  src/components/BookReader.tsx → src/data/syllabus.ts
- `VocabProps` --references--> `VocabItem`  [EXTRACTED]
  src/components/ImageUploadInput.tsx → src/lib/types.ts
- `Props` --references--> `VocabItem`  [EXTRACTED]
  src/components/GamesPanel.tsx → src/lib/types.ts
- `Props` --references--> `VocabItem`  [EXTRACTED]
  src/components/SentenceScramble.tsx → src/lib/types.ts
- `Props` --references--> `VocabItem`  [EXTRACTED]
  src/components/VocabularyPanel.tsx → src/lib/types.ts

## Import Cycles
- None detected.

## Communities (19 total, 5 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (91): migrateFromLocalStorage(), BookReader(), buildBookChapterToLessonMap(), buildXingFrame(), CHAPTER_HEADING, CHAPTER_NUMBER_WORDS, chapterNumberForms(), cleanChapterText() (+83 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (55): react, react-dom, App(), BookReader, GamesPanel, ImageUploadInput, MainTab, ProgressDashboard (+47 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (46): GamesPanel(), GameType, Props, TABS, isKorean(), Props, SentenceScramble(), shuffle() (+38 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (45): dependencies, @huggingface/transformers, pdfjs-dist, react, react-dom, @supabase/supabase-js, devDependencies, eslint (+37 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (23): COUNT, cutDur, headers, boundaries, buf, candidates, cuts, ends (+15 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (32): @supabase/supabase-js, BOOK_LABELS, dayKeyToDate(), dayNum(), dayNumToKey(), FEATURE_ICONS, FEATURE_LABELS, formatDate() (+24 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+9 more)

### Community 8 - "Community 8"
Cohesion: 0.24
Nodes (13): @huggingface/transformers, alignByNW(), alignChapterAudio(), alignFromWordTimestamps(), AlignPhase, AlignProgress, buildAudioWordList(), Chunk (+5 more)

### Community 9 - "Community 9"
Cohesion: 0.15
Nodes (10): books, kv, LESSONS_PER_UNIT, ONLY_BOOK, plan, publicUrlOf(), readingChapters, sbHeaders (+2 more)

### Community 10 - "Community 10"
Cohesion: 0.17
Nodes (10): chapters, headers, HEADING, headingIdx, lessons, lines, NUM_WORDS, RANGES (+2 more)

### Community 12 - "Community 12"
Cohesion: 0.20
Nodes (9): done, fail(), failed, getRows(), haveScript, ONLY_BOOK, ONLY_LESSON, sbHeaders (+1 more)

### Community 13 - "Community 13"
Cohesion: 0.28
Nodes (7): COUNT, fixOpeningLine(), fixText(), headers, PROPER, sentenceCaseToken(), upserts

### Community 14 - "Community 14"
Cohesion: 0.52
Nodes (6): alignKoreanToEnglish(), main(), sbGet(), sbUpsert(), splitToSentences(), translateBatch()

## Knowledge Gaps
- **179 isolated node(s):** `InitState`, `MobileRowProps`, `RowProps`, `SentenceRowsProps`, `KnowledgeMapBranch` (+174 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 207 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Community 1` to `Community 0`, `Community 2`, `Community 3`, `Community 5`?**
  _High betweenness centrality (0.112) - this node is a cross-community bridge._
- **Why does `pdfjs-dist` connect `Community 3` to `Community 0`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **What connects `InitState`, `MobileRowProps`, `RowProps` to the rest of the system?**
  _179 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.055822466254861584 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.0670762928827445 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07329462989840348 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.047872340425531915 - nodes in this community are weakly interconnected._