import type { Candidate, RoleHealthOverride } from './types';
import { daysInStage, isSameLocalDay, isStageOverdue } from './attention';
import { SOURCES, isClosed, isPaused } from './stages';

const FOLLOW_UP_ACTIONS = ['Follow up Candidate', 'Follow up Client'];
// Plain-English names for "entered this stage today", in pipeline order.
export const TODAYS_PROGRESS_LABELS: Record<string, string> = {
  'New Application': 'New applications', 'CV Screening': 'CVs screened',
  'HR Preliminary Interview': 'HR preliminary interviews', 'Assessment Sent': 'Assessments sent',
  'Assessment Review': 'Assessments completed', 'Initial Interview': 'Initial interviews',
  'Operations Decision': 'Operations decisions', 'Endorsed to Client': 'Endorsed to client', Offer: 'Offers',
};

export type HealthStatus = 'green' | 'yellow' | 'red';
export interface CandidateRef { id: number; stage: string; nextAction: string; daysInStage: number | null }
export interface RoleSummary {
  role: string;
  activeCandidates: number;
  stageCounts: Record<string, number>;
  avgDaysInStage: Record<string, number>;
  needingFollowUp: CandidateRef[];
  overdue: CandidateRef[];
  todaysProgress: Record<string, number>;
  closedToday: { Rejected: number; Withdrawn: number; Hired: number };
  nextActionSummary: Array<{ action: string; count: number }>;
  blockers: string[];
  health: { status: HealthStatus; reason: string; source: 'auto' | 'PM override'; setBy?: string; setAt?: string };
  pmNote: string;
}

// Hiring Projects, computed from the records (per role category).
export function buildRoleSummary(apps: Candidate[], roleHealth: Record<string, RoleHealthOverride> = {}, now = new Date()): Record<string, RoleSummary> {
  const acc: Record<string, RoleSummary & { _daysSum: Record<string, number>; _daysCount: Record<string, number>; _tally: Record<string, number> }> = {};
  const ensure = (role: string) => acc[role] || (acc[role] = {
    role, activeCandidates: 0, stageCounts: {}, avgDaysInStage: {}, needingFollowUp: [], overdue: [], todaysProgress: {},
    closedToday: { Rejected: 0, Withdrawn: 0, Hired: 0 }, nextActionSummary: [], blockers: [],
    health: { status: 'green', reason: '', source: 'auto' }, pmNote: '', _daysSum: {}, _daysCount: {}, _tally: {},
  });
  for (const a of apps) {
    const b = ensure(a.roleCategory || '(Unassigned)');
    const stage = a.candidateStage || '(Not set)';
    const closed = isClosed(a);
    const paused = isPaused(a);
    if (!closed) b.activeCandidates++;
    b.stageCounts[stage] = (b.stageCounts[stage] || 0) + 1;
    const days = daysInStage(a, now.getTime());
    if (!closed && !paused && days !== null) {
      b._daysSum[stage] = (b._daysSum[stage] || 0) + days;
      b._daysCount[stage] = (b._daysCount[stage] || 0) + 1;
    }
    const ref: CandidateRef = { id: a.id, stage, nextAction: a.nextAction || '', daysInStage: days };
    if (!closed) {
      if (FOLLOW_UP_ACTIONS.includes(a.nextAction || '')) b.needingFollowUp.push(ref);
      if (!paused && isStageOverdue(a, now.getTime())) b.overdue.push(ref);
      if (a.nextAction) b._tally[a.nextAction] = (b._tally[a.nextAction] || 0) + 1;
    }
    for (const [st, at] of Object.entries(a.candidateStageDates || {})) {
      if (!isSameLocalDay(at, now)) continue;
      const label = TODAYS_PROGRESS_LABELS[st];
      if (label) b.todaysProgress[label] = (b.todaysProgress[label] || 0) + 1;
      if (st === 'Closed - Rejected') b.closedToday.Rejected++;
      if (st === 'Closed - Withdrawn') b.closedToday.Withdrawn++;
      if (st === 'Hired') b.closedToday.Hired++;
    }
  }
  const out: Record<string, RoleSummary> = {};
  for (const [role, b] of Object.entries(acc)) {
    for (const st of Object.keys(b._daysSum)) b.avgDaysInStage[st] = Math.round((b._daysSum[st] / b._daysCount[st]) * 10) / 10;
    b.nextActionSummary = Object.entries(b._tally).map(([action, count]) => ({ action, count })).sort((x, y) => y.count - x.count).slice(0, 3);
    const byStage: Record<string, { count: number; daysSum: number }> = {};
    for (const c of b.overdue) {
      byStage[c.stage] = byStage[c.stage] || { count: 0, daysSum: 0 };
      byStage[c.stage].count++;
      byStage[c.stage].daysSum += c.daysInStage || 0;
    }
    b.blockers = Object.entries(byStage).map(([st, o]) => `${o.count} candidate(s) stuck at ${st} (avg ${Math.round((o.daysSum / o.count) * 10) / 10} days)`);
    const auto = b.activeCandidates === 0 ? { status: 'red' as const, reason: 'No active candidates in the pipeline.' }
      : b.activeCandidates === 1 ? { status: 'yellow' as const, reason: 'Only one active candidate in the pipeline.' }
      : b.overdue.length ? { status: 'yellow' as const, reason: `${b.overdue.length} candidate(s) past the expected time in their current stage.` }
      : { status: 'green' as const, reason: 'Healthy pipeline.' };
    const ov = roleHealth[role];
    b.health = ov?.status
      ? { status: ov.status as HealthStatus, reason: ov.reason || '', source: 'PM override', setBy: ov.setBy, setAt: ov.setAt }
      : { ...auto, source: 'auto' };
    b.pmNote = ov?.pmNote || '';
    out[role] = {
      role: b.role, activeCandidates: b.activeCandidates, stageCounts: b.stageCounts, avgDaysInStage: b.avgDaysInStage,
      needingFollowUp: b.needingFollowUp, overdue: b.overdue, todaysProgress: b.todaysProgress, closedToday: b.closedToday,
      nextActionSummary: b.nextActionSummary, blockers: b.blockers, health: b.health, pmNote: b.pmNote,
    };
  }
  return out;
}

export const HEALTH_LABEL: Record<HealthStatus, string> = { green: 'On track', yellow: 'Needs attention', red: 'At risk' };

export interface SourceRow { source: string; total: number; hired: number; rejectedOrNC: number; deciding: number; passRate: number | null }
// Whether each source produced hires. Departed counts as a hire on purpose.
export function sourceBreakdown(apps: Candidate[]): SourceRow[] {
  const by: Record<string, SourceRow> = {};
  const bucket = (s: string) => by[s] || (by[s] = { source: s, total: 0, hired: 0, rejectedOrNC: 0, deciding: 0, passRate: null });
  SOURCES.forEach(bucket);
  bucket('Not specified');
  for (const a of apps) {
    const b = bucket((a.source || '').trim() || 'Not specified');
    b.total++;
    if (a.overallStatus === 'Hired' || a.overallStatus === 'Departed') b.hired++;
    else if (a.overallStatus === 'Rejected' || a.overallStatus === 'NonCompliant') b.rejectedOrNC++;
    else b.deciding++;
  }
  return Object.values(by).map((b) => {
    const decided = b.hired + b.rejectedOrNC;
    return { ...b, passRate: decided > 0 ? Math.round((b.hired / decided) * 100) : null };
  }).sort((x, y) => y.total - x.total);
}
