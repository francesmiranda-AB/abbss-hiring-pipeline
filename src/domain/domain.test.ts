import { applyOutcome, decisionChange, statusForStage } from './outcome';
import { autoAdvanceTarget, emailEventFor } from './autoAdvance';
import { assessmentDeadline, getStageTask, needsAttention, needsAttentionFrom } from './attention';
import { emmBadge, inferRequiresEmm, latestAssessmentInvite, requiresEmmAfterSending } from './assessments';
import { fillTemplate, suggestedTemplateFor } from './emailTemplates';
import { parseSlotLabel, slotDate } from './calendar';
import { buildRoleSummary, sourceBreakdown } from './reports';
import { candidatesCsv, parseCsv } from './csv';
import { CANDIDATE_STAGES, isClosed, isEndorsedToOperations, stageLabel, stageLabelFor, stageName, stagePhase } from './stages';
import { can, capabilities, ownsStage } from './permissions';
import { DEFAULT_QUESTIONS, movedIds, questionProblem, questionsFor, rolesInUse, type InterviewQuestion } from './interviewQuestions';
import type { Candidate } from './types';

const HOUR = 3600000;
const now = new Date('2026-09-29T09:00:00');
function cand(over: Partial<Candidate> = {}): Candidate {
  return {
    id: 1, name: 'Test Candidate', email: 't@example.com', requiresEmm: false, overallStatus: 'In Progress',
    candidateStage: 'New Application', grit: { score: '' }, values: { score: '' },
    emm: { graded: false, overallPct: null, pass: null }, interview: {}, ...over,
  };
}

describe('outcomes', () => {
  it('closing needs the matching status and keeps the reason', () => {
    const p = applyOutcome(cand({ candidateStage: 'Initial Interview' }), { stage: 'Closed - Rejected', closedReason: 'Failed Interview' }, now);
    expect(p).toMatchObject({ candidateStage: 'Closed - Rejected', overallStatus: 'Rejected', closedReason: 'Failed Interview', nextAction: 'None' });
    expect(p.statusChangedAt).toBe(now.toISOString());
  });
  it('marking hired moves the stage to Hired', () => {
    expect(applyOutcome(cand({ candidateStage: 'Offer' }), { status: 'Hired' })).toMatchObject({ candidateStage: 'Hired', overallStatus: 'Hired' });
  });
  it('reopening leaves a closed stage and clears the reason', () => {
    const closed = cand({ candidateStage: 'Closed - Rejected', overallStatus: 'Rejected', closedReason: 'Other' });
    const ch = decisionChange(closed, 'In Progress');
    expect(ch).toEqual({ status: 'In Progress', stage: 'Operations Decision' });
    expect(applyOutcome(closed, ch as { status: string; stage: string })).toMatchObject({ candidateStage: 'Operations Decision', overallStatus: 'In Progress', closedReason: '' });
  });
  it('hold keeps the stage', () => {
    expect(applyOutcome(cand({ candidateStage: 'Assessment Review' }), { status: 'Hold' })).toEqual({ overallStatus: 'Hold', statusChangedAt: expect.any(String) });
  });
  it('departed only from hired', () => {
    expect(decisionChange(cand(), 'Departed')).toHaveProperty('error');
    expect(decisionChange(cand({ overallStatus: 'Hired', candidateStage: 'Hired' }), 'Departed')).toEqual({ status: 'Departed' });
    expect(statusForStage('Hired', 'Departed')).toBe('Departed');
  });
  it('a no-op change returns an empty patch', () => {
    expect(applyOutcome(cand(), { stage: 'New Application' })).toEqual({});
  });
});

describe('auto-advance', () => {
  it('moves forward only', () => {
    expect(autoAdvanceTarget(cand({ candidateStage: 'CV Screening' }), 'assessmentSent')).toBe('Assessment Sent');
    expect(autoAdvanceTarget(cand({ candidateStage: 'Offer' }), 'assessmentSent')).toBe('');
  });
  it('never on closed or paused candidates', () => {
    expect(autoAdvanceTarget(cand({ overallStatus: 'Hold', candidateStage: 'CV Screening' }), 'assessmentSent')).toBe('');
    expect(autoAdvanceTarget(cand({ overallStatus: 'Deleted' }), 'cvUploaded')).toBe('');
  });
  it('some events only move from one stage', () => {
    expect(autoAdvanceTarget(cand({ candidateStage: 'Assessment Sent' }), 'assessmentsSubmitted')).toBe('Assessment Review');
    expect(autoAdvanceTarget(cand({ candidateStage: 'CV Screening' }), 'assessmentsSubmitted')).toBe('');
    expect(autoAdvanceTarget(cand({ candidateStage: 'Initial Interview' }), 'interviewPassed')).toBe('Operations Decision');
  });
  it('maps emails to events', () => {
    expect(emailEventFor('assessment_no_emm')).toBe('assessmentSent');
    expect(emailEventFor('regret')).toBe('regretSent');
    expect(emailEventFor('job_offer')).toBe('offerSent');
    expect(emailEventFor('interview')).toBe('');
  });
});

