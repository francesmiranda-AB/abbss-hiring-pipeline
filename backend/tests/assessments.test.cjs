// L7: one lookup, one attach, one "submitted" rule, labels that agree across runtimes.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {load, row, test} = require('./harness.cjs');

const iso = h => new Date(Date.now() - h * 3600000).toISOString();
const invitedRow = (id, email, over = {}) => row(Object.assign({0: id, 1: 'C ' + id, 2: email, 7: 'No', 9: 'In Progress', 53: 'Assessment Sent',
  30: JSON.stringify({[over[7] === 'Yes' ? 'assessment' : 'assessment_no_emm']: iso(10)})}, over));
// Form response rows in each form's own layout.
const gritRow = (email, h, answer = 4) => { const r = [iso(h), email, 'Name']; r[3] = ''; for (let i = 0; i < 10; i++) r[4 + i] = answer; return r; };
const valuesRow = (email, h, total, conf, int_) => { const r = new Array(17).fill(''); r[0] = iso(h); r[1] = email; r[2] = 'Name'; r[4] = total; r[14] = conf; r[16] = int_; return r; };
const emmRow = (email, h, url) => [iso(h), email, 'Name', email, url];
const cells = (e, n) => e.book.Applicants.rows[n];

test('assessments: refreshAssessments attaches results submitted after the invite', () => {
  const e = load({applicants: [invitedRow('A', 'a@x')], forms: {grit: [gritRow('a@x', 5)], values: [valuesRow('a@x', 5, 250, 8, 9)]}});
  const res = e.refreshAssessments({id: 'A'});
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.attached, 2);
  assert.ok(res.record.grit.score, 'returns the updated record');
  assert.strictEqual(res.record.values.score, 250);
  assert.ok(res.record.grit.label);
});

test('assessments: a response from before the invite is ignored', () => {
  const e = load({applicants: [invitedRow('A', 'a@x')], forms: {grit: [gritRow('a@x', 30)]}});
  e.refreshAssessments({id: 'A'});
  assert.strictEqual(cells(e, 1)[13], '');
});

test('assessments: the latest matching response wins', () => {
  const e = load({applicants: [invitedRow('A', 'a@x')], forms: {grit: [gritRow('a@x', 8, 2), gritRow('A@X ', 4, 5)]}});
  e.refreshAssessments({id: 'A'});
  // all-5 answers score 3.4 (four GRIT items are reverse-scored); the older row would give 2.8
  assert.strictEqual(cells(e, 1)[13], 3.4);
});

test('assessments: EMM file from the form is detected for candidates who need EMM', () => {
  const e = load({applicants: [invitedRow('A', 'a@x', {7: 'Yes'})], forms: {emm: [emmRow('a@x', 3, 'https://drive/f1')]}});
  const res = e.refreshAssessments({id: 'A'});
  assert.strictEqual(cells(e, 1)[40], 'https://drive/f1');
  assert.ok(cells(e, 1)[38]);
  assert.ok(res.record.emmReceivedAt);
});

test('assessments: unmatched EMM submissions use the same row parsing', () => {
  const e = load({applicants: [invitedRow('A', 'a@x')], forms: {emm: [emmRow('stranger@x', 3, 'https://drive/f2'), emmRow('a@x', 3, 'https://drive/f3'), [iso(2), 'nofile@x', 'N', 'nofile@x', '']]}});
  const res = e.getUnmatchedEmmSubmissions();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(res.unmatched.map(u => u.fileUrl))), ['https://drive/f2']);
});

test('assessments: job does not archive a candidate whose results just arrived', () => {
  const e = load({applicants: [invitedRow('A', 'a@x', {30: JSON.stringify({assessment_no_emm: iso(30)})})], forms: {grit: [gritRow('a@x', 10)], values: [valuesRow('a@x', 10, 250, 8, 9)]}});
  e.checkAssessmentCompliance();
  assert.strictEqual(cells(e, 1)[9], 'In Progress');
  assert.ok(cells(e, 1)[13] !== '');
});

test('assessments: a 0% EMM grade still reloads as graded', () => {
  const e = load({applicants: [invitedRow('A', 'a@x', {19: 0, 22: 'FAIL', 23: iso(1)})]});
  const out = JSON.parse(e.doGet({parameter: {action: 'getAll'}})).data[0];
  assert.strictEqual(out.emm.graded, true);
  assert.strictEqual(out.emm.overallPct, 0);
});

// The app's copies of these rules are checked against this backend in
// src/domain/agreement.test.ts (vitest).
