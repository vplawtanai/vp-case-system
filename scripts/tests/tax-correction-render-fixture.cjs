/* eslint-disable @typescript-eslint/no-require-imports */
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {fixture:taxFixture}=require('./tax-invoice-render-fixture.cjs'),{fixture:combinedFixture}=require('./combined-document-render-fixture.cjs');
const {root,css}=require('./receipt-render-fixture.cjs'),{syntheticLogoUrl}=require('./document-logo-render-fixture.cjs');
const {TaxCorrectionDocument}=require(root+'/app/finance/tax-corrections/document.tsx');
function fixture(mode='credit_note',paired=false,status='issued'){
 const pair=paired?combinedFixture('issued'):null,original=pair?.row||taxFixture('issued'),tax=structuredClone(original.issued_snapshot_json);
 const source={tax_invoice_id:original.id,combined_id:pair?.combined.id||null,receipt_id:pair?.combined.receipt_id||null,invoice_id:original.invoice_id,payment_id:original.payment_id,
 source_correction_id:null,document_no:original.tax_invoice_no,document_date:original.issue_date,tax,receipt:pair?structuredClone(pair.combined.issued_snapshot_json.receipt):null};
 const monetary=['credit_note','debit_note'].includes(mode),sign=mode==='credit_note'?-1:1;
 const lines=monetary?[{item_id:tax.invoice_item.id,source:tax.invoice_item,base_change:1000,vat_change:70}]:[];
 const draft={...structuredClone(source),schema_version:1,correction_mode:mode,reason:'เหตุผลและหลักฐานสำหรับทดสอบในเครื่องเท่านั้น',issue_date:'2026-07-03',adjustment_date:'2026-07-03',lines,
 totals:{original_base:4672.90,original_vat:327.10,previous_base:4672.90,previous_vat:327.10,base_change:monetary?1000:0,vat_change:monetary?70:0,resulting_base:4672.90+(monetary?sign*1000:0),resulting_vat:327.10+(monetary?sign*70:0)}};
 const c={id:'30000000-0000-4000-8000-000000000001',original_tax_invoice_id:original.id,original_combined_document_id:source.combined_id,source_correction_id:null,
 correction_mode:mode,status,reason:draft.reason,issue_date:draft.issue_date,source_snapshot_json:source,draft_snapshot_json:draft};
 let document=null;
 if(status==='issued'){
 const number=mode==='replacement_copy'?source.document_no:mode==='cancel_and_reissue'?(paired?'VP-RTI':'VP-TI')+'-202607-000002':(mode==='credit_note'?'VP-CN':'VP-DN')+'-202607-000001';
 const s={...structuredClone(draft),document_no:number,issued_by_name:'Synthetic Reviewer',issued_at:'2026-07-03T00:00:00Z',copy_sequence:mode==='replacement_copy'?1:null};
 if(mode==='cancel_and_reissue'){s.tax.document.tax_invoice_no=number;s.tax.document.issued_at=s.issued_at;if(paired){s.receipt.receipt.receipt_no=number;s.receipt.receipt.issued_at=s.issued_at;}}
 document={id:c.id,document_type:mode==='cancel_and_reissue'?(paired?'receipt_tax_invoice':'tax_invoice'):mode,document_no:number,document_date:monetary?draft.issue_date:original.issue_date,issued_at:s.issued_at,issued_snapshot_json:s};
 }
 return {correction:c,document,logoUrl:syntheticLogoUrl};
}
const render=f=>renderToStaticMarkup(React.createElement(TaxCorrectionDocument,f));
const html=f=>{const markup=render(f);return `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}${css.join('\n')}</style><aside data-app-chrome>APPLICATION CHROME</aside><main>${markup}</main></html>`;};
module.exports={fixture,render,html};
