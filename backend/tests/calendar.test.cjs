const assert = require('assert');
const {load, row, test} = require('./harness.cjs');

function withApplicant(opts = {}) {
  return load({...opts, applicants: [row({
    0: 'A1', 1: 'Jane Doe', 2: 'jane@example.com', 4: 'AR Specialist', 47: '0917',
    44: JSON.stringify([{id: 's1', label: 'Mon 2pm', startIso: ''}, {id: 's2', label: 'Tue 3pm', startIso: ''}]),
  })]});
}
const cells = e => e.book.Applicants.rows[1];
const confirmS1 = e => e.confirmInterview({id: 'A1', slotId: 's1', contact: '0917', startIso: '2026-10-05T06:30:00.000Z', durationMin: '60'});

test('calendar: confirm creates event on David\'s calendar with Meet, no guests', () => {
  const e = withApplicant();
  const res = confirmS1(e);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.meetLink, 'https://meet.google.com/abc-defg-hij');
  const ins = e.log.calInsert[0];
  assert.strictEqual(ins.cal, 'operations@ab-businesssupport.com');
  assert.strictEqual(ins.opts.conferenceDataVersion, 1);
  assert.ok(!ins.res.attendees);
  assert.strictEqual(ins.res.end.dateTime, '2026-10-05T07:30:00.000Z');
  assert.strictEqual(cells(e)[58], 'ev1');
  assert.ok(e.log.mail[0].body.includes('Google Meet link: https://meet.google.com/abc-defg-hij'));
});

test('calendar: double confirm is idempotent', () => {
  const e = withApplicant();
  confirmS1(e);
  assert.strictEqual(confirmS1(e).alreadyConfirmed, true);
  assert.strictEqual(e.log.calInsert.length, 1);
  assert.strictEqual(e.log.mail.length, 1);
});

test('calendar: undo removes event and clears confirmation, keeps slots', () => {
  const e = withApplicant();
  confirmS1(e);
  assert.strictEqual(e.unconfirmInterview({id: 'A1'}).success, true);
  assert.deepStrictEqual(e.log.calRemove.map(x => x.id), ['ev1']);
  assert.strictEqual(cells(e)[49], '');
  assert.strictEqual(cells(e)[58], '');
  assert.strictEqual(JSON.parse(cells(e)[44]).length, 2);
});

test('calendar: removing the confirmed slot removes the event', () => {
  const e = withApplicant();
  confirmS1(e);
  e.removeInterviewSlot({id: 'A1', slotId: 's1'});
  assert.deepStrictEqual(JSON.parse(cells(e)[44]).map(s => s.id), ['s2']);
  assert.strictEqual(cells(e)[49], '');
  assert.strictEqual(e.log.calRemove.length, 1);
});

test('calendar: removing another slot leaves the confirmation', () => {
  const e = withApplicant();
  confirmS1(e);
  e.removeInterviewSlot({id: 'A1', slotId: 's2'});
  assert.strictEqual(e.log.calRemove.length, 0);
  assert.strictEqual(JSON.parse(cells(e)[49]).id, 's1');
});

test('calendar: calendar failure still confirms and emails without a link', () => {
  const e = withApplicant({failCalendar: true});
  const res = confirmS1(e);
  assert.strictEqual(res.success, true);
  assert.ok(/no edit access/.test(res.calendarWarning));
  assert.strictEqual(cells(e)[58], '');
  assert.ok(!e.log.mail[0].body.includes('Meet'));
});

test('calendar: no time given falls back to label, no event', () => {
  const e = withApplicant();
  e.confirmInterview({id: 'A1', slotId: 's1'});
  assert.strictEqual(e.log.calInsert.length, 0);
  assert.ok(e.log.mail[0].body.includes('Mon 2pm'));
});

test('scheduling: one save records the times, all as the candidate\'s picks, and the number', () => {
  const e = withApplicant();
  const res = e.saveInterviewSlots({id: 'A1', labels: ['Wed 10am', 'Thu 1pm'], contact: '+63 917 000 0000'});
  assert.strictEqual(res.success, true);
  const ids = JSON.parse(cells(e)[44]).map(s => s.id);
  assert.deepStrictEqual(JSON.parse(cells(e)[46]), ids);
  assert.strictEqual(cells(e)[47], '+63 917 000 0000');
  assert.ok(cells(e)[45]);
});

test('scheduling: a save without a contact (old tab) leaves the number alone', () => {
  const e = withApplicant();
  e.saveInterviewSlots({id: 'A1', labels: ['Wed 10am']});
  assert.strictEqual(cells(e)[47], '0917');
});

test('scheduling: old self-scheduling links get the contact-HR page', () => {
  const e = withApplicant();
  assert.ok(e.renderSchedulingPage('A1', 'tok').h.includes('contact HR'));
  assert.ok(e.handleSubmitAvailability({parameter: {id: 'A1'}}).h.includes('contact HR'));
  assert.strictEqual(cells(e)[47], '0917');
});
