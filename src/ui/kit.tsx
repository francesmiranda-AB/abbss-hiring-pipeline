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

export function SectionHead({ title, lead, className }: { title: string; lead?: ReactNode; className?: string }) {
  return (
    <div className={cx('ab-section-head app-section-head', className)}>
      <h2 className="ab-card__title">{title}</h2>
      {lead && <p>{lead}</p>}
    </div>
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

// Native <dialog>: focus trap, Esc and the backdrop come free.
export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={cx('ab-modal', wide && 'app-modal-wide')} aria-labelledby={titleId} onClose={onClose}
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

export function Tabs<T extends string>({ tabs, value, onChange, pills, label }: { tabs: Array<{ key: T; label: string; count?: number }>; value: T; onChange: (k: T) => void; pills?: boolean; label: string }) {
  return (
    <div className={cx('ab-tabs', pills && 'ab-tabs--pills')} role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" className="ab-tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}>
          {t.label}{t.count !== undefined && <span className="app-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('') || '?';
  return <span className="ab-avatar" aria-hidden>{initials}</span>;
}

export const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
export const fmtDateTime = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
