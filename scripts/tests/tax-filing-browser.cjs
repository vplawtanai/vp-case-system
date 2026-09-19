/* eslint-disable @typescript-eslint/no-require-imports */
// Real React/CSS and unchanged AppTopNav; local synthetic RPCs only.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {fixture,monthlyFixture}=require('./tax-filing-fixture.cjs'),{adapter:taxAdapter}=require('./tax-dashboard-fixture.cjs'),root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vp-tax-filing-browser-'));
const write=(name,text)=>{const p=path.join(out,name);fs.writeFileSync(p,text);return p;};
const adapter=write('adapter.js',`window.calls=[];window.fail=null;window.monthly=${JSON.stringify(monthlyFixture())};if(location.search.includes('readfail'))window.monthly.fail=true;const reader=(${taxAdapter.toString()})(window.monthly);window.readCalls=reader.calls;window.data=location.search.includes('future')?${JSON.stringify(fixture(true))}:${JSON.stringify(fixture())};if(location.search.includes('readonly')){window.data.can_manage=false;window.data.can_remit=false;}
export const supabase={auth:{async getUser(){return{data:{user:{id:'synthetic'}}}},async signOut(){throw Error('Blocked')}},from(name){if(name!=='user_profiles')return reader.client.from(name);return{select(){return this},eq(){return this},async single(){return{data:{role:location.search.includes('readonly')?'partner':'admin'}}}}},async rpc(name,p){window.calls.push({name,p});await new Promise(r=>setTimeout(r,30));const d=window.data;
if(name==='get_finance_tax_filings')return{data:structuredClone(d)};if(!d.can_manage)throw Error('Readonly');if(window.fail){const message=window.fail;window.fail=null;return{error:{message}};}
if(name==='create_finance_tax_filing'){const pool=d.pools.find(x=>x.filing_type===p.p_type);if(pool.fingerprint!==p.p_expected_fingerprint)throw Error('Changed');d.filings.push({id:p.p_id,period_month:p.p_month,filing_type:p.p_type,status:'draft',version:1,tax_amount:pool.tax_amount,base_amount:pool.base_amount,due_date:p.p_due_date,source_snapshot_json:structuredClone(pool),source_changed:false,remittance:null,audit:[]});return{data:p.p_id};}
const f=d.filings.find(x=>x.id===p.p_id||x.id===p.p_filing_id||x.remittance?.id===p.p_id);
if(name==='transition_finance_tax_filing'){if(!p.p_acknowledged||f.version!==p.p_version)throw Error('Missing ack/stale');if(p.p_action!=='cancelled'&&!f.source_snapshot_json.ready)throw Error('VAT blocked');Object.assign(f,{status:p.p_action,version:f.version+1,filed_on:p.p_filed_on,external_reference:p.p_reference,filing_evidence:p.p_evidence});if(p.p_action==='filed')d.history=[{...f,payment_state:'awaiting_payment'}];return{data:f.id};}
if(name==='create_finance_tax_remittance'){f.remittance={id:p.p_id,status:'draft',version:1,amount:f.tax_amount,paid_on:p.p_paid_on,external_reference:p.p_reference,payment_evidence:p.p_evidence,draft_snapshot_json:{account:p.p_expected_account,amount_due:f.tax_amount}};return{data:p.p_id};}
if(name==='transition_finance_tax_remittance'){if(!p.p_acknowledged)throw Error('No acknowledgement');f.remittance.status=p.p_action;d.history[0].payment_state='remitted';return{data:p.p_id};}throw Error('Forbidden RPC '+name);}};`);
const navigation=write('navigation.js',"export const usePathname=()=>'/finance/tax-position/filings';export const useRouter=()=>({replace(){throw Error('Unexpected navigation')},refresh(){}});");
const link=write('link.js',`import React from'react';export default function Link({children,...props}){return React.createElement('a',props,children)}`);
const loader=write('loader.cjs',`module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix=require('node:path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(prefix)+'+k})};'}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);
const entry=write('entry.tsx',`import React from'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider.tsx';import{buildPermissions}from'${root}/lib/permissions.ts';import AppTopNav from'${root}/app/components/AppTopNav.tsx';import TaxModuleNav from'${root}/app/finance/tax-position/module-nav.tsx';import{TaxFilingWorkspace}from'${root}/app/finance/tax-position/filings/workspace.tsx';createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale="th" pathname="/finance/tax-position/filings"><AppTopNav title="VP Case System" activePage="finance"/><main style={{maxWidth:1400,margin:'0 auto',padding:24}}><TaxModuleNav active="filings"/><TaxFilingWorkspace permissions={buildPermissions({role:location.search.includes('readonly')?'partner':'admin'})}/></main></UiLocaleProvider>);`);
async function main(){
 await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',context:root,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[root+'/node_modules'],alias:{'next/navigation':navigation,'next/link':link,[root+'/lib/supabase']:adapter}},module:{rules:[{test:/\.(tsx?|css)$/,use:loader}]},devtool:false},(e,s)=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));
 const css=['app/components/ui/vp-ui.module.css','app/components/DetailModal.module.css','app/finance/tax-position/filings/filings.module.css','app/components/LanguageSelector.module.css','app/finance/finance-sidebar.module.css'].map(file=>{const prefix=path.basename(file).replaceAll('.','_')+'_';return fs.readFileSync(root+'/'+file,'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,key)=>'.'+prefix+key);}).join('\n');
 const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(out+'/bundle.js'));}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#182b45}button,input,select{font-family:inherit}${css}</style><div id="root"></div><script src="/bundle.js"></script></html>`);});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});let browser;
 try{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external.push(r.request().url());return r.abort();});
  require('./receipt-render-fixture.cjs');const {translate}=require('../../lib/i18n/catalog.ts'),url='http://127.0.0.1:'+server.address().port;
  const count=name=>page.evaluate(name=>window.calls.filter(c=>c.name===name).length,name);
  async function geometry(){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(await page.locator('main button,main select,main dd,main [data-metric]').evaluateAll(nodes=>nodes.filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.textContent)),[]);}
  for(const width of [1440,1024,768,390])for(const locale of ['th','en']){
   const t=k=>translate(locale,'taxFiling.'+k);await page.setViewportSize({width,height:1000});
   for(const future of [false,true]){
    await page.goto(url+(future?'?future':''));await page.locator('button[lang='+locale+']').first().click();await page.getByRole('heading',{name:t('history'),exact:true}).waitFor();if(await page.getByLabel(t('period'),{exact:true}).inputValue()!=='2026-09'){await page.getByLabel(t('period'),{exact:true}).selectOption('2026-09');await page.getByRole('heading',{name:t('history'),exact:true}).waitFor();}
    assert.equal(await page.locator('pre:visible').count(),0);assert.equal(await page.evaluate(()=>window.calls.some(c=>c.name!=='get_finance_tax_filings')),false);
    await page.locator('[data-metric=net]').getByText(t('unknown'),{exact:true}).waitFor();await page.locator('[data-metric=outgoing]').getByText(future?'186.24 THB':'0.00 THB',{exact:true}).waitFor();
    await page.locator('[data-metric=periodStatus]').getByText(t('needs_review'),{exact:true}).waitFor();
    await page.locator('[data-metric=incoming]').getByText('560.19 THB',{exact:true}).waitFor();
    const summary=page.getByRole('complementary',{name:t('summary'),exact:true});await summary.getByText('700.00 THB',{exact:true}).waitFor();await summary.getByText('560.19 THB',{exact:true}).waitFor();
    await page.locator('table').first().locator('tbody tr').first().locator('td').nth(2).getByText(t('unknown'),{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.data.incoming_wht_credit),0);assert.equal(await page.evaluate(()=>window.data.pools[0].output_vat),0);
    if(!future){assert.equal(await page.getByText(t('whtReviewed'),{exact:true}).count(),0);await page.getByRole('complementary').getByText(t('noWht'),{exact:true}).waitFor();}
    assert.equal(await page.getByRole('button',{name:t('review'),exact:true}).count(),future?4:2);
    await page.locator('table').first().getByText(t('inputReview'),{exact:true}).waitFor();
    await summary.getByText(t('creditHelp'),{exact:true}).waitFor();
    const history=page.getByRole('region',{name:t('history'),exact:true}),filings=page.getByRole('region',{name:t('filings'),exact:true});
    await history.getByText(t('emptyHistory'),{exact:true}).waitFor();await history.getByText(t('historyHelp'),{exact:true}).waitFor();assert.equal(await history.locator('tbody tr').count(),0);
    const boxes=await Promise.all([filings.boundingBox(),summary.boundingBox(),history.boundingBox()]);
    if(width>=1200){assert.ok(boxes[1].x>=boxes[0].x+boxes[0].width);assert.ok(Math.abs(boxes[0].y-boxes[1].y)<2);assert.equal(boxes[0].x,boxes[2].x);}
    else assert.ok(boxes[2].y>=boxes[1].y+boxes[1].height,'Mobile history follows summary');
    assert.equal(await page.locator('main').getByRole('button',{name:t('saveDraft'),exact:true}).count(),0,'No direct lifecycle actions on overview');
    await geometry();await page.screenshot({path:out+`/${future?'future':'current'}-${locale}-${width}.png`,fullPage:true});
    if(!future&&width===1440){await history.screenshot({path:out+`/history-${locale}.png`});await summary.screenshot({path:out+`/summary-${locale}.png`});}
    const reviews=page.getByRole('button',{name:t('review'),exact:true}),action=reviews.nth(future?1:0);await action.focus();await page.keyboard.press('Enter');const modal=page.getByRole('dialog');await modal.waitFor();assert.equal(await modal.locator('pre:visible').count(),0);assert.equal(await page.evaluate(()=>window.calls.some(c=>c.name!=='get_finance_tax_filings')),false,'Review is read-only');await page.keyboard.press('Tab');assert.equal(await modal.locator(':focus').count(),1);await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});assert.ok(await action.evaluate(e=>e===document.activeElement));
    await action.click();
    if(!future){
     await modal.getByRole('heading',{name:t('vatReviewTitle'),exact:true}).waitFor();
     await modal.getByText('700.00 THB',{exact:true}).waitFor();await modal.getByText('560.19 THB',{exact:true}).waitFor();
     for(const key of ['incomplete','unknown','vatNotReady','vatInputBlockReason','notCollected','monthlyOutputKnown','noWht','vatCreditHelp','vatDraftHelp'])await modal.getByText(t(key),{exact:true}).first().waitFor();
     assert.equal(await modal.getByText(translate(locale,'taxFiling.sourceCount',{count:0}),{exact:true}).count(),0);
     assert.equal(await modal.getByRole('button',{name:t('recordFiled'),exact:true}).count(),0);
     const technical=modal.locator('details').filter({has:page.locator('summary').getByText(t('technical'),{exact:true})});
     assert.equal(await technical.getAttribute('open'),null);assert.equal(await technical.locator('pre').isVisible(),false);
     const raw=await technical.locator('pre').textContent();assert.equal(raw,await page.evaluate(()=>JSON.stringify(window.data.pools[0],null,2)));
     await technical.locator('summary').focus();await page.keyboard.press('Enter');await technical.locator('pre').waitFor({state:'visible'});assert.equal(await technical.locator('pre').textContent(),raw);
     await page.keyboard.press('Space');assert.equal(await technical.locator('pre').isVisible(),false);
     const dueSection=modal.locator('details').filter({has:page.locator('summary').filter({hasText:t('dueOptional')})});
     assert.equal(await dueSection.getAttribute('open'),null);await dueSection.getByText(t('dueNotSet'),{exact:true}).waitFor();
     assert.equal(await modal.getByLabel(t('due'),{exact:true}).isVisible(),false);assert.equal(await modal.getByLabel(t('due'),{exact:true}).getAttribute('required'),null);
     await dueSection.locator('summary').focus();await page.keyboard.press('Enter');await modal.getByLabel(t('due'),{exact:true}).fill('2026-10-23');
     assert.notEqual(await modal.getByLabel(t('dueEvidence'),{exact:true}).getAttribute('required'),null);
     await dueSection.locator('summary').click();await modal.getByRole('button',{name:t('saveForReview'),exact:true}).click();assert.equal(await count('create_finance_tax_filing'),0);
     assert.ok(await modal.getByLabel(t('dueEvidence'),{exact:true}).isVisible(),'Invalid optional-date evidence reopens its section');
     await modal.getByLabel(t('due'),{exact:true}).fill('');await dueSection.locator('summary').click();
     await modal.locator('button').first().focus();await page.keyboard.press('Shift+Tab');assert.ok(await technical.locator('summary').evaluate(e=>e===document.activeElement));await page.keyboard.press('Tab');assert.ok(await modal.locator('button').first().evaluate(e=>e===document.activeElement));
     await modal.locator('form').evaluate(form=>{form.parentElement.scrollTop=0;});await modal.screenshot({path:out+`/vat-review-${locale}-${width}.png`});
     assert.equal(await page.evaluate(()=>window.calls.some(c=>c.name!=='get_finance_tax_filings')),false,'Opening/reviewing/date editing never creates a real or fixture Draft');
    }
    await modal.getByRole('button',{name:t(future?'saveDraft':'saveForReview'),exact:true}).click();await modal.waitFor({state:'hidden'});await action.click();await page.getByLabel(t('reviewAck'),{exact:true}).check();
    if(!future){
     assert.ok(await modal.getByRole('button',{name:t('markReady'),exact:true}).isDisabled());assert.equal(await modal.getByRole('button',{name:t('recordFiled'),exact:true}).count(),0);assert.equal(await count('transition_finance_tax_filing'),0);assert.equal(await count('create_finance_tax_remittance'),0);assert.equal(await page.evaluate(()=>window.calls.find(c=>c.name==='create_finance_tax_filing').p.p_due_date),null);
     assert.equal(await modal.locator('pre:visible').count(),0,'Technical evidence resets for saved Draft review');await page.keyboard.press('Escape');
     if(width===1440){
      // Synthetic stored states only: never call a live lifecycle or database.
      await page.evaluate(()=>{window.data.filings[0].status='ready_for_review';});await page.getByRole('button',{name:translate(locale,'common.actions.retry'),exact:true}).click();await action.click();
      assert.ok(await modal.getByRole('button',{name:t('recordFiled'),exact:true}).isDisabled());assert.equal(await count('transition_finance_tax_filing'),0);await page.keyboard.press('Escape');
      await page.evaluate(()=>{const f=window.data.filings[0];Object.assign(f,{status:'filed',tax_amount:123,filed_on:'2026-09-10',external_reference:'FROZEN-FIXTURE',filing_evidence:'Frozen fixture evidence'});window.data.history=[{...f,payment_state:'awaiting_payment'}];});await page.getByRole('button',{name:translate(locale,'common.actions.retry'),exact:true}).click();
      await history.getByRole('button',{name:t('details'),exact:true}).click();await modal.getByText('123.00 THB',{exact:true}).waitFor();assert.equal(await modal.getByText('700.00 THB',{exact:true}).count(),0,'Filed evidence is not replaced with live monthly facts');assert.equal(await modal.getByText('560.19 THB',{exact:true}).count(),0);assert.equal(await modal.getByRole('button',{name:t('payment'),exact:true}).count(),0);await page.keyboard.press('Escape');
     }
     continue;
    }
    await modal.getByRole('button',{name:t('markReady'),exact:true}).click();await modal.waitFor({state:'hidden'});await action.click();await modal.getByRole('button',{name:t('recordFiled'),exact:true}).click();
    await modal.getByRole('button',{name:t('recordFiled'),exact:true}).click();assert.equal(await count('transition_finance_tax_filing'),1);await page.getByLabel(t('filedOn'),{exact:true}).fill('2026-09-10');await page.getByLabel(t('reference'),{exact:true}).fill('EXTERNAL-TEST');await page.getByLabel(t('evidence'),{exact:true}).fill('Synthetic filing evidence');await page.getByLabel(t('filingAck'),{exact:true}).check();await geometry();await page.screenshot({path:out+`/filing-review-${locale}-${width}.png`,fullPage:true});
    await modal.getByRole('button',{name:t('recordFiled'),exact:true}).click();await modal.waitFor({state:'hidden'});assert.equal(await count('create_finance_tax_remittance'),0);
    await action.click();await modal.getByRole('button',{name:t('payment'),exact:true}).click();await page.getByLabel(t('account'),{exact:true}).selectOption({label:'KBANK'});await page.getByLabel(t('paidOn'),{exact:true}).fill('2026-09-11');await page.getByLabel(t('reference'),{exact:true}).fill('EXTERNAL-PAYMENT');await page.getByLabel(t('evidence'),{exact:true}).fill('Synthetic payment evidence');await modal.getByRole('button',{name:t('paymentDraft'),exact:true}).click();await modal.waitFor({state:'hidden'});
    await action.click();await modal.getByRole('button',{name:t('paymentReview'),exact:true}).click();await modal.getByRole('button',{name:t('confirmPayment'),exact:true}).click();assert.equal(await count('transition_finance_tax_remittance'),0);await page.getByLabel(t('paymentAck'),{exact:true}).check();await geometry();await page.screenshot({path:out+`/payment-review-${locale}-${width}.png`,fullPage:true});
    await page.evaluate(()=>window.fail='TAX_FILING_ACCOUNT_CHANGED');await modal.getByRole('button',{name:t('confirmPayment'),exact:true}).click();await modal.getByText(t('changed'),{exact:true}).waitFor();await modal.getByRole('button',{name:t('confirmPayment'),exact:true}).click();await modal.waitFor({state:'hidden'});await page.getByText(t('remitted'),{exact:true}).first().waitFor();
   }
   await page.goto(url+'?future&readonly');await page.locator('button[lang='+locale+']').first().click();const action=page.getByRole('button',{name:t('review'),exact:true}).nth(1);await action.waitFor();await action.click();assert.equal(await page.getByRole('button',{name:t('saveDraft'),exact:true}).count(),0);await page.keyboard.press('Escape');
   if(width!==390){await page.locator('[data-app-sidebar]').hover();await page.getByRole('link',{name:translate(locale,'finance.nav.legacyLedger'),exact:true}).waitFor();assert.equal(await page.locator('a[aria-current="page"][href="/finance/tax-position"]').count(),1);}
   assert.equal(await page.evaluate(()=>window.calls.some(c=>c.name!=='get_finance_tax_filings')),false);
   await page.getByRole('button',{name:t('review'),exact:true}).first().click();
   assert.equal(await page.getByRole('dialog').getByText(t('technical'),{exact:true}).count(),0,'VAT technical evidence is Admin-only');
   assert.equal(await page.getByRole('dialog').getByRole('button',{name:t('saveForReview'),exact:true}).count(),0);await page.keyboard.press('Escape');
   await page.goto(url+'?readfail');await page.locator('button[lang='+locale+']').first().click();await page.getByRole('heading',{name:t('history'),exact:true}).waitFor();
   await page.locator('[data-metric=incoming]').getByText(t('unknown'),{exact:true}).waitFor();
   const output=page.getByRole('complementary').locator('dl>div').filter({has:page.locator('dt').getByText(t('output'),{exact:true})});assert.equal(await output.locator('dd').innerText(),t('unknown'));
   await page.getByRole('button',{name:t('review'),exact:true}).first().click();const unavailable=page.getByRole('dialog');await unavailable.getByText(t('monthlyOutputUnknown'),{exact:true}).waitFor();assert.equal(await unavailable.getByText('0.00 THB',{exact:true}).count(),0);assert.equal(await unavailable.getByText(t('monthlyOutputKnown'),{exact:true}).count(),0);await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>window.calls.some(c=>c.name!=='get_finance_tax_filings')),false);await geometry();console.log('PASS',locale,width);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({pass:true,artifacts:out,externalRequests:0}));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);console.error('Artifacts:',out);process.exitCode=1;});
