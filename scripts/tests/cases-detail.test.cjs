/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require('./receipt-render-fixture.cjs');
const React = require('react');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');
const { caseMutationEvidence } = require('./cases-detail-contract.cjs');
const baseline = require('./fixtures/cases-detail-mutations.json');
const { detailText } = require('../../app/cases/[id]/labels.ts');
const { effectiveUiLocale } = require('../../lib/i18n/core.ts');
const { buildPermissions } = require('../../lib/permissions.ts');
const base = 'app/cases/[id]/components/';
const modal = { default: ({title,children}) => React.createElement('section',{role:'dialog'},React.createElement('h2',null,title),children) };
test('detail alert keeps the shared list priority: overdue deadline before upcoming task',()=>{
 const { getTodayDateKey } = require('../../lib/dueStatus.ts');
 const day = delta => { const date = new Date(getTodayDateKey()+'T12:00:00Z'); date.setUTCDate(date.getUTCDate()+delta); return date.toISOString().slice(0,10); };
 const f=workspaceFixture('app/cases/[id]/CaseSummary.tsx');
 for(const locale of ['th','en']) {
  const html=f.render(locale,{'CaseSummary.data':{tasks:[{case_id:1,task_type:'อื่นๆ',task_other:'Later task',due_date:day(10),status:'pending'}],deadlines:[{case_id:1,deadline_type:'other',deadline_other:'Overdue deadline',current_due_date:day(-1),status:'pending'}],timeline:[],enforcements:[]}},{caseId:1,revision:0,onSection:()=>{}});
  const alert=html.match(/<button\b[^>]*data-tone="3"[\s\S]*?<\/button>/)?.[0];
  assert.ok(alert);assert.match(alert,/Overdue deadline/);assert.doesNotMatch(alert,/Later task/);
 }
});
const cases = [
 ['CaseInfoSection','isEditing','Edit Case Information'],['PartiesSection','showForm','Add Party'],['TimelineSection','showForm','Add Appointment'],['JudgmentsSection','showJudgmentForm','Add Judgment'],['JudgmentsSection','showFilingForm','Add Filing'],['EnforcementSection','showEnforcementForm','Add Command & Writ'],['EnforcementSection','showAssetForm','Add Asset Search / Seizure / Auction'],['TasksSection','showForm','Add Task'],['DeadlinesSection','showForm','Add Deadline'],['TimeLogsSection','showForm','Add Time Log'],['NotesSection','showForm','Add Note'],['TimelineSection','isEditingFiling','Filing Date'],
];
for(const [section,key,title] of cases) test(`${section}/${key}: modal retains fields and save/cancel in TH/EN`,()=>{
 const f=workspaceFixture(base+section+'.tsx',[],{'../CaseEditModal':modal});
 for(const locale of ['th','en']) {
  const html=f.render(locale,{[`${section}.${key}`]:true,[`${section}.loading`]:false},{caseId:'1',caseItem:{id:1},canEdit:true,canDelete:true});
  assert.match(html,/role="dialog"/);assert.ok(html.includes(detailText(title,locale).replaceAll("&", "&amp;")),title);
  assert.ok(html.includes(detailText('Save',locale)));assert.ok(html.includes(detailText('Cancel',locale)) || section==='TimelineSection');
  assert.match(html,/<(?:input|select|textarea)/);
 }
});
test('non-retired queries, mutation payloads and audit calls stay identical to Phase 1A baseline',()=>{
 for(const [file,expected] of Object.entries(baseline.sections).filter(([file])=>file!=='FeesSection.tsx')) assert.deepEqual(caseMutationEvidence(fs.readFileSync(base+file,'utf8'),file),expected,file);
});
test('complete literal UI vocabulary has TH/EN coverage, with stored case prefix and names preserved',()=>{
 for(const file of Object.keys(baseline.sections)) {
  const ast=ts.createSourceFile(file,fs.readFileSync(base+file,'utf8'),99,true,4);
  function visit(node) {
   if(ts.isCallExpression(node)&&node.expression.getText(ast)==='tr'&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])) {
    const value=node.arguments[0].text;
    if(value==='ผบอ') return; // Thai black-case prefix, not a translated label.
    assert.doesNotMatch(detailText(value,'en'),/[ก-๙]/,`${file}: ${value}`);
    assert.doesNotMatch(detailText(value,'th'),/[A-Za-z]{3,}/,`${file}: ${value}`);
   }
   ts.forEachChild(node,visit);
  }
  visit(ast);
 }
 assert.equal(detailText('User-authored case title','th'),'User-authored case title');
 assert.equal(detailText('ทนายตัวอย่าง','en'),'ทนายตัวอย่าง');
 assert.equal(detailText('Scheduled (รอนัด)','th'),'รอนัด');
 assert.equal(detailText('Scheduled (รอนัด)','en'),'Scheduled');
 assert.equal(detailText('15 ชม. 30 นาที','en'),'15 hr 30 min');
});
test('097 permissions and single-language route behavior are reused, not redefined',()=>{
 for(const role of ['viewer','staff','assistant_lawyer','lawyer','partner','admin']) {
  const permissions=buildPermissions({role});
  const f=workspaceFixture(base+'TasksSection.tsx',[],{'../CaseEditModal':modal});
  const html=f.render('en',{'TasksSection.loading':false},{caseId:'1',canEdit:permissions.canEditTasks,canDelete:permissions.canSoftDelete});
  assert.equal(html.includes('+ Add Task'),permissions.canEditTasks,role);
 }
 assert.equal(effectiveUiLocale('en','/cases/49'),'en');assert.equal(effectiveUiLocale('en','/cases'),'en');assert.equal(effectiveUiLocale('en','/cases/new'),'th');
 const page=fs.readFileSync('app/cases/[id]/page.tsx','utf8');assert.match(page,/permissions.canViewFees/);assert.match(page,/permissions.canViewHistory/);assert.match(page,/canRestore=\{permissions.canRestore\}/);assert.match(page,/hashchange/);
 const summary=fs.readFileSync('app/cases/[id]/CaseSummary.tsx','utf8');assert.match(summary,/casePreview\(caseId/);assert.equal((summary.match(/\.is\("deleted_at",null\)/g)||[]).length,4);assert.doesNotMatch(summary,/\.insert\(|\.update\(|\.rpc\(/);
});
