/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');
const { root } = require('./receipt-render-fixture.cjs');
const { messages, translate } = require(root + '/lib/i18n/catalog.ts');
const { buildPermissions } = require(root + '/lib/permissions.ts');
const React = require('react');
const workflow = workspaceFixture('app/finance/billable-charges/BillableChargeCreateWorkflow.tsx');
const modal = workspaceFixture('app/finance/billable-charges/BillableChargeCreateModal.tsx', [], { './BillableChargeCreateWorkflow': { default: workflow.component() }, '../../components/DetailModal': { default: ({ children, title, footer }) => React.createElement('section', { role: 'dialog' }, title, children, footer) } });
const chargePage = workspaceFixture('app/finance/billable-charges/page.tsx', ['BillableChargesWorkspace', 'emptyForm'], { './BillableChargeCreateModal': { default: modal.component() } });
const composer = workspaceFixture('app/finance/invoices/compose/page.tsx', ['InvoiceComposer'], { '../../quotations/shared': {}, '../../billable-charges/BillableChargeCreateModal': { default: modal.component() } });
const permissions = buildPermissions({ role: 'admin' });
const client = { id: '30000000-0000-4000-8000-000000000001', name: 'Synthetic Client', client_type: 'individual' };
const state = { 'BillableChargesWorkspace.profile': { role: 'admin' }, 'BillableChargesWorkspace.loadingProfile': false, 'BillableChargesWorkspace.loading': false, 'BillableChargesWorkspace.clients': [client] };

test('All literal translation references on Charges/create/Composer exist in both languages', () => {
  for (const file of ['app/finance/billable-charges/page.tsx', 'app/finance/billable-charges/BillableChargeCreateWorkflow.tsx', 'app/finance/billable-charges/BillableChargeCreateModal.tsx', 'app/finance/invoices/compose/page.tsx', 'app/finance/invoices/page.tsx']) {
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
    assert.ok(html.includes(translate(locale, 'finance.invoice.ui.additionalCharges')));
    if (status) assert.match(html, /Original charge/);
    if (locale === 'en') assert.doesNotMatch(html, /[\u0e00-\u0e7f]/);
    const editor = chargePage.render(locale, { ...state, 'BillableChargesWorkspace.createOpen': true }, {}, 'BillableChargesWorkspace');
    assert.ok(editor.includes(translate(locale, 'finance.charge.ui.saveDraft')));
  }
});

test('Read-only users do not receive a create action', () => {
  const html = chargePage.render('en', { ...state, 'BillableChargesWorkspace.profile': { role: 'staff', can_view_finance_billable_charges: true } }, {}, 'BillableChargesWorkspace');
  assert.doesNotMatch(html, />Create Charge</);
});

test('Validated URL client selection reaches the existing editable form without changing commercial defaults', () => {
  for (const locale of ['th', 'en']) {
    const form = { ...chargePage.emptyForm(), clientId: client.id };
    const html = chargePage.render(locale, { ...state, 'BillableChargesWorkspace.form': form, 'BillableChargesWorkspace.createOpen': true }, {}, 'BillableChargesWorkspace');
    assert.match(html, new RegExp(`<option value="${client.id}" selected="">`));
    assert.match(html, /checked="" value="none"/);
    assert.match(html, /value="1"/);
  }
  const context = { clientId: client.id, clientName: client.name, caseId: 12, advisoryMatterId: null, matterLabel: 'Case Twelve' };
  const html = workflow.render('en', {}, { clients: [client], canManage: true, canApprove: true, context, initialSelection: { clientId: 'wrong-client', matterMode: 'unlinked', caseId: '', advisoryMatterId: '' } });
  assert.match(html, /Case Twelve/); assert.doesNotMatch(html, /wrong-client/);
});

