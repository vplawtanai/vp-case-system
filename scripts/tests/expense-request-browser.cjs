/* eslint-disable @typescript-eslint/no-require-imports */
// Real React/modal/handlers, isolated in-memory adapters; external network is blocked.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {fixture,expense}=require('./expense-foundation-fixture.cjs');
const root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vp-expense-request-'));
const write=(name,text)=>{const p=path.join(out,name);fs.writeFileSync(p,text);return p;};
const f=fixture('list');f.data.access.is_admin=false;
const adapter=write('adapter.js',`
const f=${JSON.stringify(f)},seed=${JSON.stringify(expense(1))};let requests=[];window.calls=[];window.writes=[];
export async function readExpenses(){return {...f.data,rows:[]};}export async function readExpenseLookups(){return f.lookups;}export async function readExpenseRequests(){return structuredClone(requests);}
export const supabase={async rpc(name,args){window.calls.push({name,args:structuredClone(args)});await new Promise(r=>setTimeout(r,120));if(window.failNext){window.failNext=false;return{error:{message:'EXPENSE_PERMISSION_DENIED'}};}
 if(name==='save_finance_expense_request'){let old=requests.find(r=>r.id===args.p_id);const row={id:args.p_id,kind:args.p_kind,note:args.p_note,status:'draft',version:(old?.version||0)+1,created_at:'2026-09-15T01:00:00Z',submitted_at:null,created_by:f.data.access.user_id,requester_name:'Synthetic staff',audit:[],items:args.p_items.map(i=>({...seed,...i.input,id:i.id,version:(i.version||0)+1,status:'draft',request_id:args.p_id,request_active:true,submitted_at:null,created_by:f.data.access.user_id}))};requests=[...requests.filter(r=>r.id!==row.id),row];window.writes.push(name);return{data:row.id};}
 if(name==='submit_finance_expense_request'){const r=requests.find(r=>r.id===args.p_id);r.status='submitted';r.submitted_at='2026-09-20T04:42:00Z';r.version++;r.items.forEach(i=>{i.status='submitted';i.submitted_at=r.submitted_at;i.version++;});window.writes.push(name);return{data:r.id};}
 if(name==='review_finance_expense'){const r=requests.find(r=>r.items.some(i=>i.id===args.p_id)),i=r.items.find(i=>i.id===args.p_id);i.status=args.p_accept?'accepted':'rejected';i.review_reason=args.p_reason;i.version++;window.writes.push(name);return{data:i.id};}
 throw Error('Forbidden local RPC '+name);}};
`);
const navigation=write('navigation.js',`export const useRouter=()=>({push(){throw Error('Unexpected navigation')}});export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);`);
const link=write('link.js',`import React from'react';export default function Link({children,...props}){return <a {...props}>{children}</a>;}`);
const loader=write('loader.cjs',`module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix=require('node:path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(prefix)+'+k})};'}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);
const entry=write('entry.tsx',`import React from'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider.tsx';import{ExpenseWorkspace}from'${root}/app/finance/expenses/workspace.tsx';createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale={new URLSearchParams(location.search).get('locale')} pathname="/finance/expenses"><main style={{maxWidth:1200,margin:'0 auto',padding:20}}><ExpenseWorkspace claims={location.pathname.includes('/claims')}/></main></UiLocaleProvider>);`);
async function main(){
 await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',context:root,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[root+'/node_modules'],alias:{'next/navigation':navigation,'next/link':link,[root+'/lib/supabase']:adapter,[root+'/app/finance/expenses/data']:adapter}},module:{rules:[{test:/\.(tsx?|css|js)$/,exclude:/node_modules/,use:loader}]},devtool:false},(e,s)=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));
 const css=['app/components/ui/vp-ui.module.css','app/components/DetailModal.module.css','app/finance/expenses/expenses.module.css'].map(file=>{const prefix=path.basename(file).replaceAll('.','_')+'_';return fs.readFileSync(root+'/'+file,'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,key)=>'.'+prefix+key).replace(/:global\(([^)]+)\)/g,'$1');}).join('\n');
 const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(out+'/bundle.js'));}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#182b45}button,input,select,textarea{font-family:inherit}${css}</style><div id="root"></div><script src="/bundle.js"></script></html>`);});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});let browser;
 try{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external.push(r.request().url());return r.abort();});
  require('./receipt-render-fixture.cjs');const {translate}=require('../../lib/i18n/catalog.ts'),url='http://127.0.0.1:'+server.address().port;
  // Narrow UX pass: full Thai at two widths; English changed-component smoke only.
  for(const width of [1440,390])for(const locale of width===1440?['th','en']:['th'])for(const claim of [false,true])for(const count of locale==='th'?[0,1,3]:[1]){
   const t=k=>translate(locale,'expenses.'+k),route=claim?'/finance/expenses/claims':'/finance/expenses';await page.setViewportSize({width,height:900});await page.goto(`${url}${route}?locale=${locale}`);
   const launcher=page.getByRole('button',{name:t(claim?'newClaim':'new'),exact:true}).first();await launcher.click();await page.getByRole('dialog').waitFor();
   const summary=page.getByRole('region',{name:t('requestSummary'),exact:true});
   assert.ok((await summary.innerText()).includes('0.00 THB'));assert.equal(await page.locator('legend').first().textContent(),translate(locale,'expenses.itemNumber',{count:1}));
   assert.ok(await page.getByRole('button',{name:t('saveRequest'),exact:true}).isDisabled());
   const fits=async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await page.getByRole('dialog').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);};
   await fits();
   if(!count){
    await page.screenshot({path:out+`/empty-${claim?'claim':'company'}-${locale}-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:t('cancelItem'),exact:true}).click();assert.equal(await page.locator('[role=dialog] form').count(),0);assert.equal(await page.evaluate(()=>window.calls.length),0);
    console.log('PASS',locale,width,claim?'Claim':'Company','empty request / zero totals / numbered editor / no writes');continue;
   }
   for(let i=0;i<count;i++){
    if(i)await page.getByRole('dialog').getByRole('button',{name:t('addItem'),exact:true}).click();assert.equal(await page.locator('[role=dialog] form').count(),1);
    await page.locator('#expense-expense_date').fill(['2026-09-03','2026-09-05','2026-09-08'][i]);await page.locator('#expense-category').selectOption('ค่าเดินทาง');await page.locator('#expense-gross_amount').fill(String([300,120,450][i]));await page.locator('#expense-description').fill('Synthetic item '+(i+1));
    if(claim)assert.equal(await page.locator('#expense-claimant_id').count(),0);
    await page.getByRole('button',{name:t('addThisItem'),exact:true}).click();assert.equal(await page.locator('[role=dialog] form').count(),0);assert.ok(await page.getByRole('dialog').getByRole('button',{name:t('addItem'),exact:true}).isEnabled());
   }
   assert.equal(await page.locator('[data-request-item]').count(),count);assert.equal(await page.evaluate(()=>window.calls.length),0,'Item entry is local, never independent saves');
   // Edit, duplicate and remove without losing other completed items.
   const total=count===1?300:870,formatted=n=>n.toLocaleString(locale,{minimumFractionDigits:2,maximumFractionDigits:2})+' THB';
   assert.ok((await summary.innerText()).includes(formatted(total)));
   await page.getByRole('button',{name:t('copyItem'),exact:true}).first().click();assert.equal(await page.locator('[data-request-item]').count(),count+1);assert.ok((await summary.innerText()).includes(formatted(total+300)));
   await page.getByRole('button',{name:t('removeItem'),exact:true}).last().click();assert.ok((await summary.innerText()).includes(formatted(total)));
   await page.getByRole('button',{name:t('editItem'),exact:true}).first().click();assert.equal(await page.locator('#expense-description').inputValue(),'Synthetic item 1');assert.equal(await page.locator('[role=dialog] form').count(),1);
   await page.locator('#expense-gross_amount').fill('301');await page.getByRole('button',{name:t('saveItemChanges'),exact:true}).click();assert.ok((await summary.innerText()).includes(formatted(total+1)));
   await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),2);await page.getByRole('button',{name:t('keepEditing'),exact:true}).click();
   const dialog=page.getByRole('dialog'),save=page.getByRole('button',{name:t('saveRequest'),exact:true});await save.focus();assert.ok(await save.evaluate(e=>document.activeElement===e));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
   await summary.scrollIntoViewIfNeeded();await page.screenshot({path:out+`/${claim?'claim':'company'}-${count}-${locale}-${width}.png`,fullPage:true});
   await page.evaluate(()=>{window.failNext=true;});await save.click();await dialog.getByRole('alert').waitFor();assert.equal(await page.locator('[data-request-item]').count(),count);
   await save.click();await page.getByRole('button',{name:t('submitRequest'),exact:true}).waitFor();
   const calls=await page.evaluate(()=>window.calls);assert.equal(calls.length,2);assert.equal(calls[0].args.p_operation,calls[1].args.p_operation);assert.equal(calls[1].args.p_items.length,count);
   assert.equal(await page.locator('main [data-request-row]').count(),1,'One envelope in review queue');
   await page.getByRole('button',{name:t('submitRequest'),exact:true}).click();await page.getByRole('button',{name:t('submitRequest'),exact:true}).waitFor({state:'hidden'});
   assert.ok((await page.getByRole('dialog').innerText()).includes(t('requestSubmittedAt')));assert.equal(await page.getByRole('dialog').locator('input').count(),0);
   await page.screenshot({path:out+`/review-${claim?'claim':'company'}-${count}-${locale}-${width}.png`,fullPage:true});
   await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
   assert.equal(await page.locator('main tbody tr').count(),1);const sort=page.locator(claim?'#claim-queue-order':'#expense-queue-order');await sort.selectOption('oldest');assert.equal(await page.locator('main tbody tr').count(),1);
   assert.ok((await page.evaluate(()=>window.writes)).every(n=>['save_finance_expense_request','submit_finance_expense_request'].includes(n)));
   console.log('PASS',locale,width,claim?'Claim':'Company',count,'items / local error-retry / one envelope / no financial RPC');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({pass:true,artifacts:out,externalRequests:0}));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);console.error('Artifacts:',out);process.exitCode=1;});
