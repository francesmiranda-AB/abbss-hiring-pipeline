import { useState } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import type { Candidate } from '@/domain/types';
import { DEPARTMENTS, ROLE_CONFIG, ROLE_OPTIONS, SOURCES } from '@/domain/stages';
import { uploadCv } from '@/api/actions';
import { useUpdateCandidate } from '@/api/queries';
import { useCandidateActions } from '../../candidates/actions';
import { Button, Dialog, Field, fmtDate } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { OtherSelect } from '../CandidatePanel';
import { SavingInput, SavingTextarea, Section, fileToBase64 } from './common';

export function OverviewSection({ a, onDeleted }: { a: Candidate; onDeleted: () => void }) {
  const update = useUpdateCandidate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="app-stack">
      <Section title="Details">
        <div className="app-form-grid">
          <SavingInput id={`phone-${a.id}`} label="Phone" value={a.phone} onSave={(v) => update(a.id, { phone: v })} />
          <SavingInput id={`pos-${a.id}`} label="Position" value={a.position} onSave={(v) => update(a.id, { position: v })} />
          <Field label="Department" htmlFor={`dept-${a.id}`}>
            <select id={`dept-${a.id}`} className="ab-select" value={a.department || ''} onChange={(e) => update(a.id, { department: e.target.value })}>
              <option value="">Select department</option>
              {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </Field>
          <OtherSelect id={`src-${a.id}`} label="Source" value={a.source || ''} options={SOURCES.filter((s) => s !== 'Other')} empty="Select source"
            onChange={(v) => update(a.id, { source: v })} />
          <Field label="Date received" htmlFor={`recv-${a.id}`}>
            <input id={`recv-${a.id}`} className="ab-input" type="date" value={(a.dateReceived || '').slice(0, 10)} onChange={(e) => update(a.id, { dateReceived: e.target.value })} />
          </Field>
          <OtherSelect id={`role-${a.id}`} label="Hiring role" value={a.roleCategory || ''} options={ROLE_OPTIONS} empty="Not set"
            hint={a.roleCategory && ROLE_CONFIG[a.roleCategory]?.requiresClientFinal === false
              ? 'This role skips the client stages: the offer follows the Operations decision.'
              : 'Counts them under this role in Hiring projects.'}
            onChange={(v) => update(a.id, { roleCategory: v })} />
          <Field label="Entered by"><span className="app-static">{a.enteredBy || 'Not recorded'}</span></Field>
        </div>
      </Section>
      <Section title="Resume notes">
        <SavingTextarea id={`notes-${a.id}`} label="Notes from the CV" value={a.resumeNotes} onSave={(v) => update(a.id, { resumeNotes: v })} placeholder="Relevant experience and skills" />
      </Section>
      <Section title="CV">
        <CvBlock a={a} />
      </Section>
      <div>
        <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirmDelete(true)}>Delete record</Button>
      </div>
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Delete ${a.name}?`} footer={<>
        <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
        <Button variant="danger" onClick={async () => { setConfirmDelete(false); if (await update(a.id, { overallStatus: 'Deleted' })) onDeleted(); }}>Delete</Button>
      </>}>
        <p className="m-0">The record disappears from every list. The row stays in the Sheet, marked Deleted.</p>
      </Dialog>
    </div>
  );
}

const MAX_CV = 10 * 1024 * 1024;
function CvBlock({ a }: { a: Candidate }) {
  const update = useUpdateCandidate();
  const actions = useCandidateActions();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_CV) { toast.error('That file is over 10 MB. Choose a smaller CV.'); return; }
    setBusy(true);
    try {
      const res = await uploadCv({ data: await fileToBase64(file), filename: file.name, mimeType: file.type || 'application/octet-stream' });
      if (await update(a.id, { cvUrl: res.url, cvFileId: res.fileId, cvFileName: file.name, cvUploadedAt: new Date().toISOString() })) {
        await actions.advance(a.id, 'cvUploaded', `CV uploaded for ${a.name}`);
      }
    } catch (e) {
      toast.error(`CV upload failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="app-file-row">
      {a.cvUrl ? (
        <a href={a.cvUrl} target="_blank" rel="noopener noreferrer" className="app-file-link">
          <FileText size={16} aria-hidden /> {a.cvFileName || 'Open CV'}
          {a.cvUploadedAt && <span className="app-meta">, uploaded {fmtDate(a.cvUploadedAt)}</span>}
        </a>
      ) : <span className="ab-muted">No CV uploaded yet.</span>}
      <label className={`ab-btn ab-btn--tonal ab-btn--sm ${busy ? 'is-busy' : ''}`} aria-busy={busy || undefined}>
        <Upload size={14} aria-hidden /> {a.cvUrl ? 'Replace' : 'Upload CV'}
        <input type="file" accept=".pdf,.doc,.docx" className="ab-visually-hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      <span className="ab-hint">PDF or Word, up to 10 MB.</span>
    </div>
  );
}
