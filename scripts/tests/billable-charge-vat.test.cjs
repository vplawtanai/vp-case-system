/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { root } = require('./receipt-render-fixture.cjs');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');
const { validateChargeVat, selectChargeVat, savedChargeVat, chargeVatChoice, refreshChargeVatErrors, noVatTreatments, isChargeVatBackendError } = require(root + '/app/finance/billable-charges/vat-workflow.ts');
const { resolveVatEvidence } = require(root + '/app/finance/document-decision/shared.ts');
const { resolveUiMessage } = require(root + '/lib/i18n/catalog.ts');
const { calculateFinanceLineAmounts } = require(root + '/app/finance/finance-line-amounts.ts');
const composer = workspaceFixture('app/finance/invoices/compose/page.tsx', ['InvoiceComposer'], { '../../quotations/shared': {} });
const creation = workspaceFixture('app/finance/billable-charges/BillableChargeCreateWorkflow.tsx', ['validateDraft', 'emptyForm', 'calculateAmounts']);
const editing = workspaceFixture('app/finance/billable-charges/page.tsx', ['validateDraft', 'emptyForm', 'calculateFormAmounts'], { './BillableChargeCreateWorkflow': { default: creation.component() } });
const none = { priceTaxMode: 'non_vat', vatRate: '0', vatTreatment: null };
const standard = { priceTaxMode: 'vat_inclusive', vatRate: '7', vatTreatment: null };
const evidence = treatment => ({ schema_version: 1, treatment, reason: 'Reviewed supporting reference' });

test('Positive-rate VAT needs no reason; custom loaded rate and price mode are retained', () => {
  for (const vatRate of ['7', '10', '5.5']) {
    const value = { ...standard, vatRate };
    assert.deepEqual(validateChargeVat(value), {});
    assert.equal(resolveVatEvidence(value.vatTreatment, true, +vatRate), 'standard_rate');
    const zero = selectChargeVat(value, 'zero');
    assert.equal(zero.priceTaxMode, 'vat_inclusive');
    assert.equal(selectChargeVat(zero, 'standard', vatRate).vatRate, vatRate);
  }
  assert.equal(chargeVatChoice({ ...standard, vatRate: '' }), 'standard');
  assert.ok(validateChargeVat({ ...standard, vatRate: '' }).vatRate);
});

test('Zero-rate VAT remains applicable and Tax-Invoice relevant with explicit evidence', () => {
  const zero = selectChargeVat(standard, 'zero');
  assert.equal(zero.vatRate, '0'); assert.equal(zero.priceTaxMode, 'vat_inclusive');
  assert.equal(zero.vatTreatment.treatment, 'zero_rated');
  assert.ok(validateChargeVat(zero).vatReason);
  const complete = { ...zero, vatTreatment: evidence('zero_rated') };
  assert.deepEqual(validateChargeVat(complete), {});
  assert.equal(resolveVatEvidence(complete.vatTreatment, true, 0), 'zero_rated');
});

test('Every supported No-VAT treatment needs explicit reason; never inferred from classification', () => {
  assert.ok(validateChargeVat(none).vatTreatment); assert.ok(validateChargeVat(none).vatReason);
  for (const treatment of noVatTreatments) {
    assert.deepEqual(validateChargeVat({ ...none, vatTreatment: evidence(treatment) }), {});
    for (const reason of ['', '   ', null]) assert.ok(validateChargeVat({ ...none, vatTreatment: { treatment, reason } }).vatReason);
    assert.ok(validateChargeVat({ ...none, vatTreatment: { treatment, reason: 'x'.repeat(2001) } }).vatReason);
  }
  assert.ok(validateChargeVat({ ...none, economicClassification: 'government_or_court_fee', description: 'VAT exempt' }).vatTreatment);
  assert.ok(validateChargeVat({ ...none, vatTreatment: evidence('zero_rated') }).vatTreatment);
  assert.ok(validateChargeVat({ ...standard, vatTreatment: evidence('outside_scope') }).vatTreatment);
});

test('New and existing Draft forms share the exact same VAT validation', () => {
  for (const fixture of [creation, editing]) for (const value of [none, standard, { ...none, vatTreatment: evidence('exempt') }, selectChargeVat(standard, 'zero')]) {
    const form = { ...fixture.emptyForm(), clientId: 'fixture-client', ...value };
    assert.equal(JSON.stringify(fixture.validateDraft(form)), JSON.stringify(validateChargeVat(value)));
  }
});