describe('needs attention', () => {
  it('actionable stages need attention from their owner', () => {
    const a = cand({ candidateStage: 'Initial Interview', department: 'Operations', confirmedSlot: { id: 's', label: 'Mon, Oct 5 - 2:00 PM' } });
    expect(getStageTask(a)?.owner).toBe('Operations Manager');
    expect(needsAttentionFrom(a, 'Operations')).toBe(true);
    expect(needsAttentionFrom(a, 'HR')).toBe(false);
    expect(stageLabel(a)).toBe('Operations Interview');
  });
  it('waiting stages only after they run late', () => {
    const invited = new Date(now.getTime() - 2 * HOUR).toISOString();
    const a = cand({ candidateStage: 'Assessment Sent', emailsSent: { assessment_no_emm: invited }, candidateStageDates: { 'Assessment Sent': invited } });
    expect(needsAttention(a, undefined, now.getTime())).toBeNull();
    const late = new Date(now.getTime() - 30 * HOUR).toISOString();
    const b = { ...a, emailsSent: { assessment_no_emm: late }, candidateStageDates: { 'Assessment Sent': late } };
    expect(needsAttention(b, undefined, now.getTime())).toMatchObject({ overdue: true, owner: 'HR' });
  });
  it('the assessment deadline follows the 12h / 24h config', () => {
    const at = (h: number) => cand({ candidateStage: 'Assessment Sent', emailsSent: { assessment: new Date(now.getTime() - h * HOUR).toISOString() } });
    expect(assessmentDeadline(at(2), undefined, now.getTime())?.label).toBe('10h until auto-reminder');
    expect(assessmentDeadline(at(13), undefined, now.getTime())?.label).toBe('11h left, reminder going out');
    expect(assessmentDeadline(at(25), undefined, now.getTime())?.pastDeadline).toBe(true);
  });
  it('closed and deleted candidates never need attention', () => {
    expect(isClosed(cand({ overallStatus: 'Deleted' }))).toBe(true);
    expect(needsAttention(cand({ overallStatus: 'Departed' }))).toBeNull();
  });
});

describe('assessments and email', () => {
  it('EMM only for AR-type roles', () => {
    expect(inferRequiresEmm('AR Specialist')).toBe(true);
    expect(inferRequiresEmm('AP Specialist')).toBe(false);
    expect(inferRequiresEmm('Refunds Specialist')).toBe(true);
  });
  it('the latest assessment invite decides whether an EMM is expected', () => {
    expect(latestAssessmentInvite({})).toBeNull();
    expect(latestAssessmentInvite({ assessment: '2026-09-01T00:00:00Z', assessment_no_emm: '2026-09-02T00:00:00Z' })?.key).toBe('assessment_no_emm');
    expect(latestAssessmentInvite({ assessment: '2026-09-03T00:00:00Z', assessment_no_emm: '2026-09-02T00:00:00Z' })?.key).toBe('assessment');
    expect(requiresEmmAfterSending('assessment_no_emm')).toBe(false);
    expect(requiresEmmAfterSending('assessment')).toBe(true);
    expect(requiresEmmAfterSending('regret')).toBeUndefined();
  });
  it('the assessment deadline counts from the latest invite', () => {
    const old = new Date(now.getTime() - 30 * HOUR).toISOString();
    const recent = new Date(now.getTime() - 2 * HOUR).toISOString();
    const a = cand({ candidateStage: 'Assessment Sent', emailsSent: { assessment: old, assessment_no_emm: recent } });
    expect(assessmentDeadline(a, undefined, now.getTime())?.pastDeadline).toBe(false);
  });
  it('EMM badge text has no emoji', () => {
    const a = cand({ requiresEmm: true, emm: { graded: true, overallPct: 81, pass: true, highRiskFlag: false } });
    expect(emmBadge(a)).toEqual({ label: 'Passed 81%', tone: 'success' });
  });
  it('fills a template with tracked links and the deadline', () => {
    const a = cand({ id: 7, name: 'Ana', position: 'AR Specialist', requiresEmm: true });
    const { subject, body } = fillTemplate('assessment', a, { apiUrl: 'https://api.example/exec', config: { deadlineHours: 24, reminderHours: 12 } });
    expect(subject).toBe('[ABBSS] Assessment Invitation: AR Specialist');
    expect(body).toContain('within 24 hours');
    expect(body).toContain('https://api.example/exec?action=viewAssessment&id=7&which=grit');
    expect(body).not.toContain('{');
  });
  it('suggests the next email by stage', () => {
    expect(suggestedTemplateFor(cand({ candidateStage: 'Assessment Sent' }))).toBe('reminder');
    expect(suggestedTemplateFor(cand({ candidateStage: 'Closed - Rejected' }))).toBe('regret');
  });
});

