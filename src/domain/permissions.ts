import type { AppRole, Candidate } from './types';
import { getStageTask, OWNER_TO_ROLE } from './attention';

// What each role may do. One table, used by every screen, so a control a role
// can't use is hidden instead of bouncing them somewhere else.
//
//   HR          everything
//   Operations  decide, interview notes and result, outcome (no email, grader, delete, export, bulk)
//   PM, CEO     read everything; edit the stage, interview and outcome only for
//               candidates whose current stage is theirs to act on
//
// Editing the shared interview question collections is a role-level right (not
// tied to a candidate): HR and Operations.

export type Capability =
  | 'details' | 'assessments' | 'stage' | 'schedule' | 'interview' | 'outcome'
  | 'email' | 'grader' | 'delete' | 'bulk' | 'export' | 'addCandidate' | 'questions';

export type Capabilities = Record<Capability, boolean>;

const NONE: Capabilities = {
  details: false, assessments: false, stage: false, schedule: false, interview: false, outcome: false,
  email: false, grader: false, delete: false, bulk: false, export: false, addCandidate: false, questions: false,
};

// True when the candidate's current stage belongs to this role.
export function ownsStage(a: Candidate | undefined | null, role: AppRole): boolean {
  if (!a) return false;
  const task = getStageTask(a);
  return !!task && OWNER_TO_ROLE[task.owner] === role;
}

export function capabilities(role: AppRole, a?: Candidate | null): Capabilities {
  if (role === 'HR') return Object.fromEntries(Object.keys(NONE).map((k) => [k, true])) as Capabilities;
  if (role === 'Operations') return { ...NONE, stage: true, interview: true, outcome: true, questions: true };
  const owns = ownsStage(a, role);
  return { ...NONE, stage: owns, interview: owns, outcome: owns };
}

export const can = (role: AppRole, cap: Capability, a?: Candidate | null): boolean => capabilities(role, a)[cap];
