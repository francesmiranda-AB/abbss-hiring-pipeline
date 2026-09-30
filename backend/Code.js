// ABBSS Hiring Pipeline - Google Apps Script Backend
// Deployed with clasp from this folder (see docs in the root repo).

// Environment. Production values are the defaults; a staging copy of this
// script overrides them in Project Settings -> Script Properties so the same
// code can run against a copy of the Sheet without touching real people.
function envProp_(key, fallback){
  try{
    var v = PropertiesService.getScriptProperties().getProperty(key);
    return v ? v : fallback;
  }catch(e){ return fallback; }
}
// Only the production script ever falls back to production values. Any other
// copy (staging) must set its own properties, and can never point at the
// production Sheet -- it fails closed instead.
const PROD_SCRIPT_ID = '1kt0pyJYL0Vu_4o46hYYY5GO91kWrtpDQxi4z0dvXyVfQsJdiJQk83sTm';
const PROD_MASTER_SHEET_ID = '1URrEVs7iOdgbFa_Z29eQwrgBeCwfTFZSKQLqjV5wkP0';
const PROD_DAVID_CALENDAR_ID = 'operations@ab-businesssupport.com';
const PROD_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbzuMsCMlqGhFBBSLpWGBMT0jkfHATvi9WJCKDm_KUdIaocK8N3TdM7hbaXeJjl-uj6F/exec';
const IS_PROD_SCRIPT = (function(){ try{ return ScriptApp.getScriptId()===PROD_SCRIPT_ID; }catch(e){ return false; } })();
const IS_STAGING = !IS_PROD_SCRIPT;
const MASTER_SHEET_ID = (function(){
  var id = envProp_('MASTER_SHEET_ID', IS_PROD_SCRIPT ? PROD_MASTER_SHEET_ID : '');
  return (IS_STAGING && id===PROD_MASTER_SHEET_ID) ? '' : id;
})();
// Staging only: every outgoing email goes to this address instead.
const MAIL_REDIRECT = envProp_('MAIL_REDIRECT', '');
const GRIT_SHEET_ID   = '1sU7HPe9Nn69RdHyuCrpisCKdGTDHNO3c0furVEqgfFk';
const VALUES_SHEET_ID = '16jRYZIFG_5O2Dh-7Wvj4MKVfsDV9FsOIXKPJiTFYCbc';
const EMM_FORM_SHEET_ID = '1ZTh5NtZtxvcFfx1kmiW40s4jRyAZdz9T3sNhoZB3SEI';
const EMM_RESPONDER_LINK = 'https://docs.google.com/forms/d/e/1FAIpQLSeJ57uk-2c56I36oKDdog5lh5hcijU-J4g13KZ3mAE2TzQ-uw/viewform';
const GRIT_FORM_LINK = 'https://forms.gle/JwGGt8UWnR6NgFga8';
const VALUES_FORM_LINK = 'https://forms.gle/RH5HGDDvPL9H5YvRA';
const DAVID_CALENDAR_ID = envProp_('DAVID_CALENDAR_ID', IS_PROD_SCRIPT ? PROD_DAVID_CALENDAR_ID : '');
const CV_FOLDER_NAME = envProp_('CV_FOLDER_NAME', 'ABBSS Applicant CVs');

// The plain, public web app URL for THIS deployment (matches the URL shown
// in Deploy > Manage deployments). ScriptApp.getService().getUrl() looks
// like the "correct" way to get this, but for a script deployed from a
// Google Workspace account it can return a domain-qualified variant instead
// (script.google.com/a/macros/YOURDOMAIN/s/.../exec) -- that variant is
// what shows up in YOUR OWN browser address bar since you're signed into
// the domain, but it does not reliably work for external applicants who
// aren't signed into a matching Workspace account, and it silently breaks
// (blank page / broken-image icon) instead of showing a clear error. Every
// candidate/applicant-facing link (assessment links, the scheduling page,
// the email-open tracking pixel) must be built from this hardcoded constant
// instead, so they can never pick up that broken variant. If this
// deployment is ever redeployed under a new URL, update this one line.
const PUBLIC_WEBAPP_URL = envProp_('PUBLIC_WEBAPP_URL', IS_PROD_SCRIPT ? PROD_WEBAPP_URL : '');

// Every email goes through here. Staging fails closed: without MAIL_REDIRECT
// it refuses to send, so a copied Sheet can never email a real candidate.
function sendMail_(to, subject, body, options){
  options = options || {};
  if(IS_STAGING || MAIL_REDIRECT){
    if(!MAIL_REDIRECT) throw new Error('Staging backend has no MAIL_REDIRECT set -- refusing to send email.');
    subject = '[STAGING to ' + to + '] ' + subject;
    to = MAIL_REDIRECT;
    delete options.cc;
    delete options.bcc;
  }
  MailApp.sendEmail(to, subject, body, options);
}

// Staging fails closed for calendar writes too: never David's real calendar.
function assertCalendarWritable_(){
  if(IS_STAGING && (!DAVID_CALENDAR_ID || DAVID_CALENDAR_ID===PROD_DAVID_CALENDAR_ID)){
    throw new Error("Staging backend has no test calendar (or is pointed at David's real calendar) -- set DAVID_CALENDAR_ID.");
  }
}

// ============================================================
// CANDIDATE STAGE MODEL V4 -- refines V3 to line up with the four-role
// (HR / Operations / PM / CEO) architecture. There is deliberately no
// auto-advance logic here: HR/Operations pick whatever stage is currently
// true, and Next Action separately; everything else (dashboards, EOD,
// health) is calculated FROM those two fields plus timestamps, never the
// other way around.
//
// V3 -> V4 changes: 'Preliminary Interview' renamed to 'HR Preliminary
// Interview' (unambiguous -- this round is always HR, unlike the next one).
// 'Final Interview' folded into 'Endorsed to Client' (the client/CEO
// interview happens during that period; there's no candidate-visible
// difference between "endorsed, interview pending" and "endorsed, interview
// done" that needs its own stage). 'Operations Decision' added as its own
// stage so the Approve/Hold/Reject/Endorse decision point is visible on
// dashboards instead of being implicit. 'Job Offer' renamed to 'Offer' to
// match the spec exactly.
//
// 'Initial Interview' is intentionally still named generically, not
// 'Operations Interview' -- see getInterviewRoundLabel() below for why, and
// how the correct department-specific label gets shown anyway.
const CANDIDATE_STAGES = ['New Application','CV Screening','HR Preliminary Interview','Assessment Sent','Assessment Review','Initial Interview','Operations Decision','Endorsed to Client','Offer','Hired','Closed - Rejected','Closed - Withdrawn'];
// Stage names that no longer exist, and where those candidates belong now.
// 'Waiting for Assessment' and 'Waiting for Client Decision' were the same
// step as the stage before them (same next action, same person waiting).
const STAGE_ALIASES = {
  'Waiting for Assessment':'Assessment Sent',
  'Waiting for Client Decision':'Endorsed to Client',
  'Preliminary Interview':'HR Preliminary Interview',
  'Final Interview':'Endorsed to Client',
  'Job Offer':'Offer'
};
function canonicalStage_(stage){ stage = String(stage||''); return STAGE_ALIASES[stage] || stage; }
// Stage-date keys under old names fold into the current name, keeping the
// earliest time so 'days in stage' still counts from when the step began.
function canonicalStageDates_(dates){
  var out = {};
  Object.keys(dates||{}).forEach(function(k){
    var v = dates[k]; if(!v) return;
    var c = canonicalStage_(k);
    if(!out[c] || new Date(v).getTime() < new Date(out[c]).getTime()) out[c] = v;
  });
  return out;
}
const CLOSED_STAGES = ['Hired','Closed - Rejected','Closed - Withdrawn'];
// Keys match the real values in the Department dropdown ('Operations',
// 'Sales and Marketing', plus Finance/HR/IT/Other which this pipeline
// model doesn't apply to today).
const INTERVIEW_ROUNDS_BY_DEPARTMENT = {
  'Operations': { preliminary:'HR', initial:'Operations Manager', final:'Client' },
  'Sales and Marketing': { preliminary:'HR', initial:'Project Manager', final:'CEO' }
};
// Short, role-aware label for whichever round INTERVIEW_ROUNDS_BY_DEPARTMENT
// says a person conducts -- this is how "Initial Interview" (one neutral
// stored stage value, same for every department) gets shown to users as
// "Operations Interview" for Operations-track candidates and "PM Interview"
// for Sales & Marketing-track candidates, without needing a separate stored
// stage value per department. Add an entry here if INTERVIEW_ROUNDS_BY_DEPARTMENT
// ever names a new conductor.
const INTERVIEW_ROUND_SHORT_LABEL = {
  'HR': 'HR Interview', 'Operations Manager': 'Operations Interview',
  'Project Manager': 'PM Interview', 'Client': 'Client Interview', 'CEO': 'CEO Interview'
};
function getInterviewRoundLabel(department, roundKey){
  const rounds = INTERVIEW_ROUNDS_BY_DEPARTMENT[department] || INTERVIEW_ROUNDS_BY_DEPARTMENT['Operations'];
  const conductor = rounds[roundKey];
  return INTERVIEW_ROUND_SHORT_LABEL[conductor] || (roundKey.charAt(0).toUpperCase()+roundKey.slice(1)+' Interview');
}
// requiresClientFinal:false means this role never goes through Endorsed to
// Client / Waiting for Client Decision at all -- it's an internal hire, so
// the Operations Manager's decision after Initial Interview goes straight
// to Offer. FP&A is the example given when this was designed; the rest
// default to true. Starter list -- trivial to edit.
const ROLE_CONFIG = {
  'AR Specialist': { requiresClientFinal:true },
  'AP Specialist': { requiresClientFinal:true },
  'Refunds Specialist': { requiresClientFinal:true },
  'FP&A Specialist': { requiresClientFinal:false }
};
const ROLE_OPTIONS = Object.keys(ROLE_CONFIG);
const NEXT_ACTION_OPTIONS = ['Call Candidate','Screen CV','Schedule HR Preliminary Interview','Send Assessment','Follow up Candidate','Review Assessment','Schedule Initial Interview','Awaiting Interview Result','Decide Reject/Hold','Schedule Client Interview','Follow up Client','Send Offer','Prepare Contract','None'];
const CLOSED_REASON_OPTIONS = ['Failed Assessment','Failed Interview','Client Declined','Salary Mismatch','Candidate Withdrew','Non-Responsive','Other'];
// Suggested default when a stage is first set -- HR can always change it.
const DEFAULT_NEXT_ACTION_BY_STAGE = {
  'New Application':'Screen CV','CV Screening':'Call Candidate','HR Preliminary Interview':'Schedule HR Preliminary Interview',
  'Assessment Sent':'Follow up Candidate','Assessment Review':'Review Assessment',
  'Initial Interview':'Schedule Initial Interview','Operations Decision':'Decide Reject/Hold','Endorsed to Client':'Follow up Client',
  'Offer':'Send Offer','Hired':'None',
  'Closed - Rejected':'None','Closed - Withdrawn':'None'
};
// How many days a candidate should typically spend in each active stage
// before it counts as overdue. Feeds "overdue reminders" on the dashboard --
// deliberately generous starter numbers, easy to tighten later once there's
// real data on how long things actually take.
const STAGE_SLA_DAYS = {
  'New Application':2,'CV Screening':2,'HR Preliminary Interview':3,'Assessment Sent':1,
  'Assessment Review':2,'Initial Interview':3,'Operations Decision':2,'Endorsed to Client':5,'Offer':3
};
// A candidate whose Next Action is literally "follow up" something is the
// clearest, most direct signal that HR has work to do on them right now --
// distinct from "overdue," which is purely time-based regardless of Next Action.
const FOLLOW_UP_ACTIONS = ['Follow up Candidate','Follow up Client'];
const ROLE_HEALTH_SHEET_NAME = 'RoleHealth';

function scoreGrit(row){
  const rev=[0,2,4,5];const scores=[];
  for(let i=0;i<10;i++){const r=parseFloat(row[4+i]);if(isNaN(r))continue;scores.push(rev.includes(i)?6-r:r);}
  if(!scores.length)return null;
  return Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*100)/100;
}


function setupSheet(){
  const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
  let t=ss.getSheetByName('Applicants');if(!t)t=ss.insertSheet('Applicants');
  if(t.getLastRow()===0){
    t.appendRow(['ID','Name','Email','Phone','Position','Source','Date Received','Requires EMM','Stage','Overall Status',
      'DISC Type','DISC Pass','DISC Notes','GRIT Score','GRIT Outcome',
      'Values Score','Values Conf','Values Int','Values Outcome',
      'EMM Overall%','EMM Category%','EMM Action%','EMM Pass','EMM Graded At',
      'Interview Result','Decision Notes','Resume Notes','Created At',
      'Interview Full JSON','EMM Full JSON','Emails Sent JSON',
      'CV URL','CV File ID','CV File Name','CV Uploaded At','GRIT Perseverance','GRIT Consistency','Entered By','EMM Received At','Department','EMM File URL',
      'Offer Details JSON','Status Changed At',
      'Emails Opened JSON','Interview Slots JSON','Scheduling Token','Candidate Slot Picks JSON','Candidate Contact','Availability Submitted At','Confirmed Slot JSON','Confirmed At','SMS Sent At','Assessment Views JSON',
      'Candidate Stage','Next Action','Role Category','Closed Reason','Candidate Stage Dates JSON','Calendar Event ID']);
    t.getRange(1,1,1,59).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
    t.setFrozenRows(1);
  }
  return 'Setup complete';
}

function scoreGritSub(row, idxs, reverse){
  const scores=[];
  idxs.forEach(i=>{const r=parseFloat(row[4+i]);if(isNaN(r))return;scores.push(reverse?6-r:r);});
  if(!scores.length)return null;
  return Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*100)/100;
}
// One way to read a form's responses: the latest row whose email column(s)
// match wins; mapRow turns it into a result (or null).
function lookupFormResponse_(sheet, emailCols, email, mapRow){
  var norm = String(email||'').trim().toLowerCase();
  if(!sheet || !norm) return null;
  var data = sheet.getDataRange().getValues();
  for(var i=data.length-1; i>=1; i--){
    var row = data[i];
    for(var c=0; c<emailCols.length; c++){
      if(String(row[emailCols[c]]||'').trim().toLowerCase()===norm) return mapRow(row);
    }
  }
  return null;
}
function emmSubmissionFromRow_(row){
  var fileCell = String(row[4]||'').trim();
  if(!fileCell) return null;
  // the form caps uploads at one file, but be defensive
  return {name:row[2]||'', email:row[3]||row[1]||'', fileUrl:fileCell.split(',')[0].trim(), timestamp:String(row[0]||'')};
}
function lookupGrit(email){
  try{
    return lookupFormResponse_(SpreadsheetApp.openById(GRIT_SHEET_ID).getSheets()[0], [1], email, function(row){
      return {score:scoreGrit(row), perseverance:scoreGritSub(row,[1,3,6,7,8,9],false), consistency:scoreGritSub(row,[0,2,4,5],true), name:row[2], timestamp:String(row[0])};
    });
  }catch(e){ return {error:e.message}; }
}

