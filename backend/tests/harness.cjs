// Runs the legacy Apps Script backend (frontend-github-pull/backend/Code.js)
// inside a Node vm with in-memory fakes for the Google services it uses.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CODE_PATH = path.resolve(__dirname, '../Code.js');
const NCOLS = 59;

function makeSheet(rows) {
  const sheet = {
    rows,
    getDataRange: () => ({getValues: () => rows.map(r => r.slice())}),
    getRange: (row, col, nRows, nCols) => ({
      setValue: v => { ensure(row); rows[row - 1][col - 1] = v; },
      setValues: vals => { vals.forEach((vr, i) => { ensure(row + i); vr.forEach((v, j) => { rows[row - 1 + i][col - 1 + j] = v; }); }); },
      getValues: () => rows.slice(row - 1, row - 1 + (nRows || 1)).map(r => r.slice(col - 1, col - 1 + (nCols || 1))),
      setFontWeight: () => ({setBackground: () => ({setFontColor: () => {}})}),
    }),
    appendRow: r => { rows.push(r.slice()); },
    copyTo: () => ({setName: () => {}}),
    getLastRow: () => rows.length,
    getLastColumn: () => NCOLS,
    setFrozenRows: () => {},
  };
  function ensure(row) { while (rows.length < row) rows.push(new Array(NCOLS).fill('')); }
  return sheet;
}

// Build an Applicants row from a partial {index: value} map.
function row(values) {
  const r = new Array(NCOLS).fill('');
  Object.keys(values).forEach(k => { r[Number(k)] = values[k]; });
  return r;
}

const PROD_SCRIPT_ID = '1kt0pyJYL0Vu_4o46hYYY5GO91kWrtpDQxi4z0dvXyVfQsJdiJQk83sTm';
// forms: {grit:[rows], values:[rows], emm:[rows]} -- response sheets (row 0 is the header).
function load({props = {}, applicants = [], sheets = {}, failCalendar = false, scriptId = PROD_SCRIPT_ID, forms = {}, tokeninfo = {}} = {}) {
  const log = {mail: [], calInsert: [], calRemove: [], logger: [], tokenFetches: 0};
  const cacheStore = {};
  const book = {Applicants: makeSheet([new Array(NCOLS).fill('header'), ...applicants])};
  Object.keys(sheets).forEach(name => { book[name] = makeSheet(sheets[name]); });
  const ss = {
    getSheetByName: name => book[name] || null,
    insertSheet: name => (book[name] = makeSheet([])),
    getSheets: () => Object.values(book),
  };
  // Any other spreadsheet (GRIT/Values/EMM form responses) is an empty sheet.
  const formSS = rows => { const sh = makeSheet([new Array(NCOLS).fill('header'), ...(rows || [])]); return {getSheetByName: () => sh, getSheets: () => [sh]}; };
  const FORM_IDS = {'1sU7HPe9Nn69RdHyuCrpisCKdGTDHNO3c0furVEqgfFk': formSS(forms.grit), '16jRYZIFG_5O2Dh-7Wvj4MKVfsDV9FsOIXKPJiTFYCbc': formSS(forms.values), '1ZTh5NtZtxvcFfx1kmiW40s4jRyAZdz9T3sNhoZB3SEI': formSS(forms.emm)};
  const otherSS = formSS([]);
  const masterId = props.MASTER_SHEET_ID || (scriptId === PROD_SCRIPT_ID ? '1URrEVs7iOdgbFa_Z29eQwrgBeCwfTFZSKQLqjV5wkP0' : '__none__');
  const env = {
    console, log, book,
    PropertiesService: {getScriptProperties: () => ({getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; }})},
    SpreadsheetApp: {openById: id => (id === masterId ? ss : (FORM_IDS[id] || otherSS))},
    MailApp: {sendEmail: (to, subject, body, options) => log.mail.push({to, subject, body, options})},
    Calendar: {Events: {
      insert: (res, cal, opts) => { if (failCalendar) throw new Error('no edit access'); log.calInsert.push({res, cal, opts}); return {id: 'ev' + log.calInsert.length, hangoutLink: 'https://meet.google.com/abc-defg-hij'}; },
      get: () => ({}),
      remove: (cal, id, opts) => { log.calRemove.push({cal, id, opts}); },
    }, CalendarList: {get: () => ({accessRole: 'writer'}), list: () => ({items: []})}, Calendars: {get: () => ({summary: 'x'})}},
    CalendarApp: {getCalendarById: () => ({getEvents: () => []})},
    Utilities: {getUuid: () => 'uuid', formatDate: d => 'FMT(' + d.toISOString() + ')', base64Decode: () => [], newBlob: () => ({}),
      DigestAlgorithm: {SHA_256: 'sha256'}, computeDigest: (_alg, text) => Array.from(require('crypto').createHash('sha256').update(String(text)).digest()).map(b => (b > 127 ? b - 256 : b))},
    CacheService: {getScriptCache: () => ({get: k => (k in cacheStore ? cacheStore[k] : null), put: (k, v) => { cacheStore[k] = v; }})},
    // tokeninfo: {idToken: responseObject}; unknown tokens get HTTP 400.
    UrlFetchApp: {fetch: url => { log.tokenFetches++; const t = decodeURIComponent(String(url).split('id_token=')[1] || ''); const info = tokeninfo[t]; return {getResponseCode: () => (info ? 200 : 400), getContentText: () => JSON.stringify(info || {error: 'invalid_token'})}; }},
    Session: {getScriptTimeZone: () => 'Asia/Singapore', getActiveUser: () => ({getEmail: () => 'me@x'}), getEffectiveUser: () => ({getEmail: () => 'me@x'})},
    Logger: {log: m => log.logger.push(m)},
    LockService: {getScriptLock: () => ({waitLock: () => {}, tryLock: () => true, releaseLock: () => {}})},
    ContentService: {createTextOutput: t => ({setMimeType: () => t}), MimeType: {JSON: 'json'}},
    HtmlService: {createHtmlOutput: h => ({setTitle: () => h, h})},
    DriveApp: {getFoldersByName: () => ({hasNext: () => false}), createFolder: n => ({name: n})},
    ScriptApp: {getScriptId: () => scriptId, getProjectTriggers: () => [], newTrigger: () => ({timeBased: () => ({everyMinutes: () => ({create: () => {}})})})},
  };
  vm.createContext(env);
  vm.runInContext(fs.readFileSync(CODE_PATH, 'utf8'), env, {filename: 'Code.js'});
  // Top-level const/let aren't context properties; read them through here.
  env.get = expr => vm.runInContext(expr, env);
  return env;
}

// Minimal test runner: node tools/legacy-tests/run.js
const tests = [];
function test(name, fn) { tests.push({name, fn}); }
async function run() {
  let failed = 0;
  for (const t of tests) {
    try { await t.fn(); console.log('ok   ' + t.name); }
    catch (e) { failed++; console.log('FAIL ' + t.name + '\n     ' + (e && e.stack || e).split('\n').slice(0, 3).join('\n     ')); }
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exitCode = failed ? 1 : 0;
}

module.exports = {load, row, test, run, NCOLS};
