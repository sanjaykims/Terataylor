import { useState } from 'react';
import Icon from './Icon';

// One editor for every block of lesson text — reading passage, listening
// script, and either translation. All of them are the same thing underneath: a
// stored string that arrived by OCR or machine translation and therefore needs
// hand-correcting, or that has to be typed in when no photo exists.
//
// The textarea is monospace on purpose. The reader reflows a passage into
// prose, which hides exactly what you come here to fix — line breaks, a heading
// glued to the first sentence, stray textbook paragraph numbers. Monospace with
// preserved newlines shows the text as it is actually stored.
//
// Draft/saving/error state lives here rather than in each caller, so adding the
// editor to another section is one element, not another four useStates.
interface PassageEditorProps {
  title: string;
  hint: string;
  /** Current stored text; '' when typing a section in for the first time. */
  initialText: string;
  onSave: (text: string) => Promise<void>;
  onCancel: () => void;
  /** Label for the confirm button — "저장" when editing, "추가" when adding. */
  saveLabel?: string;
}

export default function PassageEditor({
  title, hint, initialText, onSave, onCancel, saveLabel = '저장',
}: PassageEditorProps) {
  const [draft, setDraft] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;

  const submit = async () => {
    const text = draft.trim();
    // Saving empty deletes the row and drops the lesson back to its empty
    // state, which is never what "save" was meant to do. Deleting a section is
    // a separate, deliberate action.
    if (!text) { setError('내용이 비어 있어요. 텍스트를 입력하거나 취소하세요.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요.');
      setSaving(false); // stay open so the typed text isn't lost
    }
  };

  return (
    <div className="surface p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-gray-700 inline-flex items-center gap-2">
          <Icon name="document" className="h-4 w-4 text-violet-500" /> {title}
        </span>
        <span className="text-xs text-muted">{words ? `${words}단어` : '비어 있음'}</span>
      </div>
      <p className="text-xs text-muted">{hint}</p>
      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        spellCheck={false}
        autoFocus
        className="w-full rounded-xl p-3 text-sm leading-relaxed font-mono"
        style={{
          minHeight: '16rem',
          background: 'var(--paper)',
          border: '1px solid var(--rule-2)',
          color: 'var(--ink)',
        }}
      />
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={saving}
          className="btn-primary flex-1 text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
          <Icon name="check" className="h-4 w-4" /> {saving ? '저장 중...' : saveLabel}
        </button>
        <button onClick={onCancel} disabled={saving}
          className="btn-soft px-4 text-sm disabled:opacity-60 disabled:cursor-not-allowed">
          취소
        </button>
      </div>
    </div>
  );
}
