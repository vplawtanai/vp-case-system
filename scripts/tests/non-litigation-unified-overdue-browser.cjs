/* eslint-disable @typescript-eslint/no-require-imports */
// Actual UI with synthetic 082 RPC responses. No Production or business writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
require('./i18n-workspace-fixture.cjs');
const {translate}=require('../../lib/i18n/catalog.ts');
const {chromium}=require(process.env.VP_PLAYWRIGHT_PATH||'/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.argv[2],out=process.argv[3]||'/private/tmp/advisory082-review';assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
const results=[],errors=[],id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,channel:'chrome'});
try{for(const locale of ['th','en'])for(const width of [390,768,1024,1440]){
 const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'}),a=(k,p)=>translate(locale,'advisory.'+k,p),mobile=width<768;
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/*',r=>{if(new URL(r.request().url()).origin!==base){errors.push('Unexpected external request');return r.abort();}return r.continue();});
 const suffix='?locale='+locale+'&unifiedOverdue',settled=async()=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.locator('#advisory-results[aria-busy="false"]').waitFor();};
 const overflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.goto(base+'/advisory'+suffix);await settled();
 const card=page.locator('button[aria-controls="advisory-results"]');assert.equal(await card.locator('strong').innerText(),a('overdueTotals',{matters:2,items:5}));
 const mode=mobile?'mobile':'table',panel=n=>page.locator('#overdue-'+mode+'-'+id(n)),badge=n=>page.locator('button[aria-controls="overdue-'+mode+'-'+id(n)+'"]');
 for(const n of [9,14]){assert.ok(await badge(n).isVisible());const box=await badge(n).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width,'Overdue badge visible without horizontal hunting');}
 assert.ok((await badge(14).innerText()).includes(a('overdueItem',{n:1})));
 assert.equal(await page.locator(`button[aria-controls="overdue-${mode}-${id(10)}"]`).count(),0);
 const calls=await page.evaluate(()=>window.calls.filter(c=>c.name.startsWith('advisory_')).length),url=page.url();
 await badge(9).focus();await badge(9).press('Enter');assert.equal(await badge(9).getAttribute('aria-expanded'),'true');await panel(9).waitFor();
 assert.equal(await panel(9).locator('li').count(),3);assert.ok((await panel(9).innerText()).includes(a('moreOverdueItem',{n:1})));
 assert.ok((await panel(9).innerText()).includes('Demo Lead'));assert.ok((await panel(9).innerText()).includes(a('overdueDays',{n:4})));
 assert.equal(page.url(),url);assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name.startsWith('advisory_')).length),calls,'Disclosure never fetches per Matter');
 await overflow();await page.screenshot({path:path.join(out,`${locale}-${width}-preview.png`),fullPage:true});
 await badge(9).press('Space');assert.equal(await badge(9).getAttribute('aria-expanded'),'false');assert.equal(await panel(9).isVisible(),false);
 await badge(14).click();assert.ok((await panel(14).innerText()).includes(a('overdueDays',{n:3})));assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name.startsWith('advisory_')).length),calls);
 await card.click();await settled();assert.equal(await page.evaluate(()=>window.lastResult.total),2);assert.deepEqual(await page.evaluate(()=>window.lastResult.items.map(m=>m.matter_no)),['ADV-2026-009','ADV-2026-014']);
 assert.equal(await panel(14).isVisible(),false);await overflow();
 await page.screenshot({path:path.join(out,`${locale}-${width}-filtered.png`),fullPage:true});
 await page.getByRole('button',{name:a('clear'),exact:true}).first().click();await settled();assert.equal(await page.evaluate(()=>window.lastResult.total),26);
 for(const n of [9,14]){
  await page.goto(base+'/advisory/'+id(n)+suffix);await page.locator('#tasks li').first().waitFor();
  const task=page.locator('#tasks li').filter({has:page.getByText('Overdue task',{exact:true})});assert.equal(await task.count(),1);
  assert.ok((await task.innerText()).includes(a('overdueDays',{n:n===9?4:3})));assert.ok(!(await task.innerText()).includes(a('enum.normal')));
  assert.ok((await task.innerText()).includes(a('enum.pending')));
  const done=page.locator('#tasks li').filter({has:page.getByText('Completed task',{exact:true})});assert.ok((await done.innerText()).includes(a('enum.completed')));assert.ok(!(await done.innerText()).includes(a('overdueDays',{n:3})));
  const control=page.locator('section[aria-labelledby="matter-control-title"]');assert.ok((await control.innerText()).includes(a('unset')));
  if(n===9)assert.ok((await control.innerText()).includes(a('overdueDays',{n:4})));
  else{assert.ok((await control.innerText()).includes(a('noNext')));assert.ok(!(await control.innerText()).includes(a('overdueDays',{n:3})));}
  await overflow();await page.screenshot({path:path.join(out,`${locale}-${width}-detail-${n}.png`),fullPage:true});
  assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>!['advisory_control_read','advisory_control_section','get_finance_expense_access','get_finance_statement_accounts'].includes(c.name))),[]);
 }
 results.push({locale,width,counts:true,preview:true,noPerRowFetch:true,keyboard:true,taskStatusPreserved:true,nextAction:true,legacyUnset:true,noOverflow:true});await page.close();
}assert.deepEqual(errors,[]);const report={results,errors,synthetic:true,productionAccess:false};fs.writeFileSync(path.join(out,'unified-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
