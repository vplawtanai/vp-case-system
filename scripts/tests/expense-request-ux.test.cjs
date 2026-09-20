/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const fs=require('node:fs'),cp=require('node:child_process'),ts=require('typescript');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs'),{fixture,expense,id}=require('./expense-foundation-fixture.cjs');
const {translate}=require('../../lib/i18n/catalog.ts');
const modalStub={default:({title,children,footer})=>React.createElement('section',{role:'dialog'},React.createElement('h1',null,title),children,footer)};
const forms=workspaceFixture('app/finance/expenses/forms.tsx',['ExpenseFactsForm']);
const modal=workspaceFixture('app/finance/expenses/request-modal.tsx',['ExpenseRequestModal'],{'../../components/DetailModal':modalStub,'./forms':{ExpenseFactsForm:forms.component('ExpenseFactsForm')}});
const review=workspaceFixture('app/finance/expenses/request-view.tsx',['ExpenseRequestReview'],{'../../components/DetailModal':modalStub});
const f=fixture('list'),props={access:f.data.access,accounts:f.data.accounts,lookups:f.lookups,run:()=>{throw Error('No writes');},busy:false,error:'',onClose:()=>{},onSaved:()=>{}};
const request=(count,status='draft')=>({id:id(900),kind:'employee_claim',status,version:1,note:'',created_by:f.data.access.user_id,created_at:'2026-09-19T01:00:00Z',submitted_at:status==='submitted'?'2026-09-20T04:42:00Z':null,requester_name:'Fixture',audit:[],items:Array.from({length:count},(_,i)=>expense(i+100,{status,gross_amount:[300,120,450][i],reimbursement_requested:[300,120,450][i]}))});
for(const claim of [true,false])test(`TH ${claim?'Claim':'Company'}: top summary, empty first item and distinct item/request actions`,()=>{
 const html=modal.render('th',{}, {...props,claim},'ExpenseRequestModal');
 assert.ok(html.includes(translate('th',claim?'expenses.newClaimRequest':'expenses.newBatch')));
 assert.ok(html.indexOf('aria-label="สรุปคำขอ"')<html.indexOf('<form'));
 assert.match(html,/<legend>รายการที่ 1<\/legend>/);assert.ok(html.includes('0.00 THB'));assert.match(html,/<dd>0 รายการ<\/dd>/);
 assert.ok(html.includes('เพิ่มรายการนี้'));assert.ok(html.includes('บันทึกไว้ทำต่อ'));assert.ok(html.includes(claim?'ส่งคำขอ':'ส่งตรวจ'));assert.ok(!html.includes('เก็บรายการนี้'));
 assert.equal((html.match(/<form /g)||[]).length,1);assert.doesNotMatch(html,/<input[^>]*(submitted|created)_at/);
});
for(const count of [1,3])test(`TH ${count} completed items: compact cards and existing derived totals`,()=>{
 const html=modal.render('th',{}, {...props,claim:true,request:request(count)},'ExpenseRequestModal');
 assert.equal((html.match(/data-request-item=/g)||[]).length,count);assert.doesNotMatch(html,/<form/);
 assert.ok(html.includes(count===1?'300.00 THB':'870.00 THB'));assert.ok(html.includes('เพิ่มรายการค่าใช้จ่าย'));
 const editing=modal.render('th',{'ExpenseRequestModal.editing':id(100)}, {...props,claim:true,request:request(count)},'ExpenseRequestModal');
 assert.equal((editing.match(/<form /g)||[]).length,1);assert.ok(editing.includes('บันทึกการแก้ไข'));assert.ok(editing.includes('ยกเลิกการแก้ไขรายการ'));
});
test('Submitted time is read-only, exact source timestamp; Draft never masquerades as submitted',()=>{
 for(const status of ['draft','submitted']){
  const r=request(1,status),html=review.render('th',{}, {...props,request:r,onEdit:()=>{},renderItem:()=>null},'ExpenseRequestReview');
  assert.equal(html.includes('ยื่นคำขอเมื่อ'),status==='submitted');assert.doesNotMatch(html,/<input/);
  assert.ok(html.includes(status==='submitted'?r.submitted_at:r.created_at));
  assert.equal(/<button[^>]*>.*?<\/button>/s.test(html),true);
 }
});
test('EN changed labels smoke; no changes to calculations, item RPC payloads or Migration 056',()=>{
 const html=modal.render('en',{}, {...props,claim:true},'ExpenseRequestModal');
 for(const label of ['Create expense claim request','Request summary','Item 1','Add this item','Add expense item','Save for later','Submit request'])assert.ok(html.includes(label),label);
 for(const file of ['app/finance/expenses/requests.ts','supabase/migrations/202607180056_add_expense_request_foundation.sql'])assert.equal(fs.readFileSync(file,'utf8'),cp.execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'}));
 const extracts=(file,source)=>{const a=ts.createSourceFile(file,source,99,true,ts.ScriptKind.TSX),out=[];function visit(n){if((ts.isCallExpression(n)&&n.expression.getText(a)==='run')||(ts.isFunctionDeclaration(n)&&['save','changeHandling'].includes(n.name?.text))||(ts.isVariableDeclaration(n)&&n.name.getText(a)==='total'))out.push(n.getText(a));ts.forEachChild(n,visit);}visit(a);return out;};
 for(const file of ['app/finance/expenses/forms.tsx','app/finance/expenses/workspace.tsx'])assert.deepEqual(extracts(file,fs.readFileSync(file,'utf8')),extracts(file,cp.execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'})),file);
});
