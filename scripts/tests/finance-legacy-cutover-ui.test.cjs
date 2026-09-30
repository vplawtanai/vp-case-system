/* eslint-disable @typescript-eslint/no-require-imports */
// UI-only release coverage. No database, credentials, application writes or network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');
const { translate } = require('../../lib/i18n/catalog.ts');
const { LegacyCutoverNotice } = require('../../app/finance/legacy-cutover.tsx');
const cutoff = Date.parse('2026-09-30T17:00:00Z');

function clockFixture(initial) {
 let now = initial, value, effect, cleanup, next = 0;
 const timers = new Map();
 const context = { exports: {}, Date: class extends Date { static now() { return now; } },
  require: name => name === 'react' ? {
   useState: initialValue => { if (value === undefined) value = initialValue; return [value, v => { value = v; }]; },
   useEffect: fn => { effect = fn; },
  } : {},
  setTimeout: (fn, delay) => { const id = ++next; timers.set(id, { fn, at: now + delay }); return id; },
  clearTimeout: id => timers.delete(id),
 };
 const source = fs.readFileSync('app/finance/legacy-cutover.tsx', 'utf8');
 vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: 1, target: 9, jsx: ts.JsxEmit.React } }).outputText, context);
 context.exports.useLegacyReadOnly(); cleanup = effect();
 return {
  readOnly: () => value,
  advance(at) { now = at; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); } },
  stop: () => cleanup(),
  pending: () => timers.size,
  ...context.exports,
 };
}

test('explicit +07:00 cutoff: before/at/after, mounted-tab transition, timer cleanup and late mount', () => {
 const clock = clockFixture(cutoff - 60_000);
 assert.equal(clock.legacyCutoverAt, cutoff);
 assert.equal(clock.readOnly(), false);
 clock.advance(cutoff - 1); assert.equal(clock.readOnly(), false);
 clock.advance(cutoff); assert.equal(clock.readOnly(), true); assert.equal(clock.pending(), 0);
 assert.equal(clock.legacyIsReadOnly(cutoff + 1), true);
 const late = clockFixture(cutoff + 1); assert.equal(late.readOnly(), true); assert.equal(late.pending(), 0);
 const unmounted = clockFixture(cutoff - 60_000); unmounted.stop(); assert.equal(unmounted.pending(), 0);
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

for (const p of pages) for (const locale of ['th', 'en']) test(`${p.route} ${locale}: existing controls before cutoff; readable archive at/after cutoff`, () => {
 const clock = clockFixture(cutoff - 1);
 const view = workspaceFixture('app/finance/' + p.route + '/page.tsx', [], { '../legacy-cutover': { LegacyCutoverNotice, useLegacyReadOnly: clock.readOnly } });
 const state = Object.fromEntries(Object.entries({ loadingProfile: false, loading: false, profile, ...p.rows }).map(([k,v]) => [p.owner + '.' + k, v]));
 const stored = JSON.stringify(state);
 const before = view.render(locale, state);
 for (const key of p.actions) assert.ok(buttons(before).includes(translate(locale, key)), 'pre-cutover action missing: ' + key);
 assert.ok(before.includes(p.evidence));
 assert.ok(before.includes(locale === 'th' ? 'ระบบเดิมจะอ่านอย่างเดียวตั้งแต่' : 'Legacy becomes read only'));
 clock.advance(cutoff);
 for (const at of [cutoff, cutoff + 60_000]) {
  clock.advance(at);
  const after = view.render(locale, state);
  assert.ok(after.includes(locale === 'th' ? 'ระบบเดิม — อ่านอย่างเดียว' : 'Legacy — Read only'));
  for (const key of p.actions) assert.ok(!buttons(after).includes(translate(locale, key)), 'archive mutation remains: ' + key);
  assert.ok(after.includes(p.evidence)); assert.match(after, /<table/);
  if (p.route !== 'expense-claims') assert.match(after, /type="month"/);
  if (locale === 'en') assert.doesNotMatch(after.replace(/value="[^"]*"/g,''), /[\u0e00-\u0e7f]/);
  assert.equal(JSON.stringify(state), stored, 'render must not alter stored evidence');
 }
 if (p.route === 'ledger') {
  const filtered = view.render(locale, { ...state, [p.owner + '.entryTypeFilter']: 'income' });
  assert.ok(!filtered.includes(p.evidence), 'archive type filter still works');
 }
 if (p.route === 'compensation') {
  const filtered = view.render(locale, { ...state, [p.owner + '.selectedMonth']: '2026-08' });
  assert.ok(!filtered.includes(p.evidence), 'archive month filter still works');
 }
});
