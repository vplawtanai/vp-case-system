/* eslint-disable @typescript-eslint/no-require-imports */
// Real React forms -> local HTTP -> actual application handler -> disposable PostgreSQL.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vp-payroll-093-browser-'));
const write=(n,s)=>{const p=path.join(out,n);fs.writeFileSync(p,s);return p;};
const loader=write('loader.cjs',`module.exports=function(s){if(this.resourcePath.endsWith('.css')){const p=require('node:path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(p)+'+k})};'}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(s,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);

const adapter=write('adapter.js',`export async function payrollRequest(body,period,month){const r=await fetch('/api?month='+encodeURIComponent(month||'2028-10-01'),{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error),{issue:data.issue});return data;}`);
const supabase=write('supabase.js',`export const supabase={auth:{getUser:async()=>({data:{user:{id:'local-admin'}}})},from(){const q={select:()=>q,eq:()=>q,single:async()=>({data:{role:'admin',active:true,must_change_password:false}})};return q;},async rpc(name){if(name==='get_finance_expense_access')return{data:{can_view_all:true,can_record:true,can_view_accounts:true}};if(name==='get_finance_statement_accounts')return{data:{accounts:[],can_transfer:true}};throw Error('Unexpected external call '+name);}};`);
const navigation=write('navigation.js',`export const usePathname=()=>location.pathname;export const useRouter=()=>({push:url=>location.assign(url),replace:url=>location.replace(url)});`);
const link=write('link.tsx',`import React from'react';export default function Link({children,prefetch,...props}){return <a {...props}>{children}</a>;}`);
const image=write('image.tsx',`import React from'react';export default function Image(props){return <img {...props}/>;}`);
const entry=write('entry.tsx',`import React from'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider.tsx';import{cookieUiLocale}from'${root}/lib/i18n/core.ts';import Payroll from'${root}/app/finance/payroll/workspace.tsx';import PayrollLayout from'${root}/app/finance/payroll/layout.tsx';const p=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale={p.get('locale')||cookieUiLocale(document.cookie)||'th'} pathname={location.pathname}><PayrollLayout>{location.pathname.startsWith('/finance/payroll')?<Payroll/>:<main>Navigation fixture</main>}</PayrollLayout></UiLocaleProvider>);`);
async function checkBrowser(request,personId){
 await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',context:root,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[root+'/node_modules'],alias:{[root+'/app/finance/payroll/client']:adapter,[root+'/lib/supabase']:supabase,'next/navigation':navigation,'next/link':link,'next/image':image}},module:{rules:[{test:/\.(tsx?|css|js)$/,exclude:/node_modules/,use:loader}]},devtool:false},(e,s)=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));
 const files=['app/components/ui/vp-ui.module.css','app/components/DetailModal.module.css','app/finance/ui/finance-ui.module.css','app/finance/payroll/payroll.module.css','app/finance/payouts/payout.module.css','app/finance/expenses/claim-category-combobox.module.css','app/components/AppSidebar.module.css','app/components/LanguageSelector.module.css','app/finance/finance-sidebar.module.css'];
 const css=files.map(f=>fs.readFileSync(root+'/'+f,'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,k)=>'.'+path.basename(f).replaceAll('.','_')+'_'+k).replace(/:global\(([^)]+)\)/g,'$1')).join('\n');
 const server=http.createServer(async(req,res)=>{
  try{
   if(req.url.startsWith('/api?')){let raw='';for await(const chunk of req)raw+=chunk;const r=await request(raw?JSON.parse(raw):undefined,new URL(req.url,'http://localhost').searchParams.get('month'));res.statusCode=r.status;res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(r.data));}
   if(req.url==='/branding/vp-partners-logo.png'){res.setHeader('Content-Type','image/png');return res.end(fs.readFileSync(root+'/public/branding/vp-partners-logo.png'));}
   if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(out+'/bundle.js'));}
   res.setHeader('Content-Type','text/html');res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#193956;background:#f7f9fc}${css}</style><div id="root"></div><script src="/bundle.js"></script>`);
  }catch(e){res.statusCode=500;res.end(JSON.stringify({error:String(e)}));}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  const {chromium}=require('/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const {load}=require('./finance-payroll-setup-support.cjs'),{payrollText}=load('app/finance/payroll/labels.ts'),{st}=load('app/finance/payroll/single-page.ts'),{setupLabel}=load('app/finance/payroll/setup.ts');
  for(const [locale,width,amount,kind]of [['th',1440,16000,'contractor'],['en',390,17000,'employee']]){
   const page=await browser.newPage({viewport:{width,height:980},reducedMotion:'reduce'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
   const t=k=>payrollText(locale,k),s=k=>st(locale,k);await page.goto(`http://127.0.0.1:${server.address().port}/finance/payroll?locale=${locale}`);
   const row=page.locator('tr[data-person="'+personId+'"]'),d=page.getByRole('dialog');await row.waitFor();
   await row.getByRole('button',{name:s('editRate')+' · Synthetic 093',exact:true}).click();
   assert.equal(await d.locator('input[name=effective_from]').inputValue(),'2028-10-01');assert.equal(await d.getByRole('radio',{name:setupLabel(locale,'correct'),exact:true}).isChecked(),true);
   await d.locator('input[name=monthly_amount]').fill(String(amount));await d.locator('textarea[name=reason]').fill('Browser correct rate');assert.equal(await d.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);await page.screenshot({path:out+'/correction-'+locale+'-'+width+'.png'});await d.getByRole('button',{name:t('save'),exact:true}).click();await d.waitFor({state:'hidden'});
   assert.ok((await row.innerText()).includes(amount.toLocaleString('en')+'.00'));
   await row.getByRole('button',{name:t(kind==='employee'?'contractor':'employee'),exact:true}).click();await d.getByRole('combobox').selectOption(kind);await d.locator('textarea[name=reason]').fill('Browser correct type');await d.getByRole('button',{name:t('save'),exact:true}).click();await d.waitFor({state:'hidden'});await row.getByRole('button',{name:t(kind),exact:true}).waitFor();
   await row.getByRole('button',{name:s('edit'),exact:true}).click();assert.equal(await d.locator('input[name=employee_ss]').count(),kind==='employee'?1:0);
   await page.screenshot({path:out+'/modal-'+locale+'-'+width+'.png'});assert.equal(await d.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:out+'/workspace-'+locale+'-'+width+'.png',fullPage:true});
   if(locale==='en'){
    await row.getByRole('button',{name:s('editRate')+' · Synthetic 093',exact:true}).click();await d.getByRole('radio',{name:setupLabel(locale,'future'),exact:true}).check();await d.locator('input[name=monthly_amount]').fill('18000');await d.locator('input[name=effective_from]').fill('2028-11-01');await d.locator('textarea[name=reason]').fill('Browser future rate');await d.getByRole('button',{name:t('save'),exact:true}).click();await d.waitFor({state:'hidden'});
    const data=(await request(undefined,'2028-11-01')).data;assert.equal(data.monthly.rows.find(x=>x.payee_id===personId).recurring_amount,18000);assert.equal(data.people.find(x=>x.id===personId).rates.length,2);assert.ok((await row.innerText()).includes('17,000.00'));
   }
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS 093 actual browser/API/PostgreSQL correction + future history, TH desktop and EN 390px. '+out);
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
module.exports={checkBrowser};
