/* eslint-disable @typescript-eslint/no-require-imports */
// Local-only browser verification: real locale provider/nav plus actual SSR
// workspaces rendered by the regression fixtures. No auth or Supabase access.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),cp=require("node:child_process"),http=require("node:http"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,"../.."),out=fs.mkdtempSync(path.join(os.tmpdir(),"vp-i18n-layout-"));
const webpackModule=require("next/dist/compiled/webpack/webpack");
const webpack=webpackModule.webpack;
const loader=path.join(out,"loader.cjs");
fs.writeFileSync(loader,`module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix=require('path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,key)=>'+JSON.stringify(prefix)+'+key})};';}return require(${JSON.stringify(require.resolve("typescript"))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText;};`);
const nextNavigation=path.join(out,"navigation.js"),nextLink=path.join(out,"link.js");
fs.writeFileSync(nextNavigation,'export const usePathname=()=>location.pathname;');
fs.writeFileSync(nextLink,'import React from '+JSON.stringify(require.resolve("react"))+';export default function Link({children,...props}){return React.createElement("a",props,children);}');
cp.execFileSync(process.execPath,["--test","scripts/tests/i18n-core-workspaces.test.cjs"],{cwd:root,env:{...process.env,VP_I18N_VISUAL_DIR:out},stdio:"pipe"});
const entry=`import React from "react";import{createRoot}from"react-dom/client";import{UiLocaleProvider,useI18n}from"${root}/lib/i18n/provider.tsx";import{cookieUiLocale}from"${root}/lib/i18n/core.ts";import LanguageSelector from"${root}/app/components/LanguageSelector.tsx";import FinanceSubNav from"${root}/app/finance/FinanceSubNav.tsx";
const h=React.createElement;function Screen(){const{locale,t}=useI18n();const[value,setValue]=React.useState('Original unsaved note');return h(React.Fragment,null,h('header',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:16}},h('strong',null,'VP Office OS'),h(LanguageSelector)),h('div',{style:{padding:'0 16px'}},h(FinanceSubNav,{activePage:'invoices',permissions:{canViewFinanceQuotations:true,canViewFinanceReceipts:true,canViewFinanceTaxInvoices:true,canViewFinanceCashTransactions:true,canViewCompanyLedger:true,canSubmitExpenseClaim:true,canViewLawyerCompensation:true}})),h('label',{style:{display:'block',padding:'0 16px'}},t('common.state.unsaved'),h('input',{'data-state-probe':true,value,onChange:e=>setValue(e.target.value)})),h('div',{'data-workspace':true,dangerouslySetInnerHTML:{__html:window.sample[locale]}}));}createRoot(document.getElementById('root')).render(h(UiLocaleProvider,{initialLocale:cookieUiLocale(document.cookie)||'th',pathname:location.pathname,coverage:{finance:true,documentSettings:true,other:false}},h(Screen)));`;
function compile(){return new Promise((resolve,reject)=>webpack({mode:"development",context:root,entry:"data:text/javascript,"+encodeURIComponent(entry),output:{path:out,filename:"bundle.js"},resolve:{extensions:[".tsx",".ts",".js"],modules:[path.join(root,"node_modules")],alias:{"next/navigation":nextNavigation,"next/link":nextLink}},module:{rules:[{test:/\.(tsx?|css)$/,use:loader}]},plugins:[new webpack.DefinePlugin({"process.env.NODE_ENV":JSON.stringify("development")})],devtool:false},(error,stats)=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));}
async function main(){
  await compile();
  const styleFile=file=>{const prefix=path.basename(file).replaceAll('.','_')+'_';return fs.readFileSync(path.join(root,file),'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,key)=>'.'+prefix+key);};
  const samples=fs.readdirSync(out).filter(x=>x.endsWith('.json'));
  const server=http.createServer((req,res)=>{
    if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(out,'bundle.js')));}
    const name=decodeURIComponent(req.url.split('/').pop());const sample=JSON.parse(fs.readFileSync(path.join(out,samples.includes(name)?name:samples[0]),'utf8'));
    res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#111827;background:#f8fafc}${sample.css}${styleFile('app/components/LanguageSelector.module.css')}${styleFile('app/finance/finance-sub-nav.module.css')}</style><div id="root"></div><script>window.sample=${JSON.stringify(sample).replaceAll('<','\\u003c')};</script><script src="/bundle.js"></script></html>`);
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    const page=await browser.newPage();const failures=[];page.on('pageerror',error=>{failures.push(error.message);console.error(error.message);});
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    const base='http://127.0.0.1:'+server.address().port;
    const selected=samples.filter(x=>/^(PaymentWorkspace-draft|ReceiptWorkspace-draft|TaxInvoiceEditor-draft)/.test(x));assert.ok(selected.length>=4,selected.join(','));
    for(const width of [1440,768,390])for(const name of selected){
      await page.setViewportSize({width,height:1000});await page.goto(base+'/finance/'+name);await page.locator('[data-workspace]').waitFor();
      for(const locale of ['th','en']){
        await page.locator('button[lang="'+locale+'"]').click();await page.waitForFunction(locale=>document.documentElement.lang===locale,locale);
        assert.equal(await page.locator('[data-state-probe]').inputValue(),'Original unsaved note');
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
        if(overflow){console.log(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(n=>n.getBoundingClientRect().right>innerWidth+1&&!n.closest('nav')).slice(0,20).map(n=>({tag:n.tagName,cls:n.className,text:n.textContent.slice(0,70),width:n.getBoundingClientRect().width,right:n.getBoundingClientRect().right}))));await page.screenshot({path:path.join(out,'overflow.png'),fullPage:true});console.log(out);}
        assert.equal(overflow,false,name+' '+locale+' '+width+' overflows');
        const nav=page.locator('nav').first();await nav.evaluate(n=>n.scrollLeft=n.scrollWidth);assert.ok(await nav.locator('a').last().isVisible());
        await page.screenshot({path:path.join(out,name+'-'+locale+'-'+width+'.png'),fullPage:true});
      }
    }
    await page.locator('[data-state-probe]').fill('Retained local edit');await page.locator('button[lang="th"]').click();assert.equal(await page.locator('[data-state-probe]').inputValue(),'Retained local edit');
    await page.locator('button[lang="en"]').click();await page.reload();await page.waitForFunction(()=>document.documentElement.lang==='en');
    assert.equal(await page.evaluate(()=>localStorage.getItem('vp.ui.locale')),'en');
    await page.goto(base+'/cases/example');await page.locator('[data-workspace]').waitFor();assert.equal(await page.locator('button[lang="en"]').isDisabled(),true);assert.equal(await page.locator('button[lang="th"]').getAttribute('aria-pressed'),'true');
    assert.deepEqual(failures,[]);console.log(JSON.stringify({pass:true,widths:[1440,768,390],samples:selected,artifacts:out}));
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
