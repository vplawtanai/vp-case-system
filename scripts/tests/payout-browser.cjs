/* eslint-disable @typescript-eslint/no-require-imports */
// Actual React and CSS. Closed synthetic adapter; no external requests permitted.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {fixture}=require('./payout-fixture.cjs'),root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vp-payout-browser-'));
const write=(name,text)=>{const p=path.join(out,name);fs.writeFileSync(p,text);return p;};
const f=fixture(),payee=f.payees[0].id;
const adapter=write('adapter.js',`window.calls=[];window.data=${JSON.stringify(f)};
if(location.search.includes('readonly'))window.data.can_manage=false;
if(location.search.includes('missing')){window.data.payees[0].tax_id=null;window.data.payees[0].destination=null;}
window.data.accounts.push({...window.data.accounts[0],kind:'cash',account_id:'office',bank_account_id:null,cash_location_id:'office',name_th:'เงินสดสำนักงาน',name_en:'Office Cash'});
export const supabase={auth:{async getUser(){return{data:{user:{id:'synthetic'}}}},async signOut(){throw Error('Blocked')}},from(name){if(name!=='user_profiles')throw Error('Unexpected table');return{select(){return this},eq(){return this},async single(){return{data:{role:location.search.includes('readonly')?'partner':'admin'}}}}},async rpc(name,p){window.calls.push({name,p});await new Promise(r=>setTimeout(r,30));const d=window.data;
 if(name==='get_finance_payout_workspace')return {data:{...structuredClone(d),components:d.components.filter(e=>e.recipient_id===p.p_payee_id)}};if(name==='get_finance_payees')return{data:d.payees};
 if(name==='save_finance_payee'){if(!p.p_input.legal_name)throw Error('Unexpected synthetic Payee');const existing=d.payees.find(x=>x.id===p.p_id);if(existing){if(existing.version!==p.p_expected_version)throw Error('Stale synthetic Payee');Object.assign(existing,{tax_id:p.p_input.tax_id,destination:p.p_input.destination?{...p.p_input.destination,id:'synthetic-destination'}:null,is_active:p.p_input.is_active,version:existing.version+1});}else{if(p.p_profile_id!==null)throw Error('Unexpected synthetic profile');d.payees.push({id:p.p_id,kind:'external',profile_id:null,legal_name:p.p_input.legal_name,entity_type:p.p_input.entity_type,tax_id:p.p_input.tax_id,is_active:true,version:1,destination:p.p_input.destination});}return{data:p.p_id};}
 if(name==='save_finance_payout'){if(!p.p_choices.length)throw Error('Empty');const choices=p.p_choices.map(c=>{const e=d.components.find(e=>e.id===c.entitlement_id);return{...c,gross:e.gross_amount,wht:Math.round(e.gross_amount*c.rate)/100,entitlement:e}});const gross=choices.reduce((n,c)=>n+c.gross,0),wht=choices.reduce((n,c)=>n+c.wht,0);d.payout={id:p.p_id,payee_id:p.p_payee_id,paid_on:p.p_paid_on,bank_account_id:p.p_bank_account_id,cash_location_id:p.p_cash_location_id,status:'draft',version:1,choices_json:choices,gross_amount:gross,wht_amount:wht,net_amount:gross-wht,note:p.p_note,confirmed_snapshot_json:null};return{data:p.p_id};}
 if(name==='confirm_finance_payout'){if(!p.p_acknowledged||p.p_expected_version!==1||p.p_expected_payee_version!==1||p.p_expected_destination_id!==d.payees[0].destination.id)throw Error('Missing expected evidence');d.payout.status='confirmed';d.payout.confirmed_snapshot_json={payee:d.payees[0],destination:d.payees[0].destination,account:d.accounts[0]};d.history=[{id:d.payout.id,paid_on:d.payout.paid_on,status:'confirmed',gross:d.payout.gross_amount,wht:d.payout.wht_amount,net:d.payout.net_amount}];d.components=[];return{data:d.payout.id};}
 throw Error('Unexpected fixture mutation '+name);}};`);
