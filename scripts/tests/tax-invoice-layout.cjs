/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,html}=require('./tax-invoice-render-fixture.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
async function main(){
  const out='/private/tmp/vp-tax-invoice-qa';fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
  try{
    const page=await browser.newPage();await page.route('**/*',route=>route.abort());
    for(const status of ['draft','issued','cancelled']){
      for(const width of [1280,768,375,320]){
        await page.setViewportSize({width,height:1100});await page.emulateMedia({media:'screen'});await page.setContent(html(fixture(status)));
        await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
        const result=await page.evaluate(()=>{
          const image=document.querySelector('article img'),a=image.getBoundingClientRect(),b=image.nextElementSibling.getBoundingClientRect();
          return {overflow:document.documentElement.scrollWidth>innerWidth,clipped:[...document.querySelectorAll('article *')].filter(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+1).map(el=>el.tagName+':'+el.className),logo:image.naturalWidth>0&&a.right<=b.left,title:document.querySelector('h1')?.textContent};
        });
        assert.equal(result.overflow,false,JSON.stringify(result));assert.deepEqual(result.clipped,[]);assert.ok(result.logo);assert.equal(result.title,'ใบกำกับภาษี');
        if(width<794){
          const reachable=await page.locator('article').evaluate(article=>{
            const viewport=article.parentElement;viewport.scrollLeft=viewport.scrollWidth;
            const end=article.querySelector('h1').getBoundingClientRect(),frame=viewport.getBoundingClientRect();
            const result=getComputedStyle(viewport).overflowX==='auto'&&end.right<=frame.right;
            viewport.scrollLeft=0;return result;
          });assert.equal(reachable,true,'Shared A4 viewport can pan to document right edge');
        }
        if([1280,375].includes(width))await page.screenshot({path:path.join(out,`${status}-${width}.png`),fullPage:true});console.log(`PASS Tax Invoice ${status} ${width}px`);
      }
      await page.setViewportSize({width:794,height:1123});await page.emulateMedia({media:'print'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await page.locator('[data-app-chrome]').evaluateAll(elements=>elements.every(el=>getComputedStyle(el).display==='none'&&el.getBoundingClientRect().height===0)),true);
      assert.equal(await page.locator('article img').evaluate(i=>i.naturalWidth>0&&i.getBoundingClientRect().width>0),true);
      await page.pdf({path:path.join(out,`${status}-a4.pdf`),preferCSSPageSize:true,printBackground:true});
      console.log(`PASS Tax Invoice ${status} A4/PDF`);
    }
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
