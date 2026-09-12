/* eslint-disable @typescript-eslint/no-require-imports */
// Real components with a closed synthetic adapter. External requests are blocked.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vp-tax-correction-browser-'));
const {fixture,html}=require('./tax-correction-render-fixture.cjs'),{syntheticLogoUrl}=require('./document-logo-render-fixture.cjs');
const webpack=require('next/dist/compiled/webpack/webpack').webpack;
const adapter=path.join(out,'adapter.js'),navigation=path.join(out,'navigation.js'),link=path.join(out,'link.js'),loader=path.join(out,'loader.cjs'),entry=path.join(out,'entry.tsx'),logo=path.join(out,'logo.js');
const f=fixture('credit_note',false,'draft'),context={source:f.correction.source_snapshot_json,items:[{id:'test-line',amount_before_vat:4672.90,vat_amount:327.10,source_snapshot_json:{description:'ค่าบริการต้นทางสำหรับทดสอบ / Synthetic source service'}}],history:[]};
context.history=['credit_note','debit_note','cancel_and_reissue','replacement_copy'].map((mode,index)=>({id:'history-'+index,mode,status:'issued',number:fixture(mode).document.document_no,source_correction_id:null,created_at:'2026-07-03T00:00:00Z',document_date:'2026-07-03'}));
fs.writeFileSync(adapter,`window.calls=[];window.row=${JSON.stringify(f.correction)};if(location.search.includes('approved'))window.row.status='approved';window.context=${JSON.stringify(context)};if(location.search.includes('history')){window.context.source.source_correction_id='replacement';window.context.source.document_no='VP-TI-202607-000099';}
export const supabase={from(table){if(!['finance_tax_document_corrections','finance_tax_correction_documents'].includes(table))throw Error('Unexpected table');const q={select(){return q},eq(){return q},async single(){return{data:structuredClone(window.row)}},async maybeSingle(){return{data:null}}};return q;},async rpc(name,p){if(name==='get_finance_tax_correction_context')return{data:structuredClone(window.context)};if(!['create_finance_tax_correction_draft','approve_finance_tax_correction','issue_finance_tax_correction','cancel_finance_tax_correction_draft'].includes(name))throw Error('Unexpected RPC');window.calls.push({name,p});await new Promise(r=>setTimeout(r,60));if(name==='approve_finance_tax_correction')window.row.status='approved';return{data:window.row.id}}};`);
fs.writeFileSync(navigation,"export const usePathname=()=>location.pathname;export const useRouter=()=>({push(path){window.navigation=path}});");
fs.writeFileSync(link,`import React from '${require.resolve('react')}';export default function Link({children,...props}){return React.createElement('a',props,children)}`);
fs.writeFileSync(logo,`export {documentLogoEvidence,newCompanyLogoPath} from '${root}/lib/documentLogo.ts';export async function loadReviewedDocumentLogo(){return ${JSON.stringify(syntheticLogoUrl)}};`);
fs.writeFileSync(loader,`module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix=require('node:path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(prefix)+'+k})};'}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);
fs.writeFileSync(entry,`import React from'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider.tsx';import LanguageSelector from'${root}/app/components/LanguageSelector.tsx';import{TaxCorrectionInitiation}from'${root}/app/finance/tax-corrections/initiation.tsx';import{TaxCorrectionWorkspace}from'${root}/app/finance/tax-corrections/workspace.tsx';import{TaxCorrectionHistoryNotice}from'${root}/app/finance/tax-corrections/history-notice.tsx';import{correctionTaxProjection}from'${root}/app/finance/tax-corrections/document.tsx';import{TaxInvoiceDocument}from'${root}/app/finance/tax-invoices/tax-document.tsx';const permissions={canManageFinanceTaxInvoices:true,canIssueFinanceTaxInvoices:true,canManageFinanceReceipts:true,canIssueFinanceReceipts:true};createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale="th" pathname="/finance/tax-corrections/local"><LanguageSelector/><main>{location.search.includes('history')?<TaxInvoiceDocument row={correctionTaxProjection(window.row,null).row} logoUrl={${JSON.stringify(syntheticLogoUrl)}} documentNotice={<TaxCorrectionHistoryNotice taxId="local"/>}/>:location.search.includes('workspace')?<TaxCorrectionWorkspace id="${f.correction.id}" permissions={permissions}/>:<TaxCorrectionInitiation taxId="local" permissions={permissions}/>}</main></UiLocaleProvider>);`);
async function main(){
 await new Promise((resolve,reject)=>webpack({mode:'development',context:root,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules')],alias:{'next/navigation':navigation,'next/link':link,[path.join(root,'lib/supabase')]:adapter,[path.join(root,'lib/documentLogo')+'$']:logo}},module:{rules:[{test:/\.(tsx?|css)$/,use:loader}]},devtool:false},(err,stats)=>err||stats.hasErrors()?reject(err||Error(stats.toString({all:false,errors:true}))):resolve()));
 const css=['app/finance/tax-invoices/tax-invoices.module.css','app/finance/tax-corrections/corrections.module.css','app/components/DetailModal.module.css','app/components/LanguageSelector.module.css'].map(file=>{const prefix=path.basename(file).replaceAll('.','_')+'_';return fs.readFileSync(path.join(root,file),'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,key)=>'.'+prefix+key);}).join('\n');
 const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(out,'bundle.js')));return;}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}main{padding:12px;max-width:1180px;margin:auto}${css}</style><div id="root"></div><script>localStorage.clear()</script><script src="/bundle.js"></script></html>`)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const url='http://127.0.0.1:'+server.address().port;
 for(const width of [390,768,1024,1440])for(const locale of ['th','en']){
  await page.setViewportSize({width,height:1000});await page.goto(url);await page.locator('button[lang='+locale+']').click();
  await page.locator('main ul li').first().waitFor();assert.equal(await page.locator('main ul li').count(),4);assert.equal(await page.locator('main ul time').count(),8);
  assert.equal(await page.locator('main ul time').first().getAttribute('datetime'),'2026-07-03T00:00:00Z');
  const labels=locale==='th'?['ใบลดหนี้','ใบเพิ่มหนี้','ยกเลิกและออกฉบับแก้ไขแทน','ใบแทน']:['Credit Note','Debit Note','Cancel and Reissue Correction','Replacement Copy'];
  for(let index=0;index<labels.length;index++){assert.ok((await page.locator('main ul li').nth(index).innerText()).includes(labels[index]));assert.equal(await page.locator('main ul li a').nth(index).getAttribute('href'),'/finance/tax-corrections/history-'+index);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:path.join(out,`history-${width}-${locale}.png`),fullPage:true});
  const open=page.getByRole('button',{name:locale==='th'?'แก้ไขเอกสารภาษี':'Tax Document Correction',exact:true});await open.click();const dialog=page.getByRole('dialog');await dialog.waitFor();
  const create=dialog.getByRole('button',{name:locale==='th'?'จัดทำร่างเอกสารแก้ไข':'Prepare Correction Draft',exact:true});await create.click();await dialog.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.calls.length),0);
  await dialog.locator('select').first().selectOption('credit_note');await dialog.locator('select').nth(1).selectOption('service_overcharge');
  await dialog.locator('input[type=date]').first().fill('2026-07-03');await dialog.locator('input[type=date]').nth(1).fill('2026-07-02');
  await dialog.locator('textarea').fill('Reviewed source overcharge');await dialog.locator('input:not([type])').first().fill('External reference 043');await dialog.locator('input[inputmode=decimal]').fill('1000.00');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await page.screenshot({path:path.join(out,`modal-${width}-${locale}.png`),fullPage:true});
  await dialog.locator('select').first().selectOption('debit_note');await dialog.locator('select').nth(1).selectOption('service_undercharge');await dialog.locator('input[inputmode=decimal]').fill('25000.00');
  assert.equal(await dialog.locator('input[inputmode=decimal]').getAttribute('max'),null);
  await dialog.locator('select').first().selectOption('cancel_and_reissue');await dialog.locator('select').nth(1).selectOption('documentary_identity_error');assert.equal(await dialog.locator('input[inputmode=decimal]').count(),0);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await open.evaluate(el=>el===document.activeElement),true);assert.equal(await page.evaluate(()=>window.calls.length),0);
  await open.click();await dialog.locator('select').first().selectOption('replacement_copy');await dialog.locator('select').nth(1).selectOption('lost');
  assert.equal(await dialog.locator('input[inputmode=decimal]').count(),0);
  await dialog.locator('textarea').fill('Lost original, reviewed evidence');await dialog.locator('input:not([type])').first().fill('Lost document report 043');
  await create.click();await page.waitForFunction(()=>Boolean(window.navigation));const calls=await page.evaluate(()=>window.calls);assert.equal(calls.length,1);assert.equal(calls[0].p.p_mode,'replacement_copy');assert.deepEqual(calls[0].p.p_lines,[]);
 }
 // Validation errors never disable a corrected re-submission; this is only a stubbed workflow.
 await page.goto(url+'?workspace');await page.locator('button[lang=th]').click();
 await page.getByRole('button',{name:'อนุมัติแนวทางแก้ไข',exact:true}).waitFor({timeout:5000}).catch(async()=>{throw Error('Workspace failed: '+await page.locator('body').innerText()+'; '+errors.join('; '))});
 await page.getByRole('button',{name:'อนุมัติแนวทางแก้ไข',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.calls.length),0);
 await page.locator('textarea').fill('Legal review and external evidence');await page.locator('input[type=checkbox]').first().check();await page.getByRole('button',{name:'อนุมัติแนวทางแก้ไข',exact:true}).click();await page.getByRole('button',{name:'ยืนยันออกเอกสารแก้ไข',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.calls.length),1);
 await page.getByRole('button',{name:'ยืนยันออกเอกสารแก้ไข',exact:true}).click();assert.equal(await page.evaluate(()=>window.calls.length),1);
 await page.goto(url+'?history');await page.locator('article a[href="/finance/tax-corrections/replacement"]').waitFor();
 assert.match(await page.locator('article').innerText(),/VP-TI-202607-000099/);assert.equal(await page.evaluate(()=>window.calls.length),0);
 await page.emulateMedia({media:'print'});assert.equal(await page.locator('article a[href="/finance/tax-corrections/replacement"]').isVisible(),true);await page.emulateMedia({media:'screen'});
 assert.deepEqual(errors,[]);
 // Actual shared A4 document renderer, all modes and both document families.
 for(const mode of ['credit_note','debit_note','cancel_and_reissue','replacement_copy'])for(const paired of [false,true]){
  const f=fixture(mode,paired);for(const width of [390,1440]){
   await page.setViewportSize({width,height:1123});await page.emulateMedia({media:'screen'});await page.setContent(html(f));await page.locator('article img').evaluate(i=>i.decode());
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await page.locator('article img').evaluate(i=>i.naturalWidth>0),true);
   await page.screenshot({path:path.join(out,`${mode}-${paired}-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:794,height:1123});await page.emulateMedia({media:'print'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.equal(await page.locator('[data-app-chrome]').evaluateAll(els=>els.every(el=>getComputedStyle(el).display==='none')),true);
  await page.pdf({path:path.join(out,`${mode}-${paired}.pdf`),preferCSSPageSize:true,printBackground:true});
 }
 console.log(JSON.stringify({pass:true,widths:[390,768,1024,1440],locales:['th','en'],modes:4,artifacts:out}));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);console.error('Artifacts:',out);process.exitCode=1;});
