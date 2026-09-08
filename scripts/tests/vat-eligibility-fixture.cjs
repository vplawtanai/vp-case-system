/* eslint-disable @typescript-eslint/no-require-imports */
const { css, root } = require('./receipt-render-fixture.cjs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { TaxInvoiceVatSummary } = require(root + '/app/finance/tax-invoices/vat-summary.tsx');
const { invoiceVatLines } = require(root + '/app/finance/tax-invoices/vat-treatment.ts');
const styles = require(root + '/app/finance/tax-invoices/tax-invoices.module.css').default;
const invoiceId = '20000000-0000-4000-8000-000000000001';
function snapshot(items = [{}]) {
  const lines = items.map((item, index) => ({ id: `line-${index}`, invoice_id: invoiceId, source_state: 'active',
    description: 'ค่าที่ปรึกษา UAT Gross First', amount_before_vat: 4672.90, vat_amount: 327.10, line_total: 5000,
    vat_applicable: true, vat_rate: 7, ...item }));
  const sum = key => Number(lines.reduce((total, line) => total + Number(line[key]), 0).toFixed(2));
  return { schema_version: 2, source_model: 'billable_charge_v2',
    invoice: { id: invoiceId, invoice_no: 'VP-IV-FIXTURE-1', document_status: 'issued', currency: 'THB',
      amount_before_vat: sum('amount_before_vat'), vat_amount: sum('vat_amount'), total_amount: sum('line_total') },
    items: lines.map(invoice_item => ({ invoice_item })) };
}
const eligibility = { can_prepare: true, blockers: ['TAX_INVOICE_CUSTOMER_IDENTITY_REQUIRED', 'TAX_INVOICE_VAT_TREATMENT_UNRESOLVED',
  'TAX_INVOICE_TAX_POINT_APPROVAL_REQUIRED', 'TAX_INVOICE_EXTERNAL_COVERAGE_CHECK_REQUIRED'] };
const render = (props = {}) => renderToStaticMarkup(React.createElement(TaxInvoiceVatSummary, {
  lines: invoiceVatLines(snapshot(), invoiceId), error: '', eligibility, ...props,
}));
const html = (props = {}) => `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#17212e}main{max-width:1180px;margin:auto;padding:20px}${css.join('\n')}
</style><main><section><h2>ใบกำกับภาษี</h2>${render(props)}<button class="${styles.primary}">จัดทำร่างใบกำกับภาษี</button></section></main></html>`;
module.exports = { invoiceId, snapshot, eligibility, render, html };
