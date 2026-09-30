import { useEffect, useRef, useState } from 'react';
import { DEV_SIGN_IN, useAuth } from '@/auth/auth';
import { ROLE_LABEL } from '@/features/registry';
import { TEAM_MEMBERS } from '@/domain/team';
import type { AppRole } from '@/domain/types';
import { Button, ErrorAlert, Field } from '@/ui/kit';

export function SignIn() {
  const { status, error, renderButton, devSignIn, signOut } = useAuth();
  const btn = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!DEV_SIGN_IN && status === 'signed-out') renderButton(btn.current); }, [status, renderButton]);
  return (
    <div className="app-signin">
      <section className="ab-feature app-signin__card">
        <p className="app-signin__brand">AB Business Support</p>
        <h1 className="ab-statement ab-statement--md">Hiring pipeline</h1>
        <p className="ab-muted m-0">Candidates, assessments, interviews and offers, in one place for the hiring team.</p>
        {status === 'not-staff' ? (
          <div className="grid gap-3">
            <ErrorAlert title="This account can't use the app">{error} Ask HR to add you to the staff list.</ErrorAlert>
            <div><Button variant="secondary" onClick={signOut}>Use another account</Button></div>
          </div>
        ) : DEV_SIGN_IN ? <DevPicker onPick={devSignIn} /> : (
          <div className="grid gap-3">
            <div ref={btn} className="app-gis-button" />
            {error && <ErrorAlert title="Sign-in problem">{error}</ErrorAlert>}
            <p className="ab-hint m-0">Use your @ab-businesssupport.com Google account.</p>
          </div>
        )}
      </section>
    </div>
  );
}

// Local development only: stands in for Google sign-in (the staging backend
// must run with AUTH_MODE=off).
function DevPicker({ onPick }: { onPick: (name: string, role: AppRole) => void }) {
  const [name, setName] = useState(TEAM_MEMBERS[0].name);
  const [role, setRole] = useState<AppRole>('HR');
  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); onPick(name, role); }}>
      <p className="ab-hint m-0">Local development sign-in. The deployed app uses Google sign-in.</p>
      <Field label="Name" htmlFor="dev-name">
        <input id="dev-name" className="ab-input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Role" htmlFor="dev-role">
        <select id="dev-role" className="ab-select" value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
          {(Object.keys(ROLE_LABEL) as AppRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </Field>
      <div><Button type="submit" variant="primary">Continue</Button></div>
    </form>
  );
}
