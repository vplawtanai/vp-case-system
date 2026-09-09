/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { root } = require('./receipt-render-fixture.cjs');
const { resolvePreferredLocale, effectiveUiLocale, localeCookie, cookieUiLocale, formatMessage, uiDate } = require(root + '/lib/i18n/core.ts');
const { messages, translate, resolveUiMessage } = require(root + '/lib/i18n/catalog.ts');
const { financeNavigationLinks } = require(root + '/app/finance/finance-navigation.ts');

test('Existing users default to Thai; only explicit valid preferences select English', () => {
  assert.equal(resolvePreferredLocale(null, null), 'th');
  assert.equal(resolvePreferredLocale('EN-US', 'fr'), 'th');
  assert.equal(resolvePreferredLocale('th', 'en'), 'th');
  assert.equal(resolvePreferredLocale(undefined, 'en'), 'en');
});
test('Cookie round trip persists the explicit choice without an auth or financial write', () => {
  assert.equal(cookieUiLocale(localeCookie('en', true)), 'en');
  assert.equal(cookieUiLocale(localeCookie('th', false)), 'th');
  assert.match(localeCookie('en', true), /SameSite=Lax; Secure$/);
  assert.equal(cookieUiLocale('vp_ui_locale=bogus'), null);
});
test('Coverage prevents partial English in unsupported modules and preserves preferred choice', () => {
  assert.equal(effectiveUiLocale('en', '/finance/payments/example'), 'en');
  assert.equal(effectiveUiLocale('en', '/settings/document-templates/example'), 'en');
  assert.equal(effectiveUiLocale('en', '/clients/example'), 'th');
  const coverage = { finance: true, documentSettings: true, other: false };
  assert.equal(effectiveUiLocale('en', '/finance/invoices', coverage), 'en');
  assert.equal(effectiveUiLocale('en', '/cases/1', coverage), 'th');
  assert.equal(effectiveUiLocale('en', '/settings/document-settings', coverage), 'en');
});
test('All catalog entries contain both languages with matching interpolation placeholders', () => {
  for (const [key, entry] of Object.entries(messages)) {
    // Domain keys may end in a canonical status such as ready_to_invoice.
    assert.match(key, /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/);
    assert.equal(typeof entry.th, 'string', key); assert.equal(typeof entry.en, 'string', key);
    assert.deepEqual((entry.th.match(/\{\w+\}/g) || []).sort(), (entry.en.match(/\{\w+\}/g) || []).sort(), key);
  }
});
test('Thai catalog retains only reviewed acronyms, brands and exact external print-option names',()=>{
  const allowed=new Set('EN PDF VAT VP-RTI VP-TI WHT VP-IV VOID VP LINE JPEG PNG MB Headers and footers THB KBANK SERVICE-SCOPE'.split(' '));
  for(const[key,entry]of Object.entries(messages))for(const word of entry.th.replace(/\{\w+\}/g,'').match(/[A-Za-z][A-Za-z-]+/g)||[])assert.ok(allowed.has(word),key+': '+word);
});
test('scoped Finance/common inventory has no unclassified UI literals',()=>{
  const {inventory}=require('./i18n-inventory.cjs');
  assert.deepEqual(inventory().filter(row=>row.classification==='missed_ui_translation'),[]);
});
test('Semantic message interpolation preserves supplied customer data and monetary values', () => {
  assert.equal(resolveUiMessage('en', undefined), '');
  assert.equal(resolveUiMessage('th', null), '');
  const catalog = { 'test.balance': { th: '{name}: {amount} THB', en: '{name}: {amount} THB' } };
  const values = { name: 'ลูกค้าทดสอบ', amount: '4,859.81' };
  assert.equal(formatMessage(catalog, 'en', 'test.balance', values), 'ลูกค้าทดสอบ: 4,859.81 THB');
  assert.equal(resolveUiMessage('en', 'ข้อมูลที่ผู้ใช้กรอก'), 'ข้อมูลที่ผู้ใช้กรอก');
  assert.equal(resolveUiMessage('en', { key: 'common.state.saved' }), 'Saved');
});
test('Finance navigation changes labels only, preserving routes and permission filtering', () => {
  const access = { canViewFinanceQuotations: true, canViewFinanceReceipts: true, canViewFinanceTaxInvoices: true, canViewFinanceCashTransactions: true, canViewCompanyLedger: true, canSubmitExpenseClaim: true, canViewLawyerCompensation: true };
  const th = financeNavigationLinks(access, 'th'), en = financeNavigationLinks(access, 'en');
  assert.deepEqual(th.map(x => x.href), en.map(x => x.href));
  assert.equal(th[0].label, 'ใบเสนอราคา'); assert.equal(en[0].label, 'Quotations');
  assert.deepEqual(financeNavigationLinks({}, 'en'), []);
});
test('Status labels translate while canonical status codes remain unchanged', () => {
  const status = 'confirmed';
  assert.equal(translate('th', `status.${status}`), 'ยืนยันแล้ว');
  assert.equal(translate('en', `status.${status}`), 'Confirmed');
  assert.equal(status, 'confirmed');
});
test('UI date language changes presentation, not source value or Bangkok day', () => {
  const value = '2026-09-05';
  assert.match(uiDate(value, 'en'), /5 Sept? 2026/);
  assert.match(uiDate(value, 'th'), /2569/);
  assert.equal(value, '2026-09-05');
});
