import { useState } from 'react';
import { Download, Mail, Trash2, X } from 'lucide-react';
import type { Candidate } from '@/domain/types';
import { CANDIDATE_STAGES, REASON_STAGES, stageName } from '@/domain/stages';
import { BULK_TEMPLATE_KEYS, EMAIL_TEMPLATE_LABELS, fillTemplate } from '@/domain/emailTemplates';
import { emailEventFor } from '@/domain/autoAdvance';
import { candidatesCsv, downloadText, todayStamp } from '@/domain/csv';
import { API_URL } from '@/api/client';
import { useConfig, useUpdateCandidate } from '@/api/queries';
import { useCandidateActions } from './actions';
import { Button, ConfirmDialog } from '@/ui/kit';
import { useToast } from '@/ui/toast';

export function BulkBar({ selected, onClear }: { selected: Candidate[]; onClear: () => void }) {
  const actions = useCandidateActions();
  const update = useUpdateCandidate();
  const config = useConfig();
  const toast = useToast();
  const [stage, setStage] = useState('');
  const [template, setTemplate] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const ids = selected.map((a) => a.id);
  const n = selected.length;

  const applyStage = async () => {
    if (!stage) return;
    if (REASON_STAGES.includes(stage)) actions.openClose({ ids, stage });
    else await actions.setOutcome(ids, { stage }, `${n} candidate${n === 1 ? '' : 's'} moved to ${stage}`);
    setStage('');
  };

  const withEmail = selected.filter((a) => a.email);
  const sendAll = async () => {
    if (!template || !withEmail.length) return;
    setConfirmSend(false);
    setBusy(true);
    const failed: string[] = [];
    const sentIds: number[] = [];
    for (const a of withEmail) {
      const msg = fillTemplate(template, a, { apiUrl: API_URL, config });
      if (await actions.sendTemplated(a.id, template, { to: a.email, ...msg })) sentIds.push(a.id);
      else failed.push(a.name);
    }
    await actions.advanceMany(sentIds, emailEventFor(template));
    setBusy(false);
    setTemplate('');
    if (failed.length) toast.error(`Sent ${sentIds.length}. Couldn't send to: ${failed.join(', ')}`);
    else toast.show({ message: `Sent ${EMAIL_TEMPLATE_LABELS[template]} to ${sentIds.length} candidate${sentIds.length === 1 ? '' : 's'}` });
  };
  const deleteAll = async () => {
    setConfirmDelete(false);
    const before = new Map(selected.map((a) => [a.id, a.overallStatus]));
    const done = (await Promise.all(ids.map(async (id) => ((await update(id, { overallStatus: 'Deleted' })) ? id : null)))).filter((x): x is number => x !== null);
    onClear();
    if (!done.length) return;
    toast.show({
      message: `${done.length} record${done.length === 1 ? '' : 's'} deleted`,
      action: { label: 'Undo', onClick: () => { void Promise.all(done.map((id) => update(id, { overallStatus: before.get(id) || 'In Progress' }))); } },
    });
  };

  return (
    <div className="app-bulk" role="region" aria-label="Bulk actions">
      <strong>{n} selected</strong>
      <div className="app-bulk__group">
        <select className="ab-select" aria-label="Change stage to" value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">Change stage to</option>
          {CANDIDATE_STAGES.map((s) => <option key={s} value={s}>{stageName(s)}</option>)}
        </select>
        <Button size="sm" variant="tonal" disabled={!stage} onClick={applyStage}>Apply</Button>
      </div>
      <div className="app-bulk__group">
        <select className="ab-select" aria-label="Email template" value={template} onChange={(e) => setTemplate(e.target.value)}>
          <option value="">Send an email</option>
          {BULK_TEMPLATE_KEYS.map((k) => <option key={k} value={k}>{EMAIL_TEMPLATE_LABELS[k]}</option>)}
        </select>
        <Button size="sm" variant="tonal" icon={Mail} busy={busy} disabled={!template} onClick={() => setConfirmSend(true)}>Send</Button>
      </div>
      <Button size="sm" variant="ghost" icon={Download} onClick={() => downloadText(`ABBSS_Selected_${todayStamp()}.csv`, candidatesCsv(selected))}>Export</Button>
      <Button size="sm" variant="ghost" icon={Trash2} className="app-btn-danger-text" onClick={() => setConfirmDelete(true)}>Delete</Button>
      <Button size="sm" variant="ghost" icon={X} className="ml-auto" onClick={onClear}>Clear selection</Button>
      <ConfirmDialog open={confirmSend} title={`Send ${template ? EMAIL_TEMPLATE_LABELS[template] : 'email'} to ${withEmail.length} candidate${withEmail.length === 1 ? '' : 's'}?`}
        confirmLabel={`Send ${withEmail.length} email${withEmail.length === 1 ? '' : 's'}`} onClose={() => setConfirmSend(false)} onConfirm={sendAll}>
        <p className="m-0">Each person gets their own copy from you. This can't be recalled.</p>
        {withEmail.length < n && <p className="m-0 app-tone-warning">{n - withEmail.length} selected {n - withEmail.length === 1 ? 'has' : 'have'} no email address and will be skipped.</p>}
        <p className="m-0 app-meta">{withEmail.slice(0, 6).map((a) => a.name).join(', ')}{withEmail.length > 6 ? `, and ${withEmail.length - 6} more` : ''}</p>
      </ConfirmDialog>
      <ConfirmDialog open={confirmDelete} danger title={`Delete ${n} record${n === 1 ? '' : 's'}?`} confirmLabel="Delete" onClose={() => setConfirmDelete(false)} onConfirm={deleteAll}>
        <p className="m-0">They disappear from every list. You can undo this right after.</p>
      </ConfirmDialog>
    </div>
  );
}
