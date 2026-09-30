import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AppRole, Candidate, ServerConfig } from '@/domain/types';
import { isNewApplicant, needsAttention, needsAttentionFrom } from '@/domain/attention';
import { CANDIDATE_STAGES, isClosed, isEndorsedToOperations, stageIndex } from '@/domain/stages';
import { gritOf, valuesOf } from '@/domain/assessments';

// The Candidates filters live in the URL, so Table and Board share them, the
// back button works, and a filtered view can be linked.

export type Chip = 'active' | 'new' | 'attention' | 'overdue' | 'nonresponsive' | 'all';
export const CHIPS: Array<{ key: Chip; label: string }> = [
  { key: 'active', label: 'Active' },
  { key: 'attention', label: 'Needs action' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'new', label: 'New today' },
  { key: 'nonresponsive', label: "Doesn't respond" },
  { key: 'all', label: 'Everyone' },
];

export interface Filters {
  q: string; chip: Chip; view: 'table' | 'board';
  dept: string; role: string; stage: string; status: string; source: string; emm: string; grit: string; values: string;
  sort: string; dir: 'asc' | 'desc';
}
const DEFAULTS: Filters = { q: '', chip: 'active', view: 'table', dept: '', role: '', stage: '', status: '', source: '', emm: '', grit: '', values: '', sort: '', dir: 'asc' };
export const ADVANCED_KEYS: Array<keyof Filters> = ['dept', 'role', 'stage', 'status', 'source', 'emm', 'grit', 'values'];

export function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo<Filters>(() => {
    const f = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS) as Array<keyof Filters>) {
      const v = params.get(k);
      if (v !== null) (f as Record<string, string>)[k] = v;
    }
    return f;
  }, [params]);
  const set = useCallback((patch: Partial<Filters>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '' || v === (DEFAULTS as unknown as Record<string, string>)[k]) next.delete(k);
        else next.set(k, String(v));
      }
      return next;
    }, { replace: true });
  }, [setParams]);
  return { filters, set };
}

// Everything the search looks through, notes included.
export function searchText(a: Candidate): string {
  return [a.name, a.email, a.phone, a.position, a.resumeNotes, a.decisionNotes, a.grit?.notes, a.values?.notes, a.emm?.notes, a.interview?.notes]
    .filter(Boolean).join(' ').toLowerCase();
}

// Operations sees only candidates handed to them; everyone else sees all.
export function roleScope(apps: Candidate[], role: AppRole): Candidate[] {
  return role === 'Operations' ? apps.filter(isEndorsedToOperations) : apps;
}

export function chipMatch(a: Candidate, chip: Chip, role: AppRole, config: ServerConfig, hasStageFilter: boolean): boolean {
  switch (chip) {
    case 'active': return hasStageFilter || !isClosed(a);
    case 'new': return isNewApplicant(a);
    case 'attention': return needsAttentionFrom(a, role, config);
    case 'overdue': return !!needsAttention(a, config)?.overdue;
    case 'nonresponsive': return a.overallStatus === 'NonCompliant';
    default: return true;
  }
}

// Filters other than the chip (the chip counts are computed on top of these).
export function applyFilters(apps: Candidate[], f: Filters): Candidate[] {
  const q = f.q.trim().toLowerCase();
  return apps.filter((a) => {
    if (q && !searchText(a).includes(q)) return false;
    if (f.dept && a.department !== f.dept) return false;
    if (f.role === '__none__' ? !!a.roleCategory : f.role && a.roleCategory !== f.role) return false;
    if (f.stage === '__none__' ? !!a.candidateStage : f.stage && a.candidateStage !== f.stage) return false;
    if (f.status && a.overallStatus !== f.status) return false;
    if (f.source && (a.source || '') !== f.source) return false;
    if (f.emm === 'pass' && !(a.emm?.graded && a.emm.pass)) return false;
    if (f.emm === 'fail' && !(a.emm?.graded && a.emm.pass === false)) return false;
    if (f.grit && gritOf(a).label !== f.grit) return false;
    if (f.values && valuesOf(a).label !== f.values) return false;
    return true;
  });
}

export function sortCandidates(apps: Candidate[], sort: string, dir: 'asc' | 'desc'): Candidate[] {
  const out = [...apps].sort((x, y) => new Date(y.createdAt || 0).getTime() - new Date(x.createdAt || 0).getTime());
  if (!sort) return out;
  const m = dir === 'asc' ? 1 : -1;
  if (sort === 'stage') return out.sort((x, y) => (stageIndex(x.candidateStage) - stageIndex(y.candidateStage)) * m);
  return out.sort((x, y) => String(x[sort] ?? '').toLowerCase().localeCompare(String(y[sort] ?? '').toLowerCase()) * m);
}

export const STAGE_FILTER_OPTIONS = [{ value: '__none__', label: 'No stage set' }, ...CANDIDATE_STAGES.map((s) => ({ value: s, label: s }))];
