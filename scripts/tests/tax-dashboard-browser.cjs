/* eslint-disable @typescript-eslint/no-require-imports */
// Actual page/CSS, closed synthetic read adapter. No Production or external calls.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {fixture,adapter}=require('./tax-dashboard-fixture.cjs');
const root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vp-tax-dashboard-'));
const write=(name,text)=>{const file=path.join(out,name);fs.writeFileSync(file,text);return file;};
const data=fixture();
const mock=write('adapter.js',`const f=${JSON.stringify(data)};if(location.search.includes('empty')){for(const key in f.tables)f.tables[key]=[];f.groups=[];f.treasury.accounts=[];f.register.coverage={invoice_items_without_approved_tax_point:0,unresolved_direct_sources:0};}if(location.search.includes('fail'))f.fail=true;window.fixture=f;const a=(${adapter.toString()})(f);window.calls=a.calls;export const supabase=a.client;`);
const navigation=write('navigation.js','export const usePathname=()=>"/finance/tax-position";');
const link=write('link.js',`import React from'react';export default function Link({children,...props}){return React.createElement('a',props,children);}`);
const guard=write('guard.js',`import{buildPermissions}from'${root}/lib/permissions.ts';export function QuotationGuard({canAccess,children}){const role=location.search.includes('readonly')?'partner':'admin';const access={profile:{role},permissions:buildPermissions({role})};return canAccess(access)?children(access):null;}`);
const loader=write('loader.cjs',`module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix=require('node:path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(prefix)+'+k})};'}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);
const entry=write('entry.tsx',`import React from'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider.tsx';import LanguageSelector from'${root}/app/components/LanguageSelector.tsx';import TaxPositionPage from'${root}/app/finance/tax-position/page.tsx';createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale="th" pathname="/finance/tax-position"><header className="fixtureHeader"><strong>VP Office OS</strong><LanguageSelector/></header><main><TaxPositionPage/></main></UiLocaleProvider>);`);
async function main(){
 await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',context:root,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[root+'/node_modules'],alias:{'next/navigation':navigation,'next/link':link,[root+'/lib/supabase']:mock,[root+'/app/finance/quotations/shared']:guard}},module:{rules:[{test:/\.(tsx?|css)$/,use:loader}]},devtool:false},(e,s)=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));
 const css=['app/components/ui/vp-ui.module.css','app/components/DetailModal.module.css','app/finance/tax-position/tax-position.module.css','app/components/LanguageSelector.module.css','app/finance/finance-sub-nav.module.css','app/finance/tax-position/dashboard.module.css'].map(file=>{const prefix=path.basename(file).replaceAll('.','_')+'_';return fs.readFileSync(root+'/'+file,'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,key)=>'.'+prefix+key);}).join('\n');
 const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(out+'/bundle.js'));}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#fff}main{padding:0 20px}.fixtureHeader{display:flex;align-items:center;justify-content:space-between;padding:10px 24px;background:#203b51;color:white}button,input,select{font-family:inherit}${css}</style><div id="root"></div><script src="/bundle.js"></script></html>`);});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});let browser;
 try{
  const {chromium}=require('/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external.push(r.request().url());return r.abort();});
  require('./receipt-render-fixture.cjs');const {translate}=require('../../lib/i18n/catalog.ts');const base='http://127.0.0.1:'+server.address().port;
  const geometry=async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);for(const box of await page.locator('[data-metric]').evaluateAll(nodes=>nodes.map(n=>({fits:n.scrollWidth<=n.clientWidth+1,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right}))))assert.ok(box.fits&&box.left>=0&&box.right<=page.viewportSize().width,JSON.stringify(box));};
  for(const width of [1440,1024,768,390])for(const locale of ['th','en']){
   const t=k=>translate(locale,'taxDashboard.'+k);await page.setViewportSize({width,height:1000});await page.goto(base);await page.locator('button[lang='+locale+']').click();await page.getByLabel(t('month'),{exact:true}).selectOption('2026-09');
   await page.waitForFunction(()=>document.querySelector('[data-metric="received"]')?.textContent==='34,419.81 THB').catch(async e=>{console.error(await page.locator('body').innerText());console.error(await page.evaluate(()=>window.calls));console.error(errors);throw e;});
   for(const [key,value]of Object.entries({treasury:'49,560.00 THB',vat:'1,027.10 THB',wht:'560.19 THB',payables:'5,820.00 THB'}))assert.equal(await page.locator(`[data-metric="${key}"]`).textContent(),value);
   assert.equal(await page.locator('[data-metric]').count(),5);await geometry();
   const cards=await page.locator('[data-metric]').evaluateAll(nodes=>nodes.map(n=>n.parentElement.getBoundingClientRect().top));assert.equal(new Set(cards).size,width===1440?1:width===1024?2:width===768?3:5);
   const left=await page.locator('[aria-labelledby="tax-movements-title"]').boundingBox(),right=await page.locator('[aria-labelledby="tax-month-end-title"]').boundingBox();if(width===1440){assert.ok(right.x>left.x+left.width);assert.ok(left.width/right.width>1.5&&left.width/right.width<1.8);}else assert.ok(right.y>left.y);
   if(width===390){const heading=await page.locator('#money-position-title').boundingBox(),link=await page.getByRole('link',{name:t('openTreasury'),exact:true}).boundingBox();assert.ok(heading.width>250,'Money-position heading must not be squeezed by its action');assert.ok(link.y>heading.y+heading.height,'Mobile contextual action follows the heading');}
   assert.equal(await page.locator('pre:visible').count(),0);assert.equal(await page.getByRole('button',{name:translate(locale,'taxPosition.materialize'),exact:true}).count(),0);
   assert.equal(await page.getByRole('navigation').locator('a[aria-current="page"]').getAttribute('href'),'/finance/tax-position');
   await page.screenshot({path:out+`/dashboard-${locale}-${width}.png`,fullPage:true});
   const open=page.getByRole('button',{name:t('open')+' 20000000',exact:true});await open.focus();await page.keyboard.press('Enter');const modal=page.getByRole('dialog');await modal.waitFor();
   await modal.getByText('3%',{exact:true}).waitFor();await modal.getByText('10,000.00 THB',{exact:true}).waitFor();await page.keyboard.press('Tab');assert.equal(await modal.locator(':focus').count(),1);await geometry();
   await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});assert.equal(await open.evaluate(n=>n===document.activeElement),true);
   await page.getByRole('button',{name:t('previousMonth'),exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-metric="received"]')?.textContent==='0.00 THB');assert.equal(await page.locator('[data-metric="vat"]').textContent(),'0.00 THB');assert.equal(await page.locator('[data-metric="treasury"]').textContent(),'49,560.00 THB');
   await page.getByRole('button',{name:t('nextMonth'),exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-metric="received"]')?.textContent==='34,419.81 THB');
   assert.ok(await page.getByText(translate(locale,'taxPosition.unknown'),{exact:true}).count()>0);await page.getByText(t('payoutUnavailable'),{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>window.calls.some(c=>c.rpc&&!['get_finance_tax_position','get_finance_treasury','get_finance_payable_entitlements'].includes(c.rpc))),false);
  }
  for(const state of ['empty','readonly','fail']){
   await page.goto(base+'?'+state);await page.locator('button[lang="en"]').click();await page.getByLabel('Month',{exact:true}).selectOption('2026-09');await page.waitForFunction(()=>document.querySelector('[aria-busy="false"]'));
   if(state==='empty'){assert.equal(await page.locator('[data-metric="received"]').textContent(),'0.00 THB');assert.equal(await page.locator('[data-metric="treasury"]').textContent(),'Not available');}
   else {assert.equal(await page.locator('[data-metric="vat"]').textContent(),'Not available');await page.getByText(translate('en','taxDashboard.partialAccess'),{exact:true}).waitFor();}
   await geometry();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({pass:true,widths:[390,768,1024,1440],locales:['th','en'],keyboard:true,monthlyAndCurrentScopes:true,zeroUnknownRestricted:true,externalRequests:0,artifacts:out}));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);console.error('Artifacts:',out);process.exitCode=1;});
