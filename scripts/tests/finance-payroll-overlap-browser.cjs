/* eslint-disable @typescript-eslint/no-require-imports */
// Real UI, synthetic adapter, loopback-only network. No Production account or data.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vp-payroll-090-browser-'));
const id=n=>'90000000-0000-4000-8000-'+String(n).padStart(12,'0');
const people=[1,2,3].map((n)=>({id:id(n),profile_id:id(n),legal_name:['พนักงานตัวอย่าง A','พนักงานตัวอย่าง B','ผู้รับจ้างตัวอย่าง C'][n-1],version:1,is_active:true,tax_id:'1234567890123',destination:{id:id(100+n)},engagements:[{id:id(110+n),kind:n===3?'contractor':'employee',active:true,effective_from:'2026-01-01',reason:'Synthetic engagement'}],rates:[{id:id(120+n),monthly_amount:[23000,20000,15000][n-1],effective_from:'2026-01-01',reason:'Synthetic rate'}]}));
people[2].rates[0].effective_from='2026-10-04';
people[2].destination=null;
people[0].destination={id:id(101),bank_name:'KTB',account_name:'Synthetic VP',account_number:'1234566789',is_active:true};
const external={...people[2],id:id(4),profile_id:null,legal_name:'External vendor - not Payroll'};
const candidates=[6,7,8,9,10,11].map(n=>({...people[0],id:id(n),profile_id:id(n),legal_name:'Same VP name',engagements:[],rates:[]}));
const sourcePeople=[...people,external,...candidates];
const profiles=sourcePeople.filter(p=>p.profile_id).map(p=>({id:p.id,staff_name:p.legal_name,full_name:p.legal_name,email:'staff'+Number(p.id.slice(-12))+'@example.invalid',active:![id(1),id(9)].includes(p.id),account_type:[id(3),id(8)].includes(p.id)?'uat':p.id===id(11)?null:'operational',assignable:![id(2),id(10)].includes(p.id)}));
const data={today:'2026-10-04',people:sourcePeople,people_options:sourcePeople.map(p=>({...p,kind:p.profile_id?'internal':'external',entity_type:'natural_person'})),accounts:[{bank_account_id:id(90),cash_location_id:null,name_th:'KTB · บัญชีบริษัท',name_en:'KTB · Company account'}],periods:[{id:id(80),month:'2026-09-01',target_payment_date:'2026-09-30',status:'approved',payment_status:'approved',version:5,note:'Synthetic',line_count:3,net_total:56500},{id:id(81),month:'2026-10-01',target_payment_date:'2026-10-31',status:'draft',payment_status:'draft',version:1,note:'Draft',line_count:3,net_total:56500}],lines:[],obligations:[]};
const lines=people.map((p,n)=>({id:id(20+n),period_id:id(80),payee_id:p.id,kind:n===2?'contractor':'employee',name:p.legal_name,service_from:'2026-09-01',service_to:'2026-09-30',base_amount:[23000,20000,15000][n],additions:0,deductions:0,employee_ss:n<2?750:0,employer_ss:n<2?750:0,wht_treatment:'none',wht_amount:0,gross_amount:[23000,20000,15000][n],net_amount:[22250,19250,15000][n],requires_base_review:false,reviewed:true,adjustment_reason:'',note:'Reviewed synthetic facts',payment:null}));
const write=(n,s)=>{const p=path.join(out,n);fs.writeFileSync(p,s);return p;};
const loader=write('loader.cjs',`module.exports=function(s){if(this.resourcePath.endsWith('.css')){const p=require('node:path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(p)+'+k})};'}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(s,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);
const adapter=write('adapter.js',`import{newPayrollPeople}from'${root}/app/finance/payroll/model.ts';
const profiles=${JSON.stringify(profiles)};window.writes=[];window.cash=[];window.failRead=false;const data=${JSON.stringify(data)},lines=${JSON.stringify(lines)};
window.fixtureData=data;window.fixtureReads=0;window.reviewedLines={};
const setup=new URLSearchParams(location.search).get('setup');
if(setup){
 data.periods=[];
 if(setup==='empty')data.people=[];
 if(setup==='external-only')data.people=data.people.filter(p=>!p.profile_id);
 if(setup==='account-only')data.people=data.people.map(p=>({...p,engagements:[],rates:[]}));
 if(setup==='missing-rate')data.people=[{...data.people[0],rates:JSON.parse(sessionStorage.getItem('payroll-fixture-rates')||'[]')}];
}
export async function payrollRequest(body,period){
 if(!body&&location.search.includes('slow=1'))await new Promise(r=>setTimeout(r,700));
 if(!body){window.fixtureReads++;if(window.failRead){window.failRead=false;throw Error('synthetic readback');}return structuredClone({...data,new_people_options:newPayrollPeople(data,profiles),lines:period?lines.map(l=>({...l,period_id:period,reviewed:period===data.periods[1].id?!!window.reviewedLines[l.id]:l.reviewed,...(period===data.periods[1].id&&l.kind==='contractor'?{requires_base_review:true,...(!window.reviewedLines[l.id]?{base_amount:0,gross_amount:0,net_amount:0}:{}),service_from:'2026-10-01',service_to:'2026-10-31',source_json:{manual_review_reasons:['rate_starts_after_service_start'],rate_intervals:[{rate:data.people[2].rates[0],overlap_from:'2026-10-04',overlap_to:'2026-10-31'}]}}:{})})):[]});}
 window.writes.push(structuredClone(body));await new Promise(r=>setTimeout(r,140));
 if(body.action==='engagement'){const p=data.people.find(p=>p.id===body.payload.payee_id);p.engagements.push({...body.payload});}
 if(body.action==='rate'){const p=data.people.find(p=>p.id===body.payload.payee_id);p.rates.push({...body.payload});if(setup==='missing-rate')sessionStorage.setItem('payroll-fixture-rates',JSON.stringify(p.rates));}
 if(body.action==='line'){window.reviewedLines[body.payload.line_id]=true;const l=lines.find(l=>l.id===body.payload.line_id);Object.assign(l,body.payload,{reviewed:true,net_amount:Number(body.payload.base_amount)+Number(body.payload.additions)-Number(body.payload.deductions)-Number(body.payload.employee_ss)-Number(body.payload.wht_amount)});}
 if(body.action==='prepare')for(const i of body.items){const l=lines.find(l=>l.id===i.line_id);l.payment={id:i.payout_id,version:1,status:'draft',bank_account_id:i.bank_account_id,cash_location_id:i.cash_location_id,paid_on:i.paid_on,prepare:i};}
 if(body.action==='confirm')for(const i of body.items){const l=lines.find(l=>l.id===i.line_id);l.payment.status='confirmed';window.cash.push({payout_id:i.payout_id,amount:l.net_amount});}
 if(body.action==='prepare'&&location.search.includes('readfail'))window.failRead=true;
 return {id:body.payload?.id,ok:true};}
`);
const supabase=write('supabase.js',`export const supabase={
 auth:{getUser:async()=>({data:{user:{id:'synthetic-admin'}}})},
 from(table){if(table!=='user_profiles')throw Error('Unexpected table');const q={select:()=>q,eq:()=>q,single:async()=>({data:{role:'admin',active:true,must_change_password:false}})};return q;},
 async rpc(name,args){if(name==='save_finance_payee'){const destination={id:'synthetic-destination',...args.p_input.destination,is_active:true};for(const collection of [window.fixtureData.people,window.fixtureData.people_options])Object.assign(collection.find(p=>p.id===args.p_id),{destination,version:2});return{data:{id:args.p_id}};}if(name==='get_finance_expense_access')return{data:{can_view_all:true,can_record:true,can_view_accounts:true}};if(name==='get_finance_statement_accounts')return{data:{accounts:[],can_transfer:true}};throw Error('Unexpected external RPC: '+name);}
};`);
const navigation=write('navigation.js',`export const usePathname=()=>location.pathname;export const useRouter=()=>({push:url=>location.assign(url),replace:url=>location.replace(url)});`);
const link=write('link.tsx',`import React from'react';export default function Link({children,prefetch,...props}){return <a {...props}>{children}</a>;}`);
const image=write('image.tsx',`import React from'react';export default function Image(props){return <img {...props}/>;}`);
const entry=write('entry.tsx',`import React from'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider.tsx';import{cookieUiLocale}from'${root}/lib/i18n/core.ts';import Payroll from'${root}/app/finance/payroll/workspace.tsx';import PayrollLayout from'${root}/app/finance/payroll/layout.tsx';const p=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale={p.get('locale')||cookieUiLocale(document.cookie)||'th'} pathname={location.pathname}><PayrollLayout>{location.pathname.startsWith('/finance/payroll')?<Payroll/>:<main>Navigation fixture</main>}</PayrollLayout></UiLocaleProvider>);`);
async function main(){
 await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',context:root,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[root+'/node_modules'],alias:{[root+'/app/finance/payroll/client']:adapter,[root+'/lib/supabase']:supabase,'next/navigation':navigation,'next/link':link,'next/image':image}},module:{rules:[{test:/\.(tsx?|css|js)$/,exclude:/node_modules/,use:loader}]},devtool:false},(e,s)=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));
 const files=['app/components/ui/vp-ui.module.css','app/components/DetailModal.module.css','app/finance/payroll/payroll.module.css','app/finance/payouts/payout.module.css','app/finance/expenses/claim-category-combobox.module.css','app/components/AppSidebar.module.css','app/components/LanguageSelector.module.css','app/finance/finance-sidebar.module.css'];
 const css=files.map(f=>fs.readFileSync(root+'/'+f,'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,k)=>'.'+path.basename(f).replaceAll('.','_')+'_'+k).replace(/:global\(([^)]+)\)/g,'$1')).join('\n');
 const server=http.createServer((req,res)=>{if(req.url==='/branding/vp-partners-logo.png'){res.setHeader('Content-Type','image/png');return res.end(fs.readFileSync(root+'/public/branding/vp-partners-logo.png'));}if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(out+'/bundle.js'));}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#193956;background:#f7f9fc}${css}</style><div id="root"></div><script src="/bundle.js"></script>`);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  const {chromium}=require('/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const page=await browser.newPage({reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  require('./receipt-render-fixture.cjs');const {payrollText}=require('../../app/finance/payroll/labels.ts'),url='http://127.0.0.1:'+server.address().port+'/finance/payroll';
  for(const [width,locale]of [[1440,'th'],[390,'en']]){
   const t=k=>payrollText(locale,k);await page.setViewportSize({width,height:980});await page.goto(url+'?locale='+locale);
   await page.getByRole('tab',{name:t('people'),exact:true}).click();
   const card=page.locator('article').filter({has:page.getByRole('heading',{name:people[2].legal_name,exact:true})});
   await card.getByText(t('manualAmount'),{exact:true}).waitFor();await card.getByText(t('recipientSaved'),{exact:true}).waitFor();
   await card.getByText(t('missingSetup').replace('{requirement}',t('missingBank')),{exact:true}).waitFor();
   await page.locator('article').filter({has:page.getByRole('heading',{name:people[0].legal_name,exact:true})}).getByText(t('readyPeriod'),{exact:true}).waitFor();
   assert.equal(await page.getByText('1234566789',{exact:false}).count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await page.screenshot({path:out+`/readiness-${locale}-${width}.png`,fullPage:true});
   await card.getByRole('button',{name:t('paymentIdentity'),exact:true}).click();const d=page.getByRole('dialog');
   await d.locator('#payee-bank').fill('KTB');await d.locator('#payee-accountName').fill('Synthetic VP');await d.locator('#payee-accountNumber').fill('1234566789');
   const reads=await page.evaluate(()=>window.fixtureReads);await d.locator('button[type="submit"]').click();await d.waitFor({state:'hidden'});
   await card.getByText(/KTB/).waitFor();assert.ok((await card.innerText()).includes('6789'));assert.ok(!(await card.innerText()).includes('1234566789'));
   assert.equal(await page.evaluate(()=>window.fixtureReads),reads+1,'One readback after payment setup');await card.getByRole('status').waitFor();
   await page.getByRole('tab',{name:t('periods'),exact:true}).click();await page.getByRole('button',{name:t('newPeriod'),exact:true}).click();
   await d.getByText(people[2].legal_name,{exact:true}).waitFor();await d.getByText(t('manualAmount'),{exact:true}).waitFor();
   await d.locator('input[type="month"]').fill('2026-12');assert.equal(await d.getByText(t('manualAmount'),{exact:true}).count(),0);await page.keyboard.press('Escape');
   await page.getByRole('button',{name:t('view'),exact:true}).nth(1).click();
   const line=page.locator('article').filter({has:page.getByRole('heading',{name:people[2].legal_name,exact:true})});
   await line.getByText(t('draftPlaceholder'),{exact:true}).waitFor();await line.getByRole('button',{name:t('review'),exact:true}).click();
   assert.equal(await d.getByLabel(t('base'),{exact:true}).inputValue(),'');
   assert.equal(await d.getByLabel(t('employee_ss'),{exact:true}).count(),0);assert.equal(await d.getByLabel(t('employer_ss'),{exact:true}).count(),0);
   await d.getByRole('button',{name:t('save'),exact:true}).click();await d.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.writes.length),0);
   await d.getByLabel(t('base'),{exact:true}).fill('12000');await d.getByLabel(t('baseReason'),{exact:true}).fill('Manually reviewed October compensation');await d.locator('textarea[name=note]').fill('Admin reviewed actual amount');
   assert.equal(await d.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);await page.screenshot({path:out+`/review-${locale}-${width}.png`});
   await d.getByRole('button',{name:t('save'),exact:true}).click();await d.waitFor({state:'hidden'});await line.getByText(t('reviewCompleted'),{exact:true}).waitFor();
   const input=await page.evaluate(()=>window.writes[0].payload);assert.equal(input.base_amount,12000);assert.equal(input.employee_ss,0);assert.equal(input.employer_ss,0);assert.equal(input.adjustment_reason,'Manually reviewed October compensation');
   await page.screenshot({path:out+`/reviewed-${locale}-${width}.png`,fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  }
  assert.deepEqual(errors,[]);console.log('PASS Payroll 090 TH desktop + EN 390px: month readiness, masked destination, saved confirmation/one readback, live month guidance, unresolved blank amount, explicit amount/reason review, Contractor no SS, no overflow/runtime errors. '+out);
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
