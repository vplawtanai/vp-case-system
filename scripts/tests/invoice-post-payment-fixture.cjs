/* eslint-disable @typescript-eslint/no-require-imports */
const { root, css } = require('./receipt-render-fixture.cjs');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');
const { loadInvoicePostPaymentDocuments } = require(root + '/app/finance/document-decision/invoice-post-payment-source.ts');
const ui = workspaceFixture('app/finance/document-decision/invoice-post-payment.tsx', ['InvoicePostPaymentPanel', 'Load']);
const permissions = { canViewFinanceReceipts: true, canViewFinanceTaxInvoices: true, canManageFinanceReceipts: true, canManageFinanceTaxInvoices: true };
const invoiceId = 'invoice-fixture';
function fixture(kind = 'receipt_only', amounts = [5000]) {
  const payments = amounts.map((amount, index) => ({
    payment: { id: `payment-${index}`, status: 'confirmed', internal_reference: `PAY-${index}`, currency: 'THB' },
    allocation: { payment_id: `payment-${index}`, invoice_id: invoiceId, effective_cash_allocated: amount, effective_wht_credit_allocated: 0, effective_settlement_total: amount },
    decision: { decision: kind, lines: [{ invoice_id: invoiceId, id: 'item', description: 'Original source text', amount_before_vat: amount, vat_amount: 0, line_total: amount, vat_rate: 0, resolved_vat_treatment: { treatment: 'unknown' } }] },
    receipts: [], taxInvoices: [], combined: [],
  }));
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  return { summary: { invoice_id: invoiceId, invoice_no: 'VP-IV-FIXTURE', invoice_status: 'issued', client_id: 'client-fixture', currency: 'THB', invoice_gross_amount: total || 5000, confirmed_cash_allocated: total, confirmed_wht_credit_allocated: 0, economically_settled_amount: total, outstanding_amount: total ? 0 : 5000, payment_status: total ? 'settled' : 'unpaid', is_overdue: false }, payments };
}
function completionFixture() {
  const data = fixture('tax_invoice_completion_only'), entry = data.payments[0];
  entry.receipts.push({ id: 'receipt-fixture', payment_id: entry.payment.id, status: 'issued', number: 'VP-RC-FIXTURE' });
  Object.assign(entry.decision, { receipt_id: 'receipt-fixture', receipt_status: 'issued', blockers: ['TAX_INVOICE_CUSTOMER_IDENTITY_REQUIRED', 'TAX_INVOICE_VAT_TREATMENT_UNRESOLVED', 'TAX_INVOICE_TAX_POINT_APPROVAL_REQUIRED', 'TAX_INVOICE_EXTERNAL_COVERAGE_CHECK_REQUIRED'] });
  return data;
}
function combinedFixture(status = 'issued') {
  const data = fixture(status === 'issued' ? 'complete' : 'combined_receipt_tax_invoice'), entry = data.payments[0];
  for (const [rows, idKey, statusKey] of [['receipts', 'receipt_id', 'receipt_status'], ['taxInvoices', 'tax_invoice_id', 'tax_invoice_status'], ['combined', 'combined_id', 'combined_status']]) {
    entry[rows].push({ id: rows, payment_id: entry.payment.id, status, number: status === 'issued' ? 'VP-RTI-FIXTURE' : null, combined_document_id: rows === 'combined' ? null : 'combined' });
    Object.assign(entry.decision, { [idKey]: rows, [statusKey]: status });
  }
  return data;
}
function render(data, locale = 'en', access = permissions) {
  return ui.render(locale, {}, { data, permissions: access }, 'InvoicePostPaymentPanel');
}
// A strict in-memory Supabase read contract; no real client/network is loaded.
function clientFixture(data) {
  const tables = {
    finance_invoice_settlement_summary: [structuredClone(data.summary)],
    finance_payment_effective_invoice_allocations: data.payments.map(entry => structuredClone(entry.allocation)),
    finance_payments: data.payments.map(entry => structuredClone(entry.payment)),
  };
  for (const [table, rowsKey, numberColumn] of [['finance_receipts', 'receipts', 'receipt_no'], ['finance_tax_invoices', 'taxInvoices', 'tax_invoice_no'], ['finance_combined_documents', 'combined', 'combined_no']]) {
    tables[table] = data.payments.flatMap(entry => (entry[rowsKey] || []).map(row => ({ ...row, [numberColumn]: row.number })));
  }
  const calls = [], errors = {};
  const decisions = Object.fromEntries(data.payments.map(entry => [entry.payment.id, structuredClone(entry.decision)]));
  const client = {
    from(table) {
      if (!Object.hasOwn(tables, table)) throw Error(`Unexpected table: ${table}`);
      calls.push(['from', table]);
      let rows = tables[table], single = false;
      const query = {
        select(columns) { calls.push(['select', table, columns]); return query; },
        eq(key, value) { rows = rows.filter(row => row[key] === value); return query; },
        in(key, values) { rows = rows.filter(row => values.includes(row[key])); return query; },
        order() { return query; },
        single() { single = true; return query; },
        then(resolve, reject) { return Promise.resolve({ data: structuredClone(single ? rows[0] || null : rows), error: errors[table] || null }).then(resolve, reject); },
      };
      return query;
    },
    async rpc(name, parameters) {
      calls.push(['rpc', name, parameters]);
      if (name !== 'get_finance_document_decision') throw Error('Mutation is forbidden');
      return { data: structuredClone(decisions[parameters.p_payment_id]), error: errors.rpc || null };
    },
  };
  return { client, tables, calls, errors, decisions };
}
module.exports = { root, css, ui, fixture, completionFixture, combinedFixture, render, clientFixture, permissions, invoiceId, loadInvoicePostPaymentDocuments };