function lookupValues(email){
  try{
    var sheet = SpreadsheetApp.openById(VALUES_SHEET_ID).getSheetByName('Auto Scores');
    if(!sheet) return {error:'Auto Scores sheet not found'};
    return lookupFormResponse_(sheet, [1], email, function(row){
      return {total:row[4], confScore:row[14], intScore:row[16], name:row[2], timestamp:String(row[0])};
    });
  }catch(e){ return {error:e.message}; }
}

function lookupEmmSubmission(email){
  try{
    return lookupFormResponse_(SpreadsheetApp.openById(EMM_FORM_SHEET_ID).getSheets()[0], [1,3], email, emmSubmissionFromRow_);
  }catch(e){ return {error:e.message}; }
}

// ============================================================
// UNMATCHED EMM SUBMISSIONS -- catches candidates who submitted the EMM
// Google Form using a different email than the one on file for them (a
// typo, a personal email instead of the one HR entered, etc). Because
// lookupEmmSubmission() above only ever matches on exact email, a mismatch
// like this means the submission silently never gets connected to that
// applicant's record -- it just keeps looking like "not yet submitted."
// This scans every response the form has ever received (not just recent
// ones), so it also surfaces anything that was missed before this check
// existed -- the raw responses have always been sitting in the Sheet, we
// just never checked them against the full applicant list for a mismatch.
function getUnmatchedEmmSubmissions(){
  try{
    const formSheet=SpreadsheetApp.openById(EMM_FORM_SHEET_ID).getSheets()[0];
    const formData=formSheet.getDataRange().getValues();
    const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
    const t=ss.getSheetByName('Applicants');
    const appData=t?t.getDataRange().getValues():[];
    const knownEmails={};
    for(let i=1;i<appData.length;i++){
      const email=String(appData[i][2]||'').trim().toLowerCase();
      if(email) knownEmails[email]=true;
    }
    const unmatched=[];
    for(let i=1;i<formData.length;i++){
      const row=formData[i];
      const sub=emmSubmissionFromRow_(row);
      if(!sub) continue; // no file attached to this response -- nothing to grade or match
      const email1=String(row[1]||'').trim().toLowerCase();
      const email3=String(row[3]||'').trim().toLowerCase();
      const isMatched=(email1&&knownEmails[email1])||(email3&&knownEmails[email3]);
      if(!isMatched) unmatched.push(sub);
    }
    return {success:true, unmatched:unmatched};
  }catch(e){
    return {success:false, error:e.message};
  }
}

// setupSheet() only writes headers on a brand-new, empty sheet -- it never
// retrofits new columns onto a sheet that already has data (which is every
// real sheet in production). This adds the 5 new V3 columns' headers if
// they aren't there yet, safe to call every time (no-op once already done).
function ensureCandidateStageColumns(){
  const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
  const t=ss.getSheetByName('Applicants');
  if(!t) return;
  const headerRow=t.getRange(1,1,1,Math.max(t.getLastColumn(),58)).getValues()[0];
  if(!headerRow[53]){
    t.getRange(1,54,1,5).setValues([['Candidate Stage','Next Action','Role Category','Closed Reason','Candidate Stage Dates JSON']]);
    t.getRange(1,54,1,5).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  }
}

// Read-modify-write of a whole row: hold the script lock so two saves (or a
// save and the compliance job) can't interleave and drop each other's edits.
function saveApplicant(d){
  const lock = LockService.getScriptLock();
  if(!lock.tryLock(20000)) return {success:false, error:'The sheet is busy. Please try again in a moment.'};
  try{ return saveApplicantLocked_(d); } finally { lock.releaseLock(); }
}

function saveApplicantLocked_(d){
  const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
  let t=ss.getSheetByName('Applicants');if(!t){setupSheet();t=ss.getSheetByName('Applicants');}
  const rows=t.getDataRange().getValues();
  const idx=rows.findIndex((r,i)=>i>0&&String(r[0])===String(d.id));
  const existing = idx>0 ? rows[idx] : null;
  // Cap catWrong so a very poor EMM result can't produce a cell too large for Sheets to store
  let emmForSync=d.emm||null;
  if(emmForSync&&emmForSync.catWrong&&emmForSync.catWrong.length>300){
    emmForSync={...emmForSync,catWrong:emmForSync.catWrong.slice(0,300),catWrongTruncated:true};
  }
  // Old stage names are mapped to current ones; anything unrecognised keeps
  // the stored stage instead of writing a value no screen can show.
  let stageIn=canonicalStage_(d.candidateStage);
  if(stageIn && CANDIDATE_STAGES.indexOf(stageIn)<0) stageIn = existing ? canonicalStage_(existing[53]) : '';
  const row=[d.id,d.name,d.email,d.phone||'',d.position||'',d.source||'',d.dateReceived||'',
    d.requiresEmm?'Yes':'No',d.stage||1,d.overallStatus||'In Progress',
    d.disc?.type||'',d.disc?.pass===true?'Yes':d.disc?.pass===false?'No':'',d.disc?.notes||'',
    d.grit?.score||'',d.grit?.score?getGritLabel(parseFloat(d.grit.score)):'',
    d.values?.score||'',d.values?.confScore||'',d.values?.intScore||'',
    d.values?.score?getValuesLabel(parseFloat(d.values.score),parseFloat(d.values.confScore||0),parseFloat(d.values.intScore||0)):'',
    d.emm?.overallPct||'',d.emm?.catPct||'',d.emm?.actPct||'',
    d.emm?.pass===true?'PASS':d.emm?.pass===false?'FAIL':'',d.emm?.gradedAt||'',
    d.interview?.recommendation||'',d.decisionNotes||'',d.resumeNotes||'',d.createdAt||new Date().toISOString(),
    d.interview?JSON.stringify(d.interview):'',emmForSync?JSON.stringify(emmForSync):'',
    d.emailsSent?JSON.stringify(d.emailsSent):'',
    d.cvUrl||'',d.cvFileId||'',d.cvFileName||'',d.cvUploadedAt||'',d.grit?.perseverance||'',d.grit?.consistency||'',d.enteredBy||'',d.emmReceivedAt||'',d.department||'',d.emmFileUrl||'',
    d.offerDetails?JSON.stringify(d.offerDetails):'',d.statusChangedAt||'',
    // Columns 43+ hold data that only our own server-side actions ever write
    // (an email-open pixel hit, a candidate's public scheduling-page
    // submission, or a confirmed interview slot). The client never has an
    // up-to-date copy of these, so always keep whatever is already in the
    // Sheet instead of letting an unrelated save (e.g. editing a note)
    // blank them out. Interview Slots / Scheduling Token live here too --
    // saveInterviewSlots() is the only thing that writes them.
    existing?(existing[43]||''):'',
    existing?(existing[44]||''):'',
    existing?(existing[45]||''):'',
    existing?(existing[46]||''):'',
    existing?(existing[47]||''):'',
    existing?(existing[48]||''):'',
    existing?(existing[49]||''):'',
    existing?(existing[50]||''):'',
    // Column 52 used to hold a Calendar Event ID back when this synced to
    // Google Calendar -- now repurposed for "SMS Sent At", HR's manual
    // one-click confirmation that they texted the candidate. This one IS
    // client-set (same pattern as Emails Sent), since it's just a simple
    // checkbox-style action, not something a server action computes.
    d.smsSentAt||'',
    // Column 53 ("Assessment Views JSON") is server-only, same reasoning as
    // columns 43-50 above -- only recordAssessmentView() (triggered when a
    // candidate actually clicks a tracked assessment link) ever writes it.
    existing?(existing[52]||''):'',
    // Columns 54-56 (Candidate Stage / Next Action / Role Category) are
    // plain client-set fields -- HR picks them from dropdowns, same as
    // Department. Column 57 (Closed Reason) likewise.
    stageIn, d.nextAction||'', d.roleCategory||'', d.closedReason||'',
    // Column 58 (Candidate Stage Dates JSON) is the one exception: it's
    // computed here server-side, not client-set, so it stays reliable no
    // matter which device/browser changed the stage. We diff the incoming
    // stage against whatever was already stored and only stamp a new
    // timestamp the moment the stage actually changes -- this is what
    // "average days in stage" is computed from later.
    (function(){
      let dates={};
      if(existing && existing[57]){ try{ dates=canonicalStageDates_(JSON.parse(existing[57])); }catch(e){} }
      const oldStage = existing ? canonicalStage_(existing[53]) : '';
      const newStage = stageIn;
      if(newStage && newStage!==oldStage){
        if(d._undoStage){
          // Undoing a stage change: forget the date stamped for the stage being
          // left, and keep the restored stage's original date.
          delete dates[oldStage];
          if(!dates[newStage]) dates[newStage]=new Date().toISOString();
        } else {
          dates[newStage]=new Date().toISOString();
        }
      }
      return JSON.stringify(dates);
    })(),
    // Column 59 (Calendar Event ID) is server-only, written by confirmInterview
    // when it adds the interview to David's calendar -- same reasoning as columns 43-50.
    existing?(existing[58]||''):''
  ];
  if(existing) applyColumnOwnership_(row, existing, d);
  if(idx>0)t.getRange(idx+1,1,1,row.length).setValues([row]);else t.appendRow(row);
  return{success:true};
}

// Who owns each Applicants column, for columns the client sends but a server
// job also writes. The client always sends its whole (possibly stale) copy of
// the record; without these rules a save made from an old copy silently undid
// the compliance job's work.
// Columns the compliance job attaches (GRIT/Values scores, EMM receipt), keyed
// by the record field that carries them. A blank value from a client that
// didn't touch that field means "stale copy", so the stored value is kept.
const JOB_ATTACHED_COLUMNS = {13:'grit',35:'grit',36:'grit',15:'values',16:'values',17:'values',38:'emmReceivedAt',40:'emmFileUrl'};
// Numeric stage (retired: the named Candidate Stage is the only position), DISC
// (retired), Interview Result (unused). New rows still get a 1 in the stage column.
const FROZEN_COLUMNS = [8,10,11,12,24];
function isBlankCell_(v){ return v===''||v===null||v===undefined; }
// New clients send _changed: the record fields they actually edited since the
// Sheet last confirmed the record. Older clients don't, and keep the old behavior.
function applyColumnOwnership_(row, existing, d){
  var changed = Array.isArray(d._changed) ? d._changed : null;
  var touched = function(field){ return changed ? changed.indexOf(field)>=0 : false; };
  Object.keys(JOB_ATTACHED_COLUMNS).forEach(function(k){
    var c = Number(k);
    if(isBlankCell_(row[c]) && !touched(JOB_ATTACHED_COLUMNS[k])) row[c] = existing[c];
  });
  FROZEN_COLUMNS.forEach(function(c){ row[c] = existing[c]; });
  // Outcome labels always follow the (possibly kept) scores.
  row[14] = isBlankCell_(row[13]) ? '' : getGritLabel(parseFloat(row[13]));
  row[18] = isBlankCell_(row[15]) ? '' : getValuesLabel(parseFloat(row[15]), parseFloat(row[16]||0), parseFloat(row[17]||0));
  // emailsSent: the client's copy wins (so "undo mark as sent" deletions
  // stick), but the job's own autoReminder stamp is kept -- losing it made
  // the job send the reminder again.
  var stored = {};
  try{ stored = existing[30] ? JSON.parse(existing[30]) : {}; }catch(e){ stored = {}; }
  var sent = d.emailsSent ? JSON.parse(JSON.stringify(d.emailsSent)) : {};
  if(stored.autoReminder) sent.autoReminder = stored.autoReminder;
  row[30] = Object.keys(sent).length ? JSON.stringify(sent) : '';
  // overallStatus: a client that didn't change it must not overwrite a newer
  // status set by the job or another person.
  if(changed && !touched('overallStatus')) row[9] = existing[9];
  return row;
}

function getAllApplicants(){
  const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
  const t=ss.getSheetByName('Applicants');if(!t)return[];
  const data=t.getDataRange().getValues();if(data.length<=1)return[];
  return data.slice(1)
    .filter(r=>String(r[0]).trim()!==''&&String(r[1]).trim()!=='')
    .map(applicantFromRow_);
}

// One Sheet row -> the record shape the app uses.
function applicantFromRow_(r){
    let interview={recommendation:r[24]||''};
    if(r[28]){ try{ interview=JSON.parse(r[28]); }catch(e){} }
    let emm={graded:!!r[23]||(r[19]!==''&&r[19]!==null&&r[19]!==undefined),overallPct:(r[19]===''||r[19]===null||r[19]===undefined)?null:r[19],catPct:r[20]||null,actPct:r[21]||null,
      pass:r[22]==='PASS'?true:r[22]==='FAIL'?false:null,gradedAt:r[23]||''};
    // Columns 19-23 are the authoritative grade fields -- they're what
    // checkAssessmentCompliance()/restoreCompliantApplicants() read too. Only pull
    // extra descriptive detail (notes/fullResult/catWrong) from the col 29 JSON blob;
    // never let a stale blob resurrect a "not graded" state the flat columns disagree with.
    if(r[29]){
      try{
        const parsed=JSON.parse(r[29]);
        emm.notes=parsed.notes||'';
        emm.fullResult=parsed.fullResult||'';
        if(parsed.catWrong) emm.catWrong=parsed.catWrong;
        if(parsed.catWrongTruncated) emm.catWrongTruncated=parsed.catWrongTruncated;
      }catch(e){}
    }
    let emailsSent={};
    if(r[30]){ try{ emailsSent=JSON.parse(r[30]); }catch(e){} }
    let offerDetails={};
    if(r[41]){ try{ offerDetails=JSON.parse(r[41]); }catch(e){} }
    let emailsOpened={};
    if(r[43]){ try{ emailsOpened=JSON.parse(r[43]); }catch(e){} }
    let interviewSlots=[];
    if(r[44]){ try{ interviewSlots=JSON.parse(r[44]); }catch(e){} }
    let candidateSlotPicks=[];
    if(r[46]){ try{ candidateSlotPicks=JSON.parse(r[46]); }catch(e){} }
    let confirmedSlot=null;
    if(r[49]){ try{ confirmedSlot=JSON.parse(r[49]); }catch(e){} }
    let assessmentViews={};
    if(r[52]){ try{ assessmentViews=JSON.parse(r[52]); }catch(e){} }
    let candidateStageDates={};
    if(r[57]){ try{ candidateStageDates=canonicalStageDates_(JSON.parse(r[57])); }catch(e){} }
    return{
      id:r[0],name:r[1],email:r[2],phone:r[3],position:r[4],source:r[5],dateReceived:r[6],
      requiresEmm:emmExpected_(r, emailsSent),stage:parseInt(r[8])||1,overallStatus:r[9],
      grit:{score:r[13]||'',perseverance:r[35]||'',consistency:r[36]||'',label:r[14]||''},
      enteredBy:r[37]||'',
      values:{score:r[15]||'',confScore:r[16]||'',intScore:r[17]||'',label:r[18]||''},
      emm:emm,
      interview:interview,decisionNotes:r[25]||'',
      resumeNotes:r[26]||'',createdAt:r[27]||'',
      emailsSent:emailsSent,
      cvUrl:r[31]||'',cvFileId:r[32]||'',cvFileName:r[33]||'',cvUploadedAt:r[34]||'',
      emmReceivedAt:r[38]||'',department:r[39]||'',emmFileUrl:r[40]||'',
      offerDetails:offerDetails,statusChangedAt:r[42]||'',
      emailsOpened:emailsOpened,
      interviewSlots:interviewSlots,schedulingToken:r[45]||'',
      candidateSlotPicks:candidateSlotPicks,candidateContact:r[47]||'',availabilitySubmittedAt:r[48]||'',
      confirmedSlot:confirmedSlot,confirmedAt:r[50]||'',smsSentAt:r[51]||'',
      assessmentViews:assessmentViews,
      candidateStage:canonicalStage_(r[53]),nextAction:r[54]||'',roleCategory:r[55]||'',closedReason:r[56]||'',
      candidateStageDates:candidateStageDates,calendarEventId:r[58]||''
    };
}

