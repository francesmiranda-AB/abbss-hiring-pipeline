import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, X, type LucideIcon } from 'lucide-react';
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
    <header className="ab-page-header">
      <div className="grid gap-1">
        <h1 className="ab-title">{title}</h1>
        {lead && <p className="ab-muted m-0 text-sm">{lead}</p>}
      </div>
      {actions && <div className="ab-cluster">{actions}</div>}
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

export function Kpis({ items }: { items: Array<{ value: ReactNode; label: string; onClick?: () => void }> }) {
  return (
    <div className="ab-kpis">
      {items.map((k) => {
        const inner = (<><span className="ab-kpi__value">{k.value}</span><span className="ab-kpi__label">{k.label}</span></>);
        return k.onClick
          ? <button key={k.label} type="button" className="ab-kpi app-kpi-button" onClick={k.onClick}>{inner}</button>
          : <div key={k.label} className="ab-kpi">{inner}</div>;
      })}
    </div>
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
