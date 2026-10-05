import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Mail } from 'lucide-react';
import { useCandidate, useCandidates } from '@/api/queries';
import { CANDIDATE_TEMPLATE_KEYS, EMAIL_TEMPLATE_LABELS, suggestedTemplateFor } from '@/domain/emailTemplates';
import { Empty, Field, PageHeader } from '@/ui/kit';
import { Composer, useDrafts } from './Composer';

export default function EmailPage() {
  const [params, setParams] = useSearchParams();
  const id = params.get('candidate') ? Number(params.get('candidate')) : null;
  const a = useCandidate(id);
  const template = params.get('template') || (a ? suggestedTemplateFor(a) : 'assessment');
  const { drafts, setDraft } = useDrafts();
  const setParam = (k: string, v: string) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  return (
    <div className="app-stack">
      <PageHeader title="Email a candidate" />
      <div className="app-email-grid">
        <aside className="grid gap-4 content-start">
          <CandidatePicker value={id} onChange={(v) => setParam('candidate', v ? String(v) : '')} />
          <nav aria-label="Templates">
            <p className="ab-label m-0 mb-2">Template</p>
            <ul className="app-template-list">
              {CANDIDATE_TEMPLATE_KEYS.map((k) => (
                <li key={k}>
                  <button type="button" className="app-template" aria-current={template === k ? 'true' : undefined} onClick={() => setParam('template', k)}>
                    <span>{EMAIL_TEMPLATE_LABELS[k]}</span>
                    {a?.emailsSent?.[k] && <Check size={14} aria-label="already sent" />}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        {a ? <section className="app-card-plain"><Composer key={`${a.id}-${template}`} a={a} template={template} drafts={drafts} setDraft={setDraft} /></section> : <Empty icon={Mail} title="Pick a candidate">Emails are recorded on the candidate, so choose who this is for.</Empty>}
      </div>
    </div>
  );
}

function CandidatePicker({ value, onChange }: { value: number | null; onChange: (id: number | null) => void }) {
  const { candidates } = useCandidates();
  const sorted = useMemo(() => [...candidates].sort((x, y) => x.name.localeCompare(y.name)), [candidates]);
  return (
    <Field label="Candidate" htmlFor="email-cand">
      <select id="email-cand" className="ab-select" value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Choose a candidate</option>
        {sorted.map((c) => <option key={c.id} value={c.id}>{c.name}{c.position ? `, ${c.position}` : ''}</option>)}
      </select>
    </Field>
  );
}
