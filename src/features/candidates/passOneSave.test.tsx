import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/ui/toast';
import { AuthProvider } from '@/auth/auth';
import { SNAPSHOT_KEY } from '@/api/queries';
import type { Snapshot } from '@/api/actions';
import type { Candidate } from '@/domain/types';
import { CandidateActionsProvider, useCandidateActions } from './actions';

// Saves are recorded instead of sent.
const saves: Array<{ record: Candidate; changed: string[] }> = [];
vi.mock('@/api/actions', async (orig) => ({
  ...(await orig<typeof import('@/api/actions')>()),
  saveCandidate: async (record: Candidate, changed: string[]) => { saves.push({ record, changed }); return { success: true }; },
  sendEmail: async () => ({ success: true }),
}));

const cand = {
  id: 3, name: 'Interviewed Person', email: 'i@example.com', requiresEmm: false, overallStatus: 'In Progress', candidateStage: 'Initial Interview',
  department: 'Operations', grit: { score: '' }, values: { score: '' }, emm: { graded: false, overallPct: null, pass: null }, interview: { notes: 'ok' },
} as Candidate;

function setup() {
  localStorage.setItem('abbss_identity', JSON.stringify({ email: '', name: 'David Latimer', role: 'Operations' }));
  const qc = new QueryClient();
  qc.setQueryData<Snapshot>(SNAPSHOT_KEY, { candidates: [cand], config: { deadlineHours: 24, reminderHours: 12 }, roleHealth: {}, minClientVersion: 0 });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}><ToastProvider><AuthProvider><CandidateActionsProvider>{children}</CandidateActionsProvider></AuthProvider></ToastProvider></QueryClientProvider>
  );
  const { result } = renderHook(() => useCandidateActions(), { wrapper });
  return { result, qc };
}

beforeEach(() => { saves.length = 0; localStorage.clear(); });

it('marking an interview passed saves the result and the stage move in one save', async () => {
  const { result, qc } = setup();
  let saved = false;
  await act(async () => { saved = await result.current.advance(3, 'interviewPassed', 'Interview marked as passed', { interview: { notes: 'ok', result: 'pass' } }); });
  expect(saved).toBe(true);
  expect(saves).toHaveLength(1);
  expect(saves[0].changed).toEqual(expect.arrayContaining(['candidateStage', 'interview']));
  const now = qc.getQueryData<Snapshot>(SNAPSHOT_KEY)!.candidates[0];
  expect(now.candidateStage).toBe('Operations Decision');
  expect(now.interview?.result).toBe('pass');
});

it('says nothing was saved when there is no move to make, so the caller saves the result alone', async () => {
  const { result } = setup();
  let saved = true;
  await act(async () => { saved = await result.current.advance(3, 'cvUploaded'); });
  expect(saved).toBe(false);
  expect(saves).toHaveLength(0);
});
