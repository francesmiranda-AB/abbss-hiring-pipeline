import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/ui/toast';
import type { Candidate } from '@/domain/types';
import { SNAPSHOT_KEY, useUpdateCandidate } from './queries';
import type { Snapshot } from './actions';

// A plain fake (not vi.fn): calls are recorded, and fail=true makes the save reject.
const fake = { calls: [] as unknown[][], fail: false };
vi.mock('./actions', async (orig) => ({
  ...(await orig<typeof import('./actions')>()),
  saveCandidate: async (...a: unknown[]) => { fake.calls.push(a); if (fake.fail) throw new Error('The sheet is busy.'); return { success: true }; },
}));

const cand: Candidate = {
  id: 1, name: 'Test Candidate', email: 't@example.com', requiresEmm: false, overallStatus: 'In Progress', candidateStage: 'CV Screening',
  grit: { score: '' }, values: { score: '' }, emm: { graded: false, overallPct: null, pass: null }, interview: {}, phone: '1',
};

function setup() {
  const qc = new QueryClient();
  qc.setQueryData<Snapshot>(SNAPSHOT_KEY, { candidates: [cand], config: { deadlineHours: 24, reminderHours: 12 }, roleHealth: {}, minClientVersion: 0 });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}><ToastProvider>{children}</ToastProvider></QueryClientProvider>;
  const { result } = renderHook(() => useUpdateCandidate(), { wrapper });
  const current = () => qc.getQueryData<Snapshot>(SNAPSHOT_KEY)!.candidates[0];
  return { update: result.current, current };
}

beforeEach(() => { fake.calls = []; fake.fail = false; });

it('sends the whole record with only the changed field names', async () => {
  const { update, current } = setup();
  let ok = false;
  await act(async () => { ok = await update(1, { phone: '2' }); });
  expect(ok).toBe(true);
  expect(current().phone).toBe('2');
  const [record, changed] = fake.calls[0];
  expect(record).toMatchObject({ id: 1, name: 'Test Candidate', phone: '2' });
  expect(changed).toEqual(['phone']);
});

it('puts the old value back when the save fails', async () => {
  fake.fail = true;
  const { update, current } = setup();
  let ok = true;
  await act(async () => { ok = await update(1, { phone: '2' }); });
  expect(ok).toBe(false);
  expect(current().phone).toBe('1');
});

it('passes the undo flag through, so the backend drops the stage date it stamped', async () => {
  const { update } = setup();
  await act(async () => { await update(1, { candidateStage: 'New Application' }, { undoStage: true }); });
  expect(fake.calls[0][2]).toEqual({ undoStage: true });
});
