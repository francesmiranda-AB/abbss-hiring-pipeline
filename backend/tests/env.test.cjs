const assert = require('assert');
const {load, row, test} = require('./harness.cjs');

const PROD_SHEET = '1URrEVs7iOdgbFa_Z29eQwrgBeCwfTFZSKQLqjV5wkP0';
const STAGING = {MASTER_SHEET_ID: 'staging-sheet', DAVID_CALENDAR_ID: 'me@ab-businesssupport.com', MAIL_REDIRECT: 'me@ab-businesssupport.com'};

test('env: defaults to production values', () => {
  const e = load();
  assert.strictEqual(e.get('MASTER_SHEET_ID'), PROD_SHEET);
  assert.strictEqual(e.get('IS_STAGING'), false);
  assert.strictEqual(e.get('DAVID_CALENDAR_ID'), 'operations@ab-businesssupport.com');
});

test('env: production sends mail to the real recipient', () => {
  const e = load();
  e.sendMail_('cand@example.com', 'Hi', 'body', {replyTo: 'hr@x'});
  assert.deepStrictEqual(e.log.mail.map(m => [m.to, m.subject]), [['cand@example.com', 'Hi']]);
});

test('env: staging without MAIL_REDIRECT refuses to send', () => {
  const e = load({scriptId: 'staging', props: {MASTER_SHEET_ID: 'staging-sheet'}});
  assert.throws(() => e.sendMail_('cand@example.com', 'Hi', 'b'), /MAIL_REDIRECT/);
  assert.strictEqual(e.log.mail.length, 0);
});

test('env: staging redirects all mail and drops cc/bcc', () => {
  const e = load({scriptId: 'staging', props: {...STAGING}});
  e.sendMail_('cand@example.com', 'Hi', 'b', {cc: 'boss@x', bcc: 'y@x'});
  const m = e.log.mail[0];
  assert.strictEqual(m.to, 'me@ab-businesssupport.com');
  assert.strictEqual(m.subject, '[STAGING to cand@example.com] Hi');
  assert.ok(!m.options.cc && !m.options.bcc);
});

test("env: staging refuses to write David's real calendar", () => {
  const e = load({scriptId: 'staging', props: {MASTER_SHEET_ID: 'staging-sheet', MAIL_REDIRECT: 'me@x'}});
  assert.throws(() => e.writeDavidCalendarInvite('A', 'B', new Date(), new Date()), /real calendar/);
  assert.strictEqual(e.log.calInsert.length, 0);
});

test('env: scrub refuses to run against production', () => {
  const e = load({props: {MAIL_REDIRECT: 'me@x'}, applicants: [row({0: 'A1', 2: 'real@example.com'})]});
  assert.throws(() => e.scrubStagingData(), /production/);
  assert.strictEqual(e.book.Applicants.rows[1][2], 'real@example.com');
});

test('env: scrub replaces emails and phones on staging', () => {
  const e = load({scriptId: 'staging', props: {...STAGING}, applicants: [
    row({0: 'A1', 2: 'real1@example.com', 3: '0917', 47: '0918'}),
    row({0: 'A2', 2: 'real2@example.com', 3: '0919'}),
  ]});
  e.scrubStagingData();
  const r = e.book.Applicants.rows;
  assert.strictEqual(r[1][2], 'me+cand1@ab-businesssupport.com');
  assert.strictEqual(r[2][2], 'me+cand2@ab-businesssupport.com');
  assert.strictEqual(r[1][3], '0000000000');
  assert.strictEqual(r[1][47], '0000000000');
  assert.strictEqual(r[2][47], '');
});

test('env: staging with no properties never falls back to production', () => {
  const e = load({scriptId: 'staging'});
  assert.strictEqual(e.get('MASTER_SHEET_ID'), '');
  assert.strictEqual(e.get('DAVID_CALENDAR_ID'), '');
  assert.strictEqual(e.get('PUBLIC_WEBAPP_URL'), '');
  assert.throws(() => e.sendMail_('cand@example.com', 'Hi', 'b'), /MAIL_REDIRECT/);
});

test('env: staging pointed at the production Sheet is blanked out', () => {
  const e = load({scriptId: 'staging', props: {MASTER_SHEET_ID: PROD_SHEET, MAIL_REDIRECT: 'me@x'}});
  assert.strictEqual(e.get('MASTER_SHEET_ID'), '');
});
