import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { loadingText } from '@/app/loadingText';
import type { Candidate } from '@/domain/types';

const base = {
  id: 7, name: 'EMM Person', email: 'e@example.com', requiresEmm: true, overallStatus: 'In Progress', candidateStage: 'Assessment Review',
  grit: { score: '' }, values: { score: '' }, interview: {},
  emm: { graded: true, overallPct: 80, pass: true, gradedAt: '2026-10-01T00:00:00Z' },
} as Candidate;

describe('what the loading screen says', () => {
  it('sets expectations first, says not to refresh while slow, and counts retries', () => {
    expect(loadingText(2, 1)).toMatch(/usually takes 5 to 10 seconds/);
    expect(loadingText(12, 1)).toMatch(/Still loading, 12 s.*No need to refresh/);
    expect(loadingText(25, 2)).toMatch(/attempt 2 of 3.*No need to refresh/);
  });
});

describe('a reply Google dropped on its second hop', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('is reported as a network failure, so the first load retries it', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', 'https://example.test/exec');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ success: false, error: 'Unknown: undefined' })));
    const { getAll } = await import('./actions');
    const { retrySnapshot } = await import('./queries');
    const err = await getAll().catch((e) => e);
    expect(err).toMatchObject({ network: true, timeout: false });
    expect(retrySnapshot(0, err)).toBe(true);
  });
});

describe('useEmmDetail', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  async function setup(reply: unknown) {
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', 'https://example.test/exec');
    const sent: string[] = [];
    vi.stubGlobal('fetch', async (_u: unknown, init?: RequestInit) => { sent.push(JSON.parse(String(init?.body)).action); return new Response(JSON.stringify(reply)); });
    const { useEmmDetail } = await import('./emmDetail');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    return { useEmmDetail, wrapper, sent };
  }

  it('uses the detail in the record when the list still carries it (no request)', async () => {
    const { useEmmDetail, wrapper, sent } = await setup({});
    const a = { ...base, emm: { ...base.emm, fullResult: '{"catByCat":{}}' } };
    const { result } = renderHook(() => useEmmDetail(a), { wrapper });
    expect(result.current.emm.fullResult).toBe('{"catByCat":{}}');
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(sent).toEqual([]);
  });

  it('fetches it for this candidate when the list left it out', async () => {
    const { useEmmDetail, wrapper, sent } = await setup({ success: true, data: { fullResult: '{"flags":[]}' } });
    const { result } = renderHook(() => useEmmDetail(base), { wrapper });
    await waitFor(() => expect(result.current.emm.fullResult).toBe('{"flags":[]}'));
    expect(result.current.emm.overallPct).toBe(80);
    expect(sent).toEqual(['getEmmDetail']);
  });

  it('degrades to the scores when the backend does not know the action yet', async () => {
    const { useEmmDetail, wrapper } = await setup({ success: false, error: 'Unknown: getEmmDetail' });
    const { result } = renderHook(() => useEmmDetail(base), { wrapper });
    await waitFor(() => expect(result.current.unavailable).toBe(true), { timeout: 4000 });
    expect(result.current.emm.overallPct).toBe(80);
  });
});
