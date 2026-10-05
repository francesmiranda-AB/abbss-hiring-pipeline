import { useMemo, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, FileSignature, MoreHorizontal, Paperclip, PenLine, Send, UserRound } from 'lucide-react';
import { useConfig, useUpdateCandidate } from '@/api/queries';
import { API_URL } from '@/api/client';
import { useUser } from '@/auth/auth';
import { EMAIL_ATTACHMENTS, OFFER_FIELD_TEMPLATES, fillTemplate } from '@/domain/emailTemplates';
import { emailEventFor } from '@/domain/autoAdvance';
import { stageLabel } from '@/domain/stages';
import type { Candidate } from '@/domain/types';
import { useCandidateActions } from '../candidates/actions';
import { SavingInput, SavingTextarea } from '../candidate/sections/common';
import { Badge, Button, ConfirmDialog, DialogGroup, Field, fmtDateTime } from '@/ui/kit';
import { useToast } from '@/ui/toast';

// What someone typed over a template, kept per candidate and template so that
// switching templates and coming back doesn't lose it.
export type Drafts = Record<string, { subject?: string; body?: string }>;
export function useDrafts() {
  const [drafts, setDrafts] = useState<Drafts>({});
  return {
    drafts,
    setDraft: (key: string, patch: { subject?: string; body?: string }) => setDrafts((d) => ({ ...d, [key]: { ...d[key], ...patch } })),
  };
}

export function Composer({ a, template, drafts, setDraft, onSent }: {
  a: Candidate; template: string; drafts: Drafts; setDraft: (key: string, patch: { subject?: string; body?: string }) => void; onSent?: () => void;
}) {
  const config = useConfig();
  const user = useUser();
  const actions = useCandidateActions();
  const update = useUpdateCandidate();
  const toast = useToast();
  const filled = useMemo(() => fillTemplate(template, a, { apiUrl: API_URL, config }), [template, a, config]);
  const key = `${a.id}:${template}`;
  // Hand edits win; until then the text follows the template (and the offer details).
  const subject = drafts[key]?.subject ?? filled.subject;
  const body = drafts[key]?.body ?? filled.body;
  const [busy, setBusy] = useState(false);
  const [askUnmark, setAskUnmark] = useState(false);
  const more = useRef<HTMLDetailsElement>(null);
  const sentAt = a.emailsSent?.[template];
  const attachment = EMAIL_ATTACHMENTS[template];
  const od = a.offerDetails || {};
  const closeMore = () => { if (more.current) more.current.open = false; };

  const send = async () => {
    setBusy(true);
    const ok = await actions.sendTemplated(a.id, template, { to: a.email, subject, body });
    setBusy(false);
    if (!ok) return;
    await actions.advance(a.id, emailEventFor(template), `Email sent to ${a.name}`);
    onSent?.();
  };
  const markSent = async () => {
    closeMore();
    if (await actions.recordEmailSent(a.id, template)) {
      await actions.advance(a.id, emailEventFor(template), `Marked as sent for ${a.name}`);
      onSent?.();
    }
  };
  const openGmail = () => {
    closeMore();
    navigator.clipboard?.writeText(a.email).catch(() => {});
    const url = `https://mail.google.com/mail/u/${encodeURIComponent(user.email || '0')}/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, '_blank', 'noopener');
    toast.show({ message: `Gmail opened. ${a.email} is copied: paste it into To.${attachment ? ` Attach ${attachment.name} too.` : ''} Then mark it as sent here.`, tone: 'info' });
  };

  return (
    <section className="app-dialog-groups" aria-label="Composer">
      <DialogGroup title="To" icon={UserRound}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <p className="m-0 font-semibold">{a.name} <span className="app-meta">{a.email}</span></p>
            <p className="app-meta m-0">{stageLabel(a)}. Replies go to {user.email || user.name}.</p>
          </div>
          {sentAt ? <Badge tone="success">Sent {fmtDateTime(sentAt)}</Badge> : <Badge tone="neutral">Not sent yet</Badge>}
        </div>
      </DialogGroup>

      {OFFER_FIELD_TEMPLATES.includes(template) && (
        <DialogGroup title="Offer details" icon={FileSignature} tone="green">
          <p className="ab-hint m-0">These details save to {a.name}'s record.</p>
          <SavingTextarea id="em-jd" label="Job description" value={od.jd} onSave={(v) => update(a.id, { offerDetails: { ...od, jd: v } })} />
          <div className="app-form-grid">
            <SavingInput id="em-start" label="Start date" value={od.startDate} onSave={(v) => update(a.id, { offerDetails: { ...od, startDate: v } })} />
            <SavingInput id="em-rate" label="Rate" value={od.rate} onSave={(v) => update(a.id, { offerDetails: { ...od, rate: v } })} />
            <Field label="Contract type" htmlFor="em-ct">
              <select id="em-ct" className="ab-select" value={od.contractType || ''} onChange={(e) => update(a.id, { offerDetails: { ...od, contractType: e.target.value } })}>
                <option value="">Select</option><option>Employee</option><option>Independent Contractor</option>
              </select>
            </Field>
            <SavingInput id="em-sig" label="Signatory" value={od.signatory} onSave={(v) => update(a.id, { offerDetails: { ...od, signatory: v } })} />
          </div>
        </DialogGroup>
      )}

      <DialogGroup title="Message" icon={PenLine} tone="blue">
      <Field label="Subject" htmlFor="em-subject">
        <input id="em-subject" className="ab-input" value={subject} onChange={(e) => setDraft(key, { subject: e.target.value })} />
      </Field>
      <Field label="Message" htmlFor="em-body">
        <textarea id="em-body" className="ab-textarea app-email-body" value={body} onChange={(e) => setDraft(key, { body: e.target.value })} />
      </Field>
      {attachment && (
        <p className="app-meta m-0 flex items-center gap-2"><Paperclip size={14} aria-hidden /> Attached automatically: <a href={attachment.path} target="_blank" rel="noopener noreferrer">{attachment.name}</a></p>
      )}
      </DialogGroup>
      <div className="ab-cluster app-composer-foot">
        <Button variant="primary" icon={Send} busy={busy} onClick={send}>Send</Button>
        {/* The fallbacks (Gmail, copy, marking as sent by hand) live behind More. */}
        <details className="app-more" ref={more}>
          <summary className="ab-btn ab-btn--ghost"><MoreHorizontal size={16} aria-hidden /> More</summary>
          <div className="ab-menu app-more__menu">
            <button type="button" className="ab-menu__item" onClick={openGmail}><ExternalLink size={16} aria-hidden /> Open in Gmail instead</button>
            <button type="button" className="ab-menu__item" onClick={() => { closeMore(); void navigator.clipboard?.writeText(`Subject: ${subject}\n\n${body}`).then(() => toast.show({ message: 'Email copied' })); }}><Copy size={16} aria-hidden /> Copy the text</button>
            {!sentAt
              ? <button type="button" className="ab-menu__item" onClick={markSent}><Check size={16} aria-hidden /> I already sent it, mark as sent</button>
              : <button type="button" className="ab-menu__item" onClick={() => { closeMore(); setAskUnmark(true); }}>Clear the sent mark</button>}
          </div>
        </details>
      </div>
      <ConfirmDialog open={askUnmark} title="Clear the sent mark?" confirmLabel="Clear mark" onClose={() => setAskUnmark(false)}
        onConfirm={() => { setAskUnmark(false); void actions.unrecordEmailSent(a.id, template); }}>
        <p className="m-0">This only clears the record that it was sent. It does not un-send anything.</p>
      </ConfirmDialog>
    </section>
  );
}
