/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { root, ui, fixture, completionFixture, combinedFixture, render, clientFixture, permissions, invoiceId, loadInvoicePostPaymentDocuments: load } = require('./invoice-post-payment-fixture.cjs');
const { documentDecisionLabel, documentError } = require(root + '/app/finance/document-decision/shared.ts');

test('Unpaid Invoice has no downstream document or Payment action', async () => {
  const f = clientFixture(fixture('receipt_only', []));
  const data = await load(f.client, invoiceId, permissions), html = render(data);
  assert.match(html, /No confirmed Payment/); assert.doesNotMatch(html, /<a |Continue on Payment/);
  assert.equal(f.calls.filter(call => call[0] === 'rpc').length, 0);
});

test('Issued historical Receipt is openable and tax completion keeps every blocker without duplicate Receipt or Combined action', async () => {
  const f = clientFixture(completionFixture()), data = await load(f.client, invoiceId, permissions);
  for (const locale of ['th', 'en']) {
    const html = render(data, locale);
    assert.ok(html.includes(documentDecisionLabel('tax_invoice_completion_only', locale)));
    for (const code of data.payments[0].decision.blockers) assert.ok(html.includes(documentError(code, locale)));
    assert.match(html, /href="\/finance\/receipts\/receipt-fixture"/);
    assert.match(html, /VP-RC-FIXTURE/); assert.equal((html.match(/<li>/g) || []).length, 4);
    assert.doesNotMatch(html, /href="\/finance\/combined-documents|create_|VP-RTI/);
    assert.ok(!html.includes(documentDecisionLabel('receipt_only', locale)));
    assert.ok(!html.includes(documentDecisionLabel('combined_receipt_tax_invoice', locale)));
  }
});

test('Mixed historical multi-Payment amounts never imply a line-level assignment or Receipt workaround', async () => {
  for (const kind of ['blocked_unknown_treatment', 'blocked_partial_taxable', 'blocked_multiple_invoices']) {
    const original = fixture(kind, [10000, 2000]);
    // Both Payments refer to the same whole mixed Invoice, not a matched line.
    const lines = original.payments.flatMap(entry => entry.decision.lines);
    for (const entry of original.payments) entry.decision.lines = structuredClone(lines);
    const f = clientFixture(original), data = await load(f.client, invoiceId, permissions);
    assert.deepEqual(data.payments.map(entry => entry.decision), original.payments.map(entry => entry.decision));
    const html = render(data);
    assert.match(html, /10,000.00 THB/); assert.match(html, /2,000.00 THB/);
    assert.equal((html.match(/href="\/finance\/payments\//g) || []).length, 2);
    assert.doesNotMatch(html, /Continue on Payment|Ready to prepare|Not applicable under VAT Treatment/);
    assert.equal(f.calls.filter(call => call[0] === 'rpc').length, 2);
  }
});

test('Prospective Receipt-only and VAT Combined decisions use server labels and navigate without creating', async () => {
  for (const kind of ['receipt_only', 'combined_receipt_tax_invoice']) {
    const f = clientFixture(fixture(kind)), data = await load(f.client, invoiceId, permissions), html = render(data);
    assert.ok(html.includes(documentDecisionLabel(kind, 'en')));
    assert.match(html, /Continue on Payment/); assert.doesNotMatch(html, /<button|<form/);
    assert.deepEqual(f.calls.filter(call => call[0] === 'rpc'), [['rpc', 'get_finance_document_decision', { p_payment_id: 'payment-0' }]]);
    if (kind === 'receipt_only') assert.match(html, /Not applicable under VAT Treatment/);
    else assert.doesNotMatch(html, /Not applicable under VAT Treatment/);
  }
});

test('Existing Combined Draft and Issued documents keep VP-RTI identity and one open action', async () => {
  for (const status of ['draft', 'issued']) {
    const f = clientFixture(combinedFixture(status)), data = await load(f.client, invoiceId, permissions), html = render(data);
    assert.equal((html.match(/href="\/finance\/combined-documents\/combined"/g) || []).length, 1);
    assert.doesNotMatch(html, /href="\/finance\/(receipts|tax-invoices)/);
    if (status === 'issued') { assert.match(html, /VP-RTI-FIXTURE/); assert.doesNotMatch(html, /Continue on Payment/); }
  }
});

test('Cancelled and voided Receipt history remains visible beside the current issued Receipt', async () => {
  const original = completionFixture();
  original.payments[0].receipts.unshift({ id: 'old-receipt', payment_id: 'payment-0', status: 'voided', number: 'VP-RC-OLD' }, { id: 'cancelled-draft', payment_id: 'payment-0', status: 'cancelled', number: null });
  const data = await load(clientFixture(original).client, invoiceId, permissions), html = render(data);
  assert.match(html, /VP-RC-OLD/); assert.match(html, /Voided/); assert.match(html, /Cancelled/);
  assert.match(html, /href="\/finance\/receipts\/old-receipt"/);
});

test('Draft/cancelled/reversed Payment history and fully moved-away allocations do not count as confirmed settlement', async () => {
  const f = clientFixture(fixture('receipt_only'));
  for (const status of ['draft', 'cancelled', 'reversed']) {
    f.tables.finance_payments.push({ ...f.tables.finance_payments[0], id: status, status });
    f.tables.finance_payment_effective_invoice_allocations.push({ ...f.tables.finance_payment_effective_invoice_allocations[0], payment_id: status });
  }
  // Fully reallocated Payment has no row in the effective view.
  f.tables.finance_payments.push({ ...f.tables.finance_payments[0], id: 'moved-away' });
  const data = await load(f.client, invoiceId, permissions);
  assert.equal(data.payments.length, 1);
  assert.deepEqual(f.calls.filter(call => call[0] === 'rpc').map(call => call[2].p_payment_id), ['payment-0']);
});

test('Partial settlement and WHT display use authoritative allocation/summary, not whole Payment cash', async () => {
  const original = fixture('blocked_partial_taxable', [4859.81]);
  Object.assign(original.payments[0].allocation, { effective_wht_credit_allocated: 140.19, effective_settlement_total: 5000 });
  Object.assign(original.summary, { invoice_gross_amount: 10000, confirmed_wht_credit_allocated: 140.19, economically_settled_amount: 5000, outstanding_amount: 5000, payment_status: 'partially_settled' });
  const data = await load(clientFixture(original).client, invoiceId, permissions);
  assert.equal(data.summary.confirmed_cash_allocated, 4859.81);
  assert.match(render(data), /5,000.00 THB/);
});

test('TH/EN rendering preserves all state, numbers, references and destinations', async () => {
  const f = clientFixture(completionFixture()), before = JSON.stringify(f.tables), data = await load(f.client, invoiceId, permissions);
  const beforeRender = JSON.stringify(data), th = render(data, 'th'), en = render(data, 'en');
  assert.match(th, /เอกสารหลังรับชำระ/); assert.match(en, /Post-payment Documents/);
  assert.doesNotMatch(en, /[\u0e00-\u0e7f]/);
  assert.deepEqual(th.match(/href="[^"]+"/g), en.match(/href="[^"]+"/g));
  assert.equal(JSON.stringify(data), beforeRender); assert.equal(JSON.stringify(f.tables), before);
});

test('Permission limits do not claim hidden documents are absent or query forbidden document tables', async () => {
  const f = clientFixture(completionFixture()), access = { ...permissions, canViewFinanceReceipts: false, canManageFinanceTaxInvoices: false };
  const data = await load(f.client, invoiceId, access), html = render(data, 'en', access);
  assert.equal(data.payments[0].receipts, null);
  assert.ok(!f.calls.some(call => ['finance_receipts', 'finance_combined_documents'].includes(call[1])));
  assert.match(html, /do not have permission/); assert.doesNotMatch(html, /No active Receipt|Review Requirements on Payment/);
  await assert.rejects(load(f.client, invoiceId, { canViewFinanceReceipts: false, canViewFinanceTaxInvoices: false }), /DOCUMENT_PERMISSION_DENIED/);
});

test('RLS omissions, read failures and concurrent decision/header changes fail closed', async () => {
  for (const mutate of [
    f => { f.errors.rpc = { message: 'denied' }; },
    f => { f.errors.finance_receipts = { message: 'unavailable' }; },
    f => { f.tables.finance_payments = []; },
    f => { f.tables.finance_receipts = []; },
    f => { f.tables.finance_payment_effective_invoice_allocations = []; },
    f => { f.tables.finance_invoice_settlement_summary[0].confirmed_cash_allocated = null; },
    f => { f.decisions['payment-0'].decision = 'new_unrecognized_decision'; },
    f => { f.decisions['payment-0'].lines = []; },
  ]) {
    const f = clientFixture(completionFixture()); mutate(f);
    await assert.rejects(load(f.client, invoiceId, permissions));
  }
  for (const locale of ['en', 'th']) {
    const html = ui.render(locale, { 'Load.failed': true }, { invoiceId, permissions }, 'Load');
    assert.match(html, /role="alert"/); assert.match(html, /<button/); assert.doesNotMatch(html, /href=/);
  }
});

test('Panel is Issued-only, placed after settlement, and has no mutating read path', () => {
  const source = fs.readFileSync(root + '/app/finance/document-decision/invoice-post-payment-source.ts', 'utf8');
  const panel = fs.readFileSync(root + '/app/finance/document-decision/invoice-post-payment.tsx', 'utf8');
  assert.doesNotMatch(source + panel, /\.(insert|update|upsert|delete)\s*\(|create_finance|issue_finance|cancel_finance|resolveVatEvidence|FinanceDocumentNextAction/);
  assert.deepEqual([...source.matchAll(/\.rpc\("([^"]+)"/g)].map(match => match[1]), ['get_finance_document_decision']);
  const page = fs.readFileSync(root + '/app/finance/invoices/[id]/page.tsx', 'utf8');
  assert.match(page, /invoice\.document_status === "issued" \? <InvoicePostPaymentDocuments/);
  const location = page.indexOf('<InvoicePostPaymentDocuments');
  assert.ok(location > page.indexOf('invoice-settlement-summary'));
  assert.ok(location < page.indexOf('<InvoiceDocumentReadiness'));
});
