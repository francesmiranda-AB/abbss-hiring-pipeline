// The EMM grader, moved verbatim from the single-file app (legacy/index.html).
// Do not change the scoring here without re-running the golden tests: every
// saved grade was produced by this exact logic.
// @ts-nocheck
import * as XLSX from 'xlsx';
import ANSWER_KEY from './answerKey.json';

export const ANS_SUMMARY={
  "CM > Refund":"Review refund and credit memo amounts.",
  "GJ Entry - Reversed":"No action needed.",
  "Invoice > Payment":"Investigate unpaid amount or short payment.",
  "Match":"No action needed.",
  "Missing CM":"Create or locate missing Credit Memo.",
  "Missing Invoice":"Locate or create missing Invoice.",
  "Missing Payment":"Follow up for payment or review posting.",
  "Missing Refund":"Process or locate Refund.",
  "Partial Invoice":"Review payment application or issue refund."
};
export const CAT_ORDER=["CM > Refund","GJ Entry - Reversed","Invoice > Payment","Match","Missing CM","Missing Invoice","Missing Payment","Missing Refund","Partial Invoice"];
export const HINTS={"CM > Refund":"Credit Memo + Refund lines with a negative net balance.","GJ Entry - Reversed":"GJ Entry lines that net to zero.","Invoice > Payment":"Invoice + Payment lines with a positive net balance.","Match":"Lines fully matched, net balance is zero.","Missing CM":"Refund line with no corresponding Credit Memo.","Missing Invoice":"Payment line with no corresponding Invoice.","Missing Payment":"Invoice line with no corresponding Payment.","Missing Refund":"Credit Memo line with no corresponding Refund.","Partial Invoice":"Invoice + Payment lines with a negative net balance."};
export const TOTAL_ROWS=1869,PASS_EMM=75;

