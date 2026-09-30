import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, Mail, X } from 'lucide-react';
import { useCandidate, useUpdateCandidate } from '@/api/queries';
import type { Candidate } from '@/domain/types';
import { CANDIDATE_STAGES, DEFAULT_NEXT_ACTION_BY_STAGE, NEXT_ACTION_OPTIONS, REASON_STAGES, ROLE_CONFIG, ROLE_OPTIONS, interviewRoundLabel, interviewerFor, stageLabel, stageTone, type BadgeTone } from '@/domain/stages';
import { getStageTask } from '@/domain/attention';
import { CANDIDATE_TEMPLATE_KEYS, EMAIL_TEMPLATE_LABELS, suggestedTemplateFor } from '@/domain/emailTemplates';
import { useCandidateActions } from '../candidates/actions';
import { Badge, Button, Field, Tabs } from '@/ui/kit';
import { OverviewSection } from './sections/Overview';
import { AssessmentsSection } from './sections/Assessments';
import { InterviewSection } from './sections/Interview';
import { OutcomeSection } from './sections/Outcome';
import { ActivitySection } from './sections/Activity';

// The candidate record opens over the list. Its open state lives in the URL
// (?candidate=<id>): a link opens it, Back closes it, and the list keeps its filters.
export function useOpenCandidate() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('candidate');
  const openId = raw ? Number(raw) : null;
  const open = useCallback((id: number) => setParams((p) => { const n = new URLSearchParams(p); n.set('candidate', String(id)); n.delete('tab'); return n; }), [setParams]);
  return { openId, open };
}

type Section = 'overview' | 'assessments' | 'interview' | 'outcome' | 'activity';
const SECTIONS: Array<{ key: Section; label: string }> = [
  { key: 'overview', label: 'Overview' }, { key: 'assessments', label: 'Assessments' }, { key: 'interview', label: 'Interview' },
  { key: 'outcome', label: 'Outcome' }, { key: 'activity', label: 'Activity' },
];

const STATUS_TONE: Record<string, BadgeTone> = { Hired: 'success', Rejected: 'danger', Hold: 'warning', Departed: 'neutral', NonCompliant: 'danger' };

export function CandidatePanel({ id, readOnly }: { id: number | null; readOnly: boolean }) {
  const a = useCandidate(id);
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Section) || 'overview';
  const ref = useRef<HTMLDialogElement>(null);
  const close = useCallback(() => setParams((p) => { const n = new URLSearchParams(p); n.delete('candidate'); n.delete('tab'); return n; }), [setParams]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (id != null && !d.open) d.showModal();
    if (id == null && d.open) d.close();
  }, [id]);
  return (
    <dialog ref={ref} className="app-sheet" aria-label={a ? `${a.name}'s record` : 'Candidate'} onClose={close}
      onClick={(e) => { if (e.target === ref.current) close(); }}>
      {id != null && (a ? (
        <div className="app-sheet__inner">
          <PanelHeader a={a} readOnly={readOnly} onClose={close} />
          <Tabs label="Record sections" tabs={SECTIONS} value={tab} onChange={(k) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', k); return n; }, { replace: true })} />
          <div className="app-sheet__body">
            <fieldset disabled={readOnly} className="app-fieldset">
              {tab === 'overview' && <OverviewSection a={a} onDeleted={close} />}
              {tab === 'assessments' && <AssessmentsSection a={a} />}
              {tab === 'interview' && <InterviewSection a={a} />}
              {tab === 'outcome' && <OutcomeSection a={a} />}
              {tab === 'activity' && <ActivitySection a={a} />}
            </fieldset>
          </div>
        </div>
      ) : (
        <div className="app-sheet__inner">
          <div className="flex justify-between items-center"><h2 className="ab-title">Not found</h2><Button variant="ghost" icon={X} aria-label="Close" onClick={close} /></div>
          <p className="ab-muted">This candidate isn't in the list any more. They may have been deleted.</p>
        </div>
      ))}
    </dialog>
  );
}

