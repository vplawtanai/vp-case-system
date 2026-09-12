/* eslint-disable @typescript-eslint/no-require-imports */
// Actual profile editor and i18n with a closed synthetic adapter; no external requests.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vp-customer-tax-browser-'));
const webpack=require('next/dist/compiled/webpack/webpack').webpack;
const initial={identity:{id:'local',name:'Synthetic Client / ลูกความทดสอบ',tax_id:'1234567890123',address:'ที่อยู่ทดสอบสำหรับตรวจสอบการจัดวางข้อมูลภาษี\nSynthetic address for responsive review only',client_type:'individual'},profile:null,status:'missing',can_manage:true};
const adapter=path.join(out,'adapter.js'),navigation=path.join(out,'navigation.js'),link=path.join(out,'link.js'),loader=path.join(out,'loader.cjs'),entry=path.join(out,'entry.tsx');
fs.writeFileSync(adapter,`window.calls=[];window.fixture=JSON.parse(localStorage.getItem('customer-tax-fixture')||'null')||${JSON.stringify(initial)};
export const supabase={async rpc(name,p){if(name==='get_finance_customer_tax_profile')return{data:structuredClone(window.fixture),error:null};if(name!=='save_finance_customer_tax_profile')throw Error('Unexpected RPC '+name);window.calls.push({name,p});const f=window.fixture;f.profile={client_id:f.identity.id,vat_registered:p.p_vat_registered,branch_type:p.p_branch_type,branch_code:p.p_branch_code,identity_evidence:p.p_identity_evidence,identity_snapshot_json:structuredClone(f.identity),verified_at:p.p_verified?'2026-09-01T00:00:00Z':null,updated_at:'2026-09-01T00:00:00Z'};f.status=p.p_verified?'verified':'unverified';localStorage.setItem('customer-tax-fixture',JSON.stringify(f));return{data:structuredClone(f),error:null}}};`);
fs.writeFileSync(navigation,"export const usePathname=()=>location.pathname;export const useParams=()=>({id:'local'});");
fs.writeFileSync(link,`import React from '${require.resolve('react')}';export default function Link({children,...props}){return React.createElement('a',props,children)}`);
fs.writeFileSync(loader,`module.exports=function(source){if(this.resourcePath.endsWith('.css'))return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>k})};';if(this.resourcePath.endsWith('/clients/[id]/tax-identity/page.tsx'))source=source.replace(/import AuthGuard from [^;]+;/,'const AuthGuard=()=>null;').replace(/import AppTopNav from [^;]+;/,'const AppTopNav=()=>null;');return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);
fs.writeFileSync(entry,`import React from 'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider.tsx';import LanguageSelector from'${root}/app/components/LanguageSelector.tsx';import{CustomerTaxIdentityEditor}from'${root}/app/clients/CustomerTaxIdentityEditor.tsx';createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale="th" pathname="/clients/local/tax-identity"><LanguageSelector/><main><CustomerTaxIdentityEditor clientId="local"/></main></UiLocaleProvider>);`);
async function main(){
 await new Promise((resolve,reject)=>webpack({mode:'development',context:root,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules')],alias:{'next/navigation':navigation,'next/link':link,[path.join(root,'lib/supabase')]:adapter}},module:{rules:[{test:/\.(tsx?|css)$/,use:loader}]},devtool:false},(err,stats)=>err||stats.hasErrors()?reject(err||Error(stats.toString({all:false,errors:true}))):resolve()));
 const css=fs.readFileSync(path.join(root,'app/clients/tax-identity.module.css'),'utf8')+fs.readFileSync(path.join(root,'app/components/LanguageSelector.module.css'),'utf8');
 const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(out,'bundle.js')));return;}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}${css}</style><div id="root"></div><script>if(location.search.includes('reset')){localStorage.removeItem('customer-tax-fixture');localStorage.removeItem('vp.ui.locale');}</script><script src="/bundle.js"></script></html>`)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const url='http://127.0.0.1:'+server.address().port+'/clients/local/tax-identity';
 for(const width of [390,768,1024,1440]){
  await page.setViewportSize({width,height:1000});await page.goto(url+'?reset');await page.locator('main select').first().waitFor();
  assert.equal(await page.locator('main select').count(),1);assert.equal(await page.locator('button[type=submit]').isDisabled(),true);
  await page.locator('input[type=checkbox]').check();await page.locator('button[type=submit]').click();await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.calls.length),0);
  await page.locator('main select').first().selectOption('true');assert.equal(await page.locator('main select').count(),2);assert.equal(await page.locator('main select').nth(1).inputValue(),'');assert.equal(await page.locator('input[type=checkbox]').isChecked(),false);
  await page.locator('main select').nth(1).selectOption('branch');await page.locator('input[inputmode=numeric]').fill('00000');await page.locator('button[type=submit]').click();assert.equal(await page.evaluate(()=>window.calls.length),0);
  await page.locator('input[inputmode=numeric]').fill('00012');await page.locator('textarea').fill('Customer registration evidence');await page.locator('input[type=checkbox]').check();
  for(const locale of ['en','th']){await page.locator('button[lang='+locale+']').click();assert.equal(await page.locator('input[inputmode=numeric]').inputValue(),'00012');assert.equal(await page.locator('input[type=checkbox]').isChecked(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,width+' '+locale+' overflow');await page.screenshot({path:path.join(out,`tax-profile-${width}-${locale}.png`),fullPage:true});}
  await page.locator('button[type=submit]').click();await page.waitForFunction(()=>window.calls.length===1);await page.waitForFunction(()=>document.querySelector('button[type=submit]').disabled);
  const call=await page.evaluate(()=>window.calls[0]);assert.equal(call.p.p_vat_registered,true);assert.equal(call.p.p_branch_code,'00012');assert.equal(call.p.p_verified,true);
  await page.goto(url);await page.locator('main select').first().waitFor();assert.equal(await page.locator('input[type=checkbox]').isChecked(),true);assert.equal(await page.locator('button[type=submit]').isDisabled(),true);
  await page.locator('main select').first().selectOption('false');assert.equal(await page.locator('main select').count(),1);assert.equal(await page.locator('input[type=checkbox]').isChecked(),false);assert.equal(await page.evaluate(()=>window.calls.length),0);
  await page.locator('button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('button[type=submit]').disabled);
  assert.ok((await page.getByRole('status').innerText()).includes('ยังไม่ได้ตรวจสอบข้อมูลภาษี'),'Saving entered values must not hide unverified status');
  assert.equal(await page.evaluate(()=>window.calls[0].p.p_verified),false);assert.equal(await page.evaluate(()=>window.calls[0].p.p_branch_type),null);
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({pass:true,widths:[390,768,1024,1440],locales:['th','en'],artifacts:out}));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);console.error('Artifacts:',out);process.exitCode=1});
