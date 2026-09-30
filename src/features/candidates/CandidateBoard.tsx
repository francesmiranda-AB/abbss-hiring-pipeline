import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Candidate } from '@/domain/types';
import { CANDIDATE_STAGES, CLOSED_STAGES, interviewRoundLabel, stageTone } from '@/domain/stages';
import { needsAttention } from '@/domain/attention';
import { useConfig } from '@/api/queries';
import { Badge, cx } from '@/ui/kit';

const COLLAPSE_KEY = 'abbss_board_collapsed';
function loadCollapsed(): Record<string, boolean> {
  try {
    const saved = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || 'null');
    if (saved && typeof saved === 'object') return saved;
  } catch { /* fall through */ }
  // Closed columns never drain, so they start collapsed.
  return Object.fromEntries(CLOSED_STAGES.map((s) => [s, true]));
}

// Every candidate by where they are now, one column per stage (empty columns
// stay, so the board reads as a map of the whole pipeline).
export function CandidateBoard({ candidates, readOnly, onOpen }: { candidates: Candidate[]; readOnly: boolean; onOpen: (id: number) => void }) {
  const config = useConfig();
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const toggle = (stage: string) => {
    const next = { ...collapsed, [stage]: !collapsed[stage] };
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* per-device preference only */ }
  };
  const noStage = candidates.filter((a) => !a.candidateStage);
  const columns = [...(noStage.length ? [{ key: '', label: 'No stage set' }] : []), ...CANDIDATE_STAGES.map((s) => ({ key: s as string, label: s === 'Initial Interview' ? 'Initial interview' : s }))];
  return (
    <div className="app-board" role="list" aria-label="Pipeline board">
      {columns.map((col) => {
        const items = col.key ? candidates.filter((a) => a.candidateStage === col.key) : noStage;
        const isCollapsed = !!collapsed[col.key];
        return (
          <section key={col.key || 'none'} role="listitem" className={cx('app-board__col', isCollapsed && 'is-collapsed', !items.length && 'is-empty')} aria-label={`${col.label}, ${items.length}`}>
            <button type="button" className="app-board__head" aria-expanded={!isCollapsed} onClick={() => toggle(col.key)}>
              <span className="app-board__title">{col.label}</span>
              <Badge tone={items.length ? stageTone(col.key) : 'neutral'}>{items.length}</Badge>
            </button>
            {!isCollapsed && (
              <ul className="app-board__list">
                {items.length === 0 && <li className="app-meta app-board__empty">Nobody here now</li>}
                {items.map((a) => {
                  const body = (<>
                    <span className="app-board__name">{a.name}</span>
                    <span className="app-meta">{a.position || 'No position'}{a.department ? `, ${a.department}` : ''}</span>
                    {a.candidateStage === 'Initial Interview' && <span className="app-meta">{interviewRoundLabel(a.department, 'initial')}</span>}
                    {a.nextAction && a.nextAction !== 'None' && <span className="app-meta">Next: {a.nextAction}</span>}
                    <CardBadges a={a} config={config} />
                  </>);
                  return (
                    <li key={a.id}>
                      {readOnly ? <div className="app-board__card">{body}</div> : (
                        <button type="button" className="app-board__card is-clickable" onClick={() => onOpen(a.id)}>
                          {body}<ChevronRight size={14} className="app-board__chev" aria-hidden />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

// Only what needs a look: late or paused. Quiet cards stay quiet.
function CardBadges({ a, config }: { a: Candidate; config: ReturnType<typeof useConfig> }) {
  const overdue = !!needsAttention(a, config)?.overdue;
  const paused = a.overallStatus === 'Hold';
  if (!overdue && !paused) return null;
  return (
    <span className="app-board__badges">
      {overdue && <Badge tone="danger">Overdue</Badge>}
      {paused && <Badge tone="neutral">On hold</Badge>}
    </span>
  );
}
