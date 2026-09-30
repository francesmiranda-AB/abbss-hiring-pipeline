import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/auth/auth';
import { useConfig, useSnapshot } from '@/api/queries';
import { API_BLOCKED, API_URL } from '@/api/client';
import { CandidateActionsProvider } from '@/features/candidates/actions';
import { homePath, visibleFeatures } from '@/features/registry';
import { ErrorAlert, Skeleton } from '@/ui/kit';
import { Shell } from './Shell';
import { SignIn } from './SignIn';
import { useAssessmentSweep } from './useAssessmentSweep';

export function App() {
  const { status } = useAuth();
  if (!API_URL || API_BLOCKED) {
    return (
      <div className="app-centered">
        <ErrorAlert title="The app isn't connected to a backend">
          {API_BLOCKED ? 'A local copy of the app cannot use the production backend. Set VITE_API_URL to the staging URL in .env.local.' : 'Set VITE_API_URL to the backend web app URL.'}
        </ErrorAlert>
      </div>
    );
  }
  if (status === 'loading') return <div className="app-centered"><Skeleton lines={3} /></div>;
  if (status !== 'signed-in') return <SignIn />;
  return <CandidateActionsProvider><SignedIn /></CandidateActionsProvider>;
}

function SignedIn() {
  const { user } = useAuth();
  const snap = useSnapshot();
  const config = useConfig();
  useAssessmentSweep();
  if (!user) return null;
  if (snap.isLoading) return <Shell><Skeleton lines={6} /></Shell>;
  const features = visibleFeatures(user.role, config.features);
  return (
    <Shell>
      <Routes>
        {features.map((f) => <Route key={f.key} path={`${f.path}/*`} element={<f.page />} />)}
        <Route path="*" element={<Navigate to={homePath(user.role, config.features)} replace />} />
      </Routes>
    </Shell>
  );
}
