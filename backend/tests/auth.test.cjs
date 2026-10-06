// Staff sign-in: off / log / enforce, the allowlist, public candidate links,
// and the Drive file restriction.
const assert = require('assert');
const {load, row, test} = require('./harness.cjs');

const CLIENT = 'client-123.apps.googleusercontent.com';
const future = () => String(Math.floor(Date.now() / 1000) + 1800);
const GOOD = 'tok-good-xxxxxxxxxxxxxxxxxxxxxxxxx';
const OUTSIDER = 'tok-outsider-xxxxxxxxxxxxxxxxxxxx';
const OTHER_APP = 'tok-otherapp-xxxxxxxxxxxxxxxxxxxx';
const tokeninfo = {
  [GOOD]: {aud: CLIENT, email: 'Staff@AB-BusinessSupport.com', email_verified: 'true', exp: future(), name: 'Staff Person'},
  [OUTSIDER]: {aud: CLIENT, email: 'someone@gmail.com', email_verified: 'true', exp: future()},
  [OTHER_APP]: {aud: 'another-client', email: 'staff@ab-businesssupport.com', email_verified: 'true', exp: future()},
};
const roles = JSON.stringify({'staff@ab-businesssupport.com': {name: 'Staff Person', role: 'HR'}});
const env = (mode, extra = {}) => load({props: {AUTH_MODE: mode, STAFF_ROLES: roles, OAUTH_CLIENT_ID: CLIENT, ...extra}, tokeninfo,
  applicants: [row({0: 'A1', 1: 'Jane Doe', 2: 'jane@example.com', 31: 'https://drive.google.com/file/d/CVFILEID0123456789abcdefghijk/view', 32: 'CVFILEID0123456789abcdefghijk'})]});
const post = (e, body) => JSON.parse(e.doPost({parameter: {}, postData: {contents: JSON.stringify(body)}}));
const get = (e, params) => e.doGet({parameter: params});

test('auth: enforce rejects a staff action with no token', () => {
  const r = post(env('enforce'), {action: 'getAll'});
  assert.strictEqual(r.authError, true);
  assert.ok(!r.data);
});

test('auth: enforce accepts a listed staff member (email case ignored)', () => {
  const e = env('enforce');
  const r = post(e, {action: 'getAll', idToken: GOOD});
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.data.length, 1);
  const me = post(e, {action: 'whoami', idToken: GOOD});
  assert.deepStrictEqual([me.email, me.name, me.role], ['staff@ab-businesssupport.com', 'Staff Person', 'HR']);
});

test('auth: enforce rejects someone not on the list, and a token for another app', () => {
  const e = env('enforce');
  assert.strictEqual(post(e, {action: 'getAll', idToken: OUTSIDER}).authError, true);
  assert.strictEqual(post(e, {action: 'getAll', idToken: OTHER_APP}).authError, true);
});

test('auth: a verified token is cached (one Google lookup per token)', () => {
  const e = env('enforce');
  post(e, {action: 'getAll', idToken: GOOD});
  post(e, {action: 'whoami', idToken: GOOD});
  assert.strictEqual(e.log.tokenFetches, 1);
});

test('auth: log mode allows but records the failure', () => {
  const e = env('log');
  assert.strictEqual(post(e, {action: 'getAll'}).success, true);
  const logRows = e.book['Auth Log'].rows;
  assert.strictEqual(logRows[0][1], 'Action');
  assert.strictEqual(logRows[1][1], 'getAll');
});

test('auth: off mode keeps the old app working (GET reads, no token)', () => {
  const e = env('off');
  assert.strictEqual(JSON.parse(get(e, {action: 'getAll'})).success, true);
  assert.strictEqual(post(e, {action: 'getAll'}).success, true);
});

test('auth: once on, staff GET reads are refused', () => {
  assert.strictEqual(JSON.parse(get(env('log'), {action: 'getAll'})).authError, true);
});

test('auth: candidate links stay public in enforce mode', () => {
  const e = env('enforce');
  assert.ok(get(e, {action: 'pickSlot', id: 'A1', token: 'x'}).h.includes('contact HR'));
  assert.ok(e.handleSubmitAvailability({parameter: {id: 'A1'}}).h.includes('contact HR'));
});

test('auth: fetchDriveFile only opens files the app knows about', () => {
  const e = env('enforce');
  const unknown = post(e, {action: 'fetchDriveFile', idToken: GOOD, data: {fileId: 'RANDOMFILE0123456789abcdefghijk'}});
  assert.strictEqual(unknown.success, false);
  assert.ok(/not a CV or assessment/.test(unknown.error));
  assert.strictEqual(e.isKnownDriveFile_('CVFILEID0123456789abcdefghijk'), true);
});

test('auth: getAll carries feature flags', () => {
  const r = post(env('enforce', {FEATURE_FLAGS: '{"offboarding":false}'}), {action: 'getAll', idToken: GOOD});
  assert.deepStrictEqual(r.config.features, {offboarding: false});
});
