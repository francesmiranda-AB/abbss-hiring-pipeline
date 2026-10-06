import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

// Toasts stack (newest last, at most three), so a result never hides an Undo.
// Polite live region, never steals focus. A toast with an action (Undo, Retry)
// stays 8 seconds; hovering or focusing any toast pauses its timer.
type Tone = 'success' | 'danger' | 'info' | 'warning';
export interface ToastInput { message: string; tone?: Tone; action?: { label: string; onClick: () => void } }
interface ToastApi { show: (t: ToastInput) => void; error: (message: string, retry?: () => void) => void }
type Item = ToastInput & { key: number };

const MAX = 3;
const ToastContext = createContext<ToastApi | null>(null);
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const seq = useRef(0);

  const dismiss = useCallback((key: number) => {
    clearTimeout(timers.current.get(key));
    timers.current.delete(key);
    setItems((cur) => cur.filter((t) => t.key !== key));
  }, []);
  const arm = useCallback((key: number, ms: number) => {
    clearTimeout(timers.current.get(key));
    timers.current.set(key, setTimeout(() => dismiss(key), ms));
  }, [dismiss]);

  const show = useCallback((t: ToastInput) => {
    const key = ++seq.current;
    setItems((cur) => {
      const next = [...cur, { ...t, key }];
      // Over the limit: drop the oldest that has no action first, else the oldest.
      while (next.length > MAX) {
        const i = next.findIndex((x) => !x.action);
        const [gone] = next.splice(i === -1 ? 0 : i, 1);
        clearTimeout(timers.current.get(gone.key));
        timers.current.delete(gone.key);
      }
      return next;
    });
    arm(key, t.action ? 8000 : 4500);
  }, [arm]);
  useEffect(() => { const t = timers.current; return () => { t.forEach(clearTimeout); }; }, []);

  const api = useMemo<ToastApi>(() => ({
    show,
    error: (message, retry) => show({ message, tone: 'danger', action: retry ? { label: 'Retry', onClick: retry } : undefined }),
  }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ab-toast-region app-toast-region" aria-live="polite" role="status">
        {items.map((t) => {
          const Icon = t.tone === 'danger' || t.tone === 'warning' ? AlertTriangle : t.tone === 'info' ? Info : CheckCircle2;
          return (
            <div key={t.key} className={`ab-toast ab-toast--${t.tone || 'success'}`}
              onMouseEnter={() => clearTimeout(timers.current.get(t.key))} onMouseLeave={() => arm(t.key, 3000)}
              onFocus={() => clearTimeout(timers.current.get(t.key))} onBlur={() => arm(t.key, 3000)}>
              <Icon size={18} strokeWidth={2} aria-hidden />
              <div className="flex-1">{t.message}</div>
              {t.action && (
                <button type="button" className="ab-btn ab-btn--ghost ab-btn--sm" onClick={() => { dismiss(t.key); t.action!.onClick(); }}>
                  {t.action.label}
                </button>
              )}
              <button type="button" className="ab-btn ab-btn--ghost ab-btn--sm ab-btn--icon" aria-label="Dismiss" onClick={() => dismiss(t.key)}>
                <X size={16} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
