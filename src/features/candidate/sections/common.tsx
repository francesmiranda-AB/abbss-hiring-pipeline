import { useEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Field } from '@/ui/kit';

type SaveFn = (v: string) => void | Promise<boolean | void>;

// A draft exists only while someone is typing. It is saved when the box loses
// focus or the panel closes, and if the save fails the text stays put with a
// Retry (never silently reverted).
function useDraft(saved: string, onSave: SaveFn, trim: boolean) {
  const [draft, setDraft] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const live = useRef({ draft: null as string | null, saved, onSave, busy: false });
  useEffect(() => { live.current.draft = draft; live.current.saved = saved; live.current.onSave = onSave; });
  const commit = async () => {
    const cur = live.current;
    if (cur.draft === null || cur.busy) return;
    const v = trim ? cur.draft.trim() : cur.draft;
    if (v === cur.saved) { setDraft(null); setFailed(false); return; }
    cur.busy = true;
    const ok = await cur.onSave(v);
    cur.busy = false;
    if (ok === false) { setFailed(true); return; }
    setFailed(false);
    setDraft(null);
  };
  // Closing the panel or switching tabs removes the box without a blur: save what was typed.
  useEffect(() => () => {
    const cur = live.current;
    if (cur.draft === null || cur.busy) return;
    const v = trim ? cur.draft.trim() : cur.draft;
    if (v !== cur.saved) void cur.onSave(v);
  }, [trim]);
  return { value: draft ?? saved, onChange: (v: string) => setDraft(v), commit, failed };
}

// Text inputs that save when you leave them (never on every keystroke).
export function SavingInput({ label, value, onSave, hint, id, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  label: string; value: string | number | undefined; onSave: SaveFn; hint?: string; id: string;
}) {
  const d = useDraft(String(value ?? ''), onSave, true);
  return (
    <Field label={label} htmlFor={id} hint={hint} error={d.failed ? 'Not saved. Your text is still here.' : undefined}>
      <input id={id} className="ab-input" value={d.value} onChange={(e) => d.onChange(e.target.value)} onBlur={d.commit} aria-invalid={d.failed || undefined} {...rest} />
      {d.failed && <button type="button" className="app-link-button text-sm justify-self-start" onClick={d.commit}>Retry saving</button>}
    </Field>
  );
}

export function SavingTextarea({ label, value, onSave, id, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  label: string; value: string | undefined; onSave: SaveFn; id: string;
}) {
  const d = useDraft(value ?? '', onSave, false);
  return (
    <Field label={label} htmlFor={id} error={d.failed ? 'Not saved. Your text is still here.' : undefined}>
      <textarea id={id} className="ab-textarea" value={d.value} onChange={(e) => d.onChange(e.target.value)} onBlur={d.commit} aria-invalid={d.failed || undefined} {...rest} />
      {d.failed && <button type="button" className="app-link-button text-sm justify-self-start" onClick={d.commit}>Retry saving</button>}
    </Field>
  );
}

export function PanelSection({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="app-panel-section">
      <div className="app-panel-section__head">
        <h3 className="ab-card__title">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
