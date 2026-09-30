import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SNAPSHOT_KEY, useConfig, useUpdateCandidate } from '@/api/queries';
import { saveCandidate, sendEmail, type EmailPayload, type Snapshot } from '@/api/actions';
import { API_URL } from '@/api/client';
import { applyOutcome, decisionChange, DECISION_LABEL, snapshotOutcome, type Decision, type OutcomeChange } from '@/domain/outcome';
import { autoAdvanceTarget, CLOSE_PROMPT_EVENTS, emailEventFor, type AdvanceEvent } from '@/domain/autoAdvance';
import { assessmentsAllPassed, assessmentsSubmitted } from '@/domain/assessments';
import { EMAIL_ATTACHMENTS, fillTemplate } from '@/domain/emailTemplates';
import { opsNotifyRecipients } from '@/domain/team';
import { CLOSED_REASON_OPTIONS } from '@/domain/stages';
import type { Candidate } from '@/domain/types';
import { useToast } from '@/ui/toast';
import { useUser } from '@/auth/auth';
import { Button, Dialog, Field } from '@/ui/kit';

// Everything that changes where a candidate is, or records an email, goes
// through here so the rules (outcomes, auto-advance, undo, one toast) hold
// on every screen.

interface CloseRequest { ids: number[]; stage?: string; reason?: string }
interface CandidateActions {
  setOutcome: (ids: number[], change: OutcomeChange, label: string) => Promise<void>;
  decide: (id: number, decision: Decision) => Promise<void>;
  advance: (id: number, event: AdvanceEvent | '', actionLabel?: string) => Promise<void>;
  openClose: (req: CloseRequest) => void;
  recordEmailSent: (id: number, key: string) => Promise<boolean>;
  unrecordEmailSent: (id: number, key: string) => Promise<void>;
  sendTemplated: (id: number, key: string, msg: { to: string; subject: string; body: string }) => Promise<boolean>;
  createCandidate: (record: Candidate) => Promise<boolean>;
  sweepSubmitted: () => Promise<void>;
}

const Ctx = createContext<CandidateActions | null>(null);
export function useCandidateActions(): CandidateActions {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCandidateActions outside CandidateActionsProvider');
  return c;
}

