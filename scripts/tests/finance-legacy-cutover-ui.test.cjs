/* eslint-disable @typescript-eslint/no-require-imports */
// UI-only release coverage. No database, credentials, application writes or network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');
const { translate } = require('../../lib/i18n/catalog.ts');
const cutoff = Date.parse('2026-09-30T17:00:00Z');

function immediateFixture(now) {
 const unexpected = () => { throw Error('Immediate read-only state must not require React effects or timers'); };
 const context = { exports: {}, Date: class extends Date { static now() { return now; } },
  require: name => name === 'react' ? { useState: unexpected, useEffect: unexpected } : {},
  setTimeout: unexpected, clearTimeout: unexpected,
 };
 const source = fs.readFileSync('app/finance/legacy-cutover.tsx', 'utf8');
 vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: 1, target: 9, jsx: ts.JsxEmit.React } }).outputText, context);
 return context.exports;
}

test('080 is immediately read-only, including before the former cutoff and with an incorrect browser clock', () => {
 for (const now of [0, cutoff - 60_000, cutoff - 1, cutoff, cutoff + 1, Date.parse('2100-01-01')]) {
  assert.equal(immediateFixture(now).useLegacyReadOnly(), true);
 }
 const source = fs.readFileSync('app/finance/legacy-cutover.tsx', 'utf8');
 assert.doesNotMatch(source, /2026-10-01|Date\.|setTimeout|useEffect|useState/);
});

const profile = { role: 'admin', active: true, financial_access: true };
const allocation = { id: 'allocation', batch_id: 'final', recipient_type: 'other', recipient_name: 'Historical recipient', role_label: 'Assistant', percent: 100, amount: 1000, is_company_share: false, payment_status: 'pending', note: '' };
const pages = [
 { route: 'expense-claims', owner: 'ExpenseClaimsPage',
  rows: { claims: ['submitted', 'approved', 'paid'].map(status => ({ id: status, claim_date: '2026-09-01', claimant_name: 'Historical claimant', category: 'Travel', amount: 100, status, ledger_entry_id: status === 'paid' ? 'historical-ledger-reference' : null })), bankAccounts: [{ id: 'bank', short_name: 'KTB' }] },
  actions: ['finance.legacy.claim.create', 'finance.legacy.actions.approve', 'finance.legacy.actions.reject', 'finance.legacy.actions.markPaid', 'finance.legacy.actions.void'],
  evidence: 'historical-ledger-reference',
 },
 { route: 'ledger', owner: 'FinanceLedgerPage',
  rows: { monthFilter: '2026-09', rows: [{ id: 'entry', transaction_date: '2026-09-01', entry_type: 'expense', category: 'Travel', amount: 100, status: 'active', description: 'Historical ledger description' }] },
  actions: ['finance.legacy.actions.edit', 'finance.legacy.actions.void'], evidence: 'Historical ledger description',
 },
 { route: 'compensation', owner: 'CompensationPage',
  rows: { selectedMonth: '2026-09', form: { received_date: '2026-09-01', received_amount: '1000', revenue_type: 'professional_fee', formula_code: 'custom', client_id: '', case_id: '', advisory_matter_id: '', description: '', note: '' }, allocations: [allocation], batches: [{ id: 'draft', status: 'draft', received_date: '2026-09-01', received_amount: 1000, formula_code: 'custom' }, { id: 'final', status: 'finalized', received_date: '2026-09-01', received_amount: 1000, formula_code: 'custom' }], allAllocations: [allocation] },
  actions: ['finance.compensation.actions.save', 'finance.compensation.actions.add', 'common.actions.remove', 'finance.legacy.actions.edit', 'finance.compensation.actions.finalize', 'finance.compensation.actions.post', 'finance.legacy.actions.markPaid', 'finance.legacy.actions.void'],
  evidence: 'Historical recipient',
 },
];
const buttons = html => [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map(m => m[1].replace(/<[^>]*>/g, '').trim());

for (const p of pages) for (const locale of ['th', 'en']) test(`${p.route} ${locale}: actual shared helper immediately hides mutations and preserves readable history`, () => {
 // Use the real helper/banner; no mocked read-only state or database access.
 const view = workspaceFixture('app/finance/' + p.route + '/page.tsx');
 const state = Object.fromEntries(Object.entries({ loadingProfile: false, loading: false, profile, ...p.rows }).map(([k,v]) => [p.owner + '.' + k, v]));
 const stored = JSON.stringify(state);
 const html = view.render(locale, state);
 assert.ok(html.includes(locale === 'th' ? 'ระบบเดิม — อ่านอย่างเดียว' : 'Legacy — Read only'));
 assert.doesNotMatch(html, /Legacy becomes read only|ระบบเดิมจะอ่านอย่างเดียวตั้งแต่|1 October 2026|1 ต\.ค\. 2569/);
 for (const key of p.actions) assert.ok(!buttons(html).includes(translate(locale, key)), 'archive mutation remains: ' + key);
 assert.ok(html.includes(p.evidence)); assert.match(html, /<table/);
 if (p.route !== 'expense-claims') assert.match(html, /type="month"/);
 if (locale === 'en') assert.doesNotMatch(html.replace(/value="[^"]*"/g,''), /[\u0e00-\u0e7f]/);
 assert.equal(JSON.stringify(state), stored, 'render must not alter stored evidence');
 if (p.route === 'ledger') {
  const filtered = view.render(locale, { ...state, [p.owner + '.entryTypeFilter']: 'income' });
  assert.ok(!filtered.includes(p.evidence), 'archive type filter still works');
 }
 if (p.route === 'compensation') {
  const filtered = view.render(locale, { ...state, [p.owner + '.selectedMonth']: '2026-08' });
  assert.ok(!filtered.includes(p.evidence), 'archive month filter still works');
 }
});
