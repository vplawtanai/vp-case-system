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
const lifecycle = require(root + '/app/finance/fee-agreements/lifecycle.ts');
const signatories = require(root + '/app/finance/fee-agreements/signatories.ts');
const evidence = require(root + '/app/finance/fee-agreements/signing-evidence.ts');
const execution = require(root + '/app/finance/fee-agreements/execution.ts');
const sections = require(root + '/app/finance/fee-agreements/template-sections.tsx');
const signers = require(root + '/app/finance/fee-agreements/signer-editor.tsx');
const { default: FinanceSubNav } = require(root + '/app/finance/FinanceSubNav.tsx');
const { buildBillingPlanDraftFromFeeAgreement } = require(root + '/app/finance/billing-plans/draft.ts');
const file = 'app/finance/fee-agreements/[id]/page.tsx';
const source = fs.readFileSync(root + '/' + file, 'utf8');
const ast = ts.createSourceFile(file, source, 99, true, ts.ScriptKind.TSX);
const declarations = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n');
const code = ts.transpileModule(declarations + '\nexports.fixture = { Detail, AcceptedQuotationEngagementWorkspace, emptyLegalForm, agreementSavePayload, agreementFingerprint, legalFrom, lifecycleActions, mapRpcError, mapSigningError, validateSignatories, validateClauses, saveButtonLabel, PaymentTerms };', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const output = {};
const context = {
  exports: output, React, useI18n, translate, resolveUiMessage, uiMessage, uiDate,
  useMemo: React.useMemo, useRef: React.useRef, useEffect: React.useEffect, useCallback: React.useCallback,
  ...lifecycle, ...signatories, ...evidence, ...execution, ...sections, ...signers, FinanceSubNav,
  buildBillingPlanDraftFromFeeAgreement,
  useParams: () => ({ id: 'fixture' }), useRouter: () => ({ push() { throw new Error('No navigation in fixture'); } }),
  Link: ({ children, ...props }) => React.createElement('a', props, children),
  supabase: new Proxy({}, { get() { throw new Error('No Supabase access in UI fixture'); } }),
};
vm.runInNewContext(code, context, { filename: file });
const ui = output.fixture;
const coverage = { finance: true, documentSettings: true, other: false };
function render(locale, child) {
  return renderToStaticMarkup(React.createElement(UiLocaleProvider, { initialLocale: locale, pathname: '/finance/fee-agreements/fixture', coverage }, child));
}
const client = { id: 'client', name: 'Original Client', clientType: 'individual', contactName: '' };
const parties = [{ name: client.name, capacity: '', party_type: 'client', sort_order: 1, signing_mode: 'self', contractual_party_name: client.name }, { name: 'Original Firm Signer', capacity: 'Partner', party_type: 'firm', sort_order: 2 }];
function fixture(status = 'draft') {
  const installment = { installment_no: 2, title: 'งวดที่ 2', trigger_type: 'quotation_acceptance', payment_due_days: 15, amount_before_tax: 4672.9, vat_amount: 327.1, total_amount: 5000, items: [] };
  return { id: 'agreement', status, title: 'Original Agreement', agreement_no: 'VP-AG-FIXTURE', agreement_date: '2026-09-05', effective_date: '2026-09-06', commencement_date: null, expiry_date: null, currency: 'THB', amount_before_tax: 4672.9, vat_amount: 327.1, total_amount: 5000, billing_method: 'installments', language_code: 'th', execution_mode: 'paper', legal_terms_json: {}, signatories_json: parties, custom_clauses_json: [], selected_template_version_id: null, client_snapshot_json: { name: client.name }, matter_snapshot_json: { title: 'Original Matter' }, source_document_snapshot_json: { quotation_no: 'VP-QT-FIXTURE', payment_terms: { payment_method_type: 'installments', installments: [installment] } }, document_version: 1, updated_at: '2026-09-05T08:00:00Z' };
}
function detail(locale, status) {
  const agreement = fixture(status), legal = ui.legalFrom(agreement);
  const metadata = { title: agreement.title, agreementDate: agreement.agreement_date, effectiveDate: agreement.effective_date, expiryDate: '', billingMethod: agreement.billing_method, executionMode: 'paper' };
  const state = [agreement, [{ id: 'item', description: 'Original Service', quantity: 1, unit_price: 5000, vat_applicable: true, vat_rate: 7, amount_before_tax: 4672.9, vat_amount: 327.1, line_total: 5000 }], null, [], [], {}, null, false, [], client, metadata, legal, ui.agreementFingerprint(metadata, legal, agreement), false, '', false, false, '', status === 'sent', { executedOn: '', verificationConfirmed: false, note: '', reference: '' }, {}, null, false, false];
  let index = 0;
  context.useState = initial => [index < state.length ? state[index++] : typeof initial === 'function' ? initial() : initial, () => { throw new Error('No state mutation during SSR'); }];
  return render(locale, React.createElement(ui.Detail, { permissions: { canEditFinanceQuotation: true } }));
}

test('Full Fee Agreement workspace and signing panel render English, with Thai restored', () => {
  for (const status of ['draft', 'under_review', 'sent', 'signed', 'completed', 'cancelled']) {
    const en = detail('en', status), th = detail('th', status);
    assert.doesNotMatch(en, /[\u0e00-\u0e7f]/, status);
    assert.match(th, /ข้อมูลเอกสาร/);
    for (const html of [th, en]) { assert.match(html, /5,000.00/); assert.match(html, /Original Agreement/); }
    if (status === 'draft') { assert.match(en, /Save Changes|Saved/); assert.match(en, /Submit for Review/); }
    if (status === 'sent') { assert.match(en, /Confirm Signing/); assert.match(en, /Signed Document \(Optional\)/); }
  }
});

test('Accepted-Quotation engagement remains distinct from the signing lifecycle in both languages', () => {
  const agreement = { ...fixture('engagement_confirmed'), engagement_basis: 'accepted_quotation', engagement_confirmed_at: '2026-09-05T08:00:00Z' };
  const props = { agreement, items: [], quote: null, billingPlan: null, permissions: { canEditFinanceQuotation: true }, error: '', message: '', billingPlanCreating: false, cancelling: false, onOpenBillingPlan() {}, onCancel() {} };
  const en = render('en', React.createElement(ui.AcceptedQuotationEngagementWorkspace, props));
  assert.doesNotMatch(en, /[\u0e00-\u0e7f]/);
  assert.match(en, /Create Billing Plan/);
  assert.doesNotMatch(en, /Confirm Signing/);
  assert.match(render('th', React.createElement(ui.AcceptedQuotationEngagementWorkspace, props)), /การว่าจ้าง/);
});

test('Display locale leaves agreement save payloads, document language and baseline unchanged', () => {
  const agreement = fixture(), legal = { ...ui.legalFrom(agreement), internalNote: 'หมายเหตุเดิม', warnings: [uiMessage('finance.feeAgreement.workspace.warning.oldClauses')] };
  const metadata = { title: agreement.title, agreementDate: agreement.agreement_date, effectiveDate: agreement.effective_date, expiryDate: '', billingMethod: 'installments', executionMode: 'paper' };
  const before = JSON.stringify(agreement), baseline = ui.agreementFingerprint(metadata, legal, agreement);
  for (const locale of ['en', 'th']) {
    ui.saveButtonLabel(false, false, locale);
    legal.warnings.map(message => resolveUiMessage(locale, message));
    assert.equal(ui.agreementFingerprint(metadata, legal, agreement), baseline);
    assert.equal(ui.agreementSavePayload(metadata, legal, agreement).p_language_code, 'th');
    assert.equal(ui.agreementSavePayload(metadata, legal, agreement).p_legal_terms_json.internal_note, 'หมายเหตุเดิม');
  }
  assert.equal(JSON.stringify(agreement), before);
  assert.notEqual(ui.agreementFingerprint({ ...metadata, title: 'Edited title' }, legal, agreement), baseline);
});

test('Signing and Template validation descriptors translate without weakening guards', () => {
  for (const error of [ui.validateSignatories([{ ...parties[0], name: '' }], client), ui.validateClauses([{ title: '', content: '', sort_order: 1 }]), ui.mapSigningError('Actual signing date is required'), ui.mapRpcError('Not allowed')]) {
    assert.match(resolveUiMessage('th', error), /[\u0e00-\u0e7f]/);
    assert.doesNotMatch(resolveUiMessage('en', error), /[\u0e00-\u0e7f]/);
  }
  for (const file of [{ type: 'text/plain', size: 10 }, { type: 'application/pdf', size: 0 }, { type: 'application/pdf', size: 26 * 1024 * 1024 }]) assert.ok(evidence.feeAgreementEvidenceFileError(file));
  assert.equal(evidence.feeAgreementEvidenceFileError({ type: 'application/pdf', size: 10 }), '');
  assert.equal(ui.validateSignatories(parties, client), '');
  assert.deepEqual(ui.lifecycleActions('sent', 'en').map(action => action.status), ui.lifecycleActions('sent', 'th').map(action => action.status));
});

test('Signer editor translates system text and preserves authoritative party names', () => {
  const props = { value: parties, client, authorizedSigners: [], signatureRequirements: { minimum_client_signers: 1, minimum_firm_signers: 1 }, disabled: false, onChange() {} };
  const en = render('en', React.createElement(signers.FeeAgreementSignatoryEditor, props));
  assert.doesNotMatch(en, /[\u0e00-\u0e7f]/);
  assert.match(en, /Original Client/);
  assert.match(render('th', React.createElement(signers.FeeAgreementSignatoryEditor, props)), /ผู้ลงนาม/);
});

test('Template document wording and unresolved placeholders never follow the UI locale', () => {
  const template = { language_code: 'th', sections: [{ section_id: 'section', title: 'ข้อกำหนดเดิม', slots: [{ slot_id: 'slot', content: 'ข้อความต้นฉบับ {{CLIENT_NAME}}', origin_type: 'published_template_clause' }] }] };
  const document = React.createElement(sections.ResolvedTemplateSections, { template, variables: {} });
  assert.equal(render('en', document), render('th', document));
  assert.match(render('en', document), /ยังไม่มีข้อมูล/);
  const empty = { sections: [] };
  assert.doesNotMatch(render('en', React.createElement(sections.ResolvedTemplateSections, { template: empty, variables: {}, uiLocale: 'en', showProvenance: true })), /[\u0e00-\u0e7f]/);
});
