/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,render,shared}=require('./tax-invoice-render-fixture.cjs');
const {buildPermissions,financeNavigationLinks}=require('./receipt-render-fixture.cjs');
const {taxDraftDirty,taxIssueReady}=require('../../app/finance/tax-invoices/review.ts');
test('Tax Invoice Draft, Issued and Cancelled use frozen logo, identity and source money',()=>{
  for(const status of ['draft','issued','cancelled']){
    const row=fixture(status),view=shared.taxPresentation(row);assert.equal(view.ok,true);
    const html=render(row);for(const text of ['ใบกำกับภาษี','Tax Invoice','4,672.90','327.10','5,000.00','4,859.81','140.19','สำนักงานใหญ่'])assert.ok(html.includes(text),text);
    assert.equal(view.value.identity.branchEn,'Head Office');
    assert.doesNotMatch(html,/e-Tax|e-Receipt|signature.*\.png/i);assert.equal((html.match(/<img /g)||[]).length,1);
    if(status!=='issued')assert.match(html,/DRAFT/);
  }
});
test('Issued rendering never falls back to Draft/live company data, and incomplete or forged evidence fails closed',()=>{
  const row=fixture('issued'),expected=render(row);row.draft_snapshot_json.seller.company_name_th='MUTABLE WRONG SELLER';
  row.source_snapshot_json.invoice_item.line_total=9000;assert.equal(render(row),expected);
  for(const mutate of [r=>{r.issued_snapshot_json=null;},r=>{delete r.issued_snapshot_json.seller.logo_asset;},r=>{r.issued_snapshot_json.customer.address=null;},r=>{r.issued_snapshot_json.customer.tax_id='';},r=>{r.issued_snapshot_json.payment.wht_amount=0;},r=>{delete r.issued_snapshot_json.tax_point.approved_at;},r=>{r.issued_snapshot_json.invoice_item.vat_rate='invalid';}]){
    const r=fixture('issued');mutate(r);assert.equal(shared.taxPresentation(r).ok,false);assert.doesNotMatch(render(r),/<article/);
  }
});
test('Draft with missing identity is visible as Draft and known blockers are actionable without raw internals',()=>{
  const row=fixture();row.draft_snapshot_json.customer.address=null;assert.equal(shared.taxPresentation(row).ok,true);
  assert.match(render(row),/ยังไม่มีที่อยู่ผู้รับบริการ/);
  assert.match(shared.taxError({message:'TAX_INVOICE_PARTIAL_PAYMENT_UNSUPPORTED',details:'secret'}),/บางส่วน/);
  assert.doesNotMatch(shared.taxError({message:'SQL stack secret',details:'token'}),/secret|SQL|token/);
});
test('Tax Invoice permissions are separate from Receipt and finance privileges',()=>{
  const staff=buildPermissions({role:'staff',financial_access:true});assert.equal(staff.canIssueFinanceTaxInvoices,false);
  const view=buildPermissions({role:'staff',can_view_finance_tax_invoices:true});assert.equal(view.canViewFinanceTaxInvoices,true);assert.equal(view.canManageFinanceTaxInvoices,false);
  const issue=buildPermissions({role:'staff',can_issue_finance_tax_invoices:true});assert.equal(issue.canViewFinanceTaxInvoices,true);assert.equal(issue.canIssueFinanceReceipts,false);
  assert.ok(financeNavigationLinks(view).some(link=>link.href==='/finance/tax-invoices'));
});
test('Final Issue review fails closed for every missing acknowledgement, identity blocker, stale edit and non-Draft state',()=>{
  const good={status:'draft',canIssue:true,busy:false,dirty:false,blockerCount:0,reviewed:true,acknowledged:true,logoReady:true,delayed:true,delayAcknowledged:true};
  assert.equal(taxIssueReady(good),true);
  for(const missing of [{canIssue:false},{status:'issued'},{status:'cancelled'},{busy:true},{dirty:true},{blockerCount:1},{reviewed:false},{acknowledged:false},{logoReady:false},{delayAcknowledged:false}])assert.equal(taxIssueReady({...good,...missing}),false);
  assert.equal(taxIssueReady({...good,delayed:false,delayAcknowledged:false}),true);
  const row=fixture();assert.equal(taxDraftDirty(row,row.issue_date,row.decisions_json),false);
  assert.equal(taxDraftDirty(row,row.issue_date,{...row.decisions_json,no_earlier_event:true}),true);
  assert.equal(taxDraftDirty(row,'2026-07-03',row.decisions_json),true);
});
test('New upstream dependency guards retain actionable Thai without exposing internals',()=>{
  const payment=require('../../app/finance/payments/shared.ts'),receipt=require('../../app/finance/receipts/shared.ts'),invoice=require('../../app/finance/invoices/shared.ts');
  for(const map of [payment.safePaymentError,payment.safePaymentReallocationError,receipt.safeReceiptError,invoice.safeInvoiceError])
    assert.match(map({message:'TAX_INVOICE_ACTIVE_DEPENDENCY',details:'private stack'},'fallback'),/ใบกำกับภาษี/);
});
