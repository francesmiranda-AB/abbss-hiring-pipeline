// The candidate record exactly as the backend's getAll returns it (one Sheet
// row, see applicantFromRow_ in backend/Code.js). Saves send the whole record
// back plus the list of fields that changed, so unknown fields must survive a
// round trip untouched: keep the index signature.

export type OverallStatus = 'In Progress' | 'Hired' | 'Rejected' | 'Hold' | 'NonCompliant' | 'Departed' | 'Deleted';

export interface Grit { score: string | number; perseverance?: string | number; consistency?: string | number; label?: string; notes?: string; outcome?: string }
export interface Values { score: string | number; confScore?: string | number; intScore?: string | number; label?: string; notes?: string; outcome?: string }

export interface Emm {
  graded: boolean;
  overallPct: number | string | null;
  catPct?: number | string | null;
  actPct?: number | string | null;
  pass: boolean | null;
  gradedAt?: string;
  notes?: string;
  fullResult?: string;
  highRiskFlag?: boolean;
  legacyOverallPct?: number;
  catWrong?: unknown[];
  catWrongTruncated?: boolean;
}

export interface Interview {
  result?: 'pass' | 'fail' | null;
  notes?: string;
  [key: string]: unknown;
}

export interface OfferDetails { jd?: string; startDate?: string; rate?: string; contractType?: string; signatory?: string }

export interface InterviewSlot { id: string; label: string; startIso?: string; durationMin?: number; meetLink?: string }

export interface Candidate {
  id: number;
  name: string;
  email: string;
  phone?: string;
  position?: string;
  source?: string;
  dateReceived?: string;
  department?: string;
  roleCategory?: string;
  enteredBy?: string;
  requiresEmm: boolean;
  overallStatus: OverallStatus | string;
  statusChangedAt?: string;
  candidateStage: string;
  candidateStageDates?: Record<string, string>;
  nextAction?: string;
  closedReason?: string;
  createdAt?: string;
  resumeNotes?: string;
  decisionNotes?: string;
  grit: Grit;
  values: Values;
  emm: Emm;
  emmReceivedAt?: string;
  emmFileUrl?: string;
  interview: Interview;
  emailsSent?: Record<string, string>;
  emailsOpened?: Record<string, string>;
  assessmentViews?: Record<string, string>;
  offerDetails?: OfferDetails;
  cvUrl?: string;
  cvFileId?: string;
  cvFileName?: string;
  cvUploadedAt?: string;
  interviewSlots?: InterviewSlot[];
  schedulingToken?: string;
  candidateSlotPicks?: string[];
  candidateContact?: string;
  confirmedSlot?: InterviewSlot | null;
  confirmedAt?: string;
  smsSentAt?: string;
  calendarEventId?: string;
  [key: string]: unknown;
}

export type AppRole = 'HR' | 'Operations' | 'PM' | 'CEO';

export interface RoleHealthOverride { status?: 'green' | 'yellow' | 'red' | ''; reason?: string; pmNote?: string; setBy?: string; setAt?: string }

export interface ServerConfig {
  deadlineHours: number;
  reminderHours: number;
  reminderTemplate?: { subject: string; body: string };
  features?: Record<string, boolean>;
}

export interface OffboardingCase {
  id: string;
  name: string;
  track?: string;
  position?: string;
  department?: string;
  dateHired?: string;
  noticeDate?: string;
  lastWorkingDay?: string;
  supervisor?: string;
  status?: string;
  checklist?: Record<string, boolean>;
  notes?: string;
  [key: string]: unknown;
}
