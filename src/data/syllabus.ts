export type BookId = 'edward' | 'coraline';

export interface BookInfo {
  id: BookId;
  title: string;
  shortTitle: string;
  author: string;
  emoji: string;
  color: string;
  bg: string;
  border: string;
  badge: string;
  korSummary: string;
  themes: string[];
}

export const BOOKS: Record<BookId, BookInfo> = {
  edward: {
    id: 'edward',
    title: 'The Miraculous Journey of Edward Tulane',
    shortTitle: 'Edward Tulane',
    author: 'Kate DiCamillo',
    emoji: '🐰',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    badge: 'bg-blue-600',
    korSummary: '오만한 도자기 토끼 에드워드가 여정을 통해 사랑의 진정한 의미를 깨닫는 이야기',
    themes: ['Dynamic Character', 'Symbolism', 'Love & Loss', 'Redemption'],
  },
  coraline: {
    id: 'coraline',
    title: 'Coraline',
    shortTitle: 'Coraline',
    author: 'Neil Gaiman',
    emoji: '🔮',
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    border: 'border-purple-300',
    badge: 'bg-purple-600',
    korSummary: '호기심 많은 소녀 코라인이 또 다른 세계에서 진정한 용기를 발휘하는 다크 판타지',
    themes: ['True Bravery', 'Mood & Tone', 'Comparison & Contrast', 'Identity'],
  },
};

export interface LessonEntry {
  lesson: number;
  date: string;        // YYYY-MM-DD
  book: BookId;
  pages: string;
  homework: string;
  chapters?: [number, number];  // [firstChapter, lastChapter] in the uploaded PDF
}

export const SCHEDULE: LessonEntry[] = [
  { lesson:  1, date: '2026-06-03', book: 'edward',   pages: 'Ch. 1~3',     homework: 'Read pp. 27~65', chapters: [1, 3] },
  { lesson:  2, date: '2026-06-10', book: 'edward',   pages: 'pp. 27~65',   homework: 'Read pp. 69~102' },
  { lesson:  3, date: '2026-06-17', book: 'edward',   pages: 'pp. 69~102',  homework: 'Read pp. 105~136' },
  { lesson:  4, date: '2026-06-24', book: 'edward',   pages: 'pp. 105~136', homework: 'Read pp. 139~173' },
  { lesson:  5, date: '2026-07-01', book: 'edward',   pages: 'pp. 139~173', homework: 'Read pp. 177~210' },
  { lesson:  6, date: '2026-07-08', book: 'edward',   pages: 'pp. 177~210', homework: 'Read Coraline pp. 1~19' },
  { lesson:  7, date: '2026-07-15', book: 'coraline', pages: 'pp. 1~19',    homework: 'Read pp. 21~45' },
  { lesson:  8, date: '2026-07-22', book: 'coraline', pages: 'pp. 21~45',   homework: 'Read pp. 47~78' },
  { lesson:  9, date: '2026-08-05', book: 'coraline', pages: 'pp. 47~78',   homework: 'Read pp. 79~112' },
  { lesson: 10, date: '2026-08-12', book: 'coraline', pages: 'pp. 79~112',  homework: 'Read pp. 113~135' },
  { lesson: 11, date: '2026-08-19', book: 'coraline', pages: 'pp. 113~135', homework: 'Read pp. 137~160' },
  { lesson: 12, date: '2026-08-26', book: 'coraline', pages: 'pp. 137~160', homework: 'Term End 🎉' },
];

export const HOLIDAY = { date: '2026-07-29', note: 'NO CLASS (7/29 ~ 7/31 여름방학)' };

// ── Writing Prompts ───────────────────────────────────────────────────────────
export interface EssaySection {
  title: string;
  korTitle: string;
  guide: string;
  starters: string[];
}
export interface WritingPrompt {
  id: string;
  concept: string;
  korConcept: string;
  emoji: string;
  question: string;
  korGuide: string;
  sections: EssaySection[];
}

