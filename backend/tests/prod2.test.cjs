// Production 2 (2026-10-08): the fresh copy of the project counts as production (AB-32).
const assert = require('assert');
const {load, test, PROD_SCRIPT_ID, PROD2_SCRIPT_ID} = require('./harness.cjs');

const PROD_SHEET = '1URrEVs7iOdgbFa_Z29eQwrgBeCwfTFZSKQLqjV5wkP0';

test('prod2: uses the production Sheet and calendar, and sends to real recipients', () => {
  const e = load({scriptId: PROD2_SCRIPT_ID});
  assert.strictEqual(e.get('IS_STAGING'), false);
  assert.strictEqual(e.get('MASTER_SHEET_ID'), PROD_SHEET);
  assert.strictEqual(e.get('DAVID_CALENDAR_ID'), 'operations@ab-businesssupport.com');
  e.sendMail_('cand@example.com', 'Hi', 'body', {});
  assert.deepStrictEqual(e.log.mail.map(m => m.to), ['cand@example.com']);
});

test('prod2: candidate links point at its own address; the original keeps its own', () => {
  const p2 = load({scriptId: PROD2_SCRIPT_ID});
  const p1 = load({scriptId: PROD_SCRIPT_ID});
  const url2 = p2.get('PUBLIC_WEBAPP_URL'), url1 = p1.get('PUBLIC_WEBAPP_URL');
  assert.ok(/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url2));
  assert.notStrictEqual(url2, url1);
  assert.strictEqual(url1, p1.get('PROD_WEBAPP_URL'));
});

test('prod2: any other project is still staging', () => {
  const e = load({scriptId: 'some-copy', props: {MASTER_SHEET_ID: 'x'}});
  assert.strictEqual(e.get('IS_STAGING'), true);
  assert.throws(() => e.sendMail_('cand@example.com', 'Hi', 'b'), /MAIL_REDIRECT/);
});
