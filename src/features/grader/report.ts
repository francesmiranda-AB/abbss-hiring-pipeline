import type { Candidate } from '@/domain/types';
import { emmHighRiskFlag, emmStatusLabel } from '@/domain/assessments';
import { CAT_ORDER } from '@/domain/grader/categories';
import type { GradeResult } from '@/domain/grader/engine';

// The one printable EMM report, used from the candidate panel and the grader.
// It opens in its own window, so it carries its own small stylesheet (AB
// palette values; the app's CSS isn't loaded there).
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const tone = (p: number) => (p >= 90 ? '#00693D' : p >= 75 ? '#825600' : '#B01826');

export function printEmmReport(a: Pick<Candidate, 'name' | 'position' | 'email' | 'emm' | 'emmReceivedAt' | 'requiresEmm'>): string | null {
  if (!a.emm?.graded) return 'There is no graded EMM result to print.';
  let g: Partial<GradeResult> = {};
  try { g = JSON.parse(a.emm.fullResult || '{}'); } catch { g = {}; }
  const hasDetail = !!g.catByCat;
  const pct = Number(a.emm.overallPct) || 0;
  const status = emmStatusLabel(a as Candidate);
  const statusTone = a.emm.pass ? (emmHighRiskFlag(a as Candidate) ? '#825600' : '#00693D') : '#B01826';
  const catRows = hasDetail ? CAT_ORDER.map((cat) => {
    const d = g.catByCat![cat] || { correct: 0, wrong: 0 };
    const t = d.correct + d.wrong;
    const p = t ? Math.round((d.correct / t) * 1000) / 10 : 0;
    return `<tr><td>${esc(cat)}</td><td class="n">${d.correct}</td><td class="n">${d.wrong}</td><td class="n">${t}</td><td class="n" style="color:${tone(p)};font-weight:700">${p}%</td></tr>`;
  }).join('') : '';
  const flagTone = (l: string) => (l === 'high' ? '#B01826' : l === 'medium' ? '#825600' : '#00693D');
  const flags = hasDetail ? (g.flags || []).map((f) => `<div class="flag" style="border-color:${flagTone(f.level)}"><strong style="color:${flagTone(f.level)}">${f.level === 'high' ? 'High' : f.level === 'medium' ? 'Medium' : 'Clear'}: ${esc(f.title)}</strong><div>${esc(f.desc)}</div><div><em>Suggested action:</em> ${esc(f.action)}</div></div>`).join('') : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>EMM assessment report: ${esc(a.name)}</title><style>
body{font-family:"Mona Sans",Arial,Helvetica,sans-serif;color:#0F264C;padding:32px;max-width:800px;margin:0 auto;font-size:13px}
h1{font-size:20px;margin:0 0 4px}.sub{color:#484848;margin-bottom:20px}
.banner{display:flex;justify-content:space-between;align-items:center;padding:20px;border:2px solid #0F264C;border-radius:15px;margin-bottom:20px}
.score{font-size:40px;font-weight:800;color:${tone(pct)}}.label{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#484848}
table{width:100%;border-collapse:collapse;margin-bottom:20px}th,td{padding:8px 10px;border-bottom:1px solid #D8D8D8;text-align:left}
th{background:#EDEDED;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#484848}.n{text-align:right;font-variant-numeric:tabular-nums}
h2{font-size:14px;margin:20px 0 8px}.flag{padding:10px 12px;border:1px solid;border-radius:10px;margin-bottom:8px}.flag div{margin-top:4px;color:#484848}
footer{margin-top:30px;font-size:11px;color:#7B7B7B;border-top:1px solid #D8D8D8;padding-top:10px}@media print{body{padding:10px}}
</style></head><body>
<h1>EMM cognitive assessment report</h1>
<div class="sub">${esc(a.name)}, ${esc(a.position || 'no position')}, ${esc(a.email)}</div>
<div class="banner"><div><div class="label">Overall score</div><div class="score">${pct}/100</div><div style="color:${statusTone};font-weight:700">${esc(status)}</div></div>
<div style="text-align:right;color:#484848"><div>Category ID: <strong>${esc(a.emm.catPct)}%</strong></div><div>Action points: <strong>${esc(a.emm.actPct)}%</strong></div><div>Graded ${a.emm.gradedAt ? esc(new Date(a.emm.gradedAt).toLocaleString()) : ''}</div></div></div>
${hasDetail ? `<h2>By category</h2><table><thead><tr><th>Category</th><th class="n">Correct</th><th class="n">Wrong</th><th class="n">Total</th><th class="n">Accuracy</th></tr></thead><tbody>${catRows}</tbody></table><h2>Integrity flags</h2>${flags || '<p>No flags recorded.</p>'}` : '<p>The detailed breakdown is not available for this result (it was graded before the detailed report existed).</p>'}
${a.emm.notes ? `<h2>HR notes</h2><p style="white-space:pre-wrap">${esc(a.emm.notes)}</p>` : ''}
<footer>Generated ${esc(new Date().toLocaleString())}. ABBSS Hiring Pipeline.</footer>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) return 'Allow pop-ups for this site to print the report.';
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.onload = () => { w.focus(); w.print(); };
  return null;
}
