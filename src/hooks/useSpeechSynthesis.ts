import { useRef, useState, useCallback } from 'react';

export type SpeechState = 'idle' | 'speaking' | 'paused' | 'waiting';

interface UseSpeechSynthesisOptions {
  onSentenceEnd?: (index: number) => void;
  onDone?: () => void;
}

export function useSpeechSynthesis(options: UseSpeechSynthesisOptions = {}) {
  const [state, setState] = useState<SpeechState>('idle');
  const [currentIndex, setCurrentIndex] = useState(-1);
  const sentencesRef = useRef<string[]>([]);
  const indexRef = useRef(0);
  const stateRef = useRef<SpeechState>('idle');
  const rateRef = useRef(0.85);
  const shadowPauseRef = useRef(3); // seconds to wait in shadow mode
  const isShadowModeRef = useRef(false);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setState2 = (s: SpeechState) => {
    stateRef.current = s;
    setState(s);
  };

  const getEnglishVoice = (): SpeechSynthesisVoice | null => {
    const voices = window.speechSynthesis.getVoices();
    // Prefer a native US/UK English voice
    const preferred = voices.find(
      v => v.lang === 'en-US' && (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Alex'))
    ) ?? voices.find(v => v.lang === 'en-US') ?? voices.find(v => v.lang.startsWith('en')) ?? null;
    return preferred;
  };

  const speakSentence = useCallback((index: number, sentences: string[], rate: number, shadowMode: boolean, pause: number) => {
    if (cancelledRef.current) return;
    if (index >= sentences.length) {
      setState2('idle');
      setCurrentIndex(-1);
      options.onDone?.();
      return;
    }

    setCurrentIndex(index);
    indexRef.current = index;
    setState2('speaking');

    const utter = new SpeechSynthesisUtterance(sentences[index]);
    utter.rate = rate;
    utter.pitch = 1;
    utter.volume = 1;

    const voice = getEnglishVoice();
    if (voice) utter.voice = voice;

    utter.onend = () => {
      if (cancelledRef.current) return;
      options.onSentenceEnd?.(index);

      if (shadowMode) {
        setState2('waiting');
        timerRef.current = setTimeout(() => {
          if (cancelledRef.current) return;
          speakSentence(index + 1, sentences, rate, shadowMode, pause);
        }, pause * 1000);
      } else {
        speakSentence(index + 1, sentences, rate, shadowMode, pause);
      }
    };

    utter.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      console.error('Speech error:', e.error);
      setState2('idle');
    };

    window.speechSynthesis.speak(utter);
  }, [options]);

  const play = useCallback((sentences: string[], fromIndex = 0, rate = 0.85, shadowMode = false, shadowPause = 3) => {
    window.speechSynthesis.cancel();
    if (timerRef.current) clearTimeout(timerRef.current);
    cancelledRef.current = false;

    sentencesRef.current = sentences;
    rateRef.current = rate;
    isShadowModeRef.current = shadowMode;
    shadowPauseRef.current = shadowPause;

    // Wait for voices to load if needed
    const doSpeak = () => speakSentence(fromIndex, sentences, rate, shadowMode, shadowPause);

    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        doSpeak();
      };
    } else {
      doSpeak();
    }
  }, [speakSentence]);

  const pause = useCallback(() => {
    window.speechSynthesis.pause();
    setState2('paused');
  }, []);

  const resume = useCallback(() => {
    window.speechSynthesis.resume();
    setState2('speaking');
  }, []);

  const stop = useCallback(() => {
    cancelledRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    window.speechSynthesis.cancel();
    setState2('idle');
    setCurrentIndex(-1);
  }, []);

  const skipNext = useCallback((sentences: string[], rate: number, shadowMode: boolean, shadowPause: number) => {
    cancelledRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    window.speechSynthesis.cancel();
    cancelledRef.current = false;
    const next = Math.min(indexRef.current + 1, sentences.length - 1);
    speakSentence(next, sentences, rate, shadowMode, shadowPause);
  }, [speakSentence]);

  const skipPrev = useCallback((sentences: string[], rate: number, shadowMode: boolean, shadowPause: number) => {
    cancelledRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    window.speechSynthesis.cancel();
    cancelledRef.current = false;
    const prev = Math.max(indexRef.current - 1, 0);
    speakSentence(prev, sentences, rate, shadowMode, shadowPause);
  }, [speakSentence]);

  const replayCurrent = useCallback((sentences: string[], rate: number, shadowMode: boolean, shadowPause: number) => {
    cancelledRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    window.speechSynthesis.cancel();
    cancelledRef.current = false;
    speakSentence(indexRef.current >= 0 ? indexRef.current : 0, sentences, rate, shadowMode, shadowPause);
  }, [speakSentence]);

  return { state, currentIndex, play, pause, resume, stop, skipNext, skipPrev, replayCurrent };
}
