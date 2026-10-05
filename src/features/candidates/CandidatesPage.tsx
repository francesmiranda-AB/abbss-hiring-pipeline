import { useMemo, useState } from 'react';
import { Download, LayoutGrid, Rows3, Search, SlidersHorizontal, Users } from 'lucide-react';
import { useCandidates, useConfig } from '@/api/queries';
import { useUser } from '@/auth/auth';
import { can } from '@/domain/permissions';
import { candidatesCsv, downloadText, todayStamp } from '@/domain/csv';
import { DEPARTMENTS, ROLE_OPTIONS, SOURCES } from '@/domain/stages';
import { Button, Empty, ErrorAlert, PageHeader, Skeleton, cx, pillTone } from '@/ui/kit';
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
  const boardOnly = user.role === 'PM';
  const canBulk = can(user.role, 'bulk');
  const canExport = can(user.role, 'export');

  const scoped = useMemo(() => applyFilters(roleScope(candidates, user.role), filters), [candidates, user.role, filters]);
  const hasStageFilter = !!(filters.stage || filters.status);
  const counts = useMemo(() => Object.fromEntries(CHIPS.map((c) => [c.key, scoped.filter((a) => chipMatch(a, c.key, user.role, config, hasStageFilter)).length])), [scoped, user.role, config, hasStageFilter]);
  const shown = useMemo(() => sortCandidates(scoped.filter((a) => chipMatch(a, filters.chip, user.role, config, hasStageFilter)), filters.sort, filters.dir), [scoped, filters, user.role, config, hasStageFilter]);
  const view = boardOnly ? 'board' : filters.view;
  const selectedList = shown.filter((a) => selected.has(a.id));

  if (error) return <ErrorAlert title="Couldn't load candidates">{error.message}</ErrorAlert>;
  if (isLoading) return <Skeleton lines={8} />;

  return (
    <div className="app-stack">
      <PageHeader
        title="Candidates"
        lead={user.role === 'Operations' ? 'Endorsed to Operations: Initial Interview and later' : `${shown.length} shown`}
        actions={<>
          <label className="app-search">
            <Search size={16} aria-hidden />
            <span className="ab-visually-hidden">Search candidates</span>
            <input className="ab-input" type="search" placeholder="Search name, email, phone, position or notes" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
          </label>
          {!boardOnly && (
            <div className="ab-tabs ab-tabs--pills" role="tablist" aria-label="View">
              <button type="button" role="tab" className="ab-tab" aria-selected={view === 'table'} onClick={() => set({ view: 'table' })}><Rows3 size={14} aria-hidden /> Table</button>
              <button type="button" role="tab" className="ab-tab" aria-selected={view === 'board'} onClick={() => set({ view: 'board' })}><LayoutGrid size={14} aria-hidden /> Board</button>
            </div>
          )}
          {canExport && <Button variant="outline" size="sm" icon={Download} onClick={() => downloadText(`ABBSS_Candidates_${todayStamp()}.csv`, candidatesCsv(shown))} disabled={!shown.length}>Export CSV</Button>}
        </>}
      />

      <div className="app-strip">
        <div className="app-pills" role="tablist" aria-label="Quick views">
          {CHIPS.map((c) => (
            <button key={c.key} type="button" role="tab" aria-selected={filters.chip === c.key} className={cx('app-pill', pillTone(c.tone, counts[c.key]), filters.chip === c.key && 'is-active')} onClick={() => set({ chip: c.key })}>
              <span className="app-pill__n">{counts[c.key]}</span><span>{c.label}</span>
            </button>
          ))}
        </div>
        <Button variant={showFilters ? 'secondary' : 'tonal'} size="sm" icon={SlidersHorizontal} aria-expanded={showFilters} onClick={() => setShowFilters((f) => !f)}>Filters</Button>
        {ADVANCED_KEYS.some((k) => filters[k]) && (
          <button type="button" className="app-link-button text-sm" onClick={() => set(Object.fromEntries(ADVANCED_KEYS.map((k) => [k, ''])))}>Clear filters</button>
        )}
      </div>
      {showFilters && <FilterRow />}

      {canBulk && selectedList.length > 0 && <BulkBar selected={selectedList} onClear={() => setSelected(new Set())} />}

      {!shown.length ? (
        <Empty icon={Users} title="No candidates match">Try another quick view, or clear the search and filters.</Empty>
      ) : view === 'board' ? (
        <CandidateBoard candidates={shown} onOpen={open} />
      ) : (
        <CandidateTable candidates={shown} sort={filters.sort} dir={filters.dir}
          onSort={(col) => set({ sort: col, dir: filters.sort === col && filters.dir === 'asc' ? 'desc' : 'asc' })}
          selectable={canBulk} selected={selected} onSelect={setSelected} onOpen={open} />
      )}

      <CandidatePanel id={openId} />
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