test('Messages are bilingual and stale VAT errors clear without hiding other missing fields', () => {
  const errors = validateChargeVat(none);
  for (const message of Object.values(errors)) {
    assert.match(resolveUiMessage('th', message), /VAT/);
    assert.doesNotMatch(resolveUiMessage('en', message), /[\u0e00-\u0e7f]/);
  }
  const clientError = { key: 'finance.invoice.composer.clientRequired' };
  assert.deepEqual(refreshChargeVatErrors({ ...errors, clientId: clientError }, standard), { clientId: clientError });
  assert.equal(isChargeVatBackendError({ message: 'DOCUMENT_VAT_CONFLICT', details: 'never displayed' }), true);
  assert.equal(isChargeVatBackendError({ message: 'Not allowed' }), false);
});

test('All financial calculations and canonical fields remain independent of treatment presentation', () => {
  for (const mode of ['non_vat', 'vat_exclusive', 'vat_inclusive']) for (const rate of mode === 'non_vat' ? [0] : [0, 7, 10]) {
    const form = { ...creation.emptyForm(), quantity: '2', unitRate: '2500', priceTaxMode: mode, vatRate: String(rate), vatTreatment: rate > 0 ? null : evidence(mode === 'non_vat' ? 'exempt' : 'zero_rated') };
    const expected = calculateFinanceLineAmounts(2, 2500, mode, rate);
    assert.equal(JSON.stringify(creation.calculateAmounts(form)), JSON.stringify(expected));
    assert.equal(JSON.stringify(editing.calculateFormAmounts(form)), JSON.stringify(expected));
    const before = JSON.stringify(form); validateChargeVat(form); assert.equal(JSON.stringify(form), before);
  }
});

test('Composer displays stored treatment read-only and routes missing evidence to the exact source', () => {
  const row = { id: '40000000-0000-4000-8000-000000000001', client_id: 'client', case_id: null, advisory_matter_id: null, source_type: 'ad_hoc_service', status: 'ready_to_invoice', description: 'Original service', price_tax_mode: 'non_vat', vat_rate: 0, vat_amount: 0, amount_before_vat: 2000, total_amount: 2000, currency: 'THB', vat_treatment_json: evidence('outside_scope') };
  for (const locale of ['th', 'en']) {
    const state = { 'InvoiceComposer.loading': false, 'InvoiceComposer.clients': [{ id: 'client', name: 'Original Client' }], 'InvoiceComposer.clientId': 'client', 'InvoiceComposer.charges': [row], 'InvoiceComposer.chargeIds': [row.id] };
    const html = composer.render(locale, state, { permissions: { canManageFinanceBillableCharges: true } }, 'InvoiceComposer');
    assert.ok(html.includes(locale === 'en' ? 'Outside VAT Scope' : 'ไม่อยู่ในบังคับ VAT'));
    assert.doesNotMatch(html, /name="[^"]*-treatment"|Review Source VAT|ตรวจสอบข้อมูล VAT ต้นทาง/);
    const missing = composer.render(locale, { ...state, 'InvoiceComposer.charges': [{ ...row, vat_treatment_json: null }] }, { permissions: { canManageFinanceBillableCharges: true } }, 'InvoiceComposer');
    assert.ok(missing.includes('/finance/billable-charges?charge=' + row.id));
    assert.ok(missing.includes(resolveUiMessage(locale, validateChargeVat(savedChargeVat({ ...row, vat_treatment_json: null })).vatReason)));
  }
});

test('Migration 040 contract is used as-is: positive VAT has no reason, controlled zero/non-VAT requires one', () => {
  const sql = fs.readFileSync(root + '/supabase/migrations/202607180040_add_combined_receipt_tax_invoice.sql', 'utf8');
  const body = sql.slice(sql.indexOf('create function public.finance_vat_treatment'), sql.indexOf('$vat$;', sql.indexOf('create function public.finance_vat_treatment')));
  assert.match(body, /'treatment','standard_rate','reason',null/);
  assert.match(body, /reason is null or length\(reason\)>2000/);
  for (const treatment of ['zero_rated', ...noVatTreatments]) assert.ok(body.includes("'" + treatment + "'"));
});
