import { useState } from 'react';
import { ChevronRight, Clock } from 'lucide-react';
import type { Candidate } from '@/domain/types';
import { CANDIDATE_STAGES, CLOSED_STAGES, interviewRoundLabel, stageName, stageTone } from '@/domain/stages';
import { needsAttention } from '@/domain/attention';
import { useConfig } from '@/api/queries';
import { useUser } from '@/auth/auth';
import type { AppRole } from '@/domain/types';
import { Badge, cx } from '@/ui/kit';
import { NoteGlyph } from './NoteMark';

const COLLAPSE_KEY = 'abbss_board_collapsed';
function loadCollapsed(): Record<string, boolean> {
  try {
    const saved = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || 'null');
    if (saved && typeof saved === 'object') return saved;
  } catch { /* fall through */ }
  // Closed columns never drain, so they start collapsed.
  return Object.fromEntries(CLOSED_STAGES.map((s) => [s, true]));
}

// One column per stage. Empty columns stay, so the board reads as a map of the whole
// pipeline, except that Operations' board starts at the Ops interview: the stages
// before it are never theirs, and empty ones only pushed their cards off-screen.
export function boardColumns(candidates: Candidate[], role: AppRole): Array<{ key: string; label: string }> {
  const noStage = candidates.some((a) => !a.candidateStage);
  const first = role === 'Operations' ? CANDIDATE_STAGES.indexOf('Initial Interview') : 0;
  const stages = CANDIDATE_STAGES.filter((s, i) => i >= first || candidates.some((a) => a.candidateStage === s));
  return [...(noStage ? [{ key: '', label: 'No stage set' }] : []), ...stages.map((s) => ({ key: s as string, label: stageName(s) }))];
}

export function CandidateBoard({ candidates, onOpen }: { candidates: Candidate[]; onOpen: (id: number) => void }) {
  const config = useConfig();
  const user = useUser();
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const toggle = (stage: string) => {
    const next = { ...collapsed, [stage]: !collapsed[stage] };
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* per-device preference only */ }
  };
  const noStage = candidates.filter((a) => !a.candidateStage);
  const columns = boardColumns(candidates, user.role);
  return (
    <ul className="app-board" aria-label="Pipeline board">
      {columns.map((col) => {
        const items = col.key ? candidates.filter((a) => a.candidateStage === col.key) : noStage;
        const isCollapsed = !!collapsed[col.key];
        return (
          <li key={col.key || 'none'} className={cx('app-board__col', isCollapsed && 'is-collapsed', !items.length && 'is-empty')} aria-label={`${col.label}, ${items.length}`}>
            <button type="button" className="app-board__head" aria-expanded={!isCollapsed} onClick={() => toggle(col.key)}>
              <span className="app-board__title">{col.label}</span>
              <Badge tone={items.length ? stageTone(col.key) : 'neutral'}>{items.length}</Badge>
            </button>
            {!isCollapsed && (
              <ul className="app-board__list">
                {items.length === 0 && <li className="app-meta app-board__empty">Nobody here now</li>}
                {items.map((a) => {
                  const body = (<>
                    <span className="app-board__name">
                      <span className="app-board__nametext" title={a.name}>{a.name}</span>
                      <NoteGlyph note={a.resumeNotes} className="app-board__note" />
                      {needsAttention(a, config)?.overdue && <Clock size={14} className="app-tone-danger app-board__late" aria-label="Overdue" role="img" />}
                    </span>
                    <span className="app-meta app-board__sub" title={[a.position || 'No position', a.department].filter(Boolean).join(', ')}>{[a.position || 'No position', a.candidateStage === 'Initial Interview' ? interviewRoundLabel(a.department, 'initial') : a.department].filter(Boolean).join(', ')}</span>
                    <CardBadges a={a} />
                  </>);
                  return (
                    <li key={a.id}>
                      <button type="button" className="app-board__card is-clickable" onClick={() => onOpen(a.id)}>
                        {body}<ChevronRight size={14} className="app-board__chev" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Late cards get a red clock beside the name; only paused ones get a badge.
function CardBadges({ a }: { a: Candidate }) {
  const paused = a.overallStatus === 'Hold';
  if (!paused) return null;
  return (
    <span className="app-board__badges">
      <Badge tone="neutral">On hold</Badge>
    </span>
  );
}
