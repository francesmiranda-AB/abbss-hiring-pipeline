// People the app emails or names without anyone signed in doing it: who gets
// the "candidate endorsed to Operations" notice. The signed-in user comes from
// the backend (whoami); the backend keeps its own copy for emails it sends
// with no one in the app.
export interface TeamMember { name: string; short: string; email: string; notifyOnOpsInterview: boolean }

export const TEAM_MEMBERS: TeamMember[] = [
  { name: 'Frances Miranda', short: 'Frances', email: 'frances.miranda@ab-businesssupport.com', notifyOnOpsInterview: true },
  { name: 'Wennielyn Pungasi', short: 'Wen', email: 'wennielyn.pungasi@ab-businesssupport.com', notifyOnOpsInterview: true },
  { name: 'David Latimer', short: 'David', email: 'operations@ab-businesssupport.com', notifyOnOpsInterview: true },
];

export const opsNotifyRecipients = () => TEAM_MEMBERS.filter((m) => m.notifyOnOpsInterview).map((m) => m.email).join(',');
