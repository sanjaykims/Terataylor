import { useState, useEffect, useRef } from 'react';
import ShadowingPlayer from './components/ShadowingPlayer';
import VocabularyPanel from './components/VocabularyPanel';
import StoryWriter from './components/StoryWriter';
import OpinionWriter from './components/OpinionWriter';
import GamesPanel from './components/GamesPanel';
import ProgressDashboard from './components/ProgressDashboard';
import ImageUploadInput from './components/ImageUploadInput';
import { trackSession } from './lib/tracker';
import type { VocabItem } from './lib/types';

type MainTab = 'a2' | 'v1' | 'progress';
type A2Tab   = 'shadowing' | 'vocabulary' | 'opinion' | 'games';
type V1Tab   = 'story' | 'vocabulary' | 'games';

export default function App() {
  const [mainTab, setMainTab] = useState<MainTab>('a2');
  const [a2Tab,   setA2Tab]   = useState<A2Tab>('shadowing');
  const [v1Tab,   setV1Tab]   = useState<V1Tab>('story');

  // A2 content state
  const [a2Text,     setA2Text]     = useState('');
  const [a2Vocab,    setA2Vocab]    = useState<VocabItem[] | null>(null);
  const [a2AudioUrl, setA2AudioUrl] = useState<string | null>(null);
  const [showA2Input, setShowA2Input] = useState(true);

  // V1 content state
  const [v1Text,  setV1Text]  = useState('');
  const [v1Vocab, setV1Vocab] = useState<VocabItem[] | null>(null);
  const [showV1Input, setShowV1Input] = useState(true);

  // Audio upload handler
  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (a2AudioUrl) URL.revokeObjectURL(a2AudioUrl);
    setA2AudioUrl(URL.createObjectURL(file));
  };

  // Clean up audio URL on unmount
  useEffect(() => {
    return () => { if (a2AudioUrl) URL.revokeObjectURL(a2AudioUrl); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Session tracking
  const sessionStart   = useRef(Date.now());
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
  useEffect(() => {
    const h = () => flushSession();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helpers
  const a2NeedsInput = a2Tab !== 'opinion';
  const v1NeedsInput = true;

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
          {([
            { id: 'a2',       label: 'A2 읽기/듣기', sub: '섀도잉 · 쓰기',  icon: '🎧', color: 'indigo' },
            { id: 'v1',       label: 'V1 소설',       sub: '이해 · 스토리', icon: '📖', color: 'purple' },
            { id: 'progress', label: '성장 기록',      sub: '단어 · 점수',   icon: '📊', color: 'emerald' },
          ] as { id: MainTab; label: string; sub: string; icon: string; color: string }[]).map(t => (
            <button key={t.id}
              onClick={() => { flushSession(); setMainTab(t.id); }}
              className={`py-4 rounded-2xl font-bold text-base transition-all flex flex-col items-center gap-1 ${
                mainTab === t.id
                  ? `bg-${t.color}-600 text-white shadow-lg shadow-${t.color}-200`
                  : 'bg-white text-gray-500 hover:bg-gray-50 shadow-sm'
              }`}>
              <span className="text-2xl">{t.icon}</span>
              <span className="text-sm">{t.label}</span>
              <span className={`text-xs font-normal ${mainTab === t.id ? `text-${t.color}-200` : 'text-gray-400'}`}>{t.sub}</span>
            </button>
          ))}
        </div>

        {/* ── A2 INPUT PANEL ─────────────────────────────────────────────────── */}
        {mainTab === 'a2' && a2NeedsInput && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button onClick={() => setShowA2Input(!showA2Input)}
              className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors">
              <span className="font-semibold text-gray-700 flex items-center gap-2">
                📸 교재 입력
                <span className="text-xs font-normal text-gray-400">지문 · 단어 · 오디오</span>
              </span>
              <span className="text-gray-400 text-sm">{showA2Input ? '▲ 접기' : '▼ 펼치기'}</span>
            </button>
            {showA2Input && (
              <div className="px-5 pb-5 space-y-5">
                {/* Text from image */}
                <ImageUploadInput
                  mode="text"
                  label="📄 지문 사진"
                  hint="교재 본문 페이지 사진 — 여러 장 업로드 가능"
                  onExtracted={setA2Text}
                />

                <hr className="border-gray-100" />

                {/* Vocab from image */}
                <ImageUploadInput
                  mode="vocab"
                  label="📚 단어 사진"
                  hint="책에서 지정한 단어 목록 페이지 사진"
                  onExtracted={setA2Vocab}
                />

                <hr className="border-gray-100" />

                {/* Audio upload */}
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    🎵 본문 오디오 (mp3)
                    {a2AudioUrl && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">✓ 완료</span>}
                  </div>
                  <p className="text-xs text-gray-400">교재 CD / 원어민 녹음 파일</p>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className="flex-1 border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all">
                      {a2AudioUrl ? '🔊 파일 업로드됨 — 클릭해서 교체' : '🎵 mp3 파일 클릭해서 선택'}
                    </div>
                    <input type="file" accept="audio/mp3,audio/mpeg,audio/*" className="hidden" onChange={handleAudioUpload} />
                  </label>
                  {a2AudioUrl && (
                    <audio src={a2AudioUrl} controls className="w-full mt-1" />
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── V1 INPUT PANEL ─────────────────────────────────────────────────── */}
        {mainTab === 'v1' && v1NeedsInput && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button onClick={() => setShowV1Input(!showV1Input)}
              className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors">
              <span className="font-semibold text-gray-700 flex items-center gap-2">
                📸 소설 입력
                <span className="text-xs font-normal text-gray-400">지문 · 단어</span>
              </span>
              <span className="text-gray-400 text-sm">{showV1Input ? '▲ 접기' : '▼ 펼치기'}</span>
            </button>
            {showV1Input && (
              <div className="px-5 pb-5 space-y-5">
                <ImageUploadInput
                  mode="text"
                  label="📄 소설 지문 사진"
                  hint="읽을 소설 페이지 사진 — 여러 장 업로드 가능"
                  onExtracted={setV1Text}
                />
                <hr className="border-gray-100" />
                <ImageUploadInput
                  mode="vocab"
                  label="📚 단어 사진"
                  hint="소설에서 지정한 단어 목록 사진"
                  onExtracted={setV1Vocab}
                />
              </div>
            )}
          </div>
        )}

        {/* ── A2 CONTENT ─────────────────────────────────────────────────────── */}
        {mainTab === 'a2' && (
          <>
            <div className="flex bg-white rounded-2xl shadow-sm border border-gray-100 p-1 gap-1">
              {([
                { id: 'shadowing',  label: '🎧 섀도잉' },
                { id: 'vocabulary', label: '📚 단어장' },
                { id: 'opinion',    label: '✍️ 의견 쓰기' },
                { id: 'games',      label: '🎮 게임' },
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
            {a2Tab === 'shadowing'  && <ShadowingPlayer text={a2Text} audioUrl={a2AudioUrl} />}
            {a2Tab === 'vocabulary' && <VocabularyPanel text={a2Text} vocab={a2Vocab} />}
            {a2Tab === 'opinion'    && <OpinionWriter />}
            {a2Tab === 'games'      && <GamesPanel text={a2Text} vocab={a2Vocab} />}
          </>
        )}

        {/* ── V1 CONTENT ─────────────────────────────────────────────────────── */}
        {mainTab === 'v1' && (
          <>
            <div className="flex bg-white rounded-2xl shadow-sm border border-gray-100 p-1 gap-1">
              {([
                { id: 'story',      label: '📖 스토리 쓰기' },
                { id: 'vocabulary', label: '📚 단어장' },
                { id: 'games',      label: '🎮 게임' },
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
            {v1Tab === 'vocabulary' && <VocabularyPanel text={v1Text} vocab={v1Vocab} />}
            {v1Tab === 'games'      && <GamesPanel text={v1Text} vocab={v1Vocab} />}
          </>
        )}

        {/* ── PROGRESS ───────────────────────────────────────────────────────── */}
        {mainTab === 'progress' && <ProgressDashboard />}
      </div>
    </div>
  );
}
