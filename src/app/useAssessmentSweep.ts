import { useEffect, useRef } from 'react';
import { useSnapshot } from '@/api/queries';
import { useUser } from '@/auth/auth';
import { useCandidateActions } from '@/features/candidates/actions';

// The backend attaches scores and EMM files on its own schedule. After each
// load, candidates who finished everything move to Assessment Review (HR and
// Operations only, so a read-only role never writes).
export function useAssessmentSweep() {
  const { dataUpdatedAt } = useSnapshot();
  const user = useUser();
  const { sweepSubmitted } = useCandidateActions();
  const last = useRef(0);
  useEffect(() => {
    if (!dataUpdatedAt || dataUpdatedAt === last.current) return;
    last.current = dataUpdatedAt;
    if (user.role === 'HR' || user.role === 'Operations') void sweepSubmitted();
  }, [dataUpdatedAt, user.role, sweepSubmitted]);
}
