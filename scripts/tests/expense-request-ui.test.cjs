/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs'),{fixture,expense,id}=require('./expense-foundation-fixture.cjs');
const {requestTotals,requestProgress,expenseQueueEntries}=require('../../app/finance/expenses/requests.ts');
const {translate}=require('../../lib/i18n/catalog.ts');
function request(n=4,kind='employee_claim') {return{id:id(900),kind,status:'submitted',version:2,created_by:id(1),created_at:'2026-09-15T01:00:00Z',submitted_at:'2026-09-20T04:42:00Z',note:'Weekly request',requester_name:'Synthetic claimant',audit:[],items:Array.from({length:n},(_,i)=>expense(i+200,{request_id:id(900),origin:kind==='employee_claim'?'employee_claim':'company_purchase',status:'submitted',expense_date:['2026-09-03','2026-09-05','2026-09-08','2026-09-12'][i%4],gross_amount:[300,120,450,1000][i%4],reimbursement_requested:[300,120,450,1000][i%4]}))};}
test('Weekly request is one queue entry, 4 dates, 1870; newest/oldest coexist with standalone historical rows',()=>{
 const r=request(),old=expense(99,{status:'submitted',submitted_at:'2026-09-19T12:00:00Z'}),options={claims:true,status:'submitted',search:'',locale:'en',order:'newest'};
 assert.deepEqual(requestTotals(r.items),{count:4,gross:1870,requested:1870});
 const list=expenseQueueEntries([old,...r.items],[r],options);assert.equal(list.length,2);assert.equal(list[0].request.id,r.id);assert.equal(list[0].time.at,r.submitted_at);
 assert.equal(expenseQueueEntries([old],[r],{...options,order:'oldest'})[0].expense.id,old.id);
 assert.equal(requestProgress(r),'submitted');r.items[0].status='accepted';assert.equal(requestProgress(r),'requestPartial');r.items.forEach((e,i)=>e.status=i<3?'accepted':'rejected');assert.equal(requestProgress(r),'requestReviewedMixed');
 const scoped=expenseQueueEntries([r.items[0]],[],{...options,status:'all'});assert.equal(scoped.length,1);assert.equal(scoped[0].expense.id,r.items[0].id);
});
const modal=workspaceFixture('app/finance/expenses/request-modal.tsx',['ExpenseRequestModal','requestItemFromExpense'],{'../../components/DetailModal':{default:({title,children,footer})=>React.createElement('section',{role:'dialog'},title,children,footer)}});
const lists=workspaceFixture('app/finance/expenses/workspace.tsx',['ExpenseClaimList','ExpenseList'],{'./data':{}});
for(const locale of ['th','en'])for(const count of [1,3,10])test(`${locale} ${count} items: collapsed summaries, derived totals, no parent tax/payment action`,()=>{
 const f=fixture('list'),r={...request(count),status:'draft',submitted_at:null},t=k=>translate(locale,'expenses.'+k);
 const html=modal.render(locale,{}, {request:r,claim:true,access:f.data.access,accounts:f.data.accounts,lookups:f.lookups,run:()=>{throw Error('no writes');},busy:false,error:'',onClose:()=>{},onSaved:()=>{}},'ExpenseRequestModal');
 assert.equal((html.match(/data-request-item=/g)||[]).length,count);assert.doesNotMatch(html,/<form/);assert.ok(html.includes(t('requestedTotal')));assert.ok(html.includes(t('addItem')));assert.ok(html.includes(t('saveRequest')));assert.ok(!html.includes(t('confirmPayment')));
 const queue=lists.render(locale,{}, {rows:[],requests:[r],canCreate:true,viewAll:true,onCreate:()=>{}},'ExpenseClaimList');assert.equal((queue.match(/data-request-row=/g)||[]).length,1);assert.ok(queue.includes(t('draftCreated')));assert.ok(!queue.includes('data-workflow-event="claimSubmitted"'));
});
module.exports={request};
test('Request reader paginates; only missing-056 compatibility falls back, other failures surface',async()=>{
 let calls=0,response;
 const reader=workspaceFixture('app/finance/expenses/data.ts',['readExpenseRequests'],{'../../../lib/supabase':{supabase:{rpc:async(name,args)=>{assert.equal(name,'get_finance_expense_requests');calls++;return typeof response==='function'?response(args):response;}}}});
 response={error:{code:'PGRST202',message:'Could not find get_finance_expense_requests'}};assert.equal(await reader.readExpenseRequests(false),null);
 response={error:{code:'42501',message:'permission denied'}};await assert.rejects(reader.readExpenseRequests(false),e=>e.code==='42501');
 response={data:{rows:null}};await assert.rejects(reader.readExpenseRequests(false),/response/);
 calls=0;response=args=>({data:{rows:args.p_offset===0?Array(50).fill(request()):[request()],has_next:args.p_offset===0}});assert.equal((await reader.readExpenseRequests(false)).length,51);assert.equal(calls,2);
});
test('Batch capture never implies already-paid; Draft account context and existing canonical categories retained',()=>{
 const form=workspaceFixture('app/finance/expenses/forms.tsx',['ExpenseFactsForm']),f=fixture('list');
 for(const locale of ['th','en']){
  const html=form.render(locale,{}, {claim:false,access:f.data.access,accounts:f.data.accounts,lookups:f.lookups,run:()=>{},busy:false,onCapture:()=>{}},'ExpenseFactsForm');
  assert.doesNotMatch(html,/value="company_paid"/);assert.ok(html.includes(translate(locale,'expenses.keepItem')));
 }
 const account={bank_account_id:id(77),cash_location_id:null},row=expense(800,{request_entry_account:account});
 const line=modal.requestItemFromExpense(row);assert.equal(line.input.bank_account_id,account.bank_account_id);assert.equal(line.input.cash_location_id,null);
});
test('056 artifacts: SELECT-only verifiers, exact embedded migration, rollback-only and no seed writes',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),a=require('./expense-request-artifacts.cjs');
 const source=fs.readFileSync('scripts/tests/receipt-sql-static.test.cjs','utf8');
 const lexical=vm.runInNewContext(source.slice(source.indexOf('function lexical('),source.indexOf('module.exports'))+';lexical',{assert});
 for(const [file,sql] of Object.entries(a.workflow()))assert.equal(fs.readFileSync(file,'utf8'),sql);
 for(const file of [a.filenames.pre,a.filenames.verify]){
  const s=lexical(fs.readFileSync(file,'utf8'));assert.equal(s.split(';').filter(x=>x.trim()).length,1);assert.match(s.trim(),/^with /i);
  assert.doesNotMatch(s,/\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|call|do|copy|execute|into)\b/i);
 }
 const migration=fs.readFileSync(a.migrationPath,'utf8'),dry=fs.readFileSync(a.filenames.dry,'utf8');
 assert.equal(dry.split('-- BEGIN EMBEDDED MIGRATION 056\n')[1].split('-- END EMBEDDED MIGRATION 056')[0],migration);
 assert.match(lexical(dry).trim(),/^begin;/i);assert.match(lexical(dry).trim(),/rollback;$/i);assert.doesNotMatch(lexical(dry),/\bcommit\b/i);
 for(const s of lexical(migration).split(';'))assert.doesNotMatch(s.trim(),/^(insert|update|delete|merge|truncate|copy|select)\b/i);
});
