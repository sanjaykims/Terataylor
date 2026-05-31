import { useState, useRef } from 'react';
import { parseSentences } from '../utils/textUtils';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis';

interface Props {
  text: string;
  audioUrl?: string | null;
  audioUploading?: boolean;
  onAudioUpload?: (file: File) => void;
  onClearAudio?: () => void;
}

const RATES = [0.5, 0.65, 0.8, 1.0];
const PAUSE_TIMES = [2, 3, 4, 5];

export default function ShadowingPlayer({ text, audioUrl, audioUploading, onAudioUpload, onClearAudio }: Props) {
  const sentences = parseSentences(text);
  const audioFileRef = useRef<HTMLInputElement>(null);
  const [rate, setRate] = useState(0.8);
  const [shadowMode, setShadowMode] = useState(false);
  const [shadowPause, setShadowPause] = useState(3);
  const sentenceRefs = useRef<(HTMLDivElement | null)[]>([]);

  const { state, currentIndex, play, pause, resume, stop, skipNext, skipPrev, replayCurrent } =
    useSpeechSynthesis({
      onSentenceEnd: (i) => {
        const next = sentenceRefs.current[i + 1];
        next?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
    });

  const isPlaying = state === 'speaking';
  const isWaiting = state === 'waiting';
  const isActive  = state !== 'idle';

  const handlePlayPause = () => {
    if (!isActive) play(sentences, Math.max(currentIndex, 0), rate, shadowMode, shadowPause);
    else if (isPlaying) pause();
    else if (state === 'paused') resume();
  };

  const handleSentenceClick = (i: number) => {
    play(sentences, i, rate, shadowMode, shadowPause);
  };

  // ── Audio upload section (always shown at top) ──────────────────────────
  const audioSection = onAudioUpload ? (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          🎵 섀도잉 오디오 (mp3)
        </span>
        {audioUrl ? (
          <button onClick={onClearAudio}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors">
            🗑 삭제
          </button>
        ) : (
          <button
            onClick={() => audioFileRef.current?.click()}
            disabled={audioUploading}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-all"
          >
            {audioUploading ? '⏳ 업로드 중…' : '+ mp3 업로드'}
          </button>
        )}
        <input ref={audioFileRef} type="file" accept="audio/mp3,audio/mpeg,audio/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onAudioUpload(f); e.target.value = ''; }} />
      </div>
      {audioUrl && <audio controls src={audioUrl} className="w-full mt-3 rounded-xl" />}
      {!audioUrl && !audioUploading && (
        <button
          onClick={() => audioFileRef.current?.click()}
          className="mt-3 w-full border-2 border-dashed border-indigo-200 rounded-xl py-3 text-xs text-indigo-400 hover:bg-indigo-50 transition-all"
        >
          클릭해서 mp3 파일 선택
        </button>
      )}
    </div>
  ) : null;

  if (sentences.length === 0) {
    return (
      <div className="space-y-4">
        {audioSection}
        <div className="text-center py-10 text-gray-400">
          위에 지문 사진을 업로드하면 섀도잉을 시작할 수 있어요!
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Audio upload */}
      {audioSection}

      {/* Controls */}
      {audioUrl ? (
        /* ── MP3 모드 — audio player already shown above, just show hint ── */
        <div className="bg-indigo-50 rounded-2xl px-4 py-3">
          <p className="text-xs text-indigo-600 font-medium">
            💡 오디오를 듣고 아래 문장을 따라 읽어 보세요 (섀도잉)
          </p>
        </div>
      ) : (
        /* ── TTS 모드 ── */
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <button onClick={handlePlayPause}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white transition-all shadow-md active:scale-95 ${
                isPlaying ? 'bg-orange-500 hover:bg-orange-600' : 'bg-indigo-600 hover:bg-indigo-700'
              }`}>
              {isPlaying ? <><span className="text-xl">⏸</span> 일시정지</>
                : state === 'paused' ? <><span className="text-xl">▶️</span> 계속</>
                : <><span className="text-xl">▶️</span> 재생</>}
            </button>

            <button onClick={stop} disabled={!isActive}
              className="flex items-center gap-2 px-4 py-3 rounded-xl font-semibold bg-gray-100 hover:bg-gray-200 disabled:opacity-40 transition-all">
              <span className="text-xl">⏹</span> 정지
            </button>

            <button onClick={() => skipPrev(sentences, rate, shadowMode, shadowPause)}
              disabled={!isActive || currentIndex <= 0}
              className="px-3 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 disabled:opacity-40 transition-all text-xl" title="이전 문장">⏮</button>

            <button onClick={() => replayCurrent(sentences, rate, shadowMode, shadowPause)}
              disabled={!isActive}
              className="px-3 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 disabled:opacity-40 transition-all text-xl" title="현재 문장 다시">🔄</button>

            <button onClick={() => skipNext(sentences, rate, shadowMode, shadowPause)}
              disabled={!isActive || currentIndex >= sentences.length - 1}
              className="px-3 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 disabled:opacity-40 transition-all text-xl" title="다음 문장">⏭</button>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-600">속도</span>
              <div className="flex gap-1">
                {RATES.map(r => (
                  <button key={r} onClick={() => setRate(r)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                      rate === r ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {r === 1.0 ? '1x' : `${r}x`}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <div onClick={() => setShadowMode(!shadowMode)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${shadowMode ? 'bg-purple-600' : 'bg-gray-300'}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${shadowMode ? 'translate-x-7' : 'translate-x-1'}`} />
                </div>
                <span className="text-sm font-semibold text-gray-700">🎙 섀도잉 모드</span>
              </label>
              {shadowMode && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">대기</span>
                  {PAUSE_TIMES.map(p => (
                    <button key={p} onClick={() => setShadowPause(p)}
                      className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                        shadowPause === p ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {p}초
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {isWaiting && shadowMode && (
            <div className="mt-3 flex items-center gap-2 text-purple-700 font-semibold animate-pulse">
              <span className="text-xl">🎙</span>
              <span>지금 따라 말해보세요! ({shadowPause}초)</span>
            </div>
          )}
        </div>
      )}

      {/* Sentence list — shown in both modes */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-2 max-h-[55vh] overflow-y-auto">
        <div className="text-xs text-gray-400 mb-3 font-medium">
          {audioUrl
            ? `총 ${sentences.length}문장 · 오디오를 들으며 따라 읽어보세요`
            : `문장을 클릭하면 그 문장부터 재생됩니다 · 총 ${sentences.length}문장`}
        </div>
        {sentences.map((sentence, i) => {
          const isCurrentSentence = !audioUrl && i === currentIndex;
          return (
            <div key={i}
              ref={el => { sentenceRefs.current[i] = el; }}
              onClick={() => !audioUrl && handleSentenceClick(i)}
              className={`group flex gap-3 p-3 rounded-xl transition-all ${
                audioUrl ? 'cursor-default' : 'cursor-pointer'
              } ${isCurrentSentence
                  ? 'bg-indigo-50 border-2 border-indigo-400'
                  : 'border-2 border-transparent hover:bg-gray-50 hover:border-gray-200'
              }`}>
              <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                isCurrentSentence ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'
              }`}>{i + 1}</span>
              <p className={`text-left leading-relaxed ${isCurrentSentence ? 'text-indigo-900 font-semibold text-base' : 'text-gray-700 text-base'}`}>
                {sentence}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
