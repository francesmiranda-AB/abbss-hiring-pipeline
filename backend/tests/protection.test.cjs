// L1b: the compliance job and saveApplicant must not undo each other or touch closed rows.
const assert = require('assert');
const {load, row, test} = require('./harness.cjs');

const hoursAgo = h => new Date(Date.now() - h * 3600000).toISOString();
// An applicant who was sent the assessment invite `h` hours ago and has no scores yet.
function invited(id, h, over = {}) {
  return row(Object.assign({0: id, 1: 'Cand ' + id, 2: id + '@example.com', 4: 'AR', 7: 'No', 9: 'In Progress',
    30: JSON.stringify({assessment: hoursAgo(h)}), 53: 'Assessment Sent'}, over));
}
const cellsOf = (e, n) => e.book.Applicants.rows[n];

test('compliance: Deleted row is never emailed or flipped', () => {
  const e = load({applicants: [invited('D1', 30, {9: 'Deleted'}), invited('D2', 13, {9: 'Deleted'})]});
  e.checkAssessmentCompliance();
  assert.strictEqual(cellsOf(e, 1)[9], 'Deleted');
  assert.strictEqual(cellsOf(e, 2)[9], 'Deleted');
  assert.strictEqual(e.log.mail.length, 0);
});

test('compliance: Departed row is never emailed or flipped', () => {
  const e = load({applicants: [invited('P1', 30, {9: 'Departed'})]});
  e.checkAssessmentCompliance();
  assert.strictEqual(cellsOf(e, 1)[9], 'Departed');
  assert.strictEqual(e.log.mail.length, 0);
});

test('compliance: closed by stage (still "In Progress") is left alone', () => {
  const e = load({applicants: [invited('C1', 30, {53: 'Closed - Rejected'}), invited('C2', 13, {53: 'Hired'})]});
  e.checkAssessmentCompliance();
  assert.strictEqual(cellsOf(e, 1)[9], 'In Progress');
  assert.strictEqual(cellsOf(e, 2)[9], 'In Progress');
  assert.strictEqual(e.log.mail.length, 0);
});

test('compliance: candidate past the assessment stage is not archived', () => {
  const e = load({applicants: [invited('I1', 30, {53: 'Initial Interview'})]});
  e.checkAssessmentCompliance();
  assert.strictEqual(cellsOf(e, 1)[9], 'In Progress');
});

test('compliance: waiting candidate past the deadline is archived', () => {
  const e = load({applicants: [invited('A1', 30), invited('A2', 30, {53: 'Waiting for Assessment'}), invited('A3', 30, {53: ''})]});
  e.checkAssessmentCompliance();
  assert.deepStrictEqual([1, 2, 3].map(n => cellsOf(e, n)[9]), ['NonCompliant', 'NonCompliant', 'NonCompliant']);
});

test('compliance: reminder sent once, stamp kept', () => {
  const e = load({applicants: [invited('R1', 13)]});
  e.checkAssessmentCompliance();
  e.checkAssessmentCompliance();
  assert.strictEqual(e.log.mail.length, 1);
  assert.ok(JSON.parse(cellsOf(e, 1)[30]).autoReminder);
  assert.ok(JSON.parse(cellsOf(e, 1)[30]).assessment, 'other emailsSent keys survive');
});

// A save from a copy of the record that is older than the sheet.
function staleSave(e, over = {}) {
  return e.saveApplicant(Object.assign({id: 'S1', name: 'Cand S1', email: 's1@example.com', overallStatus: 'In Progress',
    emailsSent: {assessment: hoursAgo(13)}, grit: {score: ''}, values: {score: ''}}, over));
}

test('save: stale copy keeps the job\'s autoReminder stamp', () => {
  const e = load({applicants: [invited('S1', 13, {30: JSON.stringify({assessment: hoursAgo(13), autoReminder: hoursAgo(1)})})]});
  staleSave(e);
  const sent = JSON.parse(cellsOf(e, 1)[30]);
  assert.ok(sent.autoReminder, 'autoReminder kept');
  assert.ok(sent.assessment);
});