describe('calendar, reports, csv', () => {
  it('parses slot labels without a year', () => {
    expect(parseSlotLabel('Mon, Oct 5 - 2:00 PM', now)?.getFullYear()).toBe(2026);
    expect(parseSlotLabel('Thu, Jan 7 - 10:00 AM', new Date('2026-12-20'))?.getFullYear()).toBe(2027);
  });
  it('reads the way HR types times', () => {
    const at = (label: string) => parseSlotLabel(label, now)?.toString().slice(4, 21);
    expect(at('Sept 3 9pm onwards')).toBe('Sep 03 2026 21:00'); // under a month ago: this year
    expect(at('Aug 11 - 8pm')).toBe('Aug 11 2027 20:00'); // over a month ago with no year: next year
    expect(at('Aug 26 2026 - 2pm')).toBe('Aug 26 2026 14:00');
    expect(at('Mon, Oct 5 - 2:00 PM')).toBe('Oct 05 2026 14:00');
    expect(at('Tuesday 10am')).toBeUndefined();
  });
  it('uses the confirmed date only when it came from the date picker', () => {
    const s = { id: 's', label: 'Mon, Oct 5 - 2:00 PM' };
    expect(slotDate(s, { ...s, startIso: '2026-10-05T06:30:00.000Z', durationMin: 60 })?.toISOString()).toBe('2026-10-05T06:30:00.000Z');
    expect(slotDate(s, { ...s, startIso: '2001-10-05T06:30:00.000Z' }, now)?.getFullYear()).toBe(2026);
  });
  it('summarises roles and sources', () => {
    const apps = [cand({ roleCategory: 'AR Specialist' }), cand({ id: 2, roleCategory: 'AR Specialist', overallStatus: 'Hired', candidateStage: 'Hired', source: 'Referral' })];
    const s = buildRoleSummary(apps, {}, now)['AR Specialist'];
    expect(s.activeCandidates).toBe(1);
    expect(s.health.status).toBe('yellow');
    const referral = sourceBreakdown(apps).find((r) => r.source === 'Referral');
    expect(referral).toMatchObject({ total: 1, hired: 1, passRate: 100 });
  });
  it('CSV keeps commas and quotes in notes', () => {
    const csv = candidatesCsv([cand({ decisionNotes: 'Good, "strong" fit' })]);
    expect(csv.split('\n')[1]).toContain('"Good, ""strong"" fit"');
    expect(parseCsv('Name,Email\n"A, B",a@x\n')).toEqual([{ Name: 'A, B', Email: 'a@x' }]);
  });
  it('Operations sees Initial Interview onwards', () => {
    expect(isEndorsedToOperations(cand({ candidateStage: 'Assessment Review' }))).toBe(false);
    expect(isEndorsedToOperations(cand({ candidateStage: 'Offer' }))).toBe(true);
  });
});

