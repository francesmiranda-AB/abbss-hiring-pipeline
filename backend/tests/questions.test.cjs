// Interview question collections: a shared tab, seeded once, soft delete, reorder.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {load, test} = require('./harness.cjs');

const SEED = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../src/domain/interviewQuestions.seed.json'), 'utf8'));
const post = (e, body) => JSON.parse(e.doPost({parameter: {}, postData: {contents: JSON.stringify(body)}}));
const list = e => post(e, {action: 'getInterviewQuestions'}).data.questions;
const tab = e => e.book['Interview Questions'];
const roleQ = over => Object.assign({set: 'role', roles: ['AP Specialist'], question: 'How do you match an invoice to a PO?', lookFor: 'Three-way match.', watchOut: 'Skips the receipt.', by: 'Wennielyn Pungasi'}, over);

test('questions: the first read creates the tab and seeds it once', () => {
  const e = load();
  assert.strictEqual(tab(e), undefined);
  const qs = list(e);
  assert.strictEqual(qs.length, 7);
  assert.strictEqual(qs.filter(q => q.set === 'role').length, 5);
  assert.strictEqual(qs.filter(q => q.set === 'behavioral').length, 2);
  assert.strictEqual(tab(e).rows.length, 8, 'header plus seven');
  list(e);
  assert.strictEqual(tab(e).rows.length, 8, 'a second read does not seed again');
});

test('questions: the seed in Code.js equals the seed file the app uses as its fallback', () => {
  const e = load();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(e.get('INTERVIEW_QUESTION_SEED_'))), SEED);
  const got = list(e).map(q => ({id: q.id, set: q.set, roles: q.roles, skill: q.skill, question: q.question, lookFor: q.lookFor, watchOut: q.watchOut, note: q.note, sort: q.sort}));
  assert.deepStrictEqual(got.sort((a, b) => a.id.localeCompare(b.id)), SEED.slice().sort((a, b) => a.id.localeCompare(b.id)));
});

test('questions: adding goes to the end of its own set', () => {
  const e = load();
  list(e);
  const r1 = post(e, {action: 'saveInterviewQuestion', data: roleQ()});
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.data.question.sort, 6, 'five role questions already');
  assert.deepStrictEqual(r1.data.question.roles, ['AP Specialist']);
  assert.strictEqual(r1.data.question.createdBy, 'Wennielyn Pungasi');
  const r2 = post(e, {action: 'saveInterviewQuestion', data: {set: 'behavioral', question: 'Tell me about a deadline you missed.', by: 'David Latimer'}});
  assert.strictEqual(r2.data.question.sort, 3);
  assert.deepStrictEqual(r2.data.question.roles, [], 'behavioral questions carry no roles');
  assert.strictEqual(list(e).length, 9);
});

test('questions: editing keeps the position and who created it', () => {
  const e = load();
  list(e);
  const made = post(e, {action: 'saveInterviewQuestion', data: roleQ()}).data.question;
  const edited = post(e, {action: 'saveInterviewQuestion', data: roleQ({id: made.id, question: 'Reworded', roles: ['AP Specialist', 'AR Specialist'], by: 'David Latimer'})}).data.question;
  assert.strictEqual(edited.id, made.id);
  assert.strictEqual(edited.question, 'Reworded');
  assert.strictEqual(edited.sort, made.sort);
  assert.strictEqual(edited.createdBy, 'Wennielyn Pungasi');
  assert.strictEqual(edited.updatedBy, 'David Latimer');
  assert.deepStrictEqual(edited.roles, ['AP Specialist', 'AR Specialist']);
  assert.strictEqual(list(e).length, 8, 'edited in place, not duplicated');
});

test('questions: bad input is refused with a reason', () => {
  const e = load();
  const bad = data => post(e, {action: 'saveInterviewQuestion', data});
  assert.match(bad(roleQ({question: '   '})).error, /Write the question/);
  assert.match(bad(roleQ({set: 'other'})).error, /role.*behavioral/);
  assert.match(bad(roleQ({roles: []})).error, /at least one hiring role/);
  assert.match(bad(roleQ({roles: 'AR Specialist'})).error, /at least one hiring role/);
  assert.match(bad(roleQ({question: 'x'.repeat(1001)})).error, /too long/);
  assert.match(bad(roleQ({lookFor: 'x'.repeat(2001)})).error, /Too long/);
  assert.match(bad(roleQ({roles: Array.from({length: 11}, (_, i) => 'R' + i)})).error, /Too many/);
  assert.match(bad(roleQ({id: 'q_missing'})).error, /no longer exists/);
  assert.strictEqual(list(e).length, 7, 'nothing was added');
});

test('questions: delete hides, restore brings it back, and the seed is not refilled', () => {
  const e = load();
  const first = list(e)[0];
  assert.strictEqual(post(e, {action: 'deleteInterviewQuestion', data: {id: first.id, by: 'X'}}).success, true);
  assert.strictEqual(list(e).some(q => q.id === first.id), false);
  list(e);
  assert.strictEqual(tab(e).rows.length, 8, 'still one row per question, nothing reseeded');
  assert.strictEqual(post(e, {action: 'deleteInterviewQuestion', data: {id: first.id, deleted: false}}).success, true);
  assert.strictEqual(list(e).some(q => q.id === first.id), true);
  assert.match(post(e, {action: 'deleteInterviewQuestion', data: {id: 'nope'}}).error, /no longer exists/);
});

test('questions: deleting every question leaves an empty collection, not a new seed', () => {
  const e = load();
  list(e).forEach(q => post(e, {action: 'deleteInterviewQuestion', data: {id: q.id}}));
  assert.strictEqual(list(e).length, 0);
  assert.strictEqual(tab(e).rows.length, 8);
});

test('questions: reorder rewrites the order of one set', () => {
  const e = load();
  const roleIds = list(e).filter(q => q.set === 'role').map(q => q.id);
  const reversed = roleIds.slice().reverse();
  assert.strictEqual(post(e, {action: 'reorderInterviewQuestions', data: {ids: reversed, by: 'X'}}).success, true);
  assert.deepStrictEqual(list(e).filter(q => q.set === 'role').map(q => q.id), reversed);
  const beh = list(e).find(q => q.set === 'behavioral').id;
  assert.match(post(e, {action: 'reorderInterviewQuestions', data: {ids: [roleIds[0], beh]}}).error, /one set at a time/);
  assert.match(post(e, {action: 'reorderInterviewQuestions', data: {ids: [roleIds[0], roleIds[0]]}}).error, /twice/);
  assert.match(post(e, {action: 'reorderInterviewQuestions', data: {ids: ['q_gone']}}).error, /no longer exists/);
  assert.match(post(e, {action: 'reorderInterviewQuestions', data: {ids: []}}).error, /Nothing/);
});

test('questions: a busy sheet is reported, not half-written', () => {
  const e = load();
  list(e);
  e.LockService = {getScriptLock: () => ({tryLock: () => false, releaseLock: () => {}})};
  const r = post(e, {action: 'saveInterviewQuestion', data: roleQ()});
  assert.strictEqual(r.success, false);
  assert.match(r.error, /busy/);
  assert.strictEqual(tab(e).rows.length, 8);
});
