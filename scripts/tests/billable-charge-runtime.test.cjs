/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');
const { root } = require('./receipt-render-fixture.cjs');
const { messages, translate } = require(root + '/lib/i18n/catalog.ts');
const { buildPermissions } = require(root + '/lib/permissions.ts');
const workflow = workspaceFixture('app/finance/billable-charges/BillableChargeCreateWorkflow.tsx');
const chargePage = workspaceFixture('app/finance/billable-charges/page.tsx', ['BillableChargesWorkspace', 'emptyForm'], { './BillableChargeCreateWorkflow': { default: workflow.component() } });
const composer = workspaceFixture('app/finance/invoices/compose/page.tsx', ['InvoiceComposer'], { '../../quotations/shared': {} });
const permissions = buildPermissions({ role: 'admin' });
const client = { id: '30000000-0000-4000-8000-000000000001', name: 'Synthetic Client', client_type: 'individual' };
const state = { 'BillableChargesWorkspace.profile': { role: 'admin' }, 'BillableChargesWorkspace.loadingProfile': false, 'BillableChargesWorkspace.loading': false, 'BillableChargesWorkspace.clients': [client] };

test('All literal translation references on Charges/create/Composer exist in both languages', () => {
  for (const file of ['app/finance/billable-charges/page.tsx', 'app/finance/billable-charges/BillableChargeCreateWorkflow.tsx', 'app/finance/invoices/compose/page.tsx', 'app/finance/invoices/InvoiceWorkspaceNav.tsx']) {
    const ast = ts.createSourceFile(file, fs.readFileSync(root + '/' + file, 'utf8'), 99, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isStringLiteral(node) && /^(finance|common|status)\./.test(node.text)) {
        assert.ok(messages[node.text], `${file}: missing ${node.text}`);
        for (const locale of ['th', 'en']) assert.ok(translate(locale, node.text));
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
});

test('Actual authorized empty/list/new-editor rendering no longer crashes in TH or EN', () => {
  const row = { id: 'charge', client_id: client.id, source_type: 'ad_hoc_service', description: 'Original charge', quantity: 1, unit: 'service', unit_rate: 2000, total_amount: 2000, vat_rate: 0, price_tax_mode: 'non_vat', currency: 'THB', created_at: '2026-09-01T00:00:00Z' };
  for (const locale of ['th', 'en']) for (const status of [null, 'draft', 'ready_to_invoice', 'reserved', 'invoiced', 'cancelled']) {
    const html = chargePage.render(locale, { ...state, 'BillableChargesWorkspace.charges': status ? [{ ...row, status }] : [] }, {}, 'BillableChargesWorkspace');
    assert.ok(html.includes(translate(locale, 'finance.charge.ui.create')));
    assert.ok(html.includes(translate(locale, 'finance.invoice.ui.workspace')));
    if (status) assert.match(html, /Original charge/);
    if (locale === 'en') assert.doesNotMatch(html, /[\u0e00-\u0e7f]/);
    const editor = chargePage.render(locale, { ...state, 'BillableChargesWorkspace.panelOpen': true }, {}, 'BillableChargesWorkspace');
    assert.ok(editor.includes(translate(locale, 'finance.charge.ui.saveDraft')));
  }
});

test('Read-only users do not receive a create action', () => {
  const html = chargePage.render('en', { ...state, 'BillableChargesWorkspace.profile': { role: 'staff', can_view_finance_billable_charges: true } }, {}, 'BillableChargesWorkspace');
  assert.doesNotMatch(html, />Create Billable Charge</);
});

test('Validated URL client selection reaches the existing editable form without changing commercial defaults', () => {
  for (const locale of ['th', 'en']) {
    const form = { ...chargePage.emptyForm(), clientId: client.id };
    const html = chargePage.render(locale, { ...state, 'BillableChargesWorkspace.form': form, 'BillableChargesWorkspace.panelOpen': true }, {}, 'BillableChargesWorkspace');
    assert.match(html, new RegExp(`<option value="${client.id}" selected="">`));
    assert.match(html, /value="non_vat" selected=""/);
    assert.match(html, /value="1"/);
  }
  const context = { clientId: client.id, clientName: client.name, caseId: 12, advisoryMatterId: null, matterLabel: 'Case Twelve' };
  const html = workflow.render('en', {}, { clients: [client], canManage: true, canApprove: true, context, initialSelection: { clientId: 'wrong-client', matterMode: 'unlinked', caseId: '', advisoryMatterId: '' } });
  assert.match(html, /Case Twelve/); assert.doesNotMatch(html, /wrong-client/);
});

test('Composer empty state links to existing creation route with encoded customer, without creating or selecting data', () => {
  for (const locale of ['th', 'en']) {
    const html = composer.render(locale, { 'InvoiceComposer.loading': false, 'InvoiceComposer.clients': [client], 'InvoiceComposer.clientId': client.id }, { permissions }, 'InvoiceComposer');
    assert.ok(html.includes(translate(locale, 'finance.invoice.composer.noReadyCharges')));
    assert.match(html, new RegExp(`href="/finance/billable-charges\\?new=1&amp;client=${client.id}"`));
    assert.ok(html.includes(translate(locale, 'finance.charge.ui.create')));
  }
  const html = composer.render('en', { 'InvoiceComposer.loading': false, 'InvoiceComposer.clientId': client.id }, { permissions: { ...permissions, canManageFinanceBillableCharges: false } }, 'InvoiceComposer');
  assert.doesNotMatch(html, /billable-charges\?new=1/);
});

test('Existing ready Charges still use the normal selection controls', () => {
  const row = { id: 'charge', client_id: client.id, case_id: null, advisory_matter_id: null, source_type: 'ad_hoc_service', description: 'Existing ready item', currency: 'THB', status: 'ready_to_invoice', total_amount: 2000, amount_before_vat: 2000, vat_amount: 0, price_tax_mode: 'non_vat', vat_rate: 0 };
  const html = composer.render('en', { 'InvoiceComposer.loading': false, 'InvoiceComposer.clients': [client], 'InvoiceComposer.clientId': client.id, 'InvoiceComposer.charges': [row] }, { permissions }, 'InvoiceComposer');
  assert.match(html, /Existing ready item/); assert.match(html, /type="checkbox"/);
  assert.doesNotMatch(html, /billable-charges\?new=1/);
});
