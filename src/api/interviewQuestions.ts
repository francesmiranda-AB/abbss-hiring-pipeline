import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteInterviewQuestion, getInterviewQuestions, reorderInterviewQuestions, saveInterviewQuestion } from './actions';
import { useUser } from '@/auth/auth';
import { useToast } from '@/ui/toast';
import { DEFAULT_QUESTIONS, type InterviewQuestion, type QuestionDraft } from '@/domain/interviewQuestions';

export const QUESTIONS_KEY = ['interview-questions'] as const;

// The shared question collections. If the backend can't serve them (an older
// backend that doesn't know the action, or a failed call) the built-in questions
// are shown and the collection can't be edited until it is reachable again.
// The backend can take a few seconds to answer, so start loading the questions as soon as
// the app opens; the Interview tab then has them ready. A failure here is ignored (the tab
// asks again and falls back to the built-in questions if it still can't get them).
export function usePrefetchQuestions() {
  const qc = useQueryClient();
  useEffect(() => { void qc.prefetchQuery({ queryKey: QUESTIONS_KEY, queryFn: getInterviewQuestions, staleTime: 5 * 60_000 }); }, [qc]);
}

export function useInterviewQuestions(): { questions: InterviewQuestion[]; isFallback: boolean; isLoading: boolean } {
  const q = useQuery({ queryKey: QUESTIONS_KEY, queryFn: getInterviewQuestions, staleTime: 5 * 60_000, retry: 1 });
  if (q.isError) return { questions: DEFAULT_QUESTIONS, isFallback: true, isLoading: false };
  return { questions: q.data || [], isFallback: false, isLoading: q.isLoading };
}

// Add, edit, delete (with Undo) and reorder. Every change reloads the list so
// everyone sees the same order.
export function useQuestionActions() {
  const qc = useQueryClient();
  const toast = useToast();
  const { name } = useUser();
  const reload = useCallback(() => qc.invalidateQueries({ queryKey: QUESTIONS_KEY }), [qc]);

  const save = useCallback(async (draft: QuestionDraft): Promise<boolean> => {
    try {
      await saveInterviewQuestion({ ...draft, by: name });
      await reload();
      toast.show({ message: draft.id ? 'Question saved' : 'Question added' });
      return true;
    } catch (e) {
      toast.error(`Couldn't save the question: ${(e as Error).message}`);
      return false;
    }
  }, [name, reload, toast]);

  const restore = useCallback(async (id: string) => {
    try { await deleteInterviewQuestion(id, false, name); await reload(); }
    catch (e) { toast.error(`Couldn't bring it back: ${(e as Error).message}`); }
  }, [name, reload, toast]);

  const remove = useCallback(async (q: InterviewQuestion) => {
    try {
      await deleteInterviewQuestion(q.id, true, name);
      await reload();
      toast.show({ message: 'Question deleted', action: { label: 'Undo', onClick: () => { void restore(q.id); } } });
    } catch (e) {
      toast.error(`Couldn't delete the question: ${(e as Error).message}`);
    }
  }, [name, reload, restore, toast]);

  const reorder = useCallback(async (ids: string[]) => {
    try { await reorderInterviewQuestions(ids, name); await reload(); }
    catch (e) { toast.error(`Couldn't move the question: ${(e as Error).message}`); await reload(); }
  }, [name, reload, toast]);

  return { save, remove, restore, reorder };
}
