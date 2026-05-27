import { useState } from 'react';
import ShadowingPlayer from './components/ShadowingPlayer';
import VocabularyPanel from './components/VocabularyPanel';
import StoryWriter from './components/StoryWriter';
import OpinionWriter from './components/OpinionWriter';
import GamesPanel from './components/GamesPanel';

type MainTab = 'c1' | 'v1';
type C1Tab = 'shadowing' | 'vocabulary' | 'opinion' | 'games';
type V1Tab = 'story' | 'vocabulary' | 'games';

const SAMPLE_TEXT = `Elephants are the largest land animals on Earth. They live in Africa and Asia. These animals are known for their long trunks, which they use to pick up food and drink water. Elephants are very intelligent and have excellent memories. They live in family groups called herds, led by the oldest female. Sadly, elephants are endangered because of hunting and habitat loss. We must protect these amazing creatures.`;

export default function App() {
  const [mainTab, setMainTab] = useState<MainTab>('c1');
  const [c1Tab, setC1Tab] = useState<C1Tab>('shadowing');
  const [v1Tab, setV1Tab] = useState<V1Tab>('story');
  const [text, setText] = useState('');
  const [showTextInput, setShowTextInput] = useState(true);

  const activeText = text.trim() || SAMPLE_TEXT;

  const needsTextInput =
    (mainTab === 'c1' && (c1Tab === 'shadowing' || c1Tab === 'vocabulary' || c1Tab === 'games')) ||
    (mainTab === 'v1' && (v1Tab === 'vocabulary' || v1Tab === 'games'));

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">T</div>
            <div>
              <div className="font-bold text-gray-900 leading-tight">Taylor's English</div>
              <div className="text-xs text-gray-400">청담어학원 Tera 예습 도우미</div>
            </div>
          </div>
          <span className="text-sm text-gray-500 hidden sm:inline">안녕, Taylor! 👋</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">
        {/* Main Tab: C1 vs V1 */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMainTab('c1')}
            className={`py-4 rounded-2xl font-bold text-base transition-all flex flex-col items-center gap-1 ${
              mainTab === 'c1'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                : 'bg-white text-gray-500 hover:bg-gray-50 shadow-sm'
            }`}
          >
            <span className="text-2xl">🎧</span>
            <span>C1 — 읽기/듣기</span>
            <span className={`text-xs font-normal ${mainTab === 'c1' ? 'text-indigo-200' : 'text-gray-400'}`}>
              섀도잉 · 의견 쓰기
            </span>
          </button>
          <button
            onClick={() => setMainTab('v1')}
            className={`py-4 rounded-2xl font-bold text-base transition-all flex flex-col items-center gap-1 ${
              mainTab === 'v1'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-200'
                : 'bg-white text-gray-500 hover:bg-gray-50 shadow-sm'
            }`}
          >
            <span className="text-2xl">📖</span>
            <span>V1 — 소설/스토리</span>
            <span className={`text-xs font-normal ${mainTab === 'v1' ? 'text-purple-200' : 'text-gray-400'}`}>
              내용 이해 · 스토리 쓰기
            </span>
          </button>
        </div>

        {/* Text Input */}
        {needsTextInput && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => setShowTextInput(!showTextInput)}
              className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
            >
              <span className="font-semibold text-gray-700">
                📝 {mainTab === 'c1' ? '교재 지문 입력' : '소설 지문 입력'}
              </span>
              <span className="text-gray-400 text-sm">{showTextInput ? '▲ 접기' : '▼ 펼치기'}</span>
            </button>
            {showTextInput && (
              <div className="px-5 pb-5 space-y-2">
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder={`영어 본문을 여기에 붙여넣으세요...\n\n(입력이 없으면 샘플 지문으로 연습할 수 있어요)`}
                  className="w-full h-36 border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-300 focus:bg-white transition-all resize-none leading-relaxed"
                />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">
                    {text.trim() ? `${text.trim().split(/\s+/).length}단어 입력됨` : '샘플 지문 사용 중'}
                  </span>
                  {text && (
                    <button
                      onClick={() => setText('')}
                      className="text-xs text-gray-400 hover:text-red-400 transition-colors"
                    >
                      지우기
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* C1 Content */}
        {mainTab === 'c1' && (
          <>
            <div className="flex bg-white rounded-2xl shadow-sm border border-gray-100 p-1 gap-1">
              {([
                { id: 'shadowing', label: '🎧 섀도잉' },
                { id: 'vocabulary', label: '📚 단어장' },
                { id: 'opinion', label: '✍️ 의견 쓰기' },
                { id: 'games', label: '🎮 게임' },
              ] as { id: C1Tab; label: string }[]).map(t => (
                <button
                  key={t.id}
                  onClick={() => setC1Tab(t.id)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    c1Tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {c1Tab === 'shadowing' && <ShadowingPlayer text={activeText} />}
            {c1Tab === 'vocabulary' && <VocabularyPanel text={activeText} />}
            {c1Tab === 'opinion' && <OpinionWriter />}
            {c1Tab === 'games' && <GamesPanel text={activeText} />}
          </>
        )}

        {/* V1 Content */}
        {mainTab === 'v1' && (
          <>
            <div className="flex bg-white rounded-2xl shadow-sm border border-gray-100 p-1 gap-1">
              {([
                { id: 'story', label: '📖 스토리 쓰기' },
                { id: 'vocabulary', label: '📚 단어장' },
                { id: 'games', label: '🎮 게임' },
              ] as { id: V1Tab; label: string }[]).map(t => (
                <button
                  key={t.id}
                  onClick={() => setV1Tab(t.id)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    v1Tab === t.id ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {v1Tab === 'story' && <StoryWriter />}
            {v1Tab === 'vocabulary' && <VocabularyPanel text={activeText} />}
            {v1Tab === 'games' && <GamesPanel text={activeText} />}
          </>
        )}
      </div>
    </div>
  );
}
