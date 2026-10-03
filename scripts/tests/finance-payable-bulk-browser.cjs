/* eslint-disable @typescript-eslint/no-require-imports */
// Real components with a closed, synthetic RPC adapter. No external network.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {fixture,expense,obligation,id}=require('./expense-foundation-fixture.cjs');
const root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vp-bulk-088-browser-'));
const f=fixture('list');const rows=[200,220,817.20].map((amount,n)=>obligation(n+40,id(n+10),{gross_amount:amount,created_at:`2026-09-${10+n}T04:00:00Z`,reference:'EXP-'+(n+1),description:'รายการทดสอบ '+(n+1),payee_name:n===1?'ผู้รับที่สอง':'ผู้รับที่หนึ่ง'}));
const records=rows.map((o,n)=>expense(n+10,{gross_amount:o.gross_amount,obligation:{id:o.id,settled:false,waived:false},tax_review:{request_json:{schema_version:2},wht_state:'none'},settlement:{mode:'supplier_unpaid'}}));
const write=(n,s)=>{const p=path.join(out,n);fs.writeFileSync(p,s);return p;};
const loader=write('loader.cjs',`module.exports=function(s){if(this.resourcePath.endsWith('.css')){const p=require('node:path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(p)+'+k})};'}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(s,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);
const nav=write('nav.js',`export const usePathname=()=>'/finance/payables';export const useRouter=()=>({push(){}});export const useSearchParams=()=>new URLSearchParams(location.search);`);
const link=write('link.js',`import React from'react';export default function Link({children,...p}){return <a {...p}>{children}</a>}`);
const adapter=write('adapter.js',`window.writes=[];window.cash=[];window.readFail=false;const records=${JSON.stringify(records)},base=${JSON.stringify(f.data)};export const supabase={async rpc(name,args){
 if(name==='get_finance_expenses'){if(window.readFail){window.readFail=false;return{error:{message:'synthetic read failure'}};}return{data:{...base,record:records.find(r=>r.id===args.p_id)}};}
 if(name!=='finance_expense_payout_batch')throw Error('Forbidden RPC '+name);
 window.writes.push(structuredClone(args));await new Promise(r=>setTimeout(r,160));
 const items=args.p_items.map(i=>{const r=records.find(r=>r.obligation.id===i.obligation_id);if(args.p_action==='prepare')r.payout={id:i.payout_id,version:1,status:'draft',gross:r.gross_amount,wht:0,net:r.gross_amount,bank_account_id:i.bank_account_id,cash_location_id:i.cash_location_id,paid_on:i.paid_on,payee_version:1,can_confirm:true,destination:null};else{r.payout.status='confirmed';r.payout.version=2;window.cash.push({payout_id:i.payout_id,amount:r.gross_amount});}return{obligation_id:i.obligation_id,payout_id:i.payout_id,version:r.payout.version,status:r.payout.status,gross:r.gross_amount,wht:0,net:r.gross_amount};});
 if(args.p_action==='prepare'&&location.search.includes('readfail'))window.readFail=true;
 return{data:{action:args.p_action,items}};
 }};`);
const entry=write('entry.tsx',`import React from'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider.tsx';import{MultiSourcePayables}from'${root}/app/finance/payables/multi-source.tsx';const p=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale={p.get('locale')||'th'} pathname="/finance/payables"><main><MultiSourcePayables canReadRevenue={false} canReadExpense={true} isAdmin={!p.has('nonadmin')} fixture={{revenue:[],expenses:${JSON.stringify(rows)}}}/></main></UiLocaleProvider>);`);
async function main(){
 await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',context:root,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[root+'/node_modules'],alias:{'next/navigation':nav,'next/link':link,[root+'/lib/supabase']:adapter}},module:{rules:[{test:/\.(tsx?|css|js)$/,exclude:/node_modules/,use:loader}]},devtool:false},(e,s)=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));
 const files=['app/components/ui/vp-ui.module.css','app/components/DetailModal.module.css','app/finance/ui/finance-ui.module.css','app/finance/expenses/expenses.module.css','app/finance/payables/payables.module.css','app/finance/payables/bulk-payment.module.css'];
 const css=files.map(f=>fs.readFileSync(root+'/'+f,'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,k)=>'.'+path.basename(f).replaceAll('.','_')+'_'+k).replace(/:global\(([^)]+)\)/g,'$1')).join('\n');
 const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(out+'/bundle.js'));}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial;color:#182b45}main{max-width:1180px;padding:16px;margin:auto}${css}</style><div id="root"></div><script src="/bundle.js"></script>`);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  const {chromium}=require('/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  require('./receipt-render-fixture.cjs');const {bulkCopy}=require('../../app/finance/payables/bulk-payment-copy.ts');const url='http://127.0.0.1:'+server.address().port;
  const summary=(c,locale,amounts)=>c.selected.replace('{n}',String(amounts.length)).replace('{amount}',amounts.reduce((s,n)=>s+n,0).toLocaleString(locale,{minimumFractionDigits:2,maximumFractionDigits:2}));
  for(const [width,locale]of [[1440,'th'],[390,'th'],[1440,'en'],[390,'en']]){
   const c=bulkCopy[locale];await page.setViewportSize({width,height:950});await page.goto(url+'?locale='+locale);await page.getByText(c.all,{exact:true}).waitFor();
   assert.equal(await page.locator('input[type=checkbox]:checked').count(),0);await page.getByText(summary(c,locale,[]),{exact:true}).waitFor();
   await page.getByLabel(c.select+': EXP-2 รายการทดสอบ 2',{exact:true}).check();await page.getByRole('button',{name:c.prepare,exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByText('ผู้รับที่สอง',{exact:false}).waitFor();assert.equal(await dialog.locator('article').count(),1);await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
   await page.getByLabel(c.all,{exact:true}).check();await page.getByText(summary(c,locale,[200,220,817.2]),{exact:true}).waitFor();await page.getByRole('button',{name:c.prepare,exact:true}).click();await dialog.locator('article').first().waitFor();assert.equal(await dialog.locator('article').count(),3);
   for(const select of await dialog.locator('select').all())await select.selectOption(id(2));
   await page.screenshot({path:out+`/prepare-${locale}-${width}.png`});
   await dialog.getByRole('button',{name:c.prepare,exact:true}).evaluate(b=>{b.click();b.click();});await dialog.getByLabel(c.ack).waitFor();assert.equal(await page.evaluate(()=>window.writes.length),1);assert.deepEqual(await page.evaluate(()=>window.cash),[]);
   assert.ok(await dialog.getByRole('button',{name:c.confirm,exact:true}).isDisabled());await dialog.getByLabel(c.ack).check();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);await page.screenshot({path:out+`/review-${locale}-${width}.png`});
   await dialog.getByRole('button',{name:c.confirm,exact:true}).evaluate(b=>{b.click();b.click();});await dialog.getByText(c.done.replaceAll('{n}','3'),{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.writes.length),2);assert.deepEqual(await page.evaluate(()=>window.cash.map(r=>r.amount)),[200,220,817.2]);
  }
  for(const indexes of [[1],[1,2]]){
   const c=bulkCopy.th,selected= indexes.map(n=>rows[n]);await page.setViewportSize({width:1440,height:950});await page.goto(url+'?locale=th');
   for(const r of selected)await page.getByLabel(c.select+': '+r.reference+' '+r.description,{exact:true}).check();
   await page.getByText(summary(c,'th',selected.map(r=>r.gross_amount)),{exact:true}).waitFor();
   assert.equal(await page.getByLabel(c.select+': EXP-1 รายการทดสอบ 1',{exact:true}).isChecked(),false);
   await page.getByRole('button',{name:c.prepare,exact:true}).click();const d=page.getByRole('dialog');await d.locator('select').first().waitFor();assert.equal(await d.locator('article').count(),selected.length);
   for(const select of await d.locator('select').all())await select.selectOption(id(2));
   await d.getByRole('button',{name:c.prepare,exact:true}).click();await d.getByLabel(c.ack).waitFor();assert.deepEqual(await page.evaluate(()=>window.cash),[]);
   await d.getByLabel(c.ack).check();await d.getByRole('button',{name:c.confirm,exact:true}).click();await d.getByText(c.done.replaceAll('{n}',String(selected.length)),{exact:true}).waitFor();
   assert.deepEqual(await page.evaluate(()=>window.writes.map(w=>w.p_items.map(i=>i.obligation_id))),[selected.map(r=>r.id),selected.map(r=>r.id)]);
   assert.deepEqual(await page.evaluate(()=>window.cash.map(r=>r.amount)),selected.map(r=>r.gross_amount));
  }
  // Existing per-item details and prepare route still reach the selected expense.
  for(const locale of ['th','en']){
   await page.goto(url+'?locale='+locale);await page.getByRole('button',{name:locale==='th'?'ดูรายละเอียด':'View',exact:true}).nth(1).click();
   const d=page.getByRole('dialog');await d.getByText('EXP-2',{exact:true}).waitFor();await page.keyboard.press('Escape');await d.waitFor({state:'hidden'});
   assert.equal(await page.locator('a[href="/finance/expenses/'+rows[1].expense_id+'#payment"]').count(),1);assert.deepEqual(await page.evaluate(()=>window.writes),[]);
  }
  const c=bulkCopy.en;await page.goto(url+'?locale=en&readfail=1');await page.getByLabel(c.all).check();await page.getByRole('button',{name:c.prepare,exact:true}).click();const dialog=page.getByRole('dialog');await dialog.locator('select').first().waitFor();for(const select of await dialog.locator('select').all())await select.selectOption(id(2));await dialog.getByRole('button',{name:c.prepare,exact:true}).click();await dialog.getByText(c.readFailed).waitFor();await dialog.getByRole('button',{name:c.reload}).click();await dialog.getByLabel(c.ack).waitFor();assert.equal(await page.evaluate(()=>window.writes.length),1);
  await page.goto(url+'?locale=en&nonadmin=1');await page.locator('main h1').waitFor();assert.equal(await page.locator('input[type=checkbox]').count(),0);assert.deepEqual(errors,[]);console.log('PASS TH/EN desktop/390px, one/some/all/non-oldest selection and totals, N separate outflows, original single-item route, two steps, double click, read-back recovery, no overflow/console/runtime errors. '+out);
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
