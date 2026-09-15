/* eslint-disable @typescript-eslint/no-require-imports */
// Actual React UI with a closed synthetic adapter; all non-loopback traffic blocked.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vp-treasury-browser-'));
const write=(name,text)=>{const p=path.join(out,name);fs.writeFileSync(p,text);return p;};
const id=n=>'40000000-0000-4000-8000-'+String(n).padStart(12,'0');
const accounts=[{kind:'bank',account_id:id(1),bank_account_id:id(1),cash_location_id:null,name_th:'KBANK',name_en:'KBANK',bank_name:'Synthetic Bank',account_number:'000-0-00000-0'},
 {kind:'cash',account_id:id(2),bank_account_id:null,cash_location_id:id(2),name_th:'เงินสดสำนักงาน',name_en:'Office Cash',bank_name:null,account_number:null}].map(a=>({...a,is_active:true,currency:'THB',opening_id:null,opening_as_of:null,opening_amount:null,system_balance:null,inflow:0,outflow:0}));
const source={source_type:'direct_money_receipt',source_id:id(3),status:'confirmed',bank_account_id:id(1),cash_location_id:null,received_on:'2026-07-01',cash_amount:10400,wht_amount:300,currency:'THB',payer_name:'Synthetic payer',reference:'SYNTHETIC-1',description:'Synthetic receipt'};
const adapter=write('adapter.js',`
window.calls=[];window.fail=null;window.data={can_manage:!location.search.includes('readonly'),accounts:${JSON.stringify(accounts)},transactions:[],openings:[],pending_sources:location.search.includes('readonly')?[]:[${JSON.stringify(source)}],has_next:false};
if(location.search.includes('payment'))Object.assign(window.data.pending_sources[0],{source_type:'payment',source_id:'${id(4)}',cash_amount:19160,wht_amount:840,reference:'SYNTHETIC-PAYMENT'});
export const supabase={async rpc(name,p){window.calls.push({name,p});await new Promise(r=>setTimeout(r,60));const d=window.data;
 if(name==='get_finance_treasury')return {data:structuredClone(d)};
 if(!d.can_manage)throw Error('Forbidden fixture mutation');if(window.fail){const message=window.fail;window.fail=null;return {error:{message}};}
 if(name==='save_finance_treasury_opening'){
  if(typeof p.p_amount!=='string'||p.p_amount!=='150000.00'||p.p_start_date!=='2026-07-01'||p.p_bank_account_id!==d.accounts[0].bank_account_id)throw Error('Incorrect opening input');
  d.openings=[{id:p.p_id,bank_account_id:p.p_bank_account_id,cash_location_id:null,currency:'THB',as_of:'2026-06-30T16:59:59.999999Z',balance_amount:150000,note:p.p_note,status:'draft',updated_at:'2026-07-01T00:00:00Z',supersedes_opening_balance_id:null}];return {data:p.p_id};
 }
 if(name==='confirm_finance_treasury_opening'){
  if(!p.p_acknowledged||p.p_expected_updated_at!==d.openings[0].updated_at)throw Error('Missing acknowledgement/stale guard');
  d.openings[0].status='confirmed';Object.assign(d.accounts[0],{opening_id:p.p_id,opening_as_of:d.openings[0].as_of,opening_amount:150000,system_balance:150000});return {data:p.p_id};
 }
 if(name==='materialize_finance_treasury_source'){
  if(!p.p_acknowledged||JSON.stringify(p.p_expected_source)!==JSON.stringify(d.pending_sources[0]))throw Error('Changed source');
  d.transactions=[{id:'synthetic-leg',bank_account_id:p.p_expected_source.bank_account_id,cash_location_id:null,occurred_at:'2026-07-01T16:59:59.999999Z',cash_amount:p.p_expected_source.cash_amount,currency:'THB',direction:'inflow',transaction_type:p.p_source_type,status:'confirmed',description:'Synthetic receipt',source_snapshot_json:p.p_expected_source}];
  d.pending_sources=[];d.accounts[0].system_balance=150000+p.p_expected_source.cash_amount;return {data:{outcome:'posted',cash_transaction_id:'synthetic-leg'}};
 }throw Error('Forbidden RPC '+name);
}};`);
const navigation=write('navigation.js',"export const usePathname=()=>'/finance/treasury';");
const link=write('link.js',`import React from '${require.resolve('react')}';export default function Link({children,...props}){return React.createElement('a',props,children)}`);
const guard=write('guard.js','export const QuotationGuard=()=>null;');
const loader=write('loader.cjs',`module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix=require('node:path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(prefix)+'+k})};'}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);
const entry=write('entry.tsx',`import React from'react';import{createRoot}from'react-dom/client';
import{UiLocaleProvider}from'${root}/lib/i18n/provider.tsx';import LanguageSelector from'${root}/app/components/LanguageSelector.tsx';
import{TreasuryWorkspace}from'${root}/app/finance/treasury/page.tsx';
createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale="th" pathname="/finance/treasury"><LanguageSelector/><TreasuryWorkspace/></UiLocaleProvider>);`);
async function main(){
 await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',context:root,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[root+'/node_modules'],alias:{'next/navigation':navigation,'next/link':link,[root+'/lib/supabase']:adapter,[root+'/app/finance/quotations/shared']:guard}},module:{rules:[{test:/\.(tsx?|css)$/,use:loader}]},devtool:false},(e,s)=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));
 const css=['app/components/ui/vp-ui.module.css','app/components/DetailModal.module.css','app/finance/treasury/treasury.module.css','app/components/LanguageSelector.module.css'].map(file=>{
  const prefix=path.basename(file).replaceAll('.','_')+'_';return fs.readFileSync(root+'/'+file,'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,key)=>'.'+prefix+key);
 }).join('\n');
 const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(out+'/bundle.js'));}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}#root{padding:12px;max-width:1200px;margin:auto}${css}</style><div id="root"></div><script src="/bundle.js"></script></html>`);});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});let browser;
 try{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external.push(r.request().url());return r.abort();});
  require('./receipt-render-fixture.cjs');const {translate}=require('../../lib/i18n/catalog.ts');const url='http://127.0.0.1:'+server.address().port;
  const calls=name=>page.evaluate(name=>window.calls.filter(c=>c.name===name).length,name);
  async function geometry(){assert.deepEqual(await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,
   outside:[...document.querySelectorAll('input,select,textarea,button')].filter(e=>e.offsetParent!==null&&e.getBoundingClientRect().right>innerWidth+1).map(e=>e.outerHTML)})),{overflow:false,outside:[]});}
  for(const locale of ['th','en'])for(const width of [390,768,1024,1440])for(const sourceType of ['direct_money_receipt','payment']){
   const t=k=>translate(locale,'treasury.'+k);await page.setViewportSize({width,height:1000});await page.goto(url+(sourceType==='payment'?'?payment':''));await page.locator('button[lang='+locale+']').click();
   const opening=page.getByRole('button',{name:t('opening'),exact:true}).first();await opening.waitFor();await geometry();
   assert.equal(await page.getByText(t('unknown'),{exact:true}).count(),2);await page.getByText(t('empty'),{exact:true}).waitFor();
   await page.getByText('Synthetic Bank · 000-0-00000-0',{exact:true}).waitFor();await page.getByRole('heading',{name:locale==='th'?'เงินสดสำนักงาน':'Office Cash',exact:true}).waitFor();
   assert.equal(await page.locator('li strong').filter({hasText:'0.00'}).count(),0);assert.equal(await page.getByText(t('currency')+': THB',{exact:true}).count(),2);
   assert.equal(await calls('save_finance_treasury_opening'),0);await page.screenshot({path:out+`/treasury-${sourceType}-${locale}-${width}.png`,fullPage:true});
   const previewAction=page.getByRole('button',{name:t('materialize'),exact:true});await previewAction.click();
   const blockedModal=page.getByRole('dialog');await blockedModal.getByText(t('unknown'),{exact:true}).waitFor();
   assert.equal(await blockedModal.getByRole('button',{name:t('materialize'),exact:true}).isDisabled(),true);assert.equal(await calls('materialize_finance_treasury_source'),0);await page.keyboard.press('Escape');
   await opening.click();const modal=page.getByRole('dialog');await modal.waitFor();await page.keyboard.press('Tab');assert.equal(await modal.locator(':focus').count(),1);
   await page.getByRole('button',{name:t('saveOpening'),exact:true}).click();await modal.getByRole('alert').waitFor();assert.equal(await calls('save_finance_treasury_opening'),0);
   await page.getByLabel(t('startDate'),{exact:true}).fill('2026-07-01');await page.getByLabel(t('amount'),{exact:true}).fill('150000.00');await page.getByLabel(t('note'),{exact:true}).fill('Verified bank evidence, excludes later receipts');
   await page.getByRole('button',{name:t('saveOpening'),exact:true}).click();const confirm=page.getByRole('button',{name:t('confirmOpening'),exact:true});await confirm.waitFor();
   await confirm.click();await modal.getByRole('alert').waitFor();assert.equal(await calls('confirm_finance_treasury_opening'),0);assert.equal(await modal.locator('input[type=checkbox]:focus').count(),1);
   await page.getByLabel(t('openingAck'),{exact:true}).check();await geometry();await page.screenshot({path:out+`/opening-${locale}-${width}.png`,fullPage:true});
   await confirm.click();await modal.waitFor({state:'hidden'});assert.equal(await calls('confirm_finance_treasury_opening'),1);
   const action=page.getByRole('button',{name:t('materialize'),exact:true});await action.click();await modal.waitFor();await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});assert.equal(await action.evaluate(e=>e===document.activeElement),true);
   await action.click();await modal.getByRole('button',{name:t('materialize'),exact:true}).click();await modal.getByRole('alert').waitFor();assert.equal(await calls('materialize_finance_treasury_source'),0);
   await page.getByLabel(t('materializeAck'),{exact:true}).check();await modal.getByRole('button',{name:t('materialize'),exact:true}).click();await modal.waitFor({state:'hidden'});
   assert.equal(await calls('materialize_finance_treasury_source'),1);assert.equal(await page.locator('pre:visible').count(),0);await geometry();
   const materialized=await page.evaluate(()=>window.calls.find(c=>c.name==='materialize_finance_treasury_source').p);
   assert.equal(materialized.p_source_type,sourceType);assert.equal(materialized.p_expected_source.cash_amount,sourceType==='payment'?19160:10400);
   await page.screenshot({path:out+`/history-${sourceType}-${locale}-${width}.png`,fullPage:true});
   await page.goto(url+'?readonly');await page.locator('button[lang='+locale+']').click();await page.getByText(t('empty'),{exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:t('opening'),exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:t('materialize'),exact:true}).count(),0);await geometry();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({pass:true,widths:[390,768,1024,1440],locales:['th','en'],keyboardFocus:true,acknowledgements:true,readOnly:true,externalRequests:0,artifacts:out}));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);console.error('Artifacts:',out);process.exitCode=1;});
