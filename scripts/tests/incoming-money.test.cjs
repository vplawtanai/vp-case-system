/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
require('./receipt-render-fixture.cjs');
const list = require('../../app/finance/payments/incoming-money.ts');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');
const { translate } = require('../../lib/i18n/catalog.ts');
const page = workspaceFixture('app/finance/payments/page.tsx', ['IncomingMoney'], { '../quotations/shared': { QuotationGuard: () => null } });
const payment = (i, status = 'confirmed') => ({ id: String(i).padStart(8, '0') + '-0000-4000-8000-000000000001', internal_reference: null, client_id: 'client', received_on: '2026-09-05', created_at: new Date(Date.UTC(2026, 8, 5, 0, 0, i)).toISOString(), cash_amount: '4859.81', wht_amount: '140.19', settlement_amount: '5000.00', currency: 'THB', status });
const direct = (i, unclassified = false, status = 'draft') => ({ ...payment(i, status), payer_name: 'Stored direct payer', gross_amount: '5000.00', unclassified });
function fixture(payments = [], receipts = []) {
  const tables = { finance_payments: payments, finance_direct_money_receipts: receipts, clients: [{ id: 'client', name: 'Stored client' }] }, reads = [];
  return { reads, client: { from(table) {
    assert.ok(Object.hasOwn(tables, table)); let rows = tables[table], orders = []; const read = { table, filters: [] }; reads.push(read);
    const q = { select(fields) { read.fields = fields; return q; }, order(key) { orders.push(key); return q; },
      eq(key, value) { read.filters.push([key, value]); rows = rows.filter(r => r[key] === value); return q; },
      in(key, values) { rows = rows.filter(r => values.includes(r[key])); return q; },
      range(start, end) { read.range = [start, end]; rows = [...rows].sort((a, b) => { for (const key of orders) { if (a[key] < b[key]) return 1; if (a[key] > b[key]) return -1; } return 0; }).slice(start, end + 1); return q; },
      then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); } }; return q;
  } } };
}
test('All is default; adapters preserve stored values and keep source/lifecycle/classification separate', async () => {
  assert.deepEqual(list.initialMoneyFilters, { source: 'all', status: '', classification: 'all' });
  const p = payment(1), d = direct(2, true, 'confirmed'), before = JSON.stringify([p, d]);
  const f = fixture([p], [d]), result = await list.readIncomingMoneyPage(f.client, list.initialMoneyFilters, list.initialMoneyOffsets);
  assert.deepEqual(result.rows.map(r => r.source), ['direct', 'invoice']);
  for (const r of result.rows) assert.deepEqual([r.cash, r.wht, r.gross], ['4859.81', '140.19', '5000.00']);
  assert.equal(result.rows[0].unclassified, true); assert.equal(result.rows[1].unclassified, null);
  assert.equal(result.rows[0].payer, 'Stored direct payer'); assert.equal(result.rows[1].payer, 'Stored client');
  assert.equal(JSON.stringify([p, d]), before);
  assert.equal(list.incomingPayment({ ...p, internal_reference: 'USER-REF' }, null).reference, 'USER-REF');
});
test('Source and exact lifecycle filters stay read-only; classification only queries the stored Direct flag', async () => {
  for (const source of ['all', 'invoice', 'direct']) for (const status of ['', 'draft', 'confirmed', 'cancelled', 'reversed']) {
    const f = fixture([payment(1, 'confirmed'), payment(2, 'cancelled')], [direct(3, true), direct(4, false, 'confirmed')]);
    const r = await list.readIncomingMoneyPage(f.client, { source, status, classification: 'all' }, list.initialMoneyOffsets);
    assert.ok(r.rows.every(row => !status || row.status === status));
    if (source !== 'all') assert.ok(r.rows.every(row => row.source === source));
    if (source === 'invoice' || status === 'cancelled') assert.ok(f.reads.every(read => read.table !== 'finance_direct_money_receipts'));
  }
  for (const classification of ['classified', 'unclassified']) {
    const f = fixture([payment(1)], [direct(2, true), direct(3)]);
    const result = await list.readIncomingMoneyPage(f.client, { source: 'direct', status: '', classification }, list.initialMoneyOffsets);
    assert.equal(result.rows.length, 1); assert.equal(result.rows[0].unclassified, classification === 'unclassified');
    assert.deepEqual(f.reads[0].filters, [['unclassified', classification === 'unclassified']]);
  }
  assert.deepEqual(list.incomingStatuses('direct'), ['draft', 'confirmed', 'reversed']);
  assert.ok(list.incomingStatuses('all').includes('cancelled'));
});
test('Merged bounded paging consumes only displayed rows, including ties and more than 1000 records', async () => {
  const f = fixture(Array.from({ length: 1130 }, (_, i) => payment(i)), Array.from({ length: 120 }, (_, i) => direct(i * 11)));
  let offsets = list.initialMoneyOffsets, found = [], iterations = 0;
  do {
    const result = await list.readIncomingMoneyPage(f.client, list.initialMoneyFilters, offsets);
    found.push(...result.rows.map(r => r.source + ':' + r.id)); iterations++;
    if (!result.hasNext) break;
    offsets = result.nextOffsets;
  } while (iterations < 30);
  assert.equal(found.length, 1250); assert.equal(new Set(found).size, 1250);
  assert.ok(f.reads.filter(r => r.range).every(r => r.range[1] - r.range[0] === 50));
  const first = await list.readIncomingMoneyPage(f.client, list.initialMoneyFilters, list.initialMoneyOffsets);
  assert.deepEqual(first.rows.map(r => r.source + ':' + r.id), found.slice(0, 50));
});
test('Direct zero state keeps Invoice records visible; a source read failure rejects the incomplete All list', async () => {
  const f = fixture([payment(1)], []);
  assert.equal((await list.readIncomingMoneyPage(f.client, list.initialMoneyFilters, list.initialMoneyOffsets)).rows.length, 1);
  assert.equal((await list.readIncomingMoneyPage(f.client, { source: 'direct', status: '', classification: 'all' }, list.initialMoneyOffsets)).rows.length, 0);
  const fail = { from(table) { if (table === 'finance_direct_money_receipts') throw Error('Unavailable'); return f.client.from(table); } };
  await assert.rejects(list.readIncomingMoneyPage(fail, list.initialMoneyFilters, list.initialMoneyOffsets), /Unavailable/);
});
test('PostgreSQL microsecond timestamps retain exact ordering across page boundaries', async () => {
  const records = [1, 2, 3, 4].map(i => ({ ...payment(100 - i), created_at: `2026-09-05T10:00:00.00000${i}Z` }));
  const f = fixture(records, []), first = await list.readIncomingMoneyPage(f.client, list.initialMoneyFilters, list.initialMoneyOffsets, 2);
  const second = await list.readIncomingMoneyPage(f.client, list.initialMoneyFilters, first.nextOffsets, 2);
  assert.deepEqual([...first.rows, ...second.rows].map(r => r.id), [...records].reverse().map(r => r.id));
  assert.equal(second.hasNext, false);
});
for (const locale of ['th', 'en']) test(`${locale}: combined rows, badges, shared labels, states and existing destinations`, () => {
  const rows = [list.incomingPayment(payment(1), 'Stored client'), ...['draft', 'confirmed', 'reversed'].map((s, i) => list.incomingDirect(direct(i + 2, i === 1, s)))];
  const state = { 'IncomingMoney.loading': false, 'IncomingMoney.rows': rows };
  const html = page.render(locale, state, {}, 'IncomingMoney');
  for (const key of ['reference', 'payer', 'date', 'cash', 'gross', 'source.invoice', 'source.direct', 'classification.unclassified']) assert.ok(html.includes(translate(locale, 'incomingMoney.' + key)), key);
  for (const row of rows) assert.ok(html.includes('href="' + row.href + '"'));
  assert.equal((html.match(/class="[^"]*badge [^"]*unclassified"/g) || []).length, 1);
  assert.doesNotMatch(html, /option value="unclassified"|Confirm money received|Reverse money record/);
  assert.doesNotMatch(html, /Payment Draft|Payment Confirmed|ร่างการรับชำระ|ยืนยันรับชำระแล้ว/);
  const directHtml = page.render(locale, { ...state, 'IncomingMoney.filters': { source: 'direct', status: '', classification: 'unclassified' } }, {}, 'IncomingMoney');
  assert.ok(directHtml.includes(translate(locale, 'incomingMoney.classification')));
  assert.match(directHtml, /option value="unclassified" selected/);
  for (const source of ['all', 'direct']) {
    const empty = page.render(locale, { 'IncomingMoney.loading': false, 'IncomingMoney.filters': { source, status: '', classification: 'all' } }, {}, 'IncomingMoney');
    assert.ok(empty.includes(translate(locale, source === 'all' ? 'incomingMoney.empty' : 'incomingMoney.filteredEmpty')));
  }
});
test('UI and reader cannot mutate or invoke lifecycle RPCs; shared styles/permissions stay outside this change', () => {
  for (const file of ['app/finance/payments/page.tsx', 'app/finance/payments/incoming-money.ts']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\.rpc\(|\.(insert|upsert|update|delete)\(/);
  }
});
