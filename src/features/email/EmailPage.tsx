import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Copy, ExternalLink, Mail, Paperclip, Send } from 'lucide-react';
import { useCandidate, useCandidates, useConfig } from '@/api/queries';
import { API_URL } from '@/api/client';
import { useUser } from '@/auth/auth';
import { CANDIDATE_TEMPLATE_KEYS, EMAIL_ATTACHMENTS, EMAIL_TEMPLATE_LABELS, OFFER_FIELD_TEMPLATES, fillTemplate, suggestedTemplateFor } from '@/domain/emailTemplates';
import { emailEventFor } from '@/domain/autoAdvance';
import { stageLabel } from '@/domain/stages';
import type { Candidate } from '@/domain/types';
import { useCandidateActions } from '../candidates/actions';
import { SavingInput, SavingTextarea } from '../candidate/sections/common';
import { useUpdateCandidate } from '@/api/queries';
import { Badge, Button, Empty, Field, PageHeader, fmtDateTime } from '@/ui/kit';
import { useToast } from '@/ui/toast';

export default function EmailPage() {
  const [params, setParams] = useSearchParams();
  const id = params.get('candidate') ? Number(params.get('candidate')) : null;
  const a = useCandidate(id);
  const template = params.get('template') || (a ? suggestedTemplateFor(a) : 'assessment');
  const setParam = (k: string, v: string) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  return (
    <div className="app-stack">
      <PageHeader title="Email a candidate" lead="Every email here is linked to a candidate, so sends are recorded and move them along." />
      <div className="app-email-grid">
        <aside className="grid gap-4 content-start">
          <CandidatePicker value={id} onChange={(v) => setParam('candidate', v ? String(v) : '')} />
          <nav aria-label="Templates">
            <p className="ab-label m-0 mb-2">Template</p>
            <ul className="app-template-list">
              {CANDIDATE_TEMPLATE_KEYS.map((k) => (
                <li key={k}>
                  <button type="button" className="app-template" aria-current={template === k ? 'true' : undefined} onClick={() => setParam('template', k)}>
                    <span>{EMAIL_TEMPLATE_LABELS[k]}</span>
                    {a?.emailsSent?.[k] && <Check size={14} aria-label="already sent" />}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        {a ? <Composer key={`${a.id}-${template}`} a={a} template={template} /> : <Empty icon={Mail} title="Pick a candidate">Choose who the email is for. Opening Email from a candidate's record fills this in.</Empty>}
      </div>
    </div>
  );
}

function CandidatePicker({ value, onChange }: { value: number | null; onChange: (id: number | null) => void }) {
  const { candidates } = useCandidates();
  const sorted = useMemo(() => [...candidates].sort((x, y) => x.name.localeCompare(y.name)), [candidates]);
  return (
    <Field label="Candidate" htmlFor="email-cand">
      <select id="email-cand" className="ab-select" value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Choose a candidate</option>
        {sorted.map((c) => <option key={c.id} value={c.id}>{c.name}{c.position ? `, ${c.position}` : ''}</option>)}
      </select>
    </Field>
  );
}

function Composer({ a, template }: { a: Candidate; template: string }) {
  const config = useConfig();
  const user = useUser();
  const actions = useCandidateActions();
  const update = useUpdateCandidate();
  const toast = useToast();
  const filled = useMemo(() => fillTemplate(template, a, { apiUrl: API_URL, config }), [template, a, config]);
  // Hand edits win; until then the text follows the template (and the offer details).
  const [edit, setEdit] = useState<{ subject?: string; body?: string }>({});
  const subject = edit.subject ?? filled.subject;
  const body = edit.body ?? filled.body;
  const [busy, setBusy] = useState(false);
  const sentAt = a.emailsSent?.[template];
  const attachment = EMAIL_ATTACHMENTS[template];
  const od = a.offerDetails || {};

  const send = async () => {
    setBusy(true);
    const ok = await actions.sendTemplated(a.id, template, { to: a.email, subject, body });
    setBusy(false);
    if (ok) await actions.advance(a.id, emailEventFor(template), `Email sent to ${a.name}`);
  };
  const markSent = async () => {
    if (await actions.recordEmailSent(a.id, template)) await actions.advance(a.id, emailEventFor(template), `Marked as sent for ${a.name}`);
  };
  const openGmail = () => {
    navigator.clipboard?.writeText(a.email).catch(() => {});
    const url = `https://mail.google.com/mail/u/${encodeURIComponent(user.email || '0')}/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, '_blank', 'noopener');
    toast.show({ message: `Gmail opened. ${a.email} is copied: paste it into To.${attachment ? ` Attach ${attachment.name} too.` : ''} Then mark it as sent here.`, tone: 'info' });
  };

  return (
    <section className="app-card-plain grid gap-4" aria-label="Composer">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="m-0 font-semibold">{a.name} <span className="app-meta">{a.email}</span></p>
          <p className="app-meta m-0">{stageLabel(a)}. Replies go to {user.email || user.name}.</p>
        </div>
        {sentAt ? <Badge tone="success">Sent {fmtDateTime(sentAt)}</Badge> : <Badge tone="neutral">Not sent yet</Badge>}
      </div>

      {OFFER_FIELD_TEMPLATES.includes(template) && (
        <div className="grid gap-3 app-offer-fields">
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
        </div>
      )}

      <Field label="Subject" htmlFor="em-subject">
        <input id="em-subject" className="ab-input" value={subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} />
      </Field>
      <Field label="Message" htmlFor="em-body">
        <textarea id="em-body" className="ab-textarea app-email-body" value={body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
      </Field>
      {attachment && (
        <p className="app-meta m-0 flex items-center gap-2"><Paperclip size={14} aria-hidden /> Attached automatically: <a href={attachment.path} target="_blank" rel="noopener noreferrer">{attachment.name}</a></p>
      )}
      <div className="ab-cluster">
        <Button variant="primary" icon={Send} busy={busy} onClick={send}>Send</Button>
        <Button variant="tonal" icon={ExternalLink} onClick={openGmail}>Open in Gmail</Button>
        <Button variant="ghost" icon={Copy} onClick={() => navigator.clipboard?.writeText(`Subject: ${subject}\n\n${body}`).then(() => toast.show({ message: 'Email copied' }))}>Copy</Button>
        {!sentAt
          ? <Button variant="ghost" icon={Check} onClick={markSent}>Mark as sent</Button>
          : <Button variant="ghost" onClick={() => actions.unrecordEmailSent(a.id, template)}>Unmark sent</Button>}
      </div>
    </section>
  );
}
