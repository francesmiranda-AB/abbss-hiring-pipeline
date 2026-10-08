import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { BarChart3, CalendarDays, DoorOpen, FileCheck2, ListChecks, Mail, UserPlus, Users, type LucideIcon } from 'lucide-react';
import type { AppRole } from '@/domain/types';

// Every feature, in one list: where it lives, who sees it, and whether it is
// on. A feature can be switched off without a deploy by setting
// FEATURE_FLAGS={"<key>": false} in the backend's Script Properties.
export interface Feature {
  key: string;
  path: string;
  label: string;
  icon: LucideIcon;
  roles: AppRole[];
  group: 'work' | 'more';
  defaultOn: boolean;
  page: LazyExoticComponent<ComponentType>;
  load: () => Promise<{ default: ComponentType }>;
}

export const FEATURES: Feature[] = [
  { key: 'today', path: '/today', label: 'Today', icon: ListChecks, roles: ['HR', 'Operations', 'PM', 'CEO'], group: 'work', defaultOn: true, load: () => import('./today/TodayPage'), page: lazy(() => import('./today/TodayPage')) },
  { key: 'candidates', path: '/candidates', label: 'Candidates', icon: Users, roles: ['HR', 'Operations', 'PM'], group: 'work', defaultOn: true, load: () => import('./candidates/CandidatesPage'), page: lazy(() => import('./candidates/CandidatesPage')) },
  { key: 'newCandidate', path: '/new', label: 'Add candidate', icon: UserPlus, roles: ['HR'], group: 'work', defaultOn: true, load: () => import('./new/NewCandidatePage'), page: lazy(() => import('./new/NewCandidatePage')) },
  { key: 'calendar', path: '/calendar', label: 'Interview calendar', icon: CalendarDays, roles: ['HR', 'Operations'], group: 'work', defaultOn: true, load: () => import('./calendar/CalendarPage'), page: lazy(() => import('./calendar/CalendarPage')) },
  { key: 'grader', path: '/grader', label: 'EMM grader', icon: FileCheck2, roles: ['HR'], group: 'work', defaultOn: true, load: () => import('./grader/GraderPage'), page: lazy(() => import('./grader/GraderPage')) },
  { key: 'email', path: '/email', label: 'Email', icon: Mail, roles: ['HR'], group: 'work', defaultOn: true, load: () => import('./email/EmailPage'), page: lazy(() => import('./email/EmailPage')) },
  { key: 'projects', path: '/projects', label: 'Hiring projects', icon: BarChart3, roles: ['PM', 'CEO'], group: 'more', defaultOn: true, load: () => import('./projects/ProjectsPage'), page: lazy(() => import('./projects/ProjectsPage')) },
  { key: 'offboarding', path: '/offboarding', label: 'Offboarding', icon: DoorOpen, roles: ['HR'], group: 'more', defaultOn: true, load: () => import('./offboarding/OffboardingPage'), page: lazy(() => import('./offboarding/OffboardingPage')) },
];

export function visibleFeatures(role: AppRole, flags: Record<string, boolean> = {}): Feature[] {
  return FEATURES.filter((f) => f.roles.includes(role) && (flags[f.key] ?? f.defaultOn));
}

export function homePath(role: AppRole, flags: Record<string, boolean> = {}): string {
  const list = visibleFeatures(role, flags);
  const preferred = role === 'PM' || role === 'CEO' ? 'projects' : 'today';
  return (list.find((f) => f.key === preferred) || list[0])?.path || '/today';
}

export const ROLE_LABEL: Record<AppRole, string> = { HR: 'HR', Operations: 'Operations', PM: 'Project Manager', CEO: 'CEO' };

// Start downloading the page someone is about to see while the data loads, instead of after.
export function preloadPage(pathname: string, role: AppRole, flags: Record<string, boolean> = {}): void {
  const list = visibleFeatures(role, flags);
  const f = list.find((x) => pathname.startsWith(x.path)) || list.find((x) => x.path === homePath(role, flags));
  void f?.load().catch(() => { /* the page loads normally later; this was only a head start */ });
}
