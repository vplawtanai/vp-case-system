/* eslint-disable @typescript-eslint/no-require-imports */
// Real React, VP shell and CSS. Local synthetic SELECT/RPC adapter only.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fixture,adapter,taxAdapter}=require('./executive-dashboard-fixture.cjs');
const root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vp-executive-dashboard-'));
const write=(name,text)=>{const file=path.join(out,name);fs.writeFileSync(file,text);return file;};
const mock=write('adapter.js',`const f=${JSON.stringify(fixture('2026-08'))};const params=new URLSearchParams(location.search);f.rpc.get_finance_cash_flow_summary.currencies[0].external_inflow=10400;window.fixture=f;
if(params.has('unknown'))f.treasury.accounts[0].opening_id=null;
if(params.has('mixed')){f.treasury.accounts.push({...f.treasury.accounts[0],account_id:'USD',currency:'USD',system_balance:25});f.rpc.get_finance_company_statement.totals.push({currency:'USD',amount:50});}
if(params.has('fail'))f.fail='get_finance_cash_flow_summary';
if(params.has('denied'))f.rpc.get_finance_expense_access.can_view_all=false;
if(params.has('empty')){for(const r of Object.values(f.rpc))if(r.currencies)r.currencies=[];f.treasury.accounts=[];f.rpc.get_finance_revenue_distribution_workspace.summary=[];}
f.rpc.get_finance_treasury=f.treasury;
const a=(${adapter.toString()})(f,${taxAdapter.toString()});window.calls=a.calls;window.tableCalls=a.tableCalls;
export const supabase={...a.client,auth:{async getUser(){return {data:{user:{id:'synthetic'}}}},async signOut(){throw Error('No mutation')}},from(table){if(table!=='user_profiles')return a.client.from(table);return{select(){return this},eq(){return this},async single(){return{data:{role:'admin'}}}}},async rpc(name,args){if(name==='get_finance_statement_accounts')return{data:{accounts:f.treasury.accounts,can_transfer:false,can_manage_openings:false}};await new Promise(r=>setTimeout(r,args?.p_from==='2026-08-01'?200:25));return a.client.rpc(name,args);}};`);
const navigation=write('navigation.js',`export const usePathname=()=>location.pathname;export const useRouter=()=>({replace(){throw Error('Unexpected navigation')}});`);
const link=write('link.js',`import React from'react';export default function Link({children,...props}){return React.createElement('a',props,children);}`);
const image=write('image.js',`import React from'react';export default function Image(props){return React.createElement('img',props);}`);
const loader=write('loader.cjs',`module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix='c'+require('node:crypto').createHash('sha256').update(this.resourcePath).digest('hex').slice(0,8)+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(prefix)+'+k})};'}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);
const entry=write('entry.tsx',`import React from'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider';import AppTopNav from'${root}/app/components/AppTopNav';import{ExecutiveOverview}from'${root}/app/finance/overview/workspace';import{buildPermissions}from'${root}/lib/permissions';const p=new URLSearchParams(location.search),permissions=buildPermissions({role:'admin'});if(p.has('denied')){permissions.canViewFinancePayments=false;permissions.canViewFinanceCashTransactions=false;}createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale={p.get('locale')||'th'} pathname={location.pathname}><AppTopNav title='VP Case System' activePage='finance'/><main><ExecutiveOverview permissions={permissions}/></main></UiLocaleProvider>);`);
async function main(){
 await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',context:root,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[root+'/node_modules'],alias:{'next/navigation':navigation,'next/link':link,'next/image':image,[root+'/lib/supabase']:mock}},module:{rules:[{test:/\.(tsx?|css)$/,use:loader}]},devtool:false},(e,s)=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));
 const styles=['app/components/AppSidebar.module.css','app/components/ui/vp-ui.module.css','app/components/LanguageSelector.module.css','app/finance/finance-sidebar.module.css','app/components/DetailModal.module.css','app/finance/overview/overview.module.css','app/finance/statement/overview.module.css','app/finance/tax-position/vat-sources.module.css'];
 const css=styles.map(file=>{const prefix='c'+crypto.createHash('sha256').update(root+'/'+file).digest('hex').slice(0,8)+'_';return fs.readFileSync(root+'/'+file,'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,k)=>'.'+prefix+k).replace(/:global\(([^)]+)\)/g,'$1');}).join('\n');
 const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');return res.end(fs.readFileSync(out+'/bundle.js'));}if(/^\/banks\/\w+\.svg$/.test(req.url)){res.setHeader('content-type','image/svg+xml');return res.end(fs.readFileSync(root+'/public'+req.url));}res.setHeader('content-type','text/html');res.end(`<!doctype html><html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>*{box-sizing:border-box}body{margin:0;background:white;font:14px Arial,sans-serif}main{max-width:1180px;margin:0 auto;padding:24px}button,input,select{font-family:inherit}${css}</style><div id='root'></div><script src='/bundle.js'></script></html>`);});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});let browser;
 try{
  const {chromium}=require('/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage(),errors=[],external=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message);});await page.clock.install({time:new Date('2026-09-25T15:00:00Z')});
  await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external.push(r.request().url());return r.abort();});
  require('./receipt-render-fixture.cjs');const {translate}=require('../../lib/i18n/catalog.ts');const base='http://127.0.0.1:'+server.address().port+'/finance/overview';
  const geometry=async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Viewport overflow');for(const x of await page.locator('[data-metric]:visible').evaluateAll(nodes=>nodes.map(n=>({width:n.clientWidth,scroll:n.scrollWidth}))))assert.ok(x.scroll<=x.width+1,JSON.stringify(x));};
  for(const width of [1440,1024,768,390])for(const locale of ['th','en']){
   const t=k=>translate(locale,'executive.'+k);await page.setViewportSize({width,height:1000});await page.goto(`${base}?locale=${locale}`);await page.locator('[aria-busy=false]').waitFor();
   for(const [key,value]of Object.entries({'cash-total':'49,560.00','cash-in':'10,400.00','cash-out':'1,070.00','economic-expense':'1,000.00','economic-net':'1,000.00','tax-vat':'630.00','tax-wht':'60.00','tax-credit':'560.19'}))assert.match(await page.locator(`[data-metric="${key}"]`).textContent(),new RegExp(value));
   assert.equal(await page.locator('[data-section]').count(),8);assert.equal(await page.locator('form').count(),0);await geometry();
   await page.screenshot({path:out+`/dashboard-${locale}-${width}.png`,fullPage:true});await page.screenshot({path:out+`/viewport-${locale}-${width}.png`});
   if(width===390){const ids=await page.locator('[data-metric]:visible').evaluateAll(nodes=>nodes.slice(0,3).map(n=>n.dataset.metric));assert.deepEqual(ids,['mobile-cash','mobile-net','mobile-vat']);}
   const accounts=page.getByRole('button',{name:t('accounts'),exact:true});await accounts.focus();await accounts.press('Enter');await page.getByRole('dialog').waitFor();await page.getByRole('dialog').getByText('KBANK',{exact:true}).waitFor();await geometry();await page.keyboard.press('Escape');assert.ok(await accounts.evaluate(n=>n===document.activeElement));
   await page.locator('[data-section=tax]').getByRole('button',{name:t('source'),exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('dialog').getByText('70.00 THB',{exact:true}).first().waitFor();await geometry();await page.keyboard.press('Escape');
   await page.getByLabel(t('period'),{exact:true}).selectOption('2026-08');await page.getByLabel(t('period'),{exact:true}).selectOption('2026-07');await page.locator('[aria-busy=false]').waitFor();assert.match(await page.locator('[data-metric=cash-in]').textContent(),new RegExp(t('empty')));
   assert.equal(await page.evaluate(()=>window.calls.some(c=>!c.name.startsWith('get_'))),false);
   const periods=await page.evaluate(()=>window.calls.filter(c=>c.name==='get_finance_tax_filings').map(c=>c.args.p_month));assert.ok(periods.every(p=>p==='2026-08-01'),'Tax period stays independent of management period');
   if(width===1440){await page.locator('[data-app-sidebar]').hover();await page.waitForFunction(()=>document.querySelector('[data-app-sidebar]').getBoundingClientRect().width>=239);await page.locator('[data-app-sidebar] a[href="/finance/overview"]').waitFor();assert.equal(await page.locator('[data-app-sidebar] a[href="/finance/statement/company"]').count(),0);}
   console.log('PASS',locale,width,'amounts, scopes, keyboard, drill-down, no overflow/writes');
  }
  for(const scenario of ['mixed','unknown','fail','denied','empty']){
   await page.goto(`${base}?locale=en&${scenario}`);await page.locator('[aria-busy=false]').waitFor();await geometry();
   if(scenario==='mixed'){assert.match(await page.locator('[data-metric=cash-total]').textContent(),/25.00USD/);assert.match(await page.locator('[data-metric=economic-net]').textContent(),/50.00USD/);}
   if(scenario==='unknown')assert.match(await page.locator('[data-metric=cash-total]').textContent(),/—THB/);
   if(scenario==='fail')assert.equal(await page.locator('[data-metric=cash-in]').textContent(),'—');
   if(scenario==='denied')assert.equal(await page.locator('[data-metric=economic-net]').textContent(),'—');
   if(scenario==='empty')assert.equal(await page.locator('[data-metric=cash-total]').textContent(),'No records');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({pass:true,artifacts:out,widths:[390,768,1024,1440],locales:['th','en'],readOnly:true}));
 }finally{await browser?.close();server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
