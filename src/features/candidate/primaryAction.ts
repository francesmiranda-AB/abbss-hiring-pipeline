import type { Candidate } from '@/domain/types';
import type { Capabilities } from '@/domain/permissions';
import { getStageTask } from '@/domain/attention';
import { suggestedTemplateFor } from '@/domain/emailTemplates';

export type PanelTab = 'overview' | 'assessments' | 'interview' | 'outcome' | 'activity';

// The one thing to do next, as a button: derived from the same facts as the
// Next step text, and only offered to someone who can do it.
export type PrimaryAction =
  | { kind: 'email'; template: string; label: string }
  | { kind: 'tab'; tab: PanelTab; label: string }
  | { kind: 'calendar'; label: string };

export function primaryActionFor(a: Candidate, caps: Capabilities): PrimaryAction | null {
  const task = getStageTask(a);
  if (!task) return null;
  const slots = a.interviewSlots || [];
  switch (a.candidateStage) {
    case 'Assessment Sent':
      if (!caps.email) return null;
      return task.actionable
        ? { kind: 'email', template: a.requiresEmm ? 'assessment' : 'assessment_no_emm', label: 'Send assessment invite' }
        : { kind: 'email', template: 'reminder', label: 'Send reminder' };
    case 'Assessment Review':
      return caps.assessments || caps.outcome ? { kind: 'tab', tab: 'assessments', label: 'Review assessments' } : null;
    case 'Initial Interview':
      if (a.confirmedSlot) return caps.interview ? { kind: 'tab', tab: 'interview', label: 'Record the result' } : null;
      if (slots.length) return { kind: 'calendar', label: 'Confirm on the calendar' };
      return caps.schedule ? { kind: 'tab', tab: 'interview', label: 'Record interview time' } : null;
    case 'Operations Decision':
      return caps.outcome ? { kind: 'tab', tab: 'outcome', label: 'Decide' } : null;
    case 'Offer':
      return caps.email ? { kind: 'email', template: a.emailsSent?.job_offer ? suggestedTemplateFor(a) : 'job_offer', label: a.emailsSent?.job_offer ? 'Follow up on the offer' : 'Send the job offer' } : null;
    default:
      return null;
  }
}

// Where a Today row should open the record: the tab where the next step happens.
export function tabForNextStep(a: Candidate): PanelTab {
  switch (a.candidateStage) {
    case 'Assessment Review': return 'assessments';
    case 'Initial Interview': return 'interview';
    case 'Operations Decision': return 'outcome';
    default: return 'overview';
  }
}
