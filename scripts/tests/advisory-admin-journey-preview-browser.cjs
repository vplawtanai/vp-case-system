/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic localhost only. No Production requests or data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');void workspaceFixture;
const {journeyText:t}=require('../../app/admin/journey-templates/labels.ts');
const definition=require('./fixtures/advisory-admin-journey-preview.json');
const {chromium}=require('/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.argv[2],out=process.argv[3]||'/private/tmp/vp-admin-polish-seven';assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[],results=[];fs.mkdirSync(out,{recursive:true});try{
 for(const locale of ['th','en'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  const label=s=>s[locale==='th'?'name_th':'name_en'],nav=()=>page.getByRole('navigation').filter({has:page.getByRole('button',{name:'4. '+label(definition.stages[3]),exact:true})}),preview=()=>page.getByRole('region',{name:t(locale,'preview'),exact:true});
  async function shot(name){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(out,`${locale}-${width}-${name}.png`),fullPage:true});}
  await page.goto(base+'/admin/journey-templates?adminPolish&locale='+locale);await page.getByRole('button',{name:t(locale,'edit'),exact:true}).waitFor();await nav().getByRole('button').nth(3).click();assert.equal(await nav().locator('[aria-current=step]').innerText().then(x=>x.includes(label(definition.stages[3]))),true);
  assert.equal(await preview().locator('[data-route]').count(),3);await preview().getByText(t(locale,'returnTo')+' 4',{exact:false}).waitFor();await preview().getByText(t(locale,'opensOnChoice'),{exact:true}).waitFor();await shot('read');
  const previewHeight=await preview().evaluate(el=>el.getBoundingClientRect().height);if(width===1440)assert.ok(previewHeight<720,'focused preview should stay compact');
  await preview().getByRole('button',{name:'5. '+label(definition.stages[4]),exact:true}).click();assert.equal(await preview().locator('[data-route]').count(),1);await preview().getByText(t(locale,'returnTo')+' 4',{exact:false}).waitFor();await shot('return');
  await nav().getByRole('button').nth(3).click();await page.getByRole('button',{name:t(locale,'edit'),exact:true}).click();await nav().getByRole('button').nth(3).click();await page.locator('fieldset').first().getByRole('textbox').nth(locale==='th'?0:1).fill('Changed outcome');assert.match(await preview().locator('[data-route="execution:proceed"]').innerText(),/Changed outcome/);await page.locator('fieldset').first().getByRole('textbox').nth(locale==='th'?0:1).fill(label(definition.stages[3].outcomes[0]));
  assert.equal(await page.locator('fieldset').count(),3);await shot('edit');await page.getByRole('button',{name:t(locale,'cancel'),exact:true}).click();assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.api).length),0);
  results.push({locale,width,previewHeight,passed:true});await page.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors,productionAccess:false}));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