// ============================================================
// STAGE MODEL V3 MIGRATION -- one-time move from pl_a_stageN/pl_b_stageN +
// Overall Status onto the single Candidate Stage field. This only ever
// reads the SIMPLE, deterministic columns (numeric Stage, Department,
// Overall Status, and whether GRIT/Values scores are present) -- it
// deliberately does NOT try to reproduce the old frontend's pass/fail
// scoring logic, because getting that subtly wrong would silently
// mis-migrate people. Anything genuinely ambiguous collapses into
// "Assessment Review," which is the one bucket HR should sanity-check
// after migrating (the preview below shows exactly how many land there).
function deriveNewStageForRow(r){
  const overallStatus = r[9]||'In Progress';
  if(overallStatus==='Hired') return 'Hired';
  // Departed = was hired, then resigned/contract ended. Stage-wise they
  // completed the pipeline, so they map to 'Hired' here; "are they still with
  // us" lives in Overall Status, not the stage field.
  if(overallStatus==='Departed') return 'Hired';
  if(overallStatus==='Rejected') return 'Closed - Rejected';
  // NonCompliant and Hold are NOT terminal in the new model -- they keep
  // whatever active stage they're actually at, and become visible instead
  // as an overdue/needs-follow-up flag (computed elsewhere from timestamps),
  // rather than a separate archived status bucket.
  const dept = String(r[39]||'');
  // Matches the frontend's own isTrackB(a) exactly: Track B is only ever
  // department === 'Sales and Marketing'; everything else (Operations,
  // blank, Finance/HR/IT/Other) defaults to the Track A pipeline, same as
  // the live app already does today.
  const isTrackA = dept!=='Sales and Marketing';
  const stage = parseInt(r[8])||1;
  const hasGrit = r[13]!==''&&r[13]!==null&&r[13]!==undefined;
  const hasValues = r[15]!==''&&r[15]!==null&&r[15]!==undefined;
  const answersIn = hasGrit && hasValues;
  // Track A (Operations/AP-AR): HR runs the Preliminary round informally
  // between stage 1 and 2, Operations Manager runs Initial (stage 4-5),
  // Client runs Final (folded into "Send to Client" -> stage 6-7 today,
  // since the old model never separated "sent" from "interviewed").
  if(isTrackA){
    if(stage<=1) return 'New Application';
    if(stage===2) return 'Preliminary Interview';
    if(stage===3) return answersIn ? 'Assessment Review' : 'Waiting for Assessment';
    if(stage===4||stage===5) return 'Initial Interview'; // Operations Manager
    if(stage===6) return 'Endorsed to Client';
    if(stage>=7) return 'Waiting for Client Decision';
  } else {
    // Track B (Sales & Marketing / other roles): HR runs Preliminary
    // (stage 3-4), the Project Manager runs Initial (stage 5), the CEO
    // runs Final (stage 6).
    if(stage<=1) return 'New Application';
    if(stage===2) return answersIn ? 'Assessment Review' : 'Waiting for Assessment';
    if(stage===3||stage===4) return 'Preliminary Interview'; // HR
    if(stage===5) return 'Initial Interview'; // Frances specifically
    if(stage>=6) return 'Final Interview'; // CEO
  }
  return 'New Application';
}

// Best-effort only -- HR should review and correct after migrating. Leaves
// it blank rather than guess wrong when the position text doesn't clearly
// match one of the seed roles.
function suggestRoleForPosition(position){
  const p=String(position||'').toLowerCase();
  if(p.indexOf('ar ')>=0 || p.indexOf('accounts receivable')>=0 || /\bar\b/.test(p)) return 'AR Specialist';
  if(p.indexOf('ap ')>=0 || p.indexOf('accounts payable')>=0 || /\bap\b/.test(p)) return 'AP Specialist';
  if(p.indexOf('refund')>=0) return 'Refunds Specialist';
  if(p.indexOf('fp&a')>=0 || p.indexOf('fpa')>=0 || p.indexOf('financial plan')>=0) return 'FP&A Specialist';
  return '';
}

function buildMigrationPlanRows(){
  ensureCandidateStageColumns();
  const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
  const t=ss.getSheetByName('Applicants');
  if(!t) return [];
  const data=t.getDataRange().getValues();
  const plan=[];
  for(let i=1;i<data.length;i++){
    const r=data[i];
    if(!r[0]) continue;
    if(r[9]==='Deleted') continue; // soft-deleted/test rows -- never give these a Candidate Stage
    const alreadyMigrated = !!r[53]; // Candidate Stage already set -- skip, don't clobber manual edits
    if(alreadyMigrated) continue;
    const newStage=deriveNewStageForRow(r);
    const suggestedRole=suggestRoleForPosition(r[4]);
    plan.push({
      rowIndex:i+1, id:r[0], name:r[1],
      oldPlStage:parseInt(r[8])||1, oldDepartment:r[39]||'', oldOverallStatus:r[9]||'In Progress',
      newStage:newStage, newNextAction:DEFAULT_NEXT_ACTION_BY_STAGE[newStage]||'None',
      suggestedRole:suggestedRole, createdAt:r[27]||''
    });
  }
  return plan;
}

// Dry run -- no writes. Returns counts per new stage plus per suggested
// role, so HR can sanity-check the mapping against real data before
// anything actually changes.
function previewStageMigrationV3(){
  try{
    const plan=buildMigrationPlanRows();
    const countsByStage={};
    const countsByRole={};
    CANDIDATE_STAGES.forEach(function(s){ countsByStage[s]=0; });
    plan.forEach(function(p){
      countsByStage[p.newStage]=(countsByStage[p.newStage]||0)+1;
      const roleKey=p.suggestedRole||'(unassigned -- needs manual review)';
      countsByRole[roleKey]=(countsByRole[roleKey]||0)+1;
    });
    return {success:true, totalToMigrate:plan.length, countsByStage:countsByStage, countsByRole:countsByRole,
      sample:plan.slice(0,20).map(function(p){ return {name:p.name, oldPlStage:p.oldPlStage, oldDepartment:p.oldDepartment, oldOverallStatus:p.oldOverallStatus, newStage:p.newStage, newNextAction:p.newNextAction, suggestedRole:p.suggestedRole}; })};
  }catch(e){
    return {success:false, error:e.message};
  }
}

// Applies the same plan the preview shows. Safe to re-run: only touches
// rows where Candidate Stage is still blank, so it never overwrites a stage
// someone has already set (manually or from a prior partial run).
function migrateStageModelV3(){
  try{
    ensureCandidateStageColumns();
    const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
    const t=ss.getSheetByName('Applicants');
    if(!t) return {success:false, error:'Applicants sheet not found'};
    const plan=buildMigrationPlanRows();
    plan.forEach(function(p){
      t.getRange(p.rowIndex,54,1,3).setValues([[p.newStage, p.newNextAction, p.suggestedRole]]);
      // Deliberately NOT new Date() here. The old model never tracked a
      // per-stage entry date, so for most stages we have no real historical
      // timestamp to write -- stamping "now" would make Today's Progress on
      // the Executive Dashboard show these as having moved today, when they
      // actually reached that stage days/weeks/months ago; they're just
      // getting labeled today. "New Application" is the one exception: the
      // existing Created At value IS the true, accurate date they reached
      // it, so that one gets backfilled for real. Every other stage is left
      // with no stage-date entry at all -- honestly "unknown" instead of a
      // fabricated "today". avg-days-in-stage/overdue for these will show
      // as unknown until the candidate's stage is next changed for real.
      var stageDates = {};
      if(p.newStage==='New Application' && p.createdAt){
        stageDates[p.newStage] = p.createdAt;
      }
      t.getRange(p.rowIndex,58).setValue(JSON.stringify(stageDates));
    });
    return {success:true, migrated:plan.length};
  }catch(e){
    return {success:false, error:e.message};
  }
}

// ============================================================
// STAGE MODEL V4 MIGRATION -- much smaller than the V3 migration above:
// V4 only renames/folds three V3 stage values, it doesn't rebuild the stage
// model from scratch. Same preview-before-apply discipline as every other
// migration in this file -- nothing changes until Apply is clicked, and the
// preview shows exactly which candidates and how many are affected.
// ============================================================
// ============================================================
// ONE-TIME NORMALIZE (lean-out release). Brings every row onto the current
// stage list and makes stage and status agree:
//  - old stage names and stage-date keys -> current names (earliest date kept)
//  - no stage at all -> derived from the old numeric stage, like the V3 tool
//  - status Rejected with an active stage -> 'Closed - Rejected'
//  - status Hired/Departed with another stage -> 'Hired'
//  - a closed stage whose status is still In Progress/Hold -> the matching status
// Deleted rows are left alone. Preview first; apply backs up the tab, writes
// only cells that change, and running it again changes nothing.
// ============================================================
function buildNormalizePlan_(rows){
  var plan = [];
  for(var i=1;i<rows.length;i++){
    var r = rows[i];
    if(!r[0]) continue;
    var status = r[9] || 'In Progress';
    if(status==='Deleted') continue;
    var stageFrom = r[53] || '';
    var stage = canonicalStage_(stageFrom);
    if(!stage) stage = canonicalStage_(deriveNewStageForRow(r));
    if(CANDIDATE_STAGES.indexOf(stage)<0) stage = canonicalStage_(deriveNewStageForRow(r));
    if(status==='Rejected' && CLOSED_STAGES.indexOf(stage)<0) stage = 'Closed - Rejected';
    if((status==='Hired'||status==='Departed') && stage!=='Hired') stage = 'Hired';
    var statusTo = status;
    if(stage==='Hired' && (status==='In Progress'||status==='Hold')) statusTo = 'Hired';
    if((stage==='Closed - Rejected'||stage==='Closed - Withdrawn') && (status==='In Progress'||status==='Hold')) statusTo = 'Rejected';
    var datesFrom = r[57] || '';
    var datesTo = datesFrom;
    try{ if(datesFrom) datesTo = JSON.stringify(canonicalStageDates_(JSON.parse(datesFrom))); }catch(e){ datesTo = datesFrom; }
    if(stage!==stageFrom || statusTo!==status || datesTo!==datesFrom){
      plan.push({row:i, id:r[0], name:r[1], stageFrom:stageFrom, stageTo:stage, statusFrom:status, statusTo:statusTo, datesFrom:datesFrom, datesTo:datesTo});
    }
  }
  return plan;
}

function previewNormalize(){
  try{
    var t = SpreadsheetApp.openById(MASTER_SHEET_ID).getSheetByName('Applicants');
    var plan = buildNormalizePlan_(t.getDataRange().getValues());
    var counts = {};
    plan.forEach(function(p){
      var k = (p.stageFrom||'(blank)')+' / '+p.statusFrom+'  ->  '+p.stageTo+' / '+p.statusTo;
      counts[k] = (counts[k]||0)+1;
    });
    return {success:true, total:plan.length, counts:counts, sample:plan.slice(0,25).map(function(p){ return {id:p.id, name:p.name, stage:p.stageFrom+' -> '+p.stageTo, status:p.statusFrom+' -> '+p.statusTo, datesChanged:p.datesFrom!==p.datesTo}; })};
  }catch(e){ return {success:false, error:e.message}; }
}

function applyNormalize(){
  var lock = LockService.getScriptLock();
  if(!lock.tryLock(30000)) return {success:false, error:'The sheet is busy. Try again in a moment.'};
  try{
    var ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
    var t = ss.getSheetByName('Applicants');
    var plan = buildNormalizePlan_(t.getDataRange().getValues());
    if(!plan.length) return {success:true, changed:0};
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
    t.copyTo(ss).setName('Applicants_backup_'+stamp);
    plan.forEach(function(p){
      if(p.stageTo!==p.stageFrom) t.getRange(p.row+1, 54).setValue(p.stageTo);
      if(p.statusTo!==p.statusFrom) t.getRange(p.row+1, 10).setValue(p.statusTo);
      if(p.datesTo!==p.datesFrom) t.getRange(p.row+1, 58).setValue(p.datesTo);
    });
    return {success:true, changed:plan.length, backup:'Applicants_backup_'+stamp};
  }catch(e){ return {success:false, error:e.message}; }
  finally{ lock.releaseLock(); }
}

function buildStageV4RenameMap(){
  // 'Final Interview' folds into 'Endorsed to Client' -- there's no
  // remaining stage for candidates who were sitting in the old
  // 'Final Interview' value, so they land back in 'Endorsed to Client'
  // (client/CEO interview is now understood to happen during that period).
  return STAGE_ALIASES;
}
// What Next Action V3 would have defaulted to for each OLD stage name --
// used below to detect "HR never touched this since it was auto-set" so we
// only refresh Next Action when it's safe to, never overwriting a value HR
// deliberately chose.
function oldV3DefaultNextActionForStage(oldStage){
  return {'Preliminary Interview':'Schedule Preliminary Interview','Final Interview':'Schedule Final Interview','Job Offer':'Send Job Offer'}[oldStage];
}
function previewStageModelV4(){
  try{
    const renameMap=buildStageV4RenameMap();
    const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
    const t=ss.getSheetByName('Applicants');
    if(!t) return {success:false, error:'Applicants sheet not found'};
    const data=t.getDataRange().getValues();
    const plan=[];
    for(let i=1;i<data.length;i++){
      const row=data[i];
      const currentStage=String(row[53]||'').trim();
      if(!renameMap[currentStage]) continue;
      plan.push({rowIndex:i+1, id:row[0], name:row[1], oldStage:currentStage, newStage:renameMap[currentStage]});
    }
    const countsByOldStage={};
    plan.forEach(function(p){ countsByOldStage[p.oldStage]=(countsByOldStage[p.oldStage]||0)+1; });
    return {success:true, totalToMigrate:plan.length, countsByOldStage:countsByOldStage,
      sample:plan.slice(0,20).map(function(p){ return {name:p.name, oldStage:p.oldStage, newStage:p.newStage}; })};
  }catch(e){
    return {success:false, error:e.message};
  }
}
function migrateStageModelV4(){
  try{
    const renameMap=buildStageV4RenameMap();
    const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
    const t=ss.getSheetByName('Applicants');
    if(!t) return {success:false, error:'Applicants sheet not found'};
    const data=t.getDataRange().getValues();
    let migrated=0;
    for(let i=1;i<data.length;i++){
      const row=data[i];
      const rowNum=i+1;
      const currentStage=String(row[53]||'').trim();
      let changedThisRow=false;
      if(renameMap[currentStage]){
        const newStage=renameMap[currentStage];
        t.getRange(rowNum,54).setValue(newStage);
        const currentNextAction=String(row[54]||'').trim();
        if(currentNextAction===oldV3DefaultNextActionForStage(currentStage)){
          t.getRange(rowNum,55).setValue(DEFAULT_NEXT_ACTION_BY_STAGE[newStage]||currentNextAction);
        }
        changedThisRow=true;
      }
      // Rename any matching keys inside Candidate Stage Dates JSON too, so
      // historical per-stage timestamps stay attached to the right label
      // instead of silently orphaning under a stage name that no longer exists.
      const rawDates=row[57];
      if(rawDates){
        try{
          const dates=JSON.parse(rawDates);
          let datesChanged=false;
          Object.keys(renameMap).forEach(function(oldKey){
            if(dates[oldKey]===undefined) return;
            const newKey=renameMap[oldKey];
            if(dates[newKey]===undefined) dates[newKey]=dates[oldKey]; // never discard real history
            delete dates[oldKey];
            datesChanged=true;
          });
          if(datesChanged){ t.getRange(rowNum,58).setValue(JSON.stringify(dates)); changedThisRow=true; }
        }catch(e){ /* malformed JSON on this one row -- skip it, don't fail the whole migration */ }
      }
      if(changedThisRow) migrated++;
    }
    return {success:true, migrated:migrated};
  }catch(e){
    return {success:false, error:e.message};
  }
}