export function inspectAllSheets(wb){
  const report={sheets:[],bestMatchSheet:null,bestInstrSheet:null,warnings:[],errors:[]};
  const AK_ENTRIES=new Set(Object.keys(ANSWER_KEY));
  for(const name of wb.SheetNames){
    const ws=wb.Sheets[name];
    const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:null});
    const info={name,rows:raw.length,hasEntryNo:false,hasRemarks:false,hasActionPoint:false,
      entryNoCol:-1,remarksCol:-1,headerRow:-1,dataRows:0,remarksFilled:0,remarksAreFormulas:false,
      hasBaseData:false,sumifFilled:0,entriesMatchingKey:0,blankRemarks:0,uniqueRemarks:new Set(),isInstructions:false};
    for(let i=0;i<Math.min(raw.length,30);i++){
      const row=raw[i]||[];
      const hasEntry=row.some(c=>String(c||'').includes('Entry No'));
      const hasRemark=row.some(c=>String(c||'').trim()==='Remarks');
      const hasAction=row.some(c=>String(c||'').includes('Action Point'));
      const hasSumOf=row.some(c=>String(c||'').includes('Sum of'));
      if(hasEntry&&hasRemark){
        info.hasEntryNo=true;info.hasRemarks=true;info.headerRow=i;
        const hdrs=row.map(h=>String(h||'').trim());
        info.entryNoCol=hdrs.findIndex(h=>h.includes('Entry No'));
        info.remarksCol=hdrs.findIndex(h=>h==='Remarks');
        info.sumifCol=hdrs.findIndex(h=>h==='SUMIF');
        info.docTypeCol=hdrs.findIndex(h=>h.includes('Document Type'));
        info.remAmtCol=hdrs.findIndex(h=>h.includes('Remaining Amt'));
        info.extDocCol=hdrs.findIndex(h=>h.includes('External Document'));
        for(let j=i+1;j<raw.length;j++){
          const r=raw[j]||[];
          const entry=String(r[info.entryNoCol]||'').trim();
          if(!entry||entry==='null')continue;
          info.dataRows++;
          const rmk=String(r[info.remarksCol]||'').trim();
          if(rmk&&rmk!=='nan'){info.remarksFilled++;info.uniqueRemarks.add(rmk);}else info.blankRemarks++;
          if(info.sumifCol>=0&&r[info.sumifCol]!=null)info.sumifFilled++;
          if(AK_ENTRIES.has(entry))info.entriesMatchingKey++;
          // Check if base data cols exist (DocType)
          if(info.docTypeCol>=0&&r[info.docTypeCol]!=null)info.hasBaseData=true;
        }
        break;
      }
      if(hasRemark&&hasAction&&hasSumOf){info.isInstructions=true;info.hasActionPoint=true;info.headerRow=i;break;}
    }
    info.uniqueRemarks=[...info.uniqueRemarks];
    report.sheets.push(info);
  }
  const matchC=report.sheets.filter(s=>s.hasEntryNo&&s.hasRemarks&&(s.remarksFilled>0||s.hasBaseData));
  matchC.sort((a,b)=>(b.remarksFilled-a.remarksFilled)||(b.entriesMatchingKey-a.entriesMatchingKey));
  report.bestMatchSheet=matchC[0]||null;
  const instrC=report.sheets.filter(s=>s.isInstructions||s.hasActionPoint);
  report.bestInstrSheet=instrC[0]||null;
  if(!report.bestMatchSheet)report.errors.push('No sheet with completed Remarks found and no base data to compute from. The file appears to be blank.');
  else{
    const std=report.sheets.find(s=>s.name==='Matching');
    if(std&&std.remarksFilled===0&&report.bestMatchSheet.name!=='Matching')
      report.warnings.push(`Answers found in "${report.bestMatchSheet.name}" sheet. Standard "Matching" sheet was blank.`);
    if(report.bestMatchSheet.remarksFilled===0&&report.bestMatchSheet.hasBaseData)
      report.warnings.push('Remarks column is blank or contains uncalculated formulas. The tool will compute categories from the base data (DocType, Remaining Amount, Order Ref) automatically.');
    else if(report.bestMatchSheet.blankRemarks>0)
      report.warnings.push(`${report.bestMatchSheet.blankRemarks} rows have no Remarks answer and will be marked wrong.`);
    // Compare after the same normalization gradeData() uses (case/whitespace/
    // dash-insensitive) -- a candidate who typed "INVOICE>PAYMENT" instead of
    // "Invoice > Payment" is still graded correctly, so this warning should
    // only flag values that are genuinely unrecognized, not just differently
    // formatted. Confirmed on a real submission (Camille Navarette) where the
    // old exact-match warning wrongly implied 9 correctly-typed categories
    // would all be marked wrong.
    const normalizedAnswerKeys=Object.keys(ANS_SUMMARY).map(normalizeRemark);
    const extra=report.bestMatchSheet.uniqueRemarks.filter(r=>!normalizedAnswerKeys.includes(normalizeRemark(r)));
    if(extra.length>0)report.warnings.push(`Non-standard Remarks values found: "${extra.join('", "')}". These don't match any known category (even ignoring case/spacing) and will be marked wrong.`);
    if(report.bestMatchSheet.dataRows!==1869)
      report.warnings.push(`Row count: found ${report.bestMatchSheet.dataRows}, expected 1,869.`);
  }
  if(!report.bestInstrSheet)report.warnings.push('Instructions summary table not found. Action Recommendations cannot be graded.');
  return report;
}

