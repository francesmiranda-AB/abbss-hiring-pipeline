import { useUser } from '@/auth/auth';
import { capabilities, type Capabilities } from '@/domain/permissions';
import type { Candidate } from '@/domain/types';

export function useCaps(a?: Candidate | null): Capabilities {
  return capabilities(useUser().role, a);
}