// ============================================================
// FIX MIGRATION TIMESTAMPS -- one-time cleanup for anyone who already ran
// migrateStageModelV3() before this fix existed, which stamped "now" as the
// stage-entry date for every migrated row. That made the Executive
// Dashboard's Today's Progress count old, pre-existing candidates as if
// they'd moved stage today, inflating the numbers shown to leadership.
// This only touches rows that look exactly like that artifact: the
// Candidate Stage Dates JSON has exactly one entry, it matches the
// candidate's current stage, it's dated today, AND the candidate's actual
// Created At date is NOT today (a real same-day applicant is left alone --
// their "moved today" reading is genuine). Same dry-run-first pattern as the
// original migration.
// ============================================================
function buildMigrationDateFixPlan(){
  const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
  const t=ss.getSheetByName('Applicants');
  if(!t) return [];
  const data=t.getDataRange().getValues();
  const now=new Date();
  function isTodayIso(iso){
    if(!iso) return false;
    const d=new Date(iso);
    if(isNaN(d.getTime())) return false;
    return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate();
  }
  const plan=[];
  for(let i=1;i<data.length;i++){
    const r=data[i];
    if(!r[0]) continue;
    const stage=canonicalStage_(r[53]);
    if(!stage) continue; // never migrated -- nothing to fix
    const createdAt=r[27]||'';
    let dates={};
    try{ dates = r[57] ? JSON.parse(r[57]) : {}; }catch(e){ dates = {}; }
    const keys=Object.keys(dates);
    const looksFabricated = keys.length===1 && keys[0]===stage && isTodayIso(dates[stage]) && !isTodayIso(createdAt);
    if(!looksFabricated) continue;
    const fixedDates = (stage==='New Application' && createdAt) ? { 'New Application': createdAt } : {};
    plan.push({ rowIndex:i+1, id:r[0], name:r[1], stage:stage, oldDate:dates[stage], newDate:fixedDates[stage]||null, createdAt:createdAt });
  }
  return plan;
}

function previewMigrationDateFix(){
  try{
    const plan=buildMigrationDateFixPlan();
    return {success:true, totalToFix:plan.length,
      sample:plan.slice(0,20).map(function(p){ return {name:p.name, stage:p.stage, oldDate:p.oldDate, newDate:p.newDate, createdAt:p.createdAt}; })};
  }catch(e){
    return {success:false, error:e.message};
  }
}

function applyMigrationDateFix(){
  try{
    const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
    const t=ss.getSheetByName('Applicants');
    if(!t) return {success:false, error:'Applicants sheet not found'};
    const plan=buildMigrationDateFixPlan();
    plan.forEach(function(p){
      const fixedDates = p.newDate ? (function(){ const o={}; o[p.stage]=p.newDate; return o; })() : {};
      t.getRange(p.rowIndex,58).setValue(JSON.stringify(fixedDates));
    });
    return {success:true, fixed:plan.length};
  }catch(e){
    return {success:false, error:e.message};
  }
}

// ============================================================
// ROLE HEALTH -- 🟢/🟡/🔴 per role, for the Executive Dashboard. Auto-
// calculated from the same aggregation as the rest of the dashboard, but
// always overridable by the PM: an override is stored separately (its own
// sheet) so the UI can show both the system's read AND the PM's actual
// call, clearly labeled as a "PM override" rather than pretending the
// override IS the automatic calculation.
// ============================================================
function ensureRoleHealthSheet(){
  const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
  let t=ss.getSheetByName(ROLE_HEALTH_SHEET_NAME);
  if(!t){
    t=ss.insertSheet(ROLE_HEALTH_SHEET_NAME);
    t.appendRow(['Role','Override Status','Override Reason','Set By','Set At','PM Note']);
    t.getRange(1,1,1,6).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
    t.setFrozenRows(1);
  } else if(t.getLastColumn()<6){
    // Retrofit the PM Note column onto a sheet created before it existed.
    t.getRange(1,6).setValue('PM Note');
    t.getRange(1,6).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  }
  return t;
}

function getRoleHealthOverrides(){
  const t=ensureRoleHealthSheet();
  const data=t.getDataRange().getValues();
  const out={};
  for(let i=1;i<data.length;i++){
    const r=data[i];
    if(!r[0]) continue;
    // A PM Note can exist even with no health override -- always surface it,
    // separately from whether status/reason are set.
    if(r[1] || r[5]) out[r[0]]={status:r[1]||'', reason:r[2]||'', setBy:r[3]||'', setAt:r[4]||'', pmNote:r[5]||''};
  }
  return out;
}

// status: 'green'|'yellow'|'red', or '' to CLEAR an existing override and
// go back to the automatic calculation. pmNote is independent of status --
// you can leave a note without overriding the color, or vice versa.
function setRoleHealthOverride(role, status, reason, setBy, pmNote){
  try{
    const t=ensureRoleHealthSheet();
    const data=t.getDataRange().getValues();
    let rowIdx=-1;
    for(let i=1;i<data.length;i++){ if(data[i][0]===role){ rowIdx=i+1; break; } }
    const existing = rowIdx>0 ? data[rowIdx-1] : null;
    // undefined means "leave this field as-is" (e.g. only updating the PM
    // Note); an explicit '' means "clear it". Only fields the caller actually
    // passed get changed -- this lets a note-only update leave the health
    // override untouched, and vice versa.
    const existingStatus = existing ? (existing[1]||'') : '';
    const existingReason = existing ? (existing[2]||'') : '';
    const existingNote = existing ? (existing[5]||'') : '';
    const rowVals=[
      role,
      status!==undefined?status:existingStatus,
      reason!==undefined?reason:existingReason,
      setBy||'',
      new Date().toISOString(),
      pmNote!==undefined?pmNote:existingNote
    ];
    if(rowIdx>0) t.getRange(rowIdx,1,1,6).setValues([rowVals]);
    else t.appendRow(rowVals);
    return {success:true};
  }catch(e){
    return {success:false, error:e.message};
  }
}

// Deliberately simple, transparent rules -- always paired with a plain-
// English reason so nobody has to trust a black box. The "exactly one
// active candidate" rule is hard-coded regardless of anything else, same
// as the FP&A example this was designed around.
function computeAutoHealthForRole(bucket){
  if(bucket.activeCandidates===0) return {status:'red', reason:'No active candidates in the pipeline.'};
  if(bucket.activeCandidates===1) return {status:'yellow', reason:'Only one active candidate in the pipeline.'};
  if(bucket.overdueReminders.length>0) return {status:'yellow', reason:bucket.overdueReminders.length+' candidate(s) past the expected time in their current stage.'};
  return {status:'green', reason:'Healthy pipeline.'};
}

// ============================================================
// PER-ROLE DASHBOARD AGGREGATION -- the single function both the Dashboard
// and the Executive EOD are built on. HR only ever sets Candidate Stage +
// Next Action by hand (see Candidate Stage Model V3 above); everything
// here is calculated FROM that, never the other way around.
// ============================================================
// Maps CANDIDATE_STAGES to the plain-English "Today's Progress" metric
// names from the Executive Dashboard spec. Kept generic ("Initial
// Interviews", not "Operations Interviews" or "PM Interviews") because this
// map is role-agnostic aggregate copy, not a per-candidate label -- a single
// count here can span both departments at once. Where a specific
// candidate's round needs a specific department-aware label instead, use
// getInterviewRoundLabel() above.
const TODAYS_PROGRESS_STAGE_LABELS = {
  'New Application':'New Applications', 'CV Screening':'CVs Screened',
  'HR Preliminary Interview':'HR Preliminary Interviews', 'Assessment Sent':'Assessments Sent',
  'Assessment Review':'Assessments Completed', 'Initial Interview':'Initial Interviews',
  'Operations Decision':'Operations Decisions', 'Endorsed to Client':'Endorsed to Client',
  'Offer':'Offers'
};

function isToday(iso){
  if(!iso) return false;
  const d=new Date(iso), now=new Date();
  return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate();
}

function getRoleDashboardData(){
  try{
    // "Deleted" is a soft-delete status the app already hides everywhere on
    // the frontend (getApplicants() filters it out) -- but this backend
    // report reads getAllApplicants() directly, so without this same filter
    // a deleted/test record could still show up on the Executive Dashboard.
    const apps=getAllApplicants().filter(function(a){ return a.overallStatus!=='Deleted'; });
    const now=new Date();
    const byRole={};
    function ensureRole(role){
      if(!byRole[role]) byRole[role]={
        role:role, activeCandidates:0, stageCounts:{}, candidates:[],
        needingFollowUp:[], overdueReminders:[], todaysProgress:{}, closedToday:{Rejected:0,Withdrawn:0,Hired:0},
        _stageDaysSum:{}, _stageDaysCount:{}, _nextActionTally:{}
      };
      return byRole[role];
    }
    // A candidate can be finished without their STAGE saying so. Rejected,
    // Doesn't Respond and No Longer With Us deliberately keep whatever stage
    // the person last reached (see deriveNewStageForRow) -- the outcome lives
    // in Overall Status instead. So deciding "is this person still active?"
    // from the stage alone counts every ghosted candidate as active forever,
    // and because they keep aging past their stage SLA they also sit in
    // overdueReminders forever, which pins the role's health to amber
    // permanently. Health then stops meaning anything, which is the whole
    // point of the indicator. Judge it on both fields.
    const FINISHED_STATUSES=['Hired','Rejected','NonCompliant','Departed'];
    apps.forEach(function(a){
      const role=a.roleCategory || '(Unassigned)';
      const stage=a.candidateStage || '(Not set)';
      const bucket=ensureRole(role);
      const isClosed=CLOSED_STAGES.indexOf(stage)>=0 || FINISHED_STATUSES.indexOf(a.overallStatus)>=0;
      // On Hold is different from finished: the person is still ours and we
      // mean to come back to them, so they keep counting as active. But the
      // pause was deliberate, so their clock stops -- they must not trigger
      // an overdue flag or drag the role's average days-in-stage upward.
      const isPaused=a.overallStatus==='Hold';
      if(!isClosed) bucket.activeCandidates++;
      bucket.stageCounts[stage]=(bucket.stageCounts[stage]||0)+1;

      const dates=a.candidateStageDates||{};
      const enteredAt=dates[stage];
      const daysInStage=enteredAt ? Math.round(((now-new Date(enteredAt))/86400000)*10)/10 : null;
      if(!isClosed && !isPaused && daysInStage!==null){
        bucket._stageDaysSum[stage]=(bucket._stageDaysSum[stage]||0)+daysInStage;
        bucket._stageDaysCount[stage]=(bucket._stageDaysCount[stage]||0)+1;
      }

      const slaDays=STAGE_SLA_DAYS[stage];
      const isOverdue=!isClosed && !isPaused && daysInStage!==null && slaDays!==undefined && daysInStage>slaDays;

      const summary={id:a.id, name:a.name, stage:stage, nextAction:a.nextAction||'', daysInStage:daysInStage};
      bucket.candidates.push(summary);

      if(!isClosed){
        if(FOLLOW_UP_ACTIONS.indexOf(a.nextAction)>=0) bucket.needingFollowUp.push(summary);
        if(isOverdue) bucket.overdueReminders.push(Object.assign({slaDays:slaDays}, summary));
        if(a.nextAction) bucket._nextActionTally[a.nextAction]=(bucket._nextActionTally[a.nextAction]||0)+1;
      }

      // Today's Progress -- count every stage this candidate entered TODAY,
      // not just their current one, so a candidate who moved through
      // several stages today (e.g. screened AND interviewed same day)
      // correctly shows up in each relevant count.
      Object.keys(dates).forEach(function(stageName){
        if(!isToday(dates[stageName])) return;
        const label=TODAYS_PROGRESS_STAGE_LABELS[stageName];
        if(label) bucket.todaysProgress[label]=(bucket.todaysProgress[label]||0)+1;
        if(stageName==='Closed - Rejected') bucket.closedToday.Rejected++;
        if(stageName==='Closed - Withdrawn') bucket.closedToday.Withdrawn++;
        if(stageName==='Hired') bucket.closedToday.Hired++;
      });
    });

    const overrides=getRoleHealthOverrides();
    Object.keys(byRole).forEach(function(role){
      const b=byRole[role];
      b.avgDaysInStage={};
      Object.keys(b._stageDaysSum).forEach(function(stage){
        b.avgDaysInStage[stage]=Math.round((b._stageDaysSum[stage]/b._stageDaysCount[stage])*10)/10;
      });
      delete b._stageDaysSum; delete b._stageDaysCount;

      // Auto-derived "Next Action" summary for the role as a whole -- the
      // 3 most common next actions among its active candidates, so
      // whoever's reading the EOD sees "what to do" without opening every
      // record. This is separate from any per-candidate Next Action.
      b.nextActionSummary=Object.keys(b._nextActionTally)
        .map(function(action){ return {action:action, count:b._nextActionTally[action]}; })
        .sort(function(x,y){ return y.count-x.count; })
        .slice(0,3);
      delete b._nextActionTally;

      // Auto-derived blockers -- overdue candidates grouped by stage, so
      // "3 candidates stuck at Initial Interview" reads as one line instead
      // of three separate reminders.
      const overdueByStage={};
      b.overdueReminders.forEach(function(c){
        if(!overdueByStage[c.stage]) overdueByStage[c.stage]={count:0, daysSum:0};
        overdueByStage[c.stage].count++;
        overdueByStage[c.stage].daysSum+=(c.daysInStage||0);
      });
      b.blockers=Object.keys(overdueByStage).map(function(stage){
        const o=overdueByStage[stage];
        const avg=Math.round((o.daysSum/o.count)*10)/10;
        return o.count+' candidate(s) stuck at '+stage+' (avg '+avg+' days)';
      });

      const auto=computeAutoHealthForRole(b);
      b.autoHealth=auto;
      const ov=overrides[role];
      if(ov && ov.status){
        b.health={status:ov.status, reason:ov.reason, source:'PM override', setBy:ov.setBy, setAt:ov.setAt};
      } else {
        b.health=Object.assign({source:'auto'}, auto);
      }
      // PM Note is shown as its own field in the UI, not folded into
      // blockers -- it might just be context, not necessarily a blocker.
      b.pmNote=(ov && ov.pmNote) || '';
    });

    return {success:true, roles:byRole};
  }catch(e){
    return {success:false, error:e.message};
  }
}

