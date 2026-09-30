import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { setTokenSource } from '@/api/client';
import { whoami } from '@/api/actions';
import type { AppRole } from '@/domain/types';

// Staff sign-in with Google Identity Services. The ID token lives in memory
// only. Without a client ID (local development) a picker stands in for
// sign-in, and the staging backend must have AUTH_MODE=off.

export const GOOGLE_CLIENT_ID: string = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
export const DEV_SIGN_IN = !GOOGLE_CLIENT_ID && typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

export interface User { email: string; name: string; role: AppRole }
type Status = 'loading' | 'signed-out' | 'signed-in' | 'not-staff';
interface AuthState {
  status: Status;
  user: User | null;
  error: string;
  signOut: () => void;
  devSignIn: (name: string, role: AppRole) => void;
  renderButton: (el: HTMLElement | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('No signed-in user');
  return user;
}

interface GoogleId {
  initialize: (o: Record<string, unknown>) => void;
  prompt: () => void;
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
  disableAutoSelect: () => void;
}
declare global { interface Window { google?: { accounts: { id: GoogleId } } } }

function loadGis(): Promise<GoogleId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('Google sign-in did not load.')));
    s.onerror = () => reject(new Error('Google sign-in could not load. Check the connection.'));
    document.head.appendChild(s);
  });
}

const DEV_KEY = 'abbss_dev_identity';

// Where sign-in starts: a remembered dev identity, a missing client ID, or Google.
function initialAuth(): { status: Status; user: User | null; error: string } {
  if (DEV_SIGN_IN) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(DEV_KEY) || 'null') as User | null;
      if (saved?.role) return { status: 'signed-in', user: saved, error: '' };
    } catch { /* no saved dev identity */ }
    return { status: 'signed-out', user: null, error: '' };
  }
  if (!GOOGLE_CLIENT_ID) return { status: 'signed-out', user: null, error: 'Sign-in is not configured (VITE_GOOGLE_CLIENT_ID).' };
  return { status: 'loading', user: null, error: '' };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(initialAuth);
  const [status, setStatus] = useState<Status>(initial.status);
  const [user, setUser] = useState<User | null>(initial.user);
  const [error, setError] = useState(initial.error);
  const token = useRef('');
  const waiters = useRef<Array<(t: string) => void>>([]);
  const gis = useRef<GoogleId | null>(null);

  const resolveUser = useCallback(async (fallback?: User) => {
    try {
      const me = await whoami();
      if (me.email && me.role) { setUser({ email: me.email, name: me.name || me.email, role: me.role }); setStatus('signed-in'); return; }
      if (fallback) { setUser(fallback); setStatus('signed-in'); return; }
      setError(me.email ? `${me.email} is not on the staff list for this app.` : 'This account is not on the staff list for this app.');
      setStatus('not-staff');
    } catch (e) {
      if (fallback) { setUser(fallback); setStatus('signed-in'); return; }
      setError((e as Error).message);
      setStatus('not-staff');
    }
  }, []);

  useEffect(() => {
    setTokenSource({
      getToken: async () => token.current,
      refreshToken: () => new Promise<string>((resolve, reject) => {
        if (!gis.current) { reject(new Error('Sign in again to continue.')); return; }
        const timer = setTimeout(() => { setStatus('signed-out'); reject(new Error('Sign in again to continue.')); }, 15000);
        waiters.current.push((t) => { clearTimeout(timer); resolve(t); });
        gis.current.prompt();
      }),
    });
  }, []);

  useEffect(() => {
    if (DEV_SIGN_IN || !GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    loadGis().then((id) => {
      if (cancelled) return;
      gis.current = id;
      id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        auto_select: true,
        hd: 'ab-businesssupport.com',
        use_fedcm_for_prompt: true,
        callback: (resp: { credential?: string }) => {
          if (!resp.credential) return;
          token.current = resp.credential;
          const pending = waiters.current.splice(0);
          if (pending.length) pending.forEach((w) => w(resp.credential!));
          else resolveUser();
        },
      });
      setStatus('signed-out');
      id.prompt();
    }).catch((e: Error) => { setError(e.message); setStatus('signed-out'); });
    return () => { cancelled = true; };
  }, [resolveUser]);

  const value = useMemo<AuthState>(() => ({
    status, user, error,
    signOut: () => {
      token.current = '';
      sessionStorage.removeItem(DEV_KEY);
      gis.current?.disableAutoSelect();
      setUser(null);
      setStatus('signed-out');
    },
    devSignIn: (name, role) => {
      const u: User = { email: '', name, role };
      sessionStorage.setItem(DEV_KEY, JSON.stringify(u));
      setUser(u);
      setStatus('signed-in');
    },
    renderButton: (el) => {
      if (el && gis.current) gis.current.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', width: 280 });
    },
  }), [status, user, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
