/* eslint-disable @typescript-eslint/no-require-imports */
// Real React handlers with in-memory lifecycle fixtures. Every external request is blocked.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {fixture,expense,tax,obligation,id}=require('./expense-foundation-fixture.cjs');
const root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vp-expense-operations-'));
const companyOnly=process.argv.includes('--company');
const write=(name,text)=>{const p=path.join(out,name);fs.writeFileSync(p,text);return p;};
const f=fixture('list');f.data.access.is_admin=false;
const adapter=write('adapter.js',`
const f=${JSON.stringify(f)},seed=${JSON.stringify(expense(10))},tax=${JSON.stringify(tax)},obligation=${JSON.stringify(obligation(40,id(10)))};
const params=new URLSearchParams(location.search),scenario=params.get('scenario'),claim=location.pathname.includes('/claims'),creator=params.get('role')==='creator';let requests=[];window.calls=[];window.writes=[];
f.data.access.creator_payment_fact_supported=params.get('schema')!=='056';
f.data.access.company_declaration_without_account_supported=!['056','057'].includes(params.get('schema'));
f.data.access.company_tax_calculation_supported=params.has('tax059');
f.data.access.company_purchase_request_supported=params.has('purchase060');
if(params.has('purchase060'))f.data.access.company_tax_calculation_supported=true;
if(params.has('taxDenied'))f.data.access.can_tax_review=false;
if(creator)f.data.access={...f.data.access,can_manage:false,can_tax_review:false,can_record:false,can_confirm:false,can_view_all:false,is_admin:false};
f.data.access.can_create_company=f.data.access.can_manage||f.data.access.can_claim||f.data.access.can_record;
if(creator){f.data.accounts=[];f.lookups.payees=[];}
window.fixtureCash=[];
const makeItem=(i,input={})=>({...seed,id:'00000000-0056-4000-8000-00000000000'+i,origin:claim?'employee_claim':'company_purchase',created_by:f.data.access.user_id,request_id:'00000000-0056-4000-8000-000000000900',request_active:true,version:2,status:'draft',audit:[],submitted_at:null,review_reason:null,gross_amount:i===1?300:120,description:'Synthetic item '+i,personally_paid:claim,reimbursement_requested:claim?(i===1?300:120):0,...input});
if(scenario){const status=scenario==='draft'?'draft':scenario==='submitted'?'submitted':scenario==='rejected'?'rejected':'accepted',at='2026-09-19T04:00:00Z';requests=[{id:'00000000-0056-4000-8000-000000000900',kind:claim?'employee_claim':'company_expense_batch',status:scenario==='draft'?'draft':'submitted',version:2,note:'',created_at:'2026-09-18T01:00:00Z',submitted_at:scenario==='draft'?null:at,created_by:f.data.access.user_id,requester_name:'Synthetic staff',audit:[],items:[1,2].map(i=>makeItem(i,{status,submitted_at:scenario==='draft'?null:at,review_reason:status==='rejected'?'Synthetic rejection reason':null,tax_review:scenario==='waiting'||scenario==='paid'?tax:null,settlement:scenario==='waiting'||scenario==='paid'?{id:'settlement-'+i,mode:'supplier_unpaid',amount:300,payee_id:obligation.payee_id,reason:'Synthetic decision'}:null,obligation:scenario==='waiting'||scenario==='paid'?{...obligation,id:'obligation-'+i,settled:scenario==='paid',created_at:'2026-09-19T06:00:00Z'}:null,payout:scenario==='paid'?{id:'paid-'+i,status:'confirmed',gross:300,net:300,wht:0,paid_on:'2026-09-20'}:null,audit:[...(status==='accepted'||status==='rejected'?[{id:'review-'+i,event_type:status,created_at:'2026-09-19T05:00:00Z',actor_name:'Finance',evidence_json:null}]:[]),...(scenario==='paid'?[{id:'payment-'+i,event_type:'payment_confirmed',created_at:'2026-09-20T05:00:00Z',actor_name:'Finance',evidence_json:null}]:[])]}))}];}
if(!claim&&scenario){
 const r=requests[0];
 r.items.forEach(i=>{i.creator_payment_fact='unpaid';});
 if(['no-tax','partial','reimbursement','exception','company-paid','unknown','missing-supplier','missing-payer','wht'].includes(scenario))r.items.forEach(i=>{i.status='submitted';i.vat_awareness=scenario==='exception'?'yes':'no';i.wht_awareness=scenario==='wht'?'yes':'no';i.tax_review=null;i.settlement=null;i.obligation=null;i.audit=[];i.creator_payment_fact=scenario==='company-paid'?'company_paid':scenario==='unknown'?'unknown':'unpaid';});
 if(scenario==='partial'){r.items[0].status='accepted';r.items[0].tax_review=tax;r.items[0].settlement={id:'settlement-1',mode:'supplier_unpaid',amount:300,payee_id:seed.supplier_payee_id,reason:'Reviewed'};r.items[0].obligation={...obligation,gross_amount:300};}
 if(['reimbursement','missing-payer'].includes(scenario))r.items.forEach(i=>{i.creator_payment_fact='personal_paid';i.personally_paid=true;i.claimant_id=f.data.access.user_id;i.claimant_name='Synthetic personal payer';i.reimbursement_requested=i.gross_amount;});
 if(scenario==='missing-supplier'){r.items.forEach(i=>{i.supplier_payee_id=null;});f.lookups.payees=f.lookups.payees.filter(p=>p.profile_id);}
 if(scenario==='missing-payer')f.lookups.payees=f.lookups.payees.filter(p=>!p.profile_id);
 requests.push({...structuredClone(r),id:'00000000-0056-4000-8000-000000000999',kind:'employee_claim',requester_name:'CLAIM MUST NOT LEAK'});
}
window.fixtureRequests=requests;
if(params.has('purchase060')&&!params.has('historical'))requests.filter(r=>r.kind==='company_expense_batch').forEach(r=>r.items.forEach(i=>{i.creator_tax={vat_mode:'inclusive',vat_rate:7,wht_state:'withhold',wht_rate:3};}));
if(params.has('ux')){
 f.data.access.is_admin=params.get('admin')==='1';
 const a=f.data.accounts[0];a.name='KBANK';f.data.accounts.push({...a,id:'ktb',name:'KTB',bank_account_id:'ktb',opening_as_of:null},{...a,id:'handoff',name:'Prepare-only',bank_account_id:'handoff',can_confirm:false},{...a,id:'denied',name:'Read-only account',bank_account_id:'denied',can_record:false});
 requests.forEach(r=>r.items.forEach(i=>{i.audit=[{id:'audit-1',event_type:'submitted',actor_name:'Staff',created_at:'2026-09-19T04:00:00Z',evidence_json:{technical_marker:'retained'}},{id:'audit-2',event_type:'accepted',actor_name:'Finance',created_at:'2026-09-19T05:00:00Z',evidence_json:{technical_marker:'also retained'}}];}));
}
export function uxFixture(){
 const row=requests[0]?.items[0]||seed,queued={...obligation,id:'queue-1',expense_id:row.id,reference:'EXP-TEST',due_on:null};
 row.obligation=queued;row.tax_review=params.has('missingTax')?null:tax;
 window.detailRecord=row;
 return {obligations:[queued],isAdmin:f.data.access.is_admin,treasury:{can_manage:false,accounts:[],openings:[],pending_sources:[],has_next:false,transactions:[{id:'cash-fixture',source_payout_id:'payout-fixture',bank_account_id:null,cash_location_id:null,occurred_at:'2026-09-20T00:00:00Z',cash_amount:300,currency:'THB',direction:'outflow',transaction_type:'expense_payout',status:'confirmed',reference_no:'PV-TEST',description:'Expense payout',source_snapshot_json:null}]}};
}

if(params.has('supplier')){
 const mode=params.get('supplier');requests[0].items.forEach(i=>{i.supplier_payee_id=null;i.vendor_name='Synthetic Supplier';});
 if(mode==='existing')f.lookups.payees.push({id:'00000000-0055-4000-8000-000000000004',profile_id:null,legal_name:'Synthetic Supplier',tax_id:'1234567890123',entity_type:'juristic_person'});
}
export async function readExpenses(id){if(id){window.calls.push({name:'get_finance_expenses',args:{p_id:id}});if(params.has('failedRead'))throw Error('Synthetic denied read');return {...f.data,record:window.detailRecord,rows:[]};}return {...f.data,rows:[]};}export async function readExpenseLookups(){return f.lookups;}export async function readExpenseRequests(){return structuredClone(requests);}
export async function readExpenseRequest(id){if(window.failRead){window.failRead=false;throw Error('Local read failed');}const r=requests.find(r=>r.id===id);if(window.editDuringRead){window.editDuringRead=false;r.version++;r.note='Another tab edit';}const result=structuredClone(r);result.items.forEach(i=>{i.claimant_id=i.claimant_id||null;});if(window.omitDeclaration)delete result.items[0].creator_payment_fact;return result;}
const operations=new Set();
export const supabase={from(table){
 if(table!=='finance_payouts')throw Error('Forbidden fixture read '+table);
 const query={select(columns){window.calls.push({name:'select_payout_evidence',columns});return query;},in(){return query;},eq(){return query;},then(resolve){return Promise.resolve({data:params.has('missingEvidence')?[]:[{id:'payout-fixture',status:'confirmed',source_model:'expense_v1',confirmed_snapshot_json:{schema_version:2,source_model:'expense_v1',choices:[{expense_id:'expense-fixture',expense:{id:'expense-fixture',origin:'company_purchase',description:'UAT PAID'}}]}}]}).then(resolve);}};return query;
},async rpc(name,args){window.calls.push({name,args:structuredClone(args)});await new Promise(r=>setTimeout(r,80));
 if(name==='preview_finance_company_expense_tax'){
  if(window.failPreview){window.failPreview=false;return{error:{message:'Synthetic preview unavailable'}};}
  const i=requests.flatMap(r=>r.items).find(i=>i.id===args.p_expense),v=args.p_input;
  const values=v.vat_mode==='exclusive'?[300,21,321]:v.vat_mode==='inclusive'?[280.37,19.63,300]:v.vat_mode==='none'?[i.gross_amount,0,i.gross_amount]:[null,null,null];
  const missing=[];if(!v.vat_mode)missing.push('companyNeedVat');if(!v.wht_state)missing.push('companyNeedWht');
  if(v.vat_mode!=='none'&&v.eligibility==='eligible'&&(!v.supplier_tax_id||!v.tax_document_reference||!v.tax_document_date||v.company_name_status!=='yes'))missing.push('companyNeedVatEvidence');
  if((i.tax_review||(i.creator_payment_fact==='company_paid'&&v.wht_state==='withhold'))&&!v.reason.trim())missing.push('companyNeedReason');
  if(i.creator_payment_fact==='company_paid'&&v.wht_state==='withhold'&&!v.paid_withholding_ack)missing.push('companyPaidWhtAck');
  const wht=v.wht_state==='withhold'?v.vat_mode==='inclusive'?8.41:9:v.wht_state==='none'?0:null;
  return{data:{schema_version:2,declared_amount:i.gross_amount,vat_base:values[0],vat_rate:v.vat_mode==='none'?0:v.vat_rate,vat_amount:values[1],gross:values[2],wht_base:v.wht_state==='withhold'?values[0]:0,wht_rate:v.wht_state==='withhold'?v.wht_rate:0,wht_amount:wht,net:values[2]===null||wht===null?null:values[2]-wht,ready:missing.length===0,missing}};
 }
 if(name==='get_finance_expense_parties')return{data:structuredClone(f.lookups)};
 if(name==='review_finance_company_purchase_request'){
  if(operations.has(args.p_operation))return{data:args.p_expense};
  const i=requests.flatMap(r=>r.items).find(i=>i.id===args.p_expense);
  if(!i||i.status!=='submitted'||i.version!==args.p_version)throw Error('Stale review fixture');
  if(!args.p_accept&&!args.p_reason.trim())return{error:{message:'EXPENSE_REASON_REQUIRED'}};
  if(args.p_accept&&!args.p_input.recipient_name?.trim())return{error:{message:'EXPENSE_REQUEST_PAYEE_REQUIRED'}};
  const c=args.p_accept?(await supabase.rpc('preview_finance_company_expense_tax',{p_expense:i.id,p_input:{...args.p_input,schema_version:2,eligibility:'pending',reason:args.p_reason}})).data:null;
  if(args.p_accept&&!c.ready)throw Error('Invalid synthetic review');
  i.status=args.p_accept?'accepted':'rejected';i.review_reason=args.p_reason;i.version++;
  if(args.p_accept){i.reviewed_recipient_name=args.p_input.recipient_name;i.declared_gross_amount=i.gross_amount;i.gross_amount=c.gross;i.tax_review={...tax,vat_state:args.p_input.vat_mode==='none'?'none':'exists',eligibility:'pending',wht_state:args.p_input.wht_state,request_json:{schema_version:2,raw_input:args.p_input,calculation:c}};i.settlement={id:args.p_operation,mode:'supplier_unpaid',payee_id:i.supplier_payee_id,amount:c.gross,reason:args.p_reason};i.obligation={...obligation,id:args.p_operation,payee_id:i.supplier_payee_id,gross_amount:c.gross};}
  operations.add(args.p_operation);window.writes.push(name);
  if(window.loseReviewResponse){window.loseReviewResponse=false;return{error:{message:'Network lost after review'}};}return{data:i.id};
 }
 if(name==='get_finance_payees'){if(window.denyLookup){window.denyLookup=false;return{error:{message:'PAYOUT_PERMISSION_DENIED'}};}return{data:structuredClone(window.supplierRegister||f.lookups.payees.map(p=>({...p,kind:p.profile_id?'internal':'external',entity_type:p.entity_type||'natural_person',tax_id:p.tax_id||null,is_active:true,version:1,destination:null})))};}
 if(name==='save_finance_payee'){if(window.denyPayee){window.denyPayee=false;return{error:{message:'PAYOUT_PERMISSION_DENIED'}};}if(f.lookups.payees.some(p=>p.id===args.p_id))throw Error('Duplicate fixture payee');f.lookups.payees.push({id:args.p_id,profile_id:args.p_profile_id,legal_name:args.p_profile_id?'Synthetic personal payer':args.p_input.legal_name});window.writes.push(name);return{data:args.p_id};}
 if(window.failSave&&name==='save_finance_expense_request'){window.failSave=false;return{error:{message:'EXPENSE_PERMISSION_DENIED'}};}
 if(window.failSubmit&&name==='submit_finance_expense_request'){window.failSubmit=false;return{error:{message:'EXPENSE_PERMISSION_DENIED'}};}
 if(name==='save_finance_expense_request'){if(operations.has(args.p_operation))return{data:args.p_id};const old=requests.find(r=>r.id===args.p_id);if(old&&old.version!==args.p_version)throw Error('Stale fixture save');const row={id:args.p_id,kind:args.p_kind,note:args.p_note,status:'draft',version:(old?.version||0)+1,created_at:'2026-09-18T01:00:00Z',submitted_at:null,created_by:f.data.access.user_id,requester_name:'Synthetic staff',audit:[],items:args.p_items.map((i,n)=>makeItem(n+1,{...i.input,id:i.id,request_id:args.p_id,version:(i.version||0)+1}))};requests=[...requests.filter(r=>r.id!==row.id),row];operations.add(args.p_operation);window.writes.push(name);if(window.loseSaveResponse){window.loseSaveResponse=false;return{error:{message:'Network failed after commit'}};}return{data:row.id};}
 if(name==='submit_finance_expense_request'){const r=requests.find(r=>r.id===args.p_id);if(r.status==='submitted')return{data:r.id};if(r.version!==args.p_version)throw Error('Wrong saved version');r.status='submitted';r.submitted_at='2026-09-20T04:42:00Z';r.version++;r.items.forEach(i=>{i.status='submitted';i.submitted_at=r.submitted_at;i.version++;});window.writes.push(name);if(window.loseSubmitResponse){window.loseSubmitResponse=false;return{error:{message:'Network failed after submit'}};}return{data:r.id};}
 if(name==='review_finance_expense'){const r=requests.find(r=>r.items.some(i=>i.id===args.p_id)),i=r.items.find(i=>i.id===args.p_id);if(i.status!=='submitted'||i.version!==args.p_version)throw Error('Approval fixture guard');i.status=args.p_accept?'accepted':'rejected';i.review_reason=args.p_reason;i.version++;window.writes.push(name);return{data:i.id};}
 if(name==='review_finance_expense_tax'){
  const r=requests.find(r=>r.kind==='company_expense_batch'&&r.items.some(i=>i.id===args.p_expense)),i=r.items.find(i=>i.id===args.p_expense);
  if(window.failTax){window.failTax=false;return{error:{message:'EXPENSE_PERMISSION_DENIED'}};}
  if(i.tax_review?.id===args.p_id)return{data:args.p_id};if(i.status!=='accepted'||(i.tax_review?.id||null)!==args.p_previous)throw Error('Tax fixture guard');
  i.tax_review={...tax,...args.p_input,id:args.p_id,vat_amount:null,wht_amount:null,wht_exception:false};
  if(args.p_input.schema_version===2){i.tax_review={...i.tax_review,vat_state:args.p_input.vat_mode==='none'?'none':'exists',eligibility:args.p_input.vat_mode==='none'?'ineligible':args.p_input.eligibility,request_json:{schema_version:2,raw_input:args.p_input}};}
  window.writes.push(name);
  if(window.loseTaxResponse){window.loseTaxResponse=false;return{error:{message:'Network lost'}};}return{data:args.p_id};
 }
 if(name==='decide_finance_expense_settlement'){
  const r=requests.find(r=>r.kind==='company_expense_batch'&&r.items.some(i=>i.id===args.p_expense)),i=r.items.find(i=>i.id===args.p_expense);
  if(i.settlement?.id===args.p_id)return{data:args.p_id};if(i.status!=='accepted'||i.settlement)throw Error('Settlement fixture guard');i.settlement={id:args.p_id,mode:args.p_mode,payee_id:args.p_payee,amount:args.p_amount,reason:args.p_reason};
  if(['supplier_unpaid','reimburse'].includes(args.p_mode))i.obligation={...obligation,id:args.p_id,gross_amount:args.p_amount,payee_id:args.p_payee};window.writes.push(name);if(window.loseSettlementResponse){window.loseSettlementResponse=false;return{error:{message:'Network lost'}};}return{data:args.p_id};
 }
 if(name==='prepare_finance_expense_payout'){
  const i=requests.flatMap(r=>r.items).find(i=>i.id===args.p_expense),account=f.data.accounts.find(a=>a.id===(args.p_bank||args.p_cash));
  if(!account?.can_record||!i?.settlement||i.settlement.mode!=='company_bank'||i.obligation)throw Error('Local payment guard');
  i.payout={id:args.p_id,status:'draft',version:1,paid_on:args.p_paid_on,bank_account_id:args.p_bank,cash_location_id:args.p_cash,gross:i.gross_amount,wht:0,net:i.gross_amount,payee_id:null,payee_version:null,destination:null,can_confirm:account.can_confirm,can_cancel:true};window.writes.push(name);return{data:args.p_id};
 }
 if(name==='confirm_finance_payout'){
  const i=requests.flatMap(r=>r.items).find(i=>i.payout?.id===args.p_id);if(!i?.payout?.can_confirm||!args.p_acknowledged)throw Error('Local confirmation guard');
  if(i.payout.status==='confirmed')return{data:args.p_id};i.payout.status='confirmed';i.payout.version++;window.fixtureCash.push({payout:args.p_id,amount:i.payout.net});window.writes.push(name);return{data:args.p_id};
 }
 throw Error('Forbidden local RPC '+name);}};
`);
const navigation=write('navigation.js',`export const useRouter=()=>({push(){throw Error('Unexpected navigation')}});export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);`);
const link=write('link.js',`import React from'react';export default function Link({children,...props}){return <a {...props}>{children}</a>;}`);
const loader=write('loader.cjs',`module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix=require('node:path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(prefix)+'+k})};'}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);
const entry=write('entry.tsx',`import React from'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider.tsx';import{ExpenseWorkspace}from'${root}/app/finance/expenses/workspace.tsx';import{ExpenseObligationQueue}from'${root}/app/finance/payables/multi-source.tsx';import{TreasuryDashboard}from'${root}/app/finance/treasury/dashboard-view.tsx';import{uxFixture}from'${adapter}';const path=location.pathname,f=path.includes('payables')||path.includes('treasury')?uxFixture():null,block=()=>{throw Error('Read-only fixture');};createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale={new URLSearchParams(location.search).get('locale')} pathname="/finance/expenses"><main style={{maxWidth:1200,margin:'0 auto',padding:20}}>{path.includes('payables')?<ExpenseObligationQueue rows={f.obligations} isAdmin={f.isAdmin}/>:path.includes('treasury')?<TreasuryDashboard data={f.treasury} offset={0} loading={false} busy={false} onPage={block} onOpening={block} onMaterialize={block}/>:<ExpenseWorkspace claims={path.includes('/claims')}/>}</main></UiLocaleProvider>);`);
async function main(){
 await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',context:root,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[root+'/node_modules'],alias:{'next/navigation':navigation,'next/link':link,[root+'/lib/supabase']:adapter,[root+'/app/finance/expenses/data']:adapter}},module:{rules:[{test:/\.(tsx?|css|js)$/,exclude:/node_modules/,use:loader}]},devtool:false},(e,s)=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));
 const css=['app/components/ui/vp-ui.module.css','app/components/DetailModal.module.css','app/finance/expenses/expenses.module.css','app/finance/expenses/purchase-request.module.css','app/finance/expenses/company.module.css','app/finance/expenses/company-money.module.css','app/finance/payouts/payout.module.css','app/finance/payables/payables.module.css','app/finance/treasury/treasury.module.css'].map(file=>{const prefix=path.basename(file).replaceAll('.','_')+'_';return fs.readFileSync(root+'/'+file,'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,key)=>'.'+prefix+key).replace(/:global\(([^)]+)\)/g,'$1');}).join('\n');
 const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(out+'/bundle.js'));}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#182b45}button,input,select,textarea{font-family:inherit}${css}</style><div id="root"></div><script src="/bundle.js"></script></html>`);});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});let browser;
 try{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external.push(r.request().url());return r.abort();});
  require('./receipt-render-fixture.cjs');const {translate}=require('../../lib/i18n/catalog.ts'),url='http://127.0.0.1:'+server.address().port;
  if(process.argv.includes('--purchase060')){
   const scenarios=await require('./purchase-request-browser.cjs')({page,url,out,translate});
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({pass:true,scenarios,artifacts:out,externalRequests:0}));return;
  }
  if(process.argv.includes('--tax059')){
   const scenarios=await require('./company-tax-review-browser.cjs')({page,url,out,translate});
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({pass:true,scenarios,artifacts:out,externalRequests:0}));return;
  }
  if(process.argv.includes('--ux')){
   const scenarios=await require('./finance-expense-ux-browser.cjs')({page,url,out,translate,id});
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({pass:true,scenarios,artifacts:out,externalRequests:0}));return;
  }
  if(process.argv.includes('--two-flow')){
   const scenarios=await require('./expense-two-flow-browser.cjs')({page,url,out,translate,id});
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({pass:true,scenarios,artifacts:out,externalRequests:0}));return;
  }
  if(process.argv.includes('--supplier')){
   const scenarios=await require('./expense-supplier-browser.cjs')({page,url,out,translate,id});
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({pass:true,scenarios,artifacts:out,externalRequests:0}));return;
  }
  const fits=async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await page.getByRole('dialog').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);const b=await page.getByRole('dialog').boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=page.viewportSize().width+1&&b.y+b.height<=page.viewportSize().height+1);};
  let scenarios=0;
  // Direct-submit failure checkpoints, two items, both workflows and changed-label EN smoke.
  for(const width of [390,1440])for(const locale of width===1440?['th','en']:['th'])for(const claim of companyOnly?[false]:[false,true]){
   const t=k=>translate(locale,'expenses.'+k),route=claim?'/finance/expenses/claims':'/finance/expenses';await page.setViewportSize({width,height:950});await page.goto(`${url}${route}?locale=${locale}`);
   await page.getByRole('button',{name:t(claim?'newClaim':'new'),exact:true}).first().click();const dialog=page.getByRole('dialog');await dialog.waitFor();
   assert.equal(await dialog.locator('input[name=submitted_at]').count(),0);
   const submit=()=>dialog.getByRole('button',{name:t(claim?'submitRequest':'sendForReview'),exact:true}),save=()=>dialog.getByRole('button',{name:t('saveForLater'),exact:true});
   assert.ok(await submit().isDisabled());
   await fits();await page.screenshot({path:out+`/create-empty-${claim?'claim':'company'}-${locale}-${width}.png`});
   for(let i=0;i<2;i++){
    if(i)await dialog.getByRole('button',{name:t('addItem'),exact:true}).click();assert.equal(await dialog.locator('form').count(),1);
    await page.locator('#expense-expense_date').fill('2026-09-03');await page.locator('#expense-category').selectOption(claim?'ค่าเดินทาง':'company.travel');await page.locator('#expense-gross_amount').fill(String(i?120:300));await page.locator('#expense-description').fill('Synthetic item '+(i+1));if(!claim)await dialog.locator('input[type=radio][value=unpaid]').check();await dialog.getByRole('button',{name:t('addThisItem'),exact:true}).click();
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
  if(!companyOnly)for(const width of [390,1440])for(const role of ['creator','reviewer'])for(const scenario of ['draft','submitted','accepted','rejected','waiting','paid']){
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
  for(const width of [390,1440])for(const scenario of ['draft','submitted','partial','waiting','paid','rejected','no-tax','exception','reimbursement']){
   const t=k=>translate('th','expenses.'+k);await page.setViewportSize({width,height:950});await page.goto(`${url}/finance/expenses?locale=th&scenario=${scenario}`);
   await page.locator('[data-request-row]').waitFor();assert.equal(await page.locator('[data-request-row]').count(),1);assert.ok(!(await page.locator('body').innerText()).includes('CLAIM MUST NOT LEAK'));assert.equal(await page.locator('#expense-origin-filter').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:out+`/company-list-${scenario}-${width}.png`,fullPage:true});
   await page.locator('[data-request-row] button').click();const dialog=page.getByRole('dialog');await dialog.waitFor();await fits();
   assert.ok(!(await dialog.innerText()).includes(t('draftCreatedAt'))||scenario==='draft');assert.equal(await dialog.getByRole('button',{name:t('confirmPayment'),exact:true}).count(),0);
   const active=dialog.locator('[id^="company-item-"]');assert.ok(await active.count()<=1);
   if(scenario==='partial'){assert.ok((await dialog.innerText()).includes('1 / 2'));assert.ok((await active.getAttribute('id')).endsWith('002'));}
   if(scenario==='waiting'){assert.ok((await dialog.innerText()).includes('2 / 2'));assert.equal(await active.count(),0);}
   if(scenario==='paid'){await dialog.locator('[aria-controls^="company-item-"]').first().click();assert.ok((await active.innerText()).includes(t('paid')));}
   if(scenario==='reimbursement')assert.ok((await dialog.innerText()).includes(t('staffRequestedTotal')));
   else assert.ok(!(await dialog.innerText()).includes(t('staffRequestedTotal')));
   await page.screenshot({path:out+`/company-review-${scenario}-${width}.png`});
   if(scenario==='no-tax'){
    assert.ok((await dialog.innerText()).includes('0 / 2'));await dialog.getByLabel(t('companyNoTaxAck')).check();await dialog.locator('#company-review-reason').fill('Explicit local no-tax review');
    assert.equal(await dialog.locator('#expense-settlement-mode').count(),0);
    assert.equal(await dialog.locator('#settlement-payee').getAttribute('readonly'),'');assert.equal(await dialog.getByRole('link',{name:t('managePayee'),exact:true}).count(),0);
    await dialog.getByRole('button',{name:t('companyApprove'),exact:true}).focus();assert.ok(await dialog.getByRole('button',{name:t('companyApprove'),exact:true}).evaluate(e=>document.activeElement===e));await page.screenshot({path:out+`/company-review-actions-${width}.png`,fullPage:true});
    await page.evaluate(key=>{window[key]=true;},width===390?'failTax':'loseTaxResponse');await dialog.getByRole('button',{name:t('companyApprove'),exact:true}).click();await dialog.getByRole('button',{name:t('companyRetryReview'),exact:true}).waitFor();
    assert.ok((await dialog.innerText()).includes(t('companyReviewPartial')));assert.ok((await dialog.innerText()).includes('0 / 2'));await dialog.getByRole('button',{name:t('companyRetryReview'),exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[id^="company-item-"]')?.id.endsWith('002'));assert.ok((await dialog.innerText()).includes('1 / 2'));assert.equal(await active.count(),1);assert.ok(await active.evaluate(e=>document.activeElement===e));
    await dialog.locator('#company-review-reason').fill('Local rejection');await dialog.getByRole('button',{name:t('companyReject'),exact:true}).click();await active.waitFor({state:'hidden'});assert.ok((await dialog.innerText()).includes('2 / 2'));
    const calls=await page.evaluate(()=>window.calls),writes=await page.evaluate(()=>window.writes),taxCalls=calls.filter(c=>c.name==='review_finance_expense_tax');assert.equal(taxCalls.length,2);assert.deepEqual(taxCalls[0].args,taxCalls[1].args);
    assert.deepEqual(writes,['review_finance_expense','review_finance_expense_tax','decide_finance_expense_settlement','review_finance_expense']);
    await fits();await page.screenshot({path:out+`/company-complete-${width}.png`,fullPage:true});
   }else if(scenario==='exception'){
    await dialog.locator('#tax-vat_state').selectOption('exists');await dialog.locator('#tax-vat_base').fill('280.37');await dialog.locator('#tax-vat_rate').fill('7');await dialog.locator('#tax-eligibility').selectOption('ineligible');await dialog.locator('#tax-wht_state').selectOption('none');assert.equal(await dialog.locator('#expense-settlement-mode').count(),0);await dialog.locator('#company-review-reason').fill('Local VAT ineligible review');
    await fits();await page.screenshot({path:out+`/company-vat-controls-${width}.png`,fullPage:true});await dialog.getByRole('button',{name:t('companyApprove'),exact:true}).click();await page.waitForFunction(()=>document.querySelector('[id^="company-item-"]')?.id.endsWith('002'));
    const calls=await page.evaluate(()=>window.calls);assert.deepEqual(calls.map(c=>c.name),['review_finance_expense','review_finance_expense_tax','decide_finance_expense_settlement']);assert.equal(calls[1].args.p_input.eligibility,'ineligible');assert.equal(calls[1].args.p_input.vat_base,280.37);
   }else if(scenario==='reimbursement'){
    await dialog.getByLabel(t('companyNoTaxAck')).check();await dialog.locator('#expense-settlement-mode').selectOption('reimburse');await dialog.locator('#settlement-amount').fill('200');await dialog.locator('#company-review-reason').fill('Local partial reimbursement');
    await page.evaluate(()=>{window.loseSettlementResponse=true;});await dialog.getByRole('button',{name:t('companyApprove'),exact:true}).click();await dialog.getByRole('button',{name:t('companyRetryReview'),exact:true}).waitFor();await dialog.getByRole('button',{name:t('companyRetryReview'),exact:true}).click();await page.waitForFunction(()=>document.querySelector('[id^="company-item-"]')?.id.endsWith('002'));
    const calls=await page.evaluate(()=>window.calls),settlements=calls.filter(c=>c.name==='decide_finance_expense_settlement');assert.equal(settlements.length,2);assert.deepEqual(settlements[0].args,settlements[1].args);assert.equal(settlements[0].args.p_amount,200);assert.equal(calls.filter(c=>c.name==='review_finance_expense').length,1);
   }else assert.deepEqual(await page.evaluate(()=>window.writes),[]);
   console.log('PASS Company state',width,scenario);scenarios++;
  }
  await page.setViewportSize({width:1440,height:950});await page.goto(`${url}/finance/expenses?locale=en&scenario=no-tax`);await page.locator('[data-request-row] button').click();
  for(const label of ['Review supplier and due date','Approve item','Reject item','I have verified that this item has no VAT and no withholding tax.'])assert.ok((await page.getByRole('dialog').innerText()).includes(label),label);
  await fits();assert.deepEqual(await page.evaluate(()=>window.writes),[]);scenarios++;console.log('PASS Company EN review smoke');
  for(const width of [390,1440])for(const scenario of ['company-paid','unknown','missing-supplier','missing-payer','wht']){
   const t=k=>translate('th','expenses.'+k);await page.setViewportSize({width,height:950});await page.goto(`${url}/finance/expenses?locale=th&scenario=${scenario}`);await page.locator('[data-request-row] button').click();const dialog=page.getByRole('dialog');await dialog.waitFor();
   const approve=()=>dialog.getByRole('button',{name:t('companyApprove'),exact:true});assert.ok(await approve().isDisabled());
   await dialog.locator('#company-review-reason').fill('Explicit local money decision');
   if(scenario!=='wht')await dialog.getByLabel(t('companyNoTaxAck')).check();
   if(scenario==='company-paid'){
    assert.equal(await dialog.locator('#expense-settlement-mode option[value=supplier_unpaid]').count(),0);await dialog.locator('#expense-settlement-mode').selectOption('company_bank');assert.equal(await dialog.locator('#settlement-payee').count(),0);
   }else if(scenario==='unknown'){
    assert.equal(await dialog.locator('#expense-settlement-mode').inputValue(),'undecided');assert.ok(await approve().isDisabled());await dialog.locator('#expense-settlement-mode').selectOption('supplier_unpaid');
   }else if(scenario==='wht'){
    assert.ok(await approve().isDisabled());await dialog.locator('#tax-wht_state').selectOption('withhold');await dialog.locator('#tax-wht_base').fill('300');await dialog.locator('#tax-wht_rate').fill('3');
   }else{
    assert.ok(await approve().isDisabled());assert.equal(await dialog.locator('#settlement-payee option').count(),1,'No unrelated employee/supplier candidate');
    await dialog.getByRole('button',{name:t(scenario==='missing-payer'?'companySetUpPayer':'companyAddSupplier'),exact:true}).click();const setup=page.getByRole('dialog').last();await setup.locator('#payee-name').waitFor();
    if(scenario==='missing-supplier')await setup.locator('#payee-name').fill('Synthetic external supplier');else assert.ok(await setup.locator('#payee-name').isDisabled());
    await page.evaluate(()=>{window.denyPayee=true;});await setup.getByRole('button',{name:translate('th','common.actions.save'),exact:true}).click();await setup.getByRole('alert').waitFor();assert.deepEqual(await page.evaluate(()=>window.writes),[]);
    await setup.getByRole('button',{name:translate('th','common.actions.save'),exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[role=dialog]').length===1);await page.waitForFunction(()=>!document.querySelector('button[type=submit].vp-ui_module_css_primary')?.disabled);
   }
   await fits();assert.ok(await approve().isEnabled());await approve().focus();assert.ok(await approve().evaluate(e=>document.activeElement===e));await page.screenshot({path:out+`/money-${scenario}-${width}.png`,fullPage:true});
   await approve().click();await page.waitForFunction(()=>document.querySelector('[id^="company-item-"]')?.id.endsWith('002'));
   const calls=await page.evaluate(()=>window.calls),m=calls.find(c=>c.name==='decide_finance_expense_settlement').args;
   if(scenario==='company-paid'){assert.equal(m.p_mode,'company_bank');assert.equal(m.p_payee,null);assert.equal(await page.evaluate(()=>window.fixtureRequests[0].items[0].obligation),null);}
   assert.ok(calls.every(c=>['review_finance_expense','review_finance_expense_tax','decide_finance_expense_settlement','save_finance_payee','get_finance_expense_parties','get_finance_payees'].includes(c.name)));
   console.log('PASS money path',width,scenario);scenarios++;
  }
  for(const width of [390,1440]){
   // Historical 057 backend compatibility; the 058-only two-choice path has its own suite.
   const t=k=>translate('th','expenses.'+k);await page.setViewportSize({width,height:950});await page.goto(`${url}/finance/expenses?locale=th&schema=057`);await page.getByRole('button',{name:t('new'),exact:true}).first().click();let dialog=page.getByRole('dialog');
   await page.emulateMedia({reducedMotion:width===390?'reduce':'no-preference'});
   await page.evaluate(()=>{window.scrollCalls=[];const original=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(options){window.scrollCalls.push(options);return original.call(this,options);};});
   const values=['unpaid','company_paid','personal','unknown'],awareness=['no','yes','unknown','no'];
   for(const [index,value] of values.entries()){
    if(index)await dialog.getByRole('button',{name:t('addItem'),exact:true}).click();await page.waitForFunction(()=>document.activeElement?.id==='expense-expense_date');await dialog.locator('#expense-expense_date').fill('2026-09-03');await dialog.locator('#expense-category').selectOption('company.travel');await dialog.locator('#expense-gross_amount').fill(String((index+1)*100));await dialog.locator('#expense-description').fill('Synthetic '+value);await dialog.locator('#expense-handling').selectOption(value);
    if(value==='personal'){await dialog.locator('#expense-claimant_id').selectOption(id(1));await dialog.locator('#expense-reimbursement_requested').fill('200');}else assert.equal(await dialog.locator('#expense-claimant_id').count(),0);
    await dialog.locator('summary').filter({hasText:t('taxIfKnown')}).click();await dialog.locator('#expense-vat_awareness').selectOption(awareness[index]);await dialog.locator('#expense-wht_awareness').selectOption(awareness[index]);
    assert.equal(await dialog.locator('#expense-paid-on').count(),0);await fits();await dialog.getByRole('button',{name:t('addThisItem'),exact:true}).click();
   }
   const cards=dialog.locator('[data-request-item]');assert.equal(await cards.count(),4);
   assert.deepEqual(await cards.locator('[data-payment-declaration]').allTextContents(),[t('companyUnpaid'),t('handlingCompanyPaid'),translate('th','expenses.companyPersonalSummary',{name:f.lookups.people[0].name,amount:'200.00 THB'}),t('companyAwaitFinance')]);
   for(const [index,value]of values.entries()){
    await cards.nth(index).getByRole('button',{name:t('editItem'),exact:true}).click();await page.waitForFunction(()=>document.activeElement?.id==='expense-expense_date');
    await page.waitForFunction(()=>{const b=document.querySelector('#expense-expense_date').getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight;});
    assert.equal(await dialog.locator('#expense-handling').inputValue(),value);assert.equal(await dialog.locator('#expense-vat_awareness').inputValue(),awareness[index]);assert.equal(await dialog.locator('#expense-wht_awareness').inputValue(),awareness[index]);
    if(value==='personal'){assert.equal(await dialog.locator('#expense-claimant_id').inputValue(),id(1));assert.equal(await dialog.locator('#expense-reimbursement_requested').inputValue(),'200');}
    const scrollCount=await page.evaluate(()=>window.scrollCalls.length);await dialog.locator('#expense-description').fill('Synthetic edited '+value);assert.equal(await page.evaluate(()=>window.scrollCalls.length),scrollCount,'No scroll hijack while editing');
    await dialog.getByRole('button',{name:t('saveItemChanges'),exact:true}).click();
   }
   await cards.first().getByRole('button',{name:t('copyItem'),exact:true}).click();await page.waitForFunction(()=>document.activeElement?.id==='expense-expense_date');assert.equal(await dialog.locator('#expense-handling').inputValue(),'unpaid');await dialog.getByRole('button',{name:t('saveItemChanges'),exact:true}).click();await cards.last().getByRole('button',{name:t('removeItem'),exact:true}).click();
   assert.equal(await cards.count(),4);assert.ok((await dialog.innerText()).includes('1,000.00 THB'));
   assert.ok((await page.evaluate(()=>window.scrollCalls)).every(s=>s.behavior===(width===390?'instant':'smooth')));
   await dialog.locator('[data-payment-declaration]').first().scrollIntoViewIfNeeded();await page.screenshot({path:out+`/declarations-cards-${width}.png`});
   // Missing stored declaration must stop before Submit, without repairing or copying local data into the read model.
   if(width===390){await page.evaluate(()=>{window.omitDeclaration=true;});await dialog.getByRole('button',{name:t('sendForReview'),exact:true}).click();await dialog.getByRole('alert').waitFor();assert.ok((await dialog.getByRole('alert').innerText()).includes(t('companyDeclarationMismatch')));assert.deepEqual(await page.evaluate(()=>window.writes),['save_finance_expense_request']);await page.evaluate(()=>{window.omitDeclaration=false;});}
   await dialog.getByRole('button',{name:t('sendForReview'),exact:true}).click();await page.waitForFunction(()=>window.writes.length===2);const payload=(await page.evaluate(()=>window.calls)).find(c=>c.name==='save_finance_expense_request').args;
   assert.deepEqual(payload.p_items.map(i=>i.input.creator_payment_fact),['unpaid','company_paid','personal_paid','unknown']);assert.deepEqual(await page.evaluate(()=>window.writes),['save_finance_expense_request','submit_finance_expense_request']);
   await dialog.locator('[aria-controls^="company-item-"]').first().waitFor();
   for(const [index,value]of values.entries()){
    const toggle=dialog.locator('[aria-controls^="company-item-"]').nth(index);if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();const active=dialog.locator('[id^="company-item-"]');
    assert.ok((await active.innerText()).includes(t(['companyUnpaid','handlingCompanyPaid','companyPersonalPaid','companyPaymentUnknown'][index])));
    assert.ok((await active.locator('[data-creator-tax]').innerText()).includes(t(awareness[index])));assert.ok((await active.locator('[data-finance-tax]').innerText()).includes(t('pending')));
    assert.ok(await dialog.getByRole('button',{name:t('companyApprove'),exact:true}).isDisabled());
    if(value==='personal')assert.ok((await active.innerText()).includes('200.00 THB'));
    await fits();if(index===0)await page.screenshot({path:out+`/declarations-review-${width}.png`});
   }
   await page.goto(`${url}/finance/expenses?locale=th&schema=056`);await page.getByRole('button',{name:t('new'),exact:true}).first().click();dialog=page.getByRole('dialog');assert.equal(await dialog.locator('#expense-handling option[value=company_paid],#expense-handling option[value=unpaid]').count(),0);assert.deepEqual(await page.evaluate(()=>window.writes),[]);
   scenarios++;console.log('PASS four declarations, edit/duplicate/add focus, Submit/read-back guard, Review and pre-057 gate',width);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({pass:true,scenarios,artifacts:out,externalRequests:0}));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);console.error('Artifacts:',out);process.exitCode=1;});
