/* eslint-disable @typescript-eslint/no-require-imports */
// Run against ADVISORY_OVERDUE_PREVIEW=1. Local synthetic transport only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
require('./i18n-workspace-fixture.cjs');
const {translate}=require('../../lib/i18n/catalog.ts');
const {chromium}=require(process.env.VP_PLAYWRIGHT_PATH||'/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.argv[2],out=process.argv[3]||'/private/tmp/advisory-overdue-review';
assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
const errors=[],results=[];
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,channel:'chrome'});
try{for(const locale of ['th','en'])for(const width of [390,768,1024,1440]){
 const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'}),a=k=>translate(locale,'advisory.'+k);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/*',r=>{if(new URL(r.request().url()).origin!==base){errors.push('Unexpected external request');return r.abort();}return r.continue();});
 const card=page.locator('button[aria-controls="advisory-results"]'),nav=page.getByRole('navigation',{name:a('status'),exact:true});
 const search=page.getByLabel(a('search'),{exact:true}),filters=search.locator('../..');
 const control=key=>key==='search'?search:filters.locator('select').nth(['type','lead','state','sort'].indexOf(key));
 const tab=k=>nav.getByRole('button',{name:a(k),exact:true});
 const settled=async()=>{
  // Let React commit the input event and start its query effect before waiting.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.locator('#advisory-results[aria-busy="false"]').waitFor();
 };
 const query=()=>page.evaluate(()=>window.calls.filter(c=>c.name==='advisory_control_read').at(-1).args.p_query);
 const clear=()=>page.getByRole('button',{name:a('clear'),exact:true}).first().click();
 await page.goto(base+'/advisory?locale='+locale+'&client_id=normal-client');await settled();
 assert.equal(await card.locator('strong').innerText(),translate(locale,'advisory.overdueTotalsOneItem',{matters:1,items:1}));assert.ok((await card.innerText()).includes(a('overdue')));
 assert.equal(await page.locator('#advisory-results').getByText('ADV-2026-009',{exact:true}).count(),0);
 await page.getByRole('button',{name:a('nextPage'),exact:true}).click();await settled();assert.equal((await query()).offset,20);
 await card.click();await settled();assert.deepEqual(await query(),{tab:'overdue',sort:'',offset:0});
 assert.equal(await card.getAttribute('aria-pressed'),'true');assert.equal(await tab('overdue').getAttribute('aria-pressed'),'true');
 assert.ok(await tab('overdue').evaluate(n=>n===document.activeElement));
 assert.deepEqual(await page.evaluate(()=>window.lastResult.items.map(m=>m.id)),await page.evaluate(()=>window.fixture.overdueIds));
 assert.equal(await page.evaluate(()=>window.lastResult.total===window.lastResult.summary.overdue),true);
 assert.equal(await page.locator('#advisory-results').getByText('ADV-2026-009',{exact:true}).first().isVisible(),width>767);
 assert.ok(await page.locator('#advisory-results').getByText('ADV-2026-009',{exact:true}).last().isVisible()||width>767);
 await clear();await settled();assert.equal(await card.getAttribute('aria-pressed'),'false');assert.equal(await page.evaluate(()=>window.lastResult.total),26);
 // Conflicting search/dropdowns/tab are removed, while the chosen sort survives.
 await page.getByLabel(a('search'),{exact:true}).fill('no-such-matter');await settled();
 for(const [key,value] of [['type','legal_opinion'],['lead','admin'],['state','waiting_client'],['sort','due']]){await control(key).selectOption(value);await settled();}
 await tab('closed').click();await settled();assert.equal(await page.evaluate(()=>window.lastResult.total),0);
 await card.focus();assert.ok(await card.evaluate(n=>parseFloat(getComputedStyle(n).outlineWidth)>0),'Visible keyboard focus');await card.press('Enter');await settled();
 assert.deepEqual(await query(),{tab:'overdue',sort:'due',offset:0});
 for(const key of ['search','type','lead','state'])assert.equal(await control(key).inputValue(),'');
 assert.equal(await tab('overdue').getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 assert.ok((await card.boundingBox()).height>=44);assert.equal(new URL(page.url()).pathname,'/advisory');
 await page.screenshot({path:path.join(out,`${locale}-${width}-overdue.png`)});
 await clear();await settled();await tab('overdue').click();await settled();assert.deepEqual(await query(),{tab:'overdue',sort:'',offset:0});
 await clear();await settled();await card.focus();await card.press('Space');await settled();assert.equal((await query()).tab,'overdue');
 assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>!['advisory_control_read','get_finance_expense_access','get_finance_statement_accounts'].includes(c.name))),[]);
 // Zero is a real empty result, never an invented navigation or a disabled trap.
 await page.goto(base+'/advisory?locale='+locale+'&zeroOverdue');await settled();assert.equal(await card.locator('strong').innerText(),translate(locale,'advisory.overdueTotals',{matters:0,items:0}));await card.click();await settled();
 assert.equal(await page.evaluate(()=>window.lastResult.total),0);await page.getByRole('status').getByText(a('empty'),{exact:true}).waitFor();
 assert.equal(await card.getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 results.push({locale,width,filterReset:true,paginationReset:true,sortPreserved:true,countMatches:true,keyboard:true,zeroSafe:true,noOverflow:true});await page.close();
 }
 assert.deepEqual(errors,[]);const report={results,consoleErrors:errors,synthetic:true,productionAccess:false};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
