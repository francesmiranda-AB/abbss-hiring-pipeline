import type { Candidate, InterviewSlot } from './types';

export const DEFAULT_INTERVIEW_DURATION_MIN = 45;

// HR types slot labels from a phone call ("Wed, Aug 05, 3:00 PM"). Without a
// year the browser guesses 2001, so inject this year (or next, when that puts
// the date more than a month in the past).
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

// The way HR actually types times: "Sept 3 9pm onwards", "Aug 11 - 8pm",
// "Aug 26 2026 - 2pm", "Mon, Oct 5 - 2:00 PM". Month name, day, optional year,
// then the first time of day. Anything after that is ignored.
function parseLoose(label: string, now: Date): Date | null {
  const s = label.toLowerCase().replace(/[–—]/g, '-');
  const md = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s*(\d{4}))?/);
  if (!md) return null;
  const month = MONTHS[md[1]];
  const day = Number(md[2]);
  const rest = s.slice((md.index || 0) + md[0].length);
  const tm = rest.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/) || rest.match(/\b(\d{1,2}):(\d{2})\b()/);
  if (!tm) return null;
  let hour = Number(tm[1]) % 12;
  if (tm[3] === 'pm') hour += 12;
  if (!tm[3]) hour = Number(tm[1]);
  const d = new Date(md[3] ? Number(md[3]) : now.getFullYear(), month, day, hour, Number(tm[2] || 0));
  if (isNaN(d.getTime()) || d.getDate() !== day) return null;
  if (!md[3] && (d.getTime() - now.getTime()) / 86400000 < -30) d.setFullYear(d.getFullYear() + 1);
  return d;
}

export function parseSlotLabel(label: string, now = new Date()): Date | null {
  const loose = parseLoose(String(label || ''), now);
  if (loose) return loose;
  try {
    const cleaned = String(label).replace(/–|—/g, '-');
    const hasYear = /\b\d{4}\b/.test(cleaned);
    let toParse = cleaned;
    if (!hasYear) {
      const m = cleaned.match(/([A-Za-z]{3,9}\.?\s+\d{1,2})/);
      if (m) toParse = cleaned.replace(m[0], `${m[0]}, ${now.getFullYear()}`);
    }
    const d = new Date(toParse.replace(/-\s*/, ' '));
    if (isNaN(d.getTime())) return null;
    if (!hasYear && (d.getTime() - now.getTime()) / 86400000 < -30) d.setFullYear(d.getFullYear() + 1);
    return d;
  } catch {
    return null;
  }
}

// The real date once David confirmed with the date picker (which also stores
// durationMin); older slots' startIso is a backend guess that can be the wrong year.
export function slotDate(slot: InterviewSlot, confirmed: InterviewSlot | null | undefined, now = new Date()): Date | null {
  if (confirmed?.startIso && confirmed.durationMin) {
    const d = new Date(confirmed.startIso);
    if (!isNaN(d.getTime())) return d;
  }
  return parseSlotLabel(slot.label, now);
}

export interface CalendarItem {
  candidateId: number;
  name: string;
  position: string;
  contact: string;
  slot: InterviewSlot;
  date: Date | null;
  status: 'pending' | 'confirmed';
  smsSentAt: string;
}

// One item per (candidate, slot) worth showing. Once confirmed, the other
// proposed times are hidden.
export function calendarItems(apps: Candidate[], now = new Date()): CalendarItem[] {
  const out: CalendarItem[] = [];
  for (const a of apps) {
    const slots = a.interviewSlots || [];
    if (!slots.length) continue;
    const confirmed = a.confirmedSlot || null;
    const relevant = confirmed ? slots.filter((s) => String(s.id) === String(confirmed.id)) : slots;
    for (const s of relevant) {
      const isConfirmed = !!confirmed && String(confirmed.id) === String(s.id);
      out.push({
        candidateId: a.id, name: a.name, position: a.position || '', contact: a.candidateContact || '',
        slot: s, date: slotDate(s, isConfirmed ? confirmed : null, now), status: isConfirmed ? 'confirmed' : 'pending', smsSentAt: a.smsSentAt || '',
      });
    }
  }
  return out;
}

export interface BusyBlock { start: Date; end: Date }
export function findOverlap(date: Date | null, durationMin: number, busy: BusyBlock[] | null | undefined): BusyBlock | null {
  if (!date || !busy) return null;
  const end = new Date(date.getTime() + durationMin * 60000);
  return busy.find((b) => date < b.end && end > b.start) || null;
}
