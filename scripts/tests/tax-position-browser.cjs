/* eslint-disable @typescript-eslint/no-require-imports */
// Real React/CSS, synthetic closed adapter. Never contacts Production.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vp-tax-position-browser-'));
const write=(name,text)=>{const file=path.join(out,name);fs.writeFileSync(file,text);return file;};
const id='40000000-0000-4000-8000-000000000050';
const fact={id,revision_id:id,source_type:'direct_money_receipt',source_id:id,document_reference:'SYNTHETIC-1',period_month:'2026-09-01',effective_on:'2026-09-01',currency:'THB',base_amount:10000,rate_percent:3,tax_amount:300,tax_kind:'incoming_wht',payer_json:{name:'Synthetic payer'},date_basis:'confirmed_receipt',evidence_status:'awaiting_evidence',certificate_reference:null,source_revision:1,evidence_json:{}};
const period={period_month:'2026-09-01',status:'open',version:1,known_output_vat:700,input_vat_status:'incomplete',input_vat_amount:null,net_vat_amount:null,filing_reference:null,filed_on:null};
const source={source_type:'payment',source_id:id,reference:'SYNTHETIC-PAYMENT',effective_on:'2026-09-01',currency:'THB',payer:{name:'Synthetic payer'},warnings:[],lines:[{kind:'incoming_wht',base:4000,rate:3,tax:120}]};
const adapter=write('adapter.js',`window.calls=[];window.fail=null;window.data={can_manage:!location.search.includes('readonly'),can_materialize:!location.search.includes('readonly'),periods:[${JSON.stringify(period)}],facts:[${JSON.stringify(fact)},${JSON.stringify({...fact,id:'vat',tax_kind:'output_vat',rate_percent:7,tax_amount:700})}],incoming_wht_total:300,pending_sources:location.search.includes('readonly')?[]:[${JSON.stringify(source)}],coverage:{invoice_items_without_approved_tax_point:1,unresolved_direct_sources:0},history:[],input_vat_complete:false,outgoing_workflow_available:false};
if(location.search.includes('empty'))Object.assign(window.data,{periods:[],facts:[],incoming_wht_total:0,pending_sources:[],coverage:{invoice_items_without_approved_tax_point:0,unresolved_direct_sources:0}});
export const supabase={async rpc(name,p){window.calls.push({name,p});await new Promise(r=>setTimeout(r,50));if(name==='get_finance_tax_position')return {data:structuredClone(window.data)};
if(!window.data.can_manage)throw Error('Forbidden readonly mutation');if(window.fail){const message=window.fail;window.fail=null;return {error:{message}};}
if(!p.p_acknowledged)throw Error('Missing acknowledgement');
if(name==='materialize_finance_tax_source'){if(JSON.stringify(p.p_expected_source)!==JSON.stringify(window.data.pending_sources[0]))throw Error('Stale source');window.data.pending_sources=[];return {data:'revision'};}
if(name==='transition_finance_tax_period'){if(p.p_version!==window.data.periods[0].version)throw Error('Stale period');Object.assign(window.data.periods[0],{status:p.p_action,version:p.p_version+1,filing_reference:p.p_action==='filed'?p.p_reference:null,filed_on:p.p_filed_on});return {data:null};}
if(name==='record_finance_incoming_wht_evidence'){window.data.facts[0].evidence_status=p.p_status;window.data.facts[0].certificate_reference=p.p_reference;return {data:null};}throw Error('Forbidden RPC '+name);}};`);
const guard=write('guard.js',`import{buildPermissions}from'${root}/lib/permissions.ts';export function QuotationGuard({canAccess,children}){const role=location.search.includes('readonly')?'partner':'admin';const access={profile:{role},permissions:buildPermissions({role})};return canAccess(access)?children(access):null;}`);
const navigation=write('navigation.js','export const usePathname=()=>"/finance/tax-position";');
const link=write('link.js',`import React from'react';export default function Link({children,...props}){return React.createElement('a',props,children);}`);
const loader=write('loader.cjs',`module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix=require('node:path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(prefix)+'+k})};'}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);
const entry=write('entry.tsx',`import React from'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider.tsx';import LanguageSelector from'${root}/app/components/LanguageSelector.tsx';import{TaxPositionWorkspace}from'${root}/app/finance/tax-position/page.tsx';import FinanceSubNav from'${root}/app/finance/FinanceSubNav.tsx';import{buildPermissions}from'${root}/lib/permissions.ts';createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale="th" pathname="/finance/tax-position"><LanguageSelector/><FinanceSubNav activePage="tax-position" permissions={buildPermissions({role:'admin'})}/><TaxPositionWorkspace/></UiLocaleProvider>);`);
async function main(){
 await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',context:root,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[root+'/node_modules'],alias:{'next/navigation':navigation,'next/link':link,[root+'/lib/supabase']:adapter,[root+'/app/finance/quotations/shared']:guard}},module:{rules:[{test:/\.(tsx?|css)$/,use:loader}]},devtool:false},(e,s)=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));
 const css=['app/components/ui/vp-ui.module.css','app/components/DetailModal.module.css','app/finance/tax-position/tax-position.module.css','app/components/LanguageSelector.module.css','app/finance/finance-sub-nav.module.css'].map(file=>{const prefix=path.basename(file).replaceAll('.','_')+'_';return fs.readFileSync(root+'/'+file,'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,key)=>'.'+prefix+key);}).join('\n');
 const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(out+'/bundle.js'));}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}#root{padding:12px;max-width:1200px;margin:auto}${css}</style><div id="root"></div><script src="/bundle.js"></script></html>`);});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});let browser;
 try{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external.push(r.request().url());return r.abort();});
  require('./receipt-render-fixture.cjs');const {translate}=require('../../lib/i18n/catalog.ts');const url='http://127.0.0.1:'+server.address().port;
  const calls=name=>page.evaluate(name=>window.calls.filter(c=>c.name===name).length,name);
  async function geometry(){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  for(const locale of ['th','en'])for(const width of [390,768,1024,1440]){
   const t=k=>translate(locale,'taxPosition.'+k);await page.setViewportSize({width,height:1000});await page.goto(url);await page.locator('button[lang='+locale+']').click();
   await page.getByRole('heading',{name:t('title'),exact:true}).waitFor();const action=page.getByRole('button',{name:t('materialize'),exact:true});await action.waitFor();
   assert.equal(await page.getByRole('navigation').locator('a[aria-current="page"]').getAttribute('href'),'/finance/tax-position');
   await page.getByText('700.00 THB',{exact:true}).first().waitFor();await page.getByText(t('incomplete'),{exact:true}).waitFor();await page.getByText('3%',{exact:true}).waitFor();
   await page.getByText(t('unknown'),{exact:true}).waitFor();await page.getByText(t('noOutgoing'),{exact:true}).waitFor();await geometry();
   assert.equal(await page.locator('pre:visible').count(),0);assert.equal(await page.evaluate(()=>window.calls.some(c=>c.name!=='get_finance_tax_position')),false);
   await page.getByText(t('sources'),{exact:true}).click();await page.screenshot({path:out+`/tax-${locale}-${width}.png`,fullPage:true});
   await action.click();const modal=page.getByRole('dialog');await modal.waitFor();await page.keyboard.press('Tab');assert.equal(await modal.locator(':focus').count(),1);
   await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});assert.equal(await action.evaluate(e=>e===document.activeElement),true);
   await action.click();await modal.getByRole('button',{name:t('save'),exact:true}).click();await modal.getByRole('alert').waitFor();assert.equal(await calls('materialize_finance_tax_source'),0);
   assert.equal(await page.getByLabel(t('reference'),{exact:true}).evaluate(e=>e===document.activeElement),true);
   await page.getByLabel(t('reference'),{exact:true}).fill('Synthetic human review');await modal.getByRole('button',{name:t('save'),exact:true}).click();assert.equal(await calls('materialize_finance_tax_source'),0);
   assert.equal(await modal.locator('input[type=checkbox]:focus').count(),1);await page.getByLabel(t('ack'),{exact:true}).check();
   await page.evaluate(()=>window.fail='TAX_POSITION_SOURCE_CHANGED');await modal.getByRole('button',{name:t('save'),exact:true}).click();await modal.getByText(t('error.changed'),{exact:true}).waitFor();await geometry();
   await modal.getByRole('button',{name:t('save'),exact:true}).click();await modal.waitFor({state:'hidden'});assert.equal(await calls('materialize_finance_tax_source'),2);
   await page.getByRole('button',{name:t('evidenceAction'),exact:true}).click();await page.getByLabel(t('reference'),{exact:true}).fill('Synthetic certificate');await page.getByLabel(t('ack'),{exact:true}).check();
   await modal.getByRole('button',{name:t('save'),exact:true}).click();await modal.waitFor({state:'hidden'});await page.getByText(t('received'),{exact:true}).waitFor();
   await page.getByRole('button',{name:t('periodAction'),exact:true}).click();await modal.getByText(t('filingHelp'),{exact:true}).waitFor();await page.getByLabel(t('reference'),{exact:true}).fill('Review evidence');await page.getByLabel(t('ack'),{exact:true}).check();
   await modal.getByRole('button',{name:t('save'),exact:true}).click();await modal.waitFor({state:'hidden'});await page.getByText(t('ready_for_review'),{exact:true}).waitFor();
   await page.getByRole('button',{name:t('periodAction'),exact:true}).click();await page.getByLabel(t('reference'),{exact:true}).fill('External filing record');await page.getByLabel(t('ack'),{exact:true}).check();
   await modal.getByRole('button',{name:t('save'),exact:true}).click();assert.equal(await calls('transition_finance_tax_period'),1);await page.getByLabel(t('filedOn'),{exact:true}).fill('2026-09-10');await geometry();await page.screenshot({path:out+`/filing-${locale}-${width}.png`,fullPage:true});
   await modal.getByRole('button',{name:t('save'),exact:true}).click();await modal.waitFor({state:'hidden'});assert.equal(await calls('transition_finance_tax_period'),2);
   await page.getByText(t('unknown'),{exact:true}).waitFor();await page.goto(url+'?readonly');await page.locator('button[lang='+locale+']').click();await page.getByText(t('noOutgoing'),{exact:true}).waitFor();
   for(const k of ['materialize','periodAction','evidenceAction'])assert.equal(await page.getByRole('button',{name:t(k),exact:true}).count(),0);await geometry();
   await page.goto(url+'?empty');await page.locator('button[lang='+locale+']').click();await page.getByText(t('empty'),{exact:true}).waitFor();
   for(const k of ['incomplete','unknown','noOutgoing','outgoingHelp','filingHelp'])await page.getByText(t(k),{exact:true}).waitFor();
   for(const k of ['materialize','periodAction','evidenceAction'])assert.equal(await page.getByRole('button',{name:t(k),exact:true}).count(),0);
   assert.equal(await page.evaluate(()=>window.calls.some(c=>c.name!=='get_finance_tax_position')),false);await geometry();await page.screenshot({path:out+`/zero-${locale}-${width}.png`,fullPage:true});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({pass:true,widths:[390,768,1024,1440],locales:['th','en'],keyboardFocus:true,validation:true,readOnly:true,externalRequests:0,artifacts:out}));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);console.error('Artifacts:',out);process.exitCode=1;});
