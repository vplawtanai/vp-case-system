/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');
const { financeNavigationLinks, financeNavigationItems } = require('../../app/finance/finance-navigation.ts');
const { buildPermissions } = require('../../lib/permissions.ts');
const { translate } = require('../../lib/i18n/catalog.ts');

test('Old operational route redirects on the server without loading auth, data or payment controls', () => {
  const destination = new Error('redirect');
  let calls = 0;
  const page = workspaceFixture('app/finance/payables/page.tsx', ['PayablesPage'], {
    'next/navigation': { redirect: href => { calls++; assert.equal(href, '/finance/overview'); throw destination; } },
  });
  assert.throws(() => page.PayablesPage(), error => error === destination);
  assert.equal(calls, 1);
  const source = fs.readFileSync('app/finance/payables/page.tsx', 'utf8');
  assert.doesNotMatch(source, /use client|supabase|rpc\(|MultiSourcePayables|PayablesWorkspace|<button/);
  assert.ok(fs.existsSync('app/finance/overview/page.tsx'));
});

for (const locale of ['th', 'en']) test(`${locale}: retirement preserves source menu permissions for every existing role`, () => {
  for (const role of ['admin', 'partner', 'lawyer', 'assistant_lawyer', 'staff', 'viewer']) {
    const permissions = buildPermissions({ role, active: true }), before = structuredClone(permissions);
    const links = financeNavigationLinks(permissions, locale);
    assert.ok(!links.some(link => link.href === '/finance/payables' || link.page === 'payables'));
    const menu = financeNavigationItems(permissions, locale).flatMap(item => item.children || [item]);
    assert.ok(!menu.some(link => link.href === '/finance/payables'));
    for (const [href, allowed, label] of [
      ['/finance/expenses', permissions.canViewFinancePayables, 'expenses.title'],
      ['/finance/expenses/claims', permissions.canUseNewFinanceExpenses, 'expenses.claims'],
      ['/finance/revenue-distribution', permissions.canViewFinanceDistribution, 'revenueDistribution.title'],
    ]) {
      assert.equal(links.some(link => link.href === href), !!allowed, `${role}: ${href}`);
      if (allowed) assert.equal(links.find(link => link.href === href).label, translate(locale, label));
    }
    assert.deepEqual(permissions, before);
  }
});

test('Source payment panels remain independent and keep the existing prepare/confirm and participant contracts', () => {
  const read = path => fs.readFileSync(`app/finance/${path}`, 'utf8');
  const sourceFiles = ['expenses/workspace.tsx', 'expenses/claim-review.tsx', 'expenses/company-review.tsx', 'expenses/forms.tsx', 'expenses/request-view.tsx', 'revenue-distribution/detail.tsx', 'revenue-distribution/participant-payment.tsx'];
  for (const file of sourceFiles) assert.doesNotMatch(read(file), /["']\/finance\/payables["']|payables\/page/);
  assert.match(read('expenses/workspace.tsx'), /<ExpensePaymentPanel/);
  assert.match(read('expenses/claim-review.tsx'), /<ExpensePaymentPanel/);
  assert.match(read('expenses/forms.tsx'), /run\("prepare_finance_expense_payout"/);
  assert.match(read('expenses/forms.tsx'), /run\("confirm_finance_payout"/);
  assert.match(read('revenue-distribution/detail.tsx'), /<ParticipantPayment/);
  assert.match(read('revenue-distribution/participant-payment.tsx'), /pay_finance_distribution_participant/);
  assert.match(read('payouts/workspace.tsx'), /cancel_finance_payout/);
  assert.match(read('payables/materialize-action.tsx'), /ensure_finance_payable_entitlements/);
  for (const file of ['overview/workspace.tsx', 'tax-position/dashboard.tsx', 'payouts/workspace.tsx', 'payables/materialize-action.tsx']) assert.doesNotMatch(read(file), /["']\/finance\/payables["']/);
});

const { fixture } = require('./expense-foundation-fixture.cjs');
const payment = workspaceFixture('app/finance/expenses/forms.tsx', ['ExpensePaymentPanel'], { './company-payee': { CompanyPayeeSetup: () => null } });
for (const locale of ['th', 'en']) for (const origin of ['company_purchase', 'employee_claim']) test(`${locale}: ${origin} source retains prepare, confirm and immutable paid evidence`, () => {
  const f = fixture('list'), row = { ...f.data.rows[3], origin, personally_paid: origin === 'employee_claim' };
  const before = JSON.stringify(row);
  const props = { row, access: f.data.access, accounts: f.data.accounts, busy: false, run: () => { throw Error('No writes'); } };
  const render = (current, state = {}) => payment.render(locale, state, { ...props, row: current }, 'ExpensePaymentPanel');
  assert.ok(render(row).includes(translate(locale, 'expenses.preparePayment')));
  const draft = { ...row, payout: { id: 'synthetic', status: 'draft', net: 10700, wht: 0, gross: 10700, bank_account_id: f.data.accounts[0].id, can_confirm: true, version: 1, paid_on: '2026-09-10' } };
  assert.ok(render(draft).includes(translate(locale, 'expenses.paymentAck')));
  assert.ok(render(draft).includes(translate(locale, 'expenses.confirmPayment')));
  const paid = render({ ...draft, payout: { ...draft.payout, status: 'confirmed' } });
  assert.ok(paid.includes('10,700.00'));
  assert.doesNotMatch(paid, /<button|<form|type="checkbox"/);
  assert.equal(JSON.stringify(row), before);
});
