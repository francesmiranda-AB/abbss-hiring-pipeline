import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DoorOpen, Download, Plus, Trash2 } from 'lucide-react';
import { deleteOffboarding, getAllOffboarding, saveOffboarding } from '@/api/actions';
import type { OffboardingCase } from '@/domain/types';
import { checklistProgress, isOffboardingDue, offboardingCsv, sortOffboarding, trackLabel } from '@/domain/offboarding';
import { downloadText, todayStamp } from '@/domain/csv';
import { DEPARTMENTS } from '@/domain/stages';
import { Badge, Button, ConfirmDialog, Empty, ErrorAlert, Field, PageHeader, Section, Skeleton } from '@/ui/kit';
import { useToast } from '@/ui/toast';

const KEY = ['offboarding'];

export default function OffboardingPage() {
  const q = useQuery({ queryKey: KEY, queryFn: getAllOffboarding });
  const cases = sortOffboarding(q.data || []);
  const open = cases.filter((c) => c.status !== 'Completed');
  return (
    <div className="app-stack">
      <PageHeader title="Offboarding" lead="Clearance for anyone leaving, from their last working day."
        actions={<Button variant="outline" size="sm" icon={Download} disabled={!cases.length} onClick={() => downloadText(`ABBSS_Offboarding_${todayStamp()}.csv`, offboardingCsv(cases))}>Export CSV</Button>} />
      <NewCase alwaysOpen={!q.isLoading && !cases.length} />
      <Section title="Cases" lead={`${open.length} open, ${cases.length - open.length} completed.`}>
        {q.isLoading ? <Skeleton lines={4} /> : q.error ? <ErrorAlert title="Couldn't load offboarding cases">{(q.error as Error).message}</ErrorAlert>
          : !cases.length ? <Empty icon={DoorOpen} title="No offboarding cases">Add one when someone resigns or their contract ends.</Empty>
          : <div className="grid gap-4">{cases.map((c) => <CaseCard key={c.id} c={c} />)}</div>}
      </Section>
    </div>
  );
}

