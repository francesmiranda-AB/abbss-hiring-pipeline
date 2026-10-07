import type { Snapshot } from './actions';
import { emmHighRiskFlag } from '@/domain/assessments';

// The last list loaded, kept on this device so the app can draw it at once next time
// (the server takes about 5 s). Staff use personal work laptops; the copy is dropped
// after 12 hours and when someone switches person. The EMM grade detail is left out
// (it is most of the size and only the Assessments tab needs it); the "flagged" mark
// it decides is kept.
const KEY = 'abbss_snapshot_v1';
export const SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface SavedSnapshot { savedAt: number; data: Snapshot }

export function saveSnapshot(s: Snapshot, now = Date.now()): void {
  const candidates = s.candidates.map((a) => {
    if (a.emm?.fullResult === undefined) return a;
    const emm = { ...a.emm, highRiskFlag: emmHighRiskFlag(a) };
    delete emm.fullResult;
    return { ...a, emm };
  });
  try {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: now, data: { ...s, candidates } }));
  } catch {
    clearSnapshot(); // full or blocked storage: no copy is better than a stale one
  }
}

export function loadSnapshot(now = Date.now()): SavedSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedSnapshot;
    const ok = typeof saved?.savedAt === 'number' && Array.isArray(saved.data?.candidates)
      && now - saved.savedAt <= SNAPSHOT_MAX_AGE_MS && saved.savedAt <= now + 60_000;
    if (!ok) { clearSnapshot(); return null; }
    return saved;
  } catch {
    clearSnapshot();
    return null;
  }
}

export function clearSnapshot(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing saved */ }
}