function PanelHeader({ a, readOnly, onClose }: { a: Candidate; readOnly: boolean; onClose: () => void }) {
  const actions = useCandidateActions();
  const update = useUpdateCandidate();
  const task = getStageTask(a);
  const conductor = a.candidateStage === 'HR Preliminary Interview' ? interviewerFor(a, 'preliminary')
    : a.candidateStage === 'Initial Interview' ? interviewerFor(a, 'initial')
    : a.candidateStage === 'Endorsed to Client' ? interviewerFor(a, 'final') : '';
  const changeStage = (stage: string) => {
    if (REASON_STAGES.includes(stage)) { actions.openClose({ ids: [a.id], stage }); return; }
    const hint = DEFAULT_NEXT_ACTION_BY_STAGE[stage];
    void actions.setOutcome([a.id], { stage }, `${a.name} moved to ${stage}${hint && hint !== 'None' ? `. Next: ${hint}` : ''}`);
  };
  return (
    <header className="app-sheet__head">
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-1 min-w-0">
          <h2 className="ab-title app-truncate">{a.name}</h2>
          <p className="app-meta m-0">{[a.position || 'No position', a.department, a.email, a.phone].filter(Boolean).join(', ')}</p>
          <span className="flex flex-wrap gap-1 mt-1">
            <Badge tone={stageTone(a.candidateStage)}>{stageLabel(a)}</Badge>
            {a.overallStatus && a.overallStatus !== 'In Progress' && <Badge tone={STATUS_TONE[a.overallStatus] || 'neutral'}>{a.overallStatus}</Badge>}
          </span>
        </div>
        <div className="ab-cluster flex-none">
          {!readOnly && <EmailMenu a={a} />}
          <Button variant="ghost" icon={X} aria-label="Close record" onClick={onClose} />
        </div>
      </div>
      <div className="app-head-grid">
        <Field label="Stage" htmlFor={`stage-${a.id}`} hint={conductor ? `Conducted by: ${conductor}` : undefined}>
          {readOnly ? <Badge tone={stageTone(a.candidateStage)}>{stageLabel(a)}</Badge> : (
            <select id={`stage-${a.id}`} className="ab-select" value={a.candidateStage} onChange={(e) => changeStage(e.target.value)}>
              {!a.candidateStage && <option value="">Not set yet</option>}
              {CANDIDATE_STAGES.map((s) => <option key={s} value={s}>{s === 'Initial Interview' ? interviewRoundLabel(a.department, 'initial') : s}</option>)}
            </select>
          )}
        </Field>
        <OtherSelect label="Next action" id={`next-${a.id}`} value={a.nextAction || ''} options={NEXT_ACTION_OPTIONS} empty="None" disabled={readOnly}
          onChange={(v) => update(a.id, { nextAction: v })} />
        <OtherSelect label="Role" id={`role-${a.id}`} value={a.roleCategory || ''} options={ROLE_OPTIONS} empty="Select role" disabled={readOnly}
          hint={a.roleCategory && ROLE_CONFIG[a.roleCategory]?.requiresClientFinal === false ? 'This role skips the client stages: the offer follows the Operations decision.' : undefined}
          onChange={(v) => update(a.id, { roleCategory: v })} />
      </div>
      {task && <p className="app-next m-0"><strong>{task.label}.</strong> {task.hint}</p>}
    </header>
  );
}

// A select with "Other" that reveals a free-text box; saves on change / blur.
export function OtherSelect({ label, id, value, options, empty, onChange, disabled, hint }: {
  label: string; id: string; value: string; options: string[]; empty: string; onChange: (v: string) => void; disabled?: boolean; hint?: string;
}) {
  // A saved value that isn't in the list is an "Other". Picking Other shows the
  // box for this value only; a draft exists only while typing.
  const isOther = !!value && !options.includes(value);
  const [pickedOtherFor, setPickedOtherFor] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const showOther = isOther || pickedOtherFor === value;
  const otherText = draft ?? (isOther ? value : '');
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <select id={id} className="ab-select" disabled={disabled} value={showOther ? '__other__' : value}
        onChange={(e) => { if (e.target.value === '__other__') setPickedOtherFor(value); else { setPickedOtherFor(null); setDraft(null); onChange(e.target.value); } }}>
        <option value="">{empty}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value="__other__">Other</option>
      </select>
      {showOther && (
        <input className="ab-input" aria-label={`${label}: please specify`} placeholder="Please specify" value={otherText} disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { const t = (draft ?? '').trim(); if (draft !== null && t && t !== value) { setPickedOtherFor(null); onChange(t); } setDraft(null); }} />
      )}
    </Field>
  );
}

// The one way to email a candidate: every template, the likely one first.
function EmailMenu({ a }: { a: Candidate }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', off);
    document.addEventListener('keydown', off);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', off); };
  }, [open]);
  const first = suggestedTemplateFor(a);
  const keys = [first, ...CANDIDATE_TEMPLATE_KEYS.filter((k) => k !== first)];
  return (
    <div className="relative" ref={box}>
      <Button variant="secondary" size="sm" icon={Mail} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Email <ChevronDown size={14} aria-hidden />
      </Button>
      {open && (
        <div className="ab-menu app-menu-right" role="menu">
          <span className="ab-menu__label">Suggested</span>
          {keys.map((k, i) => (
            <button key={k} type="button" role="menuitem" className="ab-menu__item" onClick={() => navigate(`/email?candidate=${a.id}&template=${k}`)}>
              {EMAIL_TEMPLATE_LABELS[k]}
              {i === 0 && <span className="sr-only"> (suggested)</span>}
            </button>
          )).flatMap((el, i) => (i === 1 ? [<hr key="sep" className="ab-menu__sep" />, el] : [el]))}
        </div>
      )}
    </div>
  );
}
