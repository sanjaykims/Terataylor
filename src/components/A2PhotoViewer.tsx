import { useState, useEffect, useRef } from 'react';
import { csGet, csSet, csDel } from '../lib/cloudStorage';

const STORAGE_KEY = 'a2_photos';

async function compressImage(file: File, maxWidth = 1000, quality = 0.75): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = url;
  });
}

export default function A2PhotoViewer() {
  const [images,      setImages]      = useState<string[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [uploading,   setUploading]   = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    csGet(STORAGE_KEY)
      .then(raw => setImages(raw ? (JSON.parse(raw) as string[]) : []))
      .catch(() => setImages([]))
      .finally(() => setLoading(false));
  }, []);

  const save = async (imgs: string[]) => {
    if (imgs.length === 0) {
      await csDel(STORAGE_KEY).catch(() => {});
    } else {
      await csSet(STORAGE_KEY, JSON.stringify(imgs));
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const compressed = await Promise.all(files.map(f => compressImage(f)));
      const next = [...images, ...compressed];
      await save(next);
      setImages(next);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemove = async (idx: number) => {
    const next = images.filter((_, i) => i !== idx);
    await save(next);
    setImages(next);
  };

  const handleClear = async () => {
    setConfirmClear(false);
    await save([]);
    setImages([]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-xs text-gray-400 animate-pulse">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-indigo-700">
          📄 지문 사진 {images.length > 0 && `(${images.length}장)`}
        </span>
        <div className="flex items-center gap-2">
          {images.length > 0 && (
            confirmClear ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">전체 삭제할까요?</span>
                <button onClick={handleClear}
                  className="text-xs text-red-500 font-semibold hover:text-red-700">삭제</button>
                <button onClick={() => setConfirmClear(false)}
                  className="text-xs text-gray-400 hover:text-gray-600">취소</button>
              </div>
            ) : (
              <button onClick={() => setConfirmClear(true)}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                🗑 전체 삭제
              </button>
            )
          )}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-all"
          >
            {uploading ? '⏳ 저장 중…' : '+ 사진 추가'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={handleUpload} />
        </div>
      </div>

      {/* Empty state */}
      {images.length === 0 ? (
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-indigo-200 bg-indigo-50/60 rounded-2xl p-10 text-center cursor-pointer hover:opacity-80 transition-all"
        >
          <div className="text-4xl mb-3">📸</div>
          <div className="text-sm font-bold text-indigo-700">교재 사진 업로드</div>
          <div className="text-xs text-gray-400 mt-1.5">여러 장 동시에 선택 가능</div>
        </div>
      ) : (
        <div className="space-y-3">
          {images.map((src, i) => (
            <div key={i} className="relative bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
                <span className="bg-black/40 text-white text-[11px] px-2 py-0.5 rounded-full font-semibold">
                  {i + 1} / {images.length}
                </span>
                <button
                  onClick={() => handleRemove(i)}
                  className="bg-black/40 text-white text-[11px] px-2 py-0.5 rounded-full hover:bg-red-500/80 transition-colors font-semibold"
                >
                  ✕
                </button>
              </div>
              <img src={src} alt={`page ${i + 1}`} className="w-full h-auto block" />
            </div>
          ))}

          {/* Add more at bottom */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full py-3 border-2 border-dashed border-indigo-200 rounded-2xl text-xs font-semibold text-indigo-500 hover:bg-indigo-50 disabled:opacity-50 transition-all"
          >
            {uploading ? '⏳ 저장 중…' : '+ 사진 더 추가하기'}
          </button>
        </div>
      )}
    </div>
  );
}
