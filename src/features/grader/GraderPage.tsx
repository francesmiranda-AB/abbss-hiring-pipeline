import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink, FileCheck2, Printer } from 'lucide-react';
import { fetchDriveFile, getUnmatchedEmm } from '@/api/actions';
import { useCandidates, useUpdateCandidate } from '@/api/queries';
import { assessmentsSubmitted } from '@/domain/assessments';
import { emmRecordFromGrade, gradeWorkbook, type GradeOutcome } from '@/domain/grader';
import type { Candidate } from '@/domain/types';
import { useCandidateActions } from '../candidates/actions';
import { printEmmReport } from './report';
import { GradeResults } from './GradeResults';
import { Button, ErrorAlert, Field, FilePicker, PageHeader, Section, fmtDateTime } from '@/ui/kit';
import { useToast } from '@/ui/toast';

const driveId = (url?: string) => (String(url || '').match(/[-\w]{25,}/) || [''])[0];
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export default function GraderPage() {
  const [params, setParams] = useSearchParams();
  const { candidates } = useCandidates();
  const update = useUpdateCandidate();
  const actions = useCandidateActions();
  const toast = useToast();
  const unmatched = useQuery({ queryKey: ['unmatchedEmm'], queryFn: getUnmatchedEmm, staleTime: 5 * 60_000 });
  const linkedId = params.get('candidate') ? Number(params.get('candidate')) : null;
  const linked = candidates.find((a) => a.id === linkedId) || null;
  const [manualName, setManualName] = useState('');
  const [file, setFile] = useState<{ name: string; data: Uint8Array } | null>(null);
  const [loading, setLoading] = useState('');
  const [outcome, setOutcome] = useState<GradeOutcome | null>(null);
  const [saving, setSaving] = useState(false);
  const [driveBlocked, setDriveBlocked] = useState('');
  const queue = useMemo(() => candidates.filter((a) => a.requiresEmm && a.emmFileUrl && !a.emm?.graded), [candidates]);
  const setLinked = (id: number | null) => setParams((p) => { const n = new URLSearchParams(p); if (id) n.set('candidate', String(id)); else n.delete('candidate'); return n; }, { replace: true });

  const loadFromDrive = async (url: string, label: string, candidateId: number | null) => {
    const id = driveId(url);
    if (!id) { toast.error("Couldn't read the Drive file ID from that link."); return; }
    setLoading(label);
    setDriveBlocked('');
    setOutcome(null);
    setFile(null);
    try {
      const res = await fetchDriveFile(id);
      setFile({ name: res.filename || `${label}.xlsx`, data: base64ToBytes(res.base64) });
      setLinked(candidateId);
      if (candidateId == null) setManualName(label);
    } catch (e) {
      const message = (e as Error).message;
      // The form's upload folder isn't shared with the backend account yet, so
      // this is the common case: say what to do instead of a raw Drive error.
      if (/no item|permission|not found|access/i.test(message)) setDriveBlocked(label);
      else toast.error(`Couldn't load the file from Drive: ${message}`);
    } finally {
      setLoading('');
    }
  };
  // Opened from a candidate ("Open in grader"): load their file straight away.
  useEffect(() => {
    if (!(linked?.emmFileUrl && !file && !loading && !outcome)) return;
    const t = setTimeout(() => { void loadFromDrive(linked.emmFileUrl!, linked.name, linked.id); }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked?.id]);

  const grade = () => {
    if (!file) return;
    try { setOutcome(gradeWorkbook(file.data, file.name)); }
    catch (e) { setOutcome({ parsed: null as never, result: null, error: `Couldn't read that workbook: ${(e as Error).message}` }); }
  };
  const save = async () => {
    if (!outcome?.result || !linked) return;
    setSaving(true);
    const emm = emmRecordFromGrade(outcome.result, linked.emm?.notes);
    const ok = await update(linked.id, { emm });
    setSaving(false);
    if (!ok) return;
    toast.show({ message: `Saved to ${linked.name}: ${outcome.result.rubric.total}/100${outcome.result.highRiskFlag ? ', flagged for review' : ''}` });
    if (assessmentsSubmitted({ ...linked, emm })) void actions.advance(linked.id, 'assessmentsSubmitted');
  };
  const printIt = () => {
    if (!outcome?.result) return;
    const err = printEmmReport({ name: linked?.name || manualName || 'Candidate', position: linked?.position || '', email: linked?.email || '', requiresEmm: true,
      emmReceivedAt: linked?.emmReceivedAt, emm: emmRecordFromGrade(outcome.result, linked?.emm?.notes) });
    if (err) toast.error(err);
  };

  return (
    <div className="app-stack">
      <PageHeader title="EMM grader" lead="Grade an EMM workbook in seconds." />

      {queue.length > 0 && (
        <Section title="Waiting to be graded" lead={`${queue.length} submitted through the form.`}>
          <ul className="ab-rows">{queue.map((a) => <QueueRow key={a.id} a={a} busy={loading === a.name} onGrade={() => loadFromDrive(a.emmFileUrl!, a.name, a.id)} />)}</ul>
        </Section>
      )}
      {!!unmatched.data?.length && (
        <Section title="Submissions that match no candidate" lead="Usually a typo, or a different email than the one on file. Fix the email on the right candidate and they attach on their own.">
          <ul className="ab-rows">
            {unmatched.data.map((u) => (
              <li key={`${u.email}-${u.timestamp}`} className="ab-row">
                <span className="ab-row__title">{u.name || '(no name given)'}</span>
                <span className="ab-row__body">{u.email || 'no email given'}{u.timestamp ? `, submitted ${fmtDateTime(new Date(u.timestamp).toISOString())}` : ''}</span>
                <span className="ab-row__meta">{driveId(u.fileUrl) && <Button size="sm" variant="tonal" onClick={() => loadFromDrive(u.fileUrl, u.name || 'submission', null)}>Grade without a record</Button>}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Grade a workbook">
        {driveBlocked && (
          <div className="ab-alert ab-alert--warning" role="alert">
            <span className="ab-alert__icon" aria-hidden><AlertTriangle size={18} /></span>
            <p className="ab-alert__title">Can't open {driveBlocked}'s upload in Drive</p>
            <div>The app doesn't have access to the folder where the form keeps uploads yet. Download the workbook from the form's response folder, then choose it below.</div>
          </div>
        )}
        <div className="app-form-grid">
          <Field label="Candidate" htmlFor="gr-cand" hint="Link the result to their record to save it.">
            <select id="gr-cand" className="ab-select" value={linked?.id ?? ''} onChange={(e) => setLinked(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Not linked (grade only)</option>
              {[...candidates].filter((a) => a.requiresEmm).sort((x, y) => x.name.localeCompare(y.name)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          {!linked && (
            <Field label="Name on the report" htmlFor="gr-name">
              <input id="gr-name" className="ab-input" value={manualName} onChange={(e) => setManualName(e.target.value)} />
            </Field>
          )}
          <Field label="Workbook (.xlsx)" htmlFor="gr-file" hint={loading ? `Loading ${loading}'s file from Drive` : undefined}>
            <FilePicker id="gr-file" accept=".xlsx" busy={!!loading} fileName={file?.name} onFile={async (f) => {
              if (!f) return;
              setOutcome(null);
              setFile({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) });
            }}>Choose file</FilePicker>
          </Field>
        </div>
        <div className="ab-cluster">
          <Button variant="primary" icon={FileCheck2} disabled={!file} onClick={grade}>Grade</Button>
          {outcome?.result && <Button variant="secondary" busy={saving} disabled={!linked} onClick={save}>Save to {linked ? linked.name : 'record'}</Button>}
          {outcome?.result && <Button variant="ghost" icon={Printer} onClick={printIt}>Print report</Button>}
        </div>
      </Section>

      {outcome?.error && <ErrorAlert title="Couldn't grade this file">{outcome.error}</ErrorAlert>}
      {outcome?.result?.highRiskFlag && (
        <div className="ab-alert ab-alert--warning"><span className="ab-alert__icon" aria-hidden><AlertTriangle size={18} /></span><p className="ab-alert__title">Flagged for review</p><div>A high-severity integrity flag came up. See the Integrity tab before deciding.</div></div>
      )}
      {outcome?.result && <GradeResults g={outcome.result} parsed={outcome.parsed} />}
    </div>
  );
}

function QueueRow({ a, busy, onGrade }: { a: Candidate; busy: boolean; onGrade: () => void }) {
  return (
    <li className="ab-row">
      <span className="ab-row__title">{a.name}</span>
      <span className="ab-row__body">{a.position || 'No position'}{a.emmReceivedAt ? `, submitted ${fmtDateTime(a.emmReceivedAt)}` : ''}</span>
      <span className="ab-row__meta ab-cluster justify-end">
        {/^https?:/.test(a.emmFileUrl || '') && <a className="app-ext" href={a.emmFileUrl} target="_blank" rel="noopener noreferrer">File <ExternalLink size={14} aria-hidden /></a>}
        <Button size="sm" variant="tonal" busy={busy} onClick={onGrade}>Load</Button>
      </span>
    </li>
  );
}
