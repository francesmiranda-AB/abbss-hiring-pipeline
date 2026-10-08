import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Candidate } from '@/domain/types';

// Each fetch call gets the next behaviour from this list: 'hang' (until aborted), or a reply body.
type Plan = Array<'hang' | string>;
function stubFetch(plan: Plan) {
  const calls: Array<{ action: string; aborted: () => boolean; at: number }> = [];
  const t0 = Date.now();
  vi.stubGlobal('fetch', (_u: unknown, init?: RequestInit) => {
    const step = plan[calls.length] ?? 'hang';
    const signal = init?.signal as AbortSignal;
    calls.push({ action: JSON.parse(String(init?.body)).action, aborted: () => signal.aborted, at: Date.now() - t0 });
    if (step === 'hang') return new Promise<Response>((_r, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    return Promise.resolve(new Response(step));
  });
  return calls;
}
async function client() {
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'https://example.test/exec');
  return import('./client');
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('a read that Google holds', () => {
  it('sends a second copy at 6 s; the first good answer wins and the held one is cancelled', async () => {
    vi.useFakeTimers();
    const calls = stubFetch(['hang', '{"success":true,"data":[1]}']);
    const { call } = await client();
    let result: unknown = 'pending';
    const p = call('getAll').then((r) => { result = r; });
    await vi.advanceTimersByTimeAsync(5_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(calls).toHaveLength(2);
    expect(result).toMatchObject({ data: [1] });
    expect(calls[0].aborted()).toBe(true);
  });

  it('tries a third copy at 14 s, and gives up at 30 s if none answers', async () => {
    vi.useFakeTimers();
    const calls = stubFetch(['hang', 'hang', 'hang']);
    const { call } = await client();
    let err: unknown = 'pending';
    const p = call('getAll').catch((e) => { err = e; });
    await vi.advanceTimersByTimeAsync(14_000);
    expect(calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(15_999);
    expect(err).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(err).toMatchObject({ timeout: true, network: true });
    expect(calls.every((c) => c.aborted())).toBe(true);
  });

  it('a dropped reply on one copy starts the next straight away instead of failing', async () => {
    vi.useFakeTimers();
    const calls = stubFetch(['{"success":false,"error":"Unknown: undefined"}', '<!DOCTYPE html><html>404</html>', '{"success":true,"data":[2]}']);
    const { call } = await client();
    const r = await call('getAll');
    expect(r).toMatchObject({ data: [2] });
    expect(calls.map((c) => c.at)).toEqual([0, 0, 0]);
  });

  it('a backend error is an answer, not a lost reply', async () => {
    stubFetch(['{"success":false,"error":"The sheet is busy."}']);
    const { call } = await client();
    await expect(call('getAll')).rejects.toMatchObject({ message: 'The sheet is busy.', network: false });
  });
});

describe('saves', () => {
  it('are sent once, never copied, even when the reply is held', async () => {
    vi.useFakeTimers();
    const calls = stubFetch(['hang']);
    const { call } = await client();
    const p = call('saveApplicant', { id: 1 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await p).toMatchObject({ timeout: true });
    expect(calls).toHaveLength(1);
  });

  it('a lost reply (bounced) is reported as unconfirmed, not as a failure from the backend', async () => {
    stubFetch(['{"success":false,"error":"Unknown: undefined"}']);
    const { call } = await client();
    await expect(call('saveApplicant', { id: 1 })).rejects.toMatchObject({ network: true, message: expect.stringMatching(/couldn't be confirmed/) });
  });
});

describe('a save whose reply was lost', () => {
  const cand = { id: 1, name: 'Lost Reply', email: 'l@example.com', requiresEmm: false, overallStatus: 'In Progress', candidateStage: 'CV Screening',
    grit: { score: '' }, values: { score: '' }, emm: { graded: false, overallPct: null, pass: null }, interview: {}, phone: '1' } as Candidate;

  // The error is built from the same module instance the app code uses (modules are reset here).
  async function setup(make: (ApiError: typeof import('./client').ApiError) => Error) {
    vi.resetModules();
    const { ApiError } = await import('./client');
    const error = make(ApiError);
    vi.doMock('./actions', async (orig) => ({ ...(await orig<typeof import('./actions')>()), saveCandidate: async () => { throw error; } }));
    const { SNAPSHOT_KEY, useUpdateCandidate } = await import('./queries');
    const { ToastProvider } = await import('@/ui/toast');
    const qc = new QueryClient();
    qc.setQueryData(SNAPSHOT_KEY, { candidates: [cand], config: { deadlineHours: 24, reminderHours: 12 }, roleHealth: {}, minClientVersion: 0 });
    const invalidated: unknown[] = [];
    const orig = qc.invalidateQueries.bind(qc);
    qc.invalidateQueries = ((f?: unknown) => { invalidated.push(f); return orig(f as never); }) as typeof qc.invalidateQueries;
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}><ToastProvider>{children}</ToastProvider></QueryClientProvider>;
    const { result } = renderHook(() => useUpdateCandidate(), { wrapper });
    const now = () => (qc.getQueryData(SNAPSHOT_KEY) as { candidates: Candidate[] }).candidates[0];
    return { update: result.current, now, invalidated };
  }
  afterEach(() => { vi.doUnmock('./actions'); });

  it('keeps the change on screen and reloads the list to see what the server has', async () => {
    const { update, now, invalidated } = await setup((E) => new E('lost', { network: true }));
    await act(async () => { await update(1, { phone: '2' }); });
    expect(now().phone).toBe('2');
    expect(invalidated).toHaveLength(1);
  });

  it('a real error from the backend still undoes the change', async () => {
    const { update, now, invalidated } = await setup((E) => new E('The sheet is busy.'));
    await act(async () => { await update(1, { phone: '2' }); });
    expect(now().phone).toBe('1');
    expect(invalidated).toHaveLength(0);
  });
});
