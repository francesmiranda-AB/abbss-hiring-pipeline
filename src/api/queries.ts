import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { getAll, saveCandidate, type Snapshot } from './actions';
import { useToast } from '@/ui/toast';
import { DEFAULT_CONFIG } from '@/domain/attention';
import type { Candidate } from '@/domain/types';

export const SNAPSHOT_KEY = ['snapshot'] as const;

export function useSnapshot() {
  return useQuery({ queryKey: SNAPSHOT_KEY, queryFn: getAll, staleTime: 30_000, refetchInterval: 5 * 60_000 });
}

// Everyone except soft-deleted records.
export function useCandidates(): { candidates: Candidate[]; isLoading: boolean; error: Error | null } {
  const q = useSnapshot();
  const candidates = useMemo(() => (q.data?.candidates || []).filter((a) => a.overallStatus !== 'Deleted'), [q.data]);
  return { candidates, isLoading: q.isLoading, error: q.error };
}
export function useCandidate(id: number | null) {
  const { candidates } = useCandidates();
  return id == null ? undefined : candidates.find((a) => a.id === id);
}
export function useConfig() {
  return useSnapshot().data?.config || DEFAULT_CONFIG;
}

// The last save that failed, for the topbar status (one Retry).
let failedSave: { message: string; retry: () => void } | null = null;
const listeners = new Set<() => void>();
function setFailedSave(v: typeof failedSave) {
  failedSave = v;
  listeners.forEach((l) => l());
}
export function useFailedSave() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => failedSave);
}

export interface UpdateOptions { undoStage?: boolean; silent?: boolean }

// The one way to change a candidate: shows the change at once, saves the whole
// record with the changed field names, rolls back and says so if it fails.
type ToastApi = ReturnType<typeof useToast>;
async function saveWithRollback(qc: QueryClient, toast: ToastApi, id: number, patch: Partial<Candidate>, opts: UpdateOptions): Promise<boolean> {
  const changed = Object.keys(patch);
  if (!changed.length) return true;
  const snap = qc.getQueryData<Snapshot>(SNAPSHOT_KEY);
  const current = snap?.candidates.find((a) => a.id === id);
  if (!snap || !current) { toast.error('That candidate is no longer loaded. Reload and try again.'); return false; }
  const next: Candidate = { ...current, ...patch };
  const apply = (rec: Candidate) => qc.setQueryData<Snapshot>(SNAPSHOT_KEY, (s) => s && { ...s, candidates: s.candidates.map((a) => (a.id === id ? rec : a)) });
  apply(next);
  try {
    await saveCandidate(next, changed, { undoStage: opts.undoStage });
    if (failedSave) setFailedSave(null);
    return true;
  } catch (e) {
    // Put back only the fields this save changed; later edits stay.
    const latest = qc.getQueryData<Snapshot>(SNAPSHOT_KEY)?.candidates.find((a) => a.id === id);
    if (latest) {
      const reverted = { ...latest };
      for (const k of changed) (reverted as Record<string, unknown>)[k] = (current as Record<string, unknown>)[k];
      apply(reverted);
    }
    const message = `Couldn't save ${current.name}: ${(e as Error).message}`;
    const retry = () => { void saveWithRollback(qc, toast, id, patch, opts); };
    setFailedSave({ message, retry });
    if (!opts.silent) toast.error(message, retry);
    return false;
  }
}

export function useUpdateCandidate() {
  const qc = useQueryClient();
  const toast = useToast();
  return useCallback((id: number, patch: Partial<Candidate>, opts: UpdateOptions = {}) => saveWithRollback(qc, toast, id, patch, opts), [qc, toast]);
}

// Replace one record in the cache with what the backend returned.
export function useReplaceCandidate() {
  const qc = useQueryClient();
  return useCallback((rec: Candidate) => {
    qc.setQueryData<Snapshot>(SNAPSHOT_KEY, (s) => s && { ...s, candidates: s.candidates.some((a) => a.id === rec.id) ? s.candidates.map((a) => (a.id === rec.id ? rec : a)) : [rec, ...s.candidates] });
  }, [qc]);
}
