/* eslint-disable @typescript-eslint/no-require-imports */
// Actual NextAction presentation with local state; no network or business writes.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {translate}=require('../../lib/i18n/catalog.ts');
const permissions={canViewFinanceReceipts:true,canViewFinanceTaxInvoices:true,canManageFinanceReceipts:true,canManageFinanceTaxInvoices:true};
const fixture=workspaceFixture('app/finance/document-decision/next-action.tsx',['NextAction'],{'../tax-invoices/access':{useTaxAccess:()=>({permissions})}});
const render=(locale,decision,direct=true)=>fixture.render(locale,{'NextAction.decision':{lines:[],blockers:[],...decision}}, {paymentId:direct?'':'payment',directMoneyId:direct?'direct':''},'NextAction');
const links=html=>[...html.matchAll(/<a\b([^>]*)>([^<]+)<\/a>/g)].map(m=>({href:m[1].match(/href="([^"]+)"/)[1],primary:/_primary\b/.test(m[1]),text:m[2]}));

for(const locale of ['th','en']){
 for(const status of ['draft','issued'])test(`${locale}: Direct Combined ${status} has one truthful primary link, never a Receipt child detour`,()=>{
  // Child status and routing decision deliberately disagree; only Combined status labels the action.
  const html=render(locale,{decision:status==='draft'?'complete':'combined_receipt_tax_invoice',combined_id:'combined',combined_status:status,receipt_id:'receipt',receipt_status:status==='draft'?'issued':'draft',tax_invoice_id:'tax'});
  const label=translate(locale,status==='draft'?'finance.document.openCombinedDraft':'finance.document.postPayment.openCombined');
  assert.deepEqual(links(html),[{href:'/finance/combined-documents/combined',primary:true,text:label}]);
  assert.ok(!html.includes(translate(locale,'finance.document.openIssuedReceipt')));
  assert.ok(!html.includes(translate(locale,'finance.document.openExisting')));
  assert.doesNotMatch(html,/href="\/finance\/(receipts|tax-invoices)\//);assert.doesNotMatch(html,/<button/);
  if(locale==='th')assert.equal(label,status==='draft'?'เปิดร่างใบเสร็จรับเงิน/ใบกำกับภาษี':'เปิดใบเสร็จรับเงิน/ใบกำกับภาษี');
 });
 for(const status of ['draft','issued'])test(`${locale}: genuine standalone Receipt ${status} retains its direct route without an issued claim`,()=>{
  const html=render(locale,{decision:status==='issued'?'complete':'receipt_only',receipt_id:'receipt',receipt_status:status});
  assert.deepEqual(links(html),[{href:'/finance/receipts/receipt',primary:true,text:translate(locale,'finance.document.openExisting')}]);
  assert.ok(!html.includes(translate(locale,'finance.document.openIssuedReceipt')));assert.doesNotMatch(html,/combined-documents/);
 });
 test(`${locale}: standalone Tax Invoice remains openable without manufacturing a Combined document`,()=>{
  const html=render(locale,{decision:'complete',tax_invoice_id:'tax',tax_invoice_status:'issued'});
  assert.deepEqual(links(html),[{href:'/finance/tax-invoices/tax',primary:true,text:translate(locale,'finance.document.openExisting')}]);
  assert.doesNotMatch(html,/combined-documents/);
 });
 test(`${locale}: standalone Receipt plus Tax completion retains both genuine documents`,()=>{
  const html=render(locale,{decision:'tax_invoice_completion_only',receipt_id:'receipt',receipt_status:'issued',tax_invoice_id:'tax',tax_invoice_status:'draft'});
  assert.deepEqual(links(html),[
   {href:'/finance/tax-invoices/tax',primary:true,text:translate(locale,'finance.document.openExisting')},
   {href:'/finance/receipts/receipt',primary:false,text:translate(locale,'finance.document.openIssuedReceipt')}
  ]);
 });
 for(const decision of ['combined_receipt_tax_invoice','complete'])test(`${locale}: Payment ${decision} actions remain unchanged`,()=>{
  const html=render(locale,{decision,combined_id:'combined',combined_status:'draft',receipt_id:'receipt',tax_invoice_id:'tax'},false);
  assert.deepEqual(links(html),[
   {href:'/finance/combined-documents/combined',primary:true,text:translate(locale,'finance.document.openExisting')},
   {href:'/finance/receipts/receipt',primary:false,text:translate(locale,'finance.document.openIssuedReceipt')}
  ]);
 });
}
