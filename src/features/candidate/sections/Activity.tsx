import type { Candidate } from '@/domain/types';
import { EMAIL_TEMPLATE_LABELS } from '@/domain/emailTemplates';
import { interviewRoundLabel } from '@/domain/stages';
import { useCandidateActions } from '../../candidates/actions';
import { Button, fmtDateTime } from '@/ui/kit';
import { Section } from './common';

const ASSESSMENT_EMAILS = ['assessment', 'assessment_no_emm', 'reminder', 'autoReminder'];

export function ActivitySection({ a }: { a: Candidate }) {
  const actions = useCandidateActions();
  const sent = a.emailsSent || {};
  const keys = Object.keys(sent).filter((k) => sent[k] && (EMAIL_TEMPLATE_LABELS[k] !== undefined || k === 'autoReminder'))
    .sort((x, y) => new Date(sent[x]).getTime() - new Date(sent[y]).getTime());
  const opened = a.emailsOpened || {};
  const views = a.assessmentViews || {};
  const forms = [['grit', 'GRIT'], ['values', 'Values'], ...(a.requiresEmm ? [['emm', 'EMM']] : [])].map(([k, label]) => {
    const done = k === 'grit' ? !!a.grit?.score : k === 'values' ? !!a.values?.score : !!(a.emmReceivedAt || a.emm?.graded);
    return `${label} ${done ? 'done' : views[k] ? 'opened' : 'not opened'}`;
  }).join(', ');
  const history = Object.entries(a.candidateStageDates || {}).filter(([, at]) => at).sort((x, y) => new Date(x[1]).getTime() - new Date(y[1]).getTime());
  if (!history.length && a.createdAt) history.push(['New Application', a.createdAt]);
  return (
    <div className="app-stack">
      <Section title="Emails">
        {!keys.length ? <p className="ab-muted m-0">No emails sent yet.</p> : (
          <div className="ab-table-wrap">
            <table className="ab-table">
              <thead><tr><th>Email</th><th>Sent</th><th>Opened</th><th><span className="ab-visually-hidden">Actions</span></th></tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k}>
                    <td>
                      {k === 'autoReminder' ? 'Automatic reminder' : EMAIL_TEMPLATE_LABELS[k]}
                      {ASSESSMENT_EMAILS.includes(k) && <div className="app-meta">Forms: {forms}</div>}
                    </td>
                    <td className="app-num">{fmtDateTime(sent[k])}</td>
                    <td className="app-num">{opened[k] ? fmtDateTime(opened[k]) : <span className="ab-subtle">Not seen</span>}</td>
                    <td className="text-right">{k !== 'autoReminder' && <Button size="sm" variant="ghost" onClick={() => actions.unrecordEmailSent(a.id, k)}>Unmark</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="ab-hint m-0">Opened only shows for emails sent from the app, and some mail apps hide it.</p>
      </Section>
      <Section title="Stage history">
        <ol className="ab-rows">
          {history.map(([stage, at]) => (
            <li key={stage} className="ab-row app-row-compact">
              <span>{stage === 'Initial Interview' ? interviewRoundLabel(a.department, 'initial') : stage}</span>
              <span />
              <span className="ab-row__meta app-nowrap">{fmtDateTime(at)}</span>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
