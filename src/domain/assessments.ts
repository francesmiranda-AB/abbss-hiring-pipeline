import type { Candidate } from './types';
import type { BadgeTone } from './stages';

export interface AssessmentOutcome { label: string; tone: BadgeTone; pass: boolean | null; action?: string; questions?: string[] }

const blank = (v: unknown) => v === null || v === undefined || v === '';

// The assessment invite HR last sent decides whether an EMM is expected:
// "Assessment Invite" includes it, "Assessment Invite (no EMM)" does not. Same
// rule as the backend (latestAssessmentInvite_ / emmExpected_).
export function latestAssessmentInvite(emailsSent: Record<string, string> | undefined): { key: 'assessment' | 'assessment_no_emm'; at: string } | null {
  const withEmm = emailsSent?.assessment ? new Date(emailsSent.assessment).getTime() : NaN;
  const noEmm = emailsSent?.assessment_no_emm ? new Date(emailsSent.assessment_no_emm).getTime() : NaN;
  if (isNaN(withEmm) && isNaN(noEmm)) return null;
  if (isNaN(noEmm) || (!isNaN(withEmm) && withEmm > noEmm)) return { key: 'assessment', at: emailsSent!.assessment };
  return { key: 'assessment_no_emm', at: emailsSent!.assessment_no_emm };
}

// Sending an invite sets Requires EMM to match it; other emails leave it alone.
export function requiresEmmAfterSending(key: string): boolean | undefined {
  if (key === 'assessment') return true;
  if (key === 'assessment_no_emm') return false;
  return undefined;
}

// GRIT: 1-5 scale.
export function gritOutcome(score: unknown): AssessmentOutcome {
  if (blank(score)) return { label: 'Not yet scored', tone: 'neutral', pass: null };
  const s = parseFloat(String(score));
  if (s >= 4.0) return { label: 'HIGH GRIT', tone: 'success', pass: true, action: 'Fast-track. Green flag.', questions: [
    "Tell me about the most difficult goal you've pursued long-term. What kept you going?",
    'Describe a time you sustained effort on something with no immediate payoff.',
  ] };
  if (s >= 3.0) return { label: 'MODERATE GRIT', tone: 'warning', pass: true, action: 'Proceed. Ask targeted follow-ups.', questions: [
    'Tell me about a time you wanted to quit. What made you keep going, or stop?',
    'Describe a project that took longer than expected. How did you stay motivated?',
    "What's the biggest setback you've faced at work, and how did you recover?",
  ] };
  return { label: 'LOW GRIT', tone: 'danger', pass: false, action: "Flag: proceed with caution, and only if the role isn't high-pressure.", questions: [
    'Describe a time you gave up on a goal. What led to that decision?',
    'How do you typically respond when a task becomes repetitive or frustrating?',
    'Tell me about a deadline you missed. What happened?',
    'Ask them to walk through their longest-running commitment (job, project, hobby) and what sustained it.',
  ] };
}

export const VALUES_MAX_SCORE = 315;

// Values-Integrity. Same rule as the backend: a 0 means those questions
// weren't answered, not a failing score.
export function valuesOutcome(score: unknown, confScore: unknown, intScore: unknown): AssessmentOutcome {
  if (blank(score)) return { label: 'Not yet scored', tone: 'neutral', pass: null };
  const s = parseFloat(String(score));
  const cf = !blank(confScore) ? parseFloat(String(confScore)) : null;
  const it = !blank(intScore) ? parseFloat(String(intScore)) : null;
  const pct = (s / VALUES_MAX_SCORE) * 100;
  if ((cf !== null && cf > 0 && cf <= 2) || (it !== null && it > 0 && it <= 2)) {
    return { label: 'NOT RECOMMENDED', tone: 'danger', pass: false, action: 'Automatic red flag: Confidentiality or Integrity scored 2 or less. Do not advance.', questions: [
      'Describe a real situation where you had access to confidential company or client data. What did you do with it?',
      "A coworker asks you to share information you know is confidential. Walk me through how you'd handle it.",
    ] };
  }
  if (pct >= 70) return { label: 'STRONG FIT', tone: 'success', pass: true, action: 'Proceed to interview.', questions: [
    'What does integrity mean to you in a workplace setting? Give me a real example.',
    'Tell me about a time you noticed a colleague doing something questionable. What did you do?',
    'How do you handle situations where following the rules conflicts with getting the job done quickly?',
  ] };
  if (pct >= 40) {
    const confIsLower = cf !== null && (it === null || cf <= it);
    const questions = confIsLower
      ? ["Walk me through how you've handled sensitive or confidential information in a past role.",
        "Have you ever been asked to share information you weren't sure you should? What did you do?"]
      : ['Describe a time your integrity was tested at work. What did you do and why?',
        'Tell me about a mistake you made at work and how you handled disclosing it.'];
    return { label: 'POTENTIAL FIT', tone: 'warning', pass: true, action: 'Interview with targeted questions on low-scoring sections.', questions };
  }
  return { label: 'NOT RECOMMENDED', tone: 'danger', pass: false, action: 'Do not advance.', questions: [] };
}