const navigation=write('navigation.js',`import{useState,useEffect}from'react';export const usePathname=()=>'/finance/payouts/new';export const useRouter=()=>({push:url=>{history.pushState({},'',url);window.dispatchEvent(new Event('nav'))},replace:url=>{history.replaceState({},'',url);window.dispatchEvent(new Event('nav'))},refresh(){}});export function useRoute(){const[v,s]=useState(location.pathname+location.search);useEffect(()=>{const f=()=>s(location.pathname+location.search);window.addEventListener('nav',f);return()=>window.removeEventListener('nav',f)},[]);const u=new URL(v,location.origin);return{id:u.pathname.split('/').pop()||'new',payeeId:u.searchParams.get('payee')||'${payee}'};}`);
const link=write('link.js',`import React from'react';export default function Link({children,...props}){return React.createElement('a',props,children);}`);
const loader=write('loader.cjs',`module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix=require('node:path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(prefix)+'+k})};'}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);
const entry=write('entry.tsx',`import React from'react';import{createRoot}from'react-dom/client';import{useRoute}from'next/navigation';import{UiLocaleProvider}from'${root}/lib/i18n/provider.tsx';import AppTopNav from'${root}/app/components/AppTopNav.tsx';import{PayoutWorkspace}from'${root}/app/finance/payouts/workspace.tsx';function App(){const {id,payeeId}=useRoute();return <UiLocaleProvider initialLocale="th" pathname="/finance/payouts/new"><AppTopNav title="Finance" activePage="finance"/><main><PayoutWorkspace key={id+payeeId} id={id} payeeId={payeeId}/></main></UiLocaleProvider>}createRoot(document.getElementById('root')).render(<App/>);`);
async function main(){
 await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',context:root,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[root+'/node_modules'],alias:{'next/navigation':navigation,'next/link':link,[root+'/lib/supabase']:adapter}},module:{rules:[{test:/\.(tsx?|css)$/,use:loader}]},devtool:false},(e,s)=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));
 const css=['app/components/ui/vp-ui.module.css','app/components/DetailModal.module.css','app/components/LanguageSelector.module.css','app/finance/finance-sidebar.module.css','app/finance/payouts/payout.module.css'].map(file=>{const prefix=path.basename(file).replaceAll('.','_')+'_';return fs.readFileSync(root+'/'+file,'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,key)=>'.'+prefix+key);}).join('\n');
 const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(out+'/bundle.js'));}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:16px;font-family:Arial,sans-serif;background:#fff;color:#182b45}button,input,select{font-family:inherit}${css}</style><div id="root"></div><script src="/bundle.js"></script></html>`);});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});let browser;
 try{
  const {chromium}=require('/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external.push(r.request().url());return r.abort();});
  require('./receipt-render-fixture.cjs');const {translate}=require('../../lib/i18n/catalog.ts'),url='http://127.0.0.1:'+server.address().port;
  const geometry=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1||[...document.querySelectorAll('[role=dialog]')].some(e=>e.scrollWidth>e.clientWidth+1)),false,'page/modal overflow');
  for(const width of [1440,1024,768,390])for(const locale of ['th','en']){
   const t=k=>translate(locale,'payout.'+k);await page.setViewportSize({width,height:1100});await page.goto(url+'/new');await page.locator('button[lang='+locale+']').first().click();
   await page.getByRole('button',{name:t('selectAll'),exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.calls.some(c=>!c.name.startsWith('get_'))),false);
   assert.equal(await page.getByRole('heading',{name:'Finance',exact:true}).count(),0);
   await page.getByRole('button',{name:t('add'),exact:true}).click();const payeeModal=page.getByRole('dialog');await payeeModal.waitFor();
   assert.equal(await payeeModal.locator('input[type="email"]').count(),0);
   await payeeModal.getByRole('button',{name:translate(locale,'common.actions.save'),exact:true}).click();await payeeModal.getByRole('alert').waitFor();
   assert.equal(await page.evaluate(()=>window.calls.some(c=>c.name==='save_finance_payee')),false);
   await payeeModal.getByLabel(t('name'),{exact:true}).fill('Synthetic external broker');await geometry();
   await payeeModal.getByRole('button',{name:translate(locale,'common.actions.save'),exact:true}).click();await payeeModal.waitFor({state:'hidden'});
   await page.getByText(t('noRights'),{exact:true}).waitFor();await page.getByText(t('detailsPending'),{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>window.data.payees.at(-1).profile_id),null);
   await page.getByLabel(t('recipient'),{exact:true}).selectOption(payee);await page.getByRole('button',{name:t('selectAll'),exact:true}).waitFor();
   await page.getByRole('button',{name:t('save'),exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.calls.some(c=>c.name==='save_finance_payout')),false);
   await page.getByRole('button',{name:t('selectAll'),exact:true}).click();for(const select of await page.getByLabel(t('rate'),{exact:true}).all())await select.selectOption('3');
   await page.getByLabel(t('account'),{exact:true}).selectOption('bank:'+f.accounts[0].account_id);await page.getByLabel(t('date'),{exact:true}).fill('2026-09-01');
   await page.getByText('3,010.88 THB',{exact:true}).first().waitFor();await geometry();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:out+`/payout-${locale}-${width}.png`,fullPage:true});
   assert.ok(await page.getByRole('button',{name:t('review'),exact:true}).isDisabled());
   await page.getByRole('button',{name:t('save'),exact:true}).click();await page.waitForFunction(()=>window.data.payout!==null);
   const review=page.getByRole('button',{name:t('review'),exact:true});await review.waitFor();await review.click();const modal=page.getByRole('dialog');await modal.waitFor();
   assert.ok(await modal.getByRole('button',{name:t('confirm'),exact:true}).isDisabled());await page.keyboard.press('Tab');assert.equal(await modal.locator(':focus').count(),1);
   await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});assert.equal(await review.evaluate(e=>e===document.activeElement),true);
   await review.click();await modal.getByLabel(t('ack'),{exact:true}).check();await geometry();await modal.getByRole('button',{name:t('confirm'),exact:true}).click();await modal.waitFor({state:'hidden'});
   await page.getByText(t('readOnly'),{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:t('save'),exact:true}).count(),0);assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='confirm_finance_payout').length),1);
   assert.equal(await page.getByRole('list',{name:t('progress')}).locator('[data-state="complete"]').count(),4);
   assert.equal(await page.getByText('1234567890',{exact:true}).count(),0);await geometry();
   if(width===390){const menu=page.getByRole('button',{name:translate(locale,'common.nav.menu'),exact:true});await menu.click();const drawer=page.getByRole('dialog');await drawer.waitFor();await drawer.getByRole('link',{name:translate(locale,'finance.nav.legacyLedger'),exact:true}).waitFor();await page.keyboard.press('Tab');assert.equal(await drawer.locator(':focus').count(),1);await page.keyboard.press('Escape');await drawer.waitFor({state:'hidden'});assert.equal(await menu.evaluate(e=>e===document.activeElement),true);}
   else {await page.locator('[data-app-sidebar]').hover();await page.getByRole('link',{name:translate(locale,'finance.nav.legacyLedger'),exact:true}).waitFor();assert.equal(await page.locator('a[aria-current="page"][href="/finance/payables"]').count(),1);}
   // Current human UAT, entirely synthetic: missing bank/Tax ID, mixed WHT, then focused Payee repair.
   await page.goto(url+'/new?missing=1');await page.locator('button[lang='+locale+']').first().click();
   await page.getByRole('button',{name:t('selectAll'),exact:true}).waitFor();
   const progress=page.getByRole('list',{name:t('progress')});assert.equal(await progress.locator('[aria-current="step"]').getAttribute('data-state'),'active');
   assert.equal(await page.getByText(t('unknown'),{exact:true}).count(),0);
   await page.getByRole('button',{name:t('selectAll'),exact:true}).click();
   assert.ok((await progress.locator('[aria-current="step"]').innerText()).includes(t('stepTax')));
   const selects=page.getByLabel(t('rate'),{exact:true});await selects.nth(0).selectOption('3');await selects.nth(1).selectOption('0');
   await page.getByLabel(t('account'),{exact:true}).selectOption('bank:'+f.accounts[0].account_id);await page.getByLabel(t('date'),{exact:true}).fill('2026-09-01');
   await page.getByLabel('5. '+t('note'),{exact:true}).fill('Synthetic preserved note');
   assert.equal(await progress.locator('[data-state="complete"]').count(),2);assert.ok((await progress.locator('[aria-current="step"]').innerText()).includes(t('review')));
   for(const value of ['1,881.80 THB','58.20 THB','3,045.80 THB','26,514.20 THB'])await page.getByText(value,{exact:true}).first().waitFor();
   const blockedReview=page.getByRole('button',{name:t('review'),exact:true});assert.ok(await blockedReview.isDisabled());assert.equal(await blockedReview.getAttribute('aria-describedby'),'payout-review-blockers');
   for(const key of ['bankMissing','taxMissing','saveFirst'])assert.ok((await page.locator('#payout-review-blockers').innerText()).includes(t(key)));
   for(const key of ['destination','requiredTax'])assert.equal(await page.locator('[data-check='+key+']').getAttribute('data-state'),'missing');
   for(const control of [selects.nth(0),selects.nth(1),page.getByLabel(t('account'),{exact:true})]){await control.focus();assert.equal(await control.evaluate(e=>e===document.activeElement),true);await page.keyboard.press('Tab');}
   await geometry();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:out+`/blocked-${locale}-${width}.png`,fullPage:true});
   const fix=page.getByRole('button',{name:t('fixPayee'),exact:true});await fix.focus();await page.keyboard.press('Enter');const repair=page.getByRole('dialog');await repair.waitFor();await page.keyboard.press('Tab');assert.equal(await repair.locator(':focus').count(),1);
   await page.keyboard.press('Escape');await repair.waitFor({state:'hidden'});assert.equal(await fix.evaluate(e=>e===document.activeElement),true);await fix.click();await repair.waitFor();
   await repair.getByLabel(t('taxId'),{exact:true}).fill('1234567890123');await repair.getByLabel(t('bank'),{exact:true}).fill('KBANK');await repair.getByLabel(t('accountName'),{exact:true}).fill('Synthetic Pam');await repair.getByLabel(t('accountNumber'),{exact:true}).fill('1234567890');
   await geometry();await repair.getByRole('button',{name:translate(locale,'common.actions.save'),exact:true}).click();await repair.waitFor({state:'hidden'});
   await page.waitForFunction(()=>document.querySelector('[data-check=destination]')?.dataset.state==='ready');
   assert.equal(await selects.nth(0).inputValue(),'3');assert.equal(await selects.nth(1).inputValue(),'0');assert.equal(await page.getByLabel(t('date'),{exact:true}).inputValue(),'2026-09-01');assert.equal(await page.getByLabel('5. '+t('note'),{exact:true}).inputValue(),'Synthetic preserved note');
   assert.equal(await page.getByLabel(t('account'),{exact:true}).inputValue(),'bank:'+f.accounts[0].account_id);assert.equal(await page.locator('[data-check=requiredTax]').getAttribute('data-state'),'ready');
   assert.ok(await blockedReview.isDisabled());assert.ok((await page.locator('#payout-review-blockers').innerText()).includes(t('saveFirst')));
   assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='save_finance_payout'||c.name==='confirm_finance_payout').length),0);
   await page.getByRole('button',{name:t('save'),exact:true}).click();await page.waitForFunction(()=>window.data.payout!==null);await blockedReview.click();const finalReview=page.getByRole('dialog');await finalReview.waitFor();
   for(const value of ['1,881.80 THB','58.20 THB','3,045.80 THB'])assert.ok(await finalReview.getByText(value,{exact:true}).first().isVisible());
   for(const key of ['account','destination','date'])assert.ok(await finalReview.getByText(t(key),{exact:true}).isVisible());
   await geometry();await page.screenshot({path:out+`/review-${locale}-${width}.png`});await page.keyboard.press('Escape');await finalReview.waitFor({state:'hidden'});
   // Selection changes immediately change actual requirements; Office Cash with no WHT needs neither bank nor Tax ID.
   await page.goto(url+'/new?missing=1');await page.locator('button[lang='+locale+']').first().click();await page.getByRole('button',{name:t('selectAll'),exact:true}).click();
   for(const select of await page.getByLabel(t('rate'),{exact:true}).all())await select.selectOption('0');await page.getByLabel(t('account'),{exact:true}).selectOption('cash:office');
   for(const key of ['destination','requiredTax'])assert.equal(await page.locator('[data-check='+key+']').getAttribute('data-state'),'ready');
   assert.equal(await page.getByRole('button',{name:t('fixPayee'),exact:true}).count(),0);await geometry();
   console.log(`PASS ${locale} ${width}: lifecycle, mixed WHT, blockers, repair preservation, cash/no-WHT, keyboard, overflow`);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({pass:true,widths:[390,768,1024,1440],locales:['th','en'],actualUi:true,keyboard:true,externalRequests:0,artifacts:out}));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);console.error('Artifacts:',out);process.exitCode=1;});
