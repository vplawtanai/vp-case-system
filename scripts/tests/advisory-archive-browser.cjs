/* eslint-disable @typescript-eslint/no-require-imports */
// Read-only UI checks against the isolated 095 preview; no external requests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const targets=require('./fixtures/advisory-095-reviewed-targets.json');
const base=process.argv[2],out=process.argv[3]||'/private/tmp/advisory095-release-browser';
assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[],results=[];
 fs.mkdirSync(out,{recursive:true});
 try{for(const locale of ['th','en'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('dialog',async d=>{errors.push(d.message());await d.dismiss();});
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  const clean=async()=>{
   const body=await page.locator('body').innerText();assert.ok(!body.includes('ARCHIVED_CANARY'));
   for(const t of targets.targets)assert.ok(!body.includes(t.matter_no),t.matter_no);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'overflow '+locale+'/'+width+' '+page.url());
   assert.equal(await page.evaluate(()=>window.calls.some(c=>/write|archive_uat/i.test(c.name||''))),false);
  };
  await page.goto(base+'/advisory?locale='+locale);await page.locator('#advisory-results[aria-busy="false"]').waitFor();
  assert.equal(await page.evaluate(()=>window.lastArchiveResult.total),9);
  for(const n of targets.protected_numbers)assert.ok((await page.locator('body').innerText()).includes(n));
  await clean();await page.screenshot({path:path.join(out,`${locale}-${width}-matters.png`)});
  const search=page.locator('input').first();await search.fill('ADV-2026-023');
  await page.waitForFunction(()=>window.lastArchiveResult.total===0);await search.fill('');await page.waitForFunction(()=>window.lastArchiveResult.total===9);
  await page.locator('button[aria-controls="advisory-results"]').click();await page.locator('#advisory-results[aria-busy="false"]').waitFor();await clean();
  await page.getByRole('tab',{name:locale==='th'?'มุมมองลูกค้า':'Client view',exact:true}).click();
  await page.getByRole('button',{name:/ABC Trade Demo Contact/}).click();await page.getByRole('heading',{name:'ABC Trade',exact:true}).waitFor();
  await page.waitForFunction(()=>window.calls.some(c=>c.table==='advisory_operational_tasks'));await clean();
  await page.screenshot({path:path.join(out,`${locale}-${width}-client.png`)});
  for(const route of ['/dashboard','/calendar']){
   await page.goto(base+route+'?locale='+locale);
   await page.waitForFunction(()=>window.calls.some(c=>c.table==='advisory_operational_tasks'));
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await clean();
   assert.equal(await page.evaluate(()=>window.calls.some(c=>['advisory_matters','advisory_issue_tasks','advisory_issues','advisory_time_logs'].includes(c.table))),false,'no raw operational child reads');
   await page.screenshot({path:path.join(out,`${locale}-${width}-${route.slice(1)}.png`)});
  }
  results.push({locale,width,protected:9,archived:0,search:true,overdue:true,client:true,dashboard:true,calendar:true});await page.close();
 }assert.deepEqual(errors,[]);const report={results,errors,synthetic:true,productionMutation:false};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
