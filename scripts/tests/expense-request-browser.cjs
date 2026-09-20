/* eslint-disable @typescript-eslint/no-require-imports */
// Real React handlers with in-memory lifecycle fixtures. Every external request is blocked.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {fixture,expense,tax,obligation,id}=require('./expense-foundation-fixture.cjs');
const root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vp-expense-operations-'));
const write=(name,text)=>{const p=path.join(out,name);fs.writeFileSync(p,text);return p;};
const f=fixture('list');f.data.access.is_admin=false;
const adapter=write('adapter.js',`
const f=${JSON.stringify(f)},seed=${JSON.stringify(expense(10))},tax=${JSON.stringify(tax)},obligation=${JSON.stringify(obligation(40,id(10)))};
const params=new URLSearchParams(location.search),scenario=params.get('scenario'),claim=location.pathname.includes('/claims'),creator=params.get('role')==='creator';let requests=[];window.calls=[];window.writes=[];
if(creator)f.data.access={...f.data.access,can_manage:false,can_tax_review:false,can_record:false,can_confirm:false,can_view_all:false,is_admin:false};
const makeItem=(i,input={})=>({...seed,id:'00000000-0056-4000-8000-00000000000'+i,origin:claim?'employee_claim':'company_purchase',created_by:f.data.access.user_id,request_id:'00000000-0056-4000-8000-000000000900',request_active:true,version:2,status:'draft',audit:[],submitted_at:null,review_reason:null,gross_amount:i===1?300:120,description:'Synthetic item '+i,personally_paid:claim,reimbursement_requested:claim?(i===1?300:120):0,...input});
if(scenario){const status=scenario==='draft'?'draft':scenario==='submitted'?'submitted':scenario==='rejected'?'rejected':'accepted',at='2026-09-19T04:00:00Z';requests=[{id:'00000000-0056-4000-8000-000000000900',kind:claim?'employee_claim':'company_expense_batch',status:scenario==='draft'?'draft':'submitted',version:2,note:'',created_at:'2026-09-18T01:00:00Z',submitted_at:scenario==='draft'?null:at,created_by:f.data.access.user_id,requester_name:'Synthetic staff',audit:[],items:[1,2].map(i=>makeItem(i,{status,submitted_at:scenario==='draft'?null:at,review_reason:status==='rejected'?'Synthetic rejection reason':null,tax_review:scenario==='waiting'||scenario==='paid'?tax:null,settlement:scenario==='waiting'||scenario==='paid'?{id:'settlement-'+i,mode:'supplier_unpaid',amount:300,payee_id:obligation.payee_id,reason:'Synthetic decision'}:null,obligation:scenario==='waiting'||scenario==='paid'?{...obligation,id:'obligation-'+i,settled:scenario==='paid',created_at:'2026-09-19T06:00:00Z'}:null,payout:scenario==='paid'?{id:'paid-'+i,status:'confirmed',gross:300,net:300,wht:0,paid_on:'2026-09-20'}:null,audit:[...(status==='accepted'||status==='rejected'?[{id:'review-'+i,event_type:status,created_at:'2026-09-19T05:00:00Z',actor_name:'Finance',evidence_json:null}]:[]),...(scenario==='paid'?[{id:'payment-'+i,event_type:'payment_confirmed',created_at:'2026-09-20T05:00:00Z',actor_name:'Finance',evidence_json:null}]:[])]}))}];}
export async function readExpenses(){return {...f.data,rows:[]};}export async function readExpenseLookups(){return f.lookups;}export async function readExpenseRequests(){return structuredClone(requests);}
export async function readExpenseRequest(id){if(window.failRead){window.failRead=false;throw Error('Local read failed');}const r=requests.find(r=>r.id===id);if(window.editDuringRead){window.editDuringRead=false;r.version++;r.note='Another tab edit';}return structuredClone(r);}
const operations=new Set();
export const supabase={async rpc(name,args){window.calls.push({name,args:structuredClone(args)});await new Promise(r=>setTimeout(r,80));
 if(window.failSave&&name==='save_finance_expense_request'){window.failSave=false;return{error:{message:'EXPENSE_PERMISSION_DENIED'}};}
 if(window.failSubmit&&name==='submit_finance_expense_request'){window.failSubmit=false;return{error:{message:'EXPENSE_PERMISSION_DENIED'}};}
 if(name==='save_finance_expense_request'){if(operations.has(args.p_operation))return{data:args.p_id};const old=requests.find(r=>r.id===args.p_id);if(old&&old.version!==args.p_version)throw Error('Stale fixture save');const row={id:args.p_id,kind:args.p_kind,note:args.p_note,status:'draft',version:(old?.version||0)+1,created_at:'2026-09-18T01:00:00Z',submitted_at:null,created_by:f.data.access.user_id,requester_name:'Synthetic staff',audit:[],items:args.p_items.map((i,n)=>makeItem(n+1,{...i.input,id:i.id,request_id:args.p_id,version:(i.version||0)+1}))};requests=[...requests.filter(r=>r.id!==row.id),row];operations.add(args.p_operation);window.writes.push(name);if(window.loseSaveResponse){window.loseSaveResponse=false;return{error:{message:'Network failed after commit'}};}return{data:row.id};}
 if(name==='submit_finance_expense_request'){const r=requests.find(r=>r.id===args.p_id);if(r.status==='submitted')return{data:r.id};if(r.version!==args.p_version)throw Error('Wrong saved version');r.status='submitted';r.submitted_at='2026-09-20T04:42:00Z';r.version++;r.items.forEach(i=>{i.status='submitted';i.submitted_at=r.submitted_at;i.version++;});window.writes.push(name);if(window.loseSubmitResponse){window.loseSubmitResponse=false;return{error:{message:'Network failed after submit'}};}return{data:r.id};}
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
  const fits=async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await page.getByRole('dialog').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);};
  let scenarios=0;
  // Direct-submit failure checkpoints, two items, both workflows and changed-label EN smoke.
  for(const width of [390,1440])for(const locale of width===1440?['th','en']:['th'])for(const claim of [false,true]){
   const t=k=>translate(locale,'expenses.'+k),route=claim?'/finance/expenses/claims':'/finance/expenses';await page.setViewportSize({width,height:950});await page.goto(`${url}${route}?locale=${locale}`);
   await page.getByRole('button',{name:t(claim?'newClaim':'new'),exact:true}).first().click();const dialog=page.getByRole('dialog');await dialog.waitFor();
   assert.equal(await dialog.locator('input[name=submitted_at]').count(),0);
   const submit=()=>dialog.getByRole('button',{name:t(claim?'submitRequest':'sendForReview'),exact:true}),save=()=>dialog.getByRole('button',{name:t('saveForLater'),exact:true});
   assert.ok(await submit().isDisabled());
   for(let i=0;i<2;i++){
    if(i)await dialog.getByRole('button',{name:t('addItem'),exact:true}).click();assert.equal(await dialog.locator('form').count(),1);
    await page.locator('#expense-expense_date').fill('2026-09-03');await page.locator('#expense-category').selectOption('ค่าเดินทาง');await page.locator('#expense-gross_amount').fill(String(i?120:300));await page.locator('#expense-description').fill('Synthetic item '+(i+1));await dialog.getByRole('button',{name:t('addThisItem'),exact:true}).click();
   }
   assert.equal(await dialog.locator('form').count(),0);assert.equal(await page.locator('[data-request-item]').count(),2);assert.ok((await dialog.innerText()).includes('420.00 THB'));
   assert.equal((await dialog.innerText()).includes(t('requestedTotal')),claim);
   await submit().focus();assert.ok(await submit().evaluate(e=>document.activeElement===e));await fits();await page.screenshot({path:out+`/create-${claim?'claim':'company'}-${locale}-${width}.png`,fullPage:true});
   const failure=locale==='en'?(claim?'loseSubmitResponse':'loseSaveResponse'):width===390?(claim?'failSubmit':'failSave'):'failRead';
   await page.evaluate(key=>{window[key]=true;},failure);await submit().dblclick();await dialog.getByRole('alert').waitFor();
   assert.equal(await page.locator('[data-request-item]').count(),2);await submit().click();await page.locator('[data-request-item]').first().waitFor({state:'hidden'});
   const calls=await page.evaluate(()=>window.calls),writes=await page.evaluate(()=>window.writes);
   assert.equal(writes.filter(n=>n==='save_finance_expense_request').length,1);assert.equal(writes.filter(n=>n==='submit_finance_expense_request').length,1);
   const saves=calls.filter(c=>c.name==='save_finance_expense_request');assert.ok(saves.every(c=>c.args.p_operation===saves[0].args.p_operation));assert.equal(await page.locator('[data-request-row]').count(),1);
   assert.ok((await dialog.innerText()).includes(t(claim?'requestSubmittedAt':'requestSentAt')));await fits();
   console.log('PASS direct submit',locale,width,claim?'Claim':'Company',failure);scenarios++;
   // Optional draft remains a separate, working choice.
   await page.goto(`${url}${route}?locale=${locale}&scenario=draft`);await page.getByRole('button',{name:t('view'),exact:true}).click();await dialog.getByRole('button',{name:t('editRequest'),exact:true}).click();await save().click();await dialog.getByRole('button',{name:t('editRequest'),exact:true}).waitFor();
   assert.deepEqual(await page.evaluate(()=>window.writes),['save_finance_expense_request']);
   if(width===1440&&locale==='en'&&!claim){
    await page.goto(`${url}${route}?locale=en&scenario=draft`);await page.getByRole('button',{name:t('view'),exact:true}).click();await dialog.getByRole('button',{name:t('editRequest'),exact:true}).click();await page.evaluate(()=>{window.editDuringRead=true;});await submit().click();await dialog.getByRole('alert').waitFor();assert.ok((await dialog.getByRole('alert').innerText()).includes(t('stale')));assert.deepEqual(await page.evaluate(()=>window.writes),['save_finance_expense_request']);assert.equal(await page.locator('[data-request-item]').count(),2);console.log('PASS unseen Draft revision blocks Submit');scenarios++;
   }
  }
  for(const width of [390,1440])for(const role of ['creator','reviewer'])for(const scenario of ['draft','submitted','accepted','rejected','waiting','paid']){
   const locale='th',t=k=>translate(locale,'expenses.'+k);await page.setViewportSize({width,height:950});await page.goto(`${url}/finance/expenses/claims?locale=th&scenario=${scenario}&role=${role}`);
   await page.getByRole('button',{name:t(role==='reviewer'&&scenario==='submitted'?'reviewRequest':'view'),exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();
   const content=await dialog.innerText();assert.ok(content.includes('Synthetic staff'));assert.ok(content.includes(t('draftCreatedAt')));assert.ok(content.includes(t('requestTimeline')));
   assert.equal(content.includes(t('requestSubmittedAt')),scenario!=='draft');
   if(scenario==='rejected'){assert.ok(content.includes(t('nextRejected')));assert.equal(await dialog.getByRole('button',{name:t('submitRequest'),exact:true}).count(),0);}
   if(role==='creator')assert.equal(await dialog.locator('form').count(),0);
   if(scenario==='paid')assert.ok(content.includes(t('nextPaid')));
   if(scenario==='waiting')assert.ok(content.includes(t('nextWaitingPayment')));
   await fits();await page.screenshot({path:out+`/${scenario}-${role}-${width}.png`,fullPage:true});
   if(role==='reviewer'&&scenario==='submitted'){
    assert.equal(await dialog.locator('#expense-review-reason').count(),1);await dialog.locator('#expense-review-reason').fill('Reviewed local fixture');await dialog.getByRole('button',{name:t('accept'),exact:true}).click();await dialog.locator('#tax-vat_state').waitFor();
    assert.deepEqual(await page.evaluate(()=>window.writes),['review_finance_expense']);assert.ok((await dialog.innerText()).includes(t('settlement')));
   }else assert.deepEqual(await page.evaluate(()=>window.writes),[]);
   console.log('PASS state',width,role,scenario);scenarios++;
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({pass:true,scenarios,artifacts:out,externalRequests:0}));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);console.error('Artifacts:',out);process.exitCode=1;});
