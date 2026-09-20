/* eslint-disable @typescript-eslint/no-require-imports */
// Render real components/CSS with closed local data. All external requests are blocked.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {fixture}=require('./expense-foundation-fixture.cjs'),root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vp-expense-browser-'));
const flows=['list','company-review','employee','claim-review','queue','queue-revenue','claims','claims-empty','claims-admin','claims-finance','draft','confirmed'];
const fixtures=Object.fromEntries(flows.map(f=>[f,fixture(f)]));
const write=(name,text)=>{const p=path.join(out,name);fs.writeFileSync(p,text);return p;};
const navigation=write('navigation.js',`export const usePathname=()=>new URLSearchParams(location.search).get('pathname')||(location.search.includes('employee')||location.search.includes('claim')||location.search.includes('draft')?'/finance/expenses/claims':location.search.includes('queue')?'/finance/payables':'/finance/expenses');export const useRouter=()=>({push(){},replace(){},refresh(){}});export const useSearchParams=()=>new URLSearchParams(location.search);`);
const adapter=write('adapter.js',`window.calls=[];const fixtures=${JSON.stringify(fixtures)},access=fixtures[new URLSearchParams(location.search).get('flow')||'list'].data.access;export const supabase={auth:{async getUser(){return {data:{user:{id:'synthetic'}}}}},from(name){if(name!=='user_profiles')throw Error('Unexpected table read');return {select(){return this},eq(){return this},async single(){return location.search.includes('finance-only')?{data:{role:'staff'}}:{data:{role:access.is_admin?'admin':'staff',can_submit_expense_claim:true,can_view_own_expense_claims:true}}}}},async rpc(name){window.calls.push(name);if(name==='get_finance_expense_access')return{data:location.search.includes('finance-only')?${JSON.stringify({...fixture('list').data.access,can_claim:false,can_record:false,can_confirm:false,can_view_accounts:false,is_admin:false})}:access};throw Error('Forbidden RPC '+name);}};`);
const link=write('link.js',`import React from'react';export default function Link({children,...props}){return <a {...props}>{children}</a>;}`);
const loader=write('loader.cjs',`module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix=require('node:path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(prefix)+'+k})};'}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);
const entry=write('entry.tsx',`import React from'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider.tsx';import AppTopNav from'${root}/app/components/AppTopNav.tsx';import{ExpenseWorkspace}from'${root}/app/finance/expenses/workspace.tsx';import{MultiSourcePayables}from'${root}/app/finance/payables/multi-source.tsx';const params=new URLSearchParams(location.search),flow=params.get('flow')||'list',f=(${JSON.stringify(fixtures)})[flow];createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale={params.get('locale')||'th'} pathname="/finance/expenses"><AppTopNav title="VP Case System" activePage="finance"/><main style={{maxWidth:1180,margin:'0 auto',padding:24}}>{flow.startsWith('queue')?<MultiSourcePayables canReadRevenue={true} canReadExpense={true} isAdmin={true} fixture={{revenue:f.revenue,expenses:flow==='queue-revenue'?[]:f.obligations}}/>:<ExpenseWorkspace id={flow==='employee'?'new':f.data.record?.id} claims={flow.startsWith('claims')||['employee','claim-review','draft'].includes(flow)} fixture={f.data} fixtureLookups={f.lookups}/>}</main></UiLocaleProvider>);`);
async function main(){
 await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',context:root,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[root+'/node_modules'],alias:{'next/navigation':navigation,'next/link':link,[root+'/lib/supabase']:adapter}},module:{rules:[{test:/\.(tsx?|css|js)$/,exclude:/node_modules/,use:loader}]},devtool:false},(e,s)=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));
 const files=['app/components/AppSidebar.module.css','app/components/ui/vp-ui.module.css','app/components/DetailModal.module.css','app/components/LanguageSelector.module.css','app/finance/finance-sidebar.module.css','app/finance/expenses/expenses.module.css','app/finance/payables/payables.module.css'];
 const css=files.map(file=>{const prefix=path.basename(file).replaceAll('.','_')+'_';return fs.readFileSync(root+'/'+file,'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,key)=>'.'+prefix+key).replace(/:global\(([^)]+)\)/g,'$1');}).join('\n');
 const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(out+'/bundle.js'));}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#182b45}button,input,select,textarea{font-family:inherit}${css}</style><div id="root"></div><script src="/bundle.js"></script></html>`);});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});let browser;
 try{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external.push(r.request().url());return r.abort();});
  require('./receipt-render-fixture.cjs');const {translate}=require('../../lib/i18n/catalog.ts');const url='http://127.0.0.1:'+server.address().port;
  for(const width of [1440,1024,768,390])for(const locale of ['th','en']){
   const t=k=>translate(locale,'expenses.'+k);
   for(const flow of flows){
    await page.setViewportSize({width,height:1050});await page.goto(`${url}?flow=${flow}&locale=${locale}`);await page.locator('main h1').waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${flow} ${locale} ${width} page overflow`);
    assert.deepEqual(await page.locator('main button,main select,main strong').evaluateAll(nodes=>nodes.filter(n=>n.clientWidth&&n.scrollWidth>n.clientWidth+2).map(n=>n.textContent)),[],`${flow} ${locale} ${width} control overflow`);
    assert.equal(await page.locator('main pre:visible,input[type=file]').count(),0);
    assert.equal(await page.locator('main').innerText().then(s=>/expenses\.|finance\.nav\./.test(s)),false,'No missing translations');
    const first=page.locator('main button:not([disabled]),main a').first();await first.focus();assert.ok(await first.evaluate(e=>document.activeElement===e));await page.keyboard.press('Tab');assert.ok(await page.locator(':focus').count());
    if(flow==='employee'){assert.equal(await page.getByRole('button',{name:t('saveReview'),exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:t('confirmPayment'),exact:true}).count(),0);}
    if(flow==='draft'){await page.getByLabel(t('description'),{exact:true}).fill('Changed synthetic fact');assert.ok(await page.getByRole('button',{name:t('submit'),exact:true}).isDisabled());await page.getByText(t('saveBeforeSubmit'),{exact:true}).waitFor();}
    if(flow==='confirmed')assert.equal(await page.locator('main pre').count(),0,'Non-Admin raw evidence not rendered');
    if(flow==='queue'){await page.locator('main button[aria-pressed]').last().click();await page.getByRole('complementary',{name:t('employee_reimbursement'),exact:true}).getByText('3,725.00 THB',{exact:true}).waitFor();await page.getByText('20,245.00 THB',{exact:true}).waitFor();assert.equal(await page.locator('[data-recipient]').count(),3);assert.equal(await page.locator('[data-source-family]').count(),3);}
    if(flow==='queue-revenue'){assert.equal(await page.locator('[data-source-family]').count(),1);await page.getByText('5,820.00 THB',{exact:true}).waitFor();}
    if(flow.startsWith('queue')){assert.equal(await page.locator('[data-recipient-kind] svg').count(),flow==='queue'?5:3);assert.equal(await page.locator('[data-recipient-kind]').evaluateAll(nodes=>nodes.some(n=>n.textContent.trim())),false);}
    if(flow.startsWith('claims')){assert.equal(await page.getByText(t('authorities'),{exact:true}).count(),0);assert.equal(await page.getByText(t('adminTools'),{exact:true}).count(),flow==='claims-admin'?1:0);assert.equal(await page.getByText(t('vatAmount'),{exact:true}).count(),0);if(flow==='claims-empty'){await page.getByRole('heading',{name:t('noClaims')}).waitFor();assert.equal(await page.locator('main a[href="/finance/expenses/claims/new"]').count(),2);}if(flow==='claims-admin')assert.equal(await page.locator('main details').first().getAttribute('open'),null);}
    if(flow==='claims'){await page.locator('#claim-status').selectOption('accepted');assert.equal(await page.locator('main tbody tr').count(),1);await page.locator('#claim-status').selectOption('all');await page.locator('#claim-search').fill('no matching synthetic claim');await page.getByRole('heading',{name:t('noMatchingClaims'),exact:true}).waitFor();await page.locator('#claim-search').fill('');assert.equal(await page.locator('main tbody tr').count(),2);}
    assert.ok((await page.evaluate(()=>window.calls)).every(n=>n==='get_finance_expense_access'));
    await page.screenshot({path:out+`/${flow}-${locale}-${width}.png`,fullPage:true});
   }
   await page.goto(`${url}?flow=list&locale=${locale}&pathname=/finance/receipts/synthetic`);
   const menu=page.getByRole('button',{name:translate(locale,'common.nav.menu'),exact:true});
   await page.locator('main h1').waitFor();
   if(await menu.count())await menu.click();else await page.locator('[data-app-sidebar]').hover();
   const documents=page.locator('button[aria-controls="finance-receiving-documents"]');
   await documents.waitFor({state:'visible'});
   assert.equal(await documents.getAttribute('aria-expanded'),'true','Child route auto-expands receiving documents');
   assert.equal(await page.locator('#finance-receiving-documents a[aria-current="page"]').getAttribute('href'),'/finance/receipts');
   await documents.focus();await page.keyboard.press('Enter');assert.equal(await documents.getAttribute('aria-expanded'),'false');
   await page.keyboard.press('Enter');await page.keyboard.press('Tab');
   assert.equal(await page.locator(':focus').getAttribute('href'),'/finance/receipts','Keyboard enters expanded child links');
   await page.waitForTimeout(550); // Allow the existing 220ms reveal and scroll to settle before capture.
   await page.screenshot({path:out+`/navigation-${locale}-${width}.png`,fullPage:true});
   if(await menu.count()){await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});assert.ok(await menu.evaluate(e=>document.activeElement===e));}
   await page.goto(`${url}?flow=list&locale=${locale}&pathname=/finance/expenses`);await page.locator('main h1').waitFor();
   if(await menu.count())await menu.click();else await page.locator('[data-app-sidebar]').hover();
   const active=page.locator('#finance-sidebar-links a[aria-current="page"]');await active.waitFor({state:'visible'});
   assert.equal(await active.getAttribute('href'),'/finance/expenses');assert.equal(await documents.getAttribute('aria-expanded'),'false');
   assert.equal(await page.locator('[data-finance-section]').count(),5);
   const hierarchy=await page.locator('[data-finance-section=expenseGroup]').evaluate(e=>({heading:parseFloat(getComputedStyle(e.querySelector('h3')).fontSize),leaf:parseFloat(getComputedStyle(e.querySelector('a')).fontSize),indicator:getComputedStyle(e.querySelector('[aria-current]'),'::before').width}));assert.ok(hierarchy.heading>hierarchy.leaf);assert.equal(hierarchy.indicator,'3px');
   await page.waitForTimeout(550);
   assert.equal(await active.evaluate(e=>{const nav=e.closest('nav'),r=e.getBoundingClientRect(),n=nav.getBoundingClientRect();return r.top>=n.top&&r.bottom<=n.bottom;}),true,'Active leaf revealed within sidebar');
   await page.screenshot({path:out+`/sidebar-expenses-${locale}-${width}.png`});
   await page.locator('#finance-sidebar-links').evaluate(e=>{const nav=e.closest('nav');nav.scrollTop+=e.getBoundingClientRect().top-nav.getBoundingClientRect().top-50;});
   await page.screenshot({path:out+`/sidebar-finance-categories-${locale}-${width}.png`});
   await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await active.evaluate(e=>getComputedStyle(e).transitionDuration),'0s');await page.emulateMedia({reducedMotion:'no-preference'});
   if(await menu.count()){await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});}
   console.log('PASS',locale,width,flows.length+' flows + sidebar hierarchy/accordion/drawer/reduced motion');
  }
  await page.setViewportSize({width:1440,height:1050});await page.goto(`${url}?flow=list&locale=en&finance-only=1`);
  await page.locator('[data-app-sidebar]').hover();await page.locator('#finance-sidebar-links a[href="/finance/expenses"]').waitFor({state:'visible'});
  assert.equal(await page.locator('#finance-sidebar-links a[href="/finance/treasury"]').count(),0,'Expense-only Finance visibility grants no Treasury menu');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({pass:true,artifacts:out,externalRequests:0}));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);console.error('Artifacts:',out);process.exitCode=1;});
