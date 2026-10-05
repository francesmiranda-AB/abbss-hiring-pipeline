import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Calculator, ExternalLink, FileCheck2, Printer, RefreshCw, ShieldCheck, Target } from 'lucide-react';
import type { Candidate } from '@/domain/types';
import { assessmentsSubmitted, emmBadge, emmHighRiskFlag, emmStatusLabel, gritOf, valuesOf, type AssessmentOutcome } from '@/domain/assessments';
import { CAT_ORDER } from '@/domain/grader/categories';
import { FORM_LINKS } from '@/domain/links';
import type { GradeResult } from '@/domain/grader/engine';
import { refreshAssessments } from '@/api/actions';
import { useReplaceCandidate, useUpdateCandidate } from '@/api/queries';
import { useCandidateActions } from '../../candidates/actions';
import { printEmmReport } from '../../grader/report';
import { Badge, Button, fmtDateTime } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { SavingInput, SavingTextarea, PanelSection } from './common';
import { useCaps } from '../useCaps';

export function AssessmentsSection({ a }: { a: Candidate }) {
  const update = useUpdateCandidate();
  const replace = useReplaceCandidate();
  const actions = useCandidateActions();
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const [manual, setManual] = useState(false);
  const setNested = async (section: 'grit' | 'values', field: string, value: string): Promise<boolean> => {
    const next = { ...a, [section]: { ...a[section], [field]: value } };
    if (!(await update(a.id, { [section]: next[section] }))) return false;
    if (field === 'score' && assessmentsSubmitted(next)) void actions.advance(a.id, 'assessmentsSubmitted');
    return true;
  };
  // Ask the backend to attach whatever has arrived (the same code its job runs).
  const check = async () => {
    setChecking(true);
    try {
      const res = await refreshAssessments(a.id);
      replace(res.record);
      toast.show({ message: res.attached ? `New results attached for ${a.name}` : 'Nothing new yet', tone: res.attached ? 'success' : 'info' });
      if (res.attached && assessmentsSubmitted(res.record)) void actions.advance(a.id, 'assessmentsSubmitted');
    } catch (e) {
      toast.error(`Couldn't check for results: ${(e as Error).message}`);
    } finally {
      setChecking(false);
    }
  };
  const g = gritOf(a);
  const v = valuesOf(a);
  return (
    <div className="app-stack">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="ab-muted m-0">{manual ? 'Editing scores by hand. Save by leaving each box.' : 'Scores arrive from the forms by themselves.'}</p>
        <div className="ab-cluster">
          <Button variant="tonal" size="sm" icon={RefreshCw} busy={checking} onClick={check}>Check for results</Button>
          <Button variant="ghost" size="sm" aria-pressed={manual} onClick={() => setManual((m) => !m)}>{manual ? 'Done editing' : 'Correct a score'}</Button>
        </div>
      </div>

      <div className="app-assess-pair">
      <PanelSection title="GRIT" kind="result" icon={Target} tone="sky" aside={<a className="app-ext" href={FORM_LINKS.grit} target="_blank" rel="noopener noreferrer">Open form <ExternalLink size={14} aria-hidden /></a>}>
        <div className="app-form-grid">
          <SavingInput id={`grit-${a.id}`} label="Score (1 to 5)" inputMode="decimal" value={a.grit?.score} readOnly={!manual} onSave={(x) => setNested('grit', 'score', x)} />
          <SavingInput id={`gritp-${a.id}`} label="Perseverance" inputMode="decimal" value={a.grit?.perseverance} readOnly={!manual} onSave={(x) => setNested('grit', 'perseverance', x)} />
          <SavingInput id={`gritc-${a.id}`} label="Consistency" inputMode="decimal" value={a.grit?.consistency} readOnly={!manual} onSave={(x) => setNested('grit', 'consistency', x)} />
        </div>
        <OutcomeNote o={g} />
      </PanelSection>

      <PanelSection title="Values and integrity" kind="result" icon={ShieldCheck} tone="sky" aside={<a className="app-ext" href={FORM_LINKS.values} target="_blank" rel="noopener noreferrer">Open form <ExternalLink size={14} aria-hidden /></a>}>
        <div className="app-form-grid">
          <SavingInput id={`val-${a.id}`} label="Total of 315" inputMode="numeric" value={a.values?.score} readOnly={!manual} onSave={(x) => setNested('values', 'score', x)} />
          <SavingInput id={`valc-${a.id}`} label="Confidentiality" inputMode="decimal" value={a.values?.confScore} readOnly={!manual} onSave={(x) => setNested('values', 'confScore', x)} />
          <SavingInput id={`vali-${a.id}`} label="Integrity" inputMode="decimal" value={a.values?.intScore} readOnly={!manual} onSave={(x) => setNested('values', 'intScore', x)} />
        </div>
        <OutcomeNote o={v} />
      </PanelSection>
      </div>

      <PanelSection title="EMM cognitive test" kind="result" icon={Calculator} tone="sky">
        {a.requiresEmm ? <EmmBlock a={a} manual={manual} /> : <p className="ab-muted m-0">Not asked for. Sending the assessment invite with EMM adds it.</p>}
      </PanelSection>
    </div>
  );
}