async function fileAsBase64(path: string): Promise<string> {
  const buf = await (await fetch(path)).arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function CandidateActionsProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const update = useUpdateCandidate();
  const toast = useToast();
  const user = useUser();
  const config = useConfig();
  const [closeReq, setCloseReq] = useState<CloseRequest | null>(null);

  const get = useCallback((id: number) => qc.getQueryData<Snapshot>(SNAPSHOT_KEY)?.candidates.find((a) => a.id === id), [qc]);

  // Entering the Ops interview tells Operations a candidate is coming.
  const onStageEntered = useCallback((a: Candidate, stage: string) => {
    if (stage !== 'Initial Interview' || a.department === 'Sales and Marketing' || !assessmentsAllPassed(a)) return;
    const msg = fillTemplate('ops_endorsement', a, { apiUrl: API_URL, config });
    sendEmail({ to: opsNotifyRecipients(), subject: msg.subject, body: msg.body }).catch(() => { /* a notice; never blocks the move */ });
  }, [config]);

  const setOutcome = useCallback(async (ids: number[], change: OutcomeChange, label: string) => {
    const done: Array<{ id: number; prev: ReturnType<typeof snapshotOutcome> }> = [];
    for (const id of ids) {
      const a = get(id);
      if (!a) continue;
      const patch = applyOutcome(a, change);
      if (!Object.keys(patch).length) continue;
      const prev = snapshotOutcome(a);
      if (await update(id, patch)) {
        done.push({ id, prev });
        if (patch.candidateStage) onStageEntered({ ...a, ...patch }, patch.candidateStage);
      }
    }
    if (!done.length) return;
    toast.show({
      message: label, tone: 'success',
      action: { label: 'Undo', onClick: () => {
        void Promise.all(done.map(({ id, prev }) => update(id, prev, { undoStage: true }))).then(() => toast.show({ message: 'Change undone', tone: 'info' }));
      } },
    });
  }, [get, update, toast, onStageEntered]);

  const decide = useCallback(async (id: number, decision: Decision) => {
    const a = get(id);
    if (!a) return;
    const ch = decisionChange(a, decision);
    if ('error' in ch) { toast.error(ch.error); return; }
    await setOutcome([id], ch, `${DECISION_LABEL[decision]}: ${a.name}`);
  }, [get, setOutcome, toast]);

  const advance = useCallback(async (id: number, event: AdvanceEvent | '', actionLabel?: string) => {
    const a = get(id);
    if (!a) { if (actionLabel) toast.show({ message: actionLabel }); return; }
    const prompt = event ? CLOSE_PROMPT_EVENTS[event] : undefined;
    if (prompt) {
      if (actionLabel) toast.show({ message: actionLabel });
      if (a.overallStatus === 'In Progress') setCloseReq({ ids: [id], ...prompt });
      return;
    }
    const target = autoAdvanceTarget(a, event);
    if (!target) { if (actionLabel) toast.show({ message: actionLabel }); return; }
    await setOutcome([id], { stage: target }, `${actionLabel ? `${actionLabel}. ` : ''}${a.name} moved to ${target}`);
  }, [get, setOutcome, toast]);

  const recordEmailSent = useCallback((id: number, key: string) => {
    const a = get(id);
    if (!a) return Promise.resolve(false);
    return update(id, { emailsSent: { ...(a.emailsSent || {}), [key]: new Date().toISOString() } });
  }, [get, update]);

  const unrecordEmailSent = useCallback(async (id: number, key: string) => {
    const a = get(id);
    if (!a?.emailsSent?.[key]) return;
    const next = { ...a.emailsSent };
    delete next[key];
    if (await update(id, { emailsSent: next })) toast.show({ message: 'Removed the "sent" mark. Nothing was un-sent.', tone: 'info' });
  }, [get, update, toast]);

  const sendTemplated = useCallback(async (id: number, key: string, msg: { to: string; subject: string; body: string }) => {
    const payload: EmailPayload = { ...msg, replyTo: user.email, senderName: user.name, applicantId: id, templateKey: key };
    const att = EMAIL_ATTACHMENTS[key];
    try {
      if (att) Object.assign(payload, { attachmentBase64: await fileAsBase64(att.path), attachmentName: att.name, attachmentMimeType: att.mimeType });
      await sendEmail(payload);
    } catch (e) {
      toast.error(`Couldn't send the email: ${(e as Error).message}. Use Open in Gmail instead.`);
      return false;
    }
    await recordEmailSent(id, key);
    return true;
  }, [user, recordEmailSent, toast]);

  const createCandidate = useCallback(async (record: Candidate) => {
    qc.setQueryData<Snapshot>(SNAPSHOT_KEY, (s) => s && { ...s, candidates: [record, ...s.candidates] });
    try {
      await saveCandidate(record, Object.keys(record));
      return true;
    } catch (e) {
      qc.setQueryData<Snapshot>(SNAPSHOT_KEY, (s) => s && { ...s, candidates: s.candidates.filter((a) => a.id !== record.id) });
      toast.error(`Couldn't add ${record.name}: ${(e as Error).message}`);
      return false;
    }
  }, [qc, toast]);

  // After the backend attaches scores, move everyone who finished (one toast, one Undo).
  const sweepSubmitted = useCallback(async () => {
    const all = qc.getQueryData<Snapshot>(SNAPSHOT_KEY)?.candidates || [];
    const ids = all.filter((a) => a.overallStatus !== 'Deleted' && assessmentsSubmitted(a) && autoAdvanceTarget(a, 'assessmentsSubmitted')).map((a) => a.id);
    if (ids.length) await setOutcome(ids, { stage: 'Assessment Review' }, `${ids.length} candidate${ids.length === 1 ? '' : 's'} finished their assessments, moved to Assessment Review`);
  }, [qc, setOutcome]);

  const value = useMemo<CandidateActions>(() => ({
    setOutcome, decide, advance, openClose: setCloseReq, recordEmailSent, unrecordEmailSent, sendTemplated, createCandidate, sweepSubmitted,
  }), [setOutcome, decide, advance, recordEmailSent, unrecordEmailSent, sendTemplated, createCandidate, sweepSubmitted]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {closeReq && <CloseDialog req={closeReq} names={closeReq.ids.map((id) => get(id)?.name || '').filter(Boolean)}
        onCancel={() => setCloseReq(null)}
        onConfirm={(stage, reason) => {
          const ids = closeReq.ids;
          setCloseReq(null);
          const names = ids.map((id) => get(id)?.name).filter(Boolean);
          void setOutcome(ids, { stage, closedReason: reason }, `${names.length === 1 ? names[0] : `${names.length} candidates`} closed: ${reason}`);
        }} />}
    </Ctx.Provider>
  );
}

// One dialog for every way of closing a candidate, with the reason (it feeds the reports).
function CloseDialog({ req, names, onCancel, onConfirm }: { req: CloseRequest; names: string[]; onCancel: () => void; onConfirm: (stage: string, reason: string) => void }) {
  const [stage, setStage] = useState(req.stage === 'Closed - Withdrawn' ? 'Closed - Withdrawn' : 'Closed - Rejected');
  const [reason, setReason] = useState(req.reason || '');
  const [tried, setTried] = useState(false);
  const who = names.length === 1 ? names[0] : `${names.length} candidates`;
  return (
    <Dialog open onClose={onCancel} title={`Close ${who}`} footer={<>
      <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      <Button variant="danger" onClick={() => { setTried(true); if (reason) onConfirm(stage, reason); }}>Close {names.length === 1 ? 'candidate' : 'candidates'}</Button>
    </>}>
      <div className="grid gap-4">
        <Field label="Outcome" htmlFor="close-stage">
          <select id="close-stage" className="ab-select" value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="Closed - Rejected">Rejected (we decided not to continue)</option>
            <option value="Closed - Withdrawn">Withdrawn (the candidate pulled out)</option>
          </select>
        </Field>
        <Field label="Reason" required htmlFor="close-reason" error={tried && !reason ? 'Pick a reason. It feeds the reports.' : undefined}>
          <select id="close-reason" className="ab-select" value={reason} aria-invalid={tried && !reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose a reason</option>
            {CLOSED_REASON_OPTIONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
      </div>
    </Dialog>
  );
}

export { emailEventFor };
