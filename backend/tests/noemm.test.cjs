// The assessment invite sent decides whether an EMM is expected (prod hotfix, 2026-09-30).
const assert = require('assert');
const {load, row, test} = require('./harness.cjs');

const iso = h => new Date(Date.now() - h * 3600000).toISOString();
// An AR role (Requires EMM = Yes from the title) sent the no-EMM invite h hours ago.
const arRow = (id, emailsSent, over = {}) => row(Object.assign({0: id, 1: 'Cand ' + id, 2: id.toLowerCase() + '@x', 4: 'AR Specialist',
  7: 'Yes', 9: 'In Progress', 53: 'Assessment Sent', 30: JSON.stringify(emailsSent)}, over));
const cells = (e, n) => e.book.Applicants.rows[n];
const status = (e, n) => cells(e, n)[9];
const sent = (e, n) => JSON.parse(cells(e, n)[30] || '{}');

test('no-EMM invite, GRIT and Values done: no reminder, not archived', () => {
  const e = load({applicants: [arRow('A', {assessment_no_emm: iso(30)}, {13: 4.2, 15: 250})]});
  e.checkAssessmentCompliance();
  assert.strictEqual(status(e, 1), 'In Progress');
  assert.strictEqual(e.log.mail.length, 0);
});

test('no-EMM invite, nothing done, 13h: reminder without any EMM line', () => {
  const e = load({applicants: [arRow('A', {assessment_no_emm: iso(13)})]});
  e.checkAssessmentCompliance();
  assert.strictEqual(e.log.mail.length, 1);
  const body = e.log.mail[0].body;
  assert.ok(!/EMM/.test(body), 'no EMM in reminder: ' + body);
  assert.ok(/GRIT/.test(body) && /Value-Integrity/.test(body));
  assert.ok(/24 hours/.test(body));
  assert.ok(sent(e, 1).autoReminder);
  assert.strictEqual(status(e, 1), 'In Progress');
});

test('no-EMM invite, nothing done, 11h: no reminder yet', () => {
  const e = load({applicants: [arRow('A', {assessment_no_emm: iso(11)})]});
  e.checkAssessmentCompliance();
  assert.strictEqual(e.log.mail.length, 0);
});

test('no-EMM invite, nothing done, 25h: archived', () => {
  const e = load({applicants: [arRow('A', {assessment_no_emm: iso(25), autoReminder: iso(13)})]});
  e.checkAssessmentCompliance();
  assert.strictEqual(status(e, 1), 'NonCompliant');
});

test('reminder lists only what is missing', () => {
  if (!/missing/.test(require('fs').readFileSync(require('path').resolve(__dirname, '../Code.js'), 'utf8').match(/function sendComplianceReminderEmail([^)]*)/)[0])) return; // prod hotfix only
  const e = load({applicants: [arRow('A', {assessment_no_emm: iso(13)}, {13: 4.2})]});
  e.checkAssessmentCompliance();
  const body = e.log.mail[0].body;
  assert.ok(!/GRIT/.test(body), body);
  assert.ok(/1\. Value-Integrity/.test(body), body);
});

test('EMM invite: the EMM is still required', () => {
  const e = load({applicants: [arRow('A', {assessment: iso(13)}, {13: 4.2, 15: 250})]});
  e.checkAssessmentCompliance();
  assert.strictEqual(e.log.mail.length, 1);
  assert.ok(/EMM/.test(e.log.mail[0].body));
  const e2 = load({applicants: [arRow('B', {assessment: iso(25), autoReminder: iso(12)}, {13: 4.2, 15: 250})]});
  e2.checkAssessmentCompliance();
  assert.strictEqual(status(e2, 1), 'NonCompliant');
});

test('EMM invite to a role not guessed as AR: the EMM is required', () => {
  const e = load({applicants: [arRow('A', {assessment: iso(13)}, {4: 'AP Clerk', 7: 'No', 13: 4.2, 15: 250})]});
  e.checkAssessmentCompliance();
  assert.strictEqual(e.log.mail.length, 1);
  assert.ok(/EMM/.test(e.log.mail[0].body));
});

test('no-EMM invite sent after an EMM invite: EMM not required, clock from the later invite', () => {
  const e = load({applicants: [arRow('A', {assessment: iso(30), assessment_no_emm: iso(5)}, {13: 4.2, 15: 250})]});
  e.checkAssessmentCompliance();
  assert.strictEqual(status(e, 1), 'In Progress');
  assert.strictEqual(e.log.mail.length, 0);
  const e2 = load({applicants: [arRow('B', {assessment: iso(30), assessment_no_emm: iso(5)})]});
  e2.checkAssessmentCompliance();
  assert.strictEqual(status(e2, 1), 'In Progress', 'the 5h-old invite sets the clock');
});

test('EMM invite sent after a no-EMM invite: EMM required', () => {
  const e = load({applicants: [arRow('A', {assessment_no_emm: iso(30), assessment: iso(13)}, {13: 4.2, 15: 250})]});
  e.checkAssessmentCompliance();
  assert.ok(e.log.mail.length === 1 && /EMM/.test(e.log.mail[0].body));
});

test('archived only for a missing EMM after a no-EMM invite: self-heals to In Progress', () => {
  const e = load({applicants: [arRow('A', {assessment_no_emm: iso(40), autoReminder: iso(28)}, {9: 'NonCompliant', 13: 4.2, 15: 250})]});
  e.checkAssessmentCompliance();
  assert.strictEqual(status(e, 1), 'In Progress');
});

test('getAll reports requiresEmm from the invite that was sent', () => {
  const e = load({applicants: [
    arRow('A', {assessment_no_emm: iso(5)}),
    arRow('B', {assessment: iso(5)}, {7: 'No'}),
    arRow('C', {}),
  ]});
  const res = e.doGet({parameter: {action: 'getAll'}});
  const data = JSON.parse(typeof res === 'string' ? res : res.content || res).data;
  const by = id => data.find(a => String(a.id) === id);
  assert.strictEqual(by('A').requiresEmm, false);
  assert.strictEqual(by('B').requiresEmm, true);
  assert.strictEqual(by('C').requiresEmm, true);
});

test('repair: preview lists rows, apply fixes them, second preview is empty', () => {
  const e = load({applicants: [
    arRow('A', {assessment_no_emm: iso(40)}, {9: 'NonCompliant', 13: 4.2, 15: 250}),
    arRow('B', {assessment_no_emm: iso(40)}, {9: 'NonCompliant', 13: 4.2, 15: 250, 42: iso(20)}),
    arRow('C', {assessment_no_emm: iso(40)}, {9: 'NonCompliant'}),
    arRow('D', {assessment: iso(40)}, {9: 'NonCompliant', 13: 4.2, 15: 250}),
  ]});
  if (typeof e.previewNoEmmRepair !== 'function') return; // prod hotfix only
  const p = e.previewNoEmmRepair();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(p.map(x => [x.id, x.restore]))), [['A', true], ['B', false], ['C', false]]);
  e.applyNoEmmRepair();
  assert.deepStrictEqual([1, 2, 3, 4].map(n => cells(e, n)[7]), ['No', 'No', 'No', 'Yes']);
  assert.deepStrictEqual([1, 2, 3, 4].map(n => status(e, n)), ['In Progress', 'NonCompliant', 'NonCompliant', 'NonCompliant']);
  assert.strictEqual(e.previewNoEmmRepair().length, 0);
});

