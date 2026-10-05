import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, ChevronRight, Upload, X, type LucideIcon } from 'lucide-react';
import type { BadgeTone } from '@/domain/stages';

// Thin React wrappers over the AB Design System classes (components.css).

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

type BtnVariant = 'primary' | 'secondary' | 'tonal' | 'outline' | 'ghost' | 'danger' | 'link';
export function Button({ variant = 'tonal', size, busy, icon: Icon, children, className, type = 'button', ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'lg'; busy?: boolean; icon?: LucideIcon }) {
  return (
    <button type={type} className={cx('ab-btn', variant !== 'primary' && `ab-btn--${variant}`, size && `ab-btn--${size}`, !children && 'ab-btn--icon', className)}
      aria-busy={busy || undefined} {...rest}>
      {Icon && <Icon size={16} strokeWidth={2} aria-hidden />}
      {children}
    </button>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`ab-badge ab-badge--${tone}`}>{children}</span>;
}

export function PageHeader({ title, lead, actions }: { title: string; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="ab-page-header app-page-header">
      <h1 className="ab-title">{title}</h1>
      {lead && <p className="app-page-lead">{lead}</p>}
      {actions && <div className="ab-cluster app-page-actions">{actions}</div>}
    </header>
  );
}

// A gray block with a header band: the main way screens group things. Items
// inside (rows, tables, fields) sit on white, so the nesting reads at a glance.
export function Section({ title, count, countTone = 'neutral', lead, actions, children, className, label }: {
  title: ReactNode; count?: number; countTone?: BadgeTone; lead?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; label?: string;
}) {
  return (
    <section className={cx('app-block', className)} aria-label={label}>
      <div className="app-block__head">
        <h2 className="app-block__title">{title}{count !== undefined && <Badge tone={count ? countTone : 'neutral'}>{count}</Badge>}</h2>
        {actions && <div className="ab-cluster">{actions}</div>}
      </div>
      {lead && <p className="app-block__lead">{lead}</p>}
      {children}
    </section>
  );
}

// tone colors the number (and the tile's top rule) only when it is above 0:
// a zero "Overdue" is good news and stays plain.
export type KpiTone = 'danger' | 'warning' | 'success' | 'primary';
export function pillTone(tone: KpiTone | undefined, value: ReactNode) {
  return tone && typeof value === 'number' && value > 0 ? `app-pill--${tone}` : '';
}
export function kpiToneClass(tone: KpiTone | undefined, value: ReactNode) {
  return tone && typeof value === 'number' && value > 0 ? `app-kpi--${tone}` : '';
}
// compact: a one-line strip of count pills (Today); the default big tiles are for
// the feature block and other places that have room.
export function Kpis({ items, compact }: { items: Array<{ value: ReactNode; label: string; onClick?: () => void; tone?: KpiTone }>; compact?: boolean }) {
  if (compact) {
    return (
      <div className="app-pills">
        {items.map((k) => {
          const inner = (<><span className="app-pill__n">{k.value}</span><span>{k.label}</span></>);
          const cls = cx('app-pill', pillTone(k.tone, k.value));
          return k.onClick
            ? <button key={k.label} type="button" className={cls} onClick={k.onClick}>{inner}</button>
            : <span key={k.label} className={cls}>{inner}</span>;
        })}
      </div>
    );
  }
  return (
    <div className="ab-kpis app-kpis">
      {items.map((k) => {
        const inner = (<><span className="ab-kpi__value">{k.value}</span><span className="ab-kpi__label">{k.label}</span>{k.onClick && <ChevronRight className="app-kpi__go" size={16} aria-hidden />}</>);
        const cls = cx('ab-kpi app-kpi', kpiToneClass(k.tone, k.value));
        return k.onClick
          ? <button key={k.label} type="button" className={cx(cls, 'app-kpi-button')} onClick={k.onClick}>{inner}</button>
          : <div key={k.label} className={cls}>{inner}</div>;
      })}
    </div>
  );
}

// A file chooser styled like a button (the raw browser control is out of place).
export function FilePicker({ id, accept, onFile, children, fileName, busy }: {
  id?: string; accept?: string; onFile: (file: File | null) => void; children: ReactNode; fileName?: string; busy?: boolean;
}) {
  return (
    <span className="app-filepick">
      <label className="ab-btn ab-btn--tonal ab-btn--sm" aria-busy={busy || undefined}>
        <Upload size={14} aria-hidden /> {children}
        <input id={id} type="file" accept={accept} className="ab-visually-hidden"
          onChange={(e) => { const f = e.target.files?.[0] || null; e.target.value = ''; onFile(f); }} />
      </label>
      {fileName && <span className="app-meta">{fileName}</span>}
    </span>
  );
}

