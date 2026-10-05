import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Upload } from 'lucide-react';
import { useCandidates, useUpdateCandidate } from '@/api/queries';
import { uploadCv } from '@/api/actions';
import { useUser } from '@/auth/auth';
import type { Candidate } from '@/domain/types';
import { inferRequiresEmm } from '@/domain/assessments';
import { CSV_IMPORT_FIELD_MAP, CSV_IMPORT_TEMPLATE, downloadText, parseCsv } from '@/domain/csv';
import { DEPARTMENTS, SOURCES } from '@/domain/stages';
import { useCandidateActions } from '../candidates/actions';
import { fileToBase64 } from '../candidate/sections/common';
import { Button, Field, FilePicker, PageHeader, Section } from '@/ui/kit';
import { useToast } from '@/ui/toast';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function newCandidateRecord(f: Partial<Candidate> & { name: string; email: string }, id = Date.now()): Candidate {
  return {
    id, name: f.name, email: f.email, enteredBy: f.enteredBy || '', phone: f.phone || '', position: f.position || '',
    department: f.department || '', dateReceived: f.dateReceived || '', source: f.source || '', resumeNotes: f.resumeNotes || '',
    requiresEmm: f.requiresEmm ?? inferRequiresEmm(f.position || ''), createdAt: new Date().toISOString(),
    candidateStage: 'New Application', nextAction: 'Screen CV', overallStatus: 'In Progress',
    grit: { score: '', outcome: '', notes: '' }, values: { score: '', confScore: '', intScore: '', outcome: '', notes: '' },
    emm: { graded: false, overallPct: null, catPct: null, actPct: null, pass: null, gradedAt: '', notes: '', fullResult: '' },
    interview: { done: false, q1: null, q2: null, q3: null, q4: null, q5: null, notes: '' },
  };
}

export default function NewCandidatePage() {
  return (
    <div className="app-stack">
      <PageHeader title="Add a candidate" lead="New records start at New Application with Screen CV as the next action." />
      <NewForm />
      <ImportCsv />
    </div>
  );
}

function NewForm() {
  const user = useUser();
  const { candidates } = useCandidates();
  const actions = useCandidateActions();
  const update = useUpdateCandidate();
  const navigate = useNavigate();
  const toast = useToast();
  const blank = { name: '', email: '', phone: '', position: '', department: '', dateReceived: '', source: '', sourceOther: '', resumeNotes: '' };
  const [f, setF] = useState(blank);
  const [cv, setCv] = useState<File | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [dupe, setDupe] = useState<Candidate | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const errors = { name: f.name.trim() ? '' : 'Enter the full name.', email: !f.email.trim() ? 'Enter an email address.' : EMAIL_RE.test(f.email.trim()) ? '' : 'Enter a valid email address.' };
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  // A starting guess from the job title; the assessment invite sent later decides.
  const requiresEmm = inferRequiresEmm(f.position);

  const submit = async (force = false) => {
    setTouched({ name: true, email: true });
    if (errors.name) { nameRef.current?.focus(); return; }
    if (errors.email) { emailRef.current?.focus(); return; }
    const email = f.email.trim();
    const existing = candidates.find((a) => a.email.toLowerCase() === email.toLowerCase());
    if (existing && !force) { setDupe(existing); return; }
    setDupe(null);
    setBusy(true);
    const source = f.source === 'Other' && f.sourceOther.trim() ? f.sourceOther.trim() : f.source;
    const record = newCandidateRecord({ name: f.name.trim(), email, phone: f.phone.trim(), position: f.position.trim(), department: f.department,
      dateReceived: f.dateReceived, source, resumeNotes: f.resumeNotes.trim(), enteredBy: user.name, requiresEmm });
    const ok = await actions.createCandidate(record);
    setBusy(false);
    if (!ok) return;
    toast.show({ message: `Added ${record.name}`, action: { label: 'Open', onClick: () => navigate(`/candidates?candidate=${record.id}`) } });
    const file = cv;
    setF(blank); setCv(null); setTouched({});
    if (file) {
      try {
        const res = await uploadCv({ data: await fileToBase64(file), filename: file.name, mimeType: file.type || 'application/octet-stream' });
        if (await update(record.id, { cvUrl: res.url, cvFileId: res.fileId, cvFileName: file.name, cvUploadedAt: new Date().toISOString() })) {
          await actions.advance(record.id, 'cvUploaded', `CV attached for ${record.name}`);
        }
      } catch (e) {
        toast.error(`${record.name} was added, but the CV upload failed (${(e as Error).message}). Attach it from their record.`);
      }
    }
  };

  return (
    <form className="app-card-plain grid gap-4" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <div className="app-form-grid">
        <Field label="Full name" required htmlFor="na-name" error={touched.name ? errors.name : undefined}>
          <input ref={nameRef} id="na-name" className="ab-input" value={f.name} onChange={set('name')} onBlur={() => setTouched({ ...touched, name: true })} aria-invalid={!!(touched.name && errors.name)} autoComplete="off" />
        </Field>
        <Field label="Email address" required htmlFor="na-email" error={touched.email ? errors.email : undefined}>
          <input ref={emailRef} id="na-email" type="email" className="ab-input" value={f.email} onChange={set('email')} onBlur={() => setTouched({ ...touched, email: true })} aria-invalid={!!(touched.email && errors.email)} autoComplete="off" />
        </Field>
        <Field label="Phone" htmlFor="na-phone"><input id="na-phone" className="ab-input" value={f.phone} onChange={set('phone')} placeholder="+63 900 000 0000" /></Field>
        <Field label="Position applied for" htmlFor="na-position"><input id="na-position" className="ab-input" value={f.position} onChange={set('position')} placeholder="AR Specialist" /></Field>
        <Field label="Department" htmlFor="na-dept">
          <select id="na-dept" className="ab-select" value={f.department} onChange={set('department')}>
            <option value="">Select department</option>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Date received" htmlFor="na-date"><input id="na-date" type="date" className="ab-input" value={f.dateReceived} onChange={set('dateReceived')} /></Field>
        <Field label="Source" htmlFor="na-source">
          <select id="na-source" className="ab-select" value={f.source} onChange={set('source')}>
            <option value="">Select source</option>{SOURCES.map((s) => <option key={s}>{s}</option>)}
          </select>
          {f.source === 'Other' && <input className="ab-input" aria-label="Source: please specify" placeholder="Please specify, e.g. Kalibrr" value={f.sourceOther} onChange={set('sourceOther')} />}
        </Field>
      </div>
      <Field label="Resume notes" htmlFor="na-notes">
        <textarea id="na-notes" className="ab-textarea" value={f.resumeNotes} onChange={set('resumeNotes')} placeholder="Relevant experience and skills from the CV" />
      </Field>
      <Field label="CV (optional)" hint="PDF or Word, up to 10 MB." htmlFor="na-cv">
        <FilePicker id="na-cv" accept=".pdf,.doc,.docx" fileName={cv?.name} onFile={(file) => {
          if (file && file.size > 10 * 1024 * 1024) { toast.error('That file is over 10 MB. Choose a smaller CV.'); return; }
          setCv(file);
        }}>Choose CV</FilePicker>
      </Field>
      {dupe && (
        <div className="ab-alert ab-alert--warning" role="alert">
          <p className="ab-alert__title">{dupe.name} already has this email</p>
          <div>{dupe.position || 'No position'}, {dupe.candidateStage || 'no stage'}. Add another record anyway?</div>
          <div className="ab-cluster mt-2">
            <Button size="sm" variant="secondary" onClick={() => submit(true)}>Add anyway</Button>
            <Button size="sm" variant="ghost" onClick={() => navigate(`/candidates?candidate=${dupe.id}&chip=all`)}>Open existing</Button>
          </div>
        </div>
      )}
      <div><Button type="submit" variant="primary" busy={busy}>Add candidate</Button></div>
    </form>
  );
}

