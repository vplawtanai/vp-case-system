/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {fixture,html} = require('./receipt-render-fixture.cjs');
const {logoFixture,syntheticLogoUrl} = require('./document-logo-render-fixture.cjs');
const withLogo = process.env.RECEIPT_LOGO_QA === '1';
const documentHtml = (status,count=1) => html(withLogo?logoFixture(status,count):fixture(status,count),withLogo?syntheticLogoUrl:'');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const out = process.env.RECEIPT_QA_DIR || '/private/tmp/vp-receipt-qa';
async function main(){
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
  try{
    const page=await browser.newPage();
    await page.route('**/*',route=>route.abort());
    for(const status of ['draft','issued','voided']){
      for(const width of [1280,768,375,320]){
        await page.setViewportSize({width,height:1100});await page.emulateMedia({media:'screen'});
        await page.setContent(documentHtml(status));await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode()));});
        const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,
          clipped:[...document.querySelectorAll('article *')].filter(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+1).map(el=>el.tagName+':'+el.className),
          title:document.querySelector('h1')?.textContent,chrome:[...document.querySelectorAll('[data-app-chrome]')].every(el=>el.getBoundingClientRect().height>0)}));
        assert.equal(geometry.overflow,false,JSON.stringify({status,width,geometry}));assert.deepEqual(geometry.clipped,[]);
        assert.equal(geometry.chrome,true);assert.equal(geometry.title,'ใบเสร็จรับเงิน');
        if(withLogo){
          const logo=await page.evaluate(()=>{
            const image=document.querySelector('article img'),box=image.getBoundingClientRect();
            const text=image.nextElementSibling.getBoundingClientRect();
            const locality=document.querySelector('[class*="addressLocality"]').getBoundingClientRect();
            const canvas=document.createElement('canvas');canvas.width=24;canvas.height=18;
            const context=canvas.getContext('2d');context.drawImage(image,0,0,24,18);
            return {loaded:image.naturalWidth>0,width:box.width,height:box.height,noOverlap:box.right<=text.left,
              localityFits:locality.width<=text.width+1,colors:new Set(context.getImageData(0,0,24,18).data).size};
          });
          assert.ok(logo.loaded&&logo.noOverlap&&logo.localityFits&&logo.colors>5,JSON.stringify(logo));
          assert.ok(Math.abs(logo.width-24*96/25.4)<1&&Math.abs(logo.height-18*96/25.4)<1);
        }
        if([1280,375].includes(width))await page.screenshot({path:path.join(out,`${status}-${width}.png`),fullPage:true});
        console.log(`PASS ${status} screen ${width}px`);
      }
      await page.setViewportSize({width:794,height:1123});await page.emulateMedia({media:'print'});
      const print=await page.evaluate(()=>({chrome:[...document.querySelectorAll('[data-app-chrome]')].map(el=>({display:getComputedStyle(el).display,height:el.getBoundingClientRect().height})),width:document.querySelector('article').getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth}));
      assert.ok(print.chrome.every(el=>el.display==='none'&&el.height===0));assert.equal(print.overflow,false);
      if(withLogo)assert.equal(await page.locator('article img').evaluate(image=>image.naturalWidth>0&&image.getBoundingClientRect().width>0),true);
      await page.pdf({path:path.join(out,`${status}-a4.pdf`),preferCSSPageSize:true,printBackground:true});
      console.log(`PASS ${status} A4 Print/PDF; chrome absent`);
    }
    await page.setContent(documentHtml('issued',35));await page.emulateMedia({media:'print'});
    await page.pdf({path:path.join(out,'multi-invoice-a4.pdf'),preferCSSPageSize:true,printBackground:true});
    assert.equal(await page.locator('tbody tr').count(),35);
    console.log('PASS 35-Invoice paginated synthetic Receipt');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
