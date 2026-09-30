// The nine EMM categories in report order. Kept apart from the grader engine
// (which pulls in SheetJS) so screens that only show results stay light. A
// test checks it matches the engine.
export const CAT_ORDER: string[] = ["CM > Refund","GJ Entry - Reversed","Invoice > Payment","Match","Missing CM","Missing Invoice","Missing Payment","Missing Refund","Partial Invoice"];