describe('what each role may do', () => {
  const slot = { id: 's', label: 'Mon, Oct 5 - 2:00 PM' };
  const sales = cand({ candidateStage: 'Initial Interview', department: 'Sales and Marketing', confirmedSlot: slot });
  const ops = cand({ candidateStage: 'Initial Interview', department: 'Operations', confirmedSlot: slot });
  it('HR can do everything', () => {
    expect(Object.values(capabilities('HR')).every(Boolean)).toBe(true);
  });
  it('Operations decides and records interviews, but does not email, grade, delete, export or bulk-edit', () => {
    expect(can('Operations', 'stage')).toBe(true);
    expect(can('Operations', 'interview')).toBe(true);
    expect(can('Operations', 'outcome')).toBe(true);
    for (const cap of ['email', 'grader', 'delete', 'bulk', 'export', 'details', 'schedule'] as const) expect(can('Operations', cap)).toBe(false);
  });
  it('PM and CEO edit only where the current stage is theirs', () => {
    expect(ownsStage(sales, 'PM')).toBe(true);
    expect(can('PM', 'interview', sales)).toBe(true);
    expect(can('PM', 'interview', ops)).toBe(false);
    expect(can('PM', 'outcome', ops)).toBe(false);
    expect(can('PM', 'export', sales)).toBe(false);
    expect(can('CEO', 'stage', sales)).toBe(false);
  });
  it('only HR and Operations change the interview question collections, whatever the candidate', () => {
    expect(can('HR', 'questions')).toBe(true);
    expect(can('Operations', 'questions')).toBe(true);
    expect(can('PM', 'questions', sales)).toBe(false);
    expect(can('CEO', 'questions', sales)).toBe(false);
  });
});

