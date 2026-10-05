import seed from './interviewQuestions.seed.json';
import { ROLE_OPTIONS } from './stages';
import type { Candidate } from './types';

// The shared interview question collections. Two sets: role-specific questions
// (each lists the hiring roles it applies to) and behavioral questions (asked of
// everyone). Each question carries a model answer ("look for") and what to watch
// out for. The Sheet owns them; the seed file is what the backend starts with and
// what the app shows while the collection can't be reached.

export type QuestionSet = 'role' | 'behavioral';

export interface InterviewQuestion {
  id: string;
  set: QuestionSet;
  roles: string[];
  skill: string;
  question: string;
  lookFor: string;
  watchOut: string;
  note: string;
  sort: number;
  deleted?: boolean;
  createdBy?: string;
  updatedBy?: string;
}

export type QuestionDraft = Pick<InterviewQuestion, 'set' | 'roles' | 'skill' | 'question' | 'lookFor' | 'watchOut' | 'note'> & { id?: string };

export const DEFAULT_QUESTIONS: InterviewQuestion[] = seed as InterviewQuestion[];

export const QUESTION_LIMITS = { skill: 120, question: 1000, lookFor: 2000, watchOut: 2000, note: 2000 } as const;

const norm = (s: string | undefined) => (s || '').trim().toLowerCase();
const bySort = (a: InterviewQuestion, b: InterviewQuestion) => a.sort - b.sort;

// What to ask this candidate: the questions that list their hiring role, plus
// every behavioral question.
export function questionsFor(all: InterviewQuestion[], roleCategory: string | undefined): { role: InterviewQuestion[]; behavioral: InterviewQuestion[] } {
  const live = all.filter((q) => !q.deleted);
  const want = norm(roleCategory);
  return {
    role: want ? live.filter((q) => q.set === 'role' && q.roles.some((r) => norm(r) === want)).sort(bySort) : [],
    behavioral: live.filter((q) => q.set === 'behavioral').sort(bySort),
  };
}

// The roles a role-specific question can apply to: the known roles plus any
// custom role currently on a candidate or already on a question.
export function rolesInUse(candidates: Pick<Candidate, 'roleCategory'>[], questions: InterviewQuestion[] = []): string[] {
  const seen = new Map<string, string>();
  const add = (r: string | undefined) => { const t = (r || '').trim(); if (t && !seen.has(norm(t))) seen.set(norm(t), t); };
  ROLE_OPTIONS.forEach(add);
  candidates.forEach((c) => add(c.roleCategory));
  questions.forEach((q) => q.roles.forEach(add));
  return [...seen.values()];
}

// What the form checks before it asks the backend (the backend checks again).
export function questionProblem(d: QuestionDraft): string {
  if (!d.question.trim()) return 'Write the question.';
  if (d.question.trim().length > QUESTION_LIMITS.question) return `The question is too long (most ${QUESTION_LIMITS.question} characters).`;
  for (const k of ['skill', 'lookFor', 'watchOut', 'note'] as const) {
    if (d[k].trim().length > QUESTION_LIMITS[k]) return `That text is too long (most ${QUESTION_LIMITS[k]} characters).`;
  }
  if (d.set === 'role' && !d.roles.length) return 'Choose at least one hiring role.';
  return '';
}

// New order after moving one question up or down inside a list (null = can't move).
export function movedIds(ids: string[], id: string, by: -1 | 1): string[] | null {
  const i = ids.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const next = ids.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