function ImportCsv() {
  const user = useUser();
  const { candidates } = useCandidates();
  const actions = useCandidateActions();
  const toast = useToast();
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    const rows = parseCsv(await file.text());
    const known = new Set(candidates.map((a) => a.email.toLowerCase()));
    const dupes: string[] = [];
    let invalid = 0;
    let added = 0;
    const base = Date.now();
    for (const [i, row] of rows.entries()) {
      const fields: Record<string, string> = {};
      for (const [h, v] of Object.entries(row)) { const k = CSV_IMPORT_FIELD_MAP[h.toLowerCase().trim()]; if (k) fields[k] = v; }
      if (!fields.name || !fields.email) { invalid++; continue; }
      if (known.has(fields.email.toLowerCase())) { dupes.push(`${fields.name} (${fields.email})`); continue; }
      known.add(fields.email.toLowerCase());
      if (await actions.createCandidate(newCandidateRecord({ ...fields, name: fields.name, email: fields.email, enteredBy: fields.enteredBy || user.name }, base + i))) added++;
    }
    setBusy(false);
    const parts = [`Imported ${added}.`];
    if (dupes.length) parts.push(`Skipped ${dupes.length} already in the list: ${dupes.slice(0, 5).join(', ')}${dupes.length > 5 ? ', and more' : ''}.`);
    if (invalid) parts.push(`Skipped ${invalid} row(s) without a name or email.`);
    setResult(parts.join(' '));
    toast.show({ message: added ? `Imported ${added} candidate${added === 1 ? '' : 's'}` : 'No new candidates imported', tone: added ? 'success' : 'info' });
  };
  return (
    <Section title="Import from CSV" lead="Name and email are required. Emails already in the list are skipped.">
      <div className="ab-cluster">
        <label className="ab-btn ab-btn--tonal ab-btn--sm" aria-busy={busy || undefined}>
          <Upload size={14} aria-hidden /> Choose CSV file
          <input type="file" accept=".csv,text/csv" className="ab-visually-hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <Button variant="ghost" size="sm" icon={Download} onClick={() => downloadText('ABBSS_Import_Template.csv', CSV_IMPORT_TEMPLATE)}>Download template</Button>
      </div>
      {result && <p className="mt-3" role="status">{result}</p>}
    </Section>
  );
}
