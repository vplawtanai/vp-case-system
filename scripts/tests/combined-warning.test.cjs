/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {root,fixture,completionFixture,render}=require('./invoice-post-payment-fixture.cjs');
const {documentError}=require(root+'/app/finance/document-decision/shared.ts');
const {taxError}=require(root+'/app/finance/tax-invoices/shared.ts');
const code='TAX_INVOICE_EXTERNAL_COVERAGE_CHECK_REQUIRED';
test('Combined TH/EN warnings use RTI while standalone Tax Invoice stays TI; all other blockers retain exact meanings',()=>{
  for(const locale of ['th','en']){
    assert.match(documentError(code,locale,true),/VP-RTI/);assert.doesNotMatch(documentError(code,locale,true),/VP-TI/);
    assert.match(documentError(code,locale),/VP-TI/);assert.match(taxError(code,locale),/VP-TI/);
    for(const other of ['TAX_INVOICE_CUSTOMER_IDENTITY_REQUIRED','TAX_INVOICE_TAX_POINT_APPROVAL_REQUIRED','DOCUMENT_EXTERNAL_CHECK_REQUIRED'])
      assert.equal(documentError(other,locale,true),documentError(other,locale));
    const combined=fixture('combined_receipt_tax_invoice');combined.payments[0].decision.blockers=[code];
    assert.match(render(combined,locale),/VP-RTI/);assert.doesNotMatch(render(combined,locale),/VP-TI/);
    assert.match(render(completionFixture(),locale),/VP-TI/);assert.doesNotMatch(render(completionFixture(),locale),/VP-RTI/);
  }
});
test('Payment and the shared Combined editor opt into contextual wording only, without filtering backend blockers',()=>{
  const payment=fs.readFileSync(root+'/app/finance/document-decision/next-action.tsx','utf8');
  assert.match(payment,/decision\.blockers\.map\(code => .*documentError\(code, locale, paired\)/);
  const editor=fs.readFileSync(root+'/app/finance/tax-invoices/editor.tsx','utf8');
  assert.match(editor,/blockers\.map\(code => .*documentError\(code, locale, Boolean\(combined\)\)/);
  assert.match(editor,/blockerCount: blockers\.length/);
});
