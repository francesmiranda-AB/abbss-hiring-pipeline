// @vitest-environment node
// The app and the backend each keep a copy of a few rules. These tests load
// the real backend (backend/Code.js, through the vm harness) and check that
// both copies give the same answers.
import { createRequire } from 'node:module';
import { assessmentsSubmitted, gritOutcome, valuesOutcome } from './assessments';
import { CANDIDATE_STAGES, CLOSED_STAGES } from './stages';
import type { Candidate } from './types';

const require = createRequire(import.meta.url);
const { load } = require('../../backend/tests/harness.cjs') as {
  load: () => {
    assessmentsSubmitted_: (g: boolean, v: boolean, emm: boolean, rec: boolean, graded: boolean) => boolean;
    getGritLabel: (s: number) => string;
    getValuesLabel: (t: number, c: number, i: number) => string;
    get: (expr: string) => unknown;
  };
};
const be = load();

it('agrees on "all assessments submitted"', () => {
  for (const g of ['', '4']) for (const v of ['', '250']) for (const emm of [false, true]) for (const rec of ['', 'x']) for (const graded of [false, true]) {
    const a = { grit: { score: g }, values: { score: v }, requiresEmm: emm, emmReceivedAt: rec, emm: { graded } } as unknown as Candidate;
    expect(assessmentsSubmitted(a)).toBe(be.assessmentsSubmitted_(g !== '', v !== '', emm, !!rec, graded));
  }
});

it('agrees on GRIT and Values labels', () => {
  for (const s of [1, 2.99, 3, 3.5, 3.99, 4, 5]) expect(gritOutcome(s).label).toBe(be.getGritLabel(s));
  for (const total of [0, 100, 125, 126, 200, 220, 221, 315])
    for (const conf of [0, 1, 2, 3, 10])
      for (const int of [0, 2, 3, 10])
        expect(valuesOutcome(total, conf, int).label).toBe(be.getValuesLabel(total, conf, int));
});

it('uses the same stage list', () => {
  expect(be.get('CANDIDATE_STAGES')).toEqual([...CANDIDATE_STAGES]);
  expect(be.get('CLOSED_STAGES')).toEqual([...CLOSED_STAGES]);
});
