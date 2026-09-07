/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {root,fixture,render,shared,buildPermissions,financeNavigationLinks} = require('./receipt-render-fixture.cjs');
for (const status of ['draft','issued','cancelled','voided']) test(`${status} uses the shared frozen document path without mutating source`, () => {
  const row=fixture(status); const before=JSON.stringify(row); const result=shared.receiptPresentation(row);
  assert.equal(result.ok,true); assert.equal(result.value.payment.cash,485981); assert.equal(result.value.payment.wht,14019); assert.equal(result.value.payment.settlement,500000);
  assert.equal(result.value.payment.reference,'20000000');
  const text=render(row); assert.match(text,/ใบเสร็จรับเงิน/); assert.match(text,/Receipt/); assert.match(text,/4,859.81 THB/); assert.match(text,/140.19 THB/); assert.match(text,/5,000.00 THB/);
  assert.doesNotMatch(text,/Tax Invoice|e-Receipt|<img|รับรองการหัก/);
  if(status==='voided') assert.match(text,/VOID/);
  assert.equal(JSON.stringify(row),before);
});
test('issued Receipt ignores mutable Draft/master identity and preserves multi-Invoice coverage',()=>{
  const row=fixture('issued',3);row.draft_snapshot_json.seller.company_name_th='DO NOT RENDER';
  const r=shared.receiptPresentation(row);assert.ok(r.ok);assert.equal(r.value.invoices.length,3);assert.equal(r.value.payment.settlement,1500000);
  assert.doesNotMatch(render(row),/DO NOT RENDER/);
});
for(const field of ['seller','customer','payment','invoices','receipt']) test(`missing mandatory issued ${field} fails closed`,()=>{
  const row=fixture('issued');delete row.issued_snapshot_json[field];assert.equal(shared.receiptPresentation(row).ok,false);assert.doesNotMatch(render(row),/VP-RC-202607/);
});
test('snapshot discrepancies, incomplete bank and unknown document schema fail closed',()=>{
  const changes=[r=>r.issued_snapshot_json.payment.wht_amount=150,r=>r.issued_snapshot_json.receipt.receipt_no='OTHER',r=>delete r.issued_snapshot_json.seller.tax_id,r=>delete r.issued_snapshot_json.payment.receiving_bank_account.account_number,r=>r.issued_snapshot_json.schema_version=2,r=>r.issued_snapshot_json.document_kind='tax_invoice'];
  for(const change of changes){const row=fixture('issued');change(row);assert.equal(shared.receiptPresentation(row).ok,false);}
});
test('optional Payment reference and non-bank payment methods are not fabricated',()=>{
  for(const method of ['cash','cheque','other']){const r=fixture();r.draft_snapshot_json.payment.payment_method=method;r.draft_snapshot_json.payment.receiving_bank_account=null;assert.equal(shared.receiptPresentation(r).ok,true);}
  const r=fixture();r.draft_snapshot_json.payment.receiving_bank_account=null;assert.equal(shared.receiptPresentation(r).ok,false);
  r.draft_snapshot_json.payment.receiving_account_reference='Actual stored transfer reference';assert.equal(shared.receiptPresentation(r).ok,true);
});
test('issued actor identity is mandatory even when a frozen display name exists',()=>{
  const row=fixture('issued');row.issued_snapshot_json.receipt.issued_by_name='Synthetic Issuer';
  delete row.issued_snapshot_json.receipt.issued_by_user_id;
  assert.equal(shared.receiptPresentation(row).ok,false);
});
test('Receipt actions use explicit acknowledgements and the exact reviewed snapshot',()=>{
  assert.throws(()=>shared.receiptRpc({kind:'create',paymentId:'id',externalReceiptChecked:false}));
  const r=fixture();const command=shared.receiptRpc({kind:'issue',receiptId:r.id,acknowledged:true,reviewedSnapshot:r.draft_snapshot_json});
  assert.equal(command.name,'issue_finance_receipt');assert.deepEqual(command.args.p_reviewed_snapshot_json,r.draft_snapshot_json);
  assert.throws(()=>shared.receiptRpc({kind:'void',receiptId:r.id,reason:'',acknowledged:true}));
  assert.throws(()=>shared.receiptRpc({kind:'void',receiptId:r.id,reason:'test',acknowledged:false}));
  assert.equal(shared.receiptRpc({kind:'refresh',receiptId:r.id}).name,'refresh_finance_receipt_draft');
});
test('next action respects coverage and permissions without duplicates',()=>{
  assert.equal(shared.paymentReceiptAction('draft',[],true,true).kind,'none');
  assert.equal(shared.paymentReceiptAction('confirmed',null,true,true).kind,'unavailable');
  assert.equal(shared.paymentReceiptAction('confirmed',[],true,true).kind,'create');
  for(const status of ['draft','issued']) assert.equal(shared.paymentReceiptAction('confirmed',[{id:'r',status}],true,true).kind,'open');
  assert.equal(shared.paymentReceiptAction('confirmed',[{id:'r',status:'voided'}],true,true).kind,'create');
  assert.equal(shared.paymentReceiptAction('confirmed',[],false,true).kind,'none');
});
test('Receipt view, manage, issue and void capabilities stay separate from Payment-confirm',()=>{
  for(const role of ['partner','staff']){const p=buildPermissions({role,can_confirm_finance_payments:true});assert.equal(p.canIssueFinanceReceipts,false);assert.equal(p.canViewFinanceReceipts,false);}
  for(const cap of ['view','manage','issue','void']){const p=buildPermissions({role:'staff',[`can_${cap}_finance_receipts`]:true});assert.equal(p.canViewFinanceReceipts,true);assert.equal(p.canIssueFinanceReceipts,cap==='issue');assert.ok(financeNavigationLinks(p).some(l=>l.page==='receipts'));}
  assert.equal(buildPermissions({role:'admin'}).canVoidFinanceReceipts,true);
});
test('final Issue action follows Preview and destructive actions remain separate',()=>{
  const source=fs.readFileSync(path.join(root,'app/finance/receipts/[id]/page.tsx'),'utf8');
  assert.ok(source.indexOf('<ReceiptDocument receipt={receipt}')<source.indexOf('aria-label="ตรวจสอบและยืนยันใบเสร็จ"'));
  assert.match(source,/การดำเนินการอื่น/);assert.match(source,/reviewedSnapshot: receipt.draft_snapshot_json/);assert.match(source,/reviewed === fingerprint/);
});
