import { useState } from 'react';
import { Download, Mail, Trash2, X } from 'lucide-react';
import type { Candidate } from '@/domain/types';
import { CANDIDATE_STAGES, REASON_STAGES } from '@/domain/stages';
import { BULK_TEMPLATE_KEYS, EMAIL_TEMPLATE_LABELS, fillTemplate } from '@/domain/emailTemplates';
import { emailEventFor } from '@/domain/autoAdvance';
import { candidatesCsv, downloadText, todayStamp } from '@/domain/csv';
import { API_URL } from '@/api/client';
import { useConfig, useUpdateCandidate } from '@/api/queries';
import { useCandidateActions } from './actions';
import { Button, Dialog } from '@/ui/kit';
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
  const ids = selected.map((a) => a.id);
  const n = selected.length;

  const applyStage = async () => {
    if (!stage) return;
    if (REASON_STAGES.includes(stage)) actions.openClose({ ids, stage });
    else await actions.setOutcome(ids, { stage }, `${n} candidate${n === 1 ? '' : 's'} moved to ${stage}`);
    setStage('');
  };

  const sendAll = async () => {
    const withEmail = selected.filter((a) => a.email);
    if (!template || !withEmail.length) return;
    setBusy(true);
    const failed: string[] = [];
    for (const a of withEmail) {
      const msg = fillTemplate(template, a, { apiUrl: API_URL, config });
      if (await actions.sendTemplated(a.id, template, { to: a.email, ...msg })) await actions.advance(a.id, emailEventFor(template));
      else failed.push(a.name);
    }
    setBusy(false);
    setTemplate('');
    const sent = withEmail.length - failed.length;
    if (failed.length) toast.error(`Sent ${sent}. Couldn't send to: ${failed.join(', ')}`);
    else toast.show({ message: `Sent ${EMAIL_TEMPLATE_LABELS[template]} to ${sent} candidate${sent === 1 ? '' : 's'}` });
  };

  return (
    <div className="app-bulk" role="region" aria-label="Bulk actions">
      <strong>{n} selected</strong>
      <div className="app-bulk__group">
        <select className="ab-select" aria-label="Change stage to" value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">Change stage to</option>
          {CANDIDATE_STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <Button size="sm" variant="tonal" disabled={!stage} onClick={applyStage}>Apply</Button>
      </div>
      <div className="app-bulk__group">
        <select className="ab-select" aria-label="Email template" value={template} onChange={(e) => setTemplate(e.target.value)}>
          <option value="">Send an email</option>
          {BULK_TEMPLATE_KEYS.map((k) => <option key={k} value={k}>{EMAIL_TEMPLATE_LABELS[k]}</option>)}
        </select>
        <Button size="sm" variant="tonal" icon={Mail} busy={busy} disabled={!template} onClick={sendAll}>Send</Button>
      </div>
      <Button size="sm" variant="ghost" icon={Download} onClick={() => downloadText(`ABBSS_Selected_${todayStamp()}.csv`, candidatesCsv(selected))}>Export</Button>
      <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>Delete</Button>
      <Button size="sm" variant="ghost" icon={X} className="ml-auto" onClick={onClear}>Clear</Button>
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Delete ${n} record${n === 1 ? '' : 's'}?`} footer={<>
        <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
        <Button variant="danger" onClick={async () => {
          setConfirmDelete(false);
          const results = await Promise.all(ids.map((id) => update(id, { overallStatus: 'Deleted' })));
          toast.show({ message: `Deleted ${results.filter(Boolean).length} record(s)` });
          onClear();
        }}>Delete</Button>
      </>}>
        <p className="m-0">They disappear from every list. The rows stay in the Sheet, marked Deleted, if they ever need to be recovered.</p>
      </Dialog>
    </div>
  );
}
