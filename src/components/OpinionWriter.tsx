import { useState } from 'react';

interface OpinionSection {
  id: string;
  title: string;
  korTitle: string;
  emoji: string;
  placeholder: string;
  starters: string[];
}

const OPINION_SECTIONS: OpinionSection[] = [
  {
    id: 'topic',
    title: 'Topic Sentence',
    korTitle: '주제문 (내 의견)',
    emoji: '💬',
    placeholder: 'State your opinion clearly...',
    starters: [
      'I believe that...',
      'In my opinion,...',
      'I think that...',
      'I strongly agree/disagree that...',
    ],
  },
  {
    id: 'reason1',
    title: 'Reason 1',
    korTitle: '이유 1',
    emoji: '1️⃣',
    placeholder: 'Give your first reason...',
    starters: [
      'First of all,...',
      'One reason is that...',
      'To begin with,...',
    ],
  },
  {
    id: 'reason2',
    title: 'Reason 2',
    korTitle: '이유 2',
    emoji: '2️⃣',
    placeholder: 'Give your second reason...',
    starters: [
      'Another reason is that...',
      'In addition,...',
      'Furthermore,...',
      'Also,...',
    ],
  },
  {
    id: 'conclusion',
    title: 'Conclusion',
    korTitle: '결론 (마무리)',
    emoji: '✅',
    placeholder: 'Wrap up your opinion...',
    starters: [
      'In conclusion,...',
      'For these reasons,...',
      'That is why I believe...',
      'To sum up,...',
    ],
  },
];

export default function OpinionWriter() {
  const [topic, setTopic] = useState('');
  const [sections, setSections] = useState<Record<string, { text: string; showStarters: boolean }>>(
    Object.fromEntries(OPINION_SECTIONS.map(s => [s.id, { text: '', showStarters: false }]))
  );

  const update = (id: string, text: string) => {
    setSections(prev => ({ ...prev, [id]: { ...prev[id], text } }));
  };

  const toggleStarters = (id: string) => {
    setSections(prev => ({ ...prev, [id]: { ...prev[id], showStarters: !prev[id].showStarters } }));
  };

  const insertStarter = (id: string, starter: string) => {
    setSections(prev => {
      const current = prev[id].text;
      return { ...prev, [id]: { text: current ? current + ' ' + starter : starter, showStarters: false } };
    });
  };

  const totalWords = Object.values(sections).reduce((sum, s) =>
    sum + (s.text.trim() ? s.text.trim().split(/\s+/).length : 0), 0);

  const handleCopy = () => {
    const full = [
      topic ? `Discussion Topic: ${topic}\n` : '',
      ...OPINION_SECTIONS.map(sec =>
        `[${sec.title} - ${sec.korTitle}]\n${sections[sec.id].text}`)
    ].filter(Boolean).join('\n\n');
    navigator.clipboard.writeText(full);
  };

  const handleClear = () => {
    if (window.confirm('모든 내용을 지우시겠어요?')) {
      setSections(Object.fromEntries(OPINION_SECTIONS.map(s => [s.id, { text: '', showStarters: false }])));
      setTopic('');
    }
  };

  return (
    <div className="space-y-5">
      {/* Topic */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <label className="block text-sm font-semibold text-gray-600 mb-2">📌 토론 주제 (Discussion Topic)</label>
        <input
          type="text"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="예: Should students have less homework?"
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-indigo-400 transition-colors"
        />
      </div>

      <div className="text-xs text-gray-500 flex justify-between">
        <span>💡 C1 의견 쓰기 — 주제문 → 이유 2개 → 결론 구조로 작성해요</span>
        <span className="font-semibold text-indigo-600">총 {totalWords}단어</span>
      </div>

      {OPINION_SECTIONS.map(sec => (
        <div key={sec.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{sec.emoji}</span>
            <div>
              <div className="font-bold text-gray-800">{sec.title}</div>
              <div className="text-xs text-gray-500">{sec.korTitle}</div>
            </div>
            <div className="ml-auto text-xs text-gray-400">
              {sections[sec.id].text.trim() ? sections[sec.id].text.trim().split(/\s+/).length : 0} words
            </div>
          </div>

          <textarea
            value={sections[sec.id].text}
            onChange={e => update(sec.id, e.target.value)}
            placeholder={sec.placeholder}
            className="w-full h-24 border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-indigo-300 focus:bg-white transition-all resize-none leading-relaxed"
          />

          <div>
            <button
              onClick={() => toggleStarters(sec.id)}
              className="text-sm font-semibold text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              💬 유용한 표현 {sections[sec.id].showStarters ? '▲' : '▼'}
            </button>
            {sections[sec.id].showStarters && (
              <div className="mt-2 flex flex-wrap gap-2">
                {sec.starters.map((s, si) => (
                  <button
                    key={si}
                    onClick={() => insertStarter(sec.id, s)}
                    className="text-sm bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg text-indigo-700 transition-all"
                  >
                    "{s}"
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      <div className="flex gap-3 justify-end">
        <button onClick={handleClear} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-all">
          🗑 초기화
        </button>
        <button onClick={handleCopy} className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all active:scale-95">
          📋 전체 복사
        </button>
      </div>
    </div>
  );
}