export function computeRemarksFromBaseData(rows){
  // Step 1: resolve OrderRef for each row
  // GJ Entry rows → 'GJ Entry - Reversed'
  // Others → ExtDocNo (col index stored as extDocIdx)
  // Step 2: compute SUMIF (sum RemAmt by OrderRef)
  // Step 3: compute COUNTIFS (count DocType per OrderRef)
  // Step 4: apply category logic

  const sumifMap={}, invMap={}, payMap={}, cmMap={}, refMap={};
  for(const r of rows){
    const ref=r.orderRef;
    sumifMap[ref]=(sumifMap[ref]||0)+r.remAmt;
    if(r.docType==='Invoice')        invMap[ref]=(invMap[ref]||0)+1;
    else if(r.docType==='Payment')   payMap[ref]=(payMap[ref]||0)+1;
    else if(r.docType==='Credit Memo') cmMap[ref]=(cmMap[ref]||0)+1;
    else if(r.docType==='Refund')    refMap[ref]=(refMap[ref]||0)+1;
  }

  return rows.map(r=>{
    const ref=r.orderRef;
    const sumif=Math.round((sumifMap[ref]||0)*100)/100;
    const inv=invMap[ref]||0, pay=payMap[ref]||0;
    const cm=cmMap[ref]||0,  ref_=refMap[ref]||0;
    let remarks='';
    if(ref==='GJ Entry - Reversed') remarks='GJ Entry - Reversed';
    else if(inv>0&&pay>0&&cm===0&&ref_===0){
      if(Math.abs(sumif)<0.02) remarks='Match';
      else if(sumif>0)         remarks='Invoice > Payment';
      else                     remarks='Partial Invoice';
    } else if(cm>0&&ref_>0&&inv===0&&pay===0){
      if(Math.abs(sumif)<0.02) remarks='Match';
      else if(sumif<0)         remarks='CM > Refund';
      else                     remarks='Missing';
    } else if(inv>0&&pay===0) remarks='Missing Payment';
    else if(pay>0&&inv===0)   remarks='Missing Invoice';
    else if(cm>0&&ref_===0)   remarks='Missing Refund';
    else if(ref_>0&&cm===0)   remarks='Missing CM';
    return{...r, sumif, inv, pay, cm, ref:ref_,
           remarks: r.remarks||remarks,  // use cached remark if available, else computed
           computedRemarks: remarks};
  });
}

export function parseApplicant(buffer){
  const wb=XLSX.read(buffer,{type:'array'});
  const inspection=inspectAllSheets(wb);
  if(inspection.errors.length>0)return{error:inspection.errors.join(' | '),inspection};
  const best=inspection.bestMatchSheet;
  const ws=wb.Sheets[best.name];
  const rawM=XLSX.utils.sheet_to_json(ws,{header:1,defval:null});
  const hdrs=rawM[best.headerRow].map(h=>String(h||'').trim());
  const ci=n=>hdrs.findIndex(h=>h.includes(n));
  const ec=ci('Entry No'),sc=ci('SUMIF'),ic=ci('Inv Count'),pc=ci('Pay Count'),
        cc=ci('CM Count'),rc=ci('Ref Count'),rmc=ci('Remarks'),
        dtc=ci('Document Type'),ramc=ci('Remaining Amt'),extc=ci('External Document'),
        orc=ci('Order Ref');

  const rows=[];
  for(let i=best.headerRow+1;i<rawM.length;i++){
    const r=rawM[i];
    const entry=String(r[ec]||'').trim();
    if(!entry||entry==='null')continue;
    const docType=String(r[dtc]||'').trim();
    const remAmt=r[ramc]!=null?parseFloat(r[ramc]):0;
    const extDoc=String(r[extc]||'').trim();
    // Resolve orderRef: GJ Entry rows use hardcoded value, others use extDoc
    const orderRef=docType==='GJ Entry'?'GJ Entry - Reversed':(extDoc&&extDoc!=='nan'?extDoc:'');
    // The applicant's OWN "Order Ref" column, kept separate from the
    // canonical orderRef above -- this is what "Order reference
    // identification" actually grades: did they correctly resolve the
    // Order Ref for each line themselves. Comparing it against the
    // canonical value we already derive from External Document No. per
    // row means this check is immune to whatever order she sorted the
    // sheet into -- it only ever compares a row's two columns against
    // each other, never against a fixed row position.
    const herOrderRef=orc>=0&&r[orc]!=null?String(r[orc]).trim():'';
    rows.push({
      entry,
      sumif:   r[sc]!=null?parseFloat(r[sc]):null,
      inv:     r[ic]!=null?parseInt(r[ic]):null,
      pay:     r[pc]!=null?parseInt(r[pc]):null,
      cm:      r[cc]!=null?parseInt(r[cc]):null,
      ref:     r[rc]!=null?parseInt(r[rc]):null,
      remarks: String(r[rmc]||'').trim(),
      docType, remAmt, orderRef, herOrderRef
    });
  }

  // If Remarks column is blank, compute from base data
  const remarksFilled=rows.filter(r=>r.remarks&&r.remarks!=='nan').length;
  let computedFromBase=false;
  let finalRows=rows;
  if(remarksFilled===0&&rows.some(r=>r.docType)){
    finalRows=computeRemarksFromBaseData(rows);
    computedFromBase=true;
  }

  // Parse Instructions sheet
  const instrName=inspection.bestInstrSheet?inspection.bestInstrSheet.name:'Instructions';
  const wsI=wb.Sheets[instrName];
  const rawI=wsI?XLSX.utils.sheet_to_json(wsI,{header:1,defval:null}):[];
  let hI=-1;
  for(let i=0;i<rawI.length;i++){
    const row=rawI[i].map(c=>String(c||''));
    if(row.some(c=>c.includes('Remarks'))&&(row.some(c=>c.includes('Sum of'))||row.some(c=>c.includes('Action Point')))){hI=i;break;}
  }
  const instrRows=[];
  let grandTotal=null;
  if(hI>=0){
    const hi=rawI[hI].map(h=>String(h||'').trim());
    const ci2=n=>hi.findIndex(h=>h.includes(n));
    const lc=ci2('Remarks'),apc=ci2('Action Point'),sac=ci2('Sum of'),cnc=ci2('Count of');
    for(let i=hI+1;i<rawI.length;i++){
      const r=rawI[i];const label=String(r[lc]||'').trim();
      if(!label)continue;
      const sumAmt=sac>=0&&r[sac]!=null?parseFloat(r[sac]):null;
      const count=cnc>=0&&r[cnc]!=null?parseInt(r[cnc]):null;
      if(label==='Grand Total'){grandTotal={amt:sumAmt,count:count};continue;}
      instrRows.push({label,action:String(r[apc]||'').trim(),sumAmt,count});
    }
  }

  const warnings=[...inspection.warnings];
  if(computedFromBase)
    warnings.push('Remarks column contained uncalculated formulas (file may not have been saved after completion in Excel). Categories were computed automatically from the base data. Results reflect what the formulas would have produced.');

  return{rows:finalRows,instrRows,grandTotal,
    sheetWarning:warnings.join(' | '),
    usedSheetName:best.name,
    inspection,computedFromBase};
}

