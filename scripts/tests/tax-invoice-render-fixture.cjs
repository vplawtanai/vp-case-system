/* eslint-disable @typescript-eslint/no-require-imports */
const {css,root}=require('./receipt-render-fixture.cjs');
const {logoFixture,syntheticLogoUrl}=require('./document-logo-render-fixture.cjs');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {TaxInvoiceDocument}=require(root+'/app/finance/tax-invoices/tax-document.tsx');
const shared=require(root+'/app/finance/tax-invoices/shared.ts');
function fixture(status='draft'){
  const r=logoFixture(),s=structuredClone(r.draft_snapshot_json),invoiceId=s.invoices[0].invoice_id;
  const row={id:r.id,payment_id:r.payment_id,invoice_id:invoiceId,status,tax_invoice_no:status==='issued'?'VP-TI-202607-000001':null,
    issue_date:'2026-07-02',issued_at:status==='issued'?'2026-07-02T09:00:00+07:00':null,updated_at:'2026-07-02T09:00:00+07:00',decisions_json:{}};
  Object.assign(s,{schema_version:1,document_kind:'tax_invoice',issue_date:row.issue_date,tax_treatment:'standard_rated',external_coverage_checked:true,
    invoice:{id:invoiceId,invoice_no:'VP-IV-FIXTURE-1',currency:'THB',amount_before_vat:4672.90,vat_amount:327.10,total_amount:5000},
    invoice_item:{id:'20000000-0000-4000-8000-000000000007',invoice_id:invoiceId,description:'ค่าที่ปรึกษาตามเอกสารต้นทางสำหรับทดสอบภาษี',amount_before_vat:4672.90,vat_amount:327.10,line_total:5000,vat_rate:7,vat_applicable:true},
    tax_point:{event_type:'payment_received',date:'2026-07-01',no_earlier_event_acknowledged:true,approved_at:'2026-07-02T00:00:00Z',approved_by_user_id:'20000000-0000-4000-8000-000000000004'}});
  Object.assign(s.seller,{vat_registered:true,branch_type:'head_office',branch_code:'00000'});
  Object.assign(s.customer,{vat_registered:true,branch_type:'head_office',branch_code:'00000'});
  row.source_snapshot_json=structuredClone(s);row.draft_snapshot_json=s;
  row.issued_snapshot_json=status==='issued'?{...structuredClone(s),document:{id:row.id,tax_invoice_no:row.tax_invoice_no,issue_date:row.issue_date,issued_at:row.issued_at}}:null;
  return row;
}
const render=row=>renderToStaticMarkup(React.createElement(TaxInvoiceDocument,{row,logoUrl:syntheticLogoUrl}));
const html=row=>`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}${css.join('\n')}</style><aside data-app-chrome>APPLICATION CHROME</aside><main>${render(row)}</main><button data-app-chrome style="position:fixed;right:0;top:200px">Floating help</button></html>`;
module.exports={fixture,render,html,shared};
