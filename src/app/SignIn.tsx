import { useState } from 'react';
import { useAuth } from '@/auth/auth';
import { ROLE_LABEL } from '@/features/registry';
import { TEAM_MEMBERS } from '@/domain/team';
import type { AppRole } from '@/domain/types';
import { Button, Field } from '@/ui/kit';

const OTHER = '__other';

// Pick who you are. No password: the choice is remembered on this device.
export function SignIn() {
  const { signIn } = useAuth();
  const [pick, setPick] = useState(TEAM_MEMBERS[0].name);
  const [otherName, setOtherName] = useState('');
  const [role, setRole] = useState<AppRole>(TEAM_MEMBERS[0].role);
  const member = TEAM_MEMBERS.find((m) => m.name === pick);
  const name = member ? member.name : otherName.trim();
  const choose = (value: string) => {
    setPick(value);
    const m = TEAM_MEMBERS.find((x) => x.name === value);
    if (m) setRole(m.role);
  };
  return (
    <div className="app-signin">
      <section className="ab-feature app-signin__card">
        <p className="app-signin__brand">AB Business Support</p>
        <h1 className="ab-statement ab-statement--md">Hiring pipeline</h1>
        <p className="ab-muted m-0">Candidates, assessments, interviews and offers, in one place for the hiring team.</p>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (name) signIn({ email: member?.email || '', name, role }); }}>
          <Field label="Who are you?" htmlFor="who">
            <select id="who" className="ab-select" value={pick} onChange={(e) => choose(e.target.value)}>
              {TEAM_MEMBERS.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
              <option value={OTHER}>Someone else</option>
            </select>
          </Field>
          {!member && (
            <Field label="Your name" htmlFor="who-name" required>
              <input id="who-name" className="ab-input" value={otherName} autoFocus onChange={(e) => setOtherName(e.target.value)} />
            </Field>
          )}
          <Field label="Role" htmlFor="who-role" hint="You can switch later from the menu.">
            <select id="who-role" className="ab-select" value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
              {(Object.keys(ROLE_LABEL) as AppRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </Field>
          <div><Button type="submit" variant="primary" disabled={!name}>Continue</Button></div>
        </form>
      </section>
    </div>
  );
}
