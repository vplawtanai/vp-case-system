/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { root } = require('./receipt-render-fixture.cjs');
const { UiLocaleProvider, useI18n } = require(root + '/lib/i18n/provider.tsx');
const { translate, resolveUiMessage } = require(root + '/lib/i18n/catalog.ts');
const { uiMessage, uiDate } = require(root + '/lib/i18n/core.ts');
const { calculateFinanceLineAmounts } = require(root + '/app/finance/finance-line-amounts.ts');
const funding = require(root + '/app/finance/billable-charges/funding-semantics.ts');
const chargeContext = require(root + '/app/finance/billing-plans/charge-context.ts');
const { VatTreatmentInput } = require(root + '/app/finance/document-decision/vat-input.tsx');

// Evaluate actual UI declarations only. No application auth, client or network imports.
function workspace(file, names) {
  const source = fs.readFileSync(root + '/' + file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n');
  const code = ts.transpileModule(declarations + '\nexports.fixture = { ' + names.join(', ') + ' };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const output = {};
  const context = {
    exports: output, React, useI18n, translate, resolveUiMessage, uiMessage, uiDate,
    useState: React.useState, useMemo: React.useMemo, useRef: React.useRef,
    calculateFinanceLineAmounts, ...funding, ...chargeContext, VatTreatmentInput,
    styles: new Proxy({}, { get: (_, key) => String(key) }),
    Link: ({ children, ...props }) => React.createElement('a', props, children),
    supabase: new Proxy({}, { get() { throw new Error('UI fixture must not access Supabase'); } }),
  };
  vm.runInNewContext(code, context, { filename: file });
  return { ...output.fixture, context };
}
const charge = workspace('app/finance/billable-charges/BillableChargeCreateWorkflow.tsx', [
  'BillableChargeCreateWorkflow', 'emptyForm', 'validateDraft', 'validateReady', 'calculateAmounts', 'fingerprint', 'focusFirstError', 'Field',
]);
const chargePage = workspace('app/finance/billable-charges/page.tsx', ['BillableChargeModalDetail', 'localizedStatusTabs']);
const plan = workspace('app/finance/billing-plans/[id]/page.tsx', ['ReadyChargePreview', 'billingPlanUiLabels', 'validateBillingPlanDraft', 'billingPlanDraft', 'invoiceHistoryTimestamp']);
const coverage = { finance: true, documentSettings: true, other: false };
function render(locale, element) {
  return renderToStaticMarkup(React.createElement(UiLocaleProvider, { initialLocale: locale, pathname: '/finance/billing-plans/fixture', coverage }, element));
}

test('Charge creation renders complete English system UI and restores Thai', () => {
  const props = { canManage: true, canApprove: true, clients: [{ id: 'client', name: 'Original Client' }] };
  const en = render('en', React.createElement(charge.BillableChargeCreateWorkflow, props));
  const th = render('th', React.createElement(charge.BillableChargeCreateWorkflow, props));
  assert.doesNotMatch(en, /[\u0e00-\u0e7f]/);
  assert.match(en, /Save Draft/);
  assert.match(th, /บันทึกร่าง/);
  assert.match(en, /Original Client/);
  assert.match(th, /Original Client/);
});

test('Charge validation descriptors change language without changing missing requirements or focus', () => {
  const form = charge.emptyForm();
  const errors = charge.validateReady(form);
  assert.ok(errors.clientId && errors.description && errors.unit && errors.economicClassification && errors.unitRate);
  const en = resolveUiMessage('en', errors.clientId), th = resolveUiMessage('th', errors.clientId);
  assert.doesNotMatch(en, /[\u0e00-\u0e7f]/);
  assert.match(th, /ลูกค้า/);
  for (const locale of ['th', 'en']) {
    let focused = false;
    const label = translate(locale, 'finance.invoice.ui.customer');
    const html = render(locale, React.createElement(charge.Field, { label, error: errors.clientId }, React.createElement('input')));
    charge.context.window = { requestAnimationFrame: callback => callback() };
    charge.context.document = { getElementById: id => {
      assert.ok(html.includes('id="' + id + '"'));
      return { scrollIntoView() {}, querySelector: () => ({ focus() { focused = true; } }) };
    } };
    charge.focusFirstError({ clientId: errors.clientId }, locale);
    assert.equal(focused, true);
  }
});

test('Charge calculations and unsaved form values are independent of UI locale', () => {
  const form = { ...charge.emptyForm(), clientId: 'client', description: 'คำอธิบายเดิม', quantity: '1', unit: 'ครั้ง', unitRate: '5000', priceTaxMode: 'vat_inclusive', vatRate: '7', economicClassification: 'professional_fee' };
  const fingerprint = charge.fingerprint(form), amounts = charge.calculateAmounts(form);
  assert.equal(amounts.amountBeforeVat, 4672.9);
  assert.equal(amounts.vatAmount, 327.1);
  assert.equal(amounts.totalAmount, 5000);
  for (const locale of ['en', 'th']) {
    funding.billableChargeNatureLabel(form.sourceType, locale);
    assert.equal(charge.fingerprint(form), fingerprint);
    assert.equal(JSON.stringify(charge.calculateAmounts(form)), JSON.stringify(amounts));
    assert.equal(Object.keys(charge.validateReady(form)).length, 0);
  }
});

test('Billing Plan and Charge lifecycle codes retain identical bilingual keys', () => {
  const th = plan.billingPlanUiLabels('th'), en = plan.billingPlanUiLabels('en');
  for (const group of ['planStatus', 'installmentStatus', 'billingMethod', 'triggerType', 'invoiceStatus']) {
    assert.deepEqual(Object.keys(th[group]), Object.keys(en[group]));
    for (const label of Object.values(en[group])) assert.doesNotMatch(label, /[\u0e00-\u0e7f]/);
  }
  assert.deepEqual(chargePage.localizedStatusTabs('th').map(tab => tab.value), chargePage.localizedStatusTabs('en').map(tab => tab.value));
  assert.deepEqual(th.allocationColumns.map(column => [column.key, column.width]), en.allocationColumns.map(column => [column.key, column.width]));
});

test('Ready Charge review uses translated sentences but preserves descriptions and totals', () => {
  const charges = [1, 2, 3, 4].map(index => ({ id: String(index), status: 'ready_to_invoice', total_amount: 2000, currency: 'THB', description: 'Original charge ' + index }));
  const props = { charges, installmentTotal: 10000, currency: 'THB', onViewAll() {} };
  const en = render('en', React.createElement(plan.ReadyChargePreview, props));
  const th = render('th', React.createElement(plan.ReadyChargePreview, props));
  assert.doesNotMatch(en, /[\u0e00-\u0e7f]/);
  for (const html of [en, th]) { assert.match(html, /18,000.00 THB/); assert.match(html, /Original charge 1/); }
  assert.match(en, /View All \(4\)/);
});

test('Plan validation remains authoritative while errors and Invoice history follow locale', () => {
  const form = { title: 'Stored Thai title', description: 'Original note', installments: [{ id: 'installment', installment_no: 2, title: '', trigger_type: 'manual' }] };
  const before = JSON.stringify(form), error = plan.validateBillingPlanDraft(form);
  assert.equal(resolveUiMessage('en', error), 'Enter the title for Installment 2.');
  assert.match(resolveUiMessage('th', error), /งวดที่ 2/);
  assert.equal(JSON.stringify(form), before);
  const invoice = { document_status: 'voided', voided_at: '2026-09-01T00:00:00Z' };
  assert.match(plan.invoiceHistoryTimestamp(invoice, 'en'), /^Voided /);
  assert.match(plan.invoiceHistoryTimestamp(invoice, 'th'), /^ยกเลิกเมื่อ /);
});
