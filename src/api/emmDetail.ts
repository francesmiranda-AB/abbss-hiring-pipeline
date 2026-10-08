import { useQuery } from '@tanstack/react-query';
import { getEmmDetail } from './actions';
import type { Candidate, Emm } from '@/domain/types';

// The full EMM grading detail (category breakdown, flags, wrong answers) is big, so the
// candidate list may leave it out. This gives a candidate's EMM with the detail: from the
// record when it is there, otherwise fetched for this one candidate when it is needed.
export function useEmmDetail(a: Candidate): { emm: Emm; loading: boolean; unavailable: boolean } {
  const inRecord = !!a.emm?.fullResult;
  const q = useQuery({
    queryKey: ['emmDetail', a.id, a.emm?.gradedAt || ''],
    queryFn: () => getEmmDetail(a.id),
    enabled: !!a.emm?.graded && !inRecord,
    staleTime: 10 * 60_000,
    retry: 1,
  });
  if (inRecord) return { emm: a.emm, loading: false, unavailable: false };
  return {
    emm: { ...a.emm, ...(q.data || {}) },
    loading: q.isFetching && !q.data,
    unavailable: q.isError,
  };
}
