import { useState, useEffect, useRef } from 'react';
import ShadowingPlayer from './components/ShadowingPlayer';
import VocabularyPanel from './components/VocabularyPanel';
import StoryWriter from './components/StoryWriter';
import OpinionWriter from './components/OpinionWriter';
import GamesPanel from './components/GamesPanel';
import ProgressDashboard from './components/ProgressDashboard';
import { trackSession } from './lib/tracker';

type MainTab = 'a2' | 'v1' | 'progress';
type A2Tab = 'shadowing' | 'vocabulary' | 'opinion' | 'games';
type V1Tab = 'story' | 'vocabulary' | 'games';

const SAMPLE_TEXT = `Elephants are the largest land animals on Earth. They live in Africa and Asia. These animals are known for their long trunks, which they use to pick up food and drink water. Elephants are very intelligent and have excellent memories. They live in family groups called herds, led by the oldest female. Sadly, elephants are endangered because of hunting and habitat loss. We must protect these amazing creatures.`;

export default function App() {
  const [mainTab, setMainTab] = useState<MainTab>('a2');
  const [a2Tab, setA2Tab]     = useState<A2Tab>('shadowing');
  const [v1Tab, setV1Tab]     = useState<V1Tab>('story');
  const [text, setText]       = useState('');
  const [showTextInput, setShowTextInput] = useState(true);

  // Session tracking: record time spent in each feature
  const sessionStart = useRef<number>(Date.now());
  const currentMode    = useRef<'a2' | 'v1'>('a2');
  const currentFeature = useRef<string>('shadowing');

  const flushSession = () => {
    const secs = (Date.now() - sessionStart.current) / 1000;
    trackSession(currentMode.current, currentFeature.current, secs);
    sessionStart.current = Date.now();
  };

  const switchTab = (mode: 'a2' | 'v1', feature: string) => {
    flushSession();
    currentMode.current    = mode;
    currentFeature.current = feature;
  };

  // Flush session on page unload
  useEffect(() => {
    const handler = () => flushSession();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeText = text.trim() || SAMPLE_TEXT;

  const needsTextInput =
    (mainTab === 'a2' && (a2Tab === 'shadowing' || a2Tab === 'vocabulary' || a2Tab === 'games')) ||
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
        {/* Main Tab */}
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => { flushSession(); setMainTab('a2'); }}
            className={`py-4 rounded-2xl font-bold text-base transition-all flex flex-col items-center gap-1 ${
              mainTab === 'a2' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-gray-500 hover:bg-gray-50 shadow-sm'
            }`}>
            <span className="text-2xl">🎧</span>
            <span className="text-sm">A2 읽기/듣기</span>
            <span className={`text-xs font-normal ${mainTab === 'a2' ? 'text-indigo-200' : 'text-gray-400'}`}>섀도잉 · 쓰기</span>
          </button>
          <button onClick={() => { flushSession(); setMainTab('v1'); }}
            className={`py-4 rounded-2xl font-bold text-base transition-all flex flex-col items-center gap-1 ${
              mainTab === 'v1' ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' : 'bg-white text-gray-500 hover:bg-gray-50 shadow-sm'
            }`}>
            <span className="text-2xl">📖</span>
            <span className="text-sm">V1 소설</span>
            <span className={`text-xs font-normal ${mainTab === 'v1' ? 'text-purple-200' : 'text-gray-400'}`}>이해 · 스토리</span>
          </button>
          <button onClick={() => { flushSession(); setMainTab('progress'); }}
            className={`py-4 rounded-2xl font-bold text-base transition-all flex flex-col items-center gap-1 ${
              mainTab === 'progress' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' : 'bg-white text-gray-500 hover:bg-gray-50 shadow-sm'
            }`}>
            <span className="text-2xl">📊</span>
            <span className="text-sm">성장 기록</span>
            <span className={`text-xs font-normal ${mainTab === 'progress' ? 'text-emerald-200' : 'text-gray-400'}`}>단어 · 점수</span>
          </button>
        </div>

        {/* Text Input */}
        {needsTextInput && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button onClick={() => setShowTextInput(!showTextInput)}
              className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors">
              <span className="font-semibold text-gray-700">
                📝 {mainTab === 'a2' ? '교재 지문 입력' : '소설 지문 입력'}
              </span>
              <span className="text-gray-400 text-sm">{showTextInput ? '▲ 접기' : '▼ 펼치기'}</span>
            </button>
            {showTextInput && (
              <div className="px-5 pb-5 space-y-2">
                <textarea value={text} onChange={e => setText(e.target.value)}
                  placeholder={`영어 본문을 여기에 붙여넣으세요...\n\n(입력이 없으면 샘플 지문으로 연습할 수 있어요)`}
                  className="w-full h-36 border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-300 focus:bg-white transition-all resize-none leading-relaxed"
                />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">
                    {text.trim() ? `${text.trim().split(/\s+/).length}단어 입력됨` : '샘플 지문 사용 중'}
                  </span>
                  {text && (
                    <button onClick={() => setText('')} className="text-xs text-gray-400 hover:text-red-400 transition-colors">
                      지우기
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* A2 Content */}
        {mainTab === 'a2' && (
          <>
            <div className="flex bg-white rounded-2xl shadow-sm border border-gray-100 p-1 gap-1">
              {([
                { id: 'shadowing', label: '🎧 섀도잉' },
                { id: 'vocabulary', label: '📚 단어장' },
                { id: 'opinion',  label: '✍️ 의견 쓰기' },
                { id: 'games',    label: '🎮 게임' },
              ] as { id: A2Tab; label: string }[]).map(t => (
                <button key={t.id}
                  onClick={() => { switchTab('a2', t.id); setA2Tab(t.id); }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    a2Tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
            {a2Tab === 'shadowing'  && <ShadowingPlayer text={activeText} />}
            {a2Tab === 'vocabulary' && <VocabularyPanel text={activeText} />}
            {a2Tab === 'opinion'    && <OpinionWriter />}
            {a2Tab === 'games'      && <GamesPanel text={activeText} />}
          </>
        )}

        {/* V1 Content */}
        {mainTab === 'v1' && (
          <>
            <div className="flex bg-white rounded-2xl shadow-sm border border-gray-100 p-1 gap-1">
              {([
                { id: 'story',    label: '📖 스토리 쓰기' },
                { id: 'vocabulary', label: '📚 단어장' },
                { id: 'games',    label: '🎮 게임' },
              ] as { id: V1Tab; label: string }[]).map(t => (
                <button key={t.id}
                  onClick={() => { switchTab('v1', t.id); setV1Tab(t.id); }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    v1Tab === t.id ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
            {v1Tab === 'story'      && <StoryWriter />}
            {v1Tab === 'vocabulary' && <VocabularyPanel text={activeText} />}
            {v1Tab === 'games'      && <GamesPanel text={activeText} />}
          </>
        )}

        {/* Progress */}
        {mainTab === 'progress' && <ProgressDashboard />}
      </div>
    </div>
  );
}
