import { useState } from 'react';
import { CalendarClock, Check, ClipboardCheck, X } from 'lucide-react';
import type { Candidate } from '@/domain/types';
import { saveInterviewSlots } from '@/api/actions';
import { parseSlotLabel } from '@/domain/calendar';
import { useReplaceCandidate, useUpdateCandidate } from '@/api/queries';
import { useCandidateActions } from '../../candidates/actions';
import { Badge, Button, Field } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { SavingTextarea, PanelSection } from './common';
import { QuestionSets } from './Questions';
import { useCaps } from '../useCaps';

export function InterviewSection({ a }: { a: Candidate }) {
  const update = useUpdateCandidate();
  const actions = useCandidateActions();
  const caps = useCaps(a);
  const iv = a.interview || {};
  const setResult = async (result: 'pass' | 'fail') => {
    if (!(await update(a.id, { interview: { ...iv, result } }))) return;
    if (result === 'pass') await actions.advance(a.id, 'interviewPassed', 'Interview marked as passed');
    else await actions.advance(a.id, 'interviewFailed', 'Interview marked as failed');
  };
  return (
    <div className="app-stack">
      <fieldset disabled={!caps.schedule} className="app-fieldset"><Scheduling a={a} /></fieldset>
      <QuestionSets a={a} />
      <fieldset disabled={!caps.interview} className="app-fieldset app-stack">
      <PanelSection title="Notes and result" kind="action" icon={ClipboardCheck} tone="blue">
        <SavingTextarea id={`ivn-${a.id}`} label="Interview notes" value={iv.notes} rows={6} placeholder="Answers, observations, concerns"
          onSave={(x) => update(a.id, { interview: { ...iv, notes: x } })} />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="tonal" size="sm" icon={Check} className="app-btn-pass" aria-pressed={iv.result === 'pass'} onClick={() => setResult('pass')}>Passed</Button>
          <Button variant="tonal" size="sm" icon={X} className="app-btn-fail" aria-pressed={iv.result === 'fail'} onClick={() => setResult('fail')}>Failed</Button>
          {iv.result ? <Badge tone={iv.result === 'pass' ? 'success' : 'danger'}>{iv.result === 'pass' ? 'Interview passed' : 'Interview failed'}</Badge>
            : <span className="app-meta">No result yet.</span>}
        </div>
      </PanelSection>
      </fieldset>
    </div>
  );
}

// HR records what the candidate said on the call: their preferred time and up
// to two backups (real dates, from pickers) plus their Viber/WhatsApp number,
// in one save. Operations confirms on the calendar, with the time already filled in.
const SLOT_FIELDS = ['Preferred time', 'Backup time', 'Second backup'] as const;
const pad2 = (n: number) => String(n).padStart(2, '0');
const toInput = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
// "Mon, Oct 5, 2026 - 2:00 PM": year included, so the calendar never has to guess it.
function slotLabel(d: Date, i: number): string {
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} - ${time}${i > 0 ? ' (backup)' : ''}`;
}

function Scheduling({ a }: { a: Candidate }) {
  const replace = useReplaceCandidate();
  const toast = useToast();
  const slots = a.interviewSlots || [];
  const confirmed = a.confirmedSlot || null;
  // Saved times come back into the pickers; one that can't be read is shown so it can be picked again.
  const parsed = slots.slice(0, 3).map((s) => ({ label: s.label, date: parseSlotLabel(s.label) }));
  const [values, setValues] = useState<string[]>(() => [0, 1, 2].map((i) => (parsed[i]?.date ? toInput(parsed[i].date!) : '')));
  const unreadable = parsed.filter((p) => !p.date).map((p) => p.label);
  const [contact, setContact] = useState(a.candidateContact || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    const dates = values.map((v) => (v ? new Date(v) : null)).filter((d): d is Date => !!d && !isNaN(d.getTime()));
    if (!dates.length) { setError('Pick at least the time the candidate prefers.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await saveInterviewSlots(a.id, dates.map(slotLabel), contact.trim());
      replace({ ...a, interviewSlots: res.slots, schedulingToken: res.schedulingToken, candidateSlotPicks: res.slots.map((s) => s.id), candidateContact: contact.trim() });
      toast.show({ message: 'Saved. It is on the interview calendar.' });
    } catch (e) {
      setError(`Couldn't save: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PanelSection title="Interview time" kind="action" icon={CalendarClock} tone="blue">
      {confirmed ? (
        <div className="ab-alert ab-alert--success">
          <span className="ab-alert__icon" aria-hidden><Check size={18} /></span>
          <p className="ab-alert__title">Confirmed for {confirmed.label}</p>
          <div>The candidate has the confirmation email.{a.candidateContact ? ` Their number: ${a.candidateContact}.` : ''} To change it, undo the confirmation on the interview calendar.</div>
        </div>
      ) : (
        <>
          {unreadable.length > 0 && <p className="app-tone-warning m-0" role="alert">Couldn't read the saved time{unreadable.length > 1 ? 's' : ''} "{unreadable.join('", "')}". Pick {unreadable.length > 1 ? 'them' : 'it'} again below.</p>}
          <div className="app-slot-grid">
            {SLOT_FIELDS.map((label, i) => (
              <Field key={label} label={label} required={i === 0} htmlFor={`slot-${a.id}-${i}`} error={i === 0 ? error : undefined}>
                <input id={`slot-${a.id}-${i}`} type="datetime-local" className="ab-input" value={values[i]} aria-invalid={i === 0 && !!error}
                  onChange={(e) => setValues((cur) => cur.map((v, j) => (j === i ? e.target.value : v)))} />
              </Field>
            ))}
            <Field label="Viber or WhatsApp number" htmlFor={`contact-${a.id}`}>
              <input id={`contact-${a.id}`} className="ab-input" value={contact} placeholder="+63 900 000 0000" onChange={(e) => setContact(e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="sm" busy={busy} onClick={save}>Save and add to calendar</Button>
            {slots.length > 0 && <span className="app-meta">Waiting for Operations to confirm a time.</span>}
          </div>
        </>
      )}
    </PanelSection>
  );
}
