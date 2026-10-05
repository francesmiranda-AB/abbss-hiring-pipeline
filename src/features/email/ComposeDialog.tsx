import { CANDIDATE_TEMPLATE_KEYS, EMAIL_TEMPLATE_LABELS } from '@/domain/emailTemplates';
import type { Candidate } from '@/domain/types';
import { Dialog, Field } from '@/ui/kit';
import { Composer, useDrafts } from './Composer';

// Emailing a candidate without leaving their record: the same composer as the
// Email page, in a dialog over the panel. `template` is the one to start from.
export function ComposeDialog({ a, template, onTemplate, onClose }: { a: Candidate; template: string | null; onTemplate: (k: string) => void; onClose: () => void }) {
  const { drafts, setDraft } = useDrafts();
  return (
    <Dialog open={!!template} onClose={onClose} wide title={`Email ${a.name}`}>
      {template && (
        <div className="grid gap-4">
          <Field label="Template" htmlFor="compose-template">
            <select id="compose-template" className="ab-select" value={template} onChange={(e) => onTemplate(e.target.value)}>
              {CANDIDATE_TEMPLATE_KEYS.map((k) => <option key={k} value={k}>{EMAIL_TEMPLATE_LABELS[k]}{a.emailsSent?.[k] ? ' (sent)' : ''}</option>)}
            </select>
          </Field>
          <Composer a={a} template={template} drafts={drafts} setDraft={setDraft} onSent={onClose} />
        </div>
      )}
    </Dialog>
  );
}
