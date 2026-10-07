import { normalizeCandidate } from './actions';
import { loadSnapshot } from './snapshotCache';
import { boardColumns } from '@/features/candidates/CandidateBoard';
import type { Candidate } from '@/domain/types';

const base = {
  id: 1, name: 'Numeric Phone', email: 'n@example.com', requiresEmm: false, overallStatus: 'In Progress', candidateStage: 'Initial Interview',
  grit: { score: '' }, values: { score: '' }, emm: { graded: false, overallPct: null, pass: null }, interview: {},
} as Candidate;

describe('text the Sheet hands back as numbers', () => {
  it('becomes text, so screens can treat it as text', () => {
    const raw = { ...base, phone: 639171234567, candidateContact: 9171234567, position: 2024, source: '' } as unknown as Candidate;
    const a = normalizeCandidate(raw);
    expect(a.phone).toBe('639171234567');
    expect(a.candidateContact).toBe('9171234567');
    expect(a.position).toBe('2024');
    expect(a.source).toBe('');
    expect(() => String(a.phone).replace(/[^+\d]/g, '')).not.toThrow();
  });

  it('leaves blank and missing fields alone', () => {
    const a = normalizeCandidate({ ...base, phone: undefined });
    expect(a.phone).toBeUndefined();
  });

  it('a copy saved on the device before the fix is cleaned up when loaded', () => {
    const data = { candidates: [{ ...base, phone: 639171234567 }], config: { deadlineHours: 24, reminderHours: 12 }, roleHealth: {}, minClientVersion: 0 };
    localStorage.setItem('abbss_snapshot_v1', JSON.stringify({ savedAt: Date.now(), data }));
    expect(loadSnapshot()!.data.candidates[0].phone).toBe('639171234567');
    localStorage.clear();
  });
});

describe('board columns', () => {
  const at = (stage: string, id = 1) => ({ ...base, id, candidateStage: stage });

  it('Operations starts at the Ops interview', () => {
    const cols = boardColumns([at('Initial Interview')], 'Operations');
    expect(cols[0].key).toBe('Initial Interview');
    expect(cols.map((c) => c.key)).not.toContain('New Application');
  });

  it('Operations still sees an earlier column if someone is in it', () => {
    const cols = boardColumns([at('Assessment Review', 1), at('Initial Interview', 2)], 'Operations');
    expect(cols[0].key).toBe('Assessment Review');
  });

  it('HR keeps the whole pipeline, empty columns included', () => {
    const cols = boardColumns([at('Initial Interview')], 'HR');
    expect(cols[0].key).toBe('New Application');
    expect(cols).toHaveLength(12);
  });
});
