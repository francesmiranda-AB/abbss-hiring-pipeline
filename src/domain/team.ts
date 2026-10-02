import type { AppRole } from './types';

// The team: who you can pick on the sign-in screen (with the role you start
// in), and who gets the "candidate endorsed to Operations" notice. The backend
// keeps its own copy for emails it sends with no one in the app.
export interface TeamMember { name: string; short: string; email: string; role: AppRole; notifyOnOpsInterview: boolean }

export const TEAM_MEMBERS: TeamMember[] = [
  { name: 'Frances Miranda', short: 'Frances', email: 'frances.miranda@ab-businesssupport.com', role: 'HR', notifyOnOpsInterview: true },
  { name: 'Wennielyn Pungasi', short: 'Wen', email: 'wennielyn.pungasi@ab-businesssupport.com', role: 'HR', notifyOnOpsInterview: true },
  { name: 'David Latimer', short: 'David', email: 'operations@ab-businesssupport.com', role: 'Operations', notifyOnOpsInterview: true },
];

export const opsNotifyRecipients = () => TEAM_MEMBERS.filter((m) => m.notifyOnOpsInterview).map((m) => m.email).join(',');
