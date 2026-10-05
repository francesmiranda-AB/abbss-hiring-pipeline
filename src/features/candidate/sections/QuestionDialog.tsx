import { useState } from 'react';
import { ClipboardCheck, MessageSquareText, Users } from 'lucide-react';
import { QUESTION_LIMITS, questionProblem, type InterviewQuestion, type QuestionDraft, type QuestionSet } from '@/domain/interviewQuestions';
import { Button, Dialog, DialogGroup, Field } from '@/ui/kit';

// Add or edit one question: the question itself, the model answer, and (for a
// role-specific question) the hiring roles it applies to.
export function QuestionDialog({ set, question, roles, defaultRole, onClose, onSave }: {
  set: QuestionSet; question?: InterviewQuestion; roles: string[]; defaultRole: string;
  onClose: () => void; onSave: (draft: QuestionDraft) => Promise<boolean>;
}) {
  const [text, setText] = useState(question?.question || '');
  const [skill, setSkill] = useState(question?.skill || '');
  const [lookFor, setLookFor] = useState(question?.lookFor || '');
  const [watchOut, setWatchOut] = useState(question?.watchOut || '');
  const [note, setNote] = useState(question?.note || '');
  const [picked, setPicked] = useState<string[]>(question ? question.roles : defaultRole ? [defaultRole] : []);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const draft: QuestionDraft = { id: question?.id, set, roles: set === 'role' ? picked : [], skill, question: text, lookFor, watchOut, note };
  const problem = questionProblem(draft);
  const submit = async () => {
    setTried(true);
    if (problem) return;
    setBusy(true);
    try { await onSave(draft); } finally { setBusy(false); }
  };
  const toggle = (r: string, on: boolean) => setPicked((cur) => (on ? [...cur, r] : cur.filter((x) => x !== r)));
  // Roles already on the question stay listed even if no candidate uses them any more.
  const options = [...new Set([...roles, ...picked])];

  return (
    <Dialog open onClose={onClose} wide title={`${question ? 'Edit' : 'Add'} ${set === 'role' ? 'a role-specific' : 'a behavioral'} question`} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" busy={busy} onClick={submit}>{question ? 'Save question' : 'Add question'}</Button>
    </>}>
      <div className="app-dialog-groups">
        <DialogGroup title="Question" icon={MessageSquareText} tone="blue">
          <Field label="Question" required htmlFor="q-text" error={tried && !text.trim() ? 'Write the question.' : undefined}>
            <textarea id="q-text" className="ab-textarea" rows={3} maxLength={QUESTION_LIMITS.question} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Field label="Skill it tests" htmlFor="q-skill" hint="A short label shown in the list. Optional.">
            <input id="q-skill" className="ab-input" maxLength={QUESTION_LIMITS.skill} value={skill} onChange={(e) => setSkill(e.target.value)} />
          </Field>
        </DialogGroup>
        <DialogGroup title="Answer guidance" icon={ClipboardCheck} tone="green">
          <Field label="What a good answer looks like" htmlFor="q-look">
            <textarea id="q-look" className="ab-textarea" rows={3} maxLength={QUESTION_LIMITS.lookFor} value={lookFor} onChange={(e) => setLookFor(e.target.value)} />
          </Field>
          <Field label="Watch out for" htmlFor="q-watch">
            <textarea id="q-watch" className="ab-textarea" rows={2} maxLength={QUESTION_LIMITS.watchOut} value={watchOut} onChange={(e) => setWatchOut(e.target.value)} />
          </Field>
          <Field label="Note" htmlFor="q-note" hint="Extra context for the interviewer. Optional.">
            <textarea id="q-note" className="ab-textarea" rows={2} maxLength={QUESTION_LIMITS.note} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </DialogGroup>
        {set === 'role' && (
          <DialogGroup title="Applies to" icon={Users} tone="amber">
            <fieldset className="app-fieldset" aria-describedby={tried && !picked.length ? 'q-roles-error' : undefined}>
              <legend className="ab-visually-hidden">Hiring roles this question applies to</legend>
              <div className="app-checks">
                {options.map((r) => (
                  <label key={r} className="ab-check">
                    <input type="checkbox" checked={picked.includes(r)} onChange={(e) => toggle(r, e.target.checked)} /> {r}
                  </label>
                ))}
              </div>
            </fieldset>
            {tried && !picked.length && <p id="q-roles-error" className="ab-error m-0" role="alert">Choose at least one hiring role.</p>}
          </DialogGroup>
        )}
        {tried && problem && text.trim() && picked.length > 0 && <p className="ab-error m-0" role="alert">{problem}</p>}
      </div>
    </Dialog>
  );
}
