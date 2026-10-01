/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic localhost only. Never creates Production clients or matters.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.VP_PLAYWRIGHT_PATH||'/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.argv[2],out=process.argv[3]||'/private/tmp/advisory-client-picker-review';
assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
const labels={th:{create:'สร้างงานนอกคดี',client:'ลูกค้า',placeholder:'ค้นหาและเลือกลูกค้า',save:'บันทึก',empty:'ไม่พบลูกค้าที่ตรงกับคำค้น'},en:{create:'Create matter',client:'Client',placeholder:'Search and select client',save:'Save',empty:'No clients match your search'}};
const catalog=require('./fixtures/advisory-085-journey-catalog.json');
const clientName='บริษัท ทดสอบซูลู จำกัด',clientId='00000000-0000-4000-8000-000000000106';
const errors=[],results=[];
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,channel:'chrome'});
try{for(const locale of ['th','en'])for(const width of [390,768,1024,1440]){
 const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'}),w=labels[locale];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/*',r=>{if(new URL(r.request().url()).origin!==base){errors.push('Unexpected external request');return r.abort();}return r.continue();});
 await page.goto(base+'/advisory?locale='+locale);await page.getByRole('button',{name:w.create,exact:true}).click();
 const d=page.getByRole('dialog'),input=d.getByRole('combobox',{name:w.client,exact:true}),save=d.getByRole('button',{name:w.save,exact:true});
 await input.waitFor();await page.waitForFunction(()=>document.querySelector('#matter-client-status')?.textContent==='');
 assert.equal(await input.getAttribute('placeholder'),w.placeholder);assert.equal(await d.locator('input:not([type=hidden]):not([type=checkbox])').count(),2);assert.equal(await d.locator('select[name=client_id]').count(),0);
 // Every approved Work Type updates the real controlled select and hidden Family payload.
 const workType=d.locator('select[name=matter_type]');
 assert.deepEqual(await workType.locator('option').evaluateAll(nodes=>nodes.map(n=>({key:n.value,label:n.textContent}))),catalog.work_types.map(t=>({key:t.key,label:t[locale]})));
 for(const type of catalog.work_types){await workType.selectOption(type.key);assert.equal(await d.locator('input[name=template]').inputValue(),type.family);await d.locator('small').filter({hasText:catalog.families.find(f=>f.key===type.family)[locale]}).waitFor();}
 // Complete independent fields first; no Client selection must block submission.
 await d.locator('input[name=title]').fill('Independent Matter title');await d.locator('select[name=lead_id]').selectOption('lead');await d.locator('select[name=matter_type]').selectOption('contract_business_documents');
 assert.equal(await d.locator('input[name=template]').inputValue(),'contract_business_documents');await save.click();assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.args?.p_action==='create').length),0);
 await input.click();await input.fill('UNREGISTERED CLIENT');await d.getByText(w.empty,{exact:true}).waitFor();await save.click();assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.args?.p_action==='create').length),0);
 // Start a slow response, then search a Client outside the first 30 master rows.
 await input.fill('Alpha');await page.waitForFunction(()=>window.calls.some(c=>c.table==='clients'&&c.query?.name==='%Alpha%'));
 await input.fill('ซูลู');await d.getByRole('option',{name:clientName,exact:true}).waitFor();await page.waitForTimeout(400);
 assert.equal(await d.locator('#matter-client-options').getByRole('option').count(),1);await input.press('ArrowDown');await input.press('Enter');assert.equal(await d.locator('input[name=client_id]').inputValue(),clientId);assert.equal(await input.inputValue(),clientName);
 await d.locator('input[name=title]').focus();assert.equal(await d.locator('input[name=title]').inputValue(),'Independent Matter title');
 // Editing a selected value invalidates the old selection; free text is never an ID.
 await input.click();await input.fill('UNREGISTERED AGAIN');await d.getByText(w.empty,{exact:true}).waitFor();assert.equal(await d.locator('input[name=client_id]').inputValue(),'');await save.click();assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.args?.p_action==='create').length),0);
 await input.fill('ซูลู');await d.getByRole('option',{name:clientName,exact:true}).click();await d.locator('input[name=title]').focus();
 const bounds=await d.locator('#matter-client,input[name=title],select[name=matter_type],select[name=lead_id]').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right};}));
 assert.equal(bounds.length,4);if(width===390){for(let i=1;i<4;i++)assert.ok(bounds[i].y>bounds[i-1].y);}else{assert.ok(bounds[0].x<bounds[1].x);assert.ok(Math.abs(bounds[0].y-bounds[1].y)<8);assert.ok(bounds[2].y>bounds[0].y);assert.ok(Math.abs(bounds[2].y-bounds[3].y)<8);}
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.ok(bounds.every(b=>b.x>=0&&b.right<=width));
 assert.equal(await page.locator('html').getAttribute('lang'),locale);await page.screenshot({path:path.join(out,`${locale}-${width}-create.png`)});
 await save.click();await page.waitForURL(base+'/advisory/00000000-0000-4000-8000-000000000104');await page.getByRole('heading',{name:'Independent Matter title',exact:true}).waitFor();
 const created=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('previewCreatedMatter')));assert.equal(created.client_id,clientId);assert.equal(created.title,'Independent Matter title');assert.equal(created.matter_type,'contract_business_documents');assert.equal(created.template,'contract_business_documents');assert.equal(created.lead_id,'lead');
 results.push({locale,width,selectionAndCreationPassed:true,staleSearchIgnored:true,freeTextRejected:true,layoutPassed:true});await page.close();
 }
 // Client lookup failure cannot offer stale options or create anything.
 const page=await browser.newPage();await page.goto(base+'/advisory?locale=en&clientLookupError');await page.getByRole('button',{name:labels.en.create,exact:true}).click();const d=page.getByRole('dialog');await d.locator('#matter-client-status[role=alert]').waitFor();assert.equal(await d.locator('#matter-client-options').getByRole('option').count(),0);assert.equal(await d.locator('input[name=client_id]').inputValue(),'');assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.args?.p_action==='create').length),0);await page.close();
 assert.deepEqual(errors,[]);const report={results,lookupFailurePassed:true,consoleErrors:errors,synthetic:true,productionAccess:false};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
