import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, Mail, X } from 'lucide-react';
import { useCandidate, useSavedCopy, useSaveStatus } from '@/api/queries';
import type { Candidate } from '@/domain/types';
import { CANDIDATE_STAGES, DEFAULT_NEXT_ACTION_BY_STAGE, REASON_STAGES, STATUS_LABEL, stageLabel, stageLabelFor, stagePhase, stageTone, type BadgeTone } from '@/domain/stages';
import { OWNER_TO_ROLE, getStageTask } from '@/domain/attention';
import { CANDIDATE_TEMPLATE_KEYS, EMAIL_TEMPLATE_LABELS, suggestedTemplateFor } from '@/domain/emailTemplates';
import { ROLE_LABEL } from '../registry';
import { useCandidateActions } from '../candidates/actions';
import { useCaps } from './useCaps';
import { primaryActionFor, type PanelTab } from './primaryAction';
import { ComposeDialog } from '../email/ComposeDialog';
import type { Capabilities } from '@/domain/permissions';
import { Badge, Button, Field, Tabs, trackModal, useMenu } from '@/ui/kit';
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
  const open = useCallback((id: number, tab?: string) => setParams((p) => { const n = new URLSearchParams(p); n.set('candidate', String(id)); if (tab && tab !== 'overview') n.set('tab', tab); else n.delete('tab'); return n; }), [setParams]);
  return { openId, open };
}

type Section = 'overview' | 'assessments' | 'interview' | 'outcome' | 'activity';
const SECTIONS: Array<{ key: Section; label: string }> = [
  { key: 'overview', label: 'Overview' }, { key: 'assessments', label: 'Assessments' }, { key: 'interview', label: 'Interview' },
  { key: 'outcome', label: 'Outcome' }, { key: 'activity', label: 'Activity' },
];

const STATUS_TONE: Record<string, BadgeTone> = { Hired: 'success', Rejected: 'danger', Hold: 'warning', Departed: 'neutral', NonCompliant: 'danger' };

