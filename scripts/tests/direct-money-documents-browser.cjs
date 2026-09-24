/* eslint-disable @typescript-eslint/no-require-imports */
// Real React screens, synthetic adapter. Browser traffic restricted to loopback.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vp-066-browser-'));
const webpack=require('next/dist/compiled/webpack/webpack').webpack;
const f=require('./direct-money-documents-fixture.json');
require('./receipt-render-fixture.cjs');const {syntheticLogoUrl}=require('./document-logo-render-fixture.cjs'),{translate}=require('../../lib/i18n/catalog.ts');
const receiptRender=require('./receipt-render-fixture.cjs'),taxRender=require('./tax-invoice-render-fixture.cjs');
const write=(name,text)=>{const p=path.join(out,name);fs.writeFileSync(p,text);return p;};
const permissions={canViewFinanceReceipts:true,canViewFinanceTaxInvoices:true,canManageFinanceReceipts:true,canManageFinanceTaxInvoices:true,canIssueFinanceReceipts:true,canIssueFinanceTaxInvoices:true};
const access=write('access.js',`export const useTaxAccess=()=>({permissions:${JSON.stringify(permissions)}});export const TaxInvoiceGuard=({children})=>children(${JSON.stringify(permissions)});`);
const navigation=write('navigation.js',"export const usePathname=()=>'/finance/direct-money/local';export const useRouter=()=>({push:p=>{window.navigated=p;window.stage='preview';window.render066();}});");
const link=write('link.js',`import React from '${require.resolve('react')}';export default function Link({children,...props}){return React.createElement('a',props,children)}`);
const adapter=write('adapter.js',`window.calls=[];window.stage='source';window.f=${JSON.stringify(f)};
export const supabase={async rpc(name,args){window.calls.push({name,args});
if(name==='get_finance_received_document_decision')return {data:{decision:window.existingReceipt||window.stage==='issued'?'complete':'combined_receipt_tax_invoice',combined_id:window.stage==='issued'?window.f.combined.id:null,receipt_id:window.existingReceipt?window.f.receipt.id:null,lines:window.f.tax.source_snapshot_json.document_lines,blockers:[]}};
if(name==='create_finance_received_document_draft'){if(!args.p_no_earlier_event||!args.p_external_receipt_checked||!args.p_external_tax_checked)throw Error('Missing explicit acknowledgement');return {data:window.f.combined.id};}
if(name==='issue_finance_combined_document'){if(!args.p_acknowledged||!args.p_external_receipt_checked||!args.p_external_tax_checked)throw Error('Missing issue acknowledgements');window.stage='issued';return {data:window.f.combined.id};}
if(name==='get_finance_tax_correction_context')return {data:{history:[],items:[],source:{}}};
throw Error('Forbidden RPC '+name);}};`);
const loader=write('loader.cjs',`module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix=require('node:path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(prefix)+'+k})};'}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);
const entry=write('entry.tsx',`import React from'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider';import{FinanceDocumentNextAction}from'${root}/app/finance/document-decision/next-action';import{TaxInvoiceEditor}from'${root}/app/finance/tax-invoices/editor';import{CombinedReceiptTaxDocument}from'${root}/app/finance/combined-documents/document';
const mount=createRoot(document.getElementById('root'));window.render066=()=>{const f=window.f,issued=window.stage==='issued',preview=window.stage==='preview',row={...f.tax,status:issued?'issued':'draft',tax_invoice_no:issued?f.tax.tax_invoice_no:null,issued_at:issued?f.tax.issued_at:null,issued_snapshot_json:issued?f.tax.issued_snapshot_json:null},combined={...f.combined,status:row.status,combined_no:row.tax_invoice_no,issued_at:row.issued_at,issued_snapshot_json:issued?f.combined.issued_snapshot_json:null};
mount.render(<UiLocaleProvider initialLocale={new URLSearchParams(location.search).get('locale')||'th'} pathname='/finance/direct-money/local'><main>{preview?<TaxInvoiceEditor key='editor' row={row} combined={combined} permissions={${JSON.stringify(permissions)}} logoUrl={${JSON.stringify(syntheticLogoUrl)}} blockers={[]} reload={async()=>window.render066()}/>:issued?<CombinedReceiptTaxDocument row={f.tax} combined={f.combined} logoUrl={${JSON.stringify(syntheticLogoUrl)}}/>:<FinanceDocumentNextAction directMoneyId={f.tax.direct_money_receipt_id}/>}</main></UiLocaleProvider>);};window.render066();`);
async function main(){
 await new Promise((resolve,reject)=>webpack({mode:'development',context:root,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules')],alias:{'next/navigation':navigation,'next/link':link,[path.join(root,'lib/supabase')]:adapter,[path.join(root,'app/finance/tax-invoices/access')]:access}},module:{rules:[{test:/\.(tsx?|css)$/,use:loader}]},devtool:false},(e,s)=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));
 const styles=['app/finance/tax-invoices/tax-invoices.module.css','app/finance/combined-documents/document.module.css','app/components/DocumentIdentity.module.css','app/components/DocumentAuthorization.module.css','app/components/LegalDocumentLayout.module.css','app/components/DocumentTheme.module.css'];
 const css=styles.map(p=>{const prefix=path.basename(p).replaceAll('.','_')+'_';return fs.readFileSync(p,'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,k)=>'.'+prefix+k).replace(/:global\(([^)]+)\)/g,'$1');}).join('\n');
 const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');return res.end(fs.readFileSync(path.join(out,'bundle.js')));}res.setHeader('content-type','text/html');
 if(req.url.startsWith('/receipt?'))return res.end(receiptRender.html(f.standalone_receipt,syntheticLogoUrl));
 if(req.url.startsWith('/tax-invoice?'))return res.end(taxRender.html(f.standalone_tax));
 res.end(`<!doctype html><html lang='th'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>*{box-sizing:border-box}body{margin:0;font:15px Arial,sans-serif}main{padding:16px;max-width:1160px;margin:auto}${css}</style><div id='root'></div><script src='/bundle.js'></script></html>`);});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});let browser;
 try{const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 for(const locale of ['th','en'])for(const width of [390,1440]){
 await page.setViewportSize({width,height:1100});await page.emulateMedia({media:'screen'});await page.goto(`http://127.0.0.1:${server.address().port}?locale=${locale}`);
 const label=translate(locale,'directMoney.prepareDocument');await page.getByRole('button',{name:label,exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:label,exact:true}).isEnabled(),false);
 for(const box of await page.getByRole('checkbox').all())await box.check();await page.getByRole('button',{name:label,exact:true}).click();
 await page.getByText('อ้างอิงรายการรับเงิน',{exact:true}).waitFor();assert.equal(await page.locator('article img').count(),1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 const calls=await page.evaluate(()=>window.calls);assert.equal(calls.filter(c=>c.name==='create_finance_received_document_draft').length,1);assert.ok(calls.find(c=>c.name==='create_finance_received_document_draft').args.p_source_type==='direct_money_receipt');
 // Existing preview-review / settlement / legal acknowledgements; no amount or classification entry.
 for(const key of ['finance.taxInvoice.ui.reviewAck','finance.taxInvoice.ui.receiptAck','finance.taxInvoice.ui.issueAck']){
 const text=translate(locale,key,{prefix:'VP-RTI'});await page.getByRole('checkbox',{name:text,exact:true}).check();}
 const issueLabel=translate(locale,'finance.taxInvoice.ui.issue',{title:translate(locale,'finance.document.combined')});await page.getByRole('button',{name:issueLabel,exact:true}).click();
 await page.waitForFunction(()=>window.stage==='issued'&&document.querySelector('article')?.textContent.includes('VP-RTI'));
 assert.equal((await page.evaluate(()=>window.calls)).filter(c=>c.name==='issue_finance_combined_document').length,1);
 await page.screenshot({path:path.join(out,`${locale}-${width}-issued.png`),fullPage:true});
 if(width===1440){await page.emulateMedia({media:'print'});const pdf=await page.pdf({path:path.join(out,`${locale}-a4.pdf`),preferCSSPageSize:true,printBackground:true});assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,1);}
 console.log(`PASS ${locale} ${width}: prepare → existing preview → issue, 2 main buttons plus required acknowledgements`);
 }
 // Completed receipt-only coverage must open its existing receipt, never show Create again.
 await page.emulateMedia({media:'screen'});
 await page.goto(`http://127.0.0.1:${server.address().port}?locale=en`);
 await page.getByRole('button',{name:translate('en','directMoney.prepareDocument'),exact:true}).waitFor();
 await page.evaluate(()=>{window.existingReceipt=true;window.stage='preview';window.render066();});
 await page.getByText('อ้างอิงรายการรับเงิน',{exact:true}).waitFor();
 await page.evaluate(()=>{window.stage='source';window.render066();});
 const existing=page.getByRole('link',{name:translate('en','finance.document.openExisting'),exact:true});await existing.waitFor();
 assert.equal(await existing.getAttribute('href'),'/finance/receipts/'+f.receipt.id);
 assert.equal(await page.getByRole('button',{name:translate('en','directMoney.prepareDocument'),exact:true}).count(),0);
 console.log('PASS completed Receipt opens existing coverage');
 for(const kind of ['receipt','tax-invoice'])for(const locale of ['th','en']){
 await page.setViewportSize({width:1440,height:1100});await page.emulateMedia({media:'screen'});await page.goto(`http://127.0.0.1:${server.address().port}/${kind}?locale=${locale}`);
 assert.equal(await page.locator('article img').count(),1);assert.match(await page.locator('article').innerText(),/อ้างอิงรายการรับเงิน/);
 await page.emulateMedia({media:'print'});const pdf=await page.pdf({path:path.join(out,`${kind}-${locale}-a4.pdf`),preferCSSPageSize:true,printBackground:true});
 assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,1);assert.match(pdf.toString('latin1'),/\/MediaBox \[0 0 594\.[0-9]+ 841\.[0-9]+\]/);
 console.log(`PASS ${kind} ${locale}: existing A4 renderer, one logo, one page`);
 }
 assert.deepEqual(errors,[]);console.log('Screenshots/PDF: '+out);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
