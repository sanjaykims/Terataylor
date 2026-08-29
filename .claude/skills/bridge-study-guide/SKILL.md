---
name: bridge-study-guide
description: Weekly study prep guidance for Taylor (4th grader) on the Chungdahm Bridge C1/C2 English curriculum. Activate when building study-plan features, weekly checklists, or prep guidance in the Terataylor app, or when asked how Taylor should prepare for a Bridge class.
metadata:
  author: project
  version: "1.0.0"
---

# Bridge C1/C2 Study Guide

Project-specific knowledge for helping Taylor (4th grader, Chungdahm/April academy)
prepare for his weekly Bridge English class. Prefer this over a generic
language-learning skill — it encodes the actual curriculum, not general advice.

## The academy's overall structure (CREVERSE roadmap)

**Important**: "Tera" and "Bridge" are **tier/level names**, not subject
names — the full progression is Mega/Giga/Tera → **Bridge**/Par/Birdie →
Eagle/Albatross/Albatross+ → Masters. **C1, C2, A2, V1 are subject
tracks that repeat at every tier** (each is a separate weekly class in a
different skill area: C1 = analytical reading/listening + opinion
speaking/writing, C2 = discussion/perspective-taking, A2 = TOEFL Jr.
strategy, V1 = novel reading + structured story writing). A student
usually takes a *subset* of tracks per tier, not all four.

Taylor took **V1 + A2** in the Tera tier; he's now taking **C1 + C2** in
the Bridge tier — same two track "slots" as before, but a *different
pair* of tracks this time, at the next tier up (harder content: Tera's
C1 is "읽기/듣기 실력 다지기" foundational skill-building; Bridge's C1 is
"분석적 읽기/듣기" analytical reading/listening — a real step up).

**The official CREVERSE ecosystem already covers grading/attendance/
homework tracking**: c-Learning (in-class) → i-Learning (self-study
platform + the "CHUNGDAHM BUFF" app) → Allim (parent app, real-time
progress). The family already has Allim/i-Learning access. **Terataylor
should not try to duplicate that** — its actual value is what those
don't provide: Korean/English bilingual translation and reading
practice, casual vocab-practice games, and (uniquely) keeping V1/A2's
content permanently accessible even after the curriculum moved on,
which Allim likely can't do once a level ends. Progress tracking inside
Terataylor is about Taylor's own home study habit (time spent, vocab
studied), not a substitute for the school's official record.

## Curriculum shape (from the textbook's own "How to Use This Book" guide)

Both C1 and C2 are **13 independent weekly topics** (not one continuous
story) — each week stands alone, so there's no "catching up on the plot"
if a week is missed, only that week's specific vocab/reading/listening.

- **C1** ("Tera & Bridge" format): every week is the same flow — Connect
  (topic hook) → Activate (vocab) → Reading (Skim → Summarize → Scan) →
  Discuss → Listening (Activate → Comprehend → Scan) → Knowledge Map →
  Collaborate → Prime & Practice (speaking/writing).
- **C2** ("Tera & Bridge – Input/Output" format): alternates across the
  13 weeks — **Input days** (1,3,5,7,9,11): Connect → Background listening →
  Focus reading → Media → Micro Project → Research Task. **Output days**
  (2,6,10 + presentation on 4,8,12,13): Share → Perspective → a Macro
  Project (Frame → Ideate → Materialize → Evaluate) — group writing/
  presentation work, not solo reading.
- In the app: this maps to `BOOKS['bridge_c1'|'bridge_c2'].lessonKind ===
  'topical'` and `hasListening: true` in [src/data/syllabus.ts](../../../src/data/syllabus.ts)
  — Reading and Listening are separate passages per lesson, not one
  narrating the other like the old novels were.

## The weekly prep routine (what actually matters)

Ordered by leverage — do these in order, don't skip to the end:

1. **Vocab first, always.** The book's own flow does this ("Activate" right
   after "Connect") — new words block comprehension of everything after.
   Study the week's vocab list *before* touching the reading passage.
2. **Read twice, differently.** First pass: skim for the main idea only
   (don't stop for unknown words). Second pass: read for detail to answer
   Summarize/Scan-type questions. Reading twice with a different goal each
   time is the actual skill being trained here, not just "read it."
3. **Listen actively, separately from reading.** The Listening passage is
   a *different* text from Reading (see curriculum shape above) — treat it
   as its own comprehension task, not background noise while reading.
4. **Retell out loud / fill the Knowledge Map.** Saying what was
   read+heard back in his own words is the highest-leverage step for being
   ready to speak in class — it's literally what "Knowledge Map" and
   "Prime & Practice" train. Skipping this is the most common way prep
   feels done but isn't.
5. **For C2 Output weeks specifically:** the work is a *group* project
   (Macro Project: Frame → Ideate → Materialize → Evaluate) — prep means
   having opinions/ideas ready to contribute, not a solo assignment to
   finish alone.

## When building app features from this

- A weekly checklist feature should mirror the 4 steps above in order, not
  just list "vocab / reading / listening / done."
- Don't conflate C1's single-flow week with C2's alternating Input/Output
  structure — a C2 Output week's checklist looks different (no new
  reading/listening to prep, it's project prep instead).
- Real lesson content (actual passages, vocab, listening scripts) arrives
  incrementally via photos from the physical textbook — see
  [BookReader.tsx](../../../src/components/BookReader.tsx)'s per-lesson upload flow. Don't assume
  content exists for a given week; check before referencing it.