export function CandidatePanel({ id }: { id: number | null }) {
  const a = useCandidate(id);
  const caps = useCaps(a);
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const tab: Section = SECTIONS.some((x) => x.key === rawTab) ? (rawTab as Section) : 'overview';
  const ref = useRef<HTMLDialogElement>(null);
  const [compose, setCompose] = useState<string | null>(null);
  const waiting = useSavedCopy() > 0;
  const editable: Record<Section, boolean> = { overview: caps.details, assessments: caps.assessments, interview: caps.interview || caps.schedule, outcome: caps.outcome, activity: true };
  const close = useCallback(() => setParams((p) => { const n = new URLSearchParams(p); n.delete('candidate'); n.delete('tab'); return n; }), [setParams]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    let untrack: (() => void) | undefined;
    if (id != null && !d.open) { d.showModal(); untrack = trackModal(d); }
    if (id == null && d.open) d.close();
    return () => untrack?.();
  }, [id]);
  return (
    <dialog ref={ref} className="app-sheet" aria-label={a ? `${a.name}'s record` : 'Candidate'} onClose={(e) => { if (e.target === e.currentTarget) close(); }}
      onClick={(e) => { if (e.target === ref.current) close(); }}>
      {id != null && (a ? (
        <div className="app-sheet__inner">
          <PanelHeader a={a} caps={caps} onClose={close} onCompose={setCompose} onTab={(k) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', k); return n; }, { replace: true })} />
          <Tabs label="Record sections" panelId="record-panel" tabs={SECTIONS} value={tab} onChange={(k) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', k); return n; }, { replace: true })} />
          <div className="app-sheet__body" id="record-panel" role="tabpanel">
            {waiting ? <p className="app-viewonly">Updating. You can edit once the latest data is in.</p>
              : !editable[tab] && <p className="app-viewonly">View only{caps.stage ? '' : ': this is not your step'}</p>}
            <fieldset disabled={!editable[tab] || waiting} className="app-fieldset">
              {tab === 'overview' && <OverviewSection a={a} onDeleted={close} />}
              {tab === 'assessments' && <AssessmentsSection a={a} />}
              {tab === 'interview' && <InterviewSection a={a} />}
              {tab === 'outcome' && <OutcomeSection a={a} />}
              {tab === 'activity' && <ActivitySection a={a} />}
            </fieldset>
          </div>
        </div>
      ) : (
        <div className="app-sheet__inner app-sheet__missing">
          <div className="flex justify-between items-center"><h2 className="ab-title">Not found</h2><Button variant="ghost" icon={X} aria-label="Close" onClick={close} /></div>
          <p className="ab-muted">This candidate isn't in the list any more. They may have been deleted.</p>
        </div>
      ))}
    {a && <ComposeDialog a={a} template={compose} onTemplate={setCompose} onClose={() => setCompose(null)} />}
    </dialog>
  );
}

// "Saving..." while a change is on its way, "Saved" for a moment after.
function SaveMark() {
  const { pending, recent } = useSaveStatus();
  return <span className="app-savemark" role="status" aria-live="polite">{pending > 0 ? 'Saving…' : recent ? 'Saved' : ''}</span>;
}

function PanelHeader({ a, caps, onClose, onCompose, onTab }: { a: Candidate; caps: Capabilities; onClose: () => void; onCompose: (template: string) => void; onTab: (tab: PanelTab) => void }) {
  const navigate = useNavigate();
  const waiting = useSavedCopy() > 0;
  const primary = primaryActionFor(a, caps);
  const actions = useCandidateActions();
  const task = getStageTask(a);
  const meta = [a.position || 'No position', a.department, a.email, a.phone].filter(Boolean).join(', ');
  const changeStage = (stage: string) => {
    if (REASON_STAGES.includes(stage)) { actions.openClose({ ids: [a.id], stage }); return; }
    const hint = DEFAULT_NEXT_ACTION_BY_STAGE[stage];
    void actions.setOutcome([a.id], { stage }, `${a.name} moved to ${stage}${hint && hint !== 'None' ? `. Next: ${hint}` : ''}`);
  };
  return (
    <header className="app-sheet__head" data-phase={stagePhase(a.candidateStage)}>
      <div className="app-sheet__titlerow">
        <h2 className="ab-title app-truncate app-sheet__name" title={a.name}>{a.name}</h2>
        <p className="app-meta app-truncate app-sheet__meta" title={meta}>
          {[a.position || 'No position', a.department].filter(Boolean).join(', ')}
          {a.email && <>, <a href={`mailto:${a.email}`}>{a.email}</a></>}
          {a.phone && <>, <a href={`tel:${String(a.phone).replace(/[^+\d]/g, '')}`}>{a.phone}</a></>}
        </p>
        {a.overallStatus && a.overallStatus !== 'In Progress' && <Badge tone={STATUS_TONE[a.overallStatus] || 'neutral'}>{STATUS_LABEL[a.overallStatus] || a.overallStatus}</Badge>}
        <SaveMark />
        <div className="ab-cluster flex-none app-sheet__actions">
          {caps.email && <fieldset disabled={waiting} className="app-fieldset-inline"><EmailMenu a={a} onPick={onCompose} /></fieldset>}
          <Button variant="ghost" icon={X} aria-label="Close record" onClick={onClose} />
        </div>
      </div>
      <fieldset disabled={waiting} className="app-head-controls app-fieldset">
        <Field label="Stage" htmlFor={`stage-${a.id}`}>
          {!caps.stage ? <Badge tone={stageTone(a.candidateStage)}>{stageLabel(a)}</Badge> : (
            <select id={`stage-${a.id}`} className="ab-select" value={a.candidateStage} onChange={(e) => changeStage(e.target.value)}>
              {!a.candidateStage && <option value="">Not set yet</option>}
              {CANDIDATE_STAGES.map((s) => <option key={s} value={s}>{stageLabelFor(s, a.department)}</option>)}
            </select>
          )}
        </Field>
        {task && (
          <p className="app-next m-0 app-truncate" title={`Next: ${task.hint} (${ROLE_LABEL[OWNER_TO_ROLE[task.owner]]})`}>
            <strong>Next:</strong> {task.hint} <span className="app-next__by">({ROLE_LABEL[OWNER_TO_ROLE[task.owner]]})</span>
          </p>
        )}
        {primary && (
          <Button variant="primary" size="sm" onClick={() => {
            if (primary.kind === 'email') onCompose(primary.template);
            else if (primary.kind === 'tab') onTab(primary.tab);
            else navigate('/calendar');
          }}>{primary.label}</Button>
        )}
      </fieldset>
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
function EmailMenu({ a, onPick }: { a: Candidate; onPick: (template: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useMenu(open, setOpen);
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
            <button key={k} type="button" role="menuitem" className="ab-menu__item" onClick={() => { setOpen(false); onPick(k); }}>
              {EMAIL_TEMPLATE_LABELS[k]}
              {i === 0 && <span className="sr-only"> (suggested)</span>}
            </button>
          )).flatMap((el, i) => (i === 1 ? [<hr key="sep" className="ab-menu__sep" />, el] : [el]))}
        </div>
      )}
    </div>
  );
}
