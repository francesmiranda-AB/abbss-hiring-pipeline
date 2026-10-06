import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AppRole } from '@/domain/types';

// No login, by decision (2026-10-02): people pick who they are from the team
// list, and the choice is remembered on this device. The backend stays open
// (AUTH_MODE=off). Its Google sign-in check (requireStaff_) is still there,
// inert; switching it on would also need the Google sign-in code this file
// had at commit b1b31fa.

export interface User { email: string; name: string; role: AppRole }
type Status = 'signed-out' | 'signed-in';
interface AuthState {
  status: Status;
  user: User | null;
  signIn: (user: User) => void;
  switchPerson: () => void;
}

const KEY = 'abbss_identity';

function savedUser(): User | null {
  try {
    const u = JSON.parse(localStorage.getItem(KEY) || 'null') as User | null;
    return u?.name && u.role ? u : null;
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthState | null>(null);
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('No one picked');
  return user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(savedUser);
  const value = useMemo<AuthState>(() => ({
    status: user ? 'signed-in' : 'signed-out',
    user,
    signIn: (u) => {
      try { localStorage.setItem(KEY, JSON.stringify(u)); } catch { /* remembered for this visit only */ }
      setUser(u);
    },
    switchPerson: () => {
      try { localStorage.removeItem(KEY); } catch { /* nothing saved */ }
      setUser(null);
    },
  }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