function NewCase({ alwaysOpen }: { alwaysOpen: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const empty = { name: '', track: 'employee', position: '', department: '', dateHired: '', noticeDate: '', lastWorkingDay: '', supervisor: '' };
  const [f, setF] = useState(empty);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    setTried(true);
    if (!f.name.trim() || !f.lastWorkingDay) return;
    setBusy(true);
    try {
      await saveOffboarding({ id: `off_${Date.now()}`, ...f, name: f.name.trim(), position: f.position.trim(), supervisor: f.supervisor.trim(), notes: '' });
      toast.show({ message: `Offboarding case added for ${f.name.trim()}` });
      setF(empty);
      setTried(false);
      setExpanded(false);
      await qc.invalidateQueries({ queryKey: KEY });
    } catch (e) {
      toast.error(`Couldn't add the case: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  if (!expanded && !alwaysOpen) {
    return <div><Button variant="secondary" icon={Plus} onClick={() => setExpanded(true)}>Add someone leaving</Button></div>;
  }
  return (
    <form className="app-card-plain grid gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <h2 className="ab-card__title">Add someone leaving</h2>
      <div className="app-form-grid">
        <Field label="Full name" required htmlFor="ob-name" error={tried && !f.name.trim() ? 'Enter their name.' : undefined}>
          <input id="ob-name" className="ab-input" value={f.name} onChange={set('name')} aria-invalid={tried && !f.name.trim()} />
        </Field>
        <Field label="Track" htmlFor="ob-track">
          <select id="ob-track" className="ab-select" value={f.track} onChange={set('track')}>
            <option value="employee">Regular employee</option><option value="contractor">Independent contractor</option>
          </select>
        </Field>
        <Field label="Position" htmlFor="ob-pos"><input id="ob-pos" className="ab-input" value={f.position} onChange={set('position')} /></Field>
        <Field label="Department" htmlFor="ob-dept">
          <select id="ob-dept" className="ab-select" value={f.department} onChange={set('department')}>
            <option value="">Select department</option>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Date hired or engagement start" htmlFor="ob-hired"><input id="ob-hired" type="date" className="ab-input" value={f.dateHired} onChange={set('dateHired')} /></Field>
        <Field label="Resignation or notice date" htmlFor="ob-notice"><input id="ob-notice" type="date" className="ab-input" value={f.noticeDate} onChange={set('noticeDate')} /></Field>
        <Field label="Last working day" required htmlFor="ob-lwd" error={tried && !f.lastWorkingDay ? 'Enter their last working day.' : undefined}>
          <input id="ob-lwd" type="date" className="ab-input" value={f.lastWorkingDay} onChange={set('lastWorkingDay')} aria-invalid={tried && !f.lastWorkingDay} />
        </Field>
        <Field label="Supervisor or project lead" htmlFor="ob-sup"><input id="ob-sup" className="ab-input" value={f.supervisor} onChange={set('supervisor')} /></Field>
      </div>
      <div><Button type="submit" variant="primary" busy={busy}>Add case</Button></div>
    </form>
  );
}

function CaseCard({ c }: { c: OffboardingCase }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [notes, setNotes] = useState(c.notes || '');
  const [confirm, setConfirm] = useState(false);
  const due = isOffboardingDue(c);
  const p = checklistProgress(c);
  const save = async (patch: Partial<OffboardingCase>, ok?: string) => {
    qc.setQueryData<OffboardingCase[]>(KEY, (list) => list?.map((x) => (x.id === c.id ? { ...x, ...patch } : x)));
    try {
      await saveOffboarding({ ...c, ...patch });
      if (ok) toast.show({ message: ok });
      await qc.invalidateQueries({ queryKey: KEY });
    } catch (e) {
      toast.error(`Couldn't save: ${(e as Error).message}`);
      await qc.invalidateQueries({ queryKey: KEY });
    }
  };
  return (
    <article className="app-card-plain grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h3 className="ab-card__title ab-normal-case app-case-name">{c.name}</h3>
          <p className="app-meta m-0">{[trackLabel(c.track), c.position, c.department].filter(Boolean).join(', ')}</p>
          <p className="app-meta m-0">Last working day {c.lastWorkingDay || 'not set'}{c.supervisor ? `. Supervisor: ${c.supervisor}` : ''}</p>
        </div>
        <div className="grid justify-items-end gap-1">
          {c.status === 'Completed' ? <Badge tone="success">Completed</Badge> : due ? <Badge tone="danger">Last day passed, still open</Badge> : <Badge tone="warning">In progress</Badge>}
          <span className="app-meta">{p.done} of {p.total} done</span>
        </div>
      </div>
      <ul className="app-checklist">
        {Object.keys(c.checklist || {}).map((item) => (
          <li key={item}>
            <label className="ab-check">
              <input type="checkbox" checked={!!c.checklist?.[item]} onChange={() => save({ checklist: { ...c.checklist, [item]: !c.checklist?.[item] } })} />
              <span className={c.checklist?.[item] ? 'app-done' : ''}>{item}</span>
              {/Ethel/i.test(item) && <Badge tone="info">Manual step</Badge>}
            </label>
          </li>
        ))}
      </ul>
      <Field label="Notes" htmlFor={`obn-${c.id}`}>
        <textarea id={`obn-${c.id}`} className="ab-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
          onBlur={() => { if (notes !== (c.notes || '')) void save({ notes }, 'Notes saved'); }} />
      </Field>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirm(true)}>Delete case</Button>
      </div>
      <ConfirmDialog open={confirm} danger title={`Delete ${c.name}'s case?`} confirmLabel="Delete" onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          try { await deleteOffboarding(c.id); toast.show({ message: 'Case deleted' }); } catch (e) { toast.error(`Couldn't delete: ${(e as Error).message}`); }
          await qc.invalidateQueries({ queryKey: KEY });
        }}>
        <p className="m-0">This removes the case and its checklist. It can't be undone.</p>
      </ConfirmDialog>
    </article>
  );
}
