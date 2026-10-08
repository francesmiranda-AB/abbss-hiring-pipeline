// The candidate list leaves out the EMM grading detail; getEmmDetail serves it; saves keep it (AB-32).
const assert = require('assert');
const {load, row, test} = require('./harness.cjs');

const DETAIL = {notes: 'HR note', fullResult: JSON.stringify({flags: [{level: 'high', title: 'Copied'}], catByCat: {}}), catWrong: [{expected: 'A'}], catWrongTruncated: true};
const graded = (id, blob = DETAIL) => row({0: id, 1: 'Cand ' + id, 2: id + '@x', 9: 'In Progress', 53: 'Assessment Review', 19: 80, 20: 90, 21: 70, 22: 'PASS', 23: '2026-10-01T00:00:00Z', 29: JSON.stringify(blob)});
const plain = id => row({0: id, 1: 'Cand ' + id, 2: id + '@x', 9: 'In Progress', 53: 'New Application'});
const blob = (e, n) => JSON.parse(e.book.Applicants.rows[n][29] || '{}');
// A save as the app sends it now: the list's slim EMM (no fullResult).
const save = (e, id, emm, extra = {}) => e.saveApplicant(Object.assign({id, name: 'Cand ' + id, email: id + '@x', overallStatus: 'In Progress', candidateStage: 'Assessment Review', emm, _changed: ['phone']}, extra));
const slimEmm = {graded: true, overallPct: 80, catPct: 90, actPct: 70, pass: true, gradedAt: '2026-10-01T00:00:00Z', notes: 'HR note', highRiskFlag: true};

test('the list leaves out the grading detail and carries the flagged mark', () => {
  const e = load({applicants: [graded('A'), plain('B')]});
  const list = e.getAllResponse_().data;
  const a = list.find(x => String(x.id) === 'A');
  assert.strictEqual(a.emm.fullResult, undefined);
  assert.strictEqual(a.emm.catWrong, undefined);
  assert.strictEqual(a.emm.catWrongTruncated, undefined);
  assert.strictEqual(a.emm.highRiskFlag, true);
  assert.strictEqual(a.emm.notes, 'HR note');
  assert.strictEqual(a.emm.overallPct, 80);
  const b = list.find(x => String(x.id) === 'B');
  assert.strictEqual(b.emm.graded, false);
});

test('getEmmDetail returns one candidate\'s detail', () => {
  const e = load({applicants: [graded('A')]});
  const r = e.getEmmDetail({id: 'A'});
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.data.fullResult, DETAIL.fullResult);
  assert.strictEqual(JSON.stringify(r.data.catWrong), JSON.stringify(DETAIL.catWrong));
  assert.strictEqual(r.data.catWrongTruncated, true);
  assert.strictEqual(e.getEmmDetail({id: 'nope'}).success, false);
});

test('a save without the detail keeps the stored detail', () => {
  const e = load({applicants: [graded('A')]});
  assert.strictEqual(save(e, 'A', Object.assign({}, slimEmm, {notes: 'edited note'}), {phone: '0917'}).success, true);
  const b = blob(e, 1);
  assert.strictEqual(b.fullResult, DETAIL.fullResult);
  assert.deepStrictEqual(b.catWrong, DETAIL.catWrong);
  assert.strictEqual(b.catWrongTruncated, true);
  assert.strictEqual(b.notes, 'edited note');
});

test('a re-grade with a new detail replaces it', () => {
  const e = load({applicants: [graded('A')]});
  const fresh = JSON.stringify({flags: [], catByCat: {}});
  save(e, 'A', Object.assign({}, slimEmm, {fullResult: fresh, catWrong: []}), {_changed: ['emm']});
  const b = blob(e, 1);
  assert.strictEqual(b.fullResult, fresh);
  assert.deepStrictEqual(b.catWrong, []);
});

test('a save with no EMM at all keeps the cell as it was', () => {
  const e = load({applicants: [graded('A')]});
  save(e, 'A', null);
  assert.strictEqual(blob(e, 1).fullResult, DETAIL.fullResult);
});
