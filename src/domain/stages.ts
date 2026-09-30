import type { Candidate } from './types';

// The one stage list (backend CANDIDATE_STAGES must match; a backend test checks).
export const CANDIDATE_STAGES = [
  'New Application', 'CV Screening', 'HR Preliminary Interview', 'Assessment Sent', 'Assessment Review',
  'Initial Interview', 'Operations Decision', 'Endorsed to Client', 'Offer', 'Hired', 'Closed - Rejected', 'Closed - Withdrawn',
] as const;
export type Stage = (typeof CANDIDATE_STAGES)[number];

export const CLOSED_STAGES: readonly string[] = ['Hired', 'Closed - Rejected', 'Closed - Withdrawn'];
export const REASON_STAGES: readonly string[] = ['Closed - Rejected', 'Closed - Withdrawn'];
export const ACTIVE_STAGES = CANDIDATE_STAGES.filter((s) => !CLOSED_STAGES.includes(s));

export const CLOSED_REASON_OPTIONS = ['Failed Assessment', 'Failed Interview', 'Client Declined', 'Salary Mismatch', 'Candidate Withdrew', 'Non-Responsive', 'Other'];

export const NEXT_ACTION_OPTIONS = [
  'Call Candidate', 'Screen CV', 'Schedule HR Preliminary Interview', 'Send Assessment', 'Follow up Candidate', 'Review Assessment',
  'Schedule Initial Interview', 'Awaiting Interview Result', 'Decide Reject/Hold', 'Schedule Client Interview', 'Follow up Client',
  'Send Offer', 'Prepare Contract', 'None',
];

export const DEFAULT_NEXT_ACTION_BY_STAGE: Record<string, string> = {
  'New Application': 'Screen CV', 'CV Screening': 'Call Candidate', 'HR Preliminary Interview': 'Schedule HR Preliminary Interview',
  'Assessment Sent': 'Follow up Candidate', 'Assessment Review': 'Review Assessment',
  'Initial Interview': 'Schedule Initial Interview', 'Operations Decision': 'Decide Reject/Hold', 'Endorsed to Client': 'Follow up Client',
  Offer: 'Send Offer', Hired: 'None', 'Closed - Rejected': 'None', 'Closed - Withdrawn': 'None',
};

export const DEPARTMENTS = ['Operations', 'Sales and Marketing', 'Finance', 'HR', 'IT / Technical Support', 'Other'];
export const SOURCES = ['Seek', 'Indeed', 'Facebook', 'LinkedIn', 'JobStreet', 'Referral', 'Walk-in', 'Other'];

export const ROLE_CONFIG: Record<string, { requiresClientFinal: boolean }> = {
  'AR Specialist': { requiresClientFinal: true },
  'AP Specialist': { requiresClientFinal: true },
  'Refunds Specialist': { requiresClientFinal: true },
  'FP&A Specialist': { requiresClientFinal: false },
};
export const ROLE_OPTIONS = Object.keys(ROLE_CONFIG);

type Conductor = 'HR' | 'Operations Manager' | 'Project Manager' | 'Client' | 'CEO';
const INTERVIEW_ROUNDS_BY_DEPARTMENT: Record<string, { preliminary: Conductor; initial: Conductor; final: Conductor }> = {
  Operations: { preliminary: 'HR', initial: 'Operations Manager', final: 'Client' },
  'Sales and Marketing': { preliminary: 'HR', initial: 'Project Manager', final: 'CEO' },
};
const ROUND_LABEL: Record<Conductor, string> = {
  HR: 'HR Interview', 'Operations Manager': 'Operations Interview', 'Project Manager': 'PM Interview', Client: 'Client Interview', CEO: 'CEO Interview',
};
export type Round = 'preliminary' | 'initial' | 'final';

export function interviewRoundLabel(department: string | undefined, round: Round): string {
  const rounds = INTERVIEW_ROUNDS_BY_DEPARTMENT[department || ''] || INTERVIEW_ROUNDS_BY_DEPARTMENT.Operations;
  return ROUND_LABEL[rounds[round]];
}
// Who conducts a round, from the department. Empty when the department has no set rounds.
export function interviewerFor(a: Pick<Candidate, 'department'>, round: Round): Conductor | '' {
  const rounds = INTERVIEW_ROUNDS_BY_DEPARTMENT[a.department || ''];
  return rounds ? rounds[round] : '';
}

// 'Initial Interview' is one stored value; people read it by department.
export function stageLabel(a: Pick<Candidate, 'candidateStage' | 'department'>): string {
  if (!a.candidateStage) return 'No stage set';
  return a.candidateStage === 'Initial Interview' ? interviewRoundLabel(a.department, 'initial') : a.candidateStage;
}

export type BadgeTone = 'neutral' | 'primary' | 'info' | 'warning' | 'success' | 'danger';
const STAGE_TONE: Record<string, BadgeTone> = {
  'New Application': 'neutral', 'CV Screening': 'neutral', 'HR Preliminary Interview': 'info', 'Assessment Sent': 'primary',
  'Assessment Review': 'primary', 'Initial Interview': 'info', 'Operations Decision': 'warning', 'Endorsed to Client': 'primary',
  Offer: 'success', Hired: 'success', 'Closed - Rejected': 'danger', 'Closed - Withdrawn': 'neutral',
};
export function stageTone(stage: string): BadgeTone {
  return STAGE_TONE[stage] || 'neutral';
}

const CLOSED_STATUSES = ['Hired', 'Rejected', 'NonCompliant', 'Departed', 'Deleted'];
export function isClosed(a: Pick<Candidate, 'candidateStage' | 'overallStatus'> | null | undefined): boolean {
  if (!a) return true;
  return CLOSED_STAGES.includes(a.candidateStage) || CLOSED_STATUSES.includes(a.overallStatus);
}
export function isPaused(a: Pick<Candidate, 'overallStatus'> | null | undefined): boolean {
  return !!a && a.overallStatus === 'Hold';
}
export function isDeleted(a: Pick<Candidate, 'overallStatus'>): boolean {
  return a.overallStatus === 'Deleted';
}

// Operations works only on candidates handed to them: Initial Interview or later.
export function isEndorsedToOperations(a: Pick<Candidate, 'candidateStage'>): boolean {
  const idx = (CANDIDATE_STAGES as readonly string[]).indexOf(a.candidateStage || '');
  return idx >= 0 && idx >= CANDIDATE_STAGES.indexOf('Initial Interview');
}

export function stageIndex(stage: string): number {
  return (CANDIDATE_STAGES as readonly string[]).indexOf(stage);
}

export const STATUS_LABEL: Record<string, string> = {
  'In Progress': 'In progress', Hired: 'Hired', Rejected: 'Rejected', Hold: 'On hold',
  NonCompliant: "Doesn't respond", Departed: 'No longer with us', Deleted: 'Deleted',
};
