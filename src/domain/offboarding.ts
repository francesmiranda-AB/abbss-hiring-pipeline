import type { OffboardingCase } from './types';
import { toCsv } from './csv';

// A case is due once its last working day has come and it isn't completed.
export function isOffboardingDue(c: OffboardingCase, now = new Date()): boolean {
  if (!c || c.status === 'Completed' || !c.lastWorkingDay) return false;
  const lwd = new Date(c.lastWorkingDay);
  if (isNaN(lwd.getTime())) return false;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  lwd.setHours(0, 0, 0, 0);
  return lwd.getTime() <= today.getTime();
}

// Open cases first, soonest last day first.
export function sortOffboarding(cases: OffboardingCase[]): OffboardingCase[] {
  return [...cases].sort((a, b) => {
    if ((a.status === 'Completed') !== (b.status === 'Completed')) return a.status === 'Completed' ? 1 : -1;
    const da = a.lastWorkingDay ? new Date(a.lastWorkingDay).getTime() : Infinity;
    const db = b.lastWorkingDay ? new Date(b.lastWorkingDay).getTime() : Infinity;
    return da - db;
  });
}

export const trackLabel = (t?: string) => (t === 'contractor' ? 'Independent contractor' : 'Regular employee');

export function checklistProgress(c: OffboardingCase): { done: number; total: number } {
  const items = Object.keys(c.checklist || {});
  return { done: items.filter((k) => c.checklist?.[k]).length, total: items.length };
}

export function offboardingCsv(cases: OffboardingCase[]): string {
  const headers = ['Name', 'Track', 'Position', 'Department', 'Date Hired', 'Notice Date', 'Last Working Day', 'Supervisor', 'Status', 'Checklist Progress', 'Notes'];
  return toCsv(headers, sortOffboarding(cases).map((c) => {
    const p = checklistProgress(c);
    return [c.name, trackLabel(c.track), c.position || '', c.department || '', c.dateHired || '', c.noticeDate || '', c.lastWorkingDay || '', c.supervisor || '', c.status || 'In Progress', `${p.done}/${p.total}`, c.notes || ''];
  }));
}
