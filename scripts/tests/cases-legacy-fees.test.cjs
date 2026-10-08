/* eslint-disable @typescript-eslint/no-require-imports */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('./receipt-render-fixture.cjs');
const {workspaceFixture} = require('./i18n-workspace-fixture.cjs');
const {detailText} = require('../../app/cases/[id]/labels.ts');
const base = 'app/cases/[id]/';
const records = {
 fees: [{id:'old-fee',installment_no:1,fee_type:'ค่าวิชาชีพทนาย',amount:15000,paid_amount:5000,status:'Partially Paid',due_date:'2026-01-15',paid_date:'2026-01-10',description:'Legacy fee evidence',note:'Original note',deleted_at:'2026-02-01',created_at:'2026-01-01',updated_at:'2026-02-01'}],
 expenses: [{id:'old-expense',expense_type:'Travel / ค่าเดินทาง',amount:200,reimbursed_amount:0,reimbursable:false,status:'Not Reimbursable',paid_by:'Office / สำนักงานออกแทน',expense_date:'2026-01-12',description:'Legacy expense evidence'}],
};
test('legacy fee and expense evidence is readable in TH/EN without any write controls',()=>{
 const f=workspaceFixture(base+'components/FeesSection.tsx');
 for(const locale of ['th','en']) {
  const html=f.render(locale,{'FeesSection.records':records},{caseId:'1',onAvailability:()=>{}});
  for(const value of ['Legacy fee evidence','Legacy expense evidence','Original note','15,000.00','5,000.00','200.00',detailText('Previously deleted',locale),detailText('No',locale)]) assert.ok(html.includes(value),value);
  assert.ok(html.includes(detailText('Legacy fees & expenses',locale).replaceAll('&','&amp;')));
  assert.doesNotMatch(html,/<(?:button|input|select|textarea|form)\b|role="dialog"/);
  assert.doesNotMatch(html,/Travel \/|Office \/|Reimbursable \//);
 }
});
test('no historical rows means no legacy UI; partial data renders only its category',()=>{
 const f=workspaceFixture(base+'components/FeesSection.tsx');
 assert.equal(f.render('en',{'FeesSection.records':{fees:[],expenses:[]}},{caseId:'1',onAvailability:()=>{}}),'');
 assert.equal(f.render('en',{}, {caseId:'1',onAvailability:()=>{}}),'');
 const html=f.render('en',{'FeesSection.records':{fees:[],expenses:records.expenses}},{caseId:'1',onAvailability:()=>{}});
 assert.doesNotMatch(html,/aria-label="Professional Fees"/);assert.match(html,/aria-label="Expenses"/);
 const failed=f.render('en',{'FeesSection.failed':true},{caseId:'1',onAvailability:()=>{}});assert.match(failed,/role="alert"/);
});
test('legacy reader queries only its Case, keeps deleted history and has no mutation path',()=>{
 const source=fs.readFileSync(base+'components/FeesSection.tsx','utf8');
 assert.equal((source.match(/\.eq\("case_id", caseIdNumber\)/g)||[]).length,2);
 assert.doesNotMatch(source,/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(|createAuditLog|\.is\("deleted_at"/);
 assert.match(source,/onAvailability\(next.fees.length \+ next.expenses.length > 0\)/);
});
test('fees no longer operational, historical financial permission and existing Finance linkage remain',()=>{
 const page=fs.readFileSync(base+'page.tsx','utf8');
 assert.doesNotMatch(page,/\["fees","Fees & Expenses"\]|canEditFees|canDelete=.*FeesSection/);
 assert.match(page,/permissions.canViewFees && <FeesSection caseId=\{id\} onAvailability=\{setHasLegacyFees\}/);
 assert.match(page,/permissions.canViewHistory \|\| \(permissions.canViewFees && hasLegacyFees\)/);
 assert.match(page,/permissions.canViewHistory && <AuditLogSection/);
 assert.match(page,/hash === "fees" \? "history"/);
 assert.match(page,/<FinanceQuotationsSection caseId=\{caseIdNumber \|\| id\} \/>/);
 assert.match(page,/permissions.canManageFinanceBillableCharges && caseItem.client_id/);
});
test('legacy audit records retain evidence but cannot restore; unrelated Case restore stays enabled',()=>{
 const f=workspaceFixture(base+'components/AuditLogSection.tsx',['AuditLogCard','restorableTables']);
 assert.ok(!f.restorableTables.includes('case_fee_items'));assert.ok(!f.restorableTables.includes('case_expense_items'));assert.ok(f.restorableTables.includes('case_tasks'));
 for(const table of ['case_fee_items','case_expense_items','case_tasks']) {
  const html=f.render('en',{}, {item:{id:'audit',record_id:'row',table_name:table,action:'soft_delete',old_data:{description:'Historical evidence'},new_data:{}},restoring:false,canRestore:true,onRestore:()=>{}},'AuditLogCard');
  assert.ok(html.includes('Historical evidence'));assert.equal(/<button\b/.test(html),table==='case_tasks',table);
 }
});
