import type { Candidate, ServerConfig } from './types';
import { emmStatusLabel } from './assessments';
import { REASON_STAGES } from './stages';

// Email templates, moved verbatim from the single-file app. The reminder text
// is not here: it comes from the backend (config.reminderTemplate), the same
// text its compliance job sends.
export const EMAIL_TEMPLATES: Record<string, { subject: string; body: string }> = {
  // Internal: tells the team a candidate is ready for the Ops interview.
  ops_endorsement:{
    subject:'[ABBSS] {name} endorsed to Interview with Ops',
    body:`Hi team,

{name} ({position}{department}) has completed assessments and been endorsed to the Interview (Ops Manager) stage.

GRIT: {grit}
Values: {valuesscore}
{emmsummary}
Please coordinate scheduling the interview.

ABBSS Hiring Pipeline`
  },
  assessment:{
    subject:'[ABBSS] Assessment Invitation: {position}',
    body:`Dear {name},

Thank you for your interest in the {position} role at ABBSS. We are pleased to invite you to complete the next stage of our screening process.

Please complete all of the following assessments and submit them within {deadlinehours} hours of this invitation:

Important: please use this same email address ({email}) when filling out each form below. That's how we match your results back to your application.

1. GRIT Assessment (approx. 5 minutes)
   Link: {gritlink}
   → Your results will be recorded automatically.

2. Value-Integrity Assessment (approx. 10 minutes)
   Link: {valueslink}
   → Your results will be recorded automatically.

3. AR EMM Cognitive Assessment (approx. 30–45 minutes)
   → Please find the blank assessment file attached to this email.
   Task: Please complete the reconciliation exercises within the file, following the instructions provided inside.
   Format: Save your completed file as AR_Assessment_{name}.xlsx.
   Submit here (do not reply to this email with the file): {emmlink}
   Deadline: Please submit the completed file within {deadlinehours} hours of this invitation, or as soon as possible.

We will keep you posted on your status as soon as all assessments have been reviewed. If you have any questions in the meantime, feel free to reach out.

Warm regards,
HR Team
ABBSS`
  },
  interview:{
    subject:'[ABBSS] Interview Invitation: {position}',
    body:`Dear {name},

Congratulations! We are pleased to inform you that you have passed the initial assessment stage for the {position} role at ABBSS.

We would like to invite you to a brief interview. During the interview, we will ask you some questions related to your assessment results and your experience in accounts receivable and data analysis.

Our HR team will call you to agree on a time, and you will get a confirmation email with the details.

We look forward to speaking with you.

Warm regards,
HR Team
ABBSS`
  },
  regret:{
    subject:'[ABBSS] Update on Your Application: {position}',
    body:`Dear {name},

Thank you for taking the time to complete the assessments for the {position} role at ABBSS and for your interest in joining our team.

After careful review, we regret to inform you that we will not be moving forward with your application at this time. This was a competitive process and the decision was not easy.

We encourage you to apply again in the future should a suitable opportunity arise. We wish you all the best in your job search.

Thank you again for your time and effort.

Warm regards,
HR Team
ABBSS`
  },
  assessment_no_emm:{
    subject:'[ABBSS] Assessment Invitation: {position}',
    body:`Dear {name},

Thank you for your interest in the {position} role at ABBSS. We are pleased to invite you to complete the next stage of our screening process.

Please complete all of the following assessments and submit them within {deadlinehours} hours of this invitation:

Important: please use this same email address ({email}) when filling out each form below. That's how we match your results back to your application.

1. GRIT Assessment (approx. 5 minutes)
   Link: {gritlink}
   → Your results will be recorded automatically.

2. Value-Integrity Assessment (approx. 10 minutes)
   Link: {valueslink}
   → Your results will be recorded automatically.

Please complete both forms within {deadlinehours} hours of this invitation. Your results will be recorded automatically once submitted. If you have any questions, feel free to reach out.

We look forward to reviewing your results.

Warm regards,
HR Team
ABBSS`
  },
  offer:{
    subject:'[ABBSS] Next Steps: {position}',
    body:`Dear {name},

Thank you for completing your assessments and interview.

To proceed with your application, please complete both requirements below:

1. COMPLETE THE ATTACHED PRE-ONBOARDING REQUIREMENTS PDF

Open the PDF attached to this email and complete all required technical checks:
- Device specifications
- Internet speed test
- Typing speed test
- Security scan

Important: This is a required step. We cannot proceed with your formal offer and onboarding until the completed requirements are received.

If you cannot see the attachment, please reply to this email immediately so we can resend it.

2. COMPLETE THE APPLICANT INFORMATION SHEET

Applicant Information Sheet: https://forms.gle/WVQK776sX86s2cvA7

You do not need to complete the form again if you have already submitted it.

Once finished, please reply to this email with:
"Completed both requirements."

We will review your submission and follow up regarding your formal offer and onboarding details.

Warm regards,
HR Team
ABBSS`
  },
  job_offer:{
    subject:'[ABBSS] Job Offer: {position}',
    body:`Dear {name},

Congratulations! We are delighted to formally offer you the {position} position at ABBSS, under the following terms:

Job Description: {jd}
Contract Type: {contracttype}
Start Date: {startdate}
Rate: {rate}
Signed by: {signatory}

Please review the details above. Our HR team will follow up shortly with the formal contract for signature. If you have any questions about this offer, feel free to reach out.

We are excited to welcome you to the team!

Warm regards,
{signatory}
ABBSS`
  },
  contract:{
    subject:'[ABBSS] Contract: {position}',
    body:`Dear {name},

Please find below the summary of your engagement terms for the {position} role at ABBSS. A signed copy of this contract should be returned before your start date.

Position: {position}
Job Description: {jd}
Contract Type: {contracttype}
Start Date: {startdate}
Rate: {rate}
Authorized Signatory: {signatory}

Please review these terms carefully and reply to confirm your agreement, or let us know if you have any questions.

Warm regards,
{signatory}
ABBSS`
  },
};

