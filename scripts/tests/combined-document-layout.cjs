/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,html}=require('./combined-document-render-fixture.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
async function main(){
  const out='/private/tmp/vp-combined-document-qa';fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
  try{
    const page=await browser.newPage();await page.route('**/*',r=>r.abort());
    for(const status of ['draft','issued','cancelled']){
      for(const width of [1280,768,375,320]){
        await page.setViewportSize({width,height:1123});await page.emulateMedia({media:'screen'});await page.setContent(html(fixture(status)));
        await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
        const result=await page.evaluate(()=>{
          const image=document.querySelector('article img'),a=image.getBoundingClientRect(),b=image.nextElementSibling.getBoundingClientRect();
          return {overflow:document.documentElement.scrollWidth>innerWidth,clipped:[...document.querySelectorAll('article *')].filter(e=>e.clientWidth>0&&e.scrollWidth>e.clientWidth+1).map(e=>e.tagName+':'+e.className),logo:image.naturalWidth>0&&a.right<=b.left,title:document.querySelector('h1')?.textContent};
        });
        assert.equal(result.overflow,false,JSON.stringify(result));assert.deepEqual(result.clipped,[]);assert.ok(result.logo);assert.equal(result.title,'ใบเสร็จรับเงิน/ใบกำกับภาษี');
        if(width<794)assert.equal(await page.locator('article').evaluate(article=>{
          const viewport=article.parentElement;viewport.scrollLeft=viewport.scrollWidth;
          const reachable=getComputedStyle(viewport).overflowX==='auto'&&article.querySelector('h1').getBoundingClientRect().right<=viewport.getBoundingClientRect().right;
          viewport.scrollLeft=0;return reachable;
        }),true,'Shared A4 preview can pan to its complete right edge');
        if([1280,375].includes(width))await page.screenshot({path:path.join(out,`${status}-${width}.png`),fullPage:true});
        console.log(`PASS combined ${status} ${width}px`);
      }
      await page.setViewportSize({width:794,height:1123});await page.emulateMedia({media:'print'});await page.setContent(html(fixture(status)));
      await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await page.locator('[data-app-chrome]').evaluateAll(es=>es.every(e=>getComputedStyle(e).display==='none'&&e.getBoundingClientRect().height===0)),true);
      assert.deepEqual(await page.locator('tbody tr').evaluateAll(rows=>rows.map(r=>r.cells.length)),[4,4]);
      await page.pdf({path:path.join(out,`${status}-a4.pdf`),preferCSSPageSize:true,printBackground:true});
      await page.addStyleTag({content:'html{filter:grayscale(1)}'});await page.screenshot({path:path.join(out,`${status}-grayscale.png`),fullPage:true});
      console.log(`PASS combined ${status} A4/PDF/grayscale`);
    }
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
