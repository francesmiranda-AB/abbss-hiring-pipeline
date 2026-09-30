import { useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Field } from '@/ui/kit';

// Text inputs that save when you leave them (never on every keystroke).
export function SavingInput({ label, value, onSave, hint, id, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  label: string; value: string | number | undefined; onSave: (v: string) => void; hint?: string; id: string;
}) {
  // A draft exists only while editing; otherwise the saved value shows.
  const [draft, setDraft] = useState<string | null>(null);
  const saved = String(value ?? '');
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <input id={id} className="ab-input" value={draft ?? saved} onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== null && draft !== saved) onSave(draft.trim()); setDraft(null); }} {...rest} />
    </Field>
  );
}

export function SavingTextarea({ label, value, onSave, id, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  label: string; value: string | undefined; onSave: (v: string) => void; id: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const saved = value ?? '';
  return (
    <Field label={label} htmlFor={id}>
      <textarea id={id} className="ab-textarea" value={draft ?? saved} onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== null && draft !== saved) onSave(draft); setDraft(null); }} {...rest} />
    </Field>
  );
}

export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
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
