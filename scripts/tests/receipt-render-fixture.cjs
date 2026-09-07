/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic data and a local TS/CSS loader; never loads Supabase or application auth.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '../..');
const css = [];
for (const ext of ['.ts','.tsx']) require.extensions[ext] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, file);
require.extensions['.css'] = (module, file) => {
  const prefix = path.basename(file).replaceAll('.','_') + '_';
  const source = fs.readFileSync(file,'utf8').replace(/:global\(([^)]+)\)/g,'$1').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,key) => '.' + prefix + key);
  css.push(source);
  module.exports = { __esModule: true, default: new Proxy({}, { get: (_,key) => prefix + key }) };
};
const shared = require(path.join(root,'app/finance/receipts/shared.ts'));
const { ReceiptDocument } = require(path.join(root,'app/finance/receipts/receipt-document.tsx'));
const { buildPermissions } = require(path.join(root,'lib/permissions.ts'));
const { financeNavigationLinks } = require(path.join(root,'app/finance/finance-navigation.ts'));
function fixture(status = 'draft', invoiceCount = 1) {
  const paymentId = '20000000-0000-4000-8000-000000000001';
  const id = '20000000-0000-4000-8000-000000000002';
  const snapshot = {
    schema_version: 1, document_kind: 'receipt',
    seller: { company_name_th: 'บริษัท ตัวอย่างทดสอบ จำกัด', company_name_en: 'Synthetic Seller Ltd.', tax_id: '0000000000000', branch_label_th: 'สำนักงานใหญ่', branch_label_en: 'Head Office', address_th: 'เลขที่ 1 ถนนตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพมหานคร 10000', phone: '02-000-0000' },
    customer: { name: 'ลูกค้าตัวอย่างสำหรับทดสอบในเครื่อง', tax_id: '0000000000001', address: '2 ถนนทดสอบ กรุงเทพมหานคร 10000', branch: 'สำนักงานใหญ่' },
    payment: { id: paymentId, internal_reference: null, received_on: '2026-07-01', payment_method: 'bank_transfer', cash_amount: 4859.81 * invoiceCount, wht_amount: 140.19 * invoiceCount, settlement_amount: 5000 * invoiceCount, currency: 'THB', receiving_bank_account: { id: '20000000-0000-4000-8000-000000000003', bank_name: 'ธนาคารทดสอบ', account_name: 'บริษัท ตัวอย่างทดสอบ จำกัด', account_number: '000-000-0000' } },
    invoices: Array.from({length:invoiceCount},(_,index) => ({ invoice_id: `20000000-0000-4000-8001-${String(index).padStart(12,'0')}`, invoice_no: `VP-IV-FIXTURE-${index+1}`, description: 'ค่าที่ปรึกษาตัวอย่างตามเอกสารต้นทาง', currency: 'THB', cash_allocated: 4859.81, wht_allocated: 140.19, settlement_allocated: 5000 })),
    structured_wht_components: [{base_amount:4672.90, rate_percent:3, calculated_wht_amount:140.19}],
  };
  // Avoid floating point artefacts in fixture inputs; these are not production calculations.
  snapshot.payment.cash_amount = Number(snapshot.payment.cash_amount.toFixed(2));
  snapshot.payment.wht_amount = Number(snapshot.payment.wht_amount.toFixed(2));
  const issued = ['issued','voided'].includes(status);
  const receipt = { id, receipt_no:'VP-RC-202607-000001',receipt_date:'2026-07-01',issued_at:'2026-07-02T09:00:00+07:00',issued_by_user_id:'20000000-0000-4000-8000-000000000004',issued_by_name:'ผู้ทดสอบ' };
  return { id, payment_id:paymentId,status,receipt_no:issued?receipt.receipt_no:null,receipt_date:receipt.receipt_date,currency:'THB',cash_amount:snapshot.payment.cash_amount,wht_amount:snapshot.payment.wht_amount,settlement_amount:snapshot.payment.settlement_amount,draft_snapshot_json: snapshot,issued_snapshot_json:issued?{...structuredClone(snapshot),receipt}:null,issued_at:issued?receipt.issued_at:null,voided_at:status==='voided'?'2026-07-03T09:00:00+07:00':null,void_reason:status==='voided'?'เหตุผลทดสอบ':null,replaces_receipt_id:null,created_at:receipt.issued_at,updated_at:receipt.issued_at };
}
function render(row,logoUrl='') { return renderToStaticMarkup(React.createElement(ReceiptDocument,{receipt:row,logoUrl})); }
function html(row,logoUrl='') { return `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}${css.join('\n')}</style><aside data-app-chrome>APPLICATION CHROME</aside><main>${render(row,logoUrl)}</main><button data-app-chrome style="position:fixed;right:0;top:200px">Floating help</button></html>`; }
module.exports = {root,css,fixture,render,html,shared,buildPermissions,financeNavigationLinks};
