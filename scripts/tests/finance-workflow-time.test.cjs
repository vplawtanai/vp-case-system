/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs'),{workflowFixture,stamp,event}=require('./finance-workflow-time-fixture.cjs');
const {tax,id}=require('./expense-foundation-fixture.cjs');
const {claimWorkflowTime,expenseWorkflowTime,orderByWorkflow,payableQueueEntries,orderPayableGroups,workflowTimestamp}=require('../../app/finance/workflow-time.ts');
const {translate}=require('../../lib/i18n/catalog.ts');
const lists=workspaceFixture('app/finance/expenses/workspace.tsx',['ExpenseList','ExpenseClaimList'],{'./data':{}});
const queue=workspaceFixture('app/finance/payables/multi-source.tsx',['MultiSourcePayables'],{'../expenses/workspace':{ExpenseBadge:()=>null}});

test('A/B/E: late claim uses actual submission, not business/Draft/update dates; Draft never masquerades as submitted',()=>{
 const f=workflowFixture(),before=JSON.stringify(f),rows=[f.older,{...f.late,updated_at:stamp(25)}];
 assert.equal(claimWorkflowTime(f.late).at,stamp(20));
 assert.deepEqual(orderByWorkflow(rows,r=>claimWorkflowTime(r).at,r=>r.id,'newest').map(r=>r.id),[f.late.id,f.older.id]);
 assert.equal(claimWorkflowTime(f.draft).event,'draftCreated');assert.equal(claimWorkflowTime(f.draft).at,stamp(15));
 assert.equal(claimWorkflowTime({...f.draft,submitted_at:stamp(20)}).event,'draftCreated');
 assert.equal(JSON.stringify(f),before);
});
test('C/D: current review, tax, obligation, noncash, waiver and paid queues use their own lifecycle events',()=>{
 const f=workflowFixture();assert.equal(expenseWorkflowTime(f.company[1],'submitted').at,stamp(20));
 assert.equal(expenseWorkflowTime(f.approved).at,stamp(20));assert.equal(expenseWorkflowTime(f.approved).event,'readyToPay');
 const row={...f.approved,obligation:null,tax_review:null};assert.equal(expenseWorkflowTime(row,'tax').at,stamp(20));
 const paid={...row,payout:{status:'confirmed',paid_on:'2026-09-05'},audit:[event(501,'accepted',20),event(502,'payment_confirmed',21)]};
 assert.equal(expenseWorkflowTime(paid).at,stamp(21));assert.equal(expenseWorkflowTime(paid,'tax').at,stamp(20));
 assert.equal(expenseWorkflowTime({...paid,audit:[]}).at,null);
 assert.equal(expenseWorkflowTime({...row,settlement:{mode:'no_reimbursement',created_at:stamp(22)}}).at,stamp(22));
 assert.equal(expenseWorkflowTime({...f.approved,obligation:{...f.approved.obligation,waived:true},audit:[event(503,'waived',23)]}).at,stamp(23));
 // An immediate paid purchase still enters the Finance review queue at submission, not payment.
 assert.equal(expenseWorkflowTime({...paid,status:'submitted'},'submitted').at,stamp(18));
});
test('Tax re-entry follows revision transitions; pending-to-pending does not reset waiting age; redacted history is unknown',()=>{
 const f=workflowFixture(),pending={...tax,vat_state:'pending',eligibility:'pending',wht_state:'pending',reviewed_at:stamp(21)};
 const row={...f.approved,obligation:null,tax_review:{...pending,revision:2,reviewed_at:stamp(23)},audit:[event(1,'tax_reviewed',21,pending)]};
 assert.equal(expenseWorkflowTime(row,'tax').at,stamp(20));
 assert.equal(expenseWorkflowTime({...row,audit:[event(1,'tax_reviewed',21,tax)]},'tax').at,stamp(23));
 assert.equal(expenseWorkflowTime({...row,audit:[event(1,'tax_reviewed',21)]},'tax').at,null);
 assert.equal(expenseWorkflowTime({...row,reviewed_at:null,audit:[]},'tax').at,null);
});
test('F: payable materialization is distinct from distribution finalization; groups sort by newest/oldest open right across source families',()=>{
 const f=workflowFixture(),before=JSON.stringify(f);
 f.revenue[0].components[0].created_at=stamp(22);f.revenue[0].components[0].finalized_at=stamp(10);
 let entries=payableQueueEntries(f.revenue,f.expenses,'newest');assert.equal(entries[0].source,'revenue_distribution');assert.equal(entries[0].at,stamp(22));
 assert.equal(entries[1].rows[0].id,f.approved.obligation.id);assert.equal(entries[1].rows.length,2);assert.equal(entries[1].rows[1].created_at,stamp(18));
 const oldest=payableQueueEntries([],f.expenses,'oldest');assert.equal(oldest[0].rows[0].created_at,stamp(18));
 const sameName=f.expenses.map(e=>({...e,payee_name:'Same name'}));assert.equal(payableQueueEntries([],sameName,'newest').length,2);
 const separateCurrency={...f.expenses[0],id:id(999),currency:'USD'};assert.equal(payableQueueEntries([],[...f.expenses,separateCurrency],'newest').length,3);
 const g=structuredClone(f.revenue[0]);g.components[0].status='settled';g.components[0].created_at=stamp(30);
 const recent=structuredClone(f.revenue[1]);recent.components[0].created_at=stamp(18);
 assert.equal(orderPayableGroups([g,recent],'newest')[0].recipient_id,recent.recipient_id,'A settled right does not make its recipient newly payable');
 assert.equal(JSON.stringify(workflowFixture()),before);
});
test('Historical missing dates remain unknown, sort behind known dates in both directions, and never fall back to business/updated time',()=>{
 const f=workflowFixture();assert.equal(claimWorkflowTime(f.missing).at,null);
 for(const order of ['newest','oldest'])assert.equal(orderByWorkflow([f.missing,f.older],r=>claimWorkflowTime(r).at,r=>r.id,order)[0].id,f.older.id);
 for(const value of ['2026-09-20','2026-09-20T04:00:00','invalid',null])assert.equal(workflowTimestamp(value),null);
 assert.equal(claimWorkflowTime({...f.missing,origin:'legacy_claim',submitted_at:stamp(15),audit:[event(10,'legacy_bridged',20)]}).event,'legacyEntered');
 assert.equal(claimWorkflowTime({...f.missing,origin:'legacy_claim',submitted_at:stamp(15),audit:[]}).at,null);
 const g=workflowFixture().revenue[0];g.components.forEach(c=>delete c.created_at);assert.equal(payableQueueEntries([g],[],'newest')[0].at,null);
});