function OutcomeNote({ o }: { o: AssessmentOutcome }) {
  return (
    <div className="app-outcome">
      <Badge tone={o.tone}>{o.label}</Badge>
      {o.action && <p className="m-0">{o.action}</p>}
      {!!o.questions?.length && (
        <details>
          <summary className="app-meta">Follow-up questions for the interview</summary>
          <ul className="app-list">{o.questions.map((q) => <li key={q}>{q}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

function EmmBlock({ a, manual }: { a: Candidate; manual: boolean }) {
  const caps = useCaps(a);
  const update = useUpdateCandidate();
  const actions = useCandidateActions();
  const navigate = useNavigate();
  const toast = useToast();
  const badge = emmBadge(a);
  const toggleReceived = async () => {
    const received = a.emmReceivedAt ? '' : new Date().toISOString();
    if (await update(a.id, { emmReceivedAt: received }) && received && assessmentsSubmitted({ ...a, emmReceivedAt: received })) {
      void actions.advance(a.id, 'assessmentsSubmitted');
    }
  };
  let g: Partial<GradeResult> = {};
  try { g = a.emm?.fullResult ? JSON.parse(a.emm.fullResult) : {}; } catch { g = {}; }
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={badge.tone}>{badge.label}</Badge>
        {manual ? (
          <label className="ab-check">
            <input type="checkbox" checked={!!a.emmReceivedAt} onChange={toggleReceived} />
            File received{a.emmReceivedAt ? ` ${fmtDateTime(a.emmReceivedAt)}` : ''}
          </label>
        ) : <span className="app-meta">{a.emmReceivedAt ? `File received ${fmtDateTime(a.emmReceivedAt)}` : 'File not received yet'}</span>}
        {a.emmFileUrl && /^https?:/.test(a.emmFileUrl) && <a className="app-ext" href={a.emmFileUrl} target="_blank" rel="noopener noreferrer">Submitted file <ExternalLink size={14} aria-hidden /></a>}
      </div>
      {!a.emm?.graded ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="ab-muted m-0">{a.emmFileUrl ? 'Their file is in and ready to grade.' : 'Still waiting on their file. Nothing to grade yet.'}</p>
          {caps.grader && <Button variant="primary" size="sm" icon={FileCheck2} onClick={() => navigate(`/grader?candidate=${a.id}`)}>Open in grader</Button>}
        </div>
      ) : (
        <>
          <div className="ab-kpis">
            <div className="ab-kpi"><span className="ab-kpi__value">{a.emm.overallPct}</span><span className="ab-kpi__label">Score out of 100, {emmStatusLabel(a)}</span></div>
            {!g.catByCat && <div className="ab-kpi"><span className="ab-kpi__value">{a.emm.catPct}%</span><span className="ab-kpi__label">Category identification</span></div>}
            {!g.catByCat && <div className="ab-kpi"><span className="ab-kpi__value">{a.emm.actPct}%</span><span className="ab-kpi__label">Action points</span></div>}
          </div>
          {emmHighRiskFlag(a) && <div className="ab-alert ab-alert--warning"><span className="ab-alert__icon" aria-hidden><AlertTriangle size={18} /></span><p className="ab-alert__title">Flagged for review</p><div>A high-severity integrity flag came up. See the flags below before deciding.</div></div>}
          {g.rubric && (
            <div className="ab-table-wrap">
              <table className="ab-table">
                <thead><tr><th>Area</th><th className="ab-num">Score</th></tr></thead>
                <tbody>
                  {([['Order reference identification', g.rubric.orderRef], ['Required Excel calculations', g.rubric.calc], ['Line-item remarks', g.rubric.remarks],
                    ['Summary accuracy and reconciliation', g.rubric.summary], ['Recommendations', g.rubric.recs]] as const).map(([area, d]) => (
                    <tr key={area}><td>{area}</td><td className="ab-num">{d.score}/{d.max}</td></tr>
                  ))}
                  <tr><td><strong>Total</strong></td><td className="ab-num"><strong>{g.rubric.total}/100, {g.rubric.pass ? 'passed' : 'not passed'}</strong></td></tr>
                </tbody>
              </table>
            </div>
          )}
          {g.catByCat && (
            <details>
              <summary className="app-meta">By category</summary>
              <ul className="ab-rows">
                {CAT_ORDER.map((cat) => {
                  const d = g.catByCat![cat] || { correct: 0, wrong: 0 };
                  const t = d.correct + d.wrong;
                  return <li key={cat} className="ab-row app-row-compact"><span>{cat}</span><span className="app-meta">{d.correct} right, {d.wrong} wrong</span><span className="ab-row__meta">{t ? Math.round((d.correct / t) * 1000) / 10 : 0}%</span></li>;
                })}
              </ul>
            </details>
          )}
          {!!g.flags?.length && (
            <ul className="ab-rows">
              {g.flags.map((f) => (
                <li key={f.title} className="ab-row app-row-compact">
                  <span><Badge tone={f.level === 'high' ? 'danger' : f.level === 'medium' ? 'warning' : 'success'}>{f.level === 'pass' ? 'Clear' : f.level}</Badge></span>
                  <span><strong>{f.title}.</strong> {f.desc}</span>
                  <span className="ab-row__meta">{f.action}</span>
                </li>
              ))}
            </ul>
          )}
          <SavingTextarea id={`emmn-${a.id}`} label="HR notes on the EMM" value={a.emm.notes} onSave={(x) => update(a.id, { emm: { ...a.emm, notes: x } })} placeholder="Observations, integrity concerns, recommendations" />
          <div className="ab-cluster">
            <Button variant="tonal" size="sm" icon={Printer} onClick={() => { const err = printEmmReport(a); if (err) toast.error(err); }}>Print report</Button>
            {caps.grader && <Button variant="ghost" size="sm" icon={FileCheck2} onClick={() => navigate(`/grader?candidate=${a.id}`)}>Re-grade</Button>}
          </div>
        </>
      )}
    </div>
  );
}