export function normalizeRemark(s){
  return String(s||'').toLowerCase().replace(/[\s\-]+/g,'');
}

export function gradeData(rows,instrRows,grandTotal){
  let catCorrect=0;const catWrong=[],catByCat={};
  const fCols={sumif:0,inv:0,pay:0,cm:0,ref:0};
  let fTotal=0,fwcc=0,fcwc=0,bcc=0,bwc=0;
  let orderRefCorrect=0;
  const trueCatSum={},trueCatCount={};
  let trueGrandAmt=0;
  for(const r of rows){
    const ans=ANSWER_KEY[r.entry];if(!ans)continue;fTotal++;
    const sOk=r.sumif!=null&&Math.abs(Math.round(r.sumif*100)/100-Math.round(ans.sumif*100)/100)<0.02;
    const iOk=r.inv!=null&&r.inv===ans.inv,pOk=r.pay!=null&&r.pay===ans.pay,cOk=r.cm!=null&&r.cm===ans.cm,rOk=r.ref!=null&&r.ref===ans.ref;
    // Use computedRemarks if remarks is blank (formula not calculated)
    const effectiveRemark=(r.remarks&&r.remarks!=='nan'&&r.remarks!=='')?r.remarks:(r.computedRemarks||'');
    const fOk=sOk&&iOk&&pOk&&cOk&&rOk,rmOk=normalizeRemark(effectiveRemark)===normalizeRemark(ans.remarks);
    if(sOk)fCols.sumif++;if(iOk)fCols.inv++;if(pOk)fCols.pay++;if(cOk)fCols.cm++;if(rOk)fCols.ref++;
    catByCat[ans.remarks]=catByCat[ans.remarks]||{correct:0,wrong:0};
    if(rmOk){catCorrect++;catByCat[ans.remarks].correct++;}
    else{catByCat[ans.remarks].wrong++;catWrong.push({entry:r.entry,got:effectiveRemark,expected:ans.remarks});}
    if(fOk&&rmOk)bcc++;else if(fOk&&!rmOk)fcwc++;else if(!fOk&&rmOk)fwcc++;else bwc++;
    // Order Ref check compares each row's OWN two columns against each
    // other (her "Order Ref" entry vs. the canonical value derived from
    // that same row's External Document No.) -- never against a fixed row
    // position, so it can't be thrown off by however she sorted the sheet.
    if(r.herOrderRef&&r.herOrderRef===r.orderRef)orderRefCorrect++;
    // True per-category $ total and line count, computed from the ANSWER
    // KEY's remarks label (never her own, possibly-wrong, remarks) joined
    // to her own Remaining Amt column -- this is what her Instructions-tab
    // pivot table SHOULD reconcile to.
    trueCatSum[ans.remarks]=(trueCatSum[ans.remarks]||0)+r.remAmt;
    trueCatCount[ans.remarks]=(trueCatCount[ans.remarks]||0)+1;
    trueGrandAmt+=r.remAmt;
  }
  const catPct=Math.round(catCorrect/TOTAL_ROWS*10000)/100;
  const fPcts={};for(const k of Object.keys(fCols))fPcts[k]=fTotal?Math.round(fCols[k]/fTotal*1000)/10:0;
  let actCorrect=0,actTotal=0;const actWrong=[];
  for(const r of instrRows){const exp=ANS_SUMMARY[r.label];if(!exp)continue;actTotal++;if(r.action.toLowerCase()===exp.toLowerCase())actCorrect++;else actWrong.push({label:r.label,got:r.action,expected:exp});}
  const actPct=actTotal?Math.round(actCorrect/actTotal*10000)/100:0;
  const overallPct=Math.round((catCorrect+actCorrect)/(TOTAL_ROWS+actTotal)*10000)/100;

  // ============================================================
  // CLIENT-STYLE RUBRIC -- mirrors the 5-area / 100-point breakdown the
  // client grades against (Order Reference ID /10, Required Excel
  // Calculations /30, Line-Item Remarks /35, Summary Accuracy &
  // Reconciliation /15, Recommendations /10), instead of the blended
  // "final answer only" overallPct above. This is what actually catches a
  // candidate who reverse-engineered the right labels without doing the
  // required SUMIF/COUNTIFS work -- overallPct alone can't, since it never
  // looks at whether the formula columns were filled in at all.
  const orderRefScore=fTotal?Math.round(10*orderRefCorrect/fTotal):0;
  const avgFormulaPct=Object.values(fPcts).length?Object.values(fPcts).reduce((a,b)=>a+b,0)/Object.values(fPcts).length:0;
  const calcScore=Math.round(30*avgFormulaPct/100);
  const remarksScore=Math.round(35*catPct/100);
  const recsScore=Math.round(10*actPct/100);

  const CAT_TOL_AMT=1,CAT_TOL_COUNT=0; // $1 rounding tolerance on amounts, exact match on counts
  let matchedCats=0;
  const catReconcile=CAT_ORDER.map(cat=>{
    const her=instrRows.find(r=>r.label===cat);
    const trueSum=Math.round((trueCatSum[cat]||0)*100)/100;
    const trueCount=trueCatCount[cat]||0;
    const sumOk=her&&her.sumAmt!=null&&Math.abs(her.sumAmt-trueSum)<=CAT_TOL_AMT;
    const countOk=her&&her.count!=null&&Math.abs(her.count-trueCount)<=CAT_TOL_COUNT;
    const ok=sumOk&&countOk;
    if(ok)matchedCats++;
    return{category:cat,herSum:her?her.sumAmt:null,trueSum,herCount:her?her.count:null,trueCount,ok};
  });
  const grandAmtOk=!!(grandTotal&&grandTotal.amt!=null&&Math.abs(grandTotal.amt-Math.round(trueGrandAmt*100)/100)<=1);
  const grandCountOk=!!(grandTotal&&grandTotal.count===fTotal);
  const summaryScore=Math.round((grandAmtOk?1:0)+(grandCountOk?1:0)+matchedCats*(13/9));

  const rubricTotal=orderRefScore+calcScore+remarksScore+summaryScore+recsScore;
  const rubric={
    orderRef:{score:orderRefScore,max:10,correct:orderRefCorrect,total:fTotal},
    calc:{score:calcScore,max:30,fPcts},
    remarks:{score:remarksScore,max:35,accuracy:catPct,correct:catCorrect,wrong:catWrong.length,total:fTotal},
    summary:{score:summaryScore,max:15,grandAmtOk,grandCountOk,herGrandAmt:grandTotal?grandTotal.amt:null,trueGrandAmt:Math.round(trueGrandAmt*100)/100,herGrandCount:grandTotal?grandTotal.count:null,trueGrandCount:fTotal,matchedCats,totalCats:CAT_ORDER.length,catReconcile},
    recs:{score:recsScore,max:10,accuracy:actPct,correct:actCorrect,total:actTotal},
    total:rubricTotal,totalMax:100,
    pass:rubricTotal>=PASS_EMM
  };
  const flags=[];
  const bypassRate=Math.round(fwcc/fTotal*100),weakRate=Math.round(fcwc/fTotal*100);
  if(bypassRate>30)flags.push({level:bypassRate>60?'high':'medium',title:'Possible Formula Bypass',desc:`${fwcc} rows (${bypassRate}%) have correct categories but incorrect formula values.`,action:'Ask the applicant to explain their SUMIF and COUNTIFS formulas during live validation.'});
  if(weakRate>10)flags.push({level:weakRate>25?'high':'medium',title:'Formula OK, Classification Judgment Weak',desc:`${fcwc} rows (${weakRate}%) have correct formulas but wrong categories.`,action:'Ask the applicant to verbally classify 3-4 entries and explain their reasoning.'});
  const wc={};for(const k of Object.keys(fCols))wc[k]=fTotal-fCols[k];
  const highErr=Object.entries(wc).filter(([,v])=>v>fTotal*.5).map(([k])=>k.toUpperCase());
  const perfCols=Object.entries(wc).filter(([,v])=>v===0).map(([k])=>k.toUpperCase());
  if(highErr.length===1&&perfCols.length===4)flags.push({level:'medium',title:`Isolated Formula Error: ${highErr[0]}`,desc:`All other formula columns are 100% correct but ${highErr[0]} has a high error rate.`,action:`Ask the applicant to show their ${highErr[0]} formula during live validation.`});
  if(Object.values(fPcts).every(p=>p>=98)&&catPct<80)flags.push({level:'high',title:'Perfect Formulas, Low Category Accuracy',desc:`All formulas near-perfect but category accuracy is only ${catPct}%.`,action:'Ask how they determined categories from their formula results.'});
  if(flags.length===0&&overallPct>=75)flags.push({level:'pass',title:'No Integrity Concerns Detected',desc:'Formula values and categories are internally consistent.',action:'Standard live validation recommended.'});
  // The numeric score/threshold above only measures whether the FINAL
  // answers are right -- it can't tell "correctly derived it" apart from
  // "got the right label without doing the required formula work" (a real
  // case this surfaced: 93%+ overall with every required formula column
  // blank). A HIGH-severity flag is exactly that distinction. Carrying it
  // as its own field means every place that displays PASS/FAIL can show
  // "flagged for review" instead of a clean pass, without changing the
  // underlying score math.
  const highRiskFlag=flags.some(f=>f.level==='high');
  // pass is now the RUBRIC's pass/fail (the client-style 5-area /100
  // breakdown above), not the old blended "final answers only" overallPct
  // threshold -- that old number is exactly what let a 93%+ "correct
  // answers, zero required formula work" submission read as a clean PASS.
  // overallPct/catPct/actPct are kept as-is below for the existing
  // Category/Action detail tabs, just no longer used to decide pass/fail.
  return{catCorrect,catWrong,catPct,catByCat,catWrongCount:catWrong.length,actCorrect,actWrong,actTotal,actPct,fPcts,fTotal,fwcc,fcwc,bcc,bwc,overallPct,overallTotal:TOTAL_ROWS+actTotal,overallCorrect:catCorrect+actCorrect,totalRows:rows.filter(r=>ANSWER_KEY[r.entry]).length,pass:rubric.pass,highRiskFlag,flags,integrity:{bypassRate,weakRate,wrongColCounts:wc},rubric};
}

export { ANSWER_KEY };
