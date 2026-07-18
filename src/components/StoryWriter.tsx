import { useState } from 'react';
import Icon from './Icon';

interface StorySection {
  title: string;
  korTitle: string;
  emoji: string;
  color: string;
  bgColor: string;
  borderColor: string;
  prompts: string[];
  starters: string[];
}

const SECTIONS: StorySection[] = [
  {
    title: 'Beginning',
    korTitle: '발단 (시작)',
    emoji: '🌅',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    prompts: [
      'Who are the main characters?',
      'Where and when does the story take place?',
      'What is the situation at the start?',
    ],
    starters: [
      'Once upon a time, there was...',
      'In a small town called...',
      'On a [day], a [character] named...',
      'It all started when...',
      'Long ago, in the land of...',
    ],
  },
  {
    title: 'Middle',
    korTitle: '전개 (사건)',
    emoji: '⚡',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-300',
    prompts: [
      'What problem or challenge happens?',
      'How does the character try to solve it?',
      'What goes wrong or gets harder?',
    ],
    starters: [
      'One day, suddenly...',
      'The problem was that...',
      'When [character] tried to..., they discovered...',
      'Things got worse when...',
      'Just when [character] thought..., something happened.',
    ],
  },
  {
    title: 'End',
    korTitle: '결말 (마무리)',
    emoji: '🌟',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-300',
    prompts: [
      'How is the problem solved?',
      'How does the character change or grow?',
      'What lesson did the character learn?',
    ],
    starters: [
      'Finally, [character]...',
      'In the end, [character] realized...',
      'Thanks to [action], the problem was solved.',
      'From that day on, [character]...',
      'The lesson [character] learned was...',
    ],
  },
];

interface SectionState {
  text: string;
  showStarters: boolean;
}

export default function StoryWriter() {
  const [sections, setSections] = useState<SectionState[]>(
    SECTIONS.map(() => ({ text: '', showStarters: false }))
  );
  const [storyTitle, setStoryTitle] = useState('');

  const updateSection = (i: number, text: string) => {
    setSections(prev => prev.map((s, idx) => idx === i ? { ...s, text } : s));
  };

  const toggleStarters = (i: number) => {
    setSections(prev => prev.map((s, idx) => idx === i ? { ...s, showStarters: !s.showStarters } : s));
  };

  const insertStarter = (i: number, starter: string) => {
    setSections(prev => prev.map((s, idx) => {
      if (idx !== i) return s;
      const newText = s.text ? s.text + ' ' + starter : starter;
      return { ...s, text: newText, showStarters: false };
    }));
  };

  const totalWords = sections.reduce((sum, s) => {
    return sum + (s.text.trim() ? s.text.trim().split(/\s+/).length : 0);
  }, 0);

  const handleCopyAll = () => {
    const full = [
      storyTitle ? `Title: ${storyTitle}\n` : '',
      ...SECTIONS.map((sec, i) => `[${sec.title} - ${sec.korTitle}]\n${sections[i].text}`)
    ].filter(Boolean).join('\n\n');
    navigator.clipboard.writeText(full);
  };

  const handleClear = () => {
    if (window.confirm('모든 내용을 지우시겠어요?')) {
      setSections(SECTIONS.map(() => ({ text: '', showStarters: false })));
      setStoryTitle('');
    }
  };

  return (
    <div className="space-y-5">
      {/* Title */}
      <div className="surface p-5">
        <label className="eyebrow block mb-2">📖 스토리 제목 (Title)</label>
        <input
          type="text"
          value={storyTitle}
          onChange={e => setStoryTitle(e.target.value)}
          placeholder="My Story Title..."
          className="field text-lg font-semibold"
        />
      </div>

      <div className="text-xs text-gray-500 flex justify-between">
        <span>💡 3단계 구성으로 스토리를 완성해 보세요! (V1 핵심 기술)</span>
        <span className="font-semibold text-violet-600">총 {totalWords}단어</span>
      </div>

      {/* Three sections */}
      {SECTIONS.map((sec, i) => (
        <div key={sec.title} className={`rounded-[1.25rem] border ${sec.borderColor} ${sec.bgColor} p-5 space-y-3 shadow-sm`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-extrabold ${sec.color} ${sec.borderColor}`}>{i + 1}</span>
              <div>
                <div className={`font-bold text-lg ${sec.color}`}>{sec.title}</div>
                <div className="text-xs text-gray-500">{sec.korTitle}</div>
              </div>
            </div>
            <div className="text-right text-xs text-muted">
              {sections[i].text.trim() ? sections[i].text.trim().split(/\s+/).length : 0} words
            </div>
          </div>

          {/* Prompts */}
          <div className="flex flex-col gap-1">
            {sec.prompts.map((p, pi) => (
              <div key={pi} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="text-muted mt-0.5">•</span>
                <span>{p}</span>
              </div>
            ))}
          </div>

          {/* Textarea */}
          <textarea
            value={sections[i].text}
            onChange={e => updateSection(i, e.target.value)}
            placeholder={`Write the ${sec.title.toLowerCase()} of your story here...`}
            className="field h-32 resize-none leading-relaxed"
          />

          {/* Sentence starters */}
          <div>
            <button
              onClick={() => toggleStarters(i)}
              className="text-sm font-semibold text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              💬 문장 시작 힌트 {sections[i].showStarters ? '▲' : '▼'}
            </button>
            {sections[i].showStarters && (
              <div className="mt-2 flex flex-wrap gap-2">
                {sec.starters.map((starter, si) => (
                  <button
                    key={si}
                    onClick={() => insertStarter(i, starter)}
                    className="text-sm bg-white hover:bg-violet-50 border border-gray-200 px-3 py-1.5 rounded-lg text-gray-600 hover:text-violet-700 transition-[background-color,color] text-left"
                  >
                    "{starter}"
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Action buttons */}
      <div className="flex gap-3 justify-end">
        <button
          onClick={handleClear}
          className="btn-soft inline-flex items-center gap-1.5"
        >
          <Icon name="trash" className="h-4 w-4" /> 초기화
        </button>
        <button
          onClick={handleCopyAll}
          className="btn-primary inline-flex items-center gap-1.5"
        >
          <Icon name="copy" className="h-4 w-4" /> 전체 복사
        </button>
      </div>
    </div>
  );
}
