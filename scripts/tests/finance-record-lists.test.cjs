/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const ts = require('typescript'), React = require('react');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');
const { fixture: combinedFixture } = require('./combined-document-render-fixture.cjs');
const { root } = require('./receipt-render-fixture.cjs');
const { translate } = require(root + '/lib/i18n/catalog.ts');
const { buildPermissions } = require(root + '/lib/permissions.ts');
let permissions = buildPermissions({ role: 'admin' });
const payments = workspaceFixture('app/finance/payments/page.tsx', ['PaymentList'], {
  '../quotations/shared': { QuotationGuard: ({ canAccess, children }) => canAccess({ permissions }) ? children({ permissions }) : React.createElement('p', null, 'Denied') },
});
const combined = workspaceFixture('app/finance/combined-documents/page.tsx', ['CombinedList', 'combinedListFacts'], {
  '../tax-invoices/access': { TaxInvoiceGuard: ({ children }) => permissions.canViewFinanceTaxInvoices ? children(permissions) : React.createElement('p', null, 'Denied') },
});
const payment = { id: '90000000-0000-4000-8000-000000000001', internal_reference: null, client_id: 'client', clientName: 'Stored Client Name', received_on: '2026-09-05', cash_amount: '4859.81', wht_amount: '140.19', settlement_amount: '5000.00', currency: 'THB', status: 'confirmed' };

test('Every requested Finance navigation destination exists; no Cash alias or fake destination', () => {
  const { financeNavigationLinks } = require(root + '/app/finance/finance-navigation.ts');
  for (const link of financeNavigationLinks(buildPermissions({ role: 'admin' }))) assert.ok(fs.existsSync(path.join(root, 'app', link.href, 'page.tsx')), link.href);
});

test('Payment list uses the identical detail access predicate, including each independent capability', () => {
  const predicate = file => {
    const ast = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), 99, true, ts.ScriptKind.TSX);
    let result;
    const visit = node => { if (ts.isJsxAttribute(node) && node.name.text === 'canAccess') result = node.initializer.expression.body.getText(ast).replace(/\s/g, ''); ts.forEachChild(node, visit); };
    visit(ast); return result;
  };
  assert.equal(predicate('app/finance/payments/page.tsx'), predicate('app/finance/payments/[id]/page.tsx'));
  for (const capability of ['canManageFinancePayments', 'canConfirmFinancePayments', 'canReverseFinancePayments', 'canReallocateFinancePayments']) {
    permissions = { [capability]: true };
    assert.match(payments.render('en', {}, {}), /Payments/);
  }
  permissions = { canViewFinanceCashTransactions: true };
  assert.equal(payments.render('en', {}, {}), '<p>Denied</p>');
});

test('Combined list requires both existing Receipt and Tax Invoice viewing permissions', () => {
  permissions = { canViewFinanceTaxInvoices: true };
  assert.match(combined.render('en', {}, {}), /Viewing requires access to both document types/);
  permissions = { canViewFinanceReceipts: true };
  assert.equal(combined.render('en', {}, {}), '<p>Denied</p>');
  permissions = { canViewFinanceReceipts: true, canViewFinanceTaxInvoices: true };
  assert.match(combined.render('en', {}, {}), /Receipt \/ Tax Invoice/);
});

for (const locale of ['th', 'en']) test(`${locale}: Payment references, client, dates, three stored amounts and status remain distinct`, () => {
  const html = payments.render(locale, { 'PaymentList.loading': false, 'PaymentList.rows': [payment] }, {}, 'PaymentList');
  assert.ok(html.includes(translate(locale, 'finance.nav.payments')));
  assert.match(html, /90000000/); assert.match(html, /Stored Client Name/);
  for (const amount of ['4,859.81', '140.19', '5,000.00']) assert.ok(html.includes(amount));
  assert.match(html, /href="\/finance\/payments\/90000000-0000-4000-8000-000000000001"/);
  assert.equal((html.match(/<td /g) || []).length, 8);
  assert.doesNotMatch(html, /<button[^>]*>[^<]*(?:Confirm|Create|Reverse|Correct)/);
});

test('Combined summaries respect Draft and issued snapshot shapes and never fall back to mutable data', () => {
  for (const status of ['draft', 'issued', 'cancelled']) {
    const row = combinedFixture(status).combined;
    const before = JSON.stringify(row), facts = combined.combinedListFacts(row);
    assert.equal(facts.settlement, 7000);
    assert.equal(facts.currency, 'THB'); assert.ok(facts.customerName);
    assert.equal(JSON.stringify(row), before);
    if (status === 'issued') {
      const expected = facts.customerName;
      row.draft_snapshot_json.customer.name = 'Changed Draft name';
      assert.equal(combined.combinedListFacts(row).customerName, expected);
      row.issued_snapshot_json = null;
      assert.equal(combined.combinedListFacts(row), null);
    }
  }
});

for (const locale of ['th', 'en']) test(`${locale}: Combined list shows number or Draft, frozen customer/payment/date/settlement and existing detail link only`, () => {
  for (const status of ['draft', 'issued', 'cancelled']) {
    const row = combinedFixture(status).combined;
    const html = combined.render(locale, { 'CombinedList.loading': false, 'CombinedList.rows': [row] }, {}, 'CombinedList');
    assert.ok(html.includes(translate(locale, 'finance.nav.combined')));
    assert.ok(html.includes(row.combined_no || row.id.slice(0, 8).toUpperCase()));
    assert.match(html, /7,000.00/);
    assert.ok(html.includes(`href="/finance/combined-documents/${row.id}"`));
    assert.equal((html.match(/<td /g) || []).length, 7);
    assert.doesNotMatch(html, /<button[^>]*>[^<]*(?:Issue|Create|Confirm|Cancel)/);
  }
});

test('Empty, loading and failed states stay bilingual; no lifecycle action appears', () => {
  for (const locale of ['th', 'en']) for (const [fixture, owner, prefix] of [[payments, 'PaymentList', 'finance.payment'], [combined, 'CombinedList', 'finance.combined']]) {
    const empty = fixture.render(locale, { [`${owner}.loading`]: false }, {}, owner);
    assert.ok(empty.includes(translate(locale, `${prefix}.list.empty`)));
    assert.doesNotMatch(empty, /href=/);
    assert.match(fixture.render(locale, {}, {}, owner), /role="status"/);
    const error = fixture.render(locale, { [`${owner}.loading`]: false, [`${owner}.error`]: true }, {}, owner);
    assert.ok(error.includes(translate(locale, `${prefix}.list.failed`)));
    assert.match(error, /role="alert"/);
  }
});

test('List queries are SELECT-only with bounded stable paging and no mutation RPCs', () => {
  for (const file of ['app/finance/payments/page.tsx', 'app/finance/combined-documents/page.tsx']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /\.rpc\(|\.(?:insert|upsert|update|delete)\(|createAuditLog|DocumentNextAction/);
    assert.match(source, /\.range\(page \* 50, page \* 50 \+ 50\)/);
    assert.match(source, /order\("created_at".*order\("id"/);
    assert.match(source, /query\.eq\("status", status\)/);
    assert.match(source, /request !== sequence\.current/);
  }
});
