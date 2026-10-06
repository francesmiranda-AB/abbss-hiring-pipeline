// The server links an uploaded CV to the candidate itself (prod hotfix, 2026-10-06).
const assert = require('assert');
const {load, row, test} = require('./harness.cjs');

const cand = (id, over = {}) => row(Object.assign({0: id, 1: 'Cand ' + id, 2: id + '@x', 9: 'In Progress', 53: 'New Application'}, over));
const cells = (e, n) => e.book.Applicants.rows[n];
const cv = (e, n) => cells(e, n).slice(31, 35);
const upload = (e, id, name = 'resume.pdf') => e.uploadCV({id, filename: name, mimeType: 'application/pdf', data: ''});
// A client save as the app sends it (whole record, CV fields as the client knows them).
const save = (e, id, extra = {}) => e.saveApplicant(Object.assign({id, name: 'Cand ' + id, email: id + '@x', overallStatus: 'In Progress', candidateStage: 'New Application'}, extra));

test('upload links the CV on the row without any client save', () => {
  const e = load({applicants: [cand('A'), cand('B')]});
  const res = upload(e, 'B');
  assert.strictEqual(res.success, true);
  assert.deepStrictEqual(cv(e, 1), ['', '', '', '']);
  const [url, fileId, name, at] = cv(e, 2);
  assert.strictEqual(url, res.url);
  assert.strictEqual(fileId, res.fileId);
  assert.strictEqual(name, 'resume.pdf');
  assert.ok(at);
  assert.deepStrictEqual(e.log.descriptions, ['Candidate B']);
});

test('a save from a copy without the CV keeps the link', () => {
  const e = load({applicants: [cand('A')]});
  const res = upload(e, 'A');
  assert.strictEqual(save(e, 'A', {candidateStage: 'Assessment Sent'}).success, true);
  assert.strictEqual(cv(e, 1)[1], res.fileId);
  assert.strictEqual(cells(e, 1)[53], 'Assessment Sent');
});

test('Replace: a new link from the client wins', () => {
  const e = load({applicants: [cand('A')]});
  upload(e, 'A');
  save(e, 'A', {cvUrl: 'https://drive/new', cvFileId: 'new', cvFileName: 'new.pdf', cvUploadedAt: '2026-10-07T00:00:00Z'});
  assert.deepStrictEqual(cv(e, 1), ['https://drive/new', 'new', 'new.pdf', '2026-10-07T00:00:00Z']);
});

test('new candidate: upload finishes before the first save lands, link still arrives', () => {
  // The row appears while the upload is waiting (second sleep).
  const e = load({applicants: [], onSleep: (env, n) => { if (n === 2) save(env, 'N'); }});
  const res = upload(e, 'N');
  assert.strictEqual(res.success, true);
  assert.strictEqual(cv(e, 1)[1], res.fileId);
});

test('new candidate: row never appears during upload, first save picks the link up', () => {
  const props = {};
  const e = load({applicants: [], props});
  const res = upload(e, 'N');
  assert.strictEqual(res.success, true);
  assert.ok(props.pendingCv_N, 'link kept for later');
  save(e, 'N');
  assert.strictEqual(cv(e, 1)[1], res.fileId);
  assert.ok(!('pendingCv_N' in props), 'pending link used once');
});

test('upload without a candidate id still works and links nothing', () => {
  const e = load({applicants: [cand('A')]});
  assert.strictEqual(upload(e, '').success, true);
  assert.deepStrictEqual(cv(e, 1), ['', '', '', '']);
});

test('relink fills only rows with no CV link', () => {
  const e = load({applicants: [
    cand(1791260480965),
    cand(1790165240722, {31: 'https://drive/existing', 32: 'existing'}),
    cand(1790081005942),
  ]});
  if (typeof e.previewCvRelink !== 'function') return; // prod hotfix only
  const p = e.previewCvRelink();
  assert.strictEqual(p.length, 2);
  e.applyCvRelink();
  assert.strictEqual(cv(e, 1)[1], '1W7fXK3BLCK29VyLBwD7dGUabCuCyiSRd');
  assert.strictEqual(cv(e, 2)[1], 'existing');
  assert.strictEqual(cv(e, 3)[1], '1nVU8vu6zng1lg5_S16U9g4ZfLb2tlCEA');
  assert.strictEqual(e.previewCvRelink().length, 0);
});

