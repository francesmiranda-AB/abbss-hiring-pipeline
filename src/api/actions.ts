import { call } from './client';
import type { Candidate, OffboardingCase, RoleHealthOverride, ServerConfig } from '@/domain/types';
import type { InterviewQuestion, QuestionDraft } from '@/domain/interviewQuestions';

// Typed wrappers for every backend action the app uses. Nothing else in the
// app talks to the backend, so moving to a new server later changes only
// this file and client.ts.

export interface Snapshot {
  candidates: Candidate[];
  config: ServerConfig;
  roleHealth: Record<string, RoleHealthOverride>;
  minClientVersion: number;
}

export async function getAll(): Promise<Snapshot> {
  const res = await call<{ data: Candidate[]; config?: ServerConfig; roleHealth?: Record<string, RoleHealthOverride>; minClientVersion?: number }>('getAll');
  return {
    candidates: (res.data || []).map(normalizeCandidate),
    config: { deadlineHours: 24, reminderHours: 12, ...(res.config || {}) },
    roleHealth: res.roleHealth || {},
    minClientVersion: res.minClientVersion || 0,
  };
}

// Sheet cells can come back as numbers or blanks; make the shapes the screens rely on dependable.
function normalizeCandidate(raw: Candidate): Candidate {
  return {
    ...raw,
    id: Number(raw.id),
    name: String(raw.name ?? ''),
    email: String(raw.email ?? ''),
    candidateStage: raw.candidateStage || '',
    overallStatus: raw.overallStatus || 'In Progress',
    grit: raw.grit || { score: '' },
    values: raw.values || { score: '' },
    emm: raw.emm || { graded: false, overallPct: null, pass: null },
    interview: raw.interview || {},
  };
}


// Saves the whole record; `changed` names the fields this save changed, so the
// backend keeps newer values of fields owned by its jobs or other people.
export function saveCandidate(record: Candidate, changed: string[], opts: { undoStage?: boolean } = {}) {
  const data: Record<string, unknown> = { ...record, _changed: changed };
  if (opts.undoStage) data._undoStage = true;
  return call('saveApplicant', { data });
}

export const refreshAssessments = (id: number) =>
  call<{ attached: number; record: Candidate }>('refreshAssessments', { data: { id } }).then((r) => ({ ...r, record: normalizeCandidate(r.record) }));

// `id` lets the server write the CV link onto the candidate's row itself (it survives a lost reply and stale saves).
export const uploadCv = (data: { data: string; filename: string; mimeType: string; id: number }) =>
  call<{ url: string; fileId: string; filename: string }>('uploadCV', { data });

export interface EmailPayload {
  to: string; subject: string; body: string; replyTo?: string; senderName?: string; applicantId?: number; templateKey?: string;
  attachmentBase64?: string; attachmentName?: string; attachmentMimeType?: string;
}
export const sendEmail = (data: EmailPayload) => call('sendEmail', { data });

export const fetchDriveFile = (fileId: string) =>
  call<{ base64: string; filename: string; mimeType: string }>('fetchDriveFile', { data: { fileId } });

export interface UnmatchedSubmission { name: string; email: string; fileUrl: string; timestamp: string }
export const getUnmatchedEmm = () => call<{ unmatched: UnmatchedSubmission[] }>('getUnmatchedEmm').then((r) => r.unmatched || []);

// The backend action keeps its old name; the app calls it the interviewer's calendar.
export const getInterviewerBusy = (start: Date, end: Date) =>
  call<{ blocks: Array<{ start: string; end: string }> }>('getDavidBusy', { start: start.toISOString(), end: end.toISOString() })
    .then((r) => (r.blocks || []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) })));

export const saveInterviewSlots = (id: number, labels: string[], contact: string) =>
  call<{ slots: Array<{ id: string; label: string; startIso?: string }>; schedulingToken: string }>('saveInterviewSlots', { data: { id, labels, contact } });
export const confirmInterview = (data: { id: number; slotId: string; contact: string; startIso: string; durationMin: string }) =>
  call<{ calendarWarning?: string; meetLink?: string; alreadyConfirmed?: boolean }>('confirmInterview', { data });
export const unconfirmInterview = (id: number) => call('unconfirmInterview', { data: { id } });
export const removeInterviewSlot = (id: number, slotId: string) => call('removeInterviewSlot', { data: { id, slotId } });

export const setRoleHealthOverride = (data: { role: string; status?: string; reason?: string; setBy?: string; pmNote?: string }) =>
  call('setRoleHealthOverride', { data });

export const getAllOffboarding = () => call<{ data: OffboardingCase[] }>('getAllOffboarding').then((r) => r.data || []);
export const saveOffboarding = (data: Partial<OffboardingCase>) => call<{ data?: OffboardingCase }>('saveOffboarding', { data });
export const deleteOffboarding = (id: string) => call('deleteOffboarding', { data: { id } });

export const getInterviewQuestions = () => call<{ data?: { questions?: InterviewQuestion[] } }>('getInterviewQuestions').then((r) => r.data?.questions || []);
export const saveInterviewQuestion = (data: QuestionDraft & { by: string }) =>
  call<{ data: { question: InterviewQuestion } }>('saveInterviewQuestion', { data }).then((r) => r.data.question);
export const deleteInterviewQuestion = (id: string, deleted: boolean, by: string) => call('deleteInterviewQuestion', { data: { id, deleted, by } });
export const reorderInterviewQuestions = (ids: string[], by: string) => call('reorderInterviewQuestions', { data: { ids, by } });

export const reportError = (data: { source: string; userNote: string; message: string; stack: string; page: string; role: string; url: string; userAgent: string }) =>
  call('reportError', { data });
