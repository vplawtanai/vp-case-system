/* eslint-disable @typescript-eslint/no-require-imports */
// Real React controls with a closed synthetic adapter. Only loopback traffic is allowed.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vp-direct-money-browser-'));
const webpack=require('next/dist/compiled/webpack/webpack').webpack;
require('./receipt-render-fixture.cjs');
const {sample}=require('./direct-money.test.cjs'),{directTotals,directLineAmounts}=require('../../app/finance/direct-money/shared.ts');
const {translate}=require('../../lib/i18n/catalog.ts');
const {prepareDirectSourceEvidence}=require('../../app/finance/direct-money/source-evidence.ts');
const input=sample(),totals=directTotals(input.lines),id='10000000-0000-4000-8000-000000000047';
input.received_on='2026-01-01';
const record={...input,id,status:'draft',version:1,input_json:input,unclassified:false,lines_json:input.lines.map(l=>({...l,...directLineAmounts(l)})),wht_amount:totals.wht,vat_amount:totals.vat,amount_before_vat:totals.base,gross_amount:totals.gross,classification_json:null,confirmed_snapshot_json:null};
const evidenceInput=prepareDirectSourceEvidence({...input,client_id:'synthetic-client',case_id:47,lines:input.lines.map(l=>({...l,reason:''}))}).input;
const evidenceRecord={...record,...evidenceInput,input_json:evidenceInput,lines_json:evidenceInput.lines.map(l=>({...l,...directLineAmounts(l)}))};
const vpContext=require('./vp-distribution-fixture.cjs').fixture();
vpContext.source={schema_version:1,policy_version:'vp_distribution_v1',money_source:null,money_allocation:null,
 received_money_source:{schema_version:1,source_type:'direct_money_receipt',source_id:id,source_version:2,status:'confirmed',currency:'THB',actual_cash:10400,wht_credit:300,gross_received:10700},
 lines:record.lines_json.map(l=>({...l,professional_pool:9700,company_economic:0,company_cash:0})),totals:{cash:10400,wht:300,vat:700,base:10000,professional_pool:9700,company_economic:0,company_cash:0},blockers:[]};
