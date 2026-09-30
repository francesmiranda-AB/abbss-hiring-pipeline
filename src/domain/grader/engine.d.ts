// Types for the verbatim grader (engine.js). Shapes are what the old app stored
// in emm.fullResult; only the fields the screens read are typed.
export interface SheetInfo { name: string; rows: number; dataRows: number; remarksFilled: number; entriesMatchingKey: number; isInstructions: boolean; hasEntryNo: boolean }
export interface Inspection { sheets: SheetInfo[]; bestMatchSheet: SheetInfo | null; bestInstrSheet: SheetInfo | null; warnings: string[]; errors: string[] }
export interface ParsedSubmission {
  error?: string;
  inspection: Inspection;
  rows: unknown[];
  instrRows: unknown[];
  grandTotal: { amt: number | null; count: number | null } | null;
  sheetWarning: string;
  usedSheetName: string;
  computedFromBase: boolean;
}
export interface Flag { level: 'high' | 'medium' | 'pass'; title: string; desc: string; action: string }
export interface RubricPart { score: number; max: number; [k: string]: unknown }
export interface Rubric {
  orderRef: RubricPart & { correct: number; total: number };
  calc: RubricPart & { fPcts: Record<string, number> };
  remarks: RubricPart & { accuracy: number; correct: number; wrong: number; total: number };
  summary: RubricPart & { grandAmtOk: boolean; grandCountOk: boolean; herGrandAmt: number | null; trueGrandAmt: number; herGrandCount: number | null; trueGrandCount: number; matchedCats: number; totalCats: number; catReconcile: Array<{ category: string; herSum: number | null; trueSum: number; herCount: number | null; trueCount: number; ok: boolean }> };
  recs: RubricPart & { accuracy: number; correct: number; total: number };
  total: number; totalMax: number; pass: boolean;
}
export interface GradeResult {
  catCorrect: number; catWrong: Array<{ entry: string; got: string; expected: string }>; catPct: number;
  catByCat: Record<string, { correct: number; wrong: number }>; catWrongCount: number;
  actCorrect: number; actWrong: Array<{ label: string; got: string; expected: string }>; actTotal: number; actPct: number;
  fPcts: Record<string, number>; fTotal: number; fwcc: number; fcwc: number; bcc: number; bwc: number;
  overallPct: number; overallTotal: number; overallCorrect: number; totalRows: number;
  pass: boolean; highRiskFlag: boolean; flags: Flag[];
  integrity: { bypassRate: number; weakRate: number; wrongColCounts: Record<string, number> };
  rubric: Rubric;
  fileName?: string; gradedAt?: string; sheetWarning?: string;
}
export const ANS_SUMMARY: Record<string, string>;
export const CAT_ORDER: string[];
export const HINTS: Record<string, string>;
export const TOTAL_ROWS: number;
export const PASS_EMM: number;
export const ANSWER_KEY: Record<string, { sumif: number; inv: number; pay: number; cm: number; ref: number; remarks: string }>;
export function inspectAllSheets(wb: unknown): Inspection;
export function computeRemarksFromBaseData(rows: unknown[]): unknown[];
export function parseApplicant(buffer: ArrayBuffer | Uint8Array): ParsedSubmission;
export function normalizeRemark(s: string): string;
export function gradeData(rows: unknown[], instrRows: unknown[], grandTotal: ParsedSubmission['grandTotal']): GradeResult;
