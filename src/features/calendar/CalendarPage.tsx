import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Phone, Video } from 'lucide-react';
import { confirmInterview, getDavidBusy, removeInterviewSlot, unconfirmInterview } from '@/api/actions';
import { SNAPSHOT_KEY, useCandidate, useCandidates, useUpdateCandidate } from '@/api/queries';
import { useUser } from '@/auth/auth';
import { calendarItems, DEFAULT_INTERVIEW_DURATION_MIN, findOverlap, slotDate, type CalendarItem } from '@/domain/calendar';
import { roleScope } from '../candidates/filters';
import { useCandidateActions } from '../candidates/actions';
import { Badge, Button, Dialog, Empty, Field, Kpis, PageHeader, SectionHead, cx, fmtDateTime } from '@/ui/kit';
import { useToast } from '@/ui/toast';

const time = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function useBusy(year: number, month: number) {
  return useQuery({
    queryKey: ['davidBusy', year, month],
    queryFn: () => getDavidBusy(new Date(year, month, 1), new Date(year, month + 1, 1)),
    staleTime: 5 * 60_000,
    retry: false, // unavailable when the calendar isn't shared; that's fine, just nothing to show
  });
}

export default function CalendarPage() {
  const user = useUser();
  const { candidates } = useCandidates();
  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [open, setOpen] = useState<{ id: number; slotId: string } | null>(null);
  const items = useMemo(() => calendarItems(roleScope(candidates, user.role)), [candidates, user.role]);
  const busy = useBusy(view.year, view.month).data;
  const pending = items.filter((i) => i.status === 'pending');
  const confirmed = items.filter((i) => i.status === 'confirmed').sort((x, y) => (x.date?.getTime() ?? Infinity) - (y.date?.getTime() ?? Infinity));
  const undated = items.filter((i) => !i.date);
  const todayCount = confirmed.filter((i) => i.date?.toDateString() === now.toDateString()).length;
  const move = (d: number) => setView(({ year, month }) => { const m = new Date(year, month + d, 1); return { year: m.getFullYear(), month: m.getMonth() }; });

  return (
    <div className="app-stack">
      <PageHeader title="Interview calendar" lead="HR saves the time the candidate gave. David confirms it here, which adds it to his calendar with a Meet link and emails the candidate." />
      <Kpis items={[{ value: pending.length, label: 'Ready to confirm' }, { value: todayCount, label: 'Interviews today' }, { value: confirmed.filter((i) => i.date && i.date >= now).length, label: 'Coming up' }]} />
      {!items.length ? (
        <Empty icon={CalendarDays} title="No interview times yet">Times appear here once HR saves them on a candidate's Interview tab.</Empty>
      ) : (
        <div className="app-cal-layout">
          <section aria-label="Month">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="ab-card__title">{new Date(view.year, view.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
              <div className="ab-cluster">
                <Button size="sm" variant="tonal" icon={ChevronLeft} aria-label="Previous month" onClick={() => move(-1)} />
                <Button size="sm" variant="tonal" onClick={() => setView({ year: now.getFullYear(), month: now.getMonth() })}>Today</Button>
                <Button size="sm" variant="tonal" icon={ChevronRight} aria-label="Next month" onClick={() => move(1)} />
              </div>
            </div>
            {undated.length > 0 && (
              <div className="ab-alert ab-alert--warning mb-3">
                <span className="ab-alert__icon" aria-hidden><AlertTriangle size={18} /></span>
                <p className="ab-alert__title">These need a date (the text didn't say which day)</p>
                <div className="ab-cluster mt-1">{undated.map((i) => <button key={i.slot.id} type="button" className="app-link-button" onClick={() => setOpen({ id: i.candidateId, slotId: i.slot.id })}>{i.name}: {i.slot.label}</button>)}</div>
              </div>
            )}
            <MonthGrid year={view.year} month={view.month} items={items} busy={busy} onOpen={(i) => setOpen({ id: i.candidateId, slotId: i.slot.id })} />
            {busy && <p className="app-meta mt-2">Grey times are David's existing calendar (busy or free only; no event details).</p>}
          </section>
          <aside className="grid gap-6 content-start">
            <div>
              <SectionHead title="Ready to confirm" />
              {!pending.length ? <p className="ab-muted m-0">Nothing waiting.</p> : <ItemRows items={pending} onOpen={(i) => setOpen({ id: i.candidateId, slotId: i.slot.id })} />}
            </div>
            <div>
              <SectionHead title="Confirmed" />
              {!confirmed.length ? <p className="ab-muted m-0">None yet.</p> : <ItemRows items={confirmed} onOpen={(i) => setOpen({ id: i.candidateId, slotId: i.slot.id })} showContact />}
            </div>
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
      <div className="app-cal" role="grid" aria-label="Interviews by day">
        {DAYS.map((d) => <div key={d} className="app-cal__dow" role="columnheader">{d}</div>)}
        {Array.from({ length: cells }, (_, c) => {
          const day = c - first + 1;
          if (day < 1 || day > days) return <div key={c} className="app-cal__cell is-out" aria-hidden />;
          const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
          const dayBusy = (busy || []).filter((b) => b.start.getFullYear() === year && b.start.getMonth() === month && b.start.getDate() === day);
          return (
            <div key={c} role="gridcell" className={cx('app-cal__cell', isToday && 'is-today')}>
              <span className="app-cal__day">{day}{isToday && <span className="ab-visually-hidden"> (today)</span>}</span>
              {(byDay[day] || []).map((i) => (
                <button key={`${i.candidateId}-${i.slot.id}`} type="button" className={cx('app-cal__chip', i.status === 'confirmed' ? 'is-confirmed' : 'is-pending')} onClick={() => onOpen(i)}>
                  <span className="app-num">{time(i.date!)}</span> {i.name}
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
  const start = date && tm ? new Date(`${date}T${tm}`) : null;
  const month = useBusy(start?.getFullYear() ?? new Date().getFullYear(), start?.getMonth() ?? new Date().getMonth()).data;
  const overlap = !isConfirmed ? findOverlap(start, Number(duration), month) : null;
  if (!a || !slot) return null;
  const reload = () => qc.invalidateQueries({ queryKey: SNAPSHOT_KEY });

  const confirm = async () => {
    if (!start || isNaN(start.getTime())) { setError('Enter the real date and time. This is what goes on David\'s calendar.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await confirmInterview({ id, slotId, contact: a.candidateContact || '', startIso: start.toISOString(), durationMin: duration });
      await reload();
      await actions.advance(id, 'interviewScheduled', res.calendarWarning ? `Interview confirmed. ${res.calendarWarning}` : 'Interview confirmed');
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
    try { await unconfirmInterview(id); await reload(); toast.show({ message: 'Confirmation undone. The calendar event was removed.' }); }
    catch (e) { toast.error(`Couldn't undo: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await removeInterviewSlot(id, slotId); await reload(); toast.show({ message: 'Time removed' }); onClose(); }
    catch (e) { toast.error(`Couldn't remove it: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const meet = a.confirmedSlot?.meetLink && /^https:\/\/meet\.google\.com\//.test(a.confirmedSlot.meetLink) ? a.confirmedSlot.meetLink : '';

  return (
    <Dialog open onClose={onClose} title={a.name} footer={<>
      <Button variant="ghost" onClick={remove} disabled={busy}>Remove this time</Button>
      {isConfirmed ? <Button variant="tonal" busy={busy} onClick={undo}>Undo confirmation</Button> : <Button variant="primary" busy={busy} onClick={confirm}>Confirm this time</Button>}
    </>}>
      <div className="grid gap-4">
        <div className="grid gap-1">
          <span className="ab-label">Time the candidate gave</span>
          <span className="text-base font-semibold">{slot.label}</span>
          <span><Badge tone={isConfirmed ? 'success' : 'info'}>{isConfirmed ? 'Confirmed' : 'Ready to confirm'}</Badge></span>
        </div>
        <p className="m-0">{a.candidateContact ? <><Phone size={14} aria-hidden /> {a.candidateContact}</> : <span className="ab-muted">No phone number saved for this candidate.</span>}</p>
        {isConfirmed ? (
          <>
            <p className="m-0">Confirmed. The candidate has the confirmation email and their other times were declined.</p>
            {meet && <a href={meet} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2"><Video size={16} aria-hidden /> Join the Google Meet</a>}
            {a.candidateContact && (
              <label className="ab-check">
                <input type="checkbox" checked={!!a.smsSentAt} onChange={(e) => update(id, { smsSentAt: e.target.checked ? new Date().toISOString() : '' })} />
                HR texted the candidate{a.smsSentAt ? ` (${fmtDateTime(a.smsSentAt)})` : ''}
              </label>
            )}
          </>
        ) : (
          <>
            <div className="app-form-grid">
              <Field label="Date" htmlFor="cal-date"><input id="cal-date" type="date" className="ab-input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              <Field label="Time" htmlFor="cal-time"><input id="cal-time" type="time" className="ab-input" value={tm} onChange={(e) => setTm(e.target.value)} /></Field>
              <Field label="Length" htmlFor="cal-dur">
                <select id="cal-dur" className="ab-select" value={duration} onChange={(e) => setDuration(e.target.value)}>
                  <option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1.5 hours</option>
                </select>
              </Field>
            </div>
            {overlap && <div className="ab-alert ab-alert--warning"><span className="ab-alert__icon" aria-hidden><AlertTriangle size={18} /></span><p className="ab-alert__title">This overlaps David's calendar</p><div>He's busy {time(overlap.start)} to {time(overlap.end)}. Double-check before confirming.</div></div>}
            <p className="ab-hint m-0">Confirming adds it to David's calendar with a Google Meet link, emails the candidate the time and link, and declines their other times.</p>
            {error && <p className="ab-error m-0" role="alert">{error}</p>}
          </>
        )}
      </div>
    </Dialog>
  );
}
