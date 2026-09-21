/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),React=require('react'),ts=require('typescript');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs'),{fixture,expense,id,tax,obligation}=require('./expense-foundation-fixture.cjs');
const {translate}=require('../../lib/i18n/catalog.ts');
const {expenseStatusTone,expenseAccountIssue,expenseAccountBlocked}=require('../../app/finance/expenses/presentation.ts');
const {frozenExpenseMovementLabel}=require('../../app/finance/treasury/movement-labels.ts');
const f=fixture('list'),props={access:f.data.access,accounts:f.data.accounts,lookups:f.lookups,busy:false,run:()=>{throw Error('No writes');}};
const forms=workspaceFixture('app/finance/expenses/forms.tsx',['ExpenseSettlementForm','ExpensePaymentPanel','AccountSelect']);
const review=workspaceFixture('app/finance/expenses/company-review.tsx',['CompanyItemReview']);
const audit=workspaceFixture('app/finance/expenses/audit-view.tsx',['ExpenseActivity']);
const modal={default:({children})=>React.createElement('section',null,children)};
const details=workspaceFixture('app/finance/payables/expense-detail.tsx',['ExpensePayableDetail'],{'../../components/DetailModal':modal,'../expenses/data':{readExpenses:()=>{throw Error('No network');}},'../expenses/workspace':{ExpenseBadge:({state})=>React.createElement('span',{'data-tone':expenseStatusTone(state)},state)}});
test('Approval/rejection reason remains required by the applied backend; no fabricated reason',()=>{
 const sql=fs.readFileSync('supabase/migrations/202607180055_add_expense_purchase_settlement_foundation.sql','utf8');
 assert.ok(sql.includes("if p_accept is null or nullif(btrim(p_reason),'') is null then raise exception 'EXPENSE_REASON_REQUIRED'"));
 for(const locale of ['th','en']){const html=review.render(locale,{}, {...props,row:expense(10,{status:'submitted',creator_payment_fact:'unpaid',vat_awareness:'no',wht_awareness:'no'})},'CompanyItemReview');assert.match(html,/<textarea required=""[^>]*id="company-review-reason"|<textarea[^>]*required=""/);assert.match(html,/data-readiness-checklist/);assert.ok(html.includes(translate(locale,'expenses.companyNeedReason')));}
});
test('Unpaid due date optional; known supplier is read-only; paid copy does not imply paying again',()=>{
 for(const locale of ['th','en']){
  const row=expense(10,{creator_payment_fact:'unpaid'}),html=forms.render(locale,{}, {...props,row,companyReview:true},'ExpenseSettlementForm');
  assert.ok(html.includes(translate(locale,'expenses.dueOptional')));assert.match(html,/<input type="date"[^>]*id="settlement-due"/);assert.doesNotMatch(html,/<input type="date"[^>]*required/);assert.match(html,/readonly=""/i);assert.ok(!html.includes(translate(locale,'expenses.managePayee')));
  const paid={...row,creator_payment_fact:'company_paid',settlement:{id:id(40),mode:'company_bank',amount:10700,payee_id:null,reason:'Reviewed'}};
  assert.ok(forms.render(locale,{}, {...props,row:paid},'ExpensePaymentPanel').includes(translate(locale,'expenses.recordPaidOutflow')));
  assert.ok(forms.render(locale,{}, {...props,row:{...paid,creator_payment_fact:'unpaid',settlement:{...paid.settlement,mode:'supplier_unpaid'}}},'ExpensePaymentPanel').includes(translate(locale,'expenses.preparePayment')));
 }
});
test('Status accents are distinct without changing status values',()=>{
 assert.deepEqual(['review','unpaid','paid','rejected'].map(expenseStatusTone),['warn','payable','good','bad']);
 assert.equal(expenseStatusTone('submitted'),'warn');assert.equal(expenseStatusTone('open'),'payable');
});
test('Account guidance uses authority/opening flags, not names or balance; preparer handoff retained',()=>{
 const a=f.data.accounts[0];assert.equal(expenseAccountIssue({...a,name:'KTB',balance:0}),null);
 assert.equal(expenseAccountIssue({...a,name:'KBANK',opening_as_of:null}),'accountOpeningMissing');
 assert.equal(expenseAccountBlocked({...a,opening_as_of:null}),true);assert.equal(expenseAccountIssue({...a,can_record:false}),'accountRecordDenied');
 assert.equal(expenseAccountIssue({...a,can_confirm:false}),'accountConfirmDenied');assert.equal(expenseAccountBlocked({...a,can_confirm:false}),false);
 for(const locale of ['th','en']){const html=forms.render(locale,{}, {accounts:[{...a,opening_as_of:null}],value:'',onChange:()=>{},showReadiness:true},'AccountSelect');assert.match(html,/<option[^>]*disabled=""/);assert.ok(html.includes(translate(locale,'expenses.accountOpeningMissing')));}
});
test('One collapsed Admin disclosure retains every audit event; no raw evidence for other staff',()=>{
 const row=expense(10,{audit:[1,2].map(n=>({id:id(n+90),event_type:'payment_confirmed',actor_name:'Finance',created_at:'2026-09-21T00:00:00Z',evidence_json:{private_marker:n}}))});
 for(const locale of ['th','en'])for(const isAdmin of [false,true]){const html=audit.render(locale,{}, {row,isAdmin},'ExpenseActivity');assert.equal((html.match(/data-expense-technical/g)||[]).length,isAdmin?1:0);assert.doesNotMatch(html,/<details[^>]*open/);assert.equal(html.includes('private_marker'),isAdmin);assert.equal((html.match(/<li>/g)||[]).length,2);}
});
test('Payables modal shows source/tax facts, unknown remains unknown; no action form or raw UUIDs',()=>{
 const o=obligation(40,id(10),{reference:'EXP-TEST',due_on:null}),row=expense(10,{tax_review:tax,obligation:o});
 for(const locale of ['th','en']){const html=details.render(locale,{'ExpensePayableDetail.source':{...f.data,record:row}}, {obligation:o,isAdmin:false,onClose:()=>{}},'ExpensePayableDetail');assert.ok(html.includes(o.payee_name));assert.ok(html.includes('EXP-TEST'));assert.ok(html.includes('700.00'));assert.doesNotMatch(html,/<form|type="submit"|00000000-0055/);}
 const html=details.render('en',{'ExpensePayableDetail.source':{...f.data,record:{...row,tax_review:null}}}, {obligation:o,isAdmin:false,onClose:()=>{}},'ExpensePayableDetail');assert.ok(html.includes('Pending'));assert.doesNotMatch(html,/>0\.00 THB</);
});
test('Cashbook label uses matching frozen evidence only; missing/malformed evidence never invents an expense',()=>{
 const row={id:id(100),source_payout_id:id(90)},p={id:id(90),status:'confirmed',source_model:'expense_v1',confirmed_snapshot_json:{schema_version:2,source_model:'expense_v1',choices:[{expense_id:id(10),expense:{id:id(10),origin:'company_purchase',description:'UAT PAID'}}]}};
 const before=JSON.stringify(p);assert.deepEqual(frozenExpenseMovementLabel(row,p),{key:'companyExpenseOutflow',description:'UAT PAID'});assert.equal(JSON.stringify(p),before);
 for(const bad of [undefined,{...p,id:id(91)},{...p,status:'draft'},{...p,source_model:'revenue_distribution_v1'},{...p,confirmed_snapshot_json:null},{...p,confirmed_snapshot_json:{...p.confirmed_snapshot_json,choices:[]}}])assert.equal(frozenExpenseMovementLabel(row,bad),null);
 const claim=structuredClone(p);claim.confirmed_snapshot_json.choices[0].expense.origin='employee_claim';assert.equal(frozenExpenseMovementLabel(row,claim).key,'claimOutflow');
 claim.confirmed_snapshot_json.choices[0].expense.id=id(11);assert.equal(frozenExpenseMovementLabel(row,claim),null);
});
test('Existing mutation call payloads, readiness rules, migrations and protected flows are unchanged',()=>{
 function calls(source){const ast=ts.createSourceFile('x.tsx',source,99,true,ts.ScriptKind.TSX),found=[];function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='run')found.push(n.getText(ast));ts.forEachChild(n,visit);}visit(ast);return found;}
 for(const file of ['forms.tsx','company-review.tsx','workspace.tsx']){const path='app/finance/expenses/'+file;assert.deepEqual(calls(fs.readFileSync(path,'utf8')),calls(cp.execFileSync('git',['show','HEAD:'+path],{encoding:'utf8'})),path);}
 const protectedFiles=['app/finance/expenses/company-money.ts','app/finance/expenses/company-workflow.ts','app/finance/expenses/request-operations.ts','app/finance/expenses/requests.ts','app/finance/expenses/request-modal.tsx','app/finance/expenses/data.ts','app/finance/payables/groups.tsx','app/finance/treasury/dashboard.ts'];
 const migrations=cp.execFileSync('git',['ls-tree','-r','--name-only','HEAD','supabase/migrations'],{encoding:'utf8'}).trim().split('\n');
 for(const file of [...protectedFiles,...migrations])assert.deepEqual(fs.readFileSync(file),cp.execFileSync('git',['show','HEAD:'+file]),file);
});
