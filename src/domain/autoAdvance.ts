import type { Candidate } from './types';
import { isClosed, isPaused, stageIndex } from './stages';

// Auto-advance on the named stages: forward only, never out of a closed stage,
// never while on hold; every move can be undone. A failed interview or a
// regret email opens the Close dialog instead of closing anyone automatically.

export type AdvanceEvent =
  | 'cvUploaded' | 'assessmentSent' | 'assessmentsSubmitted' | 'interviewScheduled'
  | 'interviewPassed' | 'offerSent' | 'interviewFailed' | 'regretSent';

const TARGETS: Partial<Record<AdvanceEvent, string>> = {
  cvUploaded: 'CV Screening',
  assessmentSent: 'Assessment Sent',
  assessmentsSubmitted: 'Assessment Review',
  interviewScheduled: 'Initial Interview',
  interviewPassed: 'Operations Decision',
  offerSent: 'Offer',
};
// Only from this stage (the rest just need to be earlier than the target).
const ONLY_FROM: Partial<Record<AdvanceEvent, string>> = { assessmentsSubmitted: 'Assessment Sent', interviewPassed: 'Initial Interview' };

export const CLOSE_PROMPT_EVENTS: Partial<Record<AdvanceEvent, { stage: string; reason?: string }>> = {
  interviewFailed: { stage: 'Closed - Rejected', reason: 'Failed Interview' },
  regretSent: { stage: 'Closed - Rejected' },
};

export function emailEventFor(templateKey: string): AdvanceEvent | '' {
  const map: Record<string, AdvanceEvent> = {
    // The interview invitation no longer moves anyone: the move to Initial Interview
    // happens when a time is confirmed on the calendar (interviewScheduled).
    assessment: 'assessmentSent', assessment_no_emm: 'assessmentSent',
    offer: 'offerSent', job_offer: 'offerSent', contract: 'offerSent', regret: 'regretSent',
  };
  return map[templateKey] || '';
}

// The stage this event moves the candidate to, or '' for no move.
export function autoAdvanceTarget(a: Candidate, event: AdvanceEvent | ''): string {
  if (!event || isClosed(a) || isPaused(a)) return '';
  const target = TARGETS[event];
  if (!target) return '';
  const from = ONLY_FROM[event];
  if (from && a.candidateStage !== from) return '';
  if (stageIndex(a.candidateStage) >= stageIndex(target)) return '';
  return target;
}
