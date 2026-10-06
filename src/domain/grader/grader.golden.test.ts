// @vitest-environment node
// Golden test: the moved grader must score exactly like the old app. Runs the
// old app's grader source (from legacy/index.html) and the new module on the
// same generated workbooks (no candidate data) and compares the results.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import * as XLSX from 'xlsx';
import { ANSWER_KEY, ANS_SUMMARY, CAT_ORDER, gradeData, parseApplicant } from './engine';
import { CAT_ORDER as LIGHT_CAT_ORDER } from './categories';

const root = resolve(__dirname, '../../..');
const template = readFileSync(resolve(root, 'public/files/MS_AR_EMM_Assessment_blank.xlsx'));

function legacyGrader() {
  const lines = readFileSync(resolve(root, 'legacy/index.html'), 'utf8').split(/\r?\n/);
  const fn = (name: string) => {
    const s = lines.findIndex((l) => l.startsWith(`function ${name}(`));
    let e = s + 1;
    while (!/^\}\s*$/.test(lines[e])) e++;
    return lines.slice(s, e + 1).join('\n');
  };
  const src = ['inspectAllSheets', 'computeRemarksFromBaseData', 'parseApplicant', 'normalizeRemark', 'gradeData'].map(fn).join('\n');
  const ctx = vm.createContext({ XLSX, ANSWER_KEY, ANS_SUMMARY, CAT_ORDER, TOTAL_ROWS: 1869, PASS_EMM: 75, Set, Math, Object, String, JSON });
  vm.runInContext(`${src}\nthis.parseApplicant=parseApplicant;this.gradeData=gradeData;`, ctx);
  return ctx as unknown as { parseApplicant: typeof parseApplicant; gradeData: typeof gradeData };
}

type Grid = unknown[][];
function workbook(fill: (matching: Grid, instructions: Grid) => void): Uint8Array {
  const wb = XLSX.read(template);
  const m = XLSX.utils.sheet_to_json(wb.Sheets.Matching, { header: 1, defval: null }) as Grid;
  const ins = XLSX.utils.sheet_to_json(wb.Sheets.Instructions, { header: 1, defval: null }) as Grid;
  fill(m, ins);
  wb.Sheets.Matching = XLSX.utils.aoa_to_sheet(m);
  wb.Sheets.Instructions = XLSX.utils.aoa_to_sheet(ins);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

// Answers every row from the answer key; `spoil(i)` can damage row i.
function answered(spoil: (i: number, row: unknown[]) => void = () => {}) {
  return workbook((m, ins) => {
    const header = m.findIndex((r) => (r || []).some((c) => String(c ?? '').includes('Entry No')));
    const cats: Record<string, { sum: number; count: number }> = {};
    let n = 0;
    for (let i = header + 1; i < m.length; i++) {
      const r = m[i];
      if (!r) continue;
      const ans = ANSWER_KEY[String(r[8] ?? '').trim()];
      if (!ans) continue;
      r[10] = ans.sumif; r[11] = ans.inv; r[12] = ans.pay; r[13] = ans.cm; r[14] = ans.ref; r[15] = ans.remarks;
      cats[ans.remarks] = cats[ans.remarks] || { sum: 0, count: 0 };
      cats[ans.remarks].sum += Number(r[6]) || 0;
      cats[ans.remarks].count++;
      spoil(n++, r);
    }
    let total = 0;
    let count = 0;
    for (const r of ins) {
      const label = String(r?.[2] ?? '');
      if (CAT_ORDER.includes(label)) {
        const c = cats[label] || { sum: 0, count: 0 };
        r[3] = Math.round(c.sum * 100) / 100; r[4] = c.count; r[5] = ANS_SUMMARY[label];
        total += c.sum; count += c.count;
      }
      if (label === 'Grand Total') { r[3] = Math.round(total * 100) / 100; r[4] = count; }
    }
  });
}

const cases: Record<string, () => Uint8Array> = {
  'blank template (computed from base data)': () => new Uint8Array(template),
  'every answer right': () => answered(),
  'some answers and formulas wrong': () => answered((i, r) => {
    if (i % 7 === 0) r[15] = 'Match';
    if (i % 3 === 0) r[10] = null;
    if (i % 11 === 0) r[15] = 'invoice>payment';
  }),
};

describe('grader matches the old app', () => {
  const legacy = legacyGrader();
  for (const [name, make] of Object.entries(cases)) {
    it(name, () => {
      const buf = make();
      const oldParsed = legacy.parseApplicant(buf);
      const newParsed = parseApplicant(buf);
      expect(JSON.parse(JSON.stringify(newParsed))).toEqual(JSON.parse(JSON.stringify(oldParsed)));
      if (newParsed.error) return;
      const oldGrade = legacy.gradeData(oldParsed.rows, oldParsed.instrRows, oldParsed.grandTotal);
      const newGrade = gradeData(newParsed.rows, newParsed.instrRows, newParsed.grandTotal);
      expect(JSON.parse(JSON.stringify(newGrade))).toEqual(JSON.parse(JSON.stringify(oldGrade)));
    });
  }

  it('the light category list matches the engine', () => {
    expect(LIGHT_CAT_ORDER).toEqual(CAT_ORDER);
  });

  it('a fully correct submission passes with 100', () => {
    const p = parseApplicant(answered());
    const g = gradeData(p.rows, p.instrRows, p.grandTotal);
    expect(g.catPct).toBe(100);
    expect(g.rubric.total).toBe(100);
    expect(g.pass).toBe(true);
  });
});
