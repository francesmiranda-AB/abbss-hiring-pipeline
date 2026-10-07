import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/auth/auth';
import { useConfig, useSnapshot } from '@/api/queries';
import { API_BLOCKED, API_URL } from '@/api/client';
import { CandidateActionsProvider } from '@/features/candidates/actions';
import { FEATURES, ROLE_LABEL, homePath, visibleFeatures, type Feature } from '@/features/registry';
import type { AppRole } from '@/domain/types';
import { Link } from 'react-router-dom';
import { Button, ErrorAlert, Skeleton } from '@/ui/kit';
import { useSlow } from '@/ui/useSlow';
import { Shell } from './Shell';
import { SignIn } from './SignIn';
import { useAssessmentSweep } from './useAssessmentSweep';

export function App() {
  const { status } = useAuth();
  if (!API_URL || API_BLOCKED) {
    return (
      <div className="app-centered">
        <ErrorAlert title="The app isn't connected to a backend">
          {API_BLOCKED ? 'This copy of the app (local or a preview) cannot use the production backend. Set VITE_API_URL to the staging URL (locally in .env.local, on Vercel for the Preview environment).' : 'Set VITE_API_URL to the backend web app URL.'}
        </ErrorAlert>
      </div>
    );
  }
  if (status !== 'signed-in') return <SignIn />;
  return <CandidateActionsProvider><SignedIn /></CandidateActionsProvider>;
}

function SignedIn() {
  const { user } = useAuth();
  const snap = useSnapshot();
  const config = useConfig();
  useAssessmentSweep();
  const slow = useSlow(snap.isLoading, 8_000);
  if (!user) return null;
  if (snap.isLoading) {
    return (
      <Shell>
        <div className="grid gap-4">
          <Skeleton lines={6} />
          {slow && (
            <p className="ab-muted m-0" role="status">
              Still loading. The server is slow right now.{' '}
              <Button size="sm" variant="secondary" onClick={() => void snap.refetch()}>Try again</Button>
            </p>
          )}
        </div>
      </Shell>
    );
  }
  // No data at all (the first load failed): say so, instead of letting every page show an empty state.
  if (!snap.data) {
    return (
      <Shell>
        <ErrorAlert title="Couldn't load the hiring data" action={<Button size="sm" variant="secondary" onClick={() => void snap.refetch()}>Try again</Button>}>
          {snap.error instanceof Error ? snap.error.message : 'The server did not answer.'} Nothing on this page is missing; it just hasn't loaded.
        </ErrorAlert>
      </Shell>
    );
  }
  const features = visibleFeatures(user.role, config.features);
  return (
    <Shell>
      <Routes>
        {features.map((f) => <Route key={f.key} path={`${f.path}/*`} element={<f.page />} />)}
        {FEATURES.filter((f) => !features.includes(f)).map((f) => (
          <Route key={f.key} path={`${f.path}/*`} element={<NotAllowed feature={f} role={user.role} home={homePath(user.role, config.features)} />} />
        ))}
        <Route path="*" element={<Navigate to={homePath(user.role, config.features)} replace />} />
      </Routes>
    </Shell>
  );
}

function NotAllowed({ feature, role, home }: { feature: Feature; role: AppRole; home: string }) {
  const forRoles = feature.roles.map((r) => ROLE_LABEL[r]).join(' and ');
  return (
    <div className="app-centered">
      <div className="grid gap-3">
        <h1 className="ab-title">{feature.label} isn't available to you</h1>
        <p className="ab-muted m-0">
          {feature.roles.includes(role)
            ? 'This page is switched off for now.'
            : `This page is for ${forRoles}. You are signed in as ${ROLE_LABEL[role]}. Use the menu to switch person or role.`}
        </p>
        <div><Link to={home} className="ab-btn ab-btn--secondary">Go to your home page</Link></div>
      </div>
    </div>
  );
}
