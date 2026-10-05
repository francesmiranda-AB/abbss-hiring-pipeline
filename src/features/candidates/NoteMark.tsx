import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { StickyNote } from 'lucide-react';
import type { Candidate } from '@/domain/types';
import { useUpdateCandidate } from '@/api/queries';
import { Button, cx } from '@/ui/kit';

const PREVIEW_CHARS = 120;
const POPOVER_WIDTH = 352;

export const notePreview = (note: string) => (note.length > PREVIEW_CHARS ? `${note.slice(0, PREVIEW_CHARS).trimEnd()}…` : note);

// A candidate with a note shows this small mark on cards and the board (no popover:
// the whole card opens the record, where the note is on the Overview tab).
export function NoteGlyph({ note, className }: { note?: string; className?: string }) {
  if (!note) return null;
  return <span className={cx('app-note-glyph', className)} role="img" aria-label="Has a note" title={notePreview(note)}><StickyNote size={14} aria-hidden /></span>;
}

// The notes column of the table: a filled mark when there is a note, a faint one
// when there is none. Click opens the note in a small popover where it can be
// read or edited; the text saves when you leave the box, and stays if the save fails.
export function NoteMark({ a }: { a: Candidate }) {
  const update = useUpdateCandidate();
  const saved = a.resumeNotes || '';
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [place, setPlace] = useState<CSSProperties>({});
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  const commit = async () => {
    if (!editing) return true;
    if (draft === saved) { setEditing(false); return true; }
    const ok = await update(a.id, { resumeNotes: draft });
    if (ok) setEditing(false);
    return ok;
  };
  const close = async () => {
    if (!(await commit())) return;
    setOpen(false);
    trigger.current?.focus();
  };
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; });

  const show = () => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(Math.max(8, r.right - POPOVER_WIDTH), window.innerWidth - POPOVER_WIDTH - 8);
    setPlace(r.bottom + 280 > window.innerHeight ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: r.bottom + 6 });
    setEditing(false);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !trigger.current?.contains(t)) void closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault(); e.stopPropagation();
      void closeRef.current();
    };
    const onMove = () => void closeRef.current();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  useEffect(() => { if (open && !editing) pop.current?.querySelector<HTMLElement>('.app-note-pop__foot button')?.focus(); }, [open, editing]);

  const label = saved ? `Notes for ${a.name}: ${notePreview(saved)}` : `Add a note for ${a.name}`;
  return (
    <>
      <button ref={trigger} type="button" className={cx('app-note-mark', saved && 'has-note')} aria-label={label} title={saved ? notePreview(saved) : 'Add a note'}
        aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? void close() : show())}>
        <StickyNote size={16} aria-hidden />
      </button>
      {open && createPortal(
        <div ref={pop} className="app-note-pop" role="dialog" aria-label={`Notes for ${a.name}`} style={place}>
          <div className="app-note-pop__head"><span className="app-note-pop__title">Notes</span><span className="app-meta app-truncate">{a.name}</span></div>
          {editing ? (
            <textarea className="ab-textarea app-note-pop__edit" aria-label={`Notes for ${a.name}`} placeholder="Relevant experience and skills" value={draft} autoFocus
              onChange={(e) => setDraft(e.target.value)} onBlur={() => { void commit(); }} />
          ) : saved ? <p className="app-note-pop__text">{saved}</p> : <p className="app-note-pop__text ab-subtle">No note yet.</p>}
          <div className="app-note-pop__foot">
            {editing
              ? <Button size="sm" variant="tonal" onMouseDown={(e) => e.preventDefault()} onClick={() => { void commit(); }}>Done</Button>
              : <Button size="sm" variant="tonal" onClick={() => { setDraft(saved); setEditing(true); }}>{saved ? 'Edit' : 'Add a note'}</Button>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
