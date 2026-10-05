import { useMemo } from 'react';
import type { Candidate } from '@/domain/types';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { useCandidates, useConfig } from '@/api/queries';
import { getAllOffboarding } from '@/api/actions';
import { useUser } from '@/auth/auth';
import { isNewApplicant, needsAttention, OWNER_TO_ROLE } from '@/domain/attention';
import { calendarItems } from '@/domain/calendar';
import { isOffboardingDue } from '@/domain/offboarding';
import { stageLabel, stageTone } from '@/domain/stages';
import { roleScope } from '../candidates/filters';
import { tabForNextStep } from '../candidate/primaryAction';
import { CandidatePanel, useOpenCandidate } from '../candidate/CandidatePanel';
import { Badge, Empty, Kpis, PageHeader, Section } from '@/ui/kit';

// What needs doing now, for the signed-in person's role.
export default function TodayPage() {
  const user = useUser();
  const config = useConfig();
  const navigate = useNavigate();
  const { candidates } = useCandidates();
  const { openId, open } = useOpenCandidate();
  const offboarding = useQuery({ queryKey: ['offboarding'], queryFn: getAllOffboarding, enabled: user.role === 'HR' });

  const scope = useMemo(() => roleScope(candidates, user.role), [candidates, user.role]);
  const tasks = useMemo(() => scope
    .map((a) => ({ a, n: needsAttention(a, config) }))
    .filter((t): t is { a: typeof t.a; n: NonNullable<typeof t.n> } => !!t.n && OWNER_TO_ROLE[t.n.owner] === user.role)
    .sort((x, y) => (x.n.overdue === y.n.overdue ? new Date(x.a.createdAt || 0).getTime() - new Date(y.a.createdAt || 0).getTime() : x.n.overdue ? -1 : 1)),
  [scope, config, user.role]);
  const today = new Date();
  const interviewsToday = calendarItems(scope).filter((i) => i.status === 'confirmed' && i.date && i.date.toDateString() === today.toDateString()).length;
  const dueOffboarding = (offboarding.data || []).filter((c) => isOffboardingDue(c));
  const overdueTasks = tasks.filter((t) => t.n.overdue);
  const onTimeTasks = tasks.filter((t) => !t.n.overdue);
  const overdue = overdueTasks.length;

  return (
    <div className="app-stack">
      <PageHeader title={`Good ${today.getHours() < 12 ? 'morning' : today.getHours() < 18 ? 'afternoon' : 'evening'}, ${user.name.split(' ')[0]}`}
        lead={today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} />
      <Kpis compact items={[
        { value: tasks.length, label: 'Needs action', tone: 'warning', onClick: () => navigate('/candidates?chip=attention') },
        { value: overdue, label: 'Overdue', tone: 'danger', onClick: () => navigate('/candidates?chip=overdue') },
        { value: scope.filter((a) => isNewApplicant(a)).length, label: 'New today', tone: 'primary', onClick: () => navigate('/candidates?chip=new') },
        { value: interviewsToday, label: 'Interviews today', tone: 'success', onClick: () => navigate('/calendar') },
      ]} />

      {!tasks.length && !dueOffboarding.length ? (
        <Section title="Your tasks" count={0}>
          <Empty icon={CheckCircle2} title="Nothing needs you right now">New tasks show up here as candidates move.</Empty>
        </Section>
      ) : (<>
        {overdueTasks.length > 0 && (
          <Section title="Overdue" count={overdueTasks.length} countTone="danger">
            <TaskRows tasks={overdueTasks} onOpen={open} />
          </Section>
        )}
        {onTimeTasks.length > 0 && (
          <Section title="Needs action" count={onTimeTasks.length} countTone="warning">
            <TaskRows tasks={onTimeTasks} onOpen={open} />
          </Section>
        )}
        {dueOffboarding.length > 0 && (
          <Section title="Offboarding due" count={dueOffboarding.length} countTone="warning">
            <ul className="ab-rows">
              {dueOffboarding.map((c) => {
                const items = Object.keys(c.checklist || {});
                const done = items.filter((k) => c.checklist?.[k]).length;
                return (
                  <li key={`off-${c.id}`}>
                    <button type="button" className="ab-row app-row-button" onClick={() => navigate('/offboarding')}>
                      <span className="ab-row__title">{c.name}</span>
                      <span className="ab-row__body">Clearance {done} of {items.length} done. Last working day {c.lastWorkingDay}.</span>
                      <span className="ab-row__meta"><Badge tone="warning">Offboarding</Badge><ChevronRight size={16} aria-hidden /></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
      </>)}
      <CandidatePanel id={openId} />
    </div>
  );
}

type Task = { a: Candidate; n: NonNullable<ReturnType<typeof needsAttention>> };
function TaskRows({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: number, tab?: string) => void }) {
  return (
    <ul className="ab-rows">
      {tasks.map(({ a, n }) => (
        <li key={a.id}>
          <button type="button" className="ab-row app-row-button" onClick={() => onOpen(a.id, tabForNextStep(a))}>
            <span className="ab-row__title">{a.name}</span>
            <span className="ab-row__body">{n.reason}</span>
            <span className="ab-row__meta"><Badge tone={stageTone(a.candidateStage)}>{stageLabel(a)}</Badge><ChevronRight size={16} aria-hidden /></span>
          </button>
        </li>
      ))}
    </ul>
  );
}
