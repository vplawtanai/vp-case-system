/* eslint-disable @typescript-eslint/no-require-imports */
// Render actual document JSX with synthetic facts; no auth, Storage or database access.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const {root,css,shared} = require('./receipt-render-fixture.cjs');
const {logoFixture,syntheticLogoUrl} = require('./document-logo-render-fixture.cjs');
const {ReceiptDocument} = require('../../app/finance/receipts/receipt-document.tsx');
const {InvoiceDocument} = require('../../app/finance/invoices/invoice-document.tsx');
const {invoiceInstallmentContext} = require('../../app/finance/invoices/shared.ts');
const theme = require('../../app/components/DocumentTheme.module.css').default;
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const quotationPath = 'app/finance/quotations/[id]/preview/page.tsx';
const quotationSource = ts.createSourceFile(quotationPath,read(quotationPath),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const preview = quotationSource.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='QuotationPreview');
let article;
function findArticle(node) {
  if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(quotationSource)==='article')article=node;
  else ts.forEachChild(node,findArticle);
}
findArticle(preview);
const helpers = quotationSource.statements.filter(n=>!ts.isImportDeclaration(n)
  &&!(ts.isFunctionDeclaration(n)&&['QuotationPreview','QuotationPreviewPage'].includes(n.name?.text)))
  .map(n=>n.getText(quotationSource)).join('\n');

function quotation(status, {signature = false} = {}) {
  const identity=shared.receiptPresentation(logoFixture()).value.identity;
  const data={
    documentTheme:theme,companyProfile:identity,logoUrl:syntheticLogoUrl,logoImageRef:null,
    setLogoUrl:()=>{},setSignerSignatureUrl:()=>{},isThaiDocument:true,documentLanguage:'th',
    quotation:{status,note:null},showDocumentStatus:['draft','cancelled'].includes(status),
    documentStatusLabel:status==='cancelled'?'ยกเลิก':'ร่างสำหรับตรวจสอบภายใน',
    displayQuotationNo:'LOCAL-QT-TEST',displayIssueDate:'2026-09-01',displayValidUntil:'2026-09-30',
    displayMatterLabel:'งานที่ปรึกษาทดสอบ',displayClientName:'ลูกค้าทดสอบ',displayClientTaxId:'0000000000001',
    displayClientAddress:'ที่อยู่ทดสอบ',displayClientPhone:'-',displayClientEmail:'-',engagementSections:[],
    displayItems:[{id:'item',description:'ค่าที่ปรึกษาทดสอบ',quantity:1,unit_price:5000,vat_applicable:true,vat_rate:7,amount_before_tax:4672.90,vat_amount:327.10,line_total:5000}],
    displaySubtotalVatable:4672.90,displaySubtotalNonVatable:0,displayVatAmount:327.10,displayGrandTotal:5000,
    displayPaymentTerms:null,displayInstallments:[],displayAllocations:[],
    signer:{name:'ผู้ทดสอบ',position:'กรรมการ',email:''},showSignerSignature:signature,signerSignatureUrl:signature?syntheticLogoUrl:'',signerSignatureImageRef:null,
  };
  // Extract the production article and its helpers, not a separate approximation of the layout.
  const code=helpers+`\nexport function renderDocument(data) { const {${Object.keys(data).join(',')}}=data; return <><style>{printCss}</style>${article.getText(quotationSource)}</>; }`;
  const fixture=new Module(path.join(root,quotationPath),module);
  fixture.filename=path.join(root,quotationPath);fixture.paths=module.paths;
  fixture._compile(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,fixture.filename);
  return renderToStaticMarkup(React.createElement(fixture.exports.renderDocument,data));
}

function invoice(status, {count = 1, languageCode = 'th'} = {}) {
  const identity=shared.receiptPresentation(logoFixture()).value.identity;
  const items=[{id:'local-item',description:'ค่าที่ปรึกษาทดสอบ',source_type:'billing_installment_item',source_state:'active',allocation_percent:null,vat_applicable:true,vat_rate:7,amount_before_vat:4672.90,vat_amount:327.10,line_total:5000,source_snapshot_json:{ready_snapshot:{source:{source_type:'billing_installment_item'}}}}];
  const row={id:'local-invoice',document_status:status,invoice_no:status==='draft'?null:'LOCAL-IV-TEST',source_model:'billable_charge_v2',language_code:'th',customer_name:'ลูกค้าทดสอบ',currency:'THB',issue_date:'2026-09-01',due_date:null,amount_before_vat:4672.90,vat_amount:327.10,total_amount:5000,billing_plan_id:'plan',v2_bridge_id:'bridge',source_snapshot_json:{bridge_id:'bridge'},voided_at:status==='voided'?'2026-09-02T00:00:00Z':null};
  for(let i=1;i<count;i++)items.push({...items[0],id:`local-item-${i}`,description:`ค่าที่ปรึกษาทดสอบ ${i+1}`});
  for(const key of ['amount_before_vat','vat_amount','total_amount'])row[key]=Math.round(row[key]*count*100)/100;
  row.language_code=languageCode;
  const bridge={id:'bridge',source_snapshot_json:{billing_plan:{id:'plan',installment_count:3},billing_installment:{id:'installment',billing_plan_id:'plan',installment_no:2}}};
  if(status!=='draft')row.issued_snapshot_json={schema_version:2,source_model:'billable_charge_v2',invoice:{...row},source:row.source_snapshot_json,bridge:{id:bridge.id,source_snapshot:bridge.source_snapshot_json},items:items.map(invoice_item=>({invoice_item}))};
  const before=JSON.stringify({row,items});
  const markup=renderToStaticMarkup(React.createElement(InvoiceDocument,{
    invoice:row,items,identity,logoUrl:syntheticLogoUrl,matter:'งานที่ปรึกษาทดสอบ',
    installmentContext:invoiceInstallmentContext(row,items,status==='draft'?bridge:null),
    paymentDestination:{bankAccountId:'local-bank',shortName:'KBANK',bankName:'ธนาคารทดสอบ KBANK',accountName:'บัญชีทดสอบ',accountNumber:'000-0-00000-0'},
  }));
  if(JSON.stringify({row,items})!==before)throw new Error('Invoice renderer mutated fixture');
  return markup;
}

function receipt(status, {count = 1} = {}) {
  const row=logoFixture(status,count);
  const before=JSON.stringify(row);
  const markup=renderToStaticMarkup(React.createElement(ReceiptDocument,{receipt:row,logoUrl:syntheticLogoUrl}));
  if(JSON.stringify(row)!==before)throw new Error('Receipt renderer mutated fixture');
  return markup;
}

const renderers={quotation,invoice,receipt};
function documentHtml(type,status,options) {
  const markup=renderers[type](status,options);
  return `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local ${type} ${status}</title><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}${css.join('\n')}</style>${markup}</html>`;
}
module.exports={root,read,theme,renderers,documentHtml};
