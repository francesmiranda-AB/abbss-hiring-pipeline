import { applyOutcome, decisionChange, statusForStage } from './outcome';
import { autoAdvanceTarget, emailEventFor } from './autoAdvance';
import { assessmentDeadline, getStageTask, needsAttention, needsAttentionFrom } from './attention';
import { emmBadge, inferRequiresEmm } from './assessments';
import { fillTemplate, suggestedTemplateFor } from './emailTemplates';
import { parseSlotLabel, slotDate } from './calendar';
import { buildRoleSummary, sourceBreakdown } from './reports';
import { candidatesCsv, parseCsv } from './csv';
import { isClosed, isEndorsedToOperations, stageLabel } from './stages';
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
    expect(emailEventFor('job_offer')).toBe('');
  });
});

describe('needs attention', () => {
  it('actionable stages need attention from their owner', () => {
    const a = cand({ candidateStage: 'Initial Interview', department: 'Operations' });
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
