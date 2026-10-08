/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
require('./receipt-render-fixture.cjs');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { UiLocaleProvider } = require('../../lib/i18n/provider.tsx');
const { effectiveUiLocale } = require('../../lib/i18n/core.ts');
const { casePreview, buildAlertCandidates } = require('../../app/cases/case-list-model.ts');
const { caseText, caseTerm, caseLabels, alertLabel } = require('../../app/cases/labels.ts');
const { CaseList, CaseQuickViewBody } = require('../../app/cases/CaseListView.tsx');
const { getTodayDateKey } = require('../../lib/dueStatus.ts');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');
const item = { id:49, file_no:'VP-2026-049', court_name:'Court name', case_number:'1234/2569', title:'A very long complete case title '.repeat(30),client_id:'c1',client_name:'Client name',owner_name:'Lawyer name',phase:'litigation',case_type:'Civil',status:'Active',next_alerts:[] };
const render = (Component,props,locale='en') => renderToStaticMarkup(React.createElement(UiLocaleProvider,{initialLocale:locale,pathname:'/cases'},React.createElement(Component,props)));

test('English coverage includes the released list and modernized full Case detail',()=>{
 for(const p of ['/cases','/cases/','/cases/49']) assert.equal(effectiveUiLocale('en',p),'en');
 for(const p of ['/cases/49/edit','/alerts']) assert.equal(effectiveUiLocale('en',p),'th');
});
test('preview uses real pending records: nearest upcoming hearing, outstanding task and deadline; no 30-day cutoff',()=>{
 const tasks=[{case_id:49,task_type:'Done task',due_date:'2026-10-01',status:'Done'},{case_id:49,task_type:'Pending task',due_date:'2026-10-07',status:'Pending'},{case_id:1,task_type:'Other case',due_date:'2026-01-01'}];
 const deadlines=[{case_id:49,deadline_type:'answer',current_due_date:'2026-10-05',status:'filed'},{case_id:49,deadline_type:'appeal',current_due_date:'2026-10-10'}];
 const timeline=[{case_id:49,event_type:'hearing',event_date:'2026-10-07'},{case_id:49,event_type:'hearing',event_date:'2026-10-09',status:'Cancelled'},{case_id:49,event_type:'hearing',event_date:'2026-12-01',appointment_type:'นัดพร้อม'},{case_id:49,event_type:'order',event_date:'2026-10-09'}];
 const snapshot=JSON.stringify({tasks,deadlines,timeline}), p=casePreview(49,tasks,deadlines,timeline,'2026-10-08');
 assert.equal(p.task.task_type,'Pending task'); assert.equal(p.deadline.deadline_type,'appeal'); assert.equal(p.hearing.event_date,'2026-12-01');
 assert.equal(JSON.stringify({tasks,deadlines,timeline}),snapshot);
 const html=render(CaseQuickViewBody,{item,preview:p});
 for(const text of [item.title,item.client_name,item.owner_name,item.case_number,'Case management hearing','Pending task','Appeal due','Civil','Active']) assert.ok(html.includes(text),text);
});
test('missing data and undated work use honest localized empty states',()=>{
 for(const locale of ['th','en']) {
  const preview=casePreview(49,[{case_id:49,task_type:'เตรียมเอกสาร',status:'Pending'}],[],[]);
  const html=render(CaseQuickViewBody,{item:{id:49},preview},locale);
  for(const key of ['noCourt','noBlackNo','untitled','noHearing','noDate','noDeadline']) assert.ok(html.includes(caseText(locale,key)));
  assert.ok(html.includes(caseTerm('เตรียมเอกสาร',locale)));
 }
});
test('list prioritizes court identity; full title stays available in preview and route is retained',()=>{
 const html=render(CaseList,{cases:[item],onPreview(){}});
 assert.ok(html.indexOf(item.file_no)<html.indexOf(item.court_name));
 assert.ok(html.indexOf(item.case_number)<html.indexOf(item.title));
 assert.match(html,/aria-haspopup="dialog"/); assert.match(html,/href="\/cases\/49"/);
 const css=fs.readFileSync('app/cases/cases.module.css','utf8');
 assert.match(css,/-webkit-line-clamp:2/); assert.match(css,/table-layout:fixed/);
});
test('existing risk window and count semantics remain item-based, not closed-case counts',()=>{
 const day=getTodayDateKey(), rows=buildAlertCandidates([{case_id:49,task_type:'เตรียมเอกสาร',due_date:day},{case_id:49,task_type:'ร่างคำฟ้อง',due_date:day},{case_id:49,due_date:day,status:'Done'}],[],[],[]);
 assert.equal(rows.length,2); assert.ok(rows.every(r=>r.level==='today'));
 assert.equal(new Set(rows.map(r=>r.case_id)).size,1);
 assert.equal(rows[0].text,'Task: เตรียมเอกสาร');
 assert.equal(alertLabel(rows[0],'th'),'งาน: เตรียมเอกสาร');
 assert.equal(alertLabel(rows[0],'en'),'Task: Prepare documents');
 assert.equal(caseText('en','clear'),'No current alerts');
});
test('both languages cover UI vocabulary without bilingual parenthetical labels; free text is preserved',()=>{
 for(const pair of Object.values(caseLabels)) { assert.ok(pair.th&&pair.en); assert.doesNotMatch(pair.en,/[ก-๙]/); assert.doesNotMatch(pair.th.replace(/\{\w+\}/g,""),/[A-Za-z]{3,}/); }
 assert.equal(caseTerm('Active','th'),'อยู่ระหว่างดำเนินการ'); assert.equal(caseTerm('Administrative','en'),'Administrative');
 assert.equal(caseTerm('User supplied title','th'),'User supplied title');
});
test('search, all legacy filters and create permission work with the existing list state',()=>{
 const f=workspaceFixture('app/cases/page.tsx');
 const state={'CasesPage.cases':[item,{...item,id:50,file_no:'VP-2026-050',court_name:'Other court',case_number:'5678/2569',title:'Other title',client_name:'Other client',client_id:null,status:'Done',phase:'enforcement'}]};
 for(const keyword of [item.file_no,item.court_name,item.case_number,item.client_name,'long complete']) {
  const html=f.render('en',{...state,'CasesPage.searchText':keyword});
  assert.ok(html.includes(item.file_no)); assert.ok(!html.includes('VP-2026-050'));
 }
 for(const [filter,value] of [['statusFilter','Active'],['phaseFilter','litigation'],['clientFilter','c1']]) {
  const html=f.render('en',{...state,[`CasesPage.${filter}`]:value}); assert.ok(html.includes(item.file_no)); assert.ok(!html.includes('VP-2026-050'));
 }
 for(const role of ['staff','assistant_lawyer','viewer']) assert.ok(!f.render('en',{...state,'CasesPage.profile':{role}}).includes('Add case'));
 for(const role of ['lawyer','partner','admin']) assert.ok(f.render('en',{...state,'CasesPage.profile':{role}}).includes('Add case'));
});
