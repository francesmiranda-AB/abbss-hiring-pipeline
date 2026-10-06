import type { Candidate } from './types';
import { CLOSED_STAGES, DEFAULT_NEXT_ACTION_BY_STAGE, REASON_STAGES } from './stages';

// The only rules for where a candidate is and how it ended (the lean-out's
// setOutcome). Screens never set candidateStage / overallStatus / closedReason
// directly; they call applyOutcome and save the result.

export function statusForStage(stage: string, status: string): string {
  if (stage === 'Hired') return status === 'Departed' ? 'Departed' : 'Hired';
  if (REASON_STAGES.includes(stage)) return 'Rejected';
  if (['Hired', 'Rejected', 'Departed'].includes(status)) return 'In Progress'; // reopened
  return status || 'In Progress';
}

export interface OutcomeChange {
  stage?: string;
  status?: string;
  closedReason?: string;
}

export const OUTCOME_FIELDS = ['candidateStage', 'overallStatus', 'closedReason', 'nextAction', 'statusChangedAt'] as const;
export type OutcomeSnapshot = Pick<Candidate, (typeof OUTCOME_FIELDS)[number]>;

export function snapshotOutcome(a: Candidate): OutcomeSnapshot {
  return {
    candidateStage: a.candidateStage || '',
    overallStatus: a.overallStatus || 'In Progress',
    closedReason: a.closedReason || '',
    nextAction: a.nextAction || '',
    statusChangedAt: a.statusChangedAt || '',
  };
}

// Returns the changed fields only (a patch), never mutates `a`.
export function applyOutcome(a: Candidate, change: OutcomeChange, now = new Date()): Partial<Candidate> {
  const prev = snapshotOutcome(a);
  const x: OutcomeSnapshot = { ...prev };
  let status = x.overallStatus;
  if (change.stage !== undefined && change.stage !== x.candidateStage) {
    x.candidateStage = change.stage;
    if (DEFAULT_NEXT_ACTION_BY_STAGE[change.stage] !== undefined) x.nextAction = DEFAULT_NEXT_ACTION_BY_STAGE[change.stage];
    status = statusForStage(change.stage, status);
  }
  if (change.status !== undefined) {
    status = change.status;
    if (status === 'Hired' && x.candidateStage !== 'Hired') { x.candidateStage = 'Hired'; x.nextAction = 'None'; }
    if (status === 'Rejected' && !REASON_STAGES.includes(x.candidateStage)) { x.candidateStage = 'Closed - Rejected'; x.nextAction = 'None'; }
  }
  x.overallStatus = status;
  if (REASON_STAGES.includes(x.candidateStage)) { if (change.closedReason !== undefined) x.closedReason = change.closedReason; }
  else x.closedReason = '';
  if (x.overallStatus !== prev.overallStatus) x.statusChangedAt = now.toISOString();
  const patch: Partial<Candidate> = {};
  for (const k of OUTCOME_FIELDS) if (x[k] !== prev[k]) (patch as Record<string, unknown>)[k] = x[k];
  return patch;
}

// The outcome buttons on a candidate (Outcome section). Returns the change to
// apply, or an error message for moves that are not allowed.
export type Decision = 'Hired' | 'Hold' | 'NonCompliant' | 'Departed' | 'In Progress';
export function decisionChange(a: Candidate, decision: Decision): OutcomeChange | { error: string } {
  if (decision === 'Departed' && a.overallStatus !== 'Hired' && a.overallStatus !== 'Departed') {
    return { error: 'Only a hired candidate can be marked as no longer with us.' };
  }
  // Back to in progress from a closed stage has to leave that stage too.
  if (decision === 'In Progress' && CLOSED_STAGES.includes(a.candidateStage)) {
    return { status: 'In Progress', stage: a.candidateStage === 'Hired' ? 'Offer' : 'Operations Decision' };
  }
  return { status: decision };
}

export const DECISION_LABEL: Record<Decision, string> = {
  Hired: 'Marked as hired', Hold: 'Put on hold', NonCompliant: "Marked as doesn't respond",
  Departed: 'Marked as no longer with us', 'In Progress': 'Back to in progress',
};

// Which outcome actions make sense from the current status.
export function availableDecisions(a: Candidate): Array<Decision | 'Close'> {
  const st = a.overallStatus || 'In Progress';
  if (st === 'In Progress') return ['Hired', 'Close', 'Hold', 'NonCompliant'];
  if (st === 'Hold') return ['In Progress', 'Close'];
  if (st === 'Hired') return ['In Progress', 'Departed'];
  if (st === 'Departed') return ['Hired'];
  return ['In Progress'];
}

export function outcomeText(a: Candidate): string {
  const st = a.overallStatus || 'In Progress';
  if (st === 'Hired') return 'Hired';
  if (st === 'Departed') return 'No longer with us (was hired)';
  if (st === 'Rejected') return (a.candidateStage === 'Closed - Withdrawn' ? 'Closed: withdrew' : 'Closed: rejected') + (a.closedReason ? ` (${a.closedReason})` : '');
  if (st === 'Hold') return 'On hold';
  if (st === 'NonCompliant') return "No reply";
  return 'In progress';
}