export function Empty({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ab-empty">
      <span className="ab-empty__icon"><Icon size={20} aria-hidden /></span>
      <p className="ab-empty__title">{title}</p>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => <span key={i} className="ab-skeleton" style={{ height: '2.5rem' }} />)}
    </div>
  );
}

export function ErrorAlert({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ab-alert ab-alert--danger" role="alert">
      <span className="ab-alert__icon" aria-hidden><AlertTriangle size={18} /></span>
      <p className="ab-alert__title">{title}</p>
      {children && <div>{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Field({ label, required, hint, error, children, htmlFor }: { label: string; required?: boolean; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="ab-field">
      <label className={cx('ab-label', required && 'ab-label--required')} htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="ab-error">{error}</span> : hint ? <span className="ab-hint">{hint}</span> : null}
    </div>
  );
}

// Modals can stack (a dialog opened over the record panel). One Esc must close
// only the top one, so while more than one is open we take over Esc and close
// the most recently opened.
const modalStack: HTMLDialogElement[] = [];
export function trackModal(d: HTMLDialogElement): () => void {
  modalStack.push(d);
  return () => { const i = modalStack.indexOf(d); if (i >= 0) modalStack.splice(i, 1); };
}
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || modalStack.length < 2) return;
    e.preventDefault();
    e.stopPropagation();
    modalStack[modalStack.length - 1].close();
  }, true);
}

// Native <dialog>: focus trap, Esc and the backdrop come free.
export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    let untrack: (() => void) | undefined;
    if (open && !d.open) {
      d.showModal();
      untrack = trackModal(d);
      // The browser focuses the first control, which is the close button; start in the form instead.
      d.querySelector<HTMLElement>('.ab-modal__body :is(input, select, textarea, [href]):not([disabled])')?.focus();
    }
    if (!open && d.open) d.close();
    return () => untrack?.();
  }, [open]);
  // A dialog that is removed while open still hands focus back to where it came from.
  useEffect(() => () => { const d = ref.current; if (d?.open) d.close(); }, []);
  return (
    <dialog ref={ref} className={cx('ab-modal', wide && 'app-modal-wide')} aria-labelledby={titleId} onClose={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <>
          <div className="ab-modal__header">
            <h2 className="ab-modal__title" id={titleId}>{title}</h2>
            <Button variant="ghost" size="sm" icon={X} aria-label="Close" onClick={onClose} />
          </div>
          <div className="ab-modal__body">{children}</div>
          {footer && <div className="ab-modal__footer">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

// One confirmation for anything that is hard to take back or reaches other people.
export function ConfirmDialog({ open, title, children, confirmLabel, danger, busy, onConfirm, onClose }: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant={danger ? 'danger' : 'primary'} busy={busy} onClick={onConfirm}>{confirmLabel}</Button>
    </>}>
      <div className="grid gap-2">{children}</div>
    </Dialog>
  );
}

// Tabs with the keyboard behaviour people expect: arrow keys, Home and End move
// between tabs; only the selected tab is in the tab order. `panelId` is the id of
// the element the tabs control (give it role="tabpanel").
export function Tabs<T extends string>({ tabs, value, onChange, pills, label, panelId }: {
  tabs: Array<{ key: T; label: string; count?: number; icon?: LucideIcon }>; value: T; onChange: (k: T) => void; pills?: boolean; label: string; panelId?: string;
}) {
  const base = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (to: number) => {
    const n = (to + tabs.length) % tabs.length;
    onChange(tabs[n].key);
    refs.current[n]?.focus();
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); move(i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); move(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); move(0); }
    else if (e.key === 'End') { e.preventDefault(); move(tabs.length - 1); }
  };
  return (
    <div className={cx('ab-tabs', pills && 'ab-tabs--pills')} role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button key={t.key} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" id={`${base}-${t.key}`} className="ab-tab"
          aria-selected={value === t.key} aria-controls={panelId} tabIndex={value === t.key ? 0 : -1}
          onClick={() => onChange(t.key)} onKeyDown={(e) => onKey(e, i)}>
          {t.icon && <t.icon size={14} aria-hidden />}{t.label}{t.count !== undefined && <span className="app-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// Arrow keys and Esc for a popup menu, focus on the first item when it opens and
// back on the trigger when it closes. Esc closes the menu only, never the dialog behind it.
export function useMenu(open: boolean, setOpen: (o: boolean) => void) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const root = box.current;
    const items = () => Array.from(root?.querySelectorAll<HTMLElement>('[role="menuitem"]') || []);
    items()[0]?.focus();
    const onDown = (e: MouseEvent) => { if (!root?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); root?.querySelector<HTMLElement>('[aria-haspopup]')?.focus(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const list = items();
      if (!list.length) return;
      e.preventDefault();
      const at = list.indexOf(document.activeElement as HTMLElement);
      list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length].focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [open, setOpen]);
  return box;
}

export const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
export const fmtDateTime = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
