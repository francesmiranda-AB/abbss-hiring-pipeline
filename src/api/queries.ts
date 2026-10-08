import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { getAll, saveCandidate, type Snapshot } from './actions';
import { ApiError } from './client';
import { markFresh, savedCopyTime, showingSavedCopy, subscribeSavedCopy } from './freshness';
import { loadSnapshot, saveSnapshot as keepOnDevice } from './snapshotCache';
import { useToast } from '@/ui/toast';
import { DEFAULT_CONFIG } from '@/domain/attention';
import type { Candidate } from '@/domain/types';

export const SNAPSHOT_KEY = ['snapshot'] as const;

// A load that timed out is not retried (it already waited 30 s); the screen offers Try again instead.
export const retrySnapshot = (count: number, error: Error) => count < 2 && !(error instanceof ApiError && error.timeout);

// The copy saved on this device, read once per visit. Drawn at once, marked as old
// (initialDataUpdatedAt 0 makes it stale, so the live list is fetched straight away).
let bootCopy: Snapshot | undefined | null = null;
function savedCopy(): Snapshot | undefined {
  if (bootCopy === null) {
    const c = loadSnapshot();
    bootCopy = c?.data;
    if (c) showingSavedCopy(c.savedAt);
  }
  return bootCopy;
}
async function loadLive(signal?: AbortSignal): Promise<Snapshot> {
  const s = await getAll(signal);
  keepOnDevice(s);
  markFresh();
  return s;
}

export function useSnapshot() {
  return useQuery({
    queryKey: SNAPSHOT_KEY, queryFn: ({ signal }) => loadLive(signal), staleTime: 2 * 60_000, refetchInterval: 5 * 60_000,
    retry: retrySnapshot, retryDelay: (n) => Math.min(1000 * 2 ** n, 4000),
    initialData: savedCopy, initialDataUpdatedAt: 0,
  });
}

// When the list on screen is the saved copy: the time it was saved (0 once live data is in).
export function useSavedCopy(): number {
  return useSyncExternalStore(subscribeSavedCopy, savedCopyTime);
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

// How many saves are in flight, and when the last one finished, for the small
// "Saving / Saved" mark in the record header.
let pendingSaves = 0;
let recentlySaved = false;
let recentTimer: ReturnType<typeof setTimeout> | undefined;
let saveSnapshot = { pending: 0, recent: false };
function publishSaves() {
  saveSnapshot = { pending: pendingSaves, recent: recentlySaved };
  listeners.forEach((l) => l());
}
function bumpSaves(delta: number, done = false) {
  pendingSaves = Math.max(0, pendingSaves + delta);
  if (done) {
    recentlySaved = true;
    clearTimeout(recentTimer);
    recentTimer = setTimeout(() => { recentlySaved = false; publishSaves(); }, 3000);
  }
  publishSaves();
}
export function useSaveStatus() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => saveSnapshot);
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
  bumpSaves(1);
  try {
    await saveCandidate(next, changed, { undoStage: opts.undoStage });
    if (failedSave) setFailedSave(null);
    bumpSaves(-1, true);
    return true;
  } catch (e) {
    bumpSaves(-1);
    // The reply was lost (timeout, Google dropped it, connection): the save may well have gone
    // through, so don't undo it on screen. Reload the list and keep what the server has.
    if (e instanceof ApiError && e.network) {
      toast.show({ message: `Couldn't confirm the save for ${current.name}. Checking with the server; if the change isn't there afterwards, enter it again.`, tone: 'info' });
      void qc.invalidateQueries({ queryKey: SNAPSHOT_KEY });
      return false;
    }
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
