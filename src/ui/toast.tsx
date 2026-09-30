import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

// One toast at a time (a new one replaces the old), polite live region,
// never steals focus. Actions (Undo, Retry) keep it up a little longer.
type Tone = 'success' | 'danger' | 'info' | 'warning';
export interface ToastInput { message: string; tone?: Tone; action?: { label: string; onClick: () => void } }
interface ToastApi { show: (t: ToastInput) => void; error: (message: string, retry?: () => void) => void }

const ToastContext = createContext<ToastApi | null>(null);
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastInput & { key: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((t: ToastInput) => {
    clearTimeout(timer.current);
    setToast({ ...t, key: Date.now() });
    timer.current = setTimeout(() => setToast(null), t.action ? 7000 : 4500);
  }, []);
  const api = useMemo<ToastApi>(() => ({
    show,
    error: (message, retry) => show({ message, tone: 'danger', action: retry ? { label: 'Retry', onClick: retry } : undefined }),
  }), [show]);
  const Icon = toast?.tone === 'danger' || toast?.tone === 'warning' ? AlertTriangle : toast?.tone === 'info' ? Info : CheckCircle2;
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ab-toast-region" aria-live="polite" role="status">
        {toast && (
          <div key={toast.key} className={`ab-toast ab-toast--${toast.tone || 'success'}`}>
            <Icon size={18} strokeWidth={2} aria-hidden />
            <div className="flex-1">{toast.message}</div>
            {toast.action && (
              <button type="button" className="ab-btn ab-btn--ghost ab-btn--sm" onClick={() => { setToast(null); toast.action!.onClick(); }}>
                {toast.action.label}
              </button>
            )}
            <button type="button" className="ab-btn ab-btn--ghost ab-btn--sm ab-btn--icon" aria-label="Dismiss" onClick={() => setToast(null)}>
              <X size={16} aria-hidden />
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