function getGritLabel(s){if(s>=4)return'HIGH GRIT';if(s>=3)return'MODERATE GRIT';return'LOW GRIT';}
function getValuesLabel(s,c,i){
  if((c>0&&c<=2)||(i>0&&i<=2))return'NOT RECOMMENDED';
  var pct=s/315*100; // VALUES_MAX_SCORE=315 -- keep in sync with Values sheet's scoreValuesRow()
  if(pct>=70)return'STRONG FIT';
  if(pct>=40)return'POTENTIAL FIT';
  return'NOT RECOMMENDED';
}

function getOrCreateCVFolder(){
  const folderName=CV_FOLDER_NAME;
  const folders=DriveApp.getFoldersByName(folderName);
  if(folders.hasNext())return folders.next();
  return DriveApp.createFolder(folderName);
}

function uploadCV(d){
  try{
    const folder=getOrCreateCVFolder();
    const bytes=Utilities.base64Decode(d.data);
    const blob=Utilities.newBlob(bytes,d.mimeType||'application/octet-stream',d.filename||'resume');
    const file=folder.createFile(blob);
    file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK,DriveApp.Permission.VIEW);
    return{success:true,url:file.getUrl(),fileId:file.getId(),filename:d.filename||file.getName()};
  }catch(e){
    return{success:false,error:e.message};
  }
}

// ============================================================
// OFFBOARDING / CLEARANCE TRACKING
// Requested by Andrealiz Uy (per Slack) -- track resignation/contract-end
// clearance so nothing falls through the cracks. Per Frances: manual entry
// only (no auto-pull from any HR system), and "reach out to Ethel" stays a
// manual step HR does themselves -- the app just reminds, it never emails
// Ethel automatically. Checklist items are taken directly from "Clearance
// Forms AB BSS.docx" and "Resignation Clearance Process AB BSS.docx".
// ============================================================
var OFFBOARD_CHECKLIST_EMPLOYEE=[
  'Resignation letter received; last working day confirmed with supervisor/HR',
  'Clearance Form issued to employee',
  'Turnover of pending tasks / knowledge transfer completed',
  'Laptop / equipment returned; system, email, and application access disabled (IT)',
  'Company ID, access card, and keys returned (Admin)',
  'Cash advances, loans, and unliquidated expenses settled (Finance)',
  'Company property/assets accounted for (Finance)',
  'Exit interview conducted (HR)',
  'Company documents, manuals, and confidential files returned (HR)',
  'Reach out to Ethel re: final pay computation',
  'Quitclaim and Release signed',
  'Final pay released (within 30 days of last day, per DOLE Labor Advisory 06-20)',
  'Certificate of Employment (COE) and BIR Form 2316 issued'
];
var OFFBOARD_CHECKLIST_CONTRACTOR=[
  'Notice of contract termination received; end date and wind-down plan confirmed',
  'Turnover of deliverables and work-in-progress files',
  'System / platform access credentials returned or disabled',
  'Company-issued equipment or resources returned (if applicable)',
  'Outstanding invoices reconciled',
  'Advances or accountabilities settled',
  'Reach out to Ethel re: final invoice review/approval',
  'Quitclaim and Release signed',
  'Final payment released',
  'Certificate of Engagement/Completion issued (upon request)'
];
function getOffboardChecklistTemplate(track){
  return track==='contractor'?OFFBOARD_CHECKLIST_CONTRACTOR:OFFBOARD_CHECKLIST_EMPLOYEE;
}
// ============================================================
// ERROR REPORTS -- app-wide crash capture + user-submitted problem reports
// land here so the team has one place to see what broke, for whom, and
// when, instead of relying on someone remembering to screenshot a console.
// ============================================================
function setupErrorReportsSheet(){
  const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
  let t=ss.getSheetByName('Error Reports');if(!t)t=ss.insertSheet('Error Reports');
  if(t.getLastRow()===0){
    t.appendRow(['Reported At','Source','User Note','Error Message','Stack Trace','Page','Role','URL','User Agent']);
    t.getRange(1,1,1,9).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
    t.setFrozenRows(1);
  }
  return t;
}
function reportError(d){
  const t=setupErrorReportsSheet();
  t.appendRow([
    new Date().toISOString(), d.source||'', d.userNote||'', d.message||'', d.stack||'',
    d.page||'', d.role||'', d.url||'', d.userAgent||''
  ]);
  return {success:true};
}
function setupOffboardingSheet(){
  const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
  let t=ss.getSheetByName('Offboarding');if(!t)t=ss.insertSheet('Offboarding');
  if(t.getLastRow()===0){
    t.appendRow(['ID','Name','Track','Position','Department','Date Hired / Engagement Start',
      'Resignation / Notice Date','Last Working Day','Supervisor / Project Lead',
      'Checklist JSON','Status','Notes','Created At','Completed At']);
    t.getRange(1,1,1,14).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
    t.setFrozenRows(1);
  }
  return t;
}
function saveOffboarding(d){
  const t=setupOffboardingSheet();
  const rows=t.getDataRange().getValues();
  const idx=rows.findIndex((r,i)=>i>0&&String(r[0])===String(d.id));
  let checklist=d.checklist;
  if(!checklist){
    // Brand-new case -- seed the checklist from the track's template so the
    // frontend always has one item per line to check off, in order.
    checklist={};
    getOffboardChecklistTemplate(d.track).forEach(item=>{checklist[item]=false;});
  }
  const allDone=Object.keys(checklist).length>0 && Object.values(checklist).every(v=>v===true);
  const existing=idx>0?rows[idx]:null;
  const row=[
    d.id, d.name||'', d.track||'employee', d.position||'', d.department||'',
    d.dateHired||'', d.noticeDate||'', d.lastWorkingDay||'', d.supervisor||'',
    JSON.stringify(checklist),
    allDone?'Completed':'In Progress',
    d.notes||'',
    existing?(existing[12]||new Date().toISOString()):new Date().toISOString(),
    allDone?(existing&&existing[13]?existing[13]:new Date().toISOString()):''
  ];
  if(idx>0)t.getRange(idx+1,1,1,row.length).setValues([row]);else t.appendRow(row);
  return{success:true};
}
function deleteOffboarding(id){
  const t=setupOffboardingSheet();
  const rows=t.getDataRange().getValues();
  const idx=rows.findIndex((r,i)=>i>0&&String(r[0])===String(id));
  if(idx>0)t.deleteRow(idx+1);
  return{success:true};
}
function getAllOffboarding(){
  const t=setupOffboardingSheet();
  const data=t.getDataRange().getValues();if(data.length<=1)return[];
  return data.slice(1)
    .filter(r=>String(r[0]).trim()!=='')
    .map(r=>{
      let checklist={};
      try{ checklist=JSON.parse(r[9]||'{}'); }catch(e){}
      return{
        id:r[0], name:r[1], track:r[2], position:r[3], department:r[4],
        dateHired:r[5], noticeDate:r[6], lastWorkingDay:r[7], supervisor:r[8],
        checklist:checklist, status:r[10], notes:r[11], createdAt:r[12], completedAt:r[13]
      };
    });
}

function doGet(e){
  // trackOpen (tracking-pixel image) and pickSlot (candidate scheduling page)
  // return non-JSON responses (binary image / HTML), so they must bypass
  // the JSON-wrap block entirely.
  const a0=e.parameter.action;
  if(a0==='trackOpen') return trackEmailOpen(e.parameter.id, e.parameter.t);
  if(a0==='pickSlot') return renderSchedulingPage(e.parameter.id, e.parameter.token);
  if(a0==='viewAssessment') return handleViewAssessment(e.parameter.id, e.parameter.which);
  try{
    const a=e.parameter.action;let out={};
    if(a==='setup')out={success:true,message:setupSheet()};
    else if(a==='previewNormalize')out=previewNormalize();
    else if(a==='getAll')out={success:true,data:getAllApplicants(),config:{deadlineHours:ASSESSMENT_DEADLINE_HOURS,reminderHours:ASSESSMENT_REMINDER_HOURS,reminderTemplate:REMINDER_TEMPLATE},minClientVersion:MIN_CLIENT_VERSION,roleHealth:getRoleHealthOverrides()};
    else if(a==='lookupGrit')out={success:true,data:lookupGrit(e.parameter.email)};
    else if(a==='lookupValues')out={success:true,data:lookupValues(e.parameter.email)};
    else if(a==='lookupEmm')out={success:true,data:lookupEmmSubmission(e.parameter.email)};
    else if(a==='getDavidBusy')out=getDavidBusyBlocks(e.parameter.start, e.parameter.end);
    else if(a==='getUnmatchedEmm')out=getUnmatchedEmmSubmissions();
    else if(a==='previewStageMigrationV3')out=previewStageMigrationV3();
    else if(a==='previewStageModelV4')out=previewStageModelV4();
    else if(a==='previewMigrationDateFix')out=previewMigrationDateFix();
    else if(a==='getRoleDashboard')out=getRoleDashboardData();
    else if(a==='getAllOffboarding')out={success:true,data:getAllOffboarding()};
    else out={success:false,error:'Unknown: '+a};
    return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
  }catch(err){return ContentService.createTextOutput(JSON.stringify({success:false,error:err.message})).setMimeType(ContentService.MimeType.JSON);}
}

function doPost(e){
  // The candidate scheduling page submits a plain HTML <form> (not JSON),
  // so it arrives as e.parameter.formAction rather than JSON postData.
  // Check for that first and return HTML, bypassing the JSON-wrap block.
  if(e.parameter && e.parameter.formAction==='submitAvailability'){
    return handleSubmitAvailability(e);
  }
  try{
    const p=JSON.parse(e.postData.contents);let out={};
    if(p.action==='saveApplicant')out=saveApplicant(p.data);
    else if(p.action==='applyNormalize')out=applyNormalize();
    else if(p.action==='refreshAssessments')out=refreshAssessments(p.data);
    else if(p.action==='uploadCV')out=uploadCV(p.data);
    else if(p.action==='sendEmail')out=sendApplicantEmail(p.data);
    else if(p.action==='fetchDriveFile')out=fetchDriveFile(p.data.fileId);
    else if(p.action==='confirmInterview')out=confirmInterview(p.data);
    else if(p.action==='unconfirmInterview')out=unconfirmInterview(p.data);
    else if(p.action==='removeInterviewSlot')out=removeInterviewSlot(p.data);
    else if(p.action==='saveInterviewSlots')out=saveInterviewSlots(p.data);
    else if(p.action==='recordAvailability')out={success:recordAvailability(p.data.id, p.data.token, p.data.picks, p.data.contact)};
    else if(p.action==='runStageMigrationV3')out=migrateStageModelV3();
    else if(p.action==='runStageModelV4')out=migrateStageModelV4();
    else if(p.action==='applyMigrationDateFix')out=applyMigrationDateFix();
    else if(p.action==='setRoleHealthOverride')out=setRoleHealthOverride(p.data.role, p.data.status, p.data.reason, p.data.setBy, p.data.pmNote);
    else if(p.action==='saveOffboarding')out=saveOffboarding(p.data);
    else if(p.action==='deleteOffboarding')out=deleteOffboarding(p.data.id);
    else if(p.action==='reportError')out=reportError(p.data);
    else out={success:false,error:'Unknown: '+p.action};
    return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
  }catch(err){return ContentService.createTextOutput(JSON.stringify({success:false,error:err.message})).setMimeType(ContentService.MimeType.JSON);}
}

function addEmmReceivedColumn(){
  const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
  const t=ss.getSheetByName('Applicants');
  if(!t) return 'Applicants sheet not found';
  const lastCol=t.getLastColumn();
  const header=t.getRange(1,1,1,lastCol).getValues()[0];
  if(header.indexOf('EMM Received At')===-1){
    t.getRange(1,lastCol+1).setValue('EMM Received At');
    Logger.log('Added EMM Received At at column '+(lastCol+1));
    return 'Added EMM Received At at column '+(lastCol+1);
  }
  Logger.log('EMM Received At column already present at column '+(header.indexOf('EMM Received At')+1));
  return 'EMM Received At column already present';
}

function addDepartmentColumn(){
  const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
  const t=ss.getSheetByName('Applicants');
  if(!t) return 'Applicants sheet not found';
  const lastCol=t.getLastColumn();
  const header=t.getRange(1,1,1,lastCol).getValues()[0];
  if(header.indexOf('Department')===-1){
    t.getRange(1,lastCol+1).setValue('Department');
    Logger.log('Added Department at column '+(lastCol+1));
    return 'Added Department at column '+(lastCol+1);
  }
  return 'Department column already present at column '+(header.indexOf('Department')+1);
}

function addEmmFileUrlColumn(){
  const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
  const t=ss.getSheetByName('Applicants');
  if(!t) return 'Applicants sheet not found';
  const lastCol=t.getLastColumn();
  const header=t.getRange(1,1,1,lastCol).getValues()[0];
  if(header.indexOf('EMM File URL')===-1){
    t.getRange(1,lastCol+1).setValue('EMM File URL');
    Logger.log('Added EMM File URL at column '+(lastCol+1));
    return 'Added EMM File URL at column '+(lastCol+1);
  }
  return 'EMM File URL column already present at column '+(header.indexOf('EMM File URL')+1);
}

function fetchDriveFile(fileId){
  try{
    if(!fileId) return {success:false, error:'Missing fileId.'};
    const file=DriveApp.getFileById(fileId);
    const blob=file.getBlob();
    return {success:true, base64:Utilities.base64Encode(blob.getBytes()), filename:file.getName(), mimeType:blob.getContentType()};
  }catch(e){
    return {success:false, error:e.message};
  }
}

function migrateToFourStagePipeline(){
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('stageMigrationV1Done')==='true') return 'Migration already run \u2014 skipping.';
  const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
  const t=ss.getSheetByName('Applicants');
  if(!t) return 'Applicants sheet not found';
  const header=t.getRange(1,1,1,t.getLastColumn()).getValues()[0];
  const stageCol=header.indexOf('Stage')+1;
  if(stageCol<1) return 'Stage column not found';
  const lastRow=t.getLastRow();
  if(lastRow<2){ props.setProperty('stageMigrationV1Done','true'); return 'No data rows.'; }
  const range=t.getRange(2,stageCol,lastRow-1,1);
  const vals=range.getValues();
  let changed=0;
  for(let i=0;i<vals.length;i++){
    const old=parseInt(vals[i][0])||1;
    const next = old<=3 ? 1 : (old-2);
    if(next!==old){ vals[i][0]=next; changed++; }
  }
  range.setValues(vals);
  props.setProperty('stageMigrationV1Done','true');
  Logger.log('Stage migration complete. Rows updated: '+changed);
  return 'Stage migration complete. Rows updated: '+changed;
}

