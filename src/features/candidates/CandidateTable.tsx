import { useState, type ReactNode } from 'react';
import { Clock, StickyNote } from 'lucide-react';
import type { Candidate } from '@/domain/types';
import { assessmentDeadline, getStageTask, needsAttention } from '@/domain/attention';
import { emmBadge } from '@/domain/assessments';
import { stageLabel, stageTone } from '@/domain/stages';
import { useConfig, useUpdateCandidate } from '@/api/queries';
import { Badge } from '@/ui/kit';

const COLUMNS: Array<{ key: string; label: string; sortable?: boolean }> = [
  { key: 'name', label: 'Candidate', sortable: true },
  { key: 'department', label: 'Department', sortable: true },
  { key: 'stage', label: 'Stage', sortable: true },
  { key: 'emm', label: 'EMM' },
  { key: 'next', label: 'Next' },
  { key: 'notes', label: 'Note' },
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
        <span className={overdue ? 'app-tone-danger app-next-cell__main' : 'app-next-cell__main'}>
          {overdue && <Clock size={14} aria-label="Overdue" role="img" />}
          {next || 'Overdue'}
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
  const allSelected = candidates.length > 0 && candidates.every((a) => selected.has(a.id));
  const toggle = (id: number, on: boolean) => { const s = new Set(selected); if (on) s.add(id); else s.delete(id); onSelect(s); };
  return (
    <>
      <div className="ab-table-wrap app-cand-table">
        <table className="ab-table app-table-compact">
          <thead>
            <tr>
              {selectable && (
                <th className="col-select" style={{ width: '1%' }}>
                  <label className="ab-check"><input type="checkbox" checked={allSelected} aria-label="Select all shown"
                    onChange={(e) => onSelect(e.target.checked ? new Set(candidates.map((a) => a.id)) : new Set())} /></label>
                </th>
              )}
              {COLUMNS.map((c) => (
                <th key={c.key} className={`col-${c.key}`} aria-sort={sort === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.sortable ? <button type="button" onClick={() => onSort(c.key)}>{c.label}</button> : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {candidates.map((a) => (
              <tr key={a.id} className="app-row-clickable" aria-selected={selected.has(a.id) || undefined} onClick={() => onOpen(a.id)}>
                {selectable && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <label className="ab-check"><input type="checkbox" checked={selected.has(a.id)} aria-label={`Select ${a.name}`} onChange={(e) => toggle(a.id, e.target.checked)} /></label>
                  </td>
                )}
                <td>
                  <button type="button" className="app-row-open app-row-open--line" title={`${a.name}, ${a.position || 'No position'}`} onClick={(e) => { e.stopPropagation(); onOpen(a.id); }}>
                    <span className="app-row-open__name">{a.name}</span>
                    <span className="app-meta app-row-open__pos">{a.position || 'No position'}</span>
                  </button>
                </td>
                <td>{a.department || <span className="ab-subtle">None</span>}</td>
                <td><Badge tone={stageTone(a.candidateStage)}>{stageLabel(a)}</Badge></td>
                <td><EmmCell a={a} /></td>
                <td><Next a={a} /></td>
                <td className="app-note-cell" onClick={(e) => e.stopPropagation()}><InlineNote a={a} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="app-cand-cards" aria-label="Candidates">
        {candidates.map((a) => (
          <li key={a.id} className="app-cand-card" aria-selected={selected.has(a.id) || undefined}>
            {selectable && (
              <label className="ab-check app-cand-card__check"><input type="checkbox" checked={selected.has(a.id)} aria-label={`Select ${a.name}`} onChange={(e) => toggle(a.id, e.target.checked)} /></label>
            )}
            <button type="button" className="app-cand-card__body" onClick={() => onOpen(a.id)}>
              <span className="app-row-open__name">{a.name}</span>
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

// Resume notes, edited in place. A note shows as one line; a candidate with no
// note shows only a small icon. Saves when you leave the box, like the panel.
function InlineNote({ a }: { a: Candidate }) {
  const update = useUpdateCandidate();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const saved = a.resumeNotes || '';
  const open = () => { setDraft(saved); setEditing(true); };
  if (editing) {
    return (
      <textarea className="ab-textarea app-inline-note" aria-label={`Notes for ${a.name}`} placeholder="Add a note" value={draft} autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={async () => {
          if (draft === saved) { setEditing(false); return; }
          // Stay open if the save fails, so the text is not lost.
          if (await update(a.id, { resumeNotes: draft })) setEditing(false);
        }} />
    );
  }
  const trigger = (children: ReactNode, label: string, cls: string) => (
    <button type="button" className={cls} aria-label={label} onClick={open}>{children}</button>
  );
  return saved
    ? trigger(saved, `Edit note for ${a.name}`, 'app-note-text')
    : trigger(<StickyNote size={16} aria-hidden />, `Add a note for ${a.name}`, 'app-note-add');
}
