import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { ANS_SUMMARY, CAT_ORDER, HINTS, type GradeResult, type ParsedSubmission } from '@/domain/grader';
import { Badge, Kpis, Tabs } from '@/ui/kit';

type Tab = 'overview' | 'integrity' | 'formulas' | 'categories' | 'actions' | 'errors';
const pctOf = (d: { correct: number; wrong: number }) => { const t = d.correct + d.wrong; return t ? Math.round((d.correct / t) * 1000) / 10 : 0; };
const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function GradeResults({ g, parsed }: { g: GradeResult; parsed: ParsedSubmission }) {
  const [tab, setTab] = useState<Tab>('overview');
  const r = g.rubric;
  return (
    <div className="grid gap-6">
      <Kpis items={[
        { value: `${r.total}/100`, label: r.pass ? 'Passed (75 or more)' : 'Not passed (under 75)' },
        { value: `${g.catPct}%`, label: 'Category identification' },
        { value: `${g.actPct}%`, label: 'Action points' },
      ]} />
      <Preflight parsed={parsed} />
      <Tabs label="Result detail" value={tab} onChange={setTab} tabs={[
        { key: 'overview', label: 'Breakdown' }, { key: 'integrity', label: 'Integrity' }, { key: 'formulas', label: 'Formulas' },
        { key: 'categories', label: 'Categories' }, { key: 'actions', label: 'Action points' }, { key: 'errors', label: 'Errors', count: g.catWrongCount },
      ]} />
      {tab === 'overview' && <Overview g={g} />}
      {tab === 'integrity' && <Integrity g={g} />}
      {tab === 'formulas' && (
        <Table head={['Column', 'Formula logic', 'Accuracy']} rows={([
          ['SUMIF', 'SUMIF(Order Ref, Remaining Amt.)', g.fPcts.sumif], ['Inv Count', 'COUNTIFS(Order Ref, Doc Type=Invoice)', g.fPcts.inv],
          ['Pay Count', 'COUNTIFS(Order Ref, Doc Type=Payment)', g.fPcts.pay], ['CM Count', 'COUNTIFS(Order Ref, Doc Type=Credit Memo)', g.fPcts.cm],
          ['Ref Count', 'COUNTIFS(Order Ref, Doc Type=Refund)', g.fPcts.ref],
        ] as const).map(([c, l, p]) => [<strong key="c">{c}</strong>, l, <Meter key="p" pct={p} />])} />
      )}
      {tab === 'categories' && (
        <Table head={['Category', 'Right', 'Wrong', 'Accuracy', 'Definition']} rows={CAT_ORDER.map((cat) => {
          const d = g.catByCat[cat] || { correct: 0, wrong: 0 };
          return [<strong key="c">{cat}</strong>, d.correct, d.wrong, <Meter key="m" pct={pctOf(d)} />, <span key="h" className="app-meta">{HINTS[cat]}</span>];
        })} />
      )}
      {tab === 'actions' && (
        <Table head={['Category', 'Result', 'Their answer', 'Expected']} rows={CAT_ORDER.map((cat) => {
          const w = g.actWrong.find((x) => x.label === cat);
          return [<strong key="c">{cat}</strong>, <Badge key="b" tone={w ? 'danger' : 'success'}>{w ? 'Wrong' : 'Right'}</Badge>, w ? (w.got || '(blank)') : ANS_SUMMARY[cat], <span key="e" className="app-meta">{ANS_SUMMARY[cat]}</span>];
        })} />
      )}
      {tab === 'errors' && <Errors g={g} />}
    </div>
  );
}

function Preflight({ parsed }: { parsed: ParsedSubmission }) {
  const ins = parsed.inspection;
  const warnings = [...ins.warnings, ...(parsed.computedFromBase ? ['Categories were worked out from the base data because the Remarks column held uncalculated formulas.'] : [])];
  return (
    <details open={warnings.length > 0}>
      <summary className="app-meta">File check: graded from the "{parsed.usedSheetName}" sheet{warnings.length ? `, ${warnings.length} note${warnings.length === 1 ? '' : 's'}` : ''}</summary>
      <div className="grid gap-3 mt-3">
        {warnings.map((w) => <div key={w} className="ab-alert ab-alert--warning"><span className="ab-alert__icon" aria-hidden><AlertTriangle size={18} /></span><div>{w}</div></div>)}
        <Table head={['Sheet', 'Rows', 'Remarks filled', 'Match the key', 'Use']} rows={ins.sheets.map((s) => [
          s.name, s.dataRows || '', s.dataRows ? `${Math.round((s.remarksFilled / s.dataRows) * 100)}% (${s.remarksFilled})` : '',
          s.dataRows ? `${Math.round((s.entriesMatchingKey / s.dataRows) * 100)}%` : '',
          s.name === parsed.usedSheetName ? <Badge key="u" tone="success">Graded</Badge> : s.isInstructions ? 'Action points' : s.hasEntryNo ? (s.remarksFilled === 0 ? 'Blank' : 'Not used') : '',
        ])} />
      </div>
    </details>
  );
}

