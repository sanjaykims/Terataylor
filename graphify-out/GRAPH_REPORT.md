# Graph Report - Terataylor  (2026-08-29)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 409 nodes · 711 edges · 25 communities (19 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5d0a22e7`
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

## God Nodes (most connected - your core abstractions)
1. `BookReader()` - 42 edges
2. `App()` - 19 edges
3. `csSet()` - 18 edges
4. `compilerOptions` - 17 edges
5. `compilerOptions` - 16 edges
6. `VocabItem` - 13 edges
7. `csGet()` - 13 edges
8. `csDel()` - 11 edges
9. `SpaceGame()` - 9 edges
10. `ProgressDashboard()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Props` --references--> `VocabItem`  [EXTRACTED]
  src/components/GamesPanel.tsx → src/lib/types.ts
- `Props` --references--> `VocabItem`  [EXTRACTED]
  src/components/SentenceScramble.tsx → src/lib/types.ts
- `Props` --references--> `VocabItem`  [EXTRACTED]
  src/components/VocabularyPanel.tsx → src/lib/types.ts
- `VocabProps` --references--> `VocabItem`  [EXTRACTED]
  src/components/ImageUploadInput.tsx → src/lib/types.ts
- `VocabularyPanel()` --calls--> `csGet()`  [EXTRACTED]
  src/components/VocabularyPanel.tsx → src/lib/cloudStorage.ts

## Import Cycles
- None detected.

## Communities (25 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (46): GamesPanel, VocabularyPanel, GameType, Props, TABS, isKorean(), Props, SentenceScramble() (+38 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (39): App(), MainTab, ProgressDashboard, V1Tab, Icon(), IconName, PATHS, SOLID (+31 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (42): BookReader, BookReader(), buildBookChapterToLessonMap(), buildXingFrame(), CHAPTER_HEADING, CHAPTER_NUMBER_WORDS, chapterNumberForms(), cleanChapterText() (+34 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (36): migrateFromLocalStorage(), audioPath(), clearBook(), deleteChapterAudio(), deleteChapterTimings(), deleteListeningAudio(), getChaptersWithAudio(), getTranslatedChapters() (+28 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (29): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, devDependencies, eslint, @eslint/js (+21 more)

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
Cohesion: 0.16
Nodes (17): daysDiff(), fmtDate(), LessonScheduleWidget(), utcDays(), BookId, BookInfo, BOOKS, BRIDGE_C1_TOPICS (+9 more)

### Community 10 - "Community 10"
Cohesion: 0.24
Nodes (12): alignByNW(), alignChapterAudio(), alignFromWordTimestamps(), AlignPhase, AlignProgress, buildAudioWordList(), Chunk, decodeTo16kMono() (+4 more)

### Community 11 - "Community 11"
Cohesion: 0.21
Nodes (11): ImageUploadInput, BaseProps, compressImage(), ImageEntry, ImageUploadInput(), Props, TextProps, VocabProps (+3 more)

### Community 12 - "Community 12"
Cohesion: 0.17
Nodes (10): chapters, headers, HEADING, headingIdx, lessons, lines, NUM_WORDS, RANGES (+2 more)

### Community 13 - "Community 13"
Cohesion: 0.20
Nodes (7): cut, findAnnouncement(), inBuf, lesson, numberForms(), sbHeaders, targetCh

### Community 14 - "Community 14"
Cohesion: 0.28
Nodes (7): COUNT, fixOpeningLine(), fixText(), headers, PROPER, sentenceCaseToken(), upserts

### Community 15 - "Community 15"
Cohesion: 0.52
Nodes (6): alignKoreanToEnglish(), main(), sbGet(), sbUpsert(), splitToSentences(), translateBatch()

### Community 17 - "Community 17"
Cohesion: 0.40
Nodes (3): COUNT, cutDur, headers

## Knowledge Gaps
- **157 isolated node(s):** `GameType`, `VocabPuzzle`, `WordToken`, `Alien`, `Bullet` (+152 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `VocabItem` connect `Community 0` to `Community 1`, `Community 2`, `Community 11`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Community 4` to `Community 6`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `BookReader()` connect `Community 2` to `Community 1`, `Community 10`, `Community 3`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `GameType`, `VocabPuzzle`, `WordToken` to the rest of the system?**
  _157 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08405797101449275 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.09302325581395349 - nodes in this community are weakly interconnected._