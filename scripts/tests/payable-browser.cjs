/* eslint-disable @typescript-eslint/no-require-imports */
// Real UI with a synthetic adapter. Every non-loopback request is blocked.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {fixture,multiPageFixture,distributionId}=require('./payable-fixture.cjs');
const root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vp-payable-browser-'));
const write=(name,text)=>{const p=path.join(out,name);fs.writeFileSync(p,text);return p;};
const adapter=write('adapter.js',`
window.calls=[];window.rights=false;window.failRead=false;window.failAfterWrite=false;window.failure=null;
const data=${JSON.stringify(fixture())},many=${JSON.stringify(multiPageFixture())};
export const supabase={
 auth:{async getUser(){return{data:{user:{id:'synthetic'}}}},async signOut(){throw Error('Blocked')}},
 async rpc(name,p){window.calls.push({name,p});await new Promise(r=>setTimeout(r,60));
  if(name==='get_finance_payable_entitlements')return {data:p.p_search==='no-results'?{groups:[],has_next:false}:p.p_search==='multi-page'?{groups:many.groups.slice(p.p_offset,p.p_offset+25),has_next:p.p_offset+25<many.groups.length}:data};
  if(name!=='ensure_finance_payable_entitlements'||p.p_distribution_id!==${JSON.stringify(distributionId)}||p.p_expected_version!==3||p.p_acknowledged!==true)throw Error('Forbidden fixture call');
  if(window.failure){const m=window.failure;window.failure=null;return {error:{message:m}};}
  window.rights=true;if(window.failAfterWrite){window.failAfterWrite=false;window.failRead=true;}return {data:p.p_distribution_id};
 },
 from(table){if(table==='user_profiles')return{select(){return this},eq(){return this},async single(){return{data:{role:'admin'}}}};if(table!=='finance_payable_entitlement_sources')throw Error('Forbidden table');return{select(columns){if(columns!=='status')throw Error('Forbidden columns');return{eq(key,id){if(key!=='distribution_id'||id!==${JSON.stringify(distributionId)})throw Error('Forbidden identity');return{async maybeSingle(){
  if(window.failRead){window.failRead=false;return{error:{message:'Synthetic read unavailable'}};}return{data:window.rights?{status:'open'}:null};
 }}}}}}}
};`);
const navigation=write('navigation.js',"export const usePathname=()=>'/finance/payables';export const useRouter=()=>({push(){throw Error('Blocked')},replace(){throw Error('Blocked')},refresh(){throw Error('Blocked')}});");
const link=write('link.js',`import React from '${require.resolve('react')}';export default function Link({children,...props}){return React.createElement('a',props,children)}`);
const guard=write('guard.js','export const QuotationGuard=()=>null;');
const loader=write('loader.cjs',`module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix=require('node:path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(prefix)+'+k})};'}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);
const entry=write('entry.tsx',`import React from'react';import{createRoot}from'react-dom/client';
import{UiLocaleProvider}from'${root}/lib/i18n/provider.tsx';import AppTopNav from'${root}/app/components/AppTopNav.tsx';
import{MaterializeEntitlements}from'${root}/app/finance/payables/materialize-action.tsx';
const mode=new URLSearchParams(location.search).get('mode');createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale="th" pathname="/finance/payments"><AppTopNav title="Finance" activePage="finance"/><main><MaterializeEntitlements distributionId="${distributionId}" version={3} canManage={mode!=='readonly'}/></main></UiLocaleProvider>);`);
async function main(){
 await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',context:root,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[root+'/node_modules'],alias:{'next/navigation':navigation,'next/link':link,[root+'/lib/supabase']:adapter,[root+'/app/finance/quotations/shared']:guard}},module:{rules:[{test:/\.(tsx?|css)$/,use:loader}]},devtool:false},(e,s)=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));
 const css=['app/components/ui/vp-ui.module.css','app/finance/payables/payables.module.css','app/finance/finance-sidebar.module.css','app/components/LanguageSelector.module.css'].map(file=>{
  const prefix=path.basename(file).replaceAll('.','_')+'_';return fs.readFileSync(root+'/'+file,'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,key)=>'.'+prefix+key);
 }).join('\n');
 const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(out+'/bundle.js'));}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:16px;font-family:Arial,sans-serif;background:#fff;color:#182b45}button,input,select{font-family:inherit}main{min-width:0}${css}</style><div id="root"></div><script src="/bundle.js"></script></html>`);});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});let browser;
 try{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();external.push(route.request().url());return route.abort();});
  require('./receipt-render-fixture.cjs');const {translate}=require('../../lib/i18n/catalog.ts');const url='http://127.0.0.1:'+server.address().port;
  const writes=()=>page.evaluate(()=>window.calls.filter(c=>c.name==='ensure_finance_payable_entitlements').length);
  async function geometry(){const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,broken:[...document.querySelectorAll('main input,main select,main button')].filter(e=>e.offsetParent!==null&&e.getBoundingClientRect().right>innerWidth+1).map(e=>e.outerHTML)}));assert.equal(state.overflow,false);assert.deepEqual(state.broken,[]);}
  for(const locale of ['th','en'])for(const width of [390,1440]){
   await page.setViewportSize({width,height:1000});
   await page.goto(url+'?mode=materialize');await page.locator('button[lang='+locale+']').click();
   const action=page.getByRole('button',{name:translate(locale,'payables.materialize'),exact:true});await action.waitFor();
   await action.click();await page.getByRole('alert').waitFor();assert.equal(await writes(),0);
   await page.getByLabel(translate(locale,'payables.ack'),{exact:true}).check();
   await page.evaluate(()=>window.failAfterWrite=true);await action.click();await page.getByRole('alert').waitFor();assert.equal(await writes(),1);
   assert.equal(await action.count(),0);await page.getByRole('button',{name:translate(locale,'common.actions.retry'),exact:true}).click();
   await page.getByText(translate(locale,'payables.ready'),{exact:true}).waitFor();assert.equal(await writes(),1);await geometry();
   await page.goto(url+'?mode=readonly');await page.locator('button[lang='+locale+']').click();await page.getByText(translate(locale,'payables.readOnly'),{exact:true}).waitFor();assert.equal(await page.locator('main input[type=checkbox]').count(),0);assert.equal(await writes(),0);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({pass:true,widths:[390,1440],locales:['th','en'],uncertainWriteRecovery:true,externalRequests:0,artifacts:out}));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);console.error('Artifacts:',out);process.exitCode=1;});
