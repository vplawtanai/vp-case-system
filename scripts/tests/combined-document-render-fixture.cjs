/* eslint-disable @typescript-eslint/no-require-imports */
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {fixture:taxFixture}=require('./tax-invoice-render-fixture.cjs');
const {root,css}=require('./receipt-render-fixture.cjs');
const {syntheticLogoUrl}=require('./document-logo-render-fixture.cjs');
const {CombinedReceiptTaxDocument}=require(root+'/app/finance/combined-documents/document.tsx');
function fixture(status='draft',mixed=true){
  const row=taxFixture(status),s=row.draft_snapshot_json,cid='20000000-0000-4000-8000-000000000099',rid='20000000-0000-4000-8000-000000000098';
  row.combined_document_id=cid;
  const first={...s.invoice_item,resolved_vat_treatment:{schema_version:1,treatment:'standard_rate',basis:'explicit_positive_vat'}};
  const second={...first,id:'20000000-0000-4000-8000-000000000088',description:'เงินทดรองจ่ายตามหลักฐานที่ได้รับการตรวจสอบ',amount_before_vat:2000,vat_amount:0,line_total:2000,vat_rate:0,vat_applicable:false,
    resolved_vat_treatment:{schema_version:1,treatment:'outside_scope',reason:'Explicit fixture evidence',basis:'explicit_review'}};
  s.schema_version=2;s.invoice_item=first;s.invoice_items=[first];s.document_lines=mixed?[first,second]:[first];
  if(mixed){s.invoice.total_amount=7000;s.invoice.amount_before_vat=6672.90;s.payment.cash_amount=6859.81;s.payment.settlement_amount=7000;}
  row.source_snapshot_json=structuredClone(s);
  const combined={id:cid,payment_id:row.payment_id,receipt_id:rid,tax_invoice_id:row.id,status,combined_no:status==='issued'?'VP-RTI-202607-000001':null,
    issue_date:row.issue_date,issued_at:row.issued_at,updated_at:row.updated_at,source_snapshot_json:structuredClone(s),draft_snapshot_json:structuredClone(s),issued_snapshot_json:null};
  if(status==='issued'){
    row.tax_invoice_no=combined.combined_no;
    row.issued_snapshot_json={...structuredClone(s),document:{id:row.id,tax_invoice_no:combined.combined_no,combined_document_id:cid,issue_date:row.issue_date,issued_at:row.issued_at}};
    combined.issued_snapshot_json={schema_version:1,document_kind:'receipt_tax_invoice',combined_document_id:cid,combined_no:combined.combined_no,issue_date:combined.issue_date,issued_at:combined.issued_at,
      tax_invoice:structuredClone(row.issued_snapshot_json),receipt:{payment:structuredClone(s.payment),receipt:{id:rid,receipt_no:combined.combined_no,combined_document_id:cid,issued_at:combined.issued_at}}};
  }
  return {combined,row};
}
const render=({combined,row})=>renderToStaticMarkup(React.createElement(CombinedReceiptTaxDocument,{combined,row,logoUrl:syntheticLogoUrl}));
const html=f=>{const markup=render(f);return `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}${css.join('\n')}</style><aside data-app-chrome>APPLICATION CHROME</aside><main>${markup}</main></html>`;};
module.exports={fixture,render,html};
