import { useState } from 'react';
import { BOOKS, WRITING_PROMPTS, type BookId, type WritingPrompt } from '../data/syllabus';

// ── Creative Story Writer (original StoryWriter logic embedded) ───────────────
const STORY_SECTIONS = [
  {
    title: 'Beginning', korTitle: '발단 (시작)', emoji: '🌅',
    color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-300',
    prompts: ['Who are the main characters?', 'Where and when does the story take place?', 'What is the situation at the start?'],
    starters: ['Once upon a time, there was...', 'In a small town called...', 'It all started when...', 'Long ago, in the land of...'],
  },
  {
    title: 'Middle', korTitle: '전개 (사건)', emoji: '⚡',
    color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-300',
    prompts: ['What problem or challenge happens?', 'How does the character try to solve it?', 'What goes wrong or gets harder?'],
    starters: ['One day, suddenly...', 'The problem was that...', 'When [character] tried to..., they discovered...', 'Things got worse when...'],
  },
  {
    title: 'End', korTitle: '결말 (마무리)', emoji: '🌟',
    color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-300',
    prompts: ['How is the problem solved?', 'How does the character change or grow?', 'What lesson did the character learn?'],
    starters: ['Finally, [character]...', 'In the end, [character] realized...', 'From that day on, [character]...', 'The lesson learned was...'],
  },
];

