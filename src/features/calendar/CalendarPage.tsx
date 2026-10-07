import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarCheck, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Phone, UserRound, Video } from 'lucide-react';
import { confirmInterview, getInterviewerBusy, removeInterviewSlot, unconfirmInterview } from '@/api/actions';
import { SNAPSHOT_KEY, useCandidate, useCandidates, useUpdateCandidate } from '@/api/queries';
import { useUser } from '@/auth/auth';
import { calendarItems, DEFAULT_INTERVIEW_DURATION_MIN, findOverlap, slotDate, type CalendarItem } from '@/domain/calendar';
import { roleScope } from '../candidates/filters';
import { useCandidateActions } from '../candidates/actions';
import { Badge, Button, ConfirmDialog, Dialog, DialogGroup, Empty, Field, PageHeader, Section, cx, fmtDateTime } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import type { Candidate } from '@/domain/types';

const time = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function useBusy(year: number, month: number) {
  return useQuery({
    queryKey: ['davidBusy', year, month],
    queryFn: () => getInterviewerBusy(new Date(year, month, 1), new Date(year, month + 1, 1)),
    staleTime: 5 * 60_000,
    retry: false, // unavailable when the calendar isn't shared; that's fine, just nothing to show
  });
}

export default function CalendarPage() {
  const user = useUser();
  const { candidates } = useCandidates();
  const now = new Date();
  const items = useMemo(() => calendarItems(roleScope(candidates, user.role)), [candidates, user.role]);
  // Open on the month of the time closest to today, not an empty current month.
  const [view, setView] = useState(() => {
    const dated = items.filter((i): i is typeof i & { date: Date } => !!i.date);
    const pick = dated.sort((x, y) => Math.abs(x.date.getTime() - now.getTime()) - Math.abs(y.date.getTime() - now.getTime()))[0];
    return pick ? { year: pick.date.getFullYear(), month: pick.date.getMonth() } : { year: now.getFullYear(), month: now.getMonth() };
  });
  const [open, setOpen] = useState<{ id: number; slotId: string } | null>(null);
  const busy = useBusy(view.year, view.month).data;
  const allPending = items.filter((i) => i.status === 'pending');
  // A time that has gone by without being confirmed is not "ready to confirm" any more.
  const pending = allPending.filter((i) => !i.date || i.date >= now);
  const passed = allPending.filter((i) => i.date && i.date < now);
  const confirmed = items.filter((i) => i.status === 'confirmed').sort((x, y) => (x.date?.getTime() ?? Infinity) - (y.date?.getTime() ?? Infinity));
  const undated = items.filter((i) => !i.date);
  const upcoming = confirmed.filter((i) => i.date && i.date >= now).length;
  // An empty month while times exist elsewhere: say so and offer the nearest one.
  const dated = items.filter((i): i is typeof i & { date: Date } => !!i.date);
  const inView = dated.filter((i) => i.date.getFullYear() === view.year && i.date.getMonth() === view.month);
  const nearest = dated.length && !inView.length
    ? dated.reduce((best, i) => (Math.abs(i.date.getTime() - now.getTime()) < Math.abs(best.date.getTime() - now.getTime()) ? i : best))
    : null;
  const monthName = (y: number, m: number) => new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const todayCount = confirmed.filter((i) => i.date?.toDateString() === now.toDateString()).length;
  const move = (d: number) => setView(({ year, month }) => { const m = new Date(year, month + d, 1); return { year: m.getFullYear(), month: m.getMonth() }; });

  return (
    <div className="app-stack">
      <PageHeader title="Interview calendar" lead={`${pending.length} ready to confirm, ${todayCount} today, ${upcoming} coming up`} />
      {!items.length ? (
        <Empty icon={CalendarDays} title="No interview times yet">Times appear here once HR saves them on a candidate's Interview tab.</Empty>
      ) : (
        <div className="app-cal-layout">
          <section aria-label="Month" className="app-cal-stack">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="ab-card__title">{new Date(view.year, view.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
              <div className="ab-cluster">
                <Button size="sm" variant="tonal" icon={ChevronLeft} aria-label="Previous month" onClick={() => move(-1)} />
                <Button size="sm" variant="tonal" onClick={() => setView({ year: now.getFullYear(), month: now.getMonth() })}>Today</Button>
                <Button size="sm" variant="tonal" icon={ChevronRight} aria-label="Next month" onClick={() => move(1)} />
              </div>
            </div>
            {undated.length > 0 && (
              <div className="ab-alert ab-alert--warning">
                <span className="ab-alert__icon" aria-hidden><AlertTriangle size={18} /></span>
                <p className="ab-alert__title">These need a date (the text didn't say which day)</p>
                <div className="ab-cluster">{undated.map((i) => <button key={i.slot.id} type="button" className="app-link-button" onClick={() => setOpen({ id: i.candidateId, slotId: i.slot.id })}>{i.name}: {i.slot.label}</button>)}</div>
              </div>
            )}
            {nearest && (
              <div className="ab-alert">
                <p className="ab-alert__title">Nothing in {monthName(view.year, view.month)}</p>
                <div>{dated.length} time{dated.length === 1 ? ' is' : 's are'} in other months.
                  {' '}<button type="button" className="app-link-button" onClick={() => setView({ year: nearest.date.getFullYear(), month: nearest.date.getMonth() })}>Go to {monthName(nearest.date.getFullYear(), nearest.date.getMonth())}</button>
                </div>
              </div>
            )}
            <MonthGrid year={view.year} month={view.month} items={items} busy={busy} onOpen={(i) => setOpen({ id: i.candidateId, slotId: i.slot.id })} />
            {busy && <p className="app-meta m-0">Grey times are already busy on the interviewer's calendar.</p>}
          </section>
          <aside className="grid gap-6 content-start">
            <Section title="Ready to confirm" count={pending.length} countTone="warning" lead="Confirming adds it to the interviewer's calendar and emails the candidate.">
              {!pending.length ? <p className="ab-muted m-0">Nothing waiting.</p> : <ItemRows items={pending} onOpen={(i) => setOpen({ id: i.candidateId, slotId: i.slot.id })} />}
            </Section>
            {passed.length > 0 && (
              <Section title="Passed, needs a new time" count={passed.length} countTone="danger" lead="Never confirmed, and the time has gone by. Ask the candidate for a new one, or remove these.">
                <ItemRows items={passed} onOpen={(i) => setOpen({ id: i.candidateId, slotId: i.slot.id })} />
              </Section>
            )}
            <Section title="Confirmed" count={confirmed.length} countTone="success">
              {!confirmed.length ? <p className="ab-muted m-0">None yet.</p> : <ItemRows items={confirmed} onOpen={(i) => setOpen({ id: i.candidateId, slotId: i.slot.id })} showContact />}
            </Section>
          </aside>
        </div>
      )}
      {open && <SlotDialog id={open.id} slotId={open.slotId} onClose={() => setOpen(null)} />}
    </div>
  );
}

function MonthGrid({ year, month, items, busy, onOpen }: { year: number; month: number; items: CalendarItem[]; busy?: Array<{ start: Date; end: Date }>; onOpen: (i: CalendarItem) => void }) {
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Math.ceil((first + days) / 7) * 7;
  const today = new Date();
  const byDay: Record<number, CalendarItem[]> = {};
  for (const i of items) if (i.date && i.date.getFullYear() === year && i.date.getMonth() === month) (byDay[i.date.getDate()] ||= []).push(i);
  Object.values(byDay).forEach((l) => l.sort((x, y) => x.date!.getTime() - y.date!.getTime()));
  return (
    <div className="app-cal-scroll">
      <div className="app-cal" aria-label="Interviews by day">
        {DAYS.map((d) => <div key={d} className="app-cal__dow">{d}</div>)}
        {Array.from({ length: cells }, (_, c) => {
          const day = c - first + 1;
          if (day < 1 || day > days) return <div key={c} className="app-cal__cell is-out" aria-hidden />;
          const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
          const dayBusy = (busy || []).filter((b) => b.start.getFullYear() === year && b.start.getMonth() === month && b.start.getDate() === day);
          return (
            <div key={c} className={cx('app-cal__cell', isToday && 'is-today')}>
              <span className="app-cal__day">{day}{isToday && <span className="ab-visually-hidden"> (today)</span>}</span>
              {(byDay[day] || []).map((i) => (
                <button key={`${i.candidateId}-${i.slot.id}`} type="button" className={cx('app-cal__chip', i.status === 'confirmed' ? 'is-confirmed' : i.date! < new Date() ? 'is-passed' : 'is-pending')} title={`${time(i.date!)} ${i.name}${i.status !== 'confirmed' && i.date! < new Date() ? ', passed and never confirmed' : ''}`} onClick={() => onOpen(i)}>
                  <span className="app-num app-cal__time">{time(i.date!)}</span><span className="app-cal__who">{i.name}</span>
                </button>
              ))}
              {dayBusy.map((b, k) => <span key={k} className="app-cal__busy">{time(b.start)} to {time(b.end)} busy</span>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ItemRows({ items, onOpen, showContact }: { items: CalendarItem[]; onOpen: (i: CalendarItem) => void; showContact?: boolean }) {
  return (
    <ul className="ab-rows">
      {items.map((i) => (
        <li key={`${i.candidateId}-${i.slot.id}`}>
          <button type="button" className="app-row-button app-side-row" onClick={() => onOpen(i)}>
            <span className="font-semibold">{i.name}</span>
            <span className="app-meta">{i.date ? fmtDateTime(i.date.toISOString()) : i.slot.label}</span>
            {showContact && i.contact && <span className="app-meta"><Phone size={12} aria-hidden /> {i.contact}{i.smsSentAt ? ', texted' : ''}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function SlotDialog({ id, slotId, onClose }: { id: number; slotId: string; onClose: () => void }) {
  const a = useCandidate(id);
  const qc = useQueryClient();
  const toast = useToast();
  const update = useUpdateCandidate();
  const actions = useCandidateActions();
  const slot = a?.interviewSlots?.find((s) => String(s.id) === String(slotId));
  const isConfirmed = !!(a?.confirmedSlot && String(a.confirmedSlot.id) === String(slotId));
  const guess = slot ? slotDate(slot, isConfirmed ? a!.confirmedSlot : null) : null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const [date, setDate] = useState(guess ? `${guess.getFullYear()}-${pad(guess.getMonth() + 1)}-${pad(guess.getDate())}` : '');
  const [tm, setTm] = useState(guess ? `${pad(guess.getHours())}:${pad(guess.getMinutes())}` : '');
  const [duration, setDuration] = useState(String(DEFAULT_INTERVIEW_DURATION_MIN));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ask, setAsk] = useState<'remove' | 'undo' | null>(null);
  const start = date && tm ? new Date(`${date}T${tm}`) : null;
  const month = useBusy(start?.getFullYear() ?? new Date().getFullYear(), start?.getMonth() ?? new Date().getMonth()).data;
  const overlap = !isConfirmed ? findOverlap(start, Number(duration), month) : null;
  if (!a || !slot) return null;
  const reload = () => qc.invalidateQueries({ queryKey: SNAPSHOT_KEY });
  // Show the server's answer on screen at once; the full reload (about 5 s) runs in the background.
  const patchLocal = (patch: Partial<Candidate>) =>
    qc.setQueryData<{ candidates: Candidate[] }>(SNAPSHOT_KEY, (s) => s && { ...s, candidates: s.candidates.map((x) => (x.id === id ? { ...x, ...patch } : x)) });

  const confirm = async () => {
    if (!start || isNaN(start.getTime())) { setError('Enter the real date and time for the calendar.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await confirmInterview({ id, slotId, contact: a.candidateContact || '', startIso: start.toISOString(), durationMin: duration });
      patchLocal({ confirmedSlot: { ...slot, startIso: start.toISOString(), durationMin: Number(duration), meetLink: res.meetLink }, confirmedAt: new Date().toISOString() });
      onClose();
      // The stage move saves only the stage, then the list refreshes; neither holds up the person.
      void actions.advance(id, 'interviewScheduled', res.calendarWarning ? `Interview confirmed. ${res.calendarWarning}` : 'Interview confirmed').then(() => reload());
    } catch (e) {
      // The confirm may have gone through even if the answer didn't come back: check before saying it failed.
      await reload();
      const fresh = qc.getQueryData<{ candidates: typeof a[] }>(SNAPSHOT_KEY)?.candidates.find((x) => x.id === id);
      if (fresh?.confirmedSlot && String(fresh.confirmedSlot.id) === String(slotId)) toast.show({ message: 'Interview confirmed' });
      else setError(`Couldn't confirm: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const undo = async () => {
    setBusy(true);
    try { await unconfirmInterview(id); patchLocal({ confirmedSlot: null, confirmedAt: '' }); toast.show({ message: 'Confirmation undone. The calendar event was removed.' }); void reload(); }
    catch (e) { toast.error(`Couldn't undo: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await removeInterviewSlot(id, slotId); patchLocal({ interviewSlots: (a.interviewSlots || []).filter((s) => String(s.id) !== String(slotId)) }); toast.show({ message: 'Time removed' }); onClose(); void reload(); }
    catch (e) { toast.error(`Couldn't remove it: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const meet = a.confirmedSlot?.meetLink && /^https:\/\/meet\.google\.com\//.test(a.confirmedSlot.meetLink) ? a.confirmedSlot.meetLink : '';

  return (
    <Dialog open onClose={onClose} title={`Interview with ${a.name}`} footer={<>
      <Button variant="ghost" className="app-btn-danger-text mr-auto" onClick={() => setAsk('remove')} disabled={busy}>Remove this time</Button>
      {isConfirmed ? <Button variant="tonal" className="app-btn-danger-text" busy={busy} onClick={() => setAsk('undo')}>Undo confirmation</Button> : <Button variant="primary" busy={busy} onClick={confirm}>Confirm this time</Button>}
    </>}>
      <ConfirmDialog open={ask === 'remove'} danger title="Remove this time?" confirmLabel="Remove" busy={busy} onClose={() => setAsk(null)}
        onConfirm={async () => { await remove(); setAsk(null); }}>
        <p className="m-0">{slot.label} is taken off the calendar{isConfirmed ? ', and the confirmed event is deleted' : ''}. The candidate is not told.</p>
      </ConfirmDialog>
      <ConfirmDialog open={ask === 'undo'} danger title="Undo the confirmation?" confirmLabel="Remove from calendar" busy={busy} onClose={() => setAsk(null)}
        onConfirm={async () => { await undo(); setAsk(null); }}>
        <p className="m-0">The Google Calendar event and Meet link are deleted. The candidate keeps the email they already received, so tell them yourself.</p>
      </ConfirmDialog>
      <div className="app-dialog-groups">
        <DialogGroup title="Candidate" icon={UserRound}>
          <div className="grid gap-1">
            <span className="ab-label">Time the candidate gave</span>
            <span className="text-base font-semibold">{slot.label}</span>
            <span><Badge tone={isConfirmed ? 'success' : 'info'}>{isConfirmed ? 'Confirmed' : 'Ready to confirm'}</Badge></span>
          </div>
          <p className="m-0">{a.candidateContact ? <><Phone size={14} aria-hidden /> {a.candidateContact}</> : <span className="ab-muted">No phone number saved for this candidate.</span>}</p>
        </DialogGroup>
        {isConfirmed ? (
          <DialogGroup title="Interview" icon={CalendarCheck} tone="green">
            <p className="m-0">Confirmed. The candidate has the confirmation email and their other times were declined.</p>
            {meet && <a href={meet} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2"><Video size={16} aria-hidden /> Join the Google Meet</a>}
            {a.candidateContact && (
              <label className="ab-check">
                <input type="checkbox" checked={!!a.smsSentAt} onChange={(e) => update(id, { smsSentAt: e.target.checked ? new Date().toISOString() : '' })} />
                HR texted the candidate{a.smsSentAt ? ` (${fmtDateTime(a.smsSentAt)})` : ''}
              </label>
            )}
          </DialogGroup>
        ) : (
          <DialogGroup title="Confirm this interview" icon={CalendarClock} tone="blue">
            <div className="app-form-grid">
              <Field label="Date" htmlFor="cal-date"><input id="cal-date" type="date" className="ab-input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              <Field label="Time" htmlFor="cal-time"><input id="cal-time" type="time" className="ab-input" value={tm} onChange={(e) => setTm(e.target.value)} /></Field>
              <Field label="Length" htmlFor="cal-dur">
                <select id="cal-dur" className="ab-select" value={duration} onChange={(e) => setDuration(e.target.value)}>
                  <option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1.5 hours</option>
                </select>
              </Field>
            </div>
            {overlap && <div className="ab-alert ab-alert--warning"><span className="ab-alert__icon" aria-hidden><AlertTriangle size={18} /></span><p className="ab-alert__title">This overlaps the interviewer's calendar</p><div>Busy {time(overlap.start)} to {time(overlap.end)}. Double-check before confirming.</div></div>}
            <p className="ab-hint m-0">Confirming adds it to the calendar with a Meet link and emails the candidate.</p>
            {error && <p className="ab-error m-0" role="alert">{error}</p>}
          </DialogGroup>
        )}
      </div>
    </Dialog>
  );
}