var DEFAULT_REPLY_TO = 'frances.miranda@ab-businesssupport.com';
var TEAM_DIRECTORY = {
  'Frances Miranda': 'frances.miranda@ab-businesssupport.com',
  'Wennielyn Pungasi': 'wennielyn.pungasi@ab-businesssupport.com',
  'David Latimer': 'operations@ab-businesssupport.com'
};

function sendApplicantEmail(data){
  if(!data || !data.to) return {success:false, error:'Missing recipient email address.'};
  try{
    var replyTo = (data.replyTo && String(data.replyTo).trim()) || DEFAULT_REPLY_TO;
    // Gmail always sends AS whichever Google account authorized this script
    // (that can't be changed per-send -- it's a Google Workspace/Apps Script
    // constraint, not something this code controls). What CAN be fixed is
    // the display name: without it, every email shows the bare authorized
    // address with no name at all, so picking "Wen" in the Sent By dropdown
    // looked like it did nothing. Setting the name option makes Gmail show
    // "Wennielyn Pungasi <actual-address>" instead -- combined with the
    // reply-to above, this is as close to "sent as Wen" as Apps Script
    // allows without Wen deploying and authorizing her own copy of this
    // script under her own Google account.
    var options = {replyTo: replyTo, name: (data.senderName && String(data.senderName).trim()) || 'ABBSS HR Team'};
    if(data.attachmentBase64){
      var blob = Utilities.newBlob(
        Utilities.base64Decode(data.attachmentBase64),
        data.attachmentMimeType || 'application/octet-stream',
        data.attachmentName || 'attachment'
      );
      options.attachments = [blob];
    }
    var plainBody = data.body || '';
    // Best-effort open tracking: wrap the plain-text body as simple HTML and
    // append an invisible 1x1 pixel that pings us back when (if) it loads.
    // Many inboxes (especially Gmail) block or pre-fetch remote images, so
    // this can under- or over-report -- treat it as a rough signal only,
    // never as proof someone did or didn't read the email.
    if(data.applicantId && data.templateKey){
      // IMPORTANT: '=' must be entity-escaped (as &#61;) anywhere it can end up
      // immediately followed by digits (e.g. inside "id=1785935280570" links).
      // Gmail's outbound quoted-printable encoder misreads a literal "=" next
      // to two hex-looking characters as an already-encoded "=XY" QP escape and
      // silently corrupts it to a single control byte -- this was breaking
      // every assessment link and tracking pixel in the HTML email (plain-text
      // was unaffected, which is why some candidates could open the email but
      // the link inside it went nowhere). Encoding '=' as an HTML entity here
      // means the raw HTML bytes never contain that literal "=XY" pattern, so
      // the encoder has nothing to misfire on; browsers decode &#61; back to
      // "=" normally when rendering/following the link.
      var escapedBody = plainBody.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/=/g,'&#61;').replace(/\n/g,'<br>');
      var pixelUrl = PUBLIC_WEBAPP_URL + '?action=trackOpen&id=' + encodeURIComponent(data.applicantId) + '&t=' + encodeURIComponent(data.templateKey);
      var safePixelUrl = pixelUrl.replace(/=/g,'&#61;');
      options.htmlBody = escapedBody + '<img src="' + safePixelUrl + '" width="1" height="1" style="display:none" alt="">';
      // SAFETY NET: the only literal "=" characters that should ever remain in
      // the finished HTML are the four we hard-code ourselves right above
      // (width=, height=, style=, src=), and none of those are followed by two
      // hex-looking characters -- they're followed by a quote mark. If this
      // check ever finds a bare "=XY" pattern anyway (a future edit
      // reintroducing a raw link/id into the HTML, a new merge field, etc.),
      // that email would silently corrupt candidate-facing links exactly like
      // this bug did. So refuse to send rather than risk it -- loud failure
      // here beats a silent broken link landing in a candidate's inbox.
      if(/=[0-9a-fA-F]{2}/.test(options.htmlBody)){
        return {success:false, error:'Blocked unsafe email: HTML body contains an unescaped "=" next to characters that Gmail\'s quoted-printable encoder can misread and corrupt (the exact bug that broke assessment links before). Check sendApplicantEmail for a new unescaped link/merge field before resending.'};
      }
    }
    sendMail_(data.to, data.subject||'', plainBody, options);
    return {success:true};
  }catch(e){
    return {success:false, error:e.message};
  }
}

// ============================================================
// EMAIL-OPEN TRACKING (best-effort -- see caveats above)
// ============================================================
function trackEmailOpen(id, tKey){
  try{ logEmailOpen(id, tKey); }catch(e){ /* never let tracking break the pixel response */ }
  var gifB64 = 'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  return Utilities.newBlob(Utilities.base64Decode(gifB64), 'image/gif', 'pixel.gif');
}

function logEmailOpen(id, tKey){
  if(!id || !tKey) return;
  const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
  const t=ss.getSheetByName('Applicants');
  if(!t) return;
  const rows=t.getDataRange().getValues();
  const idx=rows.findIndex(function(r,i){ return i>0 && String(r[0])===String(id); });
  if(idx<=0) return;
  var opened={};
  try{ opened = rows[idx][43] ? JSON.parse(rows[idx][43]) : {}; }catch(e){}
  // Only record the FIRST open per template -- repeat image loads (some
  // clients re-fetch on every scroll/reopen) shouldn't overwrite the
  // original timestamp.
  if(!opened[tKey]) opened[tKey] = new Date().toISOString();
  t.getRange(idx+1, 44).setValue(JSON.stringify(opened));
}

// ============================================================
// ASSESSMENT-LINK VIEW TRACKING (best-effort, same idea as the email-open
// pixel above, but for "did they actually open the GRIT/Values/EMM form" --
// a separate question from "did they open the email" or "did they submit
// it"). Google Forms can't report views on their own, so every assessment
// link in an email now points here first: this records a first-viewed
// timestamp, then immediately forwards the candidate on to the real form.
// If anything about the recording fails, the candidate must still reach
// the form -- tracking is never allowed to block them.
// ============================================================
var ASSESSMENT_LINK_TARGETS = {grit: GRIT_FORM_LINK, values: VALUES_FORM_LINK, emm: EMM_RESPONDER_LINK};

function assessmentLinkFor(scriptUrl, id, which){
  return scriptUrl + '?action=viewAssessment&id=' + encodeURIComponent(id) + '&which=' + encodeURIComponent(which);
}

function recordAssessmentView(id, which){
  if(!id || !which) return;
  const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
  const t=ss.getSheetByName('Applicants');
  if(!t) return;
  const rows=t.getDataRange().getValues();
  const idx=rows.findIndex(function(r,i){ return i>0 && String(r[0])===String(id); });
  if(idx<=0) return;
  var views={};
  try{ views = rows[idx][52] ? JSON.parse(rows[idx][52]) : {}; }catch(e){}
  // First view only, same reasoning as logEmailOpen -- a candidate re-opening
  // the link later (e.g. to double check something) shouldn't overwrite when
  // they FIRST looked at it.
  if(!views[which]) views[which] = new Date().toISOString();
  t.getRange(idx+1, 53).setValue(JSON.stringify(views));
}

// ============================================================
// DAVID'S GOOGLE CALENDAR -- READ-ONLY CROSS-CHECK. This is deliberately
// busy/free only -- it never reads or exposes event titles/descriptions,
// even though David's sharing permission may technically allow more detail.
// It only tells the Interview Calendar "something is already booked here,"
// not what that something is. (Confirmed interviews ARE written to his
// calendar -- see the WRITE section below -- but this read never returns
// any event details.)
//
// Setup required (one-time, does not touch this file):
// 1. David shares HIS Google Calendar with this script's own Google
//    account (view permission, e.g. "See all event details" -- we only
//    ever use the times, never the details).
// 2. Whoever owns/deploys this Apps Script project must manually run any
//    function once from the Apps Script editor (Run button, not just
//    "Deploy") after this code is pasted in, so the one-time Calendar
//    permission prompt appears and can be approved. Skipping this step is
//    exactly what broke the earlier Calendar integration -- deploying a
//    "New version" alone does not trigger that consent screen.
// ============================================================
function getDavidBusyBlocks(startIso, endIso){
  try{
    if(!startIso || !endIso) return {success:false, error:'Missing date range.'};
    var cal = CalendarApp.getCalendarById(DAVID_CALENDAR_ID);
    if(!cal) return {success:false, error:"David's calendar isn't shared with this app yet."};
    var events = cal.getEvents(new Date(startIso), new Date(endIso));
    var blocks = events.map(function(e){
      return {start: e.getStartTime().toISOString(), end: e.getEndTime().toISOString()};
    });
    return {success:true, blocks:blocks};
  }catch(e){
    return {success:false, error:e.message};
  }
}

// ============================================================
// DAVID'S GOOGLE CALENDAR -- WRITE. Creates the confirmed interview directly
// on David's calendar (not the deploying account's), with a Google Meet
// link, and no guests -- so no invitations are sent from anyone's account.
// The call still runs as whoever deployed this script; that account's
// "created by" shows on the event, but the event itself only lives on
// David's calendar.
//
// Setup required (one-time, does not touch this file):
// 1. David shares HIS calendar with the deploying account at "Make changes
//    to events" (the read-only cross-check above only needed "See all
//    event details").
// 2. The Calendar advanced service is enabled for this script
//    (appsscript.json: dependencies.enabledAdvancedServices, userSymbol
//    "Calendar", v3), and the Google Calendar API is enabled in the linked
//    Google Cloud project.
// 3. After pushing, run any function once from the Apps Script editor so
//    any new permission prompt appears and can be approved.
// ============================================================
function writeDavidCalendarInvite(candidateName, position, startDate, endDate, contact){
  assertCalendarWritable_();
  var resource = {
    summary: 'Interview: ' + candidateName + ' — ' + position,
    description: contact ? ('Candidate contact: ' + contact) : '',
    start: {dateTime: startDate.toISOString()},
    end: {dateTime: endDate.toISOString()},
    conferenceData: {createRequest: {requestId: Utilities.getUuid(), conferenceSolutionKey: {type: 'hangoutsMeet'}}}
  };
  var ev = Calendar.Events.insert(resource, DAVID_CALENDAR_ID, {conferenceDataVersion: 1, sendUpdates: 'none'});
  var meetLink = getMeetLink(ev);
  if(!meetLink){
    // Meet creation can briefly report "pending"; one re-read usually has it.
    try{ meetLink = getMeetLink(Calendar.Events.get(DAVID_CALENDAR_ID, ev.id)); }catch(e){}
  }
  return {eventId: ev.id, meetLink: meetLink};
}

// Run by hand from the Apps Script editor (not exposed as a web action) to
// check the deploying account's access to David's calendar. Read-only.
function checkDavidCalendarAccess(){
  var msg;
  try{
    var role = Calendar.CalendarList.get(DAVID_CALENDAR_ID).accessRole;
    var ok = role==='writer' || role==='owner';
    msg = 'Access to ' + DAVID_CALENDAR_ID + ': ' + role + (ok ? ' -- OK, the app can add interviews.' : ' -- NOT enough. Needs "Make changes to events" (writer).');
  }catch(e){
    msg = 'Could not read access to ' + DAVID_CALENDAR_ID + ' from your calendar list: ' + e.message;
    try{
      var cal = Calendar.Calendars.get(DAVID_CALENDAR_ID);
      msg += ' | But the calendar itself is reachable ("' + cal.summary + '"), so it is shared but not added to your calendar list.';
    }catch(e2){
      msg += ' | The calendar itself is not reachable either: ' + e2.message;
    }
  }
  Logger.log(msg);
  try{
    var items = Calendar.CalendarList.list({maxResults: 250}).items || [];
    Logger.log('Calendars this account can see (' + items.length + '):');
    items.forEach(function(c){ Logger.log('  ' + c.accessRole + '  |  ' + c.id + '  |  ' + c.summary); });
  }catch(e3){
    Logger.log('Could not list calendars: ' + e3.message);
  }
  return msg;
}

function getMeetLink(ev){
  if(!ev) return '';
  if(ev.hangoutLink) return ev.hangoutLink;
  var eps = (ev.conferenceData && ev.conferenceData.entryPoints) || [];
  for(var i=0;i<eps.length;i++){ if(eps[i].entryPointType==='video' && eps[i].uri) return eps[i].uri; }
  return '';
}

function cancelDavidCalendarInvite(eventId){
  if(!eventId) return; assertCalendarWritable_();
  try{
    Calendar.Events.remove(DAVID_CALENDAR_ID, eventId, {sendUpdates: 'none'});
  }catch(e){ /* already deleted/missing -- nothing to clean up */ }
}

// Undo/remove on the Interview Calendar must go through these, not the
// generic saveApplicant sync: saveApplicant deliberately keeps the Sheet's
// copy of columns 44-51 (slots, confirmed slot, confirmed-at) and 59 (event
// ID), so a client-side clear would silently come back on the next reload.
function clearConfirmedInterview(t, idx, row){
  cancelDavidCalendarInvite(row[58]);
  t.getRange(idx+1, 50).setValue(''); // Confirmed Slot JSON
  t.getRange(idx+1, 51).setValue(''); // Confirmed At
  t.getRange(idx+1, 52).setValue(''); // SMS Sent At -- stale once unconfirmed
  t.getRange(idx+1, 59).setValue(''); // Calendar Event ID
}

function findApplicantRow(id){
  var t = SpreadsheetApp.openById(MASTER_SHEET_ID).getSheetByName('Applicants');
  if(!t) return {error:'Applicants sheet not found.'};
  var rows = t.getDataRange().getValues();
  var idx = rows.findIndex(function(r,i){ return i>0 && String(r[0])===String(id); });
  if(idx<=0) return {error:'Applicant not found.'};
  return {t:t, idx:idx, row:rows[idx]};
}

function unconfirmInterview(data){
  try{
    if(!data || !data.id) return {success:false, error:'Missing applicant id.'};
    var f = findApplicantRow(data.id);
    if(f.error) return {success:false, error:f.error};
    clearConfirmedInterview(f.t, f.idx, f.row);
    return {success:true};
  }catch(e){
    return {success:false, error:e.message};
  }
}

function removeInterviewSlot(data){
  try{
    if(!data || !data.id || !data.slotId) return {success:false, error:'Missing applicant id or slot.'};
    var f = findApplicantRow(data.id);
    if(f.error) return {success:false, error:f.error};
    var slots = [];
    try{ slots = f.row[44] ? JSON.parse(f.row[44]) : []; }catch(e){}
    slots = slots.filter(function(s){ return String(s.id)!==String(data.slotId); });
    f.t.getRange(f.idx+1, 45).setValue(JSON.stringify(slots)); // Interview Slots JSON
    var confirmed = null;
    try{ confirmed = f.row[49] ? JSON.parse(f.row[49]) : null; }catch(e){}
    if(confirmed && String(confirmed.id)===String(data.slotId)) clearConfirmedInterview(f.t, f.idx, f.row);
    return {success:true};
  }catch(e){
    return {success:false, error:e.message};
  }
}