export const EMAIL_TEMPLATE_LABELS: Record<string, string> = {
  assessment: 'Assessment invite (with EMM)',
  assessment_no_emm: 'Assessment invite (no EMM)',
  reminder: 'Assessment reminder',
  interview: 'Interview invitation',
  regret: 'Regret letter',
  offer: 'Next steps / offer',
  job_offer: 'Job offer',
  contract: 'Contract',
};
export const CANDIDATE_TEMPLATE_KEYS = Object.keys(EMAIL_TEMPLATE_LABELS);
export const BULK_TEMPLATE_KEYS = ['assessment', 'assessment_no_emm', 'reminder', 'interview', 'regret'];
export const OFFER_FIELD_TEMPLATES = ['job_offer', 'contract'];

// Which email a candidate most likely needs next, by stage.
export function suggestedTemplateFor(a: Candidate): string {
  const st = a.candidateStage;
  if (REASON_STAGES.includes(st)) return 'regret';
  if (st === 'Assessment Sent') return 'reminder';
  if (st === 'Assessment Review' || st === 'Initial Interview') return 'interview';
  if (st === 'Operations Decision' || st === 'Endorsed to Client') return 'offer';
  if (st === 'Offer') return 'job_offer';
  if (st === 'Hired') return 'contract';
  return a.requiresEmm ? 'assessment' : 'assessment_no_emm';
}

const FORM_LINKS: Record<'grit' | 'values' | 'emm', string> = {
  grit: 'https://forms.gle/JwGGt8UWnR6NgFga8',
  values: 'https://forms.gle/RH5HGDDvPL9H5YvRA',
  emm: 'https://docs.google.com/forms/d/e/1FAIpQLSeJ57uk-2c56I36oKDdog5lh5hcijU-J4g13KZ3mAE2TzQ-uw/viewform',
};

// Routed through the backend so a click counts as "opened the assessment".
export function trackedAssessmentLink(apiUrl: string, id: number | null | undefined, which: 'grit' | 'values' | 'emm'): string {
  return apiUrl && id != null ? `${apiUrl}?action=viewAssessment&id=${encodeURIComponent(id)}&which=${which}` : FORM_LINKS[which];
}

export interface FillContext { apiUrl: string; config: ServerConfig }
export type TemplateRecord = Pick<Candidate, 'name' | 'position' | 'email' | 'requiresEmm' | 'department' | 'offerDetails' | 'grit' | 'values' | 'emm' | 'emmReceivedAt'> & { id?: number | null };

export function getTemplate(key: string, config: ServerConfig): { subject: string; body: string } | null {
  if (key === 'reminder') return config.reminderTemplate || { subject: '', body: '(The reminder text loads from the backend. Reload and try again.)' };
  return EMAIL_TEMPLATES[key] || null;
}

export function fillTemplate(key: string, a: TemplateRecord, ctx: FillContext): { subject: string; body: string } {
  const t = getTemplate(key, ctx.config);
  if (!t) return { subject: '', body: '' };
  const od = a.offerDetails || {};
  const emmLink = trackedAssessmentLink(ctx.apiUrl, a.id, 'emm');
  const values: Record<string, string> = {
    name: a.name || '{name}', position: a.position || '{position}', email: a.email || '[EMAIL ADDRESS]',
    jd: od.jd || '[JOB DESCRIPTION]', startdate: od.startDate || '[START DATE]', signatory: od.signatory || '[SIGNATORY]',
    contracttype: od.contractType || '[CONTRACT TYPE]', rate: od.rate || '[RATE]',
    gritlink: trackedAssessmentLink(ctx.apiUrl, a.id, 'grit'), valueslink: trackedAssessmentLink(ctx.apiUrl, a.id, 'values'), emmlink: emmLink,
    emmline: a.requiresEmm ? `• Completed EMM Excel assessment, submit here: ${emmLink}\n` : '',
    deadlinehours: String(ctx.config.deadlineHours),
    department: a.department ? ` — ${a.department}` : '',
    grit: a.grit?.score ? `${a.grit.score}/5` : 'N/A',
    valuesscore: a.values?.score ? `${a.values.score}/315` : 'N/A',
    emmsummary: a.requiresEmm
      ? `EMM: ${a.emm?.graded ? `${emmStatusLabel(a as Candidate)} (${a.emm.overallPct}%)` : a.emmReceivedAt ? 'Submitted, pending grading' : 'Not yet submitted'}\n`
      : '',
  };
  const fill = (s: string) => String(s || '').replace(/\{([a-z]+)\}/g, (m, k: string) => (values[k] !== undefined ? values[k] : m));
  return { subject: fill(t.subject), body: fill(t.body) };
}

// Files attached to specific emails (served from /files).
export const EMAIL_ATTACHMENTS: Record<string, { path: string; name: string; mimeType: string }> = {
  assessment: { path: '/files/MS_AR_EMM_Assessment_blank.xlsx', name: 'MS_AR_EMM_Assessment_blank.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  offer: { path: '/files/Pre-Onboarding Requirements.pdf', name: 'Pre-Onboarding Requirements.pdf', mimeType: 'application/pdf' },
};