function CreativeStoryWriter() {
  const [title, setTitle] = useState('');
  const [texts, setTexts] = useState<string[]>(['', '', '']);
  const [showStarters, setShowStarters] = useState<boolean[]>([false, false, false]);

  const totalWords = texts.reduce((s, t) => s + (t.trim() ? t.trim().split(/\s+/).length : 0), 0);

  const insert = (i: number, starter: string) => {
    setTexts(prev => prev.map((t, j) => j === i ? (t ? t + ' ' + starter : starter) : t));
    setShowStarters(prev => prev.map((v, j) => j === i ? false : v));
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <label className="block text-sm font-semibold text-gray-600 mb-2">📖 스토리 제목</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="My Story Title..."
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-base font-semibold focus:outline-none focus:border-indigo-400 transition-colors" />
      </div>
      <div className="text-xs text-gray-400 flex justify-between px-1">
        <span>💡 3단계 구성으로 스토리를 완성해 보세요!</span>
        <span className="font-semibold text-indigo-600">총 {totalWords}단어</span>
      </div>
      {STORY_SECTIONS.map((sec, i) => (
        <div key={sec.title} className={`rounded-2xl border-2 ${sec.border} ${sec.bg} p-5 space-y-3`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{sec.emoji}</span>
              <div>
                <div className={`font-bold text-lg ${sec.color}`}>{sec.title}</div>
                <div className="text-xs text-gray-500">{sec.korTitle}</div>
              </div>
            </div>
            <span className="text-xs text-gray-400">{texts[i].trim() ? texts[i].trim().split(/\s+/).length : 0} words</span>
          </div>
          <div className="space-y-1">
            {sec.prompts.map((p, pi) => (
              <div key={pi} className="flex gap-2 text-sm text-gray-600">
                <span className="text-gray-400">•</span><span>{p}</span>
              </div>
            ))}
          </div>
          <textarea value={texts[i]} onChange={e => setTexts(prev => prev.map((t, j) => j === i ? e.target.value : t))}
            placeholder={`Write the ${sec.title.toLowerCase()} of your story here...`}
            className="w-full h-32 border-2 border-white bg-white rounded-xl px-4 py-3 text-base focus:outline-none focus:border-indigo-300 transition-colors resize-none leading-relaxed" />
          <div>
            <button onClick={() => setShowStarters(prev => prev.map((v, j) => j === i ? !v : v))}
              className="text-sm font-semibold text-gray-500 hover:text-gray-700">
              💬 문장 시작 힌트 {showStarters[i] ? '▲' : '▼'}
            </button>
            {showStarters[i] && (
              <div className="mt-2 flex flex-wrap gap-2">
                {sec.starters.map((s, si) => (
                  <button key={si} onClick={() => insert(i, s)}
                    className="text-sm bg-white border border-gray-200 px-3 py-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:shadow-sm transition-all text-left">
                    "{s}"
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
      <div className="flex justify-end gap-3">
        <button onClick={() => { if (window.confirm('모든 내용을 지우시겠어요?')) { setTexts(['','','']); setTitle(''); } }}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-all">
          🗑 초기화
        </button>
        <button onClick={() => navigator.clipboard.writeText([title ? `Title: ${title}` : '', ...STORY_SECTIONS.map((s,i) => `[${s.title}]\n${texts[i]}`)].filter(Boolean).join('\n\n'))}
          className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all">
          📋 전체 복사
        </button>
      </div>
    </div>
  );
}

// ── Essay Editor ──────────────────────────────────────────────────────────────
function EssayEditor({ prompt, bookId, onBack }: { prompt: WritingPrompt; bookId: BookId; onBack: () => void }) {
  const bk = BOOKS[bookId];
  const key = `taylor_essay_${bookId}_${prompt.id}`;
  const [texts, setTexts] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? prompt.sections.map(() => ''); }
    catch { return prompt.sections.map(() => ''); }
  });
  const [showStarters, setShowStarters] = useState<boolean[]>(prompt.sections.map(() => false));

  const save = (next: string[]) => {
    setTexts(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const totalWords = texts.reduce((s, t) => s + (t.trim() ? t.trim().split(/\s+/).length : 0), 0);
  const hasContent = texts.some(t => t.trim().length > 0);

  const copyAll = () => {
    const out = [
      `[${prompt.concept}] ${prompt.question}`,
      '',
      ...prompt.sections.map((sec, i) => `## ${sec.title} (${sec.korTitle})\n${texts[i]}`),
    ].join('\n\n');
    navigator.clipboard.writeText(out);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={`rounded-2xl border-2 ${bk.border} ${bk.bg} p-4`}>
        <button onClick={onBack} className="text-xs text-gray-400 hover:text-gray-600 mb-2 flex items-center gap-1">
          ← 프롬프트 목록으로
        </button>
        <div className="flex items-start gap-3">
          <span className="text-3xl shrink-0">{prompt.emoji}</span>
          <div>
            <div className={`font-bold text-base ${bk.color}`}>{prompt.concept}</div>
            <div className="text-xs text-gray-500 mt-0.5">{prompt.korConcept}</div>
            <div className="text-sm text-gray-700 mt-1.5 leading-relaxed font-medium">{prompt.question}</div>
            <div className="text-xs text-gray-500 mt-0.5">{prompt.korGuide}</div>
          </div>
        </div>
      </div>

      <div className="flex justify-between text-xs text-gray-400 px-1">
        <span>💡 각 섹션을 채워 에세이를 완성하세요</span>
        <span className={`font-semibold ${totalWords >= 150 ? 'text-emerald-600' : 'text-indigo-600'}`}>
          {totalWords}단어 {totalWords >= 150 ? '✓' : `(목표: 150+)`}
        </span>
      </div>

      {/* Sections */}
      {prompt.sections.map((sec, i) => (
        <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-gray-800">{sec.title}</div>
              <div className="text-xs text-gray-500">{sec.korTitle}</div>
            </div>
            <span className="text-xs text-gray-400">{texts[i].trim() ? texts[i].trim().split(/\s+/).length : 0} words</span>
          </div>
          <div className="text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2 leading-relaxed">
            {sec.guide}
          </div>
          <textarea value={texts[i]}
            onChange={e => save(texts.map((t, j) => j === i ? e.target.value : t))}
            placeholder={`Write your ${sec.title.toLowerCase()} here...`}
            className="w-full h-36 border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-indigo-300 focus:bg-white transition-all resize-none leading-relaxed" />
          <div>
            <button onClick={() => setShowStarters(prev => prev.map((v, j) => j === i ? !v : v))}
              className="text-sm font-semibold text-gray-400 hover:text-gray-600">
              💬 문장 시작 힌트 {showStarters[i] ? '▲' : '▼'}
            </button>
            {showStarters[i] && (
              <div className="mt-2 flex flex-wrap gap-2">
                {sec.starters.map((s, si) => (
                  <button key={si}
                    onClick={() => save(texts.map((t, j) => j === i ? (t ? t + ' ' + s : s) : t))}
                    className="text-sm bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-all text-left">
                    "{s}"
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        {hasContent && (
          <button onClick={() => { if (window.confirm('이 에세이 내용을 지우시겠어요?')) save(prompt.sections.map(() => '')); }}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-all">
            🗑 초기화
          </button>
        )}
        <button onClick={copyAll}
          className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all">
          📋 전체 복사
        </button>
      </div>
    </div>
  );
}

// ── Prompt card grid ──────────────────────────────────────────────────────────
function PromptGrid({ bookId, onSelect }: { bookId: BookId; onSelect: (p: WritingPrompt) => void }) {
  const bk = BOOKS[bookId];
  const prompts = WRITING_PROMPTS[bookId];

  return (
    <div className="space-y-4">
      <div className={`${bk.bg} border-2 ${bk.border} rounded-2xl p-4`}>
        <div className={`font-bold text-sm ${bk.color} mb-1`}>
          {bk.emoji} {bk.shortTitle} — 작품 분석 글쓰기
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {bk.themes.map(t => (
            <span key={t} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${bk.badge} text-white`}>{t}</span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {prompts.map(p => {
          const saved = (() => {
            try {
              const v = JSON.parse(localStorage.getItem(`taylor_essay_${bookId}_${p.id}`) ?? 'null');
              return Array.isArray(v) && v.some((t: string) => t.trim());
            } catch { return false; }
          })();
          return (
            <button key={p.id} onClick={() => onSelect(p)}
              className="text-left bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:border-indigo-300 hover:shadow-md transition-all group">
              <div className="flex items-start justify-between gap-2">
                <span className="text-3xl">{p.emoji}</span>
                {saved && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold shrink-0">작성 중</span>}
              </div>
              <div className={`font-bold text-sm mt-2 ${bk.color} group-hover:text-indigo-600`}>{p.concept}</div>
              <div className="text-xs text-gray-500 mt-0.5">{p.korConcept}</div>
              <div className="text-xs text-gray-600 mt-2 leading-relaxed line-clamp-2">{p.question}</div>
              <div className="text-xs text-gray-400 mt-2">{p.sections.length}개 섹션 → 에세이 완성</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LiteraryAnalysisWriter({ book }: { book: BookId }) {
  const [mode, setMode]           = useState<'analysis' | 'creative'>('analysis');
  const [selectedPrompt, setSelectedPrompt] = useState<WritingPrompt | null>(null);

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex bg-white rounded-2xl shadow-sm border border-gray-100 p-1 gap-1">
        <button onClick={() => { setMode('analysis'); setSelectedPrompt(null); }}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            mode === 'analysis' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
          }`}>
          📚 작품 분석 에세이
        </button>
        <button onClick={() => setMode('creative')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            mode === 'creative' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
          }`}>
          ✍️ 창작 스토리
        </button>
      </div>

      {/* Content */}
      {mode === 'analysis' && !selectedPrompt && (
        <PromptGrid bookId={book} onSelect={setSelectedPrompt} />
      )}
      {mode === 'analysis' && selectedPrompt && (
        <EssayEditor prompt={selectedPrompt} bookId={book} onBack={() => setSelectedPrompt(null)} />
      )}
      {mode === 'creative' && <CreativeStoryWriter />}
    </div>
  );
}
