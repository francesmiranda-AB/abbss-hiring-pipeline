// L3: 14 -> 12 stages, one alias map, one-time normalize.
const assert = require('assert');
const {load, row, test} = require('./harness.cjs');

const r = over => row(Object.assign({1: 'N', 2: 'n@x', 7: 'No', 9: 'In Progress'}, over));
const cells = (e, n) => e.book.Applicants.rows[n];

test('stages: getAll reports old names under the current ones', () => {
  const e = load({applicants: [r({0: 'A', 53: 'Waiting for Assessment', 57: JSON.stringify({'Assessment Sent': '2026-09-02T00:00:00Z', 'Waiting for Assessment': '2026-09-01T00:00:00Z'})}),
    r({0: 'B', 53: 'Waiting for Client Decision'}), r({0: 'C', 53: 'Job Offer'})]});
  const out = JSON.parse(e.doGet({parameter: {action: 'getAll'}})).data;
  assert.deepStrictEqual(out.map(a => a.candidateStage), ['Assessment Sent', 'Endorsed to Client', 'Offer']);
  assert.deepStrictEqual(out[0].candidateStageDates, {'Assessment Sent': '2026-09-01T00:00:00Z'}, 'earliest date kept');
});

test('stages: saving an old name stores the current one', () => {
  const e = load({applicants: [r({0: 'A', 53: 'Assessment Sent'})]});
  e.saveApplicant({id: 'A', name: 'N', email: 'n@x', candidateStage: 'Waiting for Client Decision', _changed: ['candidateStage']});
  assert.strictEqual(cells(e, 1)[53], 'Endorsed to Client');
});

test('stages: an unknown stage name keeps the stored stage', () => {
  const e = load({applicants: [r({0: 'A', 53: 'Initial Interview'})]});
  e.saveApplicant({id: 'A', name: 'N', email: 'n@x', candidateStage: 'Some Typo Stage'});
  assert.strictEqual(cells(e, 1)[53], 'Initial Interview');
});

test('stages: reminders still go to rows under the old waiting name', () => {
  const e = load({applicants: [r({0: 'A', 53: 'Waiting for Assessment', 30: JSON.stringify({assessment: new Date(Date.now() - 13 * 3600000).toISOString()})})]});
  e.checkAssessmentCompliance();
  assert.strictEqual(e.log.mail.length, 1);
});

function normalizeFixture() {
  return load({applicants: [
    r({0: 'W', 53: 'Waiting for Assessment'}),                             // rename
    r({0: 'CR', 53: 'Closed - Rejected'}),                                 // closed stage, In Progress -> Rejected
    r({0: 'HI', 53: 'Hired'}),                                             // Hired stage, In Progress -> Hired
    r({0: 'RA', 53: 'Assessment Review', 9: 'Rejected'}),                  // Rejected status, active stage -> Closed - Rejected
    r({0: 'BL', 53: '', 8: 4}),                                            // blank stage -> derived
    r({0: 'DL', 53: '', 9: 'Deleted'}),                                    // untouched
    r({0: 'OK', 53: 'Initial Interview'}),                                 // untouched
    r({0: 'DK', 53: 'Offer', 57: JSON.stringify({'Job Offer': '2026-09-01T00:00:00Z'})}), // date key only
  ]});
}

test('normalize: preview lists exactly the rows that need fixing', () => {
  const e = normalizeFixture();
  const p = e.previewNormalize();
  assert.strictEqual(p.success, true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(p.sample.map(x => x.id).sort())), ['BL', 'CR', 'DK', 'HI', 'RA', 'W']);
});

test('normalize: apply fixes stage and status, backs up, and is idempotent', () => {
  const e = normalizeFixture();
  const res = e.applyNormalize();
  assert.strictEqual(res.changed, 6);
  assert.ok(res.backup);
  const byId = id => e.book.Applicants.rows.find(x => x[0] === id);
  assert.strictEqual(byId('W')[53], 'Assessment Sent');
  assert.strictEqual(byId('CR')[9], 'Rejected');
  assert.strictEqual(byId('HI')[9], 'Hired');
  assert.strictEqual(byId('RA')[53], 'Closed - Rejected');
  assert.ok(byId('BL')[53] && e.get('CANDIDATE_STAGES').indexOf(byId('BL')[53]) >= 0, 'blank stage derived to a real stage');
  assert.strictEqual(byId('DL')[53], '');
  assert.deepStrictEqual(JSON.parse(byId('DK')[57]), {Offer: '2026-09-01T00:00:00Z'});
  assert.strictEqual(e.applyNormalize().changed, 0);
  assert.strictEqual(e.previewNormalize().total, 0);
});

test('outcome: undoing a stage change drops the date it stamped', () => {
  const e = load({applicants: [r({0: 'U', 53: 'Initial Interview', 57: JSON.stringify({'Initial Interview': '2026-09-01T00:00:00Z'})})]});
  e.saveApplicant({id: 'U', name: 'N', email: 'n@x', candidateStage: 'Operations Decision', _changed: ['candidateStage']});
  let dates = JSON.parse(cells(e, 1)[57]);
  assert.ok(dates['Operations Decision'], 'forward move stamps a date');
  e.saveApplicant({id: 'U', name: 'N', email: 'n@x', candidateStage: 'Initial Interview', _changed: ['candidateStage'], _undoStage: true});
  dates = JSON.parse(cells(e, 1)[57]);
  assert.strictEqual(dates['Operations Decision'], undefined, 'undo removes it');
  assert.strictEqual(dates['Initial Interview'], '2026-09-01T00:00:00Z', 'original date kept');
});

test('numeric stage column is frozen on saves', () => {
  const e = load({applicants: [r({0: 'F', 8: 5, 53: 'Initial Interview'})]});
  e.saveApplicant({id: 'F', name: 'N', email: 'n@x', stage: 9, candidateStage: 'Initial Interview'});
  assert.strictEqual(cells(e, 1)[8], 5);
});
