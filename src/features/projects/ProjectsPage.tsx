import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BarChart3, Copy } from 'lucide-react';
import { SNAPSHOT_KEY, useCandidates, useSnapshot } from '@/api/queries';
import { setRoleHealthOverride, type Snapshot } from '@/api/actions';
import { useUser } from '@/auth/auth';
import { buildRoleSummary, HEALTH_LABEL, sourceBreakdown, type HealthStatus, type RoleSummary } from '@/domain/reports';
import { CANDIDATE_STAGES, SOURCES } from '@/domain/stages';
import { Badge, Button, Empty, Field, Kpis, PageHeader, Section } from '@/ui/kit';
import { useToast } from '@/ui/toast';

const RANK: Record<HealthStatus, number> = { red: 0, yellow: 1, green: 2 };
const TONE: Record<HealthStatus, 'danger' | 'warning' | 'success'> = { red: 'danger', yellow: 'warning', green: 'success' };

export default function ProjectsPage() {
  const user = useUser();
  const { candidates } = useCandidates();
  const snap = useSnapshot();
  const toast = useToast();
  const summary = useMemo(() => buildRoleSummary(candidates, snap.data?.roleHealth || {}), [candidates, snap.data?.roleHealth]);
  const roles = Object.keys(summary).sort((a, b) => {
    if (a === '(Unassigned)') return 1;
    if (b === '(Unassigned)') return -1;
    return RANK[summary[a].health.status] - RANK[summary[b].health.status] || a.localeCompare(b);
  });
  const isPm = user.role === 'PM';
  const totals = roles.reduce((t, r) => {
    const b = summary[r];
    t.active += b.activeCandidates;
    t.overdue += b.overdue.length;
    t.followUp += b.needingFollowUp.length;
    for (const [k, v] of Object.entries(b.todaysProgress)) t.progress[k] = (t.progress[k] || 0) + v;
    t.hired += b.closedToday.Hired; t.rejected += b.closedToday.Rejected; t.withdrawn += b.closedToday.Withdrawn;
    return t;
  }, { active: 0, overdue: 0, followUp: 0, progress: {} as Record<string, number>, hired: 0, rejected: 0, withdrawn: 0 });
  const atRisk = roles.filter((r) => summary[r].health.status === 'red');
  const attention = roles.filter((r) => summary[r].health.status === 'yellow');

  const copySummary = () => {
    const lines = [`HIRING PROJECTS: ${new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, ''];
    for (const role of roles) {
      const b = summary[role];
      lines.push(`${HEALTH_LABEL[b.health.status]}: ${role}, ${b.activeCandidates} active${b.health.reason ? ` (${b.health.reason})` : ''}`);
      const stages = CANDIDATE_STAGES.filter((s) => b.stageCounts[s]).map((s) => `${b.stageCounts[s]} ${s}`);
      if (stages.length) lines.push(`   Stages: ${stages.join(', ')}`);
      const today = Object.entries(b.todaysProgress).map(([k, v]) => `${v} ${k}`);
      if (today.length) lines.push(`   Today: ${today.join(', ')}`);
      if (b.blockers.length) lines.push(`   Blockers: ${b.blockers.join('; ')}`);
      if (b.pmNote) lines.push(`   Note: ${b.pmNote}`);
      lines.push('');
    }
    navigator.clipboard?.writeText(lines.join('\n')).then(() => toast.show({ message: 'Summary copied. Paste it into email or chat.' }));
  };

  return (
    <div className="app-stack">
      <PageHeader title="Hiring projects" lead={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        actions={<Button variant="outline" size="sm" icon={Copy} onClick={copySummary} disabled={!roles.length}>Copy summary</Button>} />
      {!roles.length ? <Empty icon={BarChart3} title="No candidates yet">Hiring projects fill in as candidates are added.</Empty> : (
        <>
          <section className="ab-feature app-overview">
            <div className="app-overview__head">
              <h2 className="ab-card__title">Today</h2>
              <p className="m-0">{totals.overdue} past their expected time in stage, {totals.followUp} waiting on a follow-up. Closed today: {totals.hired} hired, {totals.rejected} rejected, {totals.withdrawn} withdrew.</p>
            </div>
            <Kpis items={[
              { value: totals.active, label: 'Active candidates' },
              { value: totals.progress['New applications'] || 0, label: 'Applications today' },
              { value: (totals.progress['HR preliminary interviews'] || 0) + (totals.progress['Initial interviews'] || 0), label: 'Interviews today' },
              { value: totals.progress['Assessments completed'] || 0, label: 'Assessments completed' },
              { value: totals.progress['Offers'] || 0, label: 'Offers' },
              { value: totals.hired, label: 'Hires today' },
            ]} />
          </section>

          <Section title="Role health" lead={`${roles.length - atRisk.length - attention.length} on track, ${attention.length} need attention, ${atRisk.length} at risk.`}>
            <ul className="ab-rows">
              {roles.map((r) => <RoleRow key={r} role={r} b={summary[r]} detail={isPm} />)}
            </ul>
          </Section>

          {isPm && <Sources />}
        </>
      )}
    </div>
  );
}

function RoleRow({ role, b, detail }: { role: string; b: RoleSummary; detail: boolean }) {
  const h = b.health;
  const head = (<>
    <span className="ab-row__title">{role}</span>
    <span className="app-role-row__badge"><Badge tone={TONE[h.status]}>{HEALTH_LABEL[h.status]}</Badge></span>
    <span className="ab-row__body">{h.reason}{h.source === 'PM override' && <span className="app-meta">, set by {h.setBy || 'PM'}</span>}</span>
    <span className="ab-row__meta">{b.activeCandidates} active</span>
  </>);
  if (!detail) return <li className="ab-row app-role-row">{head}</li>;
  return (
    <li>
      <details className="app-role">
        <summary className="ab-row app-role-row app-role__summary">{head}</summary>
        <div className="app-role__body">
          <div className="app-role__cols">
            <div>
              <h4 className="ab-label m-0 mb-2">By stage</h4>
              {CANDIDATE_STAGES.some((s) => b.stageCounts[s]) ? (
                <table className="ab-table app-mini-table">
                  <tbody>{CANDIDATE_STAGES.filter((s) => b.stageCounts[s]).map((s) => (
                    <tr key={s}><td>{s}</td><td className="ab-num">{b.stageCounts[s]}</td><td className="ab-num app-meta">{b.avgDaysInStage[s] !== undefined ? `${b.avgDaysInStage[s]} days avg` : ''}</td></tr>
                  ))}</tbody>
                </table>
              ) : <p className="ab-muted m-0">No candidates.</p>}
            </div>
            <div className="grid gap-4 content-start">
              <div>
                <h4 className="ab-label m-0 mb-1">Today</h4>
                <p className="m-0">{Object.entries(b.todaysProgress).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ') || 'Nothing moved yet.'}</p>
              </div>
              <div>
                <h4 className="ab-label m-0 mb-1">Blockers</h4>
                {b.blockers.length ? <ul className="app-list">{b.blockers.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="m-0">None.</p>}
                {b.needingFollowUp.length > 0 && <p className="app-meta m-0">{b.needingFollowUp.length} waiting on a follow-up.</p>}
              </div>
              <div>
                <h4 className="ab-label m-0 mb-1">Most common next actions</h4>
                <p className="m-0">{b.nextActionSummary.map((x) => `${x.action} (${x.count})`).join(', ') || 'None'}</p>
              </div>
            </div>
          </div>
          <HealthEditor role={role} b={b} />
        </div>
      </details>
    </li>
  );
}

function HealthEditor({ role, b }: { role: string; b: RoleSummary }) {
  const user = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const isOverride = b.health.source === 'PM override';
  const [status, setStatus] = useState(isOverride ? b.health.status : '');
  const [reason, setReason] = useState(isOverride ? b.health.reason : '');
  const [note, setNote] = useState(b.pmNote);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await setRoleHealthOverride({ role, status, reason: reason.trim(), setBy: user.name, pmNote: note.trim() });
      qc.setQueryData<Snapshot>(SNAPSHOT_KEY, (s) => {
        if (!s) return s;
        const roleHealth = { ...s.roleHealth };
        if (status || note.trim()) roleHealth[role] = { status: status as HealthStatus | '', reason: reason.trim(), setBy: user.name, setAt: new Date().toISOString(), pmNote: note.trim() };
        else delete roleHealth[role];
        return { ...s, roleHealth };
      });
      toast.show({ message: `Saved for ${role}` });
    } catch (e) {
      toast.error(`Couldn't save: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="app-health-editor">
      <Field label="Health" htmlFor={`h-${role}`} hint="Automatic lets the app decide from the pipeline.">
        <select id={`h-${role}`} className="ab-select" value={status} onChange={(e) => setStatus(e.target.value as HealthStatus | '')}>
          <option value="">Automatic</option><option value="green">On track</option><option value="yellow">Needs attention</option><option value="red">At risk</option>
        </select>
      </Field>
      <Field label="Why" htmlFor={`hr-${role}`}><input id={`hr-${role}`} className="ab-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Shown next to the health" /></Field>
      <Field label="PM note" htmlFor={`hn-${role}`}><textarea id={`hn-${role}`} className="ab-textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Context. Doesn't change the health." /></Field>
      <div><Button variant="secondary" size="sm" busy={busy} onClick={save}>Save</Button></div>
    </div>
  );
}

function Sources() {
  const { candidates } = useCandidates();
  const navigate = useNavigate();
  const rows = useMemo(() => sourceBreakdown(candidates), [candidates]);
  return (
    <Section title="Where hires come from" lead="Pass rate is hired divided by hired plus rejected or not responding. Still deciding means no final outcome yet.">
      <div className="ab-table-wrap">
        <table className="ab-table">
          <thead><tr><th>Source</th><th className="ab-num">Total</th><th className="ab-num">Hired</th><th className="ab-num">Rejected or no reply</th><th className="ab-num">Still deciding</th><th className="ab-num">Pass rate</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.source}>
                <td>{SOURCES.includes(r.source) ? <button type="button" className="app-link-button" onClick={() => navigate(`/candidates?chip=all&view=board&source=${encodeURIComponent(r.source)}`)}>{r.source}</button> : r.source}</td>
                <td className="ab-num">{r.total}</td><td className="ab-num">{r.hired}</td><td className="ab-num">{r.rejectedOrNC}</td><td className="ab-num">{r.deciding}</td>
                <td className="ab-num">{r.passRate === null ? <span className="ab-subtle">No decisions yet</span> : `${r.passRate}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
