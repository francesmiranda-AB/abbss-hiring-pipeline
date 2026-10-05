import type { AppRole, Candidate, ServerConfig } from './types';
import { latestAssessmentInvite } from './assessments';
import { CLOSED_STAGES, interviewerFor, isClosed, isPaused, stageLabel, type BadgeTone } from './stages';

export const DEFAULT_CONFIG: ServerConfig = { deadlineHours: 24, reminderHours: 12 };

export function isSameLocalDay(iso: string | undefined, ref: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
}
export function isNewApplicant(a: Candidate, now = new Date()): boolean {
  return !!a.createdAt && isSameLocalDay(a.createdAt, now);
}

export type Owner = 'HR' | 'Operations Manager' | 'Project Manager' | 'Client' | 'CEO';
export interface StageTask { key: string; label: string; hint: string; owner: Owner; actionable: boolean; waiting: boolean; nextAction: string }

const OFFER_EMAILS = ['job_offer', 'offer', 'contract'];

// What needs doing for one candidate, and who does it. The next step is worked
// out from the stage plus what has happened (invite sent, time saved, time
// confirmed, offer sent), so it never goes stale and nobody has to maintain it.
// Null once closed or on hold.
export function getStageTask(a: Candidate): StageTask | null {
  if (isClosed(a) || isPaused(a)) return null;
  const stage = a.candidateStage;
  if (!stage) return { key: '', label: 'To do: No stage set', hint: 'Pick a stage', owner: 'HR', actionable: true, waiting: false, nextAction: 'Pick a stage' };
  if (CLOSED_STAGES.includes(stage)) return null;
  const initialOwner = (interviewerFor(a, 'initial') || 'Operations Manager') as Owner;
  let owner: Owner = 'HR';
  let actionable = true;
  let waiting = false;
  let step = '';
  const slots = a.interviewSlots || [];
  switch (stage) {
    case 'New Application': step = 'Screen the CV'; break;
    case 'CV Screening': step = 'Call the candidate'; break;
    case 'HR Preliminary Interview':
      owner = (interviewerFor(a, 'preliminary') || 'HR') as Owner;
      step = 'Hold the HR interview and record the result';
      break;
    case 'Assessment Sent':
      if (latestAssessmentInvite(a.emailsSent)) { step = 'Waiting for their assessments'; actionable = false; waiting = true; }
      else step = 'Send the assessment invite';
      break;
    case 'Assessment Review': step = 'Review the assessment results'; break;
    case 'Initial Interview':
      if (a.confirmedSlot) { owner = initialOwner; step = 'Hold the interview and record the result'; }
      else if (slots.length) { owner = 'Operations Manager'; step = 'Confirm the time on the calendar'; }
      else step = 'Agree an interview time with the candidate';
      break;
    case 'Operations Decision': owner = initialOwner; step = 'Decide: approve, hold or reject'; break;
    case 'Endorsed to Client':
      owner = (interviewerFor(a, 'final') || 'Operations Manager') as Owner;
      step = 'Waiting for their interview and decision'; actionable = false; waiting = true;
      break;
    case 'Offer': step = OFFER_EMAILS.some((k) => a.emailsSent?.[k]) ? 'Follow up on the offer' : 'Send the offer'; break;
    default: step = '';
  }
  return {
    key: stage,
    label: `${actionable ? 'To do' : 'Waiting'}: ${stageLabel(a)}`,
    hint: step,
    owner, actionable, waiting, nextAction: step,
  };
}

// Typical days in each active stage before it counts as overdue.
export const STAGE_SLA_DAYS: Record<string, number> = {
  'New Application': 2, 'CV Screening': 2, 'HR Preliminary Interview': 3, 'Assessment Sent': 1,
  'Assessment Review': 2, 'Initial Interview': 3, 'Operations Decision': 2, 'Endorsed to Client': 5, Offer: 3,
};

export function daysInStage(a: Candidate, now = Date.now()): number | null {
  const at = a.candidateStage && a.candidateStageDates?.[a.candidateStage];
  return at ? Math.round(((now - new Date(at).getTime()) / 86400000) * 10) / 10 : null;
}
export function isStageOverdue(a: Candidate, now = Date.now()): boolean {
  const d = daysInStage(a, now);
  const sla = STAGE_SLA_DAYS[a.candidateStage];
  return d !== null && sla !== undefined && d > sla;
}

export interface SlaStatus { label: string; tone: BadgeTone; pastDeadline: boolean }
// Assessment deadline: the same rule the backend compliance job runs.
export function assessmentDeadline(a: Candidate, config: ServerConfig = DEFAULT_CONFIG, now = Date.now()): SlaStatus | null {
  if (isClosed(a) || isPaused(a)) return null;
  if (a.candidateStage && a.candidateStage !== 'Assessment Sent') return null;
  // The clock runs from the latest assessment invite, as on the server.
  const invitedAt = latestAssessmentInvite(a.emailsSent)?.at;
  if (!invitedAt) return null;
  const hasGrit = a.grit?.score !== '' && a.grit?.score != null;
  const hasValues = a.values?.score !== '' && a.values?.score != null;
  const emmDone = a.requiresEmm ? !!(a.emmReceivedAt || a.emm?.graded) : true;
  if (hasGrit && hasValues && emmDone) return null;
  const { deadlineHours, reminderHours } = config;
  const reminderSent = a.emailsSent?.autoReminder || a.emailsSent?.reminder;
  const elapsed = (now - new Date(invitedAt).getTime()) / 3600000;
  const left = Math.max(0, Math.ceil(deadlineHours - elapsed));
  if (elapsed >= deadlineHours) return { label: 'Past the deadline, will be archived', tone: 'danger', pastDeadline: true };
  if (reminderSent) return { label: `Reminder sent, ${left}h to deadline`, tone: 'warning', pastDeadline: false };
  if (elapsed >= reminderHours) return { label: `${left}h left, reminder going out`, tone: 'warning', pastDeadline: false };
  return { label: `${Math.max(0, Math.ceil(reminderHours - elapsed))}h until auto-reminder`, tone: 'info', pastDeadline: false };
}

export interface Attention { owner: Owner; reason: string; overdue: boolean }
// The one answer to "does someone need to do something with this candidate
// now, and who?" Today, the Candidates chips and the sidebar count all use it.
export function needsAttention(a: Candidate, config: ServerConfig = DEFAULT_CONFIG, now = Date.now()): Attention | null {
  if (isClosed(a) || isPaused(a)) return null;
  const task = getStageTask(a);
  if (!task) return null;
  const sla = assessmentDeadline(a, config, now);
  const overdue = isStageOverdue(a, now) || !!sla?.pastDeadline;
  if (task.actionable) return { owner: task.owner, reason: task.hint, overdue };
  if (overdue) return { owner: task.owner, reason: `Past the expected time in ${a.candidateStage}. Follow up.`, overdue: true };
  return null;
}

export const OWNER_TO_ROLE: Record<Owner, AppRole> = { HR: 'HR', 'Operations Manager': 'Operations', 'Project Manager': 'PM', Client: 'PM', CEO: 'CEO' };

export function needsAttentionFrom(a: Candidate, role: AppRole | null, config: ServerConfig = DEFAULT_CONFIG, now = Date.now()): boolean {
  const n = needsAttention(a, config, now);
  if (!n) return false;
  return !role || OWNER_TO_ROLE[n.owner] === role;
}
