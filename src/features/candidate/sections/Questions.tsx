import { useState } from 'react';
import { ArrowDown, ArrowUp, ClipboardList, HeartHandshake, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Candidate } from '@/domain/types';
import { movedIds, questionsFor, rolesInUse, type InterviewQuestion, type QuestionSet } from '@/domain/interviewQuestions';
import { can } from '@/domain/permissions';
import { useCandidates } from '@/api/queries';
import { useInterviewQuestions, useQuestionActions } from '@/api/interviewQuestions';
import { useUser } from '@/auth/auth';
import { Button, Skeleton } from '@/ui/kit';
import { PanelSection } from './common';
import { QuestionDialog } from './QuestionDialog';

// The interview guide: questions for this candidate's hiring role, then the
// behavioral questions everyone gets. HR and Operations can add, edit, reorder
// and delete; everyone else reads them.
export function QuestionSets({ a }: { a: Candidate }) {
  const { questions, isFallback, isLoading } = useInterviewQuestions();
  const { candidates } = useCandidates();
  const { role } = useUser();
  const actions = useQuestionActions();
  const [editing, setEditing] = useState<{ set: QuestionSet; question?: InterviewQuestion } | null>(null);
  const canEdit = can(role, 'questions') && !isFallback;
  const { role: roleQs, behavioral } = questionsFor(questions, a.roleCategory);
  const roleName = (a.roleCategory || '').trim();

  const move = (list: InterviewQuestion[], q: InterviewQuestion, by: -1 | 1) => {
    const next = movedIds(list.map((x) => x.id), q.id, by);
    if (next) void actions.reorder(next);
  };
  const add = (set: QuestionSet) => canEdit && (
    <Button variant="ghost" size="sm" icon={Plus} onClick={() => setEditing({ set })}>Add a question</Button>
  );

  return (
    <>
      {isFallback && <p className="app-meta m-0">Showing the built-in questions. The shared collection can't be reached right now, so questions can't be changed.</p>}
      {isLoading && <Skeleton lines={2} />}

      <PanelSection title={roleName ? `Questions for ${roleName}` : 'Role-specific questions'} icon={ClipboardList} tone="blue" aside={roleName ? add('role') : undefined}>
        {!roleName ? (
          <p className="ab-muted m-0">Set a hiring role on the Overview tab to see its questions.</p>
        ) : roleQs.length ? (
          <QuestionList items={roleQs} group="role-questions" canEdit={canEdit} showRoles
            onEdit={(q) => setEditing({ set: 'role', question: q })} onDelete={actions.remove} onMove={(q, by) => move(roleQs, q, by)} />
        ) : !isLoading && <p className="ab-muted m-0">No questions for {roleName} yet.{canEdit ? ' Add the first one.' : ''}</p>}
      </PanelSection>

      <PanelSection title="Behavioral questions" icon={HeartHandshake} tone="blue" aside={add('behavioral')}>
        {behavioral.length
          ? <QuestionList items={behavioral} group="behavioral-questions" canEdit={canEdit}
            onEdit={(q) => setEditing({ set: 'behavioral', question: q })} onDelete={actions.remove} onMove={(q, by) => move(behavioral, q, by)} />
          : !isLoading && <p className="ab-muted m-0">No behavioral questions yet.{canEdit ? ' Add the first one.' : ''}</p>}
      </PanelSection>

      {editing && (
        <QuestionDialog set={editing.set} question={editing.question} defaultRole={roleName} roles={rolesInUse(candidates, questions)}
          onClose={() => setEditing(null)}
          onSave={async (draft) => { if (await actions.save(draft)) { setEditing(null); return true; } return false; }} />
      )}
    </>
  );
}

// One question per row; opening one closes the others (details with a shared name).
function QuestionList({ items, group, canEdit, showRoles, onEdit, onDelete, onMove }: {
  items: InterviewQuestion[]; group: string; canEdit: boolean; showRoles?: boolean;
  onEdit: (q: InterviewQuestion) => void; onDelete: (q: InterviewQuestion) => void; onMove: (q: InterviewQuestion, by: -1 | 1) => void;
}) {
  return (
    <div className="app-qa-list">
      {items.map((q, i) => (
        <details key={q.id} name={group} className="app-qa">
          <summary><span className="app-qa__num">{i + 1}</span> {q.skill || q.question}</summary>
          <div className="app-qa__body">
            <p className="m-0">{q.question}</p>
            {(q.lookFor || q.watchOut || q.note) && (
              <p className="app-meta m-0">
                {q.lookFor && <><strong>Look for:</strong> {q.lookFor} </>}
                {q.watchOut && <><strong>Watch out for:</strong> {q.watchOut} </>}
                {q.note}
              </p>
            )}
            {showRoles && q.roles.length > 1 && <p className="app-meta m-0">Applies to {q.roles.join(', ')}.</p>}
            {canEdit && (
              <div className="app-qa__actions">
                <Button variant="ghost" size="sm" icon={Pencil} onClick={() => onEdit(q)}>Edit</Button>
                <Button variant="ghost" size="sm" icon={ArrowUp} aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => onMove(q, -1)} />
                <Button variant="ghost" size="sm" icon={ArrowDown} aria-label={`Move question ${i + 1} down`} disabled={i === items.length - 1} onClick={() => onMove(q, 1)} />
                <Button variant="ghost" size="sm" icon={Trash2} className="app-btn-danger-text ml-auto" onClick={() => onDelete(q)}>Delete</Button>
              </div>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
