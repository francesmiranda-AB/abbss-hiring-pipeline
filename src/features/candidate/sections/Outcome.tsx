import type { Candidate } from '@/domain/types';
import { emmHighRiskFlag, gritOf, valuesOf } from '@/domain/assessments';
import { availableDecisions, outcomeText, type Decision } from '@/domain/outcome';
import { useConfig, useUpdateCandidate } from '@/api/queries';
import { useCandidateActions } from '../../candidates/actions';
import { Badge, Button, Field } from '@/ui/kit';
import { SavingInput, SavingTextarea, PanelSection } from './common';

type Check = { label: string; state: 'pass' | 'fail' | 'pending'; detail: string };
const DECISION_BUTTON: Record<Decision | 'Close', string> = {
  Hired: 'Mark as hired', Close: 'Close', Hold: 'Put on hold', NonCompliant: 'No reply', 'In Progress': 'Back to in progress', Departed: 'No longer with us',
};

export function OutcomeSection({ a }: { a: Candidate }) {
  const actions = useCandidateActions();
  const update = useUpdateCandidate();
  const config = useConfig();
  const g = gritOf(a);
  const v = valuesOf(a);
  const iv = a.interview?.result;
  const checks: Check[] = [
    { label: 'GRIT', state: g.pass === true ? 'pass' : g.pass === false ? 'fail' : 'pending', detail: g.label },
    { label: 'Values and integrity', state: v.pass === true ? 'pass' : v.pass === false ? 'fail' : 'pending', detail: v.label },
    ...(a.requiresEmm ? [{
      label: 'EMM', state: (a.emm?.graded ? (a.emm.pass ? 'pass' : 'fail') : 'pending') as Check['state'],
      detail: a.emm?.graded ? `${a.emm.overallPct}/100${emmHighRiskFlag(a) ? ', flagged' : ''}` : a.emmReceivedAt ? 'Submitted, not graded' : 'Not submitted',
    }] : []),
    { label: 'Interview', state: iv === 'pass' ? 'pass' : iv === 'fail' ? 'fail' : 'pending', detail: iv === 'pass' ? 'Passed' : iv === 'fail' ? 'Failed' : 'Not done yet' },
  ];
  const verdict = checks.some((c) => c.state === 'fail') ? 'One or more results did not meet the bar.'
    : checks.every((c) => c.state === 'pass') ? 'Everything passed.' : 'Still waiting on some results.';
  const od = a.offerDetails || {};
  const setOffer = (field: string, value: string) => update(a.id, { offerDetails: { ...od, [field]: value } });
  const showOffer = ['Operations Decision', 'Endorsed to Client', 'Offer', 'Hired'].includes(a.candidateStage);
  const decisions = availableDecisions(a);
  return (
    <div className="app-stack">
      <PanelSection title="Results so far">
        <ul className="ab-rows">
          {checks.map((c) => (
            <li key={c.label} className="ab-row app-row-compact">
              <span className="font-semibold">{c.label}</span>
              <span className="app-meta">{c.detail}</span>
              <span className="ab-row__meta"><Badge tone={c.state === 'pass' ? 'success' : c.state === 'fail' ? 'danger' : 'neutral'}>{c.state === 'pending' ? 'Pending' : c.state === 'pass' ? 'Pass' : 'Fail'}</Badge></span>
            </li>
          ))}
        </ul>
        <p className="m-0 font-semibold">{verdict}</p>
      </PanelSection>

      <PanelSection title="Outcome">
        <p className="app-outcome-now">{outcomeText(a)}</p>
        <div className="ab-cluster">
          {decisions.map((d) => (
            <Button key={d} size="sm" variant={d === 'Close' ? 'outline' : d === 'Hired' ? 'secondary' : 'tonal'}
              className={d === 'Close' ? 'app-btn-danger-text' : undefined}
              onClick={() => (d === 'Close' ? actions.openClose({ ids: [a.id] }) : actions.decide(a.id, d))}>
              {DECISION_BUTTON[d]}
            </Button>
          ))}
        </div>
        {a.candidateStage === 'Assessment Sent' && decisions.includes('NonCompliant') && (
          <p className="app-meta m-0">No reply is also set automatically {config.deadlineHours} hours after the assessment invite if nothing comes back.</p>
        )}
        <SavingTextarea id={`dec-${a.id}`} label="Decision notes" value={a.decisionNotes} placeholder="Reason, who approved, next steps" onSave={(x) => update(a.id, { decisionNotes: x })} />
      </PanelSection>

      {showOffer && (
        <PanelSection title="Offer and contract details">
          <p className="ab-muted m-0">Used in the Next steps, Job offer and Contract emails. Send Next steps first: it carries the pre-onboarding PDF.</p>
          <SavingTextarea id={`jd-${a.id}`} label="Job description" value={od.jd} placeholder="Key duties and responsibilities" onSave={(x) => setOffer('jd', x)} />
          <div className="app-form-grid">
            <SavingInput id={`start-${a.id}`} label="Start date" value={od.startDate} placeholder="e.g. August 4, 2026" onSave={(x) => setOffer('startDate', x)} />
            <SavingInput id={`rate-${a.id}`} label="Rate" value={od.rate} placeholder="e.g. PHP 30,000 a month" onSave={(x) => setOffer('rate', x)} />
            <Field label="Contract type" htmlFor={`ct-${a.id}`}>
              <select id={`ct-${a.id}`} className="ab-select" value={od.contractType || ''} onChange={(e) => setOffer('contractType', e.target.value)}>
                <option value="">Select</option><option>Employee</option><option>Independent Contractor</option>
              </select>
            </Field>
            <SavingInput id={`sig-${a.id}`} label="Signatory" value={od.signatory} onSave={(x) => setOffer('signatory', x)} />
          </div>
        </PanelSection>
      )}
    </div>
  );
}
