import { Clock, StickyNote } from 'lucide-react';
import type { Candidate } from '@/domain/types';
import { assessmentDeadline, getStageTask, needsAttention } from '@/domain/attention';
import { emmBadge } from '@/domain/assessments';
import { stageLabel, stagePhase, stageTone } from '@/domain/stages';
import { useConfig } from '@/api/queries';
import { Badge, PhaseTile } from '@/ui/kit';
import { NoteGlyph, NoteMark } from './NoteMark';

const COLUMNS: Array<{ key: string; label: string; sortable?: boolean }> = [
  { key: 'name', label: 'Candidate', sortable: true },
  { key: 'department', label: 'Department', sortable: true },
  { key: 'stage', label: 'Stage', sortable: true },
  { key: 'emm', label: 'EMM' },
  { key: 'next', label: 'Next', sortable: true },
  { key: 'notes', label: 'Notes' },
];

// One line per candidate: who, where they are, what happens next. Overdue is
// the Next text turning red with a clock, not another pill (most rows are late
// when the list is stale, and a red pill on every row says nothing).
function useRow(a: Candidate) {
  const config = useConfig();
  const attention = needsAttention(a, config);
  const deadline = assessmentDeadline(a, config);
  const emm = a.requiresEmm ? emmBadge(a) : null;
  const next = getStageTask(a)?.nextAction || '';
  return { overdue: !!attention?.overdue, deadline, emm, next, hold: a.overallStatus === 'Hold' };
}

function Next({ a }: { a: Candidate }) {
  const { overdue, deadline, next, hold } = useRow(a);
  if (hold) return <Badge tone="neutral">On hold</Badge>;
  if (!next && !overdue && !deadline) return <span className="ab-subtle">None</span>;
  return (
    <span className="app-next-cell">
      {(next || overdue) && (
        <span className={overdue ? 'app-tone-danger app-next-cell__main' : 'app-next-cell__main'} title={next || undefined}>
          {overdue && <Clock size={14} aria-label="Overdue" role="img" />}
          <span className="app-next-text">{next || 'Overdue'}</span>
        </span>
      )}
      {deadline && <span className={`app-meta app-tone-${deadline.tone}`}>{deadline.label}</span>}
    </span>
  );
}

// Phone cards show everything about the stage in one place; the table gives EMM its own column.
function StageCell({ a }: { a: Candidate }) {
  const { emm, hold } = useRow(a);
  return (
    <span className="app-stage-cell app-stage-cell--wrap">
      <Badge tone={stageTone(a.candidateStage)}>{stageLabel(a)}</Badge>
      {hold && <Badge tone="neutral">On hold</Badge>}
      {emm && <Badge tone={emm.tone}>{`EMM: ${emm.label}`}</Badge>}
    </span>
  );
}

function EmmCell({ a }: { a: Candidate }) {
  const { emm } = useRow(a);
  return emm ? <Badge tone={emm.tone}>{emm.label}</Badge> : null;
}

export function CandidateTable({ candidates, sort, dir, onSort, selectable, selected, onSelect, onOpen }: {
  candidates: Candidate[]; sort: string; dir: 'asc' | 'desc'; onSort: (col: string) => void;
  selectable: boolean; selected: Set<number>; onSelect: (s: Set<number>) => void; onOpen: (id: number) => void;
}) {
  // The EMM column only earns its width while someone in the list owes the test.
  const showEmm = candidates.some((a) => a.requiresEmm);
  const columns = COLUMNS.filter((c) => c.key !== 'emm' || showEmm);
  const allSelected = candidates.length > 0 && candidates.every((a) => selected.has(a.id));
  const toggle = (id: number, on: boolean) => { const s = new Set(selected); if (on) s.add(id); else s.delete(id); onSelect(s); };
  return (
    <>
      <div className="ab-table-wrap app-cand-table">
        <table className="ab-table app-table-compact">
          <thead>
            <tr>
              {selectable && (
                <th className="col-select">
                  <label className="ab-check"><input type="checkbox" checked={allSelected} aria-label="Select all shown"
                    onChange={(e) => onSelect(e.target.checked ? new Set(candidates.map((a) => a.id)) : new Set())} /></label>
                </th>
              )}
              {columns.map((c) => (
                <th key={c.key} className={`col-${c.key}`} aria-sort={sort === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.sortable ? <button type="button" onClick={() => onSort(c.key)}>{c.label}</button>
                    : c.key === 'notes' ? <><StickyNote size={14} aria-hidden /><span className="ab-visually-hidden">Notes</span></> : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {candidates.map((a) => (
              <tr key={a.id} className="app-row-clickable" data-phase={stagePhase(a.candidateStage)} data-selected={selected.has(a.id) || undefined} onClick={() => onOpen(a.id)}>
                {selectable && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <label className="ab-check"><input type="checkbox" checked={selected.has(a.id)} aria-label={`Select ${a.name}`} onChange={(e) => toggle(a.id, e.target.checked)} /></label>
                  </td>
                )}
                <td>
                  <button type="button" className="app-row-open app-row-open--line" title={[a.name, a.position || 'No position', a.department].filter(Boolean).join(', ')} onClick={(e) => { e.stopPropagation(); onOpen(a.id); }}>
                    <PhaseTile name={a.name} phase={stagePhase(a.candidateStage)} />
                    <span className="app-row-open__name">{a.name}</span>
                    <span className="app-meta app-row-open__pos">{a.position || 'No position'}</span>
                  </button>
                </td>
                <td className="col-department">{a.department || <span className="ab-subtle">None</span>}</td>
                <td className="cell-badge"><Badge tone={stageTone(a.candidateStage)}>{stageLabel(a)}</Badge></td>
                {showEmm && <td className="cell-badge col-emm"><EmmCell a={a} /></td>}
                <td className="cell-badge"><Next a={a} /></td>
                <td className="col-notes" onClick={(e) => e.stopPropagation()}><NoteMark a={a} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="app-cand-cards" aria-label="Candidates">
        {candidates.map((a) => (
          <li key={a.id} className="app-cand-card" data-selected={selected.has(a.id) || undefined}>
            {selectable && (
              <label className="ab-check app-cand-card__check"><input type="checkbox" checked={selected.has(a.id)} aria-label={`Select ${a.name}`} onChange={(e) => toggle(a.id, e.target.checked)} /></label>
            )}
            <button type="button" className="app-cand-card__body" onClick={() => onOpen(a.id)}>
              <span className="app-row-open__name">{a.name}<NoteGlyph note={a.resumeNotes} /></span>
              <span className="app-meta">{[a.position || 'No position', a.department].filter(Boolean).join(', ')}</span>
              <StageCell a={a} />
              <Next a={a} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
