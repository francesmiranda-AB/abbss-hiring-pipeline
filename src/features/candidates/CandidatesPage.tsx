import { useMemo, useState } from 'react';
import { Download, LayoutGrid, Rows3, Search, SlidersHorizontal, Users } from 'lucide-react';
import { useCandidates, useConfig } from '@/api/queries';
import { useUser } from '@/auth/auth';
import { candidatesCsv, downloadText, todayStamp } from '@/domain/csv';
import { DEPARTMENTS, ROLE_OPTIONS, SOURCES } from '@/domain/stages';
import { Button, Empty, ErrorAlert, PageHeader, Skeleton, cx } from '@/ui/kit';
import { ADVANCED_KEYS, CHIPS, STAGE_FILTER_OPTIONS, applyFilters, chipMatch, roleScope, sortCandidates, useFilters } from './filters';
import { CandidateTable } from './CandidateTable';
import { CandidateBoard } from './CandidateBoard';
import { BulkBar } from './BulkBar';
import { CandidatePanel, useOpenCandidate } from '../candidate/CandidatePanel';

export default function CandidatesPage() {
  const user = useUser();
  const config = useConfig();
  const { candidates, isLoading, error } = useCandidates();
  const { filters, set } = useFilters();
  const [showFilters, setShowFilters] = useState(() => ADVANCED_KEYS.some((k) => filters[k]));
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const { openId, open } = useOpenCandidate();
  const readOnly = user.role === 'PM';
  const canBulk = user.role === 'HR';

  const scoped = useMemo(() => applyFilters(roleScope(candidates, user.role), filters), [candidates, user.role, filters]);
  const hasStageFilter = !!(filters.stage || filters.status);
  const counts = useMemo(() => Object.fromEntries(CHIPS.map((c) => [c.key, scoped.filter((a) => chipMatch(a, c.key, user.role, config, hasStageFilter)).length])), [scoped, user.role, config, hasStageFilter]);
  const shown = useMemo(() => sortCandidates(scoped.filter((a) => chipMatch(a, filters.chip, user.role, config, hasStageFilter)), filters.sort, filters.dir), [scoped, filters, user.role, config, hasStageFilter]);
  const view = readOnly ? 'board' : filters.view;
  const selectedList = shown.filter((a) => selected.has(a.id));

  if (error) return <ErrorAlert title="Couldn't load candidates">{error.message}</ErrorAlert>;
  if (isLoading) return <Skeleton lines={8} />;

  return (
    <div className="app-stack">
      <PageHeader
        title="Candidates"
        lead={user.role === 'Operations' ? 'Candidates endorsed to Operations: Initial Interview and later.' : `${shown.length} shown`}
        actions={<>
          {!readOnly && (
            <div className="ab-tabs ab-tabs--pills" role="tablist" aria-label="View">
              <button type="button" role="tab" className="ab-tab" aria-selected={view === 'table'} onClick={() => set({ view: 'table' })}><Rows3 size={14} aria-hidden /> Table</button>
              <button type="button" role="tab" className="ab-tab" aria-selected={view === 'board'} onClick={() => set({ view: 'board' })}><LayoutGrid size={14} aria-hidden /> Board</button>
            </div>
          )}
          <Button variant="outline" size="sm" icon={Download} onClick={() => downloadText(`ABBSS_Candidates_${todayStamp()}.csv`, candidatesCsv(shown))} disabled={!shown.length}>Export CSV</Button>
        </>}
      />

      <div className="ab-kpis app-chips" role="tablist" aria-label="Quick views">
        {CHIPS.map((c) => (
          <button key={c.key} type="button" role="tab" aria-selected={filters.chip === c.key} className={cx('ab-kpi app-kpi-button app-chip', filters.chip === c.key && 'is-active')} onClick={() => set({ chip: c.key })}>
            <span className="ab-kpi__value">{counts[c.key]}</span>
            <span className="ab-kpi__label">{c.label}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        <div className="app-toolbar">
          <label className="app-search">
            <Search size={16} aria-hidden />
            <span className="ab-visually-hidden">Search candidates</span>
            <input className="ab-input" type="search" placeholder="Search name, email, phone, position or any notes" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
          </label>
          <Button variant={showFilters ? 'secondary' : 'tonal'} size="sm" icon={SlidersHorizontal} aria-expanded={showFilters} onClick={() => setShowFilters((s) => !s)}>Filters</Button>
          {ADVANCED_KEYS.some((k) => filters[k]) && (
            <button type="button" className="app-link-button text-sm" onClick={() => set(Object.fromEntries(ADVANCED_KEYS.map((k) => [k, ''])))}>Clear filters</button>
          )}
        </div>
        {showFilters && <FilterRow />}
      </div>

      {canBulk && selectedList.length > 0 && <BulkBar selected={selectedList} onClear={() => setSelected(new Set())} />}

      {!shown.length ? (
        <Empty icon={Users} title="No candidates match">Try another quick view, or clear the search and filters.</Empty>
      ) : view === 'board' ? (
        <CandidateBoard candidates={shown} readOnly={readOnly} onOpen={open} />
      ) : (
        <CandidateTable candidates={shown} sort={filters.sort} dir={filters.dir}
          onSort={(col) => set({ sort: col, dir: filters.sort === col && filters.dir === 'asc' ? 'desc' : 'asc' })}
          selectable={canBulk} selected={selected} onSelect={setSelected} onOpen={open} />
      )}

      <CandidatePanel id={openId} readOnly={readOnly} />
    </div>
  );
}

function FilterRow() {
  const { filters, set } = useFilters();
  const sel = (key: keyof typeof filters, label: string, options: Array<string | { value: string; label: string }>, any: string) => (
    <div className="ab-field">
      <label className="ab-label" htmlFor={`f-${key}`}>{label}</label>
      <select id={`f-${key}`} className="ab-select" value={filters[key]} onChange={(e) => set({ [key]: e.target.value })}>
        <option value="">{any}</option>
        {options.map((o) => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
  return (
    <div className="app-filters">
      {sel('stage', 'Stage', STAGE_FILTER_OPTIONS, 'Any stage')}
      {sel('status', 'On hold or left', [{ value: 'Hold', label: 'On hold' }, { value: 'Departed', label: 'No longer with us' }], 'Any')}
      {sel('dept', 'Department', DEPARTMENTS, 'Any department')}
      {sel('role', 'Role', [{ value: '__none__', label: '(No role set)' }, ...ROLE_OPTIONS], 'Any role')}
      {sel('source', 'Source', SOURCES, 'Any source')}
      {sel('emm', 'EMM', [{ value: 'pass', label: 'Passed' }, { value: 'fail', label: 'Failed' }], 'Any result')}
      {sel('grit', 'GRIT', ['HIGH GRIT', 'MODERATE GRIT', 'LOW GRIT', 'Not yet scored'], 'Any rating')}
      {sel('values', 'Values', ['STRONG FIT', 'POTENTIAL FIT', 'NOT RECOMMENDED', 'Not yet scored'], 'Any rating')}
    </div>
  );
}
