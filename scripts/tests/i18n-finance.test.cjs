/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { root, fixture: receiptFixture } = require('./receipt-render-fixture.cjs');
const { fixture: taxFixture } = require('./tax-invoice-render-fixture.cjs');
const { fixture: combinedFixture } = require('./combined-document-render-fixture.cjs');
const { UiLocaleProvider, useI18n } = require(root + '/lib/i18n/provider.tsx');
const { uiMessage } = require(root + '/lib/i18n/core.ts');
const { resolveUiMessage } = require(root + '/lib/i18n/catalog.ts');
const { paymentUiLabels, paymentErrorMessage } = require(root + '/app/finance/payments/shared.ts');
const { invoiceUiLabels, invoiceErrorMessage, invoiceDraftForm, invoiceDraftFingerprint } = require(root + '/app/finance/invoices/shared.ts');
const { documentDecisionLabel, documentDecisionLabels, vatTreatmentLabel, resolveVatEvidence, documentError } = require(root + '/app/finance/document-decision/shared.ts');
const { TaxInvoiceVatSummary } = require(root + '/app/finance/tax-invoices/vat-summary.tsx');
const { ReceiptDocument } = require(root + '/app/finance/receipts/receipt-document.tsx');
const { TaxInvoiceDocument } = require(root + '/app/finance/tax-invoices/tax-document.tsx');
const { CombinedReceiptTaxDocument } = require(root + '/app/finance/combined-documents/document.tsx');
const { default: LanguageSelector } = require(root + '/app/components/LanguageSelector.tsx');
const coverage = { finance: true, documentSettings: true, other: false };
function render(locale, child, pathname = '/finance/invoices') {
  return renderToStaticMarkup(React.createElement(UiLocaleProvider, { initialLocale: locale, pathname, coverage }, child));
}
function probe() {
  const { t, locale } = useI18n();
  return React.createElement('span', { 'data-locale': locale }, t('finance.nav.invoices'));
}

test('Provider uses one locale for migrated content and its language selector', () => {
  const child = React.createElement(React.Fragment, null, React.createElement(probe), React.createElement(LanguageSelector));
  const en = render('en', child), th = render('th', child);
  assert.match(en, /data-locale="en">Invoices/);
  assert.match(th, /data-locale="th">ใบแจ้งหนี้/);
  assert.match(en, /lang="en" aria-pressed="true"/);
  assert.match(th, /lang="th" aria-pressed="true"/);
  const unsupported = render('en', child, '/cases/fixture');
  assert.match(unsupported, /data-locale="th"/);
  assert.match(unsupported, /lang="en" aria-pressed="false" disabled/);
});

test('Canonical Invoice and Payment statuses and methods have complete bilingual labels', () => {
  for (const labels of [paymentUiLabels, invoiceUiLabels]) {
    const th = labels('th'), en = labels('en');
    assert.deepEqual(Object.keys(th), Object.keys(en));
    for (const group of Object.keys(th)) {
      assert.deepEqual(Object.keys(th[group]), Object.keys(en[group]));
      for (const value of Object.values(en[group])) assert.doesNotMatch(value, /[\u0e00-\u0e7f]/);
    }
  }
  assert.equal(paymentUiLabels('en').methods.bank_transfer, 'Bank Transfer');
});

test('Every decision and VAT explanation follows UI locale without changing evidence', () => {
  for (const decision of Object.keys(documentDecisionLabels)) {
    assert.doesNotMatch(documentDecisionLabel(decision, 'en'), /[\u0e00-\u0e7f]/);
    assert.match(documentDecisionLabel(decision, 'th'), /[\u0e00-\u0e7f]/);
  }
  for (const [treatment, label] of [['zero_rated', 'VAT 0% (Zero-rated)'], ['exempt', 'VAT Exempt'], ['outside_scope', 'Outside VAT Scope']]) {
    const evidence = Object.freeze({ treatment, reason: 'Original reason' });
    const before = JSON.stringify(evidence);
    assert.equal(vatTreatmentLabel(treatment, 'en'), label);
    assert.equal(resolveVatEvidence(evidence, treatment === 'zero_rated', 0), treatment);
    assert.equal(JSON.stringify(evidence), before);
  }
  assert.equal(vatTreatmentLabel('standard_rate', 'en', 7), 'VAT 7%');
});

test('Known business errors and already-held validation descriptors can be retranslated', () => {
  const descriptor = invoiceErrorMessage({ message: 'Invoice issue date is required' }, uiMessage('finance.invoice.ui.issueFailed'));
  assert.match(resolveUiMessage('th', descriptor), /วันที่/);
  assert.equal(resolveUiMessage('en', descriptor), 'Enter the issue date.');
  const payment = paymentErrorMessage({ message: 'Not allowed' }, uiMessage('finance.invoice.ui.paymentCreateFailed'));
  assert.doesNotMatch(resolveUiMessage('en', payment), /[\u0e00-\u0e7f]/);
  assert.doesNotMatch(documentError('DOCUMENT_EXTERNAL_CHECK_REQUIRED', 'en'), /[\u0e00-\u0e7f]/);
});

test('English VAT summary translates every system label and keeps stored amounts and blockers', () => {
  const lines = [{ invoiceId: 'invoice', invoiceNumber: 'VP-IV-FIXTURE', id: 'item', description: 'Original service', currency: 'THB', beforeVat: 4672.90, vat: 327.10, treatment: 'standard_rate', rate: 7 }];
  const eligibility = { can_prepare: false, blockers: ['TAX_INVOICE_VAT_TREATMENT_UNRESOLVED', 'TAX_INVOICE_CUSTOMER_IDENTITY_REQUIRED'] };
  const before = JSON.stringify({ lines, eligibility });
  const markup = render('en', React.createElement(TaxInvoiceVatSummary, { lines, eligibility, error: '' }));
  assert.doesNotMatch(markup, /[\u0e00-\u0e7f]/);
  assert.match(markup, /4,672.90 THB/); assert.match(markup, /327.10 THB/);
  assert.match(markup, /Not Ready to Issue Tax Invoice/);
  assert.equal((markup.match(/<li>/g) || []).length, 2);
  assert.equal(JSON.stringify({ lines, eligibility }), before);
});

test('UI locale cannot change Draft fields, money or the save fingerprint', () => {
  const row = Object.freeze({ issue_date: '2026-09-05', due_date: null, customer_note: 'หมายเหตุเดิม', payment_terms_text: 'Original instructions', internal_note: 'Internal original', payment_destination_bank_account_id: 'bank', language_code: 'th', total_amount: '5000.00' });
  const form = invoiceDraftForm(row), before = JSON.stringify(row), fingerprint = invoiceDraftFingerprint(form);
  render('en', React.createElement(probe)); render('th', React.createElement(probe));
  assert.equal(invoiceDraftFingerprint(invoiceDraftForm(row)), fingerprint);
  assert.equal(JSON.stringify(row), before);
  assert.equal(form.languageCode, 'th'); assert.equal(row.total_amount, '5000.00');
});

test('Draft and issued customer Receipt/Tax/Combined markup is identical in both UI locales', () => {
  for (const status of ['draft', 'issued']) {
    const receipt = receiptFixture(status), tax = taxFixture(status), combined = combinedFixture(status);
    const before = JSON.stringify({ receipt, tax, combined });
    for (const child of [React.createElement(ReceiptDocument, { receipt }), React.createElement(TaxInvoiceDocument, { row: tax }), React.createElement(CombinedReceiptTaxDocument, combined)]) {
      assert.equal(render('en', child), render('th', child));
    }
    assert.equal(JSON.stringify({ receipt, tax, combined }), before);
  }
});
