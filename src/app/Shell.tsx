import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AlertTriangle, ArrowLeftRight, ChevronDown, Menu, MessageSquareWarning, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth, useUser } from '@/auth/auth';
import { SNAPSHOT_KEY, useCandidates, useConfig, useFailedSave, useSnapshot } from '@/api/queries';
import { needsAttentionFrom } from '@/domain/attention';
import { isEndorsedToOperations } from '@/domain/stages';
import { ROLE_LABEL, visibleFeatures } from '@/features/registry';
import { Button, Skeleton, cx } from '@/ui/kit';
import { ReportProblemDialog } from './ReportProblem';

export const APP_VERSION = 2;

export function Shell({ children }: { children: ReactNode }) {
  const user = useUser();
  const config = useConfig();
  const features = visibleFeatures(user.role, config.features);
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const { candidates } = useCandidates();
  const scope = user.role === 'Operations' ? candidates.filter(isEndorsedToOperations) : candidates;
  const attention = scope.filter((a) => needsAttentionFrom(a, user.role, config)).length;
  const snap = useSnapshot();
  const outdated = (snap.data?.minClientVersion || 0) > APP_VERSION;

  const groups = (['work', 'more'] as const).map((g) => features.filter((f) => f.group === g)).filter((g) => g.length);
  return (
    <div className="ab-app">
      <a className="ab-skip-link" href="#main">Skip to content</a>
      {navOpen && <div className="app-backdrop" onClick={() => setNavOpen(false)} aria-hidden />}
      <nav className="ab-sidebar" data-open={navOpen} aria-label="Main">
        <div className="ab-sidebar__brand">
          <span className="app-brand-mark" aria-hidden>AB</span>
          <span className="grid leading-tight"><span>Hiring pipeline</span><span className="app-brand-sub">AB Business Support</span></span>
        </div>
        {groups.map((g, i) => (
          <div key={i} className="grid gap-1">
            {i > 0 && <hr className="app-sidebar-rule" />}
            {g.map((f) => (
              <NavLink key={f.key} to={f.path} onClick={() => setNavOpen(false)} className="ab-sidebar__item" aria-current={location.pathname.startsWith(f.path) ? 'page' : undefined}>
                <f.icon size={18} strokeWidth={2} aria-hidden />
                <span className="flex-1">{f.label}</span>
                {f.key === 'today' && attention > 0 && <span className="app-nav-count" aria-label={`${attention} need action`}>{attention}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="ab-main">
        <header className="ab-topbar">
          <div className="ab-cluster">
            <Button variant="ghost" size="sm" icon={Menu} aria-label="Open menu" className="app-menu-button" onClick={() => setNavOpen(true)} />
            <SyncStatus />
          </div>
          <UserMenu />
        </header>
        {outdated && (
          <div className="app-banner" role="status">
            <AlertTriangle size={18} aria-hidden />
            <span>A new version of the app is out. Reload to keep your changes saving correctly.</span>
            <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>Reload</Button>
          </div>
        )}
        <main id="main" className="ab-page">
          <Suspense fallback={<Skeleton lines={5} />}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}

function SyncStatus() {
  const snap = useSnapshot();
  const failed = useFailedSave();
  const qc = useQueryClient();
  if (failed) {
    return (
      <span className="app-sync app-sync--bad" role="status">
        <AlertTriangle size={16} aria-hidden />
        <span className="app-sync__text">Couldn't save a change</span>
        <Button size="sm" variant="outline" onClick={failed.retry}>Retry</Button>
      </span>
    );
  }
  if (snap.isError) {
    return (
      <span className="app-sync app-sync--bad" role="status">
        <AlertTriangle size={16} aria-hidden />
        <span className="app-sync__text">Couldn't load the latest data</span>
        <Button size="sm" variant="outline" onClick={() => qc.invalidateQueries({ queryKey: SNAPSHOT_KEY })}>Retry</Button>
      </span>
    );
  }
  const at = snap.dataUpdatedAt ? new Date(snap.dataUpdatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  return (
    <button type="button" className="app-sync" onClick={() => qc.invalidateQueries({ queryKey: SNAPSHOT_KEY })} title="Load the latest data">
      <RefreshCw size={14} aria-hidden className={cx(snap.isFetching && 'app-spin')} />
      <span className="app-sync__text">{snap.isFetching && !at ? 'Loading' : at ? `Synced ${at}` : 'Not synced'}</span>
    </button>
  );
}

function UserMenu() {
  const user = useUser();
  const { switchPerson } = useAuth();
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="app-user" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="grid text-right leading-tight">
          <span className="app-user__name">{user.name}</span>
          <span className="app-user__role">{ROLE_LABEL[user.role]}</span>
        </span>
        <ChevronDown size={16} aria-hidden />
      </button>
      {open && (
        <div className="ab-menu app-menu-right" role="menu">
          <button type="button" role="menuitem" className="ab-menu__item" onClick={() => { setOpen(false); setReport(true); }}>
            <MessageSquareWarning size={16} aria-hidden /> Report a problem
          </button>
          <hr className="ab-menu__sep" />
          <button type="button" role="menuitem" className="ab-menu__item" onClick={switchPerson}>
            <ArrowLeftRight size={16} aria-hidden /> Switch person or role
          </button>
        </div>
      )}
      <ReportProblemDialog open={report} onClose={() => setReport(false)} />
    </div>
  );
}
