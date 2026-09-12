/* eslint-disable @typescript-eslint/no-require-imports */
// Real React/modal with a closed in-browser synthetic backend. Never uses Supabase.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vp-money-allocation-browser-'));
const {fixture}=require('./money-allocation-fixture.cjs'),webpack=require('next/dist/compiled/webpack/webpack').webpack;
const adapter=path.join(out,'adapter.js'),navigation=path.join(out,'navigation.js'),link=path.join(out,'link.js'),loader=path.join(out,'loader.cjs'),entry=path.join(out,'entry.tsx');
fs.writeFileSync(adapter,`window.calls=[];window.context=${JSON.stringify(fixture())};if(location.search.includes('readonly'))window.context.can_manage=false;if(location.search.includes('partial')){window.context.source.blockers=['partial_line_evidence_missing'];window.context.source.lines=[];window.context.source.proven_base=0;window.context.source.proven_vat=0;window.context.source.unallocated_settlement=19280;}
export const supabase={async rpc(name,p){if(name==='get_finance_money_allocation')return{data:structuredClone(window.context)};if(!['save_finance_money_allocation','transition_finance_money_allocation'].includes(name))throw Error('Unexpected RPC');window.calls.push({name,p});await new Promise(r=>setTimeout(r,50));const c=window.context;if(name==='save_finance_money_allocation'){c.current={id:'local-allocation',payment_id:'synthetic-payment',revision:1,version:(c.current?.version||0)+1,status:'draft',source_snapshot_json:p.p_source,decisions_json:p.p_choices,note:p.p_note,created_at:'2026-07-01T00:00:00Z'};c.source_current=true;}else{c.current.status=({review:'reviewed',finalize:'finalized',supersede:'superseded'})[p.p_action];c.current.version++;}c.history=[structuredClone(c.current)];return{data:c.current.id}}};`);
fs.writeFileSync(navigation,"export const usePathname=()=>'/finance/payments/local';");
fs.writeFileSync(link,`import React from '${require.resolve('react')}';export default function Link({children,...props}){return React.createElement('a',props,children)}`);
fs.writeFileSync(loader,`module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix=require('node:path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(prefix)+'+k})};'}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);
fs.writeFileSync(entry,`import React from'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider.tsx';import LanguageSelector from'${root}/app/components/LanguageSelector.tsx';import{MoneyAllocationPanel}from'${root}/app/finance/payments/money-allocation-panel.tsx';createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale="th" pathname="/finance/payments/local"><LanguageSelector/><main><MoneyAllocationPanel paymentId="synthetic-payment"/></main></UiLocaleProvider>);`);
async function main(){
 await new Promise((resolve,reject)=>webpack({mode:'development',context:root,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules')],alias:{'next/navigation':navigation,'next/link':link,[path.join(root,'lib/supabase')]:adapter}},module:{rules:[{test:/\.(tsx?|css)$/,use:loader}]},devtool:false},(err,stats)=>err||stats.hasErrors()?reject(err||Error(stats.toString({all:false,errors:true}))):resolve()));
 const css=['app/finance/payments/money-allocation.module.css','app/components/DetailModal.module.css','app/components/LanguageSelector.module.css'].map(file=>{const prefix=path.basename(file).replaceAll('.','_')+'_';return fs.readFileSync(path.join(root,file),'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,key)=>'.'+prefix+key);}).join('\n');
 const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(out,'bundle.js')));return;}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}main{padding:12px;max-width:1080px;margin:auto}${css}</style><div id="root"></div><script src="/bundle.js"></script></html>`);});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});let browser;
 try{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());const url='http://127.0.0.1:'+server.address().port;
  for(const width of [390,768,1024,1440])for(const locale of ['th','en']){
   await page.setViewportSize({width,height:950});await page.goto(url);await page.locator('button[lang='+locale+']').click();
   const open=page.getByRole('button',{name:locale==='th'?'ตรวจสอบการจัดสรร':'Review allocation',exact:true});await open.click();const dialog=page.getByRole('dialog');await dialog.waitFor();
   await page.waitForFunction(()=>!document.querySelector('[role=dialog] [aria-busy=true]'));
   assert.equal(await dialog.locator('select').count(),3);for(const s of await dialog.locator('select').all())assert.equal(await s.inputValue(),'unallocated');
   assert.equal(await page.evaluate(()=>window.calls.length),0);
   await page.screenshot({path:path.join(out,`money-top-${width}-${locale}.png`),fullPage:true});
   const save=dialog.getByRole('button',{name:locale==='th'?'บันทึกร่างการจัดสรร':'Save allocation draft',exact:true});await save.click();
   const review=dialog.getByRole('button',{name:locale==='th'?'บันทึกว่าตรวจสอบแล้ว':'Record review',exact:true});await review.waitFor();await review.click();await dialog.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.calls.length),1);
   await dialog.locator('input[type=checkbox]').check();await review.click();assert.equal(await page.evaluate(()=>window.calls.length),1);
   assert.equal(await dialog.locator('select[aria-invalid=true]').count(),3);
   for(let n=0;n<3;n++){await dialog.locator('select').nth(n).selectOption(n===1?'client_money':'company_revenue');await dialog.locator('fieldset textarea').nth(n).fill(locale==='th'?'ตรวจสอบหลักฐานตามสัญญาแล้ว':'Reviewed contractual evidence');}
   // Change the provider through its real selector while the modal stays mounted.
   // The selector is behind the modal, so dispatch its click without moving focus.
   for(const language of [locale==='th'?'en':'th',locale]){
    await page.locator('button[lang='+language+']').evaluate(el=>el.click());
    assert.equal(await dialog.isVisible(),true);
    await dialog.getByRole('heading',{name:language==='th'?'การจัดสรรเงิน':'Money Allocation',exact:true}).waitFor();
    assert.equal(await dialog.locator('select').nth(1).inputValue(),'client_money');
    assert.equal(await dialog.locator('fieldset textarea').first().inputValue(),locale==='th'?'ตรวจสอบหลักฐานตามสัญญาแล้ว':'Reviewed contractual evidence');
   }
   // Closing a focused modal or switching language must not discard local choices.
   for(const language of [locale==='th'?'en':'th',locale]){
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await page.locator('button[lang='+language+']').click();
    await page.getByRole('button',{name:language==='th'?'ตรวจสอบการจัดสรร':'Review allocation',exact:true}).click();await dialog.waitFor();
    assert.equal(await dialog.locator('select').nth(1).inputValue(),'client_money');
    assert.equal(await dialog.locator('fieldset textarea').first().inputValue(),locale==='th'?'ตรวจสอบหลักฐานตามสัญญาแล้ว':'Reviewed contractual evidence');
   }
   assert.equal(await review.isDisabled(),true);await save.click();await page.waitForFunction(()=>window.calls.length===2&&!document.querySelector('[role=dialog] [aria-busy=true]'));
   await dialog.locator('input[type=checkbox]').check();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
   await page.screenshot({path:path.join(out,`money-${width}-${locale}.png`),fullPage:true});
   await review.click();const finalize=dialog.getByRole('button',{name:locale==='th'?'ยืนยันการจัดสรร':'Finalize allocation',exact:true});await finalize.waitFor();
   await dialog.locator('input[type=checkbox]').check();await finalize.click();await page.waitForFunction(()=>window.context.current.status==='finalized'&&!document.querySelector('[role=dialog] [aria-busy=true]'));
   for(const select of await dialog.locator('select').all())assert.equal(await select.isDisabled(),true);assert.equal(await page.evaluate(()=>window.calls.length),4);
   await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await open.evaluate(el=>el===document.activeElement),true);
  }
  for(const mode of ['readonly','partial']){await page.goto(url+'?'+mode);await page.locator('button[lang=en]').click();await page.getByRole('button',{name:'Review allocation',exact:true}).click();const d=page.getByRole('dialog');await d.waitFor();
   if(mode==='readonly'){assert.equal(await d.getByRole('button',{name:'Save allocation draft',exact:true}).count(),0);for(const s of await d.locator('select').all())assert.equal(await s.isDisabled(),true);}
   else {assert.equal(await d.locator('select').count(),0);assert.match(await d.innerText(),/no automatic proration/);}
   assert.equal(await page.evaluate(()=>window.calls.length),0);
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({pass:true,widths:[390,768,1024,1440],locales:['th','en'],artifacts:out}));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);console.error('Artifacts:',out);process.exitCode=1;});