test('save: undoing "mark as sent" still removes the key', () => {
  const e = load({applicants: [invited('S1', 13)]});
  staleSave(e, {emailsSent: {}});
  assert.strictEqual(cellsOf(e, 1)[30], '');
});

test('save: client that did not change status keeps the job\'s NonCompliant', () => {
  const e = load({applicants: [invited('S1', 30, {9: 'NonCompliant'})]});
  staleSave(e, {_changed: ['resumeNotes']});
  assert.strictEqual(cellsOf(e, 1)[9], 'NonCompliant');
});

test('save: client that changed status wins', () => {
  const e = load({applicants: [invited('S1', 30, {9: 'NonCompliant'})]});
  staleSave(e, {_changed: ['overallStatus'], overallStatus: 'Hold'});
  assert.strictEqual(cellsOf(e, 1)[9], 'Hold');
});

test('save: stale copy without scores keeps attached scores and labels', () => {
  const e = load({applicants: [invited('S1', 13, {13: 4.2, 15: 250, 16: 8, 17: 9})]});
  staleSave(e);
  const r = cellsOf(e, 1);
  assert.strictEqual(r[13], 4.2);
  assert.strictEqual(r[15], 250);
  assert.ok(r[14], 'GRIT label recomputed');
  assert.ok(r[18], 'Values label recomputed');
});

test('getAll: returns shared config and version fields', () => {
  const e = load({applicants: [invited('G1', 1)]});
  const out = JSON.parse(e.doGet({parameter: {action: 'getAll'}}));
  assert.strictEqual(out.success, true);
  assert.strictEqual(out.config.deadlineHours, 24);
  assert.strictEqual(out.config.reminderHours, 12);
  assert.ok(out.config.reminderTemplate && out.config.reminderTemplate.body.includes('{deadlinehours}'));
  assert.strictEqual(typeof out.minClientVersion, 'number');
  assert.ok(out.roleHealth && typeof out.roleHealth === 'object');
});

test('save: deliberately unticking EMM received clears it', () => {
  const e = load({applicants: [invited('S1', 13, {7: 'Yes', 38: hoursAgo(2), 40: 'https://drive/x'})]});
  staleSave(e, {requiresEmm: true, emmReceivedAt: '', emmFileUrl: '', _changed: ['emmReceivedAt']});
  assert.strictEqual(cellsOf(e, 1)[38], '');
  assert.strictEqual(cellsOf(e, 1)[40], 'https://drive/x', 'untouched field kept');
});

test('save: stale copy without EMM receipt keeps it', () => {
  const e = load({applicants: [invited('S1', 13, {7: 'Yes', 38: hoursAgo(2)})]});
  staleSave(e, {requiresEmm: true, emmReceivedAt: '', _changed: ['resumeNotes']});
  assert.ok(cellsOf(e, 1)[38]);
});

test('save: old client (no _changed) still sets status as before', () => {
  const e = load({applicants: [invited('S1', 30, {9: 'NonCompliant'})]});
  staleSave(e);
  assert.strictEqual(cellsOf(e, 1)[9], 'In Progress');
});

test('reminder: one text, EMM line only when EMM is required, deadline from the constant', () => {
  const e = load({applicants: [invited('M1', 13, {7: 'No'}), invited('M2', 13, {7: 'Yes'})]});
  e.checkAssessmentCompliance();
  const [noEmm, withEmm] = e.log.mail;
  assert.ok(!/EMM/.test(noEmm.body), 'no EMM line for a candidate without EMM');
  assert.ok(/EMM Excel assessment/.test(withEmm.body));
  assert.ok(/24 hours/.test(noEmm.body));
  assert.ok(!/attached/.test(withEmm.body), 'no claim of an attachment that is not there');
  assert.ok(!/{/.test(noEmm.body), 'no unfilled placeholders');
});
