import type { ReactNode } from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Candidate } from '@/domain/types';
import type { Snapshot } from './actions';
import { SNAPSHOT_MAX_AGE_MS, clearSnapshot, loadSnapshot, saveSnapshot } from './snapshotCache';
import { markFresh } from './freshness';
import { AuthProvider, useAuth } from '@/auth/auth';

const flagged = JSON.stringify({ flags: [{ level: 'high' }] });
const cand = (id: number, emm: Candidate['emm']): Candidate => ({
  id, name: `C${id}`, email: `c${id}@example.com`, requiresEmm: true, overallStatus: 'In Progress', candidateStage: 'Assessment Review',
  grit: { score: '' }, values: { score: '' }, emm, interview: {},
});
const snap = (): Snapshot => ({
  candidates: [
    cand(1, { graded: true, overallPct: 80, pass: true, fullResult: flagged }),
    cand(2, { graded: true, overallPct: 70, pass: true, fullResult: JSON.stringify({ flags: [] }) }),
    cand(3, { graded: false, overallPct: null, pass: null }),
  ],
  config: { deadlineHours: 24, reminderHours: 12 }, roleHealth: {}, minClientVersion: 0,
});

beforeEach(() => { localStorage.clear(); markFresh(); });

describe('the copy kept on this device', () => {
  it('comes back as saved, without the EMM grade detail but with the flagged mark', () => {
    saveSnapshot(snap(), 1_000);
    const got = loadSnapshot(2_000)!;
    expect(got.savedAt).toBe(1_000);
    expect(got.data.candidates).toHaveLength(3);
    expect(got.data.candidates.every((a) => a.emm.fullResult === undefined)).toBe(true);
    expect(got.data.candidates[0].emm.highRiskFlag).toBe(true);
    expect(got.data.candidates[1].emm.highRiskFlag).toBe(false);
    expect(got.data.candidates[2].emm).toEqual({ graded: false, overallPct: null, pass: null });
  });

  it('is dropped once it is older than 12 hours', () => {
    saveSnapshot(snap(), 1_000);
    expect(loadSnapshot(1_000 + SNAPSHOT_MAX_AGE_MS + 1)).toBeNull();
    expect(localStorage.getItem('abbss_snapshot_v1')).toBeNull();
  });

  it('ignores a broken copy instead of failing', () => {
    localStorage.setItem('abbss_snapshot_v1', '{not json');
    expect(loadSnapshot()).toBeNull();
    localStorage.setItem('abbss_snapshot_v1', JSON.stringify({ savedAt: Date.now(), data: {} }));
    expect(loadSnapshot()).toBeNull();
  });

  it('is cleared when someone switches person', async () => {
    saveSnapshot(snap());
    localStorage.setItem('abbss_identity', JSON.stringify({ email: '', name: 'Frances Miranda', role: 'PM' }));
    function Switch() { const { switchPerson } = useAuth(); return <button type="button" onClick={switchPerson}>switch</button>; }
    render(<AuthProvider><Switch /></AuthProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'switch' }));
    expect(localStorage.getItem('abbss_snapshot_v1')).toBeNull();
  });

  it('clearSnapshot is safe to call with nothing saved', () => {
    expect(() => clearSnapshot()).not.toThrow();
  });
});

describe('nothing is saved while the old copy is on screen', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); markFresh(); });

  async function client() {
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', 'https://example.test/exec');
    const sent: string[] = [];
    vi.stubGlobal('fetch', async (_u: unknown, init?: RequestInit) => { sent.push(JSON.parse(String(init?.body)).action); return new Response('{"success":true}'); });
    const mod = await import('./client');
    const fresh = await import('./freshness');
    return { call: mod.call, fresh, sent };
  }

  it('refuses a save, still allows a read, and lets the save through once live data is in', async () => {
    const { call, fresh, sent } = await client();
    fresh.showingSavedCopy(Date.now() - 60_000);
    await expect(call('saveApplicant', { id: 1 })).rejects.toThrow(/Waiting for the latest data/);
    await expect(call('getAll')).resolves.toMatchObject({ success: true });
    expect(sent).toEqual(['getAll']);
    fresh.markFresh();
    await expect(call('saveApplicant', { id: 1 })).resolves.toMatchObject({ success: true });
    expect(sent).toEqual(['getAll', 'saveApplicant']);
  });
});

describe('useSavedCopy', () => {
  it('reports the saved time until live data arrives', async () => {
    // Same module instances as the hook (an earlier test reset the module registry).
    const { useSavedCopy } = await import('./queries');
    const fresh = await import('./freshness');
    const wrapper = ({ children }: { children: ReactNode }) => <>{children}</>;
    const { result } = renderHook(() => useSavedCopy(), { wrapper });
    expect(result.current).toBe(0);
    act(() => fresh.showingSavedCopy(12_345));
    expect(result.current).toBe(12_345);
    expect(fresh.savedCopyTime()).toBe(12_345);
    act(() => fresh.markFresh());
    expect(result.current).toBe(0);
  });
});
