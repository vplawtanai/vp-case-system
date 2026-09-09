/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,render}=require('./combined-document-render-fixture.cjs');
const {root}=require('./receipt-render-fixture.cjs');
const {combinedTaxRow}=require(root+'/app/finance/combined-documents/shared.ts');
const {resolveVatEvidence}=require(root+'/app/finance/document-decision/shared.ts');
test('040 VAT display preserves explicit semantics without classification/description guessing',()=>{
  assert.equal(resolveVatEvidence(null,true,7),'standard_rate');
  assert.equal(resolveVatEvidence(null,false,0),'unknown');
  for(const treatment of ['zero_rated','exempt','outside_scope','disbursement','pass_through']){
    assert.equal(resolveVatEvidence({treatment,reason:'Approved evidence'},treatment==='zero_rated',0),treatment);
    assert.equal(resolveVatEvidence({treatment},treatment==='zero_rated',0),'unknown');
  }
  assert.equal(resolveVatEvidence({treatment:'outside_scope',reason:'Contradiction'},true,7),'unknown');
});
for(const status of ['draft','issued','cancelled'])test(`040 ${status} combined document has one identity and distinct tax/full-settlement totals`,()=>{
  const f=fixture(status),text=render(f);
  assert.ok(combinedTaxRow(f.combined,f.row));assert.match(text,/ใบเสร็จรับเงิน\/ใบกำกับภาษี/);assert.match(text,/Receipt \/ Tax Invoice/);
  assert.match(text,/ไม่อยู่ในบังคับ VAT/);assert.match(text,/6,859.81/);assert.match(text,/140.19/);assert.match(text,/7,000.00/);
  assert.doesNotMatch(text,/VP-RC-|VP-TI-|e-Receipt|e-Tax Invoice/);
  assert.equal((text.match(/VP-RTI-/g)||[]).length,status==='issued'?1:0);
});
test('040 issued combined presentation ignores mutable Draft source and fails closed on broken pairing/coverage',()=>{
  const f=fixture('issued'),before=render(f);f.row.draft_snapshot_json={};f.row.source_snapshot_json={};
  assert.equal(render(f),before);
  for(const mutate of [f=>f.combined.combined_no='VP-RTI-202607-000002',f=>f.row.combined_document_id=null,
    f=>f.combined.issued_snapshot_json.receipt.payment.wht_amount=0,
    f=>f.combined.issued_snapshot_json.tax_invoice.invoice_items.push(f.combined.issued_snapshot_json.tax_invoice.document_lines[1]),
    f=>f.combined.issued_snapshot_json.tax_invoice.seller.logo_asset=null]){
    const invalid=fixture('issued');mutate(invalid);assert.equal(combinedTaxRow(invalid.combined,invalid.row),null);
  }
});
