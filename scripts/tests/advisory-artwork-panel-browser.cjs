/* eslint-disable @typescript-eslint/no-require-imports */
// Focused, synthetic-only validation of the floating detail panel. No Production access.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.argv[2],out='/private/tmp/vp094-floating-detail';
assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function layout(page){return page.getByRole('dialog').evaluate(dialog=>{
 const body=dialog.querySelector(':scope > div'),map=dialog.querySelector('section[data-ready=true]'),image=map.querySelector('img');
 return {pageY:window.scrollY,dialogY:dialog.scrollTop,bodyY:body.scrollTop,bodyHeight:body.scrollHeight,image:image.getBoundingClientRect().toJSON(),nodes:[...map.querySelectorAll('[data-stage]')].map(node=>node.getBoundingClientRect().toJSON())};
});}
function stable(before,after){
 for(const key of ['pageY','dialogY','bodyY','bodyHeight'])assert.ok(Math.abs(before[key]-after[key])<1,key+' must not jump');
 for(const key of ['x','y','width','height']){
  assert.ok(Math.abs(before.image[key]-after.image[key])<.2,'Artwork '+key+' must not move');
  before.nodes.forEach((node,i)=>assert.ok(Math.abs(node[key]-after.nodes[i][key])<.2,'Stage coordinate/size unchanged'));
 }
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'}),results=[],errors=[];fs.mkdirSync(out,{recursive:true});
 try{
  for(const locale of ['th','en'])for(const fj1 of [false,true])for(const width of [1440,820])for(const tall of [false,true]){
   const page=await browser.newPage({viewport:{width,height:width===1440?780:1000}});
   page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
   await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   await page.goto(base+'?editable&locale='+locale+(fj1?'&fj1':'')+(tall?'&tall':''));
   const map=page.locator('section[data-ready=true]');await map.waitFor();await settle(page);
   const panel=map.locator('aside[aria-label]'),expand=panel.getByRole('button',{name:locale==='th'?'ดูรายละเอียด':'View details',exact:true});
   for(const selected of ['s0','s3']){
    await map.locator('[data-stage='+selected+']').click();await settle(page);
    assert.equal(await panel.getAttribute('data-expanded'),'false');const before=await layout(page);
    await expand.click();await settle(page);assert.equal(await page.getByRole('dialog').count(),1);
    stable(before,await layout(page));
    const collapse=panel.getByRole('button',{name:locale==='th'?'ย่อรายละเอียด':'Collapse details',exact:true});
    const body=panel.getByRole('region',{name:locale==='th'?'รายละเอียดขั้นตอนทั้งหมด':'Full stage details',exact:true});
    const geometry=await panel.evaluate(panel=>{
     const b=panel.getBoundingClientRect(),canvas=panel.parentElement.getBoundingClientRect(),node=panel.parentElement.querySelector('[data-stage][aria-pressed=true]').getBoundingClientRect();
     return {width:b.width,height:b.height,canvasHeight:canvas.height,inside:b.left>=canvas.left&&b.right<=canvas.right+1&&b.top>=canvas.top&&b.bottom<=canvas.bottom+1,opposite:(node.x+node.width/2<canvas.x+canvas.width/2)===(b.x+b.width/2>canvas.x+canvas.width/2),selectedObscured:Math.min(b.right,node.right)>Math.max(b.left,node.left)&&Math.min(b.bottom,node.bottom)>Math.max(b.top,node.top)};
    });
    assert.ok(geometry.width>=380&&geometry.width<=460);assert.ok(geometry.height<=geometry.canvasHeight*.61);
    assert.equal(geometry.inside,true);assert.equal(geometry.opposite,true);assert.equal(geometry.selectedObscured,false);
    assert.equal(await body.evaluate(body=>body.scrollHeight>body.clientHeight),true,'Long existing detail scrolls inside panel');
    const headerBefore=await collapse.evaluate(button=>button.getBoundingClientRect().toJSON());
    await body.evaluate(body=>{body.scrollTop=body.scrollHeight;});await settle(page);
    assert.ok(await body.evaluate(body=>body.scrollTop)>0);stable(before,await layout(page));
    const headerAfter=await collapse.evaluate(button=>button.getBoundingClientRect().toJSON());
    assert.equal(headerAfter.y,headerBefore.y);assert.equal(await collapse.isVisible(),true);
    assert.equal(await body.evaluate(body=>body.scrollWidth<=body.clientWidth+1),true);
    await body.hover();await page.mouse.wheel(0,1000);await settle(page);stable(before,await layout(page));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await page.screenshot({path:out+`/${locale}-${fj1?'fj1':'fj2'}-${width}-${tall?'tall':'wide'}-${selected}.png`});
    await collapse.click();await settle(page);stable(before,await layout(page));
    assert.equal(await body.count(),0);assert.equal(await expand.getAttribute('aria-expanded'),'false');
   }
   results.push({locale,journey:fj1?'FJ1':'FJ2',width,ratio:tall?'4:3':'wide',floating:true,internalScroll:true,headerFixed:true,layoutStable:true,oppositeSides:true});await page.close();
  }
  for(const locale of ['th','en'])for(const fj1 of [false,true]){
   const page=await browser.newPage({viewport:{width:390,height:844}});
   page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
   await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   await page.goto(base+'?locale='+locale+(fj1?'&fj1':''));const dialog=page.getByRole('dialog');
   if(fj1)await dialog.locator('#journey-stage-details').waitFor();
   else await dialog.getByRole('region',{name:locale==='th'?'เส้นทางที่เกิดขึ้นจริง':'Actual path',exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>window.artworkCalls.length),0);assert.equal(await dialog.locator('aside[data-expanded]').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   results.push({locale,journey:fj1?'FJ1':'FJ2',width:390,verticalUnchanged:true});await page.close();
  }
  assert.deepEqual(errors,[]);const result={results,errors,productionAccess:false};fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
