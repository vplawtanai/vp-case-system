/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const config=require('../../lib/advisory-journey-artwork-config.json'),[base,library]=process.argv.slice(2),out='/private/tmp/vp094-browser';
for(const url of [base,library].filter(Boolean))assert.match(url,/^http:\/\/127\.0\.0\.1:\d+$/);
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[],results=[];fs.mkdirSync(out,{recursive:true});try{
 async function pageFor(origin,width){const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());return page;}
 async function overflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);if(await page.getByRole('dialog').count())assert.equal(await page.getByRole('dialog').evaluate(d=>d.scrollWidth>d.clientWidth+1),false);}
 async function coordinates(page,code){const actual=await page.locator('section[data-ready=true]').evaluate(s=>{const canvas=s.querySelector('img').parentElement,c=canvas.getBoundingClientRect(),image=s.querySelector('img').getBoundingClientRect();return{ratio:c.width/c.height,imageRatio:image.width/image.height,points:[...s.querySelectorAll('[data-stage]')].map(n=>{const b=n.getBoundingClientRect();return[(b.x+b.width/2-c.x)/c.width*100,(b.y+b.height/2-c.y)/c.height*100];})};});assert.ok(Math.abs(actual.ratio-1672/941)<.005);assert.ok(Math.abs(actual.imageRatio-actual.ratio)<.005);actual.points.forEach((p,i)=>p.forEach((n,axis)=>assert.ok(Math.abs(n-config.assets[code][i][axis])<.04)));}
 // All approved assets/families, using only synthetic data and a local stand-in image.
 for(const [family,code] of Object.entries(config.families)){
  const page=await pageFor(base,1440);await page.goto(base+'?family='+family);await page.locator('section[data-ready=true]').waitFor();await coordinates(page,code);await overflow(page);assert.equal(await page.locator('section[data-ready=true] .strategic-journey_module_css_lines>path').count(),4);results.push({family,anchors:true});await page.close();
 }
 for(const locale of ['th','en'])for(const width of [1440,820,390]){
  const page=await pageFor(base,width);await page.goto(base+'?locale='+locale);const dialog=page.getByRole('dialog'),map=page.locator('section[data-ready=true]');
  if(width===390){await dialog.getByRole('region',{name:locale==='th'?'เส้นทางที่เกิดขึ้นจริง':'Actual path',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.artworkCalls.length),0);}
  else{await map.waitFor();await map.locator('[data-stage=s0]').click();await dialog.getByRole('heading',{name:locale==='th'?'รายละเอียดขั้นตอน: รับเรื่อง':'Stage detail: Intake',exact:true}).waitFor();assert.equal(await page.getByRole('dialog').count(),1);await map.locator('ol button').last().click();assert.match(await dialog.locator('[class*=stageSummary]').innerText(),locale==='th'?/ครั้งที่ 2/:/Visit 2/);await coordinates(page,config.families.general_advisory);await dialog.getByRole('button',{name:locale==='th'?'เส้นทางที่เป็นไปได้ทั้งหมด':'All possible routes',exact:true}).click();assert.equal(await map.locator('svg>path[data-view=possible]').count(),8);await page.setViewportSize({width:width===1440?1024:900,height:1000});await coordinates(page,config.families.general_advisory);}
  await overflow(page);await page.screenshot({path:path.join(out,`journey-${locale}-${width}.png`)});results.push({locale,width,journey:true});await page.close();
 }
 for(const locale of ['th','en'])for(const scenario of ['unvisited','skipped','waiting']){
  const p=await pageFor(base,1440);await p.goto(base+'?locale='+locale+'&'+scenario);const map=p.locator('section[data-ready=true]');await map.waitFor();
  if(scenario==='waiting'){const current=map.locator('[data-state=current]');assert.match(await current.innerText(),locale==='th'?/รอลูกค้า/:/Waiting for client/);assert.match(await current.innerText(),locale==='th'?/มีงานเลยกำหนด/:/Overdue work/);}
  else{const optional=map.locator('[data-stage=s2]');assert.equal(await optional.getAttribute('data-state'),scenario==='skipped'?'skipped':'future');assert.equal(await optional.locator('svg.lucide-check').count(),0);}
  await overflow(p);results.push({locale,scenario});await p.close();
 }
 for(const flag of ['unavailable','expiry','broken']){const p=await pageFor(base,1440);if(flag==='broken')await p.route('**/missing-image',r=>r.fulfill({status:200,contentType:'image/webp',body:'invalid image'}));await p.goto(base+'?'+flag);if(flag==='expiry')await p.locator('section[data-ready=true]').waitFor();await p.getByRole('dialog').getByRole('region',{name:'เส้นทางที่เกิดขึ้นจริง',exact:true}).waitFor({state:'visible'});await overflow(p);results.push({fallback:flag});await p.close();}
 if(library)for(const locale of ['th','en'])for(const width of [1440,390]){
  const p=await pageFor(library,width);await p.addInitScript(()=>{window.copiedTexts=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copiedTexts.push(text)},configurable:true});});await p.goto(library+'?locale='+locale);const cards=p.locator('article');await cards.first().waitFor();
  for(let i=0;i<await cards.count();i++){
   const button=cards.nth(i).getByRole('button',{name:locale==='th'?'คัดลอกรหัสภาพ':'Copy image code',exact:true});await button.click();assert.equal(await button.getAttribute('data-copied'),'true');await button.getByRole('status').getByText(locale==='th'?'คัดลอกรหัสแล้ว':'Code copied',{exact:true}).waitFor();assert.equal(await button.locator('svg.lucide-check').count(),1);await p.waitForFunction(index=>document.querySelectorAll('article')[index].querySelector('[data-copied]')?.getAttribute('data-copied')==='false',i);assert.equal(await button.locator('svg.lucide-copy').count(),1);
  }
  assert.equal(await p.evaluate(()=>window.copiedTexts.length),await cards.count());await cards.first().getByRole('button',{name:locale==='th'?'คัดลอกรหัสภาพ':'Copy image code',exact:true}).click();await overflow(p);await p.screenshot({path:path.join(out,`copy-${locale}-${width}.png`)});results.push({locale,width,copy:true});await p.close();
 }
 assert.deepEqual(errors,[]);const result={results,errors,productionAccess:false};fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
