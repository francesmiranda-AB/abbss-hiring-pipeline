import { useState } from 'react';
import type { Candidate } from '@/domain/types';
import { assessmentDeadline } from '@/domain/attention';
import { emmBadge } from '@/domain/assessments';
import { stageLabel, stageTone } from '@/domain/stages';
import { useConfig, useUpdateCandidate } from '@/api/queries';
import { Badge } from '@/ui/kit';

const COLUMNS: Array<{ key: string; label: string; sortable?: boolean }> = [
  { key: 'name', label: 'Candidate', sortable: true },
  { key: 'department', label: 'Department', sortable: true },
  { key: 'stage', label: 'Stage', sortable: true },
  { key: 'emm', label: 'EMM' },
  { key: 'enteredBy', label: 'Entered by', sortable: true },
  { key: 'notes', label: 'Notes' },
];

export function CandidateTable({ candidates, sort, dir, onSort, selectable, selected, onSelect, onOpen }: {
  candidates: Candidate[]; sort: string; dir: 'asc' | 'desc'; onSort: (col: string) => void;
  selectable: boolean; selected: Set<number>; onSelect: (s: Set<number>) => void; onOpen: (id: number) => void;
}) {
  const config = useConfig();
  const allSelected = candidates.length > 0 && candidates.every((a) => selected.has(a.id));
  const toggle = (id: number, on: boolean) => { const s = new Set(selected); if (on) s.add(id); else s.delete(id); onSelect(s); };
  return (
    <div className="ab-table-wrap">
      <table className="ab-table">
        <thead>
          <tr>
            {selectable && (
              <th style={{ width: '1%' }}>
                <label className="ab-check"><input type="checkbox" checked={allSelected} aria-label="Select all shown"
                  onChange={(e) => onSelect(e.target.checked ? new Set(candidates.map((a) => a.id)) : new Set())} /></label>
              </th>
            )}
            {COLUMNS.map((c) => (
              <th key={c.key} aria-sort={sort === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                {c.sortable ? <button type="button" onClick={() => onSort(c.key)}>{c.label}</button> : c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {candidates.map((a) => {
            const deadline = assessmentDeadline(a, config);
            const emm = emmBadge(a);
            return (
              <tr key={a.id} aria-selected={selected.has(a.id) || undefined}>
                {selectable && (
                  <td><label className="ab-check"><input type="checkbox" checked={selected.has(a.id)} aria-label={`Select ${a.name}`} onChange={(e) => toggle(a.id, e.target.checked)} /></label></td>
                )}
                <td>
                  <button type="button" className="app-row-open" onClick={() => onOpen(a.id)}>
                    <span className="app-row-open__name">{a.name}</span>
                    <span className="app-meta">{a.position || 'No position'}</span>
                  </button>
                </td>
                <td>{a.department || <span className="ab-subtle">None</span>}</td>
                <td>
                  <div className="grid gap-1 justify-items-start">
                    <Badge tone={stageTone(a.candidateStage)}>{stageLabel(a)}</Badge>
                    {a.nextAction && a.nextAction !== 'None' && <span className="app-meta">Next: {a.nextAction}</span>}
                    {deadline && <span className={`app-meta app-tone-${deadline.tone}`}>{deadline.label}</span>}
                  </div>
                </td>
                <td><Badge tone={emm.tone}>{emm.label}</Badge></td>
                <td>{a.enteredBy || <span className="ab-subtle">None</span>}</td>
                <td style={{ minWidth: '14rem' }}><InlineNote a={a} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Resume notes, edited in place. Saves when you leave the box, like the panel.
function InlineNote({ a }: { a: Candidate }) {
  const update = useUpdateCandidate();
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? a.resumeNotes ?? '';
  return (
    <textarea className="ab-textarea app-inline-note" aria-label={`Notes for ${a.name}`} placeholder="Add a note" value={value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={async () => {
        if (draft === null || draft === (a.resumeNotes || '')) { setDraft(null); return; }
        await update(a.id, { resumeNotes: draft });
        setDraft(null);
      }} />
  );
}