for(const locale of ['th','en'])test(`${locale}: rendered queues expose both dates, real sort options and preserve filters/amounts`,()=>{
 const f=workflowFixture(),t=k=>translate(locale,'expenses.'+k);
 const props={rows:f.claims,viewAll:true,canCreate:false,onCreate:()=>{}};
 const newest=lists.render(locale,{'ExpenseClaimList.status':'submitted'},props,'ExpenseClaimList');
 assert.ok(newest.indexOf(f.late.description)<newest.indexOf(f.older.description));assert.ok(newest.toLowerCase().includes('datetime="'+stamp(20).toLowerCase()+'"'));assert.ok(newest.includes(t('date')));assert.ok(newest.includes(t('claimSubmitted')));
 const oldest=lists.render(locale,{'ExpenseClaimList.order':'oldest','ExpenseClaimList.status':'submitted'},props,'ExpenseClaimList');assert.ok(oldest.indexOf(f.older.description)<oldest.indexOf(f.late.description));
 const draft=lists.render(locale,{'ExpenseClaimList.status':'draft'},props,'ExpenseClaimList');assert.doesNotMatch(draft,/data-workflow-event="claimSubmitted"/);assert.match(draft,/data-workflow-event="draftCreated"/);
 const company=lists.render(locale,{'ExpenseList.state':'submitted'}, {rows:f.company,claims:false},'ExpenseList');assert.ok(company.indexOf('Late Company expense')<company.indexOf(f.older.description));
 const q=queue.render(locale,{}, {canReadExpense:true,canReadRevenue:true,isAdmin:false,fixture:{revenue:f.revenue,expenses:f.expenses}},'MultiSourcePayables');assert.ok(q.indexOf('Z New recipient')<q.indexOf('A Older recipient'));assert.doesNotMatch(q,/data-source-family="revenue_distribution"/);assert.ok(q.includes(t('readyToPay')));assert.ok(q.includes(t('oldestWaiting')));assert.doesNotMatch(q,/<input[^>]*(submitted|ready|workflow)/);
});
test('G: migrations, Legacy, category/modal/lifecycle/data readers and financial calculations are unchanged',()=>{
 const files=['app/finance/expense-claims/page.tsx','app/finance/expenses/create-modal.tsx','app/finance/expenses/categories.ts','app/finance/FinanceSidebar.tsx','app/finance/workflow-time.ts',...cp.execFileSync('git',['ls-tree','-r','--name-only','HEAD','supabase/migrations'],{encoding:'utf8'}).trim().split('\n')];
 for(const file of files)assert.equal(fs.readFileSync(file,'utf8'),cp.execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'}),file);
 const source=fs.readFileSync('app/finance/workflow-time.ts','utf8');assert.doesNotMatch(source,/Date\.now|new Date\(|expense_date|updated_at|supabase|\.rpc\(/);
 const sql=fs.readFileSync('supabase/migrations/202607180055_add_expense_purchase_settlement_foundation.sql','utf8');assert.match(sql,/submitted_at=clock_timestamp\(\)/);assert.match(sql,/reviewed_at=clock_timestamp\(\)/);assert.match(sql,/'evidence_json',case when public.money_allocation_admin\(\) then a.evidence_json end/);
 const entitlement=fs.readFileSync('supabase/migrations/202607180048_add_payable_entitlement_foundation.sql','utf8');assert.match(entitlement,/e.created_at<>s.materialized_at/);
});
