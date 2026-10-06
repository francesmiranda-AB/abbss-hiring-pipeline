import type { Candidate } from './types';
import { emmStatusLabel, gritOf, valuesOf } from './assessments';
import { EMAIL_TEMPLATE_LABELS } from './emailTemplates';

export function toCsv(headers: string[], rows: unknown[][]): string {
  const cell = (v: unknown) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\n');
}

export function downloadText(filename: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function lastEmailSent(a: Candidate): { label: string; date: string; key: string } | null {
  let key = '';
  let latest = 0;
  for (const [k, v] of Object.entries(a.emailsSent || {})) {
    const t = v ? new Date(v).getTime() : 0;
    if (t > latest) { latest = t; key = k; }
  }
  return key ? { label: EMAIL_TEMPLATE_LABELS[key] || (key === 'autoReminder' ? 'Automatic reminder' : key), date: a.emailsSent![key], key } : null;
}

const HEADERS = ['Name', 'Email', 'Phone', 'Position', 'Department', 'Role', 'Source', 'Date Received', 'Candidate Stage', 'Status',
  'Closed Reason', 'Next Action', 'GRIT Score', 'GRIT Outcome', 'Values Score', 'Values Outcome', 'EMM Score', 'EMM Result',
  'Interview Result', 'Last Email Sent', 'Decision Notes'];

// The one candidate CSV: the list (what's shown), bulk (what's selected) and Board.
export function candidatesCsv(apps: Candidate[]): string {
  const rows = apps.map((a) => {
    const last = lastEmailSent(a);
    return [
      a.name, a.email, a.phone || '', a.position || '', a.department || '', a.roleCategory || '', a.source || '', a.dateReceived || '',
      a.candidateStage || 'No stage set', a.overallStatus || 'In Progress', a.closedReason || '', a.nextAction || '',
      a.grit?.score || '', a.grit?.score ? gritOf(a).label : 'Pending',
      a.values?.score || '', a.values?.score ? valuesOf(a).label : 'Pending',
      a.emm?.graded ? a.emm.overallPct : '', emmStatusLabel(a),
      a.interview?.result ? (a.interview.result === 'pass' ? 'Pass' : 'Fail') : 'Not yet done',
      last ? `${last.label} on ${new Date(last.date).toLocaleDateString()}` : 'Not sent',
      a.decisionNotes || '',
    ];
  });
  return toCsv(HEADERS, rows);
}

export const todayStamp = () => new Date().toISOString().slice(0, 10);

// CSV import: parse with quoted fields; headers matched case-insensitively.
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== '');
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] || '').trim()]));
  });
}

export const CSV_IMPORT_FIELD_MAP: Record<string, string> = {
  name: 'name', 'full name': 'name', email: 'email', 'email address': 'email', phone: 'phone', 'phone number': 'phone',
  position: 'position', 'position applied for': 'position', department: 'department', source: 'source',
  'date received': 'dateReceived', datereceived: 'dateReceived', 'resume notes': 'resumeNotes', notes: 'resumeNotes', 'entered by': 'enteredBy',
};

export const CSV_IMPORT_TEMPLATE = 'Name,Email,Phone,Position,Department,Source,Date Received,Resume Notes\n'
  + '"Sample Candidate","candidate@example.com","+63 900 000 0000","AR Specialist","Operations","Referral","2026-01-15","Experience noted from the CV"\n';