export const gritOf = (a: Candidate) => gritOutcome(a.grit?.score);
export const valuesOf = (a: Candidate) => valuesOutcome(a.values?.score, a.values?.confScore ?? '', a.values?.intScore ?? '');

// Every assessment the candidate owes has arrived (EMM: file received or graded).
// Mirrors backend assessmentsSubmitted_; a test keeps them in step.
export function assessmentsSubmitted(a: Candidate | null | undefined): boolean {
  if (!a) return false;
  const hasGrit = !blank(a.grit?.score);
  const hasValues = !blank(a.values?.score);
  return !!(hasGrit && hasValues && (!a.requiresEmm || a.emmReceivedAt || a.emm?.graded));
}

export function assessmentsAllPassed(a: Candidate): boolean {
  const emmOk = a.requiresEmm ? !!(a.emm?.graded && a.emm.pass === true) : true;
  return gritOf(a).pass === true && valuesOf(a).pass === true && emmOk;
}

export function emmHighRiskFlag(a: Candidate): boolean {
  if (!a.emm?.graded) return false;
  if (typeof a.emm.highRiskFlag === 'boolean') return a.emm.highRiskFlag;
  try {
    const fr = a.emm.fullResult ? JSON.parse(a.emm.fullResult) : null;
    return !!(fr?.flags && fr.flags.some((f: { level: string }) => f.level === 'high'));
  } catch {
    return false;
  }
}

export function emmStatusLabel(a: Candidate): string {
  if (!a.emm?.graded) return a.emmReceivedAt ? 'Submitted, pending grading' : 'Not yet submitted';
  if (a.emm.pass === true) return emmHighRiskFlag(a) ? 'PASS (Flagged for review)' : 'PASS';
  if (a.emm.pass === false) return 'FAIL';
  return 'Pending';
}

export function emmPct(a: Candidate): string {
  const p = a.emm?.overallPct;
  return p !== null && p !== undefined && p !== '' ? `${Math.round(parseFloat(String(p)))}%` : '';
}

export function emmBadge(a: Candidate): { label: string; tone: BadgeTone } {
  if (!a.requiresEmm) return { label: 'Not required', tone: 'neutral' };
  if (a.emm?.graded) {
    const pct = emmPct(a);
    const suffix = pct ? ` ${pct}` : '';
    if (a.emm.pass && emmHighRiskFlag(a)) return { label: `Flagged${suffix}`, tone: 'warning' };
    return a.emm.pass ? { label: `Passed${suffix}`, tone: 'success' } : { label: `Failed${suffix}`, tone: 'danger' };
  }
  if (a.emmReceivedAt) return { label: 'Needs grading', tone: 'primary' };
  return { label: 'Not submitted', tone: 'warning' };
}

// EMM is an AR-specific reconciliation test: AP does not need it.
export function inferRequiresEmm(position: string): boolean {
  const p = (position || '').toLowerCase();
  if (/\bap\b/.test(p) || p.includes('payable')) return false;
  return /\bar\b/.test(p) || p.includes('receivable') || p.includes('refund') || p.includes('reconcil');
}
