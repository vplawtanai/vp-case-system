/* eslint-disable @typescript-eslint/no-require-imports */
// Actual React UI with a closed synthetic adapter; all non-loopback traffic blocked.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const dashboardFixture=require('./treasury-dashboard-fixture.cjs').fixture();
const root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vp-treasury-browser-'));
const write=(name,text)=>{const p=path.join(out,name);fs.writeFileSync(p,text);return p;};
const id=n=>'40000000-0000-4000-8000-'+String(n).padStart(12,'0');
const accounts=[{kind:'bank',account_id:id(1),bank_account_id:id(1),cash_location_id:null,name_th:'KBANK',name_en:'KBANK',bank_name:'Synthetic Bank',account_number:'000-0-00000-0'},
 {kind:'cash',account_id:id(2),bank_account_id:null,cash_location_id:id(2),name_th:'เงินสดสำนักงาน',name_en:'Office Cash',bank_name:null,account_number:null}].map(a=>({...a,is_active:true,currency:'THB',opening_id:null,opening_as_of:null,opening_amount:null,system_balance:null,inflow:0,outflow:0}));
const source={source_type:'direct_money_receipt',source_id:id(3),status:'confirmed',bank_account_id:id(1),cash_location_id:null,received_on:'2026-07-01',cash_amount:10400,wht_amount:300,currency:'THB',payer_name:'Synthetic payer',reference:'SYNTHETIC-1',description:'Synthetic receipt'};
const adapter=write('adapter.js',`
window.calls=[];window.fail=null;window.data={can_manage:!location.search.includes('readonly'),accounts:${JSON.stringify(accounts)},transactions:[],openings:[],pending_sources:location.search.includes('readonly')?[]:[${JSON.stringify(source)}],has_next:false};
if(location.search.includes('dashboard'))window.data=${JSON.stringify(dashboardFixture)};
if(location.search.includes('payment'))Object.assign(window.data.pending_sources[0],{source_type:'payment',source_id:'${id(4)}',cash_amount:19160,wht_amount:840,reference:'SYNTHETIC-PAYMENT'});
if(location.search.includes('trace'))window.data.transactions=[0,1,2].map(i=>({id:'trace-'+i,source_payout_id:'payout-'+i,bank_account_id:window.data.accounts[0].bank_account_id,cash_location_id:null,occurred_at:'2026-09-23T04:00:00Z',cash_amount:500,currency:'THB',direction:'outflow',transaction_type:'other',status:'confirmed',reference_no:'MOV-'+i,description:'Expense payout'}));
export const supabase={auth:{async getUser(){return{data:{user:{id:'synthetic'}}}},async signOut(){throw Error('Blocked')}},from(name){return{select(){return this},in(){return this},eq(){return this},async single(){return{data:{role:location.search.includes('readonly')?'partner':'admin'}}},then(resolve){const tables={
 finance_payouts:[0,1].map(i=>({id:'payout-'+i,status:'confirmed',source_model:'expense_v1',confirmed_snapshot_json:{schema_version:2,source_model:'expense_v1',wht:i?0:15,payee:{legal_name:i?'Synthetic claimant':'Big C'},choices:[{expense_id:'expense-'+i,expense:{id:'expense-'+i,origin:i?'employee_claim':'company_purchase',description:'',request_id:i?'22222222-0000-4000-8000-000000000001':'11111111-0000-4000-8000-000000000001',created_by:'requester',client_id:'client',case_id:55}}]}})),
 user_profiles:[{id:'requester',staff_name:'Synthetic requester'}],clients:[{id:'client',name:'Synthetic client'}],cases:[{id:55,file_no:'CASE-55',title:'Synthetic case'}],advisory_matters:[]};return Promise.resolve({data:tables[name]||[]}).then(resolve);}}},async rpc(name,p){window.calls.push({name,p});await new Promise(r=>setTimeout(r,60));const d=window.data;
 if(name==='get_finance_expense_access')return {data:{is_admin:!location.search.includes('readonly')}};
 if(name==='get_finance_treasury')return {data:structuredClone(d)};
 if(name==='get_finance_treasury_month_flow')return {data:{period_month:p.p_month,currency:'THB',cash:46419.81,receipt_count:5,pre_cutoff:16859.81,represented:29560,pending:0,unresolved:0}};
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
const navigation=write('navigation.js',"export const usePathname=()=>new URLSearchParams(location.search).get('route')||'/finance/treasury';export const useRouter=()=>({replace(){throw Error('Unexpected navigation')},refresh(){}});");
const link=write('link.js',`import React from '${require.resolve('react')}';export default function Link({children,...props}){return React.createElement('a',props,children)}`);
const guard=write('guard.js','export const QuotationGuard=()=>null;');
const loader=write('loader.cjs',`module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix=require('node:path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(prefix)+'+k})};'}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);
const entry=write('entry.tsx',`import React from'react';import{createRoot}from'react-dom/client';
import{UiLocaleProvider,useI18n}from'${root}/lib/i18n/provider.tsx';import AppTopNav from'${root}/app/components/AppTopNav.tsx';
import{TreasuryWorkspace}from'${root}/app/finance/treasury/page.tsx';
function App(){const{t}=useI18n();return <><AppTopNav title={t('finance.quotation.guard.title')} activePage="finance"/><main style={{maxWidth:1180,margin:'0 auto',padding:24}}><TreasuryWorkspace isAdmin={!location.search.includes('readonly')}/></main></>}
createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale="th" pathname="/finance/treasury"><App/></UiLocaleProvider>);`);
async function main(){
 await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',context:root,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[root+'/node_modules'],alias:{'next/navigation':navigation,'next/link':link,[root+'/lib/supabase']:adapter,[root+'/app/finance/quotations/shared']:guard}},module:{rules:[{test:/\.(tsx?|css)$/,use:loader}]},devtool:false},(e,s)=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));
 const css=['app/components/AppSidebar.module.css','app/components/ui/vp-ui.module.css','app/components/DetailModal.module.css','app/finance/treasury/treasury.module.css','app/components/LanguageSelector.module.css','app/finance/finance-sidebar.module.css'].map(file=>{
  const prefix=path.basename(file).replaceAll('.','_')+'_';return fs.readFileSync(root+'/'+file,'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,key)=>'.'+prefix+key);
 }).join('\n');
 const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(out+'/bundle.js'));}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:16px;font-family:Arial,sans-serif;background:#fff;color:#182b45}button,input,select{font-family:inherit}${css}</style><div id="root"></div><script src="/bundle.js"></script></html>`);});
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
  if(process.argv.includes('--trace-only')){
   for(const[width,locale]of[[390,'th'],[1440,'th'],[1440,'en']]){
    const t=k=>translate(locale,'treasury.'+k);await page.setViewportSize({width,height:1100});await page.goto(url+'?trace');await page.locator('button[lang='+locale+']').first().click();
    await page.locator('[data-movement="trace-0"]').getByText(/Big C/).waitFor();const company=await page.locator('[data-movement="trace-0"]').innerText(),claim=await page.locator('[data-movement="trace-1"]').innerText();assert.ok(company.includes(t('companyExpenseOutflow'))&&company.includes('REQ-11111111')&&company.includes('Synthetic requester'));assert.ok(claim.includes(t('claimOutflow'))&&claim.includes('Synthetic claimant')&&claim.includes('REQ-22222222'));
    assert.ok((await page.locator('[data-movement="trace-2"]').innerText()).includes(t('expenseOutflow')));await geometry();await page.screenshot({path:out+'/trace-'+locale+'-'+width+'.png',fullPage:true});
    await page.locator('[data-movement="trace-0"] button').click();const dialog=page.getByRole('dialog');assert.ok((await dialog.innerText()).includes('Synthetic client'));assert.ok((await dialog.innerText()).includes('CASE-55'));assert.ok((await dialog.innerText()).includes('15.00 THB'));assert.ok((await dialog.innerText()).includes('REQ-11111111'));assert.ok(!(await dialog.innerText()).includes('11111111-0000'));await geometry();
   }
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({pass:true,scenarios:3,artifacts:out}));return;
  }
  for(const width of [1440,1024,768,390])for(const locale of ['th','en']){
   const t=k=>translate(locale,'treasury.'+k);await page.setViewportSize({width,height:1100});await page.goto(url+'?dashboard');await page.locator('button[lang='+locale+']').first().click();
   await page.locator('[data-treasury-summary]').waitFor();assert.ok((await page.locator('[data-summary=known]').innerText()).includes('49,560.00'));
   assert.ok((await page.locator('[data-summary=pending]').innerText()).includes(translate(locale,'treasury.pendingCount',{count:0})));assert.ok((await page.locator('[data-summary=unknown]').innerText()).includes('BAY · KTB'));
   await page.getByRole('region',{name:t('currentStock'),exact:true}).waitFor();
   assert.equal(await page.getByText('46,419.81 THB',{exact:true}).count(),0);assert.equal(await page.getByText('16,859.81 THB',{exact:true}).count(),0);
   const archive=page.locator('details').filter({has:page.locator('summary').getByText(t('preCutoff')+' · 5',{exact:true})});
   assert.equal(await archive.getAttribute('open'),null);assert.equal(await archive.getByRole('button').count(),0);
   assert.ok(await archive.evaluate(e=>e.getBoundingClientRect().top>document.getElementById('treasury-movements').getBoundingClientRect().top));
   await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:out+`/current-state-${locale}-${width}.png`});
   assert.equal(await page.locator('[data-balance=known]').count(),2);assert.equal(await page.locator('[data-balance=unknown]').count(),2);assert.equal(await page.getByRole('table').count(),1);assert.equal(await page.locator('[data-movement]').count(),2);
   assert.equal(await page.getByRole('button',{name:t('materialize'),exact:true}).count(),0);assert.equal(await page.locator('pre:visible').count(),0);assert.equal(await page.locator('details[open]').count(),0);
   const historical=page.locator('details').filter({has:page.locator('summary').filter({hasText:t('preCutoff')})});await historical.locator('summary').click();assert.equal(await historical.getByRole('link').count(),5);assert.equal(await historical.getByRole('button').count(),0);await historical.locator('summary').click();
   await geometry();assert.ok(await page.locator('[data-summary-amount]').evaluateAll(es=>es.every(e=>{const range=document.createRange();range.selectNodeContents(e);return range.getClientRects().length===1&&e.scrollWidth<=e.clientWidth+1;})),'summary money must not split or clip');await page.screenshot({path:out+`/dashboard-${locale}-${width}.png`,fullPage:true});await page.screenshot({path:out+`/dashboard-viewport-${locale}-${width}.png`});
   const grid=await page.locator('[data-account]').evaluateAll(es=>es.map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y})));assert.equal(new Set(grid.map(p=>p.x)).size,width===1440?4:width===390?1:2);
   const maintenance=page.getByLabel(translate(locale,'treasury.accountActions',{account:'KBANK'}),{exact:true});await maintenance.focus();await page.keyboard.press('Enter');
   const replacement=page.getByRole('button',{name:t('replacement'),exact:true}).first();await replacement.waitFor();await replacement.click();const modal=page.getByRole('dialog');await modal.waitFor();await modal.getByText(t('replaceHelp'),{exact:true}).waitFor();await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});assert.ok(await maintenance.evaluate(e=>e===document.activeElement));
   await page.locator('[data-account="cash:'+dashboardFixture.accounts[1].account_id+'"]').getByRole('button',{name:t('viewMovements'),exact:true}).click();await page.getByText(t('noMatches'),{exact:true}).waitFor();assert.equal(await page.locator('#treasury-movements:focus').count(),1);
   await page.getByRole('button',{name:t('resetFilters'),exact:true}).click();await page.getByLabel(t('fromDate'),{exact:true}).fill('2026-09-12');assert.equal(await page.locator('[data-movement]').count(),1);await page.getByLabel(t('toDate'),{exact:true}).fill('2026-09-14');assert.equal(await page.locator('[data-movement]').count(),0);
   await page.getByRole('button',{name:t('resetFilters'),exact:true}).click();await page.getByLabel(t('type'),{exact:true}).selectOption('outflow');await page.getByText(t('noMatches'),{exact:true}).waitFor();await page.getByRole('button',{name:t('resetFilters'),exact:true}).click();
   const detail=page.getByRole('button',{name:translate(locale,'treasury.openMovement',{reference:'TEST-30'}),exact:true});await detail.click();await modal.waitFor();assert.equal(await modal.locator('pre:visible').count(),0);await modal.locator('summary').first().click();assert.equal(await modal.locator('pre:visible').count(),0);await modal.locator('summary').nth(1).click();await modal.locator('pre').waitFor();assert.ok((await modal.locator('pre').innerText()).includes(dashboardFixture.transactions[0].source_snapshot_json.source_id));await geometry();await page.keyboard.press('Escape');assert.ok(await detail.evaluate(e=>e===document.activeElement));
   assert.equal(await page.evaluate(()=>window.calls.some(c=>!['get_finance_treasury','get_finance_treasury_month_flow'].includes(c.name))),false);
   if(width===390){await page.getByRole('button',{name:translate(locale,'common.nav.menu'),exact:true}).click();const drawer=page.getByRole('dialog');await drawer.waitFor();await drawer.getByRole('link',{name:translate(locale,'finance.nav.legacyLedger'),exact:true}).waitFor();await page.keyboard.press('Escape');}
   else{await page.locator('[data-app-sidebar]').hover();await page.getByRole('link',{name:translate(locale,'finance.nav.legacyLedger'),exact:true}).waitFor();assert.equal(await page.locator('a[aria-current="page"][href="/finance/treasury"]').count(),1);}
   console.log('PASS dashboard',locale,width);
  }
  for(const width of [390,1440])for(const locale of ['th','en'])for(const reduced of [false,true])for(const route of ['/finance/treasury','/finance/tax-position','/finance/tax-position/filings','/finance/payables','/finance/ledger']){
   await page.setViewportSize({width,height:700});await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});await page.goto(url+'?dashboard&route='+encodeURIComponent(route));await page.locator('button[lang='+locale+']').first().click();await page.locator('[data-treasury-summary]').waitFor();await page.evaluate(()=>scrollTo(0,120));
   const before=await page.evaluate(()=>({y:scrollY,x:document.querySelector('main').getBoundingClientRect().x}));
   if(width===390)await page.getByRole('button',{name:translate(locale,'common.nav.menu'),exact:true}).click();else await page.locator('[data-app-sidebar]').hover();
   const nav=page.locator('[data-sidebar-navigation]'),target=nav.locator('[aria-current=page]');await target.waitFor();
   await page.waitForFunction(()=>{const nav=document.querySelector('[data-sidebar-navigation]'),a=nav?.querySelector('[aria-current=page]');if(!a)return false;const n=nav.getBoundingClientRect(),r=a.getBoundingClientRect();return r.top>=n.top&&r.bottom<=n.bottom;});
   assert.equal(await target.getAttribute('href'),route.includes('/filings')?'/finance/tax-position':route);
   assert.equal(await page.evaluate(()=>document.querySelector('main').getBoundingClientRect().x),before.x,'Expansion overlays content');
   if(width!==390)assert.equal(await page.evaluate(()=>scrollY),before.y,'Only navigation scrolls');
   await page.waitForTimeout(500);assert.ok(await nav.evaluate(n=>[...n.querySelectorAll('a,button')].every(e=>e.getBoundingClientRect().right<=n.getBoundingClientRect().right+1)),'No menu row clips horizontally');await nav.evaluate(n=>n.scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(350);assert.equal(await nav.evaluate(n=>n.scrollTop),0,'Manual nav scroll is not hijacked');
   if(route.endsWith('/filings')&&!reduced){await nav.evaluate(n=>n.querySelector('[aria-current=page]').scrollIntoView({block:'nearest'}));await page.screenshot({path:out+`/sidebar-${locale}-${width}.png`});}
   if(width===390)await page.keyboard.press('Escape');else{assert.equal(await page.locator('[data-app-sidebar]').evaluate(n=>getComputedStyle(n).transitionDuration),reduced?'0s':'0.22s, 0.22s, 0.22s');await page.mouse.move(width-10,10);await page.waitForFunction(()=>document.querySelector('[data-app-sidebar]')?.getAttribute('data-expanded')==='false');}
  }
  await page.emulateMedia({reducedMotion:'no-preference'});
  for(const locale of ['th','en'])for(const width of [390,768,1024,1440])for(const sourceType of ['direct_money_receipt','payment']){
   const t=k=>translate(locale,'treasury.'+k);await page.setViewportSize({width,height:1000});await page.goto(url+(sourceType==='payment'?'?payment':''));await page.locator('button[lang='+locale+']').first().click();
   const opening=page.getByRole('button',{name:t('opening'),exact:true}).first();await opening.waitFor();await geometry();
   await page.getByRole('heading',{name:t('pending'),exact:true}).waitFor();await page.getByText(t('pendingHelp'),{exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:t('materialize'),exact:true}).count(),0);
   assert.equal(await page.evaluate(()=>window.calls.some(c=>!['get_finance_treasury','get_finance_treasury_month_flow'].includes(c.name))),false);
   assert.equal(await page.locator('[data-account]').getByText(t('unknown'),{exact:true}).count(),2);await page.getByText(t('empty'),{exact:true}).waitFor();
   await page.getByText('Synthetic Bank · 000-0-00000-0',{exact:true}).waitFor();await page.getByRole('heading',{name:locale==='th'?'เงินสดสำนักงาน':'Office Cash',exact:true}).waitFor();
   assert.equal(await page.locator('[data-balance=unknown]').filter({hasText:'0.00'}).count(),0);assert.equal(await page.locator('[data-account]').filter({hasText:'THB'}).count(),2);
   assert.equal(await calls('save_finance_treasury_opening'),0);await page.screenshot({path:out+`/treasury-${sourceType}-${locale}-${width}.png`,fullPage:true});
   assert.equal(await calls('materialize_finance_treasury_source'),0);
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
   await page.goto(url+'?readonly');await page.locator('button[lang='+locale+']').first().click();await page.getByText(t('empty'),{exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:t('opening'),exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:t('materialize'),exact:true}).count(),0);await geometry();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({pass:true,widths:[390,768,1024,1440],locales:['th','en'],keyboardFocus:true,acknowledgements:true,readOnly:true,externalRequests:0,artifacts:out}));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);console.error('Artifacts:',out);process.exitCode=1;});
