# Graph Report - .  (2026-07-31)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 392 nodes · 670 edges · 23 communities (18 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2a4b9eb3`
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
1. `BookReader()` - 41 edges
2. `App()` - 17 edges
3. `compilerOptions` - 17 edges
4. `compilerOptions` - 16 edges
5. `csSet()` - 14 edges
6. `VocabItem` - 13 edges
7. `csGet()` - 11 edges
8. `SpaceGame()` - 9 edges
9. `mergeMp3Files()` - 8 edges
10. `ProgressDashboard()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `App()` --calls--> `currentLesson()`  [EXTRACTED]
  src/App.tsx → src/data/syllabus.ts
- `App()` --calls--> `loadChapterVocab()`  [EXTRACTED]
  src/App.tsx → src/lib/chapterStorage.ts
- `App()` --calls--> `csDel()`  [EXTRACTED]
  src/App.tsx → src/lib/cloudStorage.ts
- `App()` --calls--> `csGetAppState()`  [EXTRACTED]
  src/App.tsx → src/lib/cloudStorage.ts
- `App()` --calls--> `csSet()`  [EXTRACTED]
  src/App.tsx → src/lib/cloudStorage.ts

## Import Cycles
- None detected.

## Communities (23 total, 5 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (48): App(), BookReader, GamesPanel, ImageUploadInput, MainTab, ProgressDashboard, V1Tab, VocabularyPanel (+40 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (44): GameType, Props, TABS, isKorean(), Props, SentenceScramble(), shuffle(), VocabPuzzle (+36 more)

### Community 2 - "Community 2"
Cohesion: 0.10
Nodes (40): BookReader(), buildBookChapterToLessonMap(), buildXingFrame(), CHAPTER_HEADING, CHAPTER_NUMBER_WORDS, chapterNumberForms(), cleanChapterText(), cleanPageText() (+32 more)

### Community 3 - "Community 3"
Cohesion: 0.13
Nodes (31): migrateFromLocalStorage(), audioPath(), clearBook(), deleteChapterAudio(), deleteChapterTimings(), getChaptersWithAudio(), getTranslatedChapters(), hasBook() (+23 more)

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
Cohesion: 0.19
Nodes (15): daysDiff(), fmtDate(), LessonScheduleWidget(), utcDays(), BookId, BookInfo, BOOKS, currentLesson() (+7 more)

### Community 10 - "Community 10"
Cohesion: 0.27
Nodes (12): alignByNW(), alignChapterAudio(), alignFromWordTimestamps(), AlignPhase, AlignProgress, buildAudioWordList(), Chunk, decodeTo16kMono() (+4 more)

### Community 11 - "Community 11"
Cohesion: 0.17
Nodes (10): chapters, headers, HEADING, headingIdx, lessons, lines, NUM_WORDS, RANGES (+2 more)

### Community 12 - "Community 12"
Cohesion: 0.20
Nodes (7): cut, findAnnouncement(), inBuf, lesson, numberForms(), sbHeaders, targetCh

### Community 13 - "Community 13"
Cohesion: 0.31
Nodes (7): COUNT, fixOpeningLine(), fixText(), headers, PROPER, sentenceCaseToken(), upserts

### Community 14 - "Community 14"
Cohesion: 0.52
Nodes (6): alignKoreanToEnglish(), main(), sbGet(), sbUpsert(), splitToSentences(), translateBatch()

### Community 16 - "Community 16"
Cohesion: 0.40
Nodes (3): COUNT, cutDur, headers

## Knowledge Gaps
- **157 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+152 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `VocabItem` connect `Community 1` to `Community 0`, `Community 2`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `App()` connect `Community 0` to `Community 1`, `Community 3`, `Community 9`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Community 4` to `Community 6`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _157 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06516290726817042 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07111756168359942 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.0975609756097561 - nodes in this community are weakly interconnected._