describe('interview questions', () => {
  const q = (over: Partial<InterviewQuestion>): InterviewQuestion => ({ id: 'x', set: 'role', roles: ['AR Specialist'], skill: '', question: 'Q', lookFor: '', watchOut: '', note: '', sort: 1, ...over });
  it('the built-in questions are five AR role questions and two behavioral ones', () => {
    expect(DEFAULT_QUESTIONS.filter((x) => x.set === 'role')).toHaveLength(5);
    expect(DEFAULT_QUESTIONS.filter((x) => x.set === 'behavioral')).toHaveLength(2);
    expect(DEFAULT_QUESTIONS.every((x) => x.set === 'behavioral' ? x.roles.length === 0 : x.roles.length > 0)).toBe(true);
  });
  it('an AR candidate gets the AR questions and the behavioral ones; an AP candidate only the behavioral ones', () => {
    const ar = questionsFor(DEFAULT_QUESTIONS, 'AR Specialist');
    expect(ar.role).toHaveLength(5);
    expect(ar.behavioral).toHaveLength(2);
    const ap = questionsFor(DEFAULT_QUESTIONS, 'AP Specialist');
    expect(ap.role).toHaveLength(0);
    expect(ap.behavioral).toHaveLength(2);
  });
  it('a question listing several roles shows for each; matching ignores case and spaces', () => {
    const all = [q({ id: 'a', roles: ['AR Specialist', 'Refunds Specialist'] })];
    expect(questionsFor(all, ' refunds specialist ').role.map((x) => x.id)).toEqual(['a']);
    expect(questionsFor(all, 'AP Specialist').role).toEqual([]);
  });
  it('no hiring role means no role questions, and deleted ones never show', () => {
    expect(questionsFor(DEFAULT_QUESTIONS, undefined).role).toEqual([]);
    expect(questionsFor(DEFAULT_QUESTIONS, '').behavioral).toHaveLength(2);
    expect(questionsFor([q({ id: 'gone', deleted: true })], 'AR Specialist').role).toEqual([]);
  });
  it('questions come back in their saved order', () => {
    const all = [q({ id: 'b', sort: 2 }), q({ id: 'a', sort: 1 }), q({ id: 'c', sort: 3 })];
    expect(questionsFor(all, 'AR Specialist').role.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
  it('the roles to pick from are the known roles plus custom ones in use', () => {
    const roles = rolesInUse([{ roleCategory: 'Payroll Specialist' }, { roleCategory: 'ar specialist' }, { roleCategory: undefined }], [q({ roles: ['Billing Clerk'] })]);
    expect(roles).toContain('AR Specialist');
    expect(roles).toContain('Payroll Specialist');
    expect(roles).toContain('Billing Clerk');
    expect(roles.filter((r) => r.toLowerCase() === 'ar specialist')).toHaveLength(1);
  });
  it('the form refuses an empty question, a role question without roles, and too much text', () => {
    const ok = { set: 'role' as const, roles: ['AR Specialist'], skill: '', question: 'Why?', lookFor: '', watchOut: '', note: '' };
    expect(questionProblem(ok)).toBe('');
    expect(questionProblem({ ...ok, question: '  ' })).toMatch(/Write the question/);
    expect(questionProblem({ ...ok, roles: [] })).toMatch(/hiring role/);
    expect(questionProblem({ ...ok, set: 'behavioral', roles: [] })).toBe('');
    expect(questionProblem({ ...ok, question: 'x'.repeat(1001) })).toMatch(/too long/);
  });
  it('moving a question swaps it with its neighbour and stops at the ends', () => {
    expect(movedIds(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(movedIds(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(movedIds(['a', 'b', 'c'], 'a', -1)).toBeNull();
    expect(movedIds(['a', 'b', 'c'], 'c', 1)).toBeNull();
    expect(movedIds(['a'], 'zzz', 1)).toBeNull();
  });
});

describe('the next step comes from what has happened', () => {
  const slot = { id: 's', label: 'Mon, Oct 5 - 2:00 PM' };
  it('Assessment Sent: send the invite first, then wait', () => {
    const noInvite = cand({ candidateStage: 'Assessment Sent' });
    expect(getStageTask(noInvite)).toMatchObject({ nextAction: 'Send the assessment invite', owner: 'HR', actionable: true });
    const invited = cand({ candidateStage: 'Assessment Sent', emailsSent: { assessment_no_emm: now.toISOString() } });
    expect(getStageTask(invited)).toMatchObject({ nextAction: 'Waiting for their assessments', actionable: false, waiting: true });
  });
  it('Initial Interview passes from HR, to Operations, to the interviewer as the time is agreed', () => {
    const dept = 'Sales and Marketing';
    expect(getStageTask(cand({ candidateStage: 'Initial Interview', department: dept }))).toMatchObject({ owner: 'HR', nextAction: 'Agree an interview time with the candidate' });
    expect(getStageTask(cand({ candidateStage: 'Initial Interview', department: dept, interviewSlots: [slot] }))).toMatchObject({ owner: 'Operations Manager', nextAction: 'Confirm the time on the calendar' });
    expect(getStageTask(cand({ candidateStage: 'Initial Interview', department: dept, interviewSlots: [slot], confirmedSlot: slot }))).toMatchObject({ owner: 'Project Manager', nextAction: 'Hold the interview and record the result' });
  });
  it('Offer: send it, then follow up', () => {
    expect(getStageTask(cand({ candidateStage: 'Offer' }))?.nextAction).toBe('Send the offer');
    expect(getStageTask(cand({ candidateStage: 'Offer', emailsSent: { job_offer: now.toISOString() } }))?.nextAction).toBe('Follow up on the offer');
  });
  it('nothing for closed or paused candidates', () => {
    expect(getStageTask(cand({ candidateStage: 'Hired', overallStatus: 'Hired' }))).toBeNull();
    expect(getStageTask(cand({ candidateStage: 'Offer', overallStatus: 'Hold' }))).toBeNull();
  });
});

describe('stage phases', () => {
  it('every stored stage has a phase, in pipeline order', () => {
    const order = ['intake', 'assess', 'interview', 'decide', 'offer', 'closed'];
    const seen = CANDIDATE_STAGES.map((s) => order.indexOf(stagePhase(s)));
    expect(seen.every((i) => i >= 0)).toBe(true);
    expect([...seen].sort((x, y) => x - y)).toEqual(seen);
  });
  it('an unknown or empty stage counts as intake', () => {
    expect(stagePhase('')).toBe('intake');
    expect(stagePhase('Closed - Rejected')).toBe('closed');
    expect(stagePhase('Hired')).toBe('offer');
  });
});

describe('stage names by department', () => {
  it('Sales and Marketing reads its own decision-makers', () => {
    expect(stageLabelFor('Initial Interview', 'Sales and Marketing')).toBe('PM Interview');
    expect(stageLabelFor('Operations Decision', 'Sales and Marketing')).toBe('PM Decision');
    expect(stageLabelFor('Endorsed to Client', 'Sales and Marketing')).toBe('With the CEO');
  });
  it('Operations keeps its own', () => {
    expect(stageLabelFor('Initial Interview', 'Operations')).toBe('Operations Interview');
    expect(stageLabelFor('Operations Decision', 'Operations')).toBe('Operations Decision');
    expect(stageLabelFor('Endorsed to Client', 'Operations')).toBe('Endorsed to Client');
    expect(stageLabelFor('CV Screening', 'Operations')).toBe('CV Screening');
  });
  it('lists that mix departments use neutral names', () => {
    expect(stageName('Operations Decision')).toBe('Decision');
    expect(stageName('Closed - Rejected')).toBe('Rejected');
  });
});