function handleViewAssessment(id, which){
 try{
  var target = ASSESSMENT_LINK_TARGETS[which];
  if(!target){
    return HtmlService.createHtmlOutput('<div style="font-family:Arial,sans-serif;max-width:480px;margin:60px auto;text-align:center;color:#555"><h2>Link not valid</h2><p>This assessment link is missing information. Please contact HR for a new one.</p></div>');
  }
  try{ recordAssessmentView(id, which); }catch(e){ /* never let tracking block the candidate from reaching the form */ }
  var safeTarget = String(target).replace(/"/g,'&quot;');
  // Apps Script serves HtmlService output inside Google's own nested wrapper
  // frame (the "This application was created by a Google Apps Script user"
  // banner is part of that). Any AUTOMATIC redirect out of it -- meta-refresh
  // or a JS window.top.location assignment -- gets treated as that wrapper
  // trying to load the destination INSIDE a frame, and Google Forms actively
  // refuses to be framed (anti-clickjacking), producing a "refused to
  // connect" page instead of the form. A real click on a normal link is NOT
  // subject to that restriction -- browsers only block a page from loading
  // another page inside itself, not a user-initiated navigation away from
  // the current page. So this page deliberately does NOT auto-redirect; the
  // candidate clicks a real, prominent button instead, every time.
  var html = '<!doctype html><html><head>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '</head>' +
    '<body style="font-family:Arial,sans-serif;max-width:480px;margin:60px auto;text-align:center;color:#555">' +
    '<h2>Your assessment is ready</h2>' +
    '<p>Tap the button below to open it.</p>' +
    '<p style="margin-top:24px"><a href="' + safeTarget + '" target="_top" style="display:inline-block;background:#3b3f8c;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:8px">Open Assessment &rarr;</a></p>' +
    '<p style="margin-top:24px;font-size:13px;color:#888">If the button does not work, copy and paste this link into your browser:<br>' + safeTarget + '</p>' +
    '</body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Assessment Redirect');
 }catch(err){
  // Whatever goes wrong above (bad id/which, a Sheet read failing, anything
  // unforeseen) must NEVER surface as a blank page or a broken-image icon --
  // the candidate always gets a real, readable page with working links to
  // every assessment form so they're never stuck.
  var links = '';
  try{
    links = Object.keys(ASSESSMENT_LINK_TARGETS).map(function(k){
      return '<p><a href="' + ASSESSMENT_LINK_TARGETS[k] + '" target="_top">Open the ' + k.toUpperCase() + ' assessment</a></p>';
    }).join('');
  }catch(e2){}
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;max-width:480px;margin:60px auto;text-align:center;color:#555">' +
    '<h2>Something went wrong loading this link</h2>' +
    '<p>Please contact HR for a new link, or try one of these directly:</p>' + links +
    '</div>'
  ).setTitle('Assessment Redirect');
 }
}