function Overview({ g }: { g: GradeResult }) {
  const r = g.rubric;
  const fp = Object.values(r.calc.fPcts);
  const avg = fp.length ? Math.round((fp.reduce((x, y) => x + y, 0) / fp.length) * 10) / 10 : 0;
  const calc = avg === 0 ? 'The SUMIF, invoice, payment, credit memo and refund count columns were left blank.'
    : avg >= 98 ? 'All required formula columns are filled in correctly.' : `Formula columns are ${avg}% correct on average. Some SUMIF or COUNTIFS values don't match.`;
  const s = r.summary;
  const summary = [
    s.grandAmtOk ? `The overall balance of ${money(s.trueGrandAmt)} was correct.` : `The overall balance should be ${money(s.trueGrandAmt)}, but their total didn't match.`,
    s.matchedCats === s.totalCats ? 'All category amounts and counts reconciled.' : `Category amounts and counts didn't fully reconcile (${s.matchedCats} of ${s.totalCats} matched).`,
    s.grandCountOk ? `Their summary counted all ${s.trueGrandCount} lines.` : `Their summary counted ${s.herGrandCount == null ? '(blank)' : s.herGrandCount} lines instead of ${s.trueGrandCount}.`,
  ].join(' ');
  const rows: Array<[string, { score: number; max: number }, string]> = [
    ['Order reference identification', r.orderRef, r.orderRef.correct === r.orderRef.total ? `All ${r.orderRef.total.toLocaleString()} Order Ref values matched.` : `${r.orderRef.correct.toLocaleString()} of ${r.orderRef.total.toLocaleString()} Order Ref values matched.`],
    ['Required Excel calculations', r.calc, calc],
    ['Line-item remarks', r.remarks, `${r.remarks.correct.toLocaleString()} of ${r.remarks.total.toLocaleString()} classifications right (${r.remarks.accuracy}%). ${r.remarks.wrong.toLocaleString()} wrong.`],
    ['Summary accuracy and reconciliation', r.summary, summary],
    ['Recommendations', r.recs, r.recs.score >= r.recs.max ? 'The chosen action points matched the answer choices.' : `${r.recs.correct} of ${r.recs.total} action points matched the answer choices.`],
  ];
  return (
    <Table head={['Area', 'Score', 'Findings']} rows={[
      ...rows.map(([area, d, f]) => [<strong key="a">{area}</strong>, <span key="s" className="app-num">{d.score}/{d.max}</span>, <span key="f" className="app-meta">{f}</span>]),
      [<strong key="t">Total</strong>, <strong key="v" className="app-num">{r.total}/100</strong>, <Badge key="p" tone={r.pass ? 'success' : 'danger'}>{r.pass ? 'Passed' : 'Not passed'}</Badge>],
    ]} />
  );
}

function Integrity({ g }: { g: GradeResult }) {
  const cells: Array<[string, number, string]> = [
    ['Both right', g.bcc, 'Strongest sign of genuine independent work.'], ['Formula right, category wrong', g.fcwc, 'Computes formulas but misapplies the rules.'],
    ['Formula wrong, category right', g.fwcc, 'Categories not supported by the formulas.'], ['Both wrong', g.bwc, 'Formula and classification both need work.'],
  ];
  return (
    <div className="grid gap-6">
      <Kpis items={cells.map(([label, v]) => ({ value: `${g.fTotal ? Math.round((v / g.fTotal) * 100) : 0}%`, label: `${label} (${v.toLocaleString()})` }))} />
      <ul className="ab-rows">
        {g.flags.map((f) => (
          <li key={f.title} className="ab-row app-row-compact">
            <span><Badge tone={f.level === 'high' ? 'danger' : f.level === 'medium' ? 'warning' : 'success'}>{f.level === 'pass' ? 'Clear' : f.level}</Badge></span>
            <span><strong>{f.title}.</strong> {f.desc}</span>
            <span className="ab-row__meta">{f.action}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Errors({ g }: { g: GradeResult }) {
  const [cat, setCat] = useState('all');
  const list = cat === 'all' ? g.catWrong : g.catWrong.filter((w) => w.expected === cat);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <strong>{g.catWrongCount} wrong in total</strong>
        <label className="ab-field">
          <span className="ab-label">Category</span>
          <select className="ab-select" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="all">All categories</option>{CAT_ORDER.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>
      {!list.length ? <p className="ab-muted m-0">{g.catWrongCount === 0 ? 'No errors.' : 'No errors in this category.'}</p> : (
        <>
          {list.length > 200 && <p className="app-meta m-0">Showing the first 200 of {list.length}.</p>}
          <Table head={['Entry', 'Their answer', 'Expected', 'Why']} rows={list.slice(0, 200).map((w) => [
            <span key="e" className="ab-mono">{w.entry}</span>, w.got || '(blank)', w.expected, <span key="h" className="app-meta">{HINTS[w.expected] || ''}</span>,
          ])} />
        </>
      )}
    </div>
  );
}

function Meter({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2 min-w-32">
      <div className="ab-progress flex-1" role="img" aria-label={`${pct}%`}><span style={{ '--value': `${pct}%` } as React.CSSProperties} /></div>
      <span className="app-num">{pct}%</span>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="ab-table-wrap">
      <table className="ab-table">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
