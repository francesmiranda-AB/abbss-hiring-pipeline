import { ApiError } from './client';
import { retrySnapshot } from './queries';

type Call = typeof import('./client').call;

// A fetch that never answers; it only ends when it is aborted.
function hangingFetch() {
  return (_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
  });
}

async function loadClient(): Promise<Call> {
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'https://example.test/exec');
  return (await import('./client')).call;
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('a request that never answers', () => {
  it('a read gives up after 30 seconds, not before', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangingFetch());
    const call = await loadClient();
    let settled: unknown = 'pending';
    const p = call('getAll').catch((e) => { settled = e; });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(settled).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(settled).toBeInstanceOf(Error);
    expect(settled).toMatchObject({ timeout: true, network: true });
    expect((settled as Error).message).toMatch(/30 seconds/);
  });

  it('a save is not cut off at 30 seconds, and the 90 second message warns it may have been saved', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangingFetch());
    const call = await loadClient();
    let settled: unknown = 'pending';
    const p = call('saveApplicant', { id: 1 }).catch((e) => { settled = e; });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe('pending');
    await vi.advanceTimersByTimeAsync(30_000);
    await p;
    expect(settled).toMatchObject({ timeout: true });
    expect((settled as Error).message).toMatch(/may have been saved/);
  });

  it('a request the caller cancels is not reported as a timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangingFetch());
    const call = await loadClient();
    const ctrl = new AbortController();
    let settled: unknown = 'pending';
    const p = call('getAll', {}, ctrl.signal).catch((e) => { settled = e; });
    ctrl.abort();
    await vi.advanceTimersByTimeAsync(0);
    await p;
    expect(settled).not.toBeInstanceOf(ApiError);
    expect((settled as Error).name).toBe('AbortError');
  });

  it('an answer that arrives in time is returned', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ success: true, data: [1] })));
    const call = await loadClient();
    await expect(call('getAll')).resolves.toMatchObject({ data: [1] });
  });
});

describe('retrying the first load', () => {
  it('retries a dropped connection twice, but not a load that already waited 30 seconds', () => {
    const dropped = new ApiError('offline', { network: true });
    const timedOut = new ApiError('slow', { network: true, timeout: true });
    expect(retrySnapshot(0, dropped)).toBe(true);
    expect(retrySnapshot(1, dropped)).toBe(true);
    expect(retrySnapshot(2, dropped)).toBe(false);
    expect(retrySnapshot(0, timedOut)).toBe(false);
  });
});
