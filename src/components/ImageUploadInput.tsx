import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { VocabItem } from '../lib/types';
import Icon from './Icon';

interface BaseProps {
  label: string;
  hint?: string;
  savedSummary?: string;   // non-empty = already saved; show saved state
  onClear?: () => void;    // called when user wants to clear saved data
}
interface TextProps  extends BaseProps { mode: 'text';  onExtracted: (text: string)      => void; }
interface VocabProps extends BaseProps { mode: 'vocab'; onExtracted: (items: VocabItem[]) => void; }
type Props = TextProps | VocabProps;

// rot is the quarter-turns the user applied, in degrees clockwise (0/90/180/270).
// It is applied when the image is flattened for OCR, not to the original file.
// auto: where automatic orientation detection stands for this photo.
//   'pending' = asking the server, 'turned' = it turned the photo, 'upright' =
//   it was already upright, 'failed' = detection didn't work (photo left as is).
// manual flips to true the moment the user turns it themselves, after which
// automatic detection never touches that photo again.
interface ImageEntry {
  file: File; url: string; rot: number;
  auto: 'pending' | 'turned' | 'upright' | 'failed'; manual: boolean;
}

// Resize + compress to JPEG (keeps Claude API payload small), turning the image
// by `rot` degrees clockwise on the way. Photos from a phone often arrive on
// their side; OCR reads a sideways page far worse than an upright one, so the
// rotation has to be baked into the pixels that get sent, not just the preview.
function compressImage(file: File, rot = 0, maxPx = 1400): Promise<{ data: string; type: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width  * scale);
      const h = Math.round(img.height * scale);
      // A quarter-turn swaps the canvas's width and height.
      const sideways = rot % 180 !== 0;
      const canvas = document.createElement('canvas');
      canvas.width  = sideways ? h : w;
      canvas.height = sideways ? w : h;
      const ctx = canvas.getContext('2d')!;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      URL.revokeObjectURL(blobUrl);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const [header, data] = dataUrl.split(',');
      const type = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg';
      resolve({ data, type });
    };
    // Without this, a file the browser can't decode (some phone formats such as
    // HEIC) left the promise pending forever and the button stuck on "분석 중".
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error('이 사진을 열 수 없어요. JPG 또는 PNG 사진으로 다시 시도해 주세요.'));
    };
    img.src = blobUrl;
  });
}