// ============================================================
// CANDIDATE-FACING INTERVIEW SCHEDULING (no login, no knowledge of the
// internal app needed -- just a plain link, same as the assessment forms).
// ============================================================
function escapeHtml(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Candidates used to pick their own interview times from a link. Scheduling
// is now done by phone (HR records the time, David confirms on the Interview
// Calendar), so old links in inboxes, and old pages still open, get this.
const SCHEDULING_BY_PHONE_HTML_ = '<div style="font-family:Arial,sans-serif;max-width:480px;margin:60px auto;text-align:center;color:#555"><h2>Interview scheduling</h2><p>We now schedule interviews by phone. Please contact HR and we will agree on a time with you.</p></div>';
function renderSchedulingPage(id, token){
  return HtmlService.createHtmlOutput(SCHEDULING_BY_PHONE_HTML_);
}

function handleSubmitAvailability(e){
  return HtmlService.createHtmlOutput(SCHEDULING_BY_PHONE_HTML_);
}

function generateSchedulingTokenServer(){
  return 'tok' + new Date().getTime() + '_' + Math.random().toString(36).slice(2,10);
}

// Called from the app when HR/David types in and saves the candidate-facing
// time options. This is fully native to the app/Sheet -- no external
// Calendar involved, so no extra Google permission scopes are ever needed
// for this feature. Each option gets a best-effort parsed date (startIso)
// purely so the in-app Interview Calendar page can sort/group them; if a
// label can't be parsed it still works, it just won't have a sortable date.
function saveInterviewSlots(data){
  try{
    if(!data || !data.id || !data.labels || !data.labels.length) return {success:false, error:'Missing applicant id or time options.'};
    const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
    const t=ss.getSheetByName('Applicants');
    if(!t) return {success:false, error:'Applicants sheet not found.'};
    const rows=t.getDataRange().getValues();
    const idx=rows.findIndex(function(r,i){ return i>0 && String(r[0])===String(data.id); });
    if(idx<=0) return {success:false, error:'Applicant not found.'};

    var newSlots = data.labels.map(function(label, i){
      var slotId = 'slot' + i + '_' + new Date().getTime();
      var startIso = '';
      try{
        var parsed = parseSlotToDate(label);
        if(parsed) startIso = parsed.start.toISOString();
      }catch(e){}
      return {id:slotId, label:label, startIso:startIso};
    });

    var schedulingToken = rows[idx][45] || generateSchedulingTokenServer();
    t.getRange(idx+1, 45).setValue(JSON.stringify(newSlots));  // col 45 = index 44 (Interview Slots JSON)
    t.getRange(idx+1, 46).setValue(schedulingToken);           // col 46 = index 45 (Scheduling Token)
    // HR enters the time the candidate gave on the phone, so every option is
    // theirs (picks), and the number they gave is saved in the same call.
    if(data.contact!==undefined){
      t.getRange(idx+1, 47).setValue(JSON.stringify(newSlots.map(function(sl){ return sl.id; }))); // col 47 = index 46 (Candidate Slot Picks)
      t.getRange(idx+1, 48).setValue(String(data.contact||''));                                     // col 48 = index 47 (Candidate Contact)
    }

    return {success:true, slots:newSlots, schedulingToken:schedulingToken};
  }catch(e){
    return {success:false, error:e.message};
  }
}

function recordAvailability(id, token, picks, contact){
  const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
  const t=ss.getSheetByName('Applicants');
  if(!t) return false;
  const rows=t.getDataRange().getValues();
  const idx=rows.findIndex(function(r,i){ return i>0 && String(r[0])===String(id); });
  if(idx<=0 || !token || String(rows[idx][45])!==String(token)) return false;
  t.getRange(idx+1, 47).setValue(JSON.stringify(picks||[])); // col 47 = index 46
  t.getRange(idx+1, 48).setValue(contact||'');               // col 48 = index 47
  t.getRange(idx+1, 49).setValue(new Date().toISOString());  // col 49 = index 48
  return true;
}

// Finalizes one proposed slot as the confirmed interview time. Adds it to
// David's calendar with a Meet link (best-effort, via
// writeDavidCalendarInvite), then sends the candidate a confirmation email
// that includes the Meet link when one was created. A Calendar failure
// never fails the confirmation itself, same as the email. Texting
// the candidate is a manual step for now (see the Interview Calendar page,
// which surfaces their phone number prominently once confirmed) until an
// SMS provider is set up.
function confirmInterview(data){
  try{
    if(!data || !data.id || !data.slotId) return {success:false, error:'Missing applicant id or slot.'};
    const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
    const t=ss.getSheetByName('Applicants');
    if(!t) return {success:false, error:'Applicants sheet not found.'};
    const rows=t.getDataRange().getValues();
    const idx=rows.findIndex(function(r,i){ return i>0 && String(r[0])===String(data.id); });
    if(idx<=0) return {success:false, error:'Applicant not found.'};
    var slots=[];
    try{ slots = rows[idx][44] ? JSON.parse(rows[idx][44]) : []; }catch(e){}
    var slot = null;
    for(var i=0;i<slots.length;i++){ if(String(slots[i].id)===String(data.slotId)){ slot=slots[i]; break; } }
    if(!slot) return {success:false, error:"That time slot was not found on this applicant's list."};

    // Idempotency guard: if this exact slot is already the confirmed one
    // (e.g. a double-click, or a retry after a network hiccup made the app
    // think the first attempt failed), don't re-send the candidate a
    // duplicate confirmation email -- just report success with what's
    // already on record.
    var existingConfirmed = null;
    try{ existingConfirmed = rows[idx][49] ? JSON.parse(rows[idx][49]) : null; }catch(e){}
    if(existingConfirmed && String(existingConfirmed.id)===String(data.slotId)){
      return {success:true, slotLabel:existingConfirmed.label, alreadyConfirmed:true};
    }

    var name = rows[idx][1] || '';
    var email = rows[idx][2] || '';
    var position = rows[idx][4] || '';

    var contact = data.contact || rows[idx][47] || '';

    // Claim the confirmation first so the idempotency guard above catches a
    // double-click while the calendar call below is still running.
    t.getRange(idx+1, 50).setValue(JSON.stringify(slot));     // col 50 = index 49
    t.getRange(idx+1, 51).setValue(new Date().toISOString()); // col 51 = index 50

    // Calendar before email, so the candidate's email can carry the Meet
    // link. A calendar failure never blocks the confirmation or the email.
    var calendarWarning = '';
    var meetLink = '';
    var confirmedTimeText = slot.label;
    if(data.startIso && data.durationMin){
      var startDate = new Date(data.startIso);
      var endDate = new Date(startDate.getTime() + Number(data.durationMin)*60000);
      confirmedTimeText = Utilities.formatDate(startDate, Session.getScriptTimeZone(), 'EEEE, MMMM d, yyyy, h:mm a');
      try{
        var invite = writeDavidCalendarInvite(name, position, startDate, endDate, contact);
        meetLink = invite.meetLink || '';
        t.getRange(idx+1, 59).setValue(invite.eventId); // col 59 = index 58 (Calendar Event ID -- new column; col 52/index 51 is already SMS Sent At, do not reuse)
        slot.startIso = startDate.toISOString();
        slot.durationMin = Number(data.durationMin);
        slot.meetLink = meetLink;
        t.getRange(idx+1, 50).setValue(JSON.stringify(slot));
      }catch(e){
        t.getRange(idx+1, 59).setValue('');
        calendarWarning = "Interview confirmed, but couldn't add it to David's calendar: " + e.message;
      }
    } else {
      t.getRange(idx+1, 59).setValue('');
    }

    if(email){
      try{
        sendMail_(email, '[ABBSS] Interview Confirmed: ' + position,
          'Dear ' + name + ',\n\nYour interview has been confirmed for:\n' + confirmedTimeText +
          (meetLink ? ('\n\nGoogle Meet link: ' + meetLink) : '') +
          '\n\nWe look forward to speaking with you.\n\nWarm regards,\nHR Team\nABBSS',
          {replyTo: DEFAULT_REPLY_TO, name: 'ABBSS HR Team'});
      }catch(e){ /* don't fail the whole confirmation just because the email didn't send */ }
    }

    var result = {success:true, slotLabel:slot.label, meetLink:meetLink};
    if(calendarWarning) result.calendarWarning = calendarWarning;
    return result;
  }catch(e){
    return {success:false, error:e.message};
  }
}

// Best-effort parser for the free-text slot labels HR types in (e.g. "Mon,
// Aug 10 - 2:00 PM"). Used only to sort/group entries on the in-app Interview
// Calendar page -- if it can't confidently parse a date, the option still
// works fine, it just won't have a specific date to sort by.
function parseSlotToDate(label){
  try{
    var cleaned = String(label).replace(/–|—/g,'-');
    var start = new Date(cleaned.replace(/-\s*/,' '));
    if(isNaN(start.getTime())) return null;
    var end = new Date(start.getTime() + 60*60*1000); // default 1-hour block
    return {start:start, end:end};
  }catch(e){ return null; }
}

function authorizeMailSending(){
  var me = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  sendMail_(me, 'ABBSS Hiring Pipeline - Authorization Test', 'This is a one-time test to authorize automatic email sending (assessment invites, reminders, and the Send Automatically button). You can ignore or delete this message.');
  return 'Authorization test email sent to ' + me + '. Automatic sending should now work.';
}

// Candidates get this long to finish GRIT/Values/EMM after the invite; the
// reminder goes out halfway. Sent to the client in getAll so every screen
// and email uses the same numbers.
const ASSESSMENT_DEADLINE_HOURS = 24;
const ASSESSMENT_REMINDER_HOURS = 12;
// Raise when a release needs open tabs running an older frontend to reload.
const MIN_CLIENT_VERSION = 1;

const COMPLIANCE_SKIP_STATUSES = ['Hired','Rejected','Hold','Deleted','Departed'];
const ASSESSMENT_WAITING_STAGES = ['Assessment Sent'];

// The job reads the whole sheet once, then spends a while on form lookups.
// A person may edit a row in the meantime, so status and emailsSent writes
// re-read the row under the script lock and only apply if it's still safe.
function withScriptLock_(fn){
  var lock = LockService.getScriptLock();
  if(!lock.tryLock(10000)) return false;
  try{ return fn(); } finally { lock.releaseLock(); }
}
function readRow_(t, i){
  return t.getRange(i+1, 1, 1, t.getLastColumn()).getValues()[0];
}
function setStatusIfUnchanged_(t, i, seenRow, newStatus){
  return withScriptLock_(function(){
    var cur = readRow_(t, i);
    if(String(cur[0])!==String(seenRow[0])) return false;            // row moved
    if((cur[9]||'In Progress')!==(seenRow[9]||'In Progress')) return false; // someone changed the status
    if((cur[53]||'')!==(seenRow[53]||'')) return false;              // or the stage
    t.getRange(i+1,10).setValue(newStatus);
    return true;
  }) === true;
}
function mergeEmailsSent_(t, i, patch){
  return withScriptLock_(function(){
    var cur = readRow_(t, i);
    var sent = {};
    try{ sent = cur[30] ? JSON.parse(cur[30]) : {}; }catch(e){ sent = {}; }
    Object.keys(patch).forEach(function(k){ sent[k] = patch[k]; });
    t.getRange(i+1,31).setValue(JSON.stringify(sent));
    return true;
  }) === true;
}

// Everything the candidate owes has arrived: GRIT and Values scores, plus the
// EMM file (received or already graded) when the role needs it. The app's
// assessmentsSubmitted() mirrors this exactly; a test checks they agree.
function assessmentsSubmitted_(hasGrit, hasValues, requiresEmm, emmReceived, emmGraded){
  return !!(hasGrit && hasValues && (!requiresEmm || emmReceived || emmGraded));
}

// The assessment invite HR last sent decides whether an EMM is expected:
// "Assessment Invite" includes it, "Assessment Invite (no EMM)" does not.
// Before any invite, the Requires EMM column (guessed from the job title) applies.
function latestAssessmentInvite_(emailsSent){
  var withEmm = emailsSent && emailsSent.assessment ? new Date(emailsSent.assessment).getTime() : NaN;
  var noEmm = emailsSent && emailsSent.assessment_no_emm ? new Date(emailsSent.assessment_no_emm).getTime() : NaN;
  if(isNaN(withEmm) && isNaN(noEmm)) return null;
  if(isNaN(noEmm) || (!isNaN(withEmm) && withEmm > noEmm)) return {key:'assessment', at:emailsSent.assessment};
  return {key:'assessment_no_emm', at:emailsSent.assessment_no_emm};
}
function emmExpected_(r, emailsSent){
  var invite = latestAssessmentInvite_(emailsSent);
  if(invite) return invite.key === 'assessment';
  return r[7]==='Yes';
}
function parseEmailsSent_(v){
  try{ return v ? JSON.parse(v) : {}; }catch(e){ return {}; }
}

// The one place form results get attached to a candidate row: GRIT/Values
// scores submitted after the invite, the EMM file from the form, and the
// "received" flag for an EMM graded through another path. Used by the
// compliance job for every row and by refreshAssessments for one.
function attachAssessmentsForRow_(t, i, r, now){
  var out = {attached:0, emmDetected:0};
  var emailsSent = {};
  try{ emailsSent = r[30] ? JSON.parse(r[30]) : {}; }catch(e){ emailsSent = {}; }
  var latestInvite = latestAssessmentInvite_(emailsSent);
  var inviteSentAt = latestInvite ? latestInvite.at : '';
  var inviteTime = inviteSentAt ? new Date(inviteSentAt).getTime() : null;
  out.hasGrit = !isBlankCell_(r[13]);
  out.hasValues = !isBlankCell_(r[15]);
  out.requiresEmm = emmExpected_(r, emailsSent);
  out.emmReceived = !!r[38];
  out.emmGraded = !!r[23];
  if(out.requiresEmm && out.emmGraded && !out.emmReceived){
    t.getRange(i+1,39).setValue(r[23]);
    out.emmReceived = true;
  }
  var email = r[2];
  if(email && inviteSentAt && !out.hasGrit){
    try{
      var g = lookupGrit(email);
      if(g && !g.error && g.score!==null && g.score!==undefined){
        var gTime = new Date(g.timestamp).getTime();
        if(isNaN(gTime) || gTime>=inviteTime){
          t.getRange(i+1,14).setValue(g.score);
          t.getRange(i+1,15).setValue(getGritLabel(parseFloat(g.score)));
          if(g.perseverance!==null && g.perseverance!==undefined) t.getRange(i+1,36).setValue(g.perseverance);
          if(g.consistency!==null && g.consistency!==undefined) t.getRange(i+1,37).setValue(g.consistency);
          out.hasGrit = true; out.attached++;
        }
      }
    }catch(e){ Logger.log('GRIT lookup failed for row '+(i+1)+': '+e.message); }
  }
  if(email && inviteSentAt && !out.hasValues){
    try{
      var v = lookupValues(email);
      if(v && !v.error && v.total!==null && v.total!==undefined && v.total!==''){
        var vTime = new Date(v.timestamp).getTime();
        if(isNaN(vTime) || vTime>=inviteTime){
          t.getRange(i+1,16).setValue(v.total);
          t.getRange(i+1,17).setValue(v.confScore||'');
          t.getRange(i+1,18).setValue(v.intScore||'');
          t.getRange(i+1,19).setValue(getValuesLabel(parseFloat(v.total),parseFloat(v.confScore||0),parseFloat(v.intScore||0)));
          out.hasValues = true; out.attached++;
        }
      }
    }catch(e){ Logger.log('Values lookup failed for row '+(i+1)+': '+e.message); }
  }
  if(email && out.requiresEmm && !out.emmReceived){
    try{
      var sub = lookupEmmSubmission(email);
      if(sub && !sub.error && sub.fileUrl){
        var subTime = new Date(sub.timestamp).getTime();
        if(!inviteTime || isNaN(subTime) || subTime>=inviteTime){
          t.getRange(i+1,39).setValue(sub.timestamp||now.toISOString());
          t.getRange(i+1,41).setValue(sub.fileUrl);
          out.emmReceived = true; out.emmDetected++;
        }
      }
    }catch(e){ Logger.log('EMM submission lookup failed for row '+(i+1)+': '+e.message); }
  }
  out.submitted = assessmentsSubmitted_(out.hasGrit, out.hasValues, out.requiresEmm, out.emmReceived, out.emmGraded);
  return out;
}

// "Check now" from the app: attach whatever has arrived for one candidate
// and return their updated record.
function refreshAssessments(data){
  try{
    if(!data || !data.id) return {success:false, error:'Missing applicant id.'};
    var f = findApplicantRow(data.id);
    if(f.error) return {success:false, error:f.error};
    var res = attachAssessmentsForRow_(f.t, f.idx, f.row, new Date());
    return {success:true, attached:res.attached + res.emmDetected, record:applicantFromRow_(readRow_(f.t, f.idx))};
  }catch(e){ return {success:false, error:e.message}; }
}

function checkAssessmentCompliance(){
  const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
  const t=ss.getSheetByName('Applicants');
  if(!t) return;
  const data=t.getDataRange().getValues();
  const now=new Date();
  const REMINDER_HOURS=ASSESSMENT_REMINDER_HOURS, ARCHIVE_HOURS=ASSESSMENT_DEADLINE_HOURS;
  let reminders=0, archived=0, healed=0, attached=0, emmDetected=0;
  for(let i=1;i<data.length;i++){
    const r=data[i];
    const id=r[0]; if(!id) continue;
    let status=r[9]||'In Progress';
    const stage=canonicalStage_(r[53]);

    // Finished, paused or removed candidates are never touched automatically --
    // by status OR by stage (a candidate closed via the stage panel keeps an
    // "In Progress" status until the outcome model is unified). Deleted and
    // Departed used to fall through here, so the job emailed them and flipped
    // them to NonCompliant, which brought deleted records back.
    if(COMPLIANCE_SKIP_STATUSES.indexOf(status)>=0) continue;
    if(CLOSED_STAGES.indexOf(stage)>=0) continue;
    // Reminders and archiving only apply while the candidate is still
    // waiting on their assessments.
    const inAssessmentWindow = !stage || ASSESSMENT_WAITING_STAGES.indexOf(stage)>=0;

    let emailsSent={};
    try{ emailsSent=r[30]?JSON.parse(r[30]):{}; }catch(e){ emailsSent={}; }
    const latestInvite=latestAssessmentInvite_(emailsSent);
    const inviteSentAt=latestInvite ? latestInvite.at : '';
    const found=attachAssessmentsForRow_(t, i, r, now);
    attached+=found.attached; emmDetected+=found.emmDetected;
    const hasGrit=found.hasGrit, hasValues=found.hasValues, requiresEmm=found.requiresEmm;

    // Self-heal: someone may have been archived as Non Compliant, then their
    // GRIT/Values score arrived shortly after (they did respond, just close to
    // the cutoff, or the score just got attached above) -- put them back to In
    // Progress automatically instead of leaving them stuck until someone
    // remembers to run restoreCompliantApplicants() by hand.
    // Only ever un-do the automation's OWN archiving. 'Status Changed At'
    // (col 43) is written by the Decision-tab buttons and never by this
    // function, so a value there means a person deliberately set this status
    // -- e.g. HR marking someone "Doesn't Respond" after they went silent on
    // interview scheduling, which the candidate's existing assessment scores
    // must not silently override. Without this guard the mark reappears as
    // "In Progress" on the next run and looks like the app ignored HR.
    if(status==='NonCompliant'){
      const setByPerson=String(r[42]||'').trim()!=='';
      if(hasGrit||hasValues){
        if(setByPerson){
          continue;
        }
        if(setStatusIfUnchanged_(t, i, r, 'In Progress')){
          status='In Progress';
          healed++;
        } else {
          continue;
        }
      } else {
        continue;
      }
    }

    if(!inviteSentAt || !inAssessmentWindow) continue;
    const assessmentsComplete=found.submitted;
    if(assessmentsComplete) continue;
    const hoursElapsed=(now.getTime()-new Date(inviteSentAt).getTime())/3600000;
    if(hoursElapsed>=ARCHIVE_HOURS){
      if(setStatusIfUnchanged_(t, i, r, 'NonCompliant')) archived++;
      continue;
    }
    if(hoursElapsed>=REMINDER_HOURS && !emailsSent.autoReminder && !emailsSent.reminder){
      try{
        sendComplianceReminderEmail(r[2],r[1],r[4],r[37],r[0],requiresEmm);
        mergeEmailsSent_(t, i, {autoReminder: now.toISOString()});
        reminders++;
      }catch(e){ Logger.log('Reminder send failed for row '+(i+1)+': '+e.message); }
    }
  }
  Logger.log('Compliance check complete. Scores auto-attached: '+attached+', EMM submissions detected: '+emmDetected+', Reminders sent: '+reminders+', Archived: '+archived+', Auto-healed back to In Progress: '+healed);
}

function restoreCompliantApplicants(){
  const ss=SpreadsheetApp.openById(MASTER_SHEET_ID);
  const t=ss.getSheetByName('Applicants');
  if(!t) return 'Applicants sheet not found';
  const data=t.getDataRange().getValues();
  let restored=0;
  const names=[];
  for(let i=1;i<data.length;i++){
    const r=data[i];
    const id=r[0]; if(!id) continue;
    if(r[9]!=='NonCompliant') continue;
    // Must match checkAssessmentCompliance()'s own definition of "complete"
    // EXACTLY. This used to be a lenient "any evidence at all" check (GRIT OR
    // Values, ignoring EMM entirely) -- so it would restore someone who still
    // hadn't submitted a required EMM file, only for the automatic 15-minute
    // check to archive them right back. That mismatch is what caused the
    // Non Compliant count to drop after a manual run and then bounce back up
    // on its own a few minutes later.
    const hasGrit=r[13]!==''&&r[13]!==null&&r[13]!==undefined;
    const hasValues=r[15]!==''&&r[15]!==null&&r[15]!==undefined;
    const requiresEmm=emmExpected_(r, parseEmailsSent_(r[30]));
    const emmReceived=!!r[38];
    const emmGraded=!!r[23];
    const complete=hasGrit&&hasValues&&(requiresEmm?(emmReceived||emmGraded):true);
    if(complete){
      t.getRange(i+1,10).setValue('In Progress');
      restored++;
      names.push(r[1]);
    }
  }
  Logger.log('Restored '+restored+' applicant(s) to In Progress: '+names.join(', '));
  return 'Restored '+restored+' applicant(s): '+names.join(', ');
}

// The one assessment reminder text. The compliance job sends it on its own;
// getAll hands the same template to the app so a reminder sent by hand from
// the email page says exactly the same thing. Placeholders are filled by
// fillReminderTemplate_ here and by the app's template fill.
const REMINDER_TEMPLATE = {
  subject: '[ABBSS] Reminder: please complete your assessments for {position}',
  body: 'Dear {name},\n\n'
    + 'This is a friendly reminder that we have not yet received your completed assessments for the {position} role.\n\n'
    + 'Important: please use this same email address ({email}) when filling out each form. That\'s how we match your results back to your application.\n\n'
    + 'Please submit:\n'
    + '\u2022 GRIT form: {gritlink}\n'
    + '\u2022 Value-Integrity form: {valueslink}\n'
    + '{emmline}'
    + '\nThe deadline is {deadlinehours} hours from the original invitation. If we do not receive everything within that window, your application will be marked as Non-Compliant. If you have already submitted, please disregard this message, and if you need help, let us know right away.\n\n'
    + 'Warm regards,\nHR Team\nABBSS'
};
function fillReminderTemplate_(tpl, a){
  // Tracked links (a click also counts as an assessment view) when there is
  // an applicant and a deployed URL; plain form links otherwise, so the
  // reminder can never go out broken.
  var scriptUrl = a.id ? PUBLIC_WEBAPP_URL : '';
  var gritLink = scriptUrl ? assessmentLinkFor(scriptUrl, a.id, 'grit') : GRIT_FORM_LINK;
  var valuesLink = scriptUrl ? assessmentLinkFor(scriptUrl, a.id, 'values') : VALUES_FORM_LINK;
  var emmLink = scriptUrl ? assessmentLinkFor(scriptUrl, a.id, 'emm') : EMM_RESPONDER_LINK;
  var emmLine = a.requiresEmm ? ('\u2022 Completed EMM Excel assessment, submit here: ' + emmLink + '\n') : '';
  var fill = function(s){
    return s.replace(/{name}/g, a.name||'Applicant').replace(/{position}/g, a.position||'your application')
      .replace(/{email}/g, a.email||'').replace(/{gritlink}/g, gritLink).replace(/{valueslink}/g, valuesLink)
      .replace(/{emmline}/g, emmLine).replace(/{deadlinehours}/g, String(ASSESSMENT_DEADLINE_HOURS));
  };
  return {subject: fill(tpl.subject), body: fill(tpl.body)};
}

function sendComplianceReminderEmail(email,name,position,enteredBy,id,requiresEmm){
  if(!email) return;
  var msg = fillReminderTemplate_(REMINDER_TEMPLATE, {id:id, name:name, position:position, email:email, requiresEmm:requiresEmm});
  // Fully automated (no one clicked send): replies go to whoever entered
  // this applicant, not just whoever authorized the script.
  const replyTo = TEAM_DIRECTORY[enteredBy] || DEFAULT_REPLY_TO;
  sendMail_(email, msg.subject, msg.body, {replyTo: replyTo, name: enteredBy || 'ABBSS HR Team'});
}

function installComplianceTrigger(){
  const triggers=ScriptApp.getProjectTriggers();
  triggers.forEach(function(t){ if(t.getHandlerFunction()==='checkAssessmentCompliance') ScriptApp.deleteTrigger(t); });
  // Every 15 minutes instead of hourly -- this is what pulls in new GRIT/Values
  // answers and un-archives anyone who gets marked Non Compliant then responds
  // late, so the gap between "they answered" and "the app shows it" is short.
  ScriptApp.newTrigger('checkAssessmentCompliance').timeBased().everyMinutes(15).create();
  return 'Compliance trigger installed (runs every 15 minutes)';
}

// Staging only, run by hand from the editor. Replaces every candidate email
// and phone number in the COPIED Sheet with test values, so the staging copy
// holds no real contact details. Refuses to run against the production Sheet.
function scrubStagingData(){
  if(!IS_STAGING) throw new Error('Refusing to scrub: this script points at the production Sheet.');
  if(!MAIL_REDIRECT || MAIL_REDIRECT.indexOf('@')<0) throw new Error('Set MAIL_REDIRECT first; test addresses are built from it.');
  const t=SpreadsheetApp.openById(MASTER_SHEET_ID).getSheetByName('Applicants');
  const rows=t.getDataRange().getValues();
  const at=MAIL_REDIRECT.indexOf('@');
  const local=MAIL_REDIRECT.slice(0,at), domain=MAIL_REDIRECT.slice(at);
  let n=0;
  for(let i=1;i<rows.length;i++){
    if(!rows[i][0]) continue;
    t.getRange(i+1,3).setValue(local+'+cand'+i+domain); // Email
    t.getRange(i+1,4).setValue('0000000000');          // Phone
    if(rows[i][47]) t.getRange(i+1,48).setValue('0000000000'); // Candidate Contact
    n++;
  }
  Logger.log('Scrubbed '+n+' applicant rows.');
  return 'Scrubbed '+n+' applicant rows.';
}
