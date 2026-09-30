import type { Emm } from '../types';
import { gradeData, parseApplicant, type GradeResult, type ParsedSubmission } from './engine';

export * from './engine';

export interface GradeOutcome { parsed: ParsedSubmission; result: GradeResult | null; error: string }

// Grade one submitted .xlsx. The scoring itself is the old app's, unchanged.
export function gradeWorkbook(buffer: ArrayBuffer | Uint8Array, fileName: string, now = new Date()): GradeOutcome {
  const parsed = parseApplicant(buffer);
  if (parsed.error) return { parsed, result: null, error: parsed.error };
  const result = gradeData(parsed.rows, parsed.instrRows, parsed.grandTotal);
  result.fileName = fileName;
  result.gradedAt = now.toISOString();
  result.sheetWarning = parsed.sheetWarning || '';
  return { parsed, result, error: '' };
}

// The EMM result as stored on a candidate. overallPct is the rubric total
// (/100), the same number pass/fail comes from.
export function emmRecordFromGrade(g: GradeResult, notes?: string): Emm {
  return {
    graded: true, overallPct: g.rubric.total, legacyOverallPct: g.overallPct, catPct: g.catPct, actPct: g.actPct,
    pass: g.pass, highRiskFlag: g.highRiskFlag, gradedAt: g.gradedAt, notes: notes || '', fullResult: JSON.stringify(g),
  };
}