export const WRITING_PROMPTS: Record<BookId, WritingPrompt[]> = {
  edward: [
    {
      id: 'dynamic-character',
      concept: 'Dynamic Character',
      korConcept: '인물의 변화 분석',
      emoji: '🔄',
      question: 'How does Edward change throughout the story? What experiences cause these changes?',
      korGuide: '에드워드의 성격이 어떻게 변했나요? 어떤 사건들이 그를 변하게 했나요?',
      sections: [
        {
          title: 'Introduction',
          korTitle: '도입 — 나의 주장',
          guide: 'Introduce Edward as he is at the beginning. Write a thesis: how does he change overall?',
          starters: [
            'At the beginning of the story, Edward Tulane is...',
            'Throughout the novel, Edward undergoes a significant transformation from... to...',
            'Kate DiCamillo uses Edward\'s journey to show that...',
          ],
        },
        {
          title: 'Evidence & Analysis',
          korTitle: '근거 — 장면 인용 + 분석',
          guide: 'Choose 2–3 key moments that show Edward\'s change. Describe each scene and explain what it reveals.',
          starters: [
            'One key moment that shows Edward\'s change is when...',
            'Before this event, Edward felt..., but afterwards, he...',
            'This scene is significant because it shows that Edward has learned...',
            'The author uses this moment to illustrate...',
          ],
        },
        {
          title: 'Conclusion',
          korTitle: '결론 — 주제와 연결',
          guide: 'What is the most important lesson Edward learns? What does his transformation teach us?',
          starters: [
            'Ultimately, Edward\'s journey teaches us that...',
            'By the end of the novel, Edward has transformed from... into...',
            'DiCamillo\'s message is that love requires...',
          ],
        },
      ],
    },
    {
      id: 'symbolism',
      concept: 'Symbolism',
      korConcept: '상징 분석',
      emoji: '🔍',
      question: 'Choose one symbol from the story. What does it represent, and how does it connect to the theme?',
      korGuide: '작품 속 상징 하나를 골라 그 의미와 주제와의 연결성을 분석하세요.',
      sections: [
        {
          title: 'Introduction',
          korTitle: '도입 — 상징 소개',
          guide: 'Introduce the symbol you chose. Where does it first appear in the story?',
          starters: [
            'In "The Miraculous Journey of Edward Tulane," the [symbol] serves as a powerful symbol of...',
            'Throughout the novel, Kate DiCamillo uses [symbol] to represent...',
            'One of the most important symbols in this story is...',
          ],
        },
        {
          title: 'Evidence & Analysis',
          korTitle: '근거 — 변화 추적',
          guide: 'Give 2–3 examples of where this symbol appears. How does it change? What does that change mean?',
          starters: [
            'The [symbol] first appears when..., suggesting that...',
            'As the story progresses, the [symbol] changes by... This represents...',
            'The [symbol] is most powerful in the scene where... because...',
          ],
        },
        {
          title: 'Conclusion',
          korTitle: '결론 — 주제와 연결',
          guide: 'How does this symbol connect to the main theme of love, loss, or redemption?',
          starters: [
            'Ultimately, this symbol reinforces the theme that...',
            'Through this symbol, DiCamillo reminds us that...',
            'The [symbol] is a powerful reminder that...',
          ],
        },
      ],
    },
    {
      id: 'love-loss',
      concept: 'Love & Loss',
      korConcept: '사랑과 상실 (주제 에세이)',
      emoji: '💔',
      question: 'What does this story suggest about the relationship between love and loss?',
      korGuide: '이 이야기는 사랑과 상실의 관계에 대해 무엇을 말하고 있나요?',
      sections: [
        {
          title: 'Introduction',
          korTitle: '도입 — 나의 입장',
          guide: 'What is your opinion about love and loss in this story? Write a clear thesis statement.',
          starters: [
            'In "The Miraculous Journey of Edward Tulane," DiCamillo argues that...',
            'This novel suggests that true love is impossible without...',
            'Edward\'s story teaches us that loss is...',
          ],
        },
        {
          title: 'Evidence & Analysis',
          korTitle: '근거 — 상실의 순간들',
          guide: 'What specific losses does Edward experience? How does each loss affect him differently?',
          starters: [
            'When Edward loses [person/thing], he feels... because...',
            'Each loss teaches Edward that...',
            'The most significant loss in the novel is... because...',
          ],
        },
        {
          title: 'Conclusion',
          korTitle: '결론 — 나의 의견',
          guide: 'Do you agree with the story\'s message about love? Connect to your own life or experience.',
          starters: [
            'I agree/disagree with DiCamillo\'s message because...',
            'This story teaches us that to truly love someone, we must...',
            'Edward\'s journey shows that loss, while painful, can...',
          ],
        },
      ],
    },
    {
      id: 'response-journal',
      concept: 'Response Journal',
      korConcept: '독서 일지 (자유 서술)',
      emoji: '📔',
      question: 'What are your thoughts, reactions, and questions about this week\'s reading?',
      korGuide: '이번 주 읽은 부분에 대한 생각, 느낌, 궁금한 점을 자유롭게 써보세요.',
      sections: [
        {
          title: 'Summary',
          korTitle: '이번 주 내용 요약',
          guide: 'Briefly summarize what happened in this week\'s reading (2–3 sentences).',
          starters: ['This week, I read about...', 'In the section I read, Edward...', 'The main events were...'],
        },
        {
          title: 'My Reaction',
          korTitle: '나의 반응과 느낌',
          guide: 'How did this section make you feel? What surprised or moved you?',
          starters: [
            'I was surprised when... because...',
            'The most emotional part for me was... I felt...',
            'I connected to this part because in my own life...',
          ],
        },
        {
          title: 'Questions & Predictions',
          korTitle: '궁금한 점 & 예상',
          guide: 'What questions do you have? What do you predict will happen next?',
          starters: ['I wonder why...', 'I\'m curious about...', 'I predict that next, Edward will... because...'],
        },
      ],
    },
  ],

  coraline: [
    {
      id: 'mood-tone',
      concept: 'Mood & Tone',
      korConcept: '분위기와 어조 분석',
      emoji: '🌑',
      question: 'How does Neil Gaiman create a dark and unsettling mood in Coraline? What specific techniques does he use?',
      korGuide: '닐 게이먼은 어떻게 어둡고 불안한 분위기를 만드나요? 어떤 기법을 사용했나요?',
      sections: [
        {
          title: 'Introduction',
          korTitle: '도입 — 전체 분위기 소개',
          guide: 'Describe the overall mood of the book. Write a thesis about how Gaiman creates this mood.',
          starters: [
            'Neil Gaiman creates a dark and unsettling mood in "Coraline" through...',
            'Throughout the novel, Gaiman uses [techniques] to establish a tone of...',
            'The atmosphere in "Coraline" can best be described as... and Gaiman achieves this by...',
          ],
        },
        {
          title: 'Evidence & Analysis',
          korTitle: '근거 — 구체적 장면/표현',
          guide: 'Choose 2–3 specific scenes or passages. What words, images, or descriptions create the mood?',
          starters: [
            'In the scene where..., Gaiman uses words like "..." to create...',
            'The description of [setting/character] is particularly effective because...',
            'When Gaiman writes "...", the reader feels... because...',
          ],
        },
        {
          title: 'Conclusion',
          korTitle: '결론 — 분위기의 역할',
          guide: 'Why is this dark mood important to the story\'s themes? What would be lost without it?',
          starters: [
            'The dark mood in "Coraline" is essential because...',
            'Without this unsettling atmosphere, the story could not explore...',
            'Gaiman\'s masterful use of mood teaches us that...',
          ],
        },
      ],
    },
    {
      id: 'compare-contrast',
      concept: 'Comparison & Contrast',
      korConcept: '두 세계 비교와 대조',
      emoji: '⚖️',
      question: 'Compare and contrast Coraline\'s real world with the "Other World." What does this contrast reveal?',
      korGuide: '코라인의 현실 세계와 \'또 다른 세계\'를 비교·대조하고, 이 대비가 주제에 대해 무엇을 드러내는지 분석하세요.',
      sections: [
        {
          title: 'Introduction',
          korTitle: '도입 — 두 세계 소개',
          guide: 'Briefly describe both worlds. Write a thesis about what the contrast between them reveals.',
          starters: [
            'In "Coraline," Gaiman creates two contrasting worlds to explore...',
            'While the real world is..., the Other World appears to be..., but ultimately...',
            'The contrast between Coraline\'s real world and the Other World reveals that...',
          ],
        },
        {
          title: 'Similarities & Differences',
          korTitle: '공통점 & 차이점',
          guide: 'What is similar? What is different? Use specific examples. A Venn diagram in your head can help.',
          starters: [
            'Both worlds share..., however, the key difference is...',
            'On the surface, the Other World seems better because... but in reality...',
            'In contrast to the real world\'s..., the Other World offers...',
          ],
        },
        {
          title: 'Conclusion',
          korTitle: '결론 — 작가의 메시지',
          guide: 'What does this contrast say about desire, perfection, and what truly matters in life?',
          starters: [
            'The contrast between the two worlds shows that true happiness...',
            'Gaiman uses this comparison to warn us that...',
            'Ultimately, the Other World represents... which teaches us that...',
          ],
        },
      ],
    },
    {
      id: 'true-bravery',
      concept: 'True Bravery',
      korConcept: '진정한 용기 분석',
      emoji: '💪',
      question: 'Is Coraline truly brave? What does this story suggest about the nature of courage?',
      korGuide: '코라인은 진정으로 용감한가요? 이 이야기는 용기의 본질에 대해 무엇을 말하나요?',
      sections: [
        {
          title: 'Introduction',
          korTitle: '도입 — 나의 주장',
          guide: 'State your position: Is Coraline brave? Define what "true bravery" means in your own words.',
          starters: [
            'True bravery is not the absence of fear, but...',
            'Coraline demonstrates true courage in this story because...',
            'In "Coraline," Neil Gaiman suggests that bravery means...',
          ],
        },
        {
          title: 'Evidence & Analysis',
          korTitle: '근거 — 용기의 순간들',
          guide: 'Give 2–3 specific examples of Coraline facing her fears. Was her response brave?',
          starters: [
            'One example of Coraline\'s bravery is when she..., even though she was afraid because...',
            'Although Coraline felt frightened, she chose to... This shows that...',
            'The most courageous moment in the story is when... because...',
          ],
        },
        {
          title: 'Conclusion',
          korTitle: '결론 — 나의 의견',
          guide: 'What lesson about bravery does the story teach? Do you agree with it?',
          starters: [
            'Through Coraline\'s story, Gaiman teaches us that courage requires...',
            'I agree/disagree that Coraline is truly brave because...',
            'This story\'s most important lesson about bravery is...',
          ],
        },
      ],
    },
    {
      id: 'response-journal',
      concept: 'Response Journal',
      korConcept: '독서 일지 (자유 서술)',
      emoji: '📔',
      question: 'What are your thoughts, reactions, and questions about this week\'s reading?',
      korGuide: '이번 주 읽은 부분에 대한 생각, 느낌, 궁금한 점을 자유롭게 써보세요.',
      sections: [
        {
          title: 'Summary',
          korTitle: '이번 주 내용 요약',
          guide: 'Briefly summarize what happened in this week\'s reading (2–3 sentences).',
          starters: ['This week, I read about...', 'In the section I read, Coraline...', 'The main events were...'],
        },
        {
          title: 'My Reaction',
          korTitle: '나의 반응과 느낌',
          guide: 'How did this section make you feel? What surprised or disturbed you?',
          starters: [
            'The part that surprised me most was... because...',
            'I felt uncomfortable/excited when... because...',
            'I connected to Coraline\'s experience of... because...',
          ],
        },
        {
          title: 'Questions & Predictions',
          korTitle: '궁금한 점 & 예상',
          guide: 'What questions do you have? What do you predict will happen next?',
          starters: ['I wonder why the Other Mother...', 'I\'m curious about...', 'I predict that Coraline will... because...'],
        },
      ],
    },
  ],
};
