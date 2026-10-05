import { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { Candidate } from '@/domain/types';
import { saveInterviewSlots } from '@/api/actions';
import { useReplaceCandidate, useUpdateCandidate } from '@/api/queries';
import { useCandidateActions } from '../../candidates/actions';
import { Badge, Button, Field } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { SavingTextarea, Section } from './common';

// Interview questions for the EMM follow-up, plus optional resilience probes.
const GUIDE = [
  { num: 'Q1', skill: 'Formula comprehension: SUMIF', ask: 'Open your Matching sheet. Pick any row and explain: what does your SUMIF formula calculate, and what does the result tell you about that account?', pass: 'Explains what SUMIF does and connects the number to a business meaning.', fail: 'Cannot explain the formula or describe what the output means.', note: 'Applicants who copied formulas may be unable to explain why they reference specific columns.' },
  { num: 'Q2', skill: 'Formula construction: COUNTIFS', ask: 'In a blank column, write a COUNTIFS formula that counts rows with the same Order Ref as this row AND Doc Type of "Payment". Show me as you type it.', pass: 'Writes a working COUNTIFS with correct column references and both criteria.', fail: 'Cannot construct the formula from scratch without copying.', note: 'Struggling to write it from scratch suggests the original formulas may not have been written by the applicant.' },
  { num: 'Q3', skill: 'Classification judgment: similar categories', ask: 'Two scenarios: A) 1 Credit Memo, 1 Invoice, 1 Payment, 0 Refunds, SUMIF=-958. B) 1 Credit Memo, 0 Invoices, 0 Payments, 0 Refunds, SUMIF=-75. What category is each and why?', pass: 'Correctly identifies both as Missing Refund and explains the CM-Refund pairing.', fail: "Calls Scenario A 'Match', the most common error in sample files.", note: 'This is drawn from actual errors in the sample applicant files.' },
  { num: 'Q4', skill: 'Edge case: rounding boundary', ask: 'A group has 1 Invoice, 1 Payment, SUMIF = 0.01. Is this Match or Invoice > Payment? What would you do with this in a real reconciliation?', pass: 'Recognises the rounding issue and classifies as Match with a real-world explanation.', fail: 'Insists on Invoice > Payment because the number is technically positive.', note: 'This pattern caused about 250 errors for one sample applicant.' },
  { num: 'Q5', skill: 'Real-world AR understanding', ask: 'You found 266 Missing Invoice entries totalling -$207,720. What would you do next and who would you involve?', pass: 'Understands the financial implication and describes a logical next step with the right stakeholders.', fail: 'Treats it as a data entry issue only.', note: 'Separates candidates with real AR experience from those who only completed the exercise.' },
];
const RESILIENCE = [
  { num: 'R1', skill: 'Perseverance under pressure', ask: 'Tell me about a specific time, at this job or another, when you seriously considered giving up on a task or role. Walk me through exactly what happened and what you did next.', pass: 'Gives a specific, real example with concrete detail, and describes what got them through it or what they honestly learned from stepping back.', fail: "Can't recall a specific instance, gives a vague or hypothetical answer, or blames external factors entirely with no self-reflection.", note: 'Vague or rehearsed-sounding answers are worth a live follow-up.' },
  { num: 'R2', skill: 'Adapting to sudden change', ask: "A client changes the process on you in the middle of a task with no warning. Walk me through what you'd actually do, step by step.", pass: 'Describes a calm, concrete process (clarify what changed, adjust the work, confirm with the client or supervisor if unsure).', fail: 'Reacts with frustration or resistance, or gives a vague answer that avoids the scenario.', note: "Watch for answers that amount to \"I'd just figure it out\" with no process." },
];

export function InterviewSection({ a }: { a: Candidate }) {
  const update = useUpdateCandidate();
  const actions = useCandidateActions();
  const iv = a.interview || {};
  const setResult = async (result: 'pass' | 'fail') => {
    if (!(await update(a.id, { interview: { ...iv, result } }))) return;
    if (result === 'pass') await actions.advance(a.id, 'interviewPassed', 'Interview marked as passed');
    else await actions.advance(a.id, 'interviewFailed', 'Interview marked as failed');
  };
  return (
    <div className="app-stack">
      <Scheduling a={a} />
      <Section title="Interview questions">
        <p className="ab-muted m-0">A guide for the conversation, not a score sheet. Open a question to see what to look for.</p>
        <Guide items={GUIDE} group="interview-guide" />
        <details>
          <summary className="app-meta">Optional: resilience and adaptability probes</summary>
          <Guide items={RESILIENCE} group="interview-resilience" />
        </details>
      </Section>
      <Section title="Notes and result">
        <SavingTextarea id={`ivn-${a.id}`} label="Interview notes" value={iv.notes} rows={6} placeholder="Answers, observations, concerns"
          onSave={(x) => update(a.id, { interview: { ...iv, notes: x } })} />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="tonal" size="sm" icon={Check} aria-pressed={iv.result === 'pass'} onClick={() => setResult('pass')}>Passed</Button>
          <Button variant="tonal" size="sm" icon={X} aria-pressed={iv.result === 'fail'} onClick={() => setResult('fail')}>Failed</Button>
          {iv.result ? <Badge tone={iv.result === 'pass' ? 'success' : 'danger'}>{iv.result === 'pass' ? 'Interview passed' : 'Interview failed'}</Badge>
            : <span className="app-meta">No result yet.</span>}
        </div>
      </Section>
    </div>
  );
}

// One question per row; opening one closes the others (details with a shared name).
function Guide({ items, group }: { items: typeof GUIDE; group: string }) {
  return (
    <div className="app-qa-list">
      {items.map((q) => (
        <details key={q.num} name={group} className="app-qa">
          <summary><span className="app-qa__num">{q.num}</span> {q.skill}</summary>
          <div className="app-qa__body">
            <p className="m-0">{q.ask}</p>
            <p className="app-meta m-0"><strong>Look for:</strong> {q.pass} <strong>Watch out for:</strong> {q.fail} {q.note}</p>
          </div>
        </details>
      ))}
    </div>
  );
}

// HR records what the candidate said on the call: their preferred time(s)
// and their Viber/WhatsApp number, in one save. David confirms on the calendar.
function Scheduling({ a }: { a: Candidate }) {
  const replace = useReplaceCandidate();
  const toast = useToast();
  const slots = a.interviewSlots || [];
  const confirmed = a.confirmedSlot || null;
  const [times, setTimes] = useState(slots.map((s) => s.label).join('\n'));
  const [contact, setContact] = useState(a.candidateContact || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    const labels = times.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!labels.length) { setError('Enter at least the time the candidate prefers.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await saveInterviewSlots(a.id, labels, contact.trim());
      replace({ ...a, interviewSlots: res.slots, schedulingToken: res.schedulingToken, candidateSlotPicks: res.slots.map((s) => s.id), candidateContact: contact.trim() });
      toast.show({ message: 'Saved. It is on the interview calendar for David.' });
    } catch (e) {
      setError(`Couldn't save: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Interview time">
      {confirmed ? (
        <div className="ab-alert ab-alert--success">
          <span className="ab-alert__icon" aria-hidden><Check size={18} /></span>
          <p className="ab-alert__title">Confirmed for {confirmed.label}</p>
          <div>The confirmation email went to the candidate.{a.candidateContact ? ` Their number: ${a.candidateContact}.` : ''} To change it, undo the confirmation on the interview calendar.</div>
        </div>
      ) : (
        <>
          <p className="ab-muted m-0">Call the candidate, get their preferred time (and a backup) plus their Viber or WhatsApp number, and save both.</p>
          <div className="app-form-grid">
            <Field label="Times they're available (preferred first, one per line)" htmlFor={`slots-${a.id}`} error={error}>
              <textarea id={`slots-${a.id}`} className="ab-textarea" rows={3} value={times} aria-invalid={!!error} placeholder={'Mon, Oct 5 - 2:00 PM\nTue, Oct 6 - 10:00 AM (backup)'} onChange={(e) => setTimes(e.target.value)} />
            </Field>
            <Field label="Viber or WhatsApp number" htmlFor={`contact-${a.id}`}>
              <input id={`contact-${a.id}`} className="ab-input" value={contact} placeholder="+63 900 000 0000" onChange={(e) => setContact(e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="sm" busy={busy} onClick={save}>Save and add to calendar</Button>
            {slots.length > 0 && <span className="app-meta">Waiting for David to confirm a time on the interview calendar.</span>}
          </div>
        </>
      )}
    </Section>
  );
}