const adapter=path.join(out,'adapter.js'),navigation=path.join(out,'navigation.js'),link=path.join(out,'link.js'),loader=path.join(out,'loader.cjs'),entry=path.join(out,'entry.tsx');
fs.writeFileSync(adapter,`
window.calls=[];window.reads=[];window.record=new URLSearchParams(location.search).has('provenance')?${JSON.stringify(evidenceRecord)}:${JSON.stringify(record)};window.fail=false;
window.vpContext=${JSON.stringify(vpContext)};
const mode=new URLSearchParams(location.search).get('mode');if(mode==='confirmed'||mode==='partner')window.record.status='confirmed';
if(new URLSearchParams(location.search).has('provenance')&&window.record.status==='confirmed')window.record.confirmed_snapshot_json={client:{id:'synthetic-client',name:'Frozen client name'}};
if(mode==='partner'){window.vpContext.can_manage=false;window.vpContext.formula_people=[];}
export const supabase={from(table){window.reads.push(table);let single=false;const q={select(){return q},eq(){return q},neq(){return q},order(){return q},range(){return q},single(){single=true;return q},then(resolve){
 let data;if(table==='clients')data=[{id:'synthetic-client',name:'Synthetic payer'}];
 else if(table==='finance_bank_accounts')data=[{id:'synthetic-bank',short_name:'SYN',bank_name:'Synthetic Bank'}];
 else if(table==='cases')data=[{id:47,client_id:'synthetic-client',title:'Synthetic matter',file_no:'LOCAL-47'}];
 else if(table==='advisory_matters'||table==='finance_payments')data=[];
 else if(table==='finance_direct_money_receipts')data=[structuredClone(window.record)];
 else if(table==='finance_direct_money_receipt_audit')data=[];
 else throw Error('Unexpected table '+table);
 return Promise.resolve({data:single?data[0]:data,error:null}).then(resolve);
 }};return q;},async rpc(name,p){
 if(name==='get_finance_direct_vp_formula_context')return {data:structuredClone(window.vpContext)};
 if(!['save_finance_direct_money_receipt','transition_finance_direct_money_receipt','classify_finance_direct_money_receipt','save_finance_direct_vp_distribution','transition_finance_vp_distribution'].includes(name))throw Error('Forbidden RPC '+name);
 window.calls.push({name,p:structuredClone(p)});await new Promise(r=>setTimeout(r,window.slow?500:60));
 if(window.fail){window.fail=false;return{error:{message:'DIRECT_MONEY_STALE'}};}
 if(name==='save_finance_direct_vp_distribution'){
  if(p.p_direct_id!==window.record.id||p.p_payment_id!==undefined)throw Error('Wrong source identity');
  window.vpContext.current={id:'synthetic-distribution',payment_id:null,direct_money_receipt_id:p.p_direct_id,version:1,revision:1,status:'draft',source_snapshot_json:p.p_source,decisions_json:p.p_choices,note:p.p_note,created_at:'2026-01-01T00:00:00Z'};
  window.vpContext.source_current=true;return{data:'synthetic-distribution'};
 }
 if(name==='transition_finance_vp_distribution'){
  if(!p.p_acknowledged||p.p_expected_version!==window.vpContext.current.version)throw Error('Transition guard');
  window.vpContext.current.status=({review:'reviewed',finalize:'finalized'})[p.p_action];window.vpContext.current.version++;return{data:'synthetic-distribution'};
 }
 if(name==='transition_finance_direct_money_receipt'){if(!p.p_acknowledged)throw Error('Missing acknowledgement');window.record.status=p.p_action==='confirm'?'confirmed':'reversed';window.record.version++;}
 return {data:p.p_id};}};
`);
fs.writeFileSync(navigation,"export const usePathname=()=>'/finance/direct-money/local';export const useRouter=()=>({push:p=>window.navigated=p});export const useParams=()=>({id:'local'});");
fs.writeFileSync(link,`import React from '${require.resolve('react')}';export default function Link({children,...props}){return React.createElement('a',props,children)}`);
fs.writeFileSync(loader,`module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix=require('node:path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(prefix)+'+k})};'}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);
fs.writeFileSync(entry,`import React from'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider.tsx';import{DirectMoneyForm}from'${root}/app/finance/direct-money/form.tsx';import{DirectMoneyDetail}from'${root}/app/finance/direct-money/[id]/page.tsx';import{DirectMoneyList}from'${root}/app/finance/direct-money/list.tsx';const query=new URLSearchParams(location.search),mode=query.get('mode'),initial=${JSON.stringify(input)};if(mode==='custom'){initial.cash_amount=10550;initial.lines[0].wht_base=5000;}createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale={query.get('locale')||'en'} pathname="/finance/direct-money/local">{mode==='list'?<DirectMoneyList/>:mode==='detail'||mode==='confirmed'||mode==='partner'?<DirectMoneyDetail id="${id}" canManage={mode!=='partner'}/>:<main><DirectMoneyForm initial={mode==='empty'?undefined:initial}/></main>}</UiLocaleProvider>);`);
async function main(){
 await new Promise((resolve,reject)=>webpack({mode:'development',context:root,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules')],alias:{'next/navigation':navigation,'next/link':link,[path.join(root,'lib/supabase')]:adapter}},module:{rules:[{test:/\.(tsx?|css)$/,use:loader}]},devtool:false},(error,stats)=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));
 const css=['app/finance/direct-money/direct-money.module.css','app/finance/finance-record-list.module.css','app/finance/payments/money-allocation.module.css','app/finance/payments/vp-distribution.module.css','app/components/DetailModal.module.css'].map(file=>{const prefix=path.basename(file).replaceAll('.','_')+'_';return fs.readFileSync(path.join(root,file),'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,key)=>'.'+prefix+key);}).join('\n');
 const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(out,'bundle.js')));return;}
  res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font:15px Arial,sans-serif}main{padding:16px;max-width:1160px;margin:auto}button{font:inherit}${css}</style><div id="root"></div><script src="/bundle.js"></script></html>`);});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});let browser;
 try{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();external.push(route.request().url());return route.abort();});
  const url='http://127.0.0.1:'+server.address().port;
  const visit=async(mode,locale='en',extra='')=>{await page.goto(url+'?mode='+mode+'&locale='+locale+extra);await page.waitForFunction(()=>window.record&&document.querySelector('input,table,dl'));await page.waitForTimeout(100);};
  async function geometry(){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   const overflow=await page.locator('input,select,textarea,button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&n.getBoundingClientRect().right>innerWidth+1).map(n=>n.outerHTML));assert.deepEqual(overflow,[]);}
  for(const width of [390,768,1024,1440])for(const locale of ['th','en'])for(const mode of ['form','detail','list']){
   await page.setViewportSize({width,height:1000});await visit(mode,locale);await geometry();
   await page.screenshot({path:path.join(out,`${mode}-${locale}-${width}.png`),fullPage:true});
  }
  for(const width of [390,768,1024,1440])for(const locale of ['th','en'])for(const mode of ['detail','confirmed']){
   await page.setViewportSize({width,height:1000});await visit(mode,locale,'&provenance=1');
   const evidence=page.locator('div[class$="_provenance"]'),technical=evidence.locator('details'),raw=technical.locator('pre');
   const before=await page.evaluate(()=>JSON.stringify(window.record));
   assert.ok((await evidence.innerText()).includes(translate(locale,'directMoney.systemSource')));
   assert.ok((await evidence.innerText()).includes(mode==='detail'?'Synthetic payer':'Frozen client name'));
   assert.doesNotMatch(await evidence.innerText(),/System-derived direct-money provenance|source_line_id|synthetic-client/);
   assert.equal(await raw.isVisible(),false);assert.equal(await technical.getAttribute('open'),null);
   assert.equal(await raw.textContent(),evidenceInput.lines[0].reason);await geometry();
   await page.screenshot({path:path.join(out,`provenance-${mode}-${locale}-${width}.png`),fullPage:true});
   await technical.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await raw.isVisible(),true);await geometry();
   assert.equal(await raw.textContent(),evidenceInput.lines[0].reason);await page.keyboard.press('Enter');assert.equal(await raw.isVisible(),false);
   assert.equal(await page.evaluate(()=>JSON.stringify(window.record)),before);assert.deepEqual(await page.evaluate(()=>window.calls),[]);
   if(mode==='confirmed')assert.equal(await page.evaluate(()=>window.reads.includes('clients')),false,'confirmed names never load mutable Client master');
  }
  for(const width of [390,768,1024,1440])for(const locale of ['th','en']){
   const t=key=>translate(locale,'directMoney.'+key),field=key=>page.getByLabel(t(key),{exact:true});
   const vat=page.getByRole('radiogroup',{name:t('vatQuick'),exact:true}),wht=page.getByRole('radiogroup',{name:t('whtQuick'),exact:true});
   const chooseVat=name=>vat.getByRole('radio',{name,exact:true}).check(),chooseWht=name=>wht.getByRole('radio',{name,exact:true}).check();
   const matches=()=>page.locator('[aria-live=polite]').getByText(t('matched'),{exact:true}).isVisible();
   await page.setViewportSize({width,height:1000});await visit('empty',locale);
   assert.equal(await field('nature').inputValue(),'unclassified');assert.equal(await page.locator('input[type=radio]:checked').count(),0);
   assert.equal(await field('method').inputValue(),'bank_transfer');
   assert.equal(await page.getByRole('button',{name:t('removeLine')+' 1',exact:true}).isDisabled(),true);
   assert.equal(await field('note').isVisible(),false);assert.equal(await field('reference').isVisible(),false);
   assert.equal(await field('additionalSource').count(),0);
   assert.equal(await page.getByText(t('matched'),{exact:true}).count(),0);
   assert.equal(await page.getByText(t('classificationWarning'),{exact:true}).isVisible(),true);
   assert.doesNotMatch(await page.locator('form').innerText(),/Actual cash|อยู่ในระบบ VAT|ก่อนออกเอกสาร|before issuing a document/);
   assert.equal(await page.locator('dt').filter({hasText:/^(Cash|เงินสด)$/}).count(),0);
   const optional=page.getByText(t('optional'),{exact:true});await optional.focus();await page.keyboard.press('Enter');assert.equal(await field('note').isVisible(),true);
   assert.ok(await optional.evaluate(n=>getComputedStyle(n).outlineStyle!=='none'));await page.keyboard.press('Enter');assert.equal(await field('note').isVisible(),false);
   await geometry();await page.screenshot({path:path.join(out,`create-empty-${locale}-${width}.png`),fullPage:true});
   // A real user types only the money that arrived. No backwards arithmetic input.
   await field('actualCash').fill('10400');await chooseVat('7%');await chooseWht('3%');
   assert.equal(await matches(),true);assert.equal(await field('nature').inputValue(),'unclassified');
   assert.equal(await field('vatRate').count(),0);assert.equal(await field('whtRate').count(),0);assert.equal(await field('whtBase').count(),0);
   assert.equal(await field('amountBeforeTax').count(),0);assert.equal(await field('base').count(),0);
   assert.equal(await page.locator('form input[type=number]').count(),1);
   const calculation=page.locator('dl[class$="_calculation"]');for(const value of ['10,000.00','700.00','10,700.00','300.00','10,400.00'])assert.ok((await calculation.innerText()).includes(value));
   await field('nature').selectOption('business_revenue');assert.equal(await field('classification').inputValue(),'');await field('classification').selectOption('professional_fee');
   await field('client').selectOption('synthetic-client');await field('description').fill('ค่าบังคับคดี');
   assert.equal(await field('additionalSource').count(),0);assert.equal(await page.getByText(t('derivedSource'),{exact:true}).isVisible(),true);
   assert.equal(await matches(),true);assert.equal(await vat.getByRole('radio',{name:'7%',exact:true}).isChecked(),true);
   await geometry();await page.screenshot({path:path.join(out,`actual-only-7-3-${locale}-${width}.png`),fullPage:true});
   await vat.getByRole('radio',{name:'7%',exact:true}).focus();await page.keyboard.press('ArrowRight');
   assert.equal(await vat.getByRole('radio',{name:'0%',exact:true}).isChecked(),true);
   assert.ok(await page.locator('input[type=radio]:focus').evaluate(n=>getComputedStyle(n.parentElement).outlineStyle!=='none'));
   assert.equal(await field('vatReason').isVisible(),true);await field('vatReason').fill('Explicit zero-rate evidence');
   await chooseWht(t('noWht'));await field('actualCash').fill('10000');assert.equal(await matches(),true);
   await chooseVat(t('noVat'));assert.equal(await field('vatTreatment').inputValue(),'unknown');
   assert.equal(await matches(),false);
   for(const treatment of ['exempt','outside_scope','disbursement','pass_through']){
    await field('vatTreatment').selectOption(treatment);await field('vatReason').fill('Explicit non-VAT evidence');assert.equal(await matches(),true);await geometry();
   }
   await chooseWht('3%');await field('actualCash').fill('9700');assert.equal(await matches(),true);
   await chooseVat('7%');await chooseWht(t('noWht'));await field('actualCash').fill('10700');assert.equal(await matches(),true);
   for(const rate of [1,2,3,5]){await chooseWht(rate+'%');await field('actualCash').fill(String(10700-100*rate));assert.equal(await matches(),true);}
   await chooseWht(t('taxOther'));await field('whtRate').fill('1.25');await chooseVat(t('taxOther'));
   await field('vatRate').fill('10');await field('actualCash').fill('10875');assert.equal(await matches(),true);
   assert.equal(await field('additionalSource').isVisible(),true);assert.equal(await page.getByText(t('evidenceTax'),{exact:true}).isVisible(),true);
   await geometry();await page.screenshot({path:path.join(out,`custom-tax-${locale}-${width}.png`),fullPage:true});
   await chooseVat('7%');await chooseWht('3%');await field('actualCash').fill('10400');assert.equal(await matches(),true);
   await field('date').fill('2026-01-01');await field('account').selectOption('synthetic-bank');
   assert.equal(await field('additionalSource').count(),0);
   await page.getByRole('button',{name:t('save'),exact:true}).click();await page.waitForFunction(()=>window.navigated);
   const normal=await page.evaluate(()=>window.calls[0].p.p_input);assert.equal(normal.lines[0].description,'ค่าบังคับคดี');assert.match(normal.lines[0].reason,/^System-derived direct-money provenance v1:/);
   assert.equal(normal.lines[0].base,10000);assert.equal(normal.cash_amount,10400);assert.equal(normal.lines[0].wht_base,10000);assert.equal(normal.lines[0].wht_rate,3);
   await page.evaluate(()=>{window.calls=[];window.navigated=null;});
   await field('client').selectOption('');await field('description').fill('');
   assert.equal(await field('additionalSource').isVisible(),true);assert.equal(await page.getByText(t('evidenceContext'),{exact:true}).isVisible(),true);
   await field('description').fill('ค่าบังคับคดี');
   await page.getByRole('button',{name:t('save'),exact:true}).click();assert.equal(await page.evaluate(()=>window.calls.length),0);
   await page.waitForFunction(()=>document.activeElement?.tagName==='TEXTAREA');assert.equal(await field('additionalSource').evaluate(n=>n===document.activeElement),true);
   assert.equal(await field('additionalSource').inputValue(),'');await field('additionalSource').fill('Explicit business source');assert.equal(await field('additionalSource').getAttribute('aria-invalid'),'false');
   await field('additionalSource').fill('');await field('client').selectOption('synthetic-client');assert.equal(await field('additionalSource').count(),0);
   await page.getByRole('button',{name:t('addLine'),exact:true}).click();
   const deletes=page.getByRole('button',{name:new RegExp(t('removeLine'))});assert.equal(await deletes.count(),2);assert.equal(await deletes.nth(0).isEnabled(),true);
   assert.equal(await field('nature').nth(1).inputValue(),'unclassified');await field('nature').nth(1).selectOption('client_money');assert.equal(await field('classification').count(),1);
   assert.equal(await field('additionalSource').isVisible(),true);assert.equal(await page.getByText(t('evidenceNonRevenue'),{exact:true}).isVisible(),true);
   await field('actualCash').fill('12400');assert.equal(await field('lineActual').count(),1);assert.equal(await field('lineActual').inputValue(),'10400');
   await vat.nth(1).getByRole('radio',{name:t('noVat'),exact:true}).check();await field('vatTreatment').selectOption('outside_scope');await field('vatReason').fill('Explicit client-money evidence');
   await wht.nth(1).getByRole('radio',{name:t('noWht'),exact:true}).check();assert.equal(await matches(),true);
   assert.equal(await page.locator('form input[type=number]').count(),2,'total and first-line cash only; last line is derived');
   assert.ok((await calculation.nth(1).innerText()).includes('2,000.00'));
   await geometry();await page.screenshot({path:path.join(out,`multi-line-${locale}-${width}.png`),fullPage:true});
   await field('lineActual').fill('13000');assert.equal(await matches(),false);
   await page.getByRole('button',{name:t('save'),exact:true}).click();assert.equal(await page.evaluate(()=>window.calls.length),0);
   assert.equal(await page.getByText(t('error.allocationInvalid'),{exact:true}).isVisible(),true);
   await field('lineActual').fill('10400');assert.equal(await matches(),true);
   await deletes.nth(1).click();assert.equal(await deletes.count(),1);assert.equal(await deletes.isDisabled(),true);await field('actualCash').fill('10400');assert.equal(await matches(),true);
   await field('client').selectOption('synthetic-client');await optional.click();await field('matter').selectOption('case:47');
   await field('reference').fill('LOCAL-OPTIONAL');await field('evidence').fill('local-slip-reference');await field('note').fill('Synthetic optional note');
   await optional.click();assert.equal(await field('note').isVisible(),false);
   await page.getByText(t('accountingEvidence'),{exact:true}).click();assert.equal(await page.getByText(t('matched'),{exact:true}).count(),3);
   await geometry();await page.getByText(t('accountingEvidence'),{exact:true}).click();
   await page.screenshot({path:path.join(out,`create-reviewed-${locale}-${width}.png`),fullPage:true});
   await page.getByRole('button',{name:t('save'),exact:true}).click();await page.waitForFunction(()=>window.navigated);
   const calls=await page.evaluate(()=>window.calls);assert.equal(calls.length,1);const p=calls[0].p.p_input;
   assert.equal(calls[0].name,'save_finance_direct_money_receipt');assert.equal(p.reference_no,'LOCAL-OPTIONAL');assert.equal(p.evidence_reference,'local-slip-reference');assert.equal(p.note,'Synthetic optional note');
   assert.equal(p.client_id,'synthetic-client');assert.equal(p.case_id,47);assert.equal(p.cash_amount,10400);assert.equal(p.lines[0].base,10000);
   assert.equal(p.lines[0].vat_rate,7);assert.equal(p.lines[0].wht_rate,3);assert.equal(p.lines[0].wht_base,10000);assert.equal(p.lines[0].money_nature,'business_revenue');
   assert.match(p.lines[0].reason,/^System-derived direct-money provenance v1:/);assert.match(p.lines[0].reason,/"case_id":47/);
  }
  // An explicit incomplete VAT choice cannot reach the backend, including unclassified money.
  await visit('form');await page.getByLabel(translate('en','directMoney.nature'),{exact:true}).selectOption('unclassified');
  await page.getByRole('radiogroup',{name:'VAT',exact:true}).getByRole('radio',{name:'Other',exact:true}).check();
  await page.getByLabel(translate('en','directMoney.vatRate'),{exact:true}).fill('0');
  await page.getByLabel(translate('en','directMoney.actualCash'),{exact:true}).fill('9700');
  await page.getByRole('button',{name:translate('en','directMoney.save'),exact:true}).click();
  assert.equal(await page.evaluate(()=>window.calls.length),0);assert.equal(await page.getByLabel(translate('en','directMoney.vatRate'),{exact:true}).getAttribute('aria-invalid'),'true');
  assert.equal(await page.getByText(translate('en','directMoney.error.vatPositiveRate'),{exact:true}).isVisible(),true);
  assert.equal(await page.getByLabel(translate('en','directMoney.vatReason'),{exact:true}).count(),0);
  await page.getByRole('radiogroup',{name:'VAT',exact:true}).getByRole('radio',{name:'No VAT',exact:true}).check();
  await page.getByRole('button',{name:translate('en','directMoney.save'),exact:true}).click();assert.equal(await page.evaluate(()=>window.calls.length),0);
  await page.getByLabel(translate('en','directMoney.vatTreatment'),{exact:true}).selectOption('exempt');
  await page.getByLabel(translate('en','directMoney.actualCash'),{exact:true}).fill('9700');
  await page.getByRole('button',{name:translate('en','directMoney.save'),exact:true}).click();
  assert.equal(await page.evaluate(()=>window.calls.length),0);assert.equal(await page.getByLabel(translate('en','directMoney.vatTreatment'),{exact:true}).getAttribute('aria-invalid'),'true');
  await page.getByLabel(translate('en','directMoney.vatReason'),{exact:true}).fill('Explicit reviewed exemption');
  assert.equal(await page.getByLabel(translate('en','directMoney.vatTreatment'),{exact:true}).getAttribute('aria-invalid'),'false');
  await page.getByRole('button',{name:translate('en','directMoney.save'),exact:true}).click();await page.waitForFunction(()=>window.navigated);
  assert.equal(await page.evaluate(()=>window.calls[0].p.p_input.lines[0].money_nature),'unclassified');
  await visit('empty');await page.getByRole('button',{name:translate('en','directMoney.save'),exact:true}).click();
  assert.equal(await page.locator('[role=alert]').count(),1);assert.equal(await page.evaluate(()=>window.calls.length),0);
  await page.waitForFunction(()=>document.activeElement?.getAttribute('type')==='date');
  assert.equal(await page.locator(':focus').getAttribute('type'),'date');assert.ok(await page.locator('[aria-invalid=true]').count()>=5);
  await visit('form');const save=page.getByRole('button',{name:translate('en','directMoney.save'),exact:true});await save.click();await page.waitForFunction(()=>window.navigated);
  assert.equal(await page.evaluate(()=>window.calls.length),1);const payload=await page.evaluate(()=>window.calls[0]);assert.equal(payload.name,'save_finance_direct_money_receipt');assert.deepEqual(payload.p.p_input,input);
  await visit('custom');assert.equal(await page.getByLabel(translate('en','directMoney.whtBase'),{exact:true}).inputValue(),'5000');
  assert.equal(await page.getByLabel(translate('en','directMoney.whtBase'),{exact:true}).isVisible(),true);
  assert.equal(await page.evaluate(()=>window.calls.length),0);
  await page.getByRole('button',{name:translate('en','directMoney.save'),exact:true}).click();await page.waitForFunction(()=>window.navigated);
  assert.deepEqual(await page.evaluate(()=>window.calls[0].p.p_input),{...input,cash_amount:10550,lines:[{...input.lines[0],wht_base:5000}]});
  // Explicit custom bases remain authoritative when the amount or rate changes.
  await visit('form');await page.getByText(translate('en','directMoney.advancedTax'),{exact:true}).click();
  await page.getByLabel(translate('en','directMoney.customWhtBase'),{exact:true}).check();
  const customBase=page.getByLabel(translate('en','directMoney.whtBase'),{exact:true});await customBase.fill('5000');
  await page.getByLabel(translate('en','directMoney.actualCash'),{exact:true}).fill('12690');assert.equal(await customBase.inputValue(),'5000');
  await page.getByRole('radiogroup',{name:'WHT',exact:true}).getByRole('radio',{name:'5%',exact:true}).check();assert.equal(await customBase.inputValue(),'5000');
  await page.getByLabel(translate('en','directMoney.actualCash'),{exact:true}).fill('12590');
  assert.equal(await page.locator('[aria-live=polite]').getByText(translate('en','directMoney.matched'),{exact:true}).isVisible(),true);
  await page.getByRole('button',{name:translate('en','directMoney.save'),exact:true}).click();await page.waitForFunction(()=>window.navigated);
  const customInput=await page.evaluate(()=>window.calls[0].p.p_input);assert.equal(customInput.lines[0].wht_base,5000);assert.equal(customInput.lines[0].wht_rate,5);
  assert.equal(customInput.lines[0].base,12000);
  // Advanced evidence never changes the actual money or bypasses reconciliation.
  await visit('form');await page.getByText(translate('en','directMoney.advancedTax'),{exact:true}).click();
  await page.getByLabel(translate('en','directMoney.manualTaxEvidence'),{exact:true}).check();
  await page.getByLabel(translate('en','directMoney.base'),{exact:true}).fill('10001');
  await page.getByRole('button',{name:translate('en','directMoney.save'),exact:true}).click();assert.equal(await page.evaluate(()=>window.calls.length),0);
  assert.equal(await page.getByLabel(translate('en','directMoney.actualCash'),{exact:true}).inputValue(),'10400');
  assert.equal(await page.getByText(translate('en','directMoney.error.reverseUnresolved'),{exact:true}).isVisible(),true);
  await visit('form');await page.getByRole('radiogroup',{name:'WHT',exact:true}).getByRole('radio',{name:'None',exact:true}).check();
  await page.getByLabel(translate('en','directMoney.actualCash'),{exact:true}).fill('0.08');
  await page.getByRole('button',{name:translate('en','directMoney.save'),exact:true}).click();assert.equal(await page.evaluate(()=>window.calls.length),0);
  assert.equal(await page.getByText(translate('en','directMoney.error.reverseUnresolved'),{exact:true}).isVisible(),true);
  await visit('detail');await page.getByRole('button',{name:translate('en','directMoney.edit'),exact:true}).click();await page.getByRole('dialog').waitFor();await geometry();
  assert.equal(await page.getByRole('dialog').getByLabel(translate('en','directMoney.payer'),{exact:true}).inputValue(),'Synthetic Payer');
  await page.evaluate(()=>window.slow=true);await page.getByRole('dialog').getByRole('button',{name:translate('en','directMoney.save'),exact:true}).click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').isVisible(),true);
  await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.calls.length),1);
  await visit('detail');await page.getByRole('button',{name:translate('en','directMoney.confirm'),exact:true}).click();assert.equal(await page.evaluate(()=>window.calls.length),0);assert.ok(await page.locator('[role=alert]').count());
  await page.getByLabel(translate('en','directMoney.ack'),{exact:true}).check();await page.getByRole('button',{name:translate('en','directMoney.confirm'),exact:true}).click();await page.waitForFunction(()=>window.record.status==='confirmed');
  assert.equal(await page.evaluate(()=>window.calls.length),1);
  for(const locale of ['th','en'])for(const width of [390,768,1024,1440]){
   await page.setViewportSize({width,height:1000});await visit('confirmed',locale);
   assert.equal(await page.getByRole('button',{name:translate(locale,'directMoney.edit'),exact:true}).count(),0);
   assert.equal(await page.getByRole('button',{name:translate(locale,'directMoney.confirm'),exact:true}).count(),0);
   await page.getByText(translate(locale,'directMoney.otherActions'),{exact:true}).click();
   const reverse=page.getByRole('button',{name:translate(locale,'directMoney.reverse'),exact:true});
   await reverse.click();assert.equal(await page.evaluate(()=>window.calls.length),0);
   await page.getByLabel(translate(locale,'directMoney.reverseReason'),{exact:true}).fill('Synthetic erroneous record correction');
   await reverse.click();assert.equal(await page.evaluate(()=>window.calls.length),0);
   await page.getByLabel(translate(locale,'directMoney.reverseAck'),{exact:true}).check();await geometry();
   const before=await page.evaluate(()=>({cash:window.record.cash_amount,lines:window.record.lines_json}));
   await reverse.click();await page.waitForFunction(()=>window.record.status==='reversed');
   const calls=await page.evaluate(()=>window.calls);assert.equal(calls.length,1);assert.equal(calls[0].name,'transition_finance_direct_money_receipt');
   assert.deepEqual(calls[0].p,{p_id:id,p_expected_version:1,p_action:'reverse',p_acknowledged:true,p_reason:'Synthetic erroneous record correction'});
   assert.deepEqual(await page.evaluate(()=>({cash:window.record.cash_amount,lines:window.record.lines_json})),before);
  }
  for(const locale of ['th','en'])for(const width of [390,768,1024,1440]){
   await page.setViewportSize({width,height:1000});await visit('confirmed',locale);
   await page.getByRole('button',{name:translate(locale,'directMoney.classify'),exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();await geometry();
   await dialog.getByRole('button',{name:translate(locale,'directMoney.classify'),exact:true}).click();assert.equal(await page.evaluate(()=>window.calls.length),0);assert.equal(await dialog.locator('[role=alert]').count(),1);
   await dialog.getByLabel(translate(locale,'directMoney.reason'),{exact:true}).fill('Synthetic reviewed classification');await dialog.getByLabel(translate(locale,'directMoney.classifyAck'),{exact:true}).check();
   await page.screenshot({path:path.join(out,`classification-${locale}-${width}.png`),fullPage:true});
   await dialog.getByRole('button',{name:translate(locale,'directMoney.classify'),exact:true}).click();await dialog.waitFor({state:'hidden'});
   const request=await page.evaluate(()=>window.calls[0]);assert.equal(request.name,'classify_finance_direct_money_receipt');assert.deepEqual(Object.keys(request.p.p_choices[0]).sort(),['classification','money_nature','source_line_id','vat_treatment_json']);
  }
  await visit('form');await page.evaluate(()=>window.fail=true);await page.getByRole('button',{name:translate('en','directMoney.save'),exact:true}).click();await page.locator('[role=alert]').waitFor();
  await page.getByRole('button',{name:translate('en','directMoney.save'),exact:true}).click();await page.waitForFunction(()=>window.navigated);assert.equal(await page.evaluate(()=>window.calls[0].p.p_id===window.calls[1].p.p_id),true);
  await visit('partner');assert.equal(await page.getByRole('button',{name:translate('en','directMoney.edit'),exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:translate('en','directMoney.reverse'),exact:true}).count(),0);
  for(const locale of ['th','en'])for(const width of [390,768,1024,1440]){
   await page.setViewportSize({width,height:1000});await visit('confirmed',locale);await page.getByRole('button',{name:translate(locale,'vpDistribution.open'),exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();
   await dialog.getByLabel(translate(locale,'vpFormula.select'),{exact:true}).selectOption('source_worker_qc');
   const recipients=dialog.getByLabel(translate(locale,'vpFormula.recipient'),{exact:true});for(let i=0;i<await recipients.count();i++)await recipients.nth(i).selectOption(vpContext.formula_people[i%2].id);
   await geometry();assert.equal(await dialog.locator('a[href*="/finance/invoices/"]').count(),0);assert.ok((await dialog.innerText()).includes('9,700.00'));
   await page.screenshot({path:path.join(out,`distribution-${locale}-${width}.png`),fullPage:true});
   await dialog.getByRole('button',{name:translate(locale,'vpDistribution.save'),exact:true}).click();await dialog.getByRole('button',{name:translate(locale,'vpDistribution.review'),exact:true}).waitFor();
   for(const action of ['review','finalize']){await dialog.getByLabel(translate(locale,'vpDistribution.ack'),{exact:true}).check();await dialog.getByRole('button',{name:translate(locale,'vpDistribution.'+action),exact:true}).click();await page.waitForFunction(status=>window.vpContext.current.status===status,action==='review'?'reviewed':'finalized');}
   const requests=await page.evaluate(()=>window.calls);assert.equal(requests.length,3);assert.equal(requests[0].p.p_choices[0].source_line_id,record.lines_json[0].source_line_id);assert.equal(requests[0].p.p_choices[0].invoice_item_id,undefined);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('Direct money TH/EN at 390/768/1024/1440: actual-money-only input, reverse VAT/WHT, automatic last-line remainder, over-allocation/rounding/manual-evidence blocking, saved custom-base preservation, keyboard focus; existing create/retry payload, busy edit modal, classification, shared distribution, confirm/reversal guards and Partner read-only passed. '+out);
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
