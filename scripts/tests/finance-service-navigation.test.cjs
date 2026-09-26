/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), cp = require('node:child_process'), ts = require('typescript');
const { createRequire } = require('node:module');
const { root } = require('./receipt-render-fixture.cjs');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');
const { financeNavigationItems, financeNavigationLinks, activeFinancePage } = require(root + '/app/finance/finance-navigation.ts');
const { buildPermissions } = require(root + '/lib/permissions.ts');
const { translate } = require(root + '/lib/i18n/catalog.ts');
const nav = workspaceFixture('app/finance/FinanceSidebar.tsx', ['FinanceSidebar'], { './statement/navigation': { StatementAccountNavigation: () => null } });
const baseline = cp.execFileSync('git', ['show', 'aaad6c55912462754a0f9de7ed60eb20e339ee99:app/finance/finance-navigation.ts'], { encoding: 'utf8' });
const prior = {};
new Function('require', 'exports', ts.transpileModule(baseline, { compilerOptions: { module: 1, target: 9 } }).outputText)(createRequire(root + '/app/finance/finance-navigation.ts'), prior);
const p = buildPermissions({ role: 'admin' });
const render = (locale, pathname, state = {}, permissions = p) => nav.render(locale, state, { permissions, pathname, onNavigate() {} }, 'FinanceSidebar');

for (const locale of ['th', 'en']) {
  test(locale + ': service grouping retains routes, order, original permissions and all other navigation', () => {
    for (const role of ['admin', 'partner', 'finance', 'staff']) for (const quotation of [false, true]) for (const charges of [false, true]) {
      const permissions = { ...buildPermissions({ role }), canViewFinanceQuotations: quotation, canViewFinanceBillableCharges: charges };
      const items = financeNavigationItems(permissions, locale), group = items.find(i => i.group === 'service-fees');
      assert.equal(Boolean(group), quotation || charges);
      assert.deepEqual(items.filter(i => i.group !== 'service-fees'), prior.financeNavigationItems(permissions, locale).filter(i => !['fee-agreements', 'billable-charges'].includes(i.page)));
      assert.deepEqual(financeNavigationLinks(permissions, locale).map(({ href, page }) => ({ href, page })), prior.financeNavigationLinks(permissions, locale).map(({ href, page }) => ({ href, page })));
      if (group) {
        assert.equal(group.label, locale === 'th' ? 'ค่าบริการ' : 'Service Fees');
        assert.deepEqual(group.children.map(i => i.href), [quotation && '/finance/fee-agreements', charges && '/finance/billable-charges'].filter(Boolean));
        if (quotation) assert.equal(items[items.indexOf(group) - 1].page, 'quotations');
      }
    }
  });
  test(locale + ': helper text, accessible selection and semantic paths use the existing sidebar', () => {
    const html = render(locale, '/finance/billable-charges');
    for (const key of ['finance.nav.serviceFees', 'finance.nav.feeAgreements', 'finance.nav.fromQuotation', 'finance.charge.nav', 'finance.nav.withoutQuotation']) assert.ok(html.includes(translate(locale, key)), key);
    assert.match(html, /aria-expanded="true" aria-controls="finance-service-fees"/);
    assert.match(html, /href="\/finance\/billable-charges" aria-current="page"/);
    assert.match(html, /data-service-path="quotation"/); assert.match(html, /data-service-path="additional"/);
    assert.match(html, /<small>[^<]+<\/small>/);
    assert.doesNotMatch(html, /role="alert"|data-tone="warning"|data-tone="danger"/);
    assert.ok(html.includes('lucide-file-check')); assert.ok(html.includes('lucide-file-plus'));
  });
  test(locale + ': child/deep-link routes auto-expand, including existing Billing Plan mapping', () => {
    for (const route of ['/finance/fee-agreements', '/finance/fee-agreements/fixture', '/finance/billing-plans/fixture', '/finance/billable-charges']) {
      const html = render(locale, route, { 'FinanceSidebar.servicePreference': { path: '/finance/invoices', open: false } });
      assert.match(html, /aria-expanded="true" aria-controls="finance-service-fees"/);
      assert.ok(html.includes(`href="/finance/${activeFinancePage(route, 'quotations')}" aria-current="page"`));
    }
    assert.match(render(locale, '/finance/invoices'), /id="finance-service-fees" hidden=""/);
    assert.doesNotMatch(render(locale, '/finance/invoices', { 'FinanceSidebar.servicePreference': { path: '/finance/invoices', open: true } }), /id="finance-service-fees" hidden=""/);
    assert.match(render(locale, '/finance/billable-charges', { 'FinanceSidebar.servicePreference': { path: '/finance/billable-charges', open: false } }), /id="finance-service-fees" hidden=""/);
  });
}

test('Navigation-only contract preserves page titles, financial files, permissions and SQL', () => {
  const files = cp.execFileSync('git', ['diff', '--name-only', 'aaad6c55912462754a0f9de7ed60eb20e339ee99'], { encoding: 'utf8' }).trim().split('\n');
  for (const file of files) assert.doesNotMatch(file, /\.sql$|lib\/permissions|\/page\.tsx$|\/data\.ts$/);
  assert.equal(translate('th', 'finance.invoice.ui.additionalCharges'), 'รายการเรียกเก็บนอกใบเสนอราคา');
  assert.equal(translate('en', 'finance.invoice.ui.additionalCharges'), 'Non-Quotation Charges');
  const css = fs.readFileSync(root + '/app/finance/finance-sidebar.module.css', 'utf8');
  assert.match(css, /--service-accent:#215cab/); assert.match(css, /--service-accent:#8a5309/);
  assert.match(css, /\.children\[hidden\]\s*\{\s*display:none/);
});
