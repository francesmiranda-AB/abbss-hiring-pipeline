import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/ui/toast';
import { DEFAULT_QUESTIONS, type InterviewQuestion } from '@/domain/interviewQuestions';
import { useInterviewQuestions } from './interviewQuestions';

// A plain fake: the backend either serves the collection or doesn't know the action yet.
const fake = { fail: false, served: [] as InterviewQuestion[] };
vi.mock('./actions', async (orig) => ({
  ...(await orig<typeof import('./actions')>()),
  getInterviewQuestions: async () => { if (fake.fail) throw new Error('Unknown: getInterviewQuestions'); return fake.served; },
}));

const wrap = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}><ToastProvider>{children}</ToastProvider></QueryClientProvider>;
};

it('shows what the backend serves', async () => {
  fake.fail = false;
  fake.served = [{ ...DEFAULT_QUESTIONS[0], id: 'only-one' }];
  const { result } = renderHook(() => useInterviewQuestions(), { wrapper: wrap() });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.isFallback).toBe(false);
  expect(result.current.questions.map((q) => q.id)).toEqual(['only-one']);
});

it('falls back to the built-in questions when the backend does not know the action', async () => {
  fake.fail = true;
  const { result } = renderHook(() => useInterviewQuestions(), { wrapper: wrap() });
  await waitFor(() => expect(result.current.isFallback).toBe(true), { timeout: 4000 });
  expect(result.current.questions).toBe(DEFAULT_QUESTIONS);
});