export default function ImageUploadInput(props: Props) {
  const { mode, label, hint, savedSummary, onClear } = props;
  const [images, setImages]     = useState<ImageEntry[]>([]);
  const [status, setStatus]     = useState<'idle' | 'extracting' | 'review' | 'done'>('idle');
  const [rawText, setRawText]   = useState('');
  const [vocabRows, setVocabRows] = useState<VocabItem[]>([]);
  const [error, setError]       = useState('');
  // Non-fatal note shown with the review, e.g. one photo out of several unreadable.
  const [notice, setNotice]     = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  // In-flight orientation checks by photo url, so extract() can wait for them.
  const detecting = useRef(new Map<string, Promise<void>>());

  // Ask the server which way up the page is, using small copies of the photo
  // (a few hundred px is plenty to tell, and keeps this check quick and cheap).
  // The answer is degrees clockwise to turn the photo; a photo the user has
  // already turned by hand is left alone.
  const detectOrientation = (entry: ImageEntry) => {
    const run = async () => {
      let rotation = 0;
      let ok = true;
      try {
        // Four small copies, turned 0/90/180/270 clockwise; the server picks the
        // one whose text reads upright and answers with that turn.
        const candidates = await Promise.all([0, 90, 180, 270].map(r => compressImage(entry.file, r, 512)));
        const { data, error: fnErr } = await supabase.functions.invoke('ocr-extract', {
          body: { images: candidates, mode: 'detect_orientation' },
        });
        if (fnErr) throw new Error(fnErr.message);
        const n = Number(data?.rotation);
        rotation = [0, 90, 180, 270].includes(n) ? n : 0;
      } catch { ok = false; }
      setImages(prev => prev.map(e => {
        if (e.url !== entry.url) return e;
        if (e.manual) return e;                       // the user got there first
        return { ...e, rot: rotation, auto: !ok ? 'failed' : rotation === 0 ? 'upright' : 'turned' };
      }));
    };
    const p = run().finally(() => detecting.current.delete(entry.url));
    detecting.current.set(entry.url, p);
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const entries: ImageEntry[] = Array.from(files).map(f => ({
      file: f, url: URL.createObjectURL(f), rot: 0, auto: 'pending' as const, manual: false,
    }));
    setImages(prev => [...prev, ...entries]);
    entries.forEach(detectOrientation);
    if (status === 'done') setStatus('idle');
  };

  const removeImage = (i: number) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, j) => j !== i);
    });
  };

  const rotateImage = (i: number, delta: 90 | -90) => {
    setImages(prev => prev.map((img, j) =>
      j === i ? { ...img, rot: (img.rot + delta + 360) % 360, manual: true } : img));
  };

  const extract = async () => {
    if (!images.length) return;
    setStatus('extracting');
    setError('');
    setNotice('');
    try {
      // Let any orientation check still running finish, then read the photos'
      // CURRENT rotation from state (the closure's copy predates the result).
      await Promise.all([...detecting.current.values()]);
      const latest = await new Promise<ImageEntry[]>(resolve => setImages(prev => { resolve(prev); return prev; }));
      const compressed = await Promise.all(latest.map(img => compressImage(img.file, img.rot)));
      const { data, error: fnErr } = await supabase.functions.invoke('ocr-extract', {
        body: { images: compressed, mode },
      });
      if (fnErr) {
        // invoke() reduces every non-2xx reply to a generic "Edge Function
        // returned a non-2xx status code", hiding the server's own message
        // (which says WHY: unreadable photo, nothing found, ...). Read it from
        // the response body when there is one.
        let detail = '';
        try {
          const body = await (fnErr as { context?: Response }).context?.json();
          if (body && typeof body.error === 'string') detail = body.error;
        } catch { /* no readable body — fall back to the generic message */ }
        throw new Error(detail || fnErr.message);
      }
      setNotice(data?.skippedPhotos > 0 ? `사진 ${data.skippedPhotos}장은 읽지 못했어요. 나머지 사진의 단어만 가져왔어요.` : '');
      const result: string = data.result ?? '';

      if (mode === 'vocab') {
        const match = result.match(/\[[\s\S]*\]/);
        if (!match) throw new Error('단어 목록을 파싱할 수 없어요. 다시 시도해 주세요.');
        const items: VocabItem[] = JSON.parse(match[0]);
        setVocabRows(items);
      } else {
        setRawText(result);
      }
      setStatus('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : '추출 실패');
      setStatus('idle');
    }
  };

  const confirm = () => {
    if (mode === 'text') {
      (props as TextProps).onExtracted(rawText);
    } else {
      (props as VocabProps).onExtracted(vocabRows.filter(v => v.word.trim()));
    }
    setStatus('done');
  };

  // If parent already has saved data, show a compact saved banner
  if (savedSummary) {
    return (
      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
        <div>
          <span className="text-sm font-semibold text-gray-700 mr-2">{label}</span>
          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">
            ✓ {savedSummary}
          </span>
        </div>
        <button
          onClick={onClear}
          className="text-xs text-muted hover:text-red-500 transition-colors ml-3 shrink-0 inline-flex items-center gap-1"
          title="삭제 후 다시 업로드">
          <Icon name="trash" className="h-3.5 w-3.5" /> 삭제
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        {status === 'done' && (
          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">✓ 완료</span>
        )}
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}

      {/* Picker. Tapping the zone opens the phone's photo gallery (multiple
          selection); a drag-and-drop still works on a computer. A second,
          separate button opens the camera directly, since "choose from gallery"
          and "take one now" are different intents on a phone. */}
      <div
        role="button" tabIndex={0}
        aria-label={`${label} 사진 선택`}
        onClick={() => fileRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        className="border-2 border-dashed border-violet-200 rounded-xl p-5 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50/60 transition-[border-color,background-color] select-none"
      >
        <Icon name="image" className="h-8 w-8 mx-auto mb-1.5 text-violet-400" />
        <div className="text-sm text-gray-600 font-semibold">갤러리에서 사진 선택</div>
        <div className="text-xs text-muted mt-0.5">여러 장 선택할 수 있어요 · 컴퓨터에서는 끌어다 놓아도 돼요</div>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
      </div>
      <button type="button" onClick={() => cameraRef.current?.click()}
        className="btn-soft w-full min-h-[44px] text-sm inline-flex items-center justify-center gap-2">
        <Icon name="camera" className="h-4 w-4" /> 카메라로 바로 찍기
      </button>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />

      {/* Thumbnails — each can be turned before it is read. The controls are
          always visible: the old remove button only appeared on mouse hover,
          which a phone never produces. */}
      {images.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted">사진은 자동으로 바로 세워 줘요. 그래도 틀리면 직접 돌려 주세요.</p>
          <div className="grid grid-cols-2 gap-3">
            {images.map((img, i) => (
              <div key={i} className="surface-soft p-2 space-y-2">
                {/* Square stage so a turned image never overflows its card;
                    object-contain shows the whole page rather than a crop. */}
                <div className="aspect-square w-full overflow-hidden rounded-lg flex items-center justify-center"
                  style={{ background: 'var(--paper-3)' }}>
                  <img src={img.url} alt={`사진 ${i + 1}`}
                    className="w-full h-full object-contain transition-transform duration-200"
                    style={{ transform: `rotate(${img.rot}deg)` }} />
                </div>
                <p className="text-[11px] text-muted min-h-[1rem] text-center">
                  {img.manual ? '직접 돌렸어요'
                    : img.auto === 'pending' ? '방향 확인 중…'
                    : img.auto === 'turned' ? '자동으로 바로 세웠어요'
                    : img.auto === 'upright' ? '방향 확인 완료'
                    : '자동 인식 실패 · 직접 돌려 주세요'}
                </p>
                <div className="flex items-center justify-between gap-1">
                  <button type="button" onClick={() => rotateImage(i, -90)}
                    aria-label={`사진 ${i + 1} 왼쪽으로 돌리기`}
                    className="btn-soft min-w-[44px] min-h-[44px] inline-flex items-center justify-center">
                    <Icon name="rotate" className="h-5 w-5" style={{ transform: 'scaleX(-1)' }} />
                  </button>
                  <button type="button" onClick={() => rotateImage(i, 90)}
                    aria-label={`사진 ${i + 1} 오른쪽으로 돌리기`}
                    className="btn-soft min-w-[44px] min-h-[44px] inline-flex items-center justify-center">
                    <Icon name="rotate" className="h-5 w-5" />
                  </button>
                  <button type="button" onClick={() => removeImage(i)}
                    aria-label={`사진 ${i + 1} 삭제`}
                    className="btn-soft min-w-[44px] min-h-[44px] inline-flex items-center justify-center text-red-600">
                    <Icon name="trash" className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="btn-soft w-full min-h-[44px] text-sm">
            + 사진 더 추가
          </button>
        </div>
      )}

      {/* Extract button */}
      {images.length > 0 && status !== 'done' && (
        <button onClick={extract} disabled={status === 'extracting'}
          className="btn-primary w-full py-2.5 disabled:opacity-60 flex items-center justify-center gap-2">
          {status === 'extracting'
            ? <><span className="inline-block animate-spin">⟳</span> AI가 분석 중...</>
            : mode === 'text' ? '텍스트 추출하기' : '단어 추출하기'}
        </button>
      )}

      {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {notice && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{notice}</p>}

      {/* Review: text */}
      {status === 'review' && mode === 'text' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-semibold">추출된 텍스트 확인 및 수정:</p>
          <textarea value={rawText} onChange={e => setRawText(e.target.value)}
            className="field w-full h-44 resize-none leading-relaxed" />
          <button onClick={confirm}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700">
            ✓ 이 텍스트로 사용하기
          </button>
        </div>
      )}

      {/* Review: vocab */}
      {status === 'review' && mode === 'vocab' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-semibold">추출된 단어 {vocabRows.length}개 확인 및 수정:</p>
          <div className="max-h-60 overflow-y-auto space-y-1.5 surface-soft p-2">
            <div className="grid grid-cols-[6rem_1fr_1fr_1.5rem] gap-1 px-1 pb-1">
              <span className="text-[10px] font-bold text-muted uppercase tracking-wide">단어</span>
              <span className="text-[10px] font-bold text-violet-500 uppercase tracking-wide flex items-center gap-1"><span className="lang-tag">KO</span> 한국어</span>
              <span className="text-[10px] font-bold text-muted uppercase tracking-wide flex items-center gap-1"><span className="lang-tag">EN</span> English</span>
              <span />
            </div>
            {vocabRows.map((item, i) => (
              <div key={i} className="grid grid-cols-[6rem_1fr_1fr_1.5rem] gap-1 items-center">
                <input value={item.word}
                  onChange={e => setVocabRows(prev => prev.map((v, j) => j === i ? { ...v, word: e.target.value } : v))}
                  className="field text-sm font-semibold px-2 py-1"
                  placeholder="단어" />
                <input value={item.korean ?? ''}
                  onChange={e => setVocabRows(prev => prev.map((v, j) => j === i ? { ...v, korean: e.target.value } : v))}
                  className="field text-sm px-2 py-1"
                  placeholder="한국어 뜻" />
                <input value={item.definition}
                  onChange={e => setVocabRows(prev => prev.map((v, j) => j === i ? { ...v, definition: e.target.value } : v))}
                  className="field text-sm px-2 py-1"
                  placeholder="English def" />
                <button onClick={() => setVocabRows(prev => prev.filter((_, j) => j !== i))}
                  aria-label="단어 삭제"
                  className="text-gray-400 hover:text-red-500 transition-colors font-bold text-center">✕</button>
              </div>
            ))}
            <button
              onClick={() => setVocabRows(prev => [...prev, { word: '', definition: '', korean: '' }])}
              className="w-full text-xs text-violet-500 hover:text-violet-700 py-1 transition-colors">
              + 단어 추가
            </button>
          </div>
          <button onClick={confirm}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700">
            ✓ 이 단어 목록으로 사용하기 ({vocabRows.filter(v => v.word.trim()).length}개)
          </button>
        </div>
      )}

      {status === 'done' && (
        <button onClick={() => setStatus('review')} className="text-xs text-violet-500 hover:text-violet-700 hover:underline transition-colors">
          다시 편집하기
        </button>
      )}
    </div>
  );
}
