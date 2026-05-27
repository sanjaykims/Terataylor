import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { VocabItem } from '../lib/types';

interface BaseProps {
  label: string;
  hint?: string;
}
interface TextProps extends BaseProps { mode: 'text'; onExtracted: (text: string) => void; }
interface VocabProps extends BaseProps { mode: 'vocab'; onExtracted: (items: VocabItem[]) => void; }
type Props = TextProps | VocabProps;

interface ImageEntry { file: File; url: string; }

// Resize + compress to JPEG (keeps Claude API payload small)
function compressImage(file: File, maxPx = 1400): Promise<{ data: string; type: string }> {
  return new Promise(resolve => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(blobUrl);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const [header, data] = dataUrl.split(',');
      const type = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg';
      resolve({ data, type });
    };
    img.src = blobUrl;
  });
}

export default function ImageUploadInput(props: Props) {
  const { mode, label, hint } = props;
  const [images, setImages]     = useState<ImageEntry[]>([]);
  const [status, setStatus]     = useState<'idle' | 'extracting' | 'review' | 'done'>('idle');
  const [rawText, setRawText]   = useState('');
  const [vocabRows, setVocabRows] = useState<VocabItem[]>([]);
  const [error, setError]       = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const entries: ImageEntry[] = Array.from(files).map(f => ({ file: f, url: URL.createObjectURL(f) }));
    setImages(prev => [...prev, ...entries]);
    if (status === 'done') setStatus('idle');
  };

  const removeImage = (i: number) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, j) => j !== i);
    });
  };

  const extract = async () => {
    if (!images.length) return;
    setStatus('extracting');
    setError('');
    try {
      const compressed = await Promise.all(images.map(img => compressImage(img.file)));
      const { data, error: fnErr } = await supabase.functions.invoke('ocr-extract', {
        body: { images: compressed, mode },
      });
      if (fnErr) throw new Error(fnErr.message);
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

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        {status === 'done' && (
          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">✓ 완료</span>
        )}
      </div>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}

      {/* Drop zone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/50 transition-all select-none"
      >
        <div className="text-3xl mb-1">📷</div>
        <div className="text-sm text-gray-500 font-medium">클릭하거나 사진을 드래그</div>
        <div className="text-xs text-gray-400 mt-0.5">여러 장 선택 가능</div>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => addFiles(e.target.files)} />
      </div>

      {/* Thumbnails */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative group">
              <img src={img.url} alt="" className="w-20 h-20 object-cover rounded-xl border-2 border-gray-200" />
              <button onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity font-bold">
                ×
              </button>
            </div>
          ))}
          <button onClick={() => fileRef.current?.click()}
            className="w-20 h-20 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center text-gray-400 hover:border-indigo-300 hover:text-indigo-400 transition-all text-2xl">
            +
          </button>
        </div>
      )}

      {/* Extract button */}
      {images.length > 0 && status !== 'done' && (
        <button onClick={extract} disabled={status === 'extracting'}
          className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 disabled:opacity-60 transition-all flex items-center justify-center gap-2">
          {status === 'extracting'
            ? <><span className="inline-block animate-spin">⟳</span> AI가 분석 중...</>
            : mode === 'text' ? '📝 텍스트 추출하기' : '📚 단어 추출하기'}
        </button>
      )}

      {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {/* Review: text */}
      {status === 'review' && mode === 'text' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-semibold">추출된 텍스트 확인 및 수정:</p>
          <textarea value={rawText} onChange={e => setRawText(e.target.value)}
            className="w-full h-44 border-2 border-indigo-200 bg-indigo-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none leading-relaxed" />
          <button onClick={confirm}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-all">
            ✓ 이 텍스트로 사용하기
          </button>
        </div>
      )}

      {/* Review: vocab */}
      {status === 'review' && mode === 'vocab' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-semibold">추출된 단어 {vocabRows.length}개 확인 및 수정:</p>
          <div className="max-h-52 overflow-y-auto space-y-1.5 border-2 border-indigo-200 bg-indigo-50 rounded-xl p-2">
            {vocabRows.map((item, i) => (
              <div key={i} className="flex gap-1.5 items-center">
                <input value={item.word}
                  onChange={e => setVocabRows(prev => prev.map((v, j) => j === i ? { ...v, word: e.target.value } : v))}
                  className="w-28 shrink-0 px-2 py-1 rounded-lg border border-gray-200 text-sm font-semibold bg-white"
                  placeholder="단어" />
                <input value={item.definition}
                  onChange={e => setVocabRows(prev => prev.map((v, j) => j === i ? { ...v, definition: e.target.value } : v))}
                  className="flex-1 px-2 py-1 rounded-lg border border-gray-200 text-sm bg-white"
                  placeholder="뜻" />
                <button onClick={() => setVocabRows(prev => prev.filter((_, j) => j !== i))}
                  className="text-gray-300 hover:text-red-400 transition-colors font-bold shrink-0">✕</button>
              </div>
            ))}
            <button
              onClick={() => setVocabRows(prev => [...prev, { word: '', definition: '' }])}
              className="w-full text-xs text-indigo-400 hover:text-indigo-600 py-1 transition-colors">
              + 단어 추가
            </button>
          </div>
          <button onClick={confirm}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-all">
            ✓ 이 단어 목록으로 사용하기 ({vocabRows.filter(v => v.word.trim()).length}개)
          </button>
        </div>
      )}

      {status === 'done' && (
        <button onClick={() => setStatus('review')} className="text-xs text-indigo-400 hover:text-indigo-600 hover:underline transition-colors">
          다시 편집하기
        </button>
      )}
    </div>
  );
}