test('Composer empty state offers in-place creation without navigating or selecting data', () => {
  for (const locale of ['th', 'en']) {
    const html = composer.render(locale, { 'InvoiceComposer.loading': false, 'InvoiceComposer.clients': [client], 'InvoiceComposer.clientId': client.id }, { permissions }, 'InvoiceComposer');
    assert.ok(html.includes(translate(locale, 'finance.invoice.composer.noReadyCharges')));
    assert.doesNotMatch(html, /href="\/finance\/billable-charges\?new=1/);
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

test('Concise Finance navigation preserves full page title, route and access guards', () => {
  const { financeNavigationLinks, activeFinancePage } = require(root + '/app/finance/finance-navigation.ts');
  for (const [locale, label] of [['th', 'เรียกเก็บเพิ่มเติม'], ['en', 'Additional Charges']]) {
    const link = financeNavigationLinks(permissions, locale).find(item => item.page === 'billable-charges');
    assert.deepEqual(link, { href: '/finance/billable-charges', page: 'billable-charges', label });
    assert.equal(activeFinancePage(link.href), 'billable-charges');
    assert.ok(!financeNavigationLinks({ ...permissions, canViewFinanceBillableCharges: false }, locale).some(item => item.page === 'billable-charges'));
  }
});

test('Row workspace preserves charge facts, currencies, status counts and client/matter/reference search', () => {
  const rows = ['draft', 'ready_to_invoice', 'reserved', 'invoiced', 'cancelled'].map((status, index) => ({
    id: `charge-${index}`, client_id: client.id, case_id: index === 0 ? 12 : null, advisory_matter_id: index === 1 ? 'advisory' : null,
    source_type: 'ad_hoc_service', description: `Travel ${index}`, source_reference: `REFERENCE-${index}`,
    currency: 'THB', status, total_amount: 5350, amount_before_vat: 5000, vat_amount: 350,
    economic_classification: 'additional_service', price_tax_mode: 'vat_inclusive', vat_rate: 7, service_date: '2026-09-09',
  }));
  const filled = { ...state, 'BillableChargesWorkspace.charges': rows,
    'BillableChargesWorkspace.cases': [{ id: 12, client_id: client.id, file_no: 'CASE-12', title: 'Court matter คดีศาล' }],
    'BillableChargesWorkspace.advisories': [{ id: 'advisory', client_id: client.id, matter_no: 'ADV-1', title: 'Advisory สัญญา' }],
  };
  for (const locale of ['th', 'en']) {
    const render = overrides => chargePage.render(locale, { ...filled, ...overrides }, {}, 'BillableChargesWorkspace');
    const html = render({});
    assert.match(html, /<table/); assert.doesNotMatch(html, /<article/);
    assert.equal((html.match(/<tbody>[\s\S]*<\/tbody>/)[0].match(/<tr>/g) || []).length, 5);
    for (const fact of ['5,350.00 THB', '7%', 'Synthetic Client', 'CASE-12', 'ADV-1', translate(locale, 'finance.invoice.classification.additional_service')]) assert.ok(html.includes(fact), fact);
    for (const row of rows) {
      assert.ok(html.includes(`data-status="${row.status}"`));
      const filtered = render({ 'BillableChargesWorkspace.filter': row.status });
      assert.ok(filtered.includes(row.description));
      for (const other of rows.filter(other => other.id !== row.id)) assert.ok(!filtered.includes(other.description));
    }
    for (const [search, description] of [['คดีศาล', 'Travel 0'], ['CASE-12', 'Travel 0'], ['สัญญา', 'Travel 1'], ['reference-3', 'Travel 3']]) {
      const filtered = render({ 'BillableChargesWorkspace.search': search });
      assert.ok(filtered.includes(description));
      assert.equal((filtered.match(/data-status=/g) || []).length, 1);
    }
    assert.equal((render({ 'BillableChargesWorkspace.search': 'synthetic client' }).match(/data-status=/g) || []).length, 5);
    assert.ok(render({ 'BillableChargesWorkspace.search': 'no-result' }).includes(translate(locale, 'finance.charge.ui.noMatches')));
    assert.match(html, /href="\/finance\/invoices\/compose"/);
  }
});

test('Workspace polish preserves deployed business functions, modal workflows and database files', () => {
  const cp = require('node:child_process');
  const baseline = '42a8cb8510cb98a4117a60bee01323e5a7b3db65';
  const before = cp.execFileSync('git', ['show', baseline + ':app/finance/billable-charges/page.tsx'], { encoding: 'utf8' });
  const after = fs.readFileSync(root + '/app/finance/billable-charges/page.tsx', 'utf8');
  const logic = source => source.slice(source.indexOf('type ChargeStatus'), source.indexOf('  return (\n    <PageShell>'));
  assert.equal(logic(after), logic(before));
  assert.equal(after.slice(after.indexOf('        {detailCharge ?')), before.slice(before.indexOf('        {detailCharge ?')));
  const files = cp.execFileSync('git', ['diff', '--name-only', baseline], { encoding: 'utf8' }).trim().split('\n');
  assert.ok(files.every(file => !file.endsWith('.sql') && !file.startsWith('supabase/')));
});
