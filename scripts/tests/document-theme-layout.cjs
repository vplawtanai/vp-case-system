/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {documentHtml}=require('./document-theme-fixture.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const output=process.env.DOCUMENT_THEME_QA_DIR||'/private/tmp/vp-document-theme-qa';
const expected={quotation:'rgb(29, 78, 216)',invoice:'rgb(180, 83, 9)',receipt:'rgb(21, 128, 61)'};
async function metrics(page,type) {
  const result=await page.evaluate(()=>{
    const article=document.querySelector('article'),heading=article.querySelector('h1'),header=article.querySelector('header'),logo=article.querySelector('img');
    const rect=logo.getBoundingClientRect(),text=logo.nextElementSibling.getBoundingClientRect();
    return {title:heading.textContent,color:getComputedStyle(heading).color,divider:getComputedStyle(header).borderBottomColor,
      overflow:document.documentElement.scrollWidth>innerWidth,logoLoaded:logo.naturalWidth>0,logoOverlap:rect.right>text.left+1,
      logoUrl:logo.src,articleWidth:article.getBoundingClientRect().width,text:article.textContent};
  });
  assert.equal(result.color,expected[type]);assert.equal(result.divider,expected[type]);
  assert.equal(result.logoLoaded,true);assert.equal(result.logoOverlap,false);
  return result;
}
async function main() {
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
  try {
    const page=await browser.newPage();await page.route('**/*',route=>route.abort());
    for(const type of Object.keys(expected))for(const status of ['draft',type==='quotation'?'sent':'issued',type==='quotation'?'cancelled':'voided']) {
      let desktop;
      for(const width of [1280,375]) {
        await page.emulateMedia({media:'screen'});await page.setViewportSize({width,height:1100});
        await page.setContent(documentHtml(type,status));
        await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode()));});
        const result=await metrics(page,type);
        // Quotation retains its existing fixed-content narrow layout; this task changes colors only.
        if(type!=='quotation'||width===1280)assert.equal(result.overflow,false);
        if(width===1280)desktop=result;
        else assert.equal(result.text,desktop.text);
        console.log(JSON.stringify({type,status,width,pageOverflow:result.overflow,articleWidth:result.articleWidth}));
        await page.screenshot({path:path.join(output,`${type}-${status}-${width}.png`),fullPage:true});
      }
      await page.setViewportSize({width:794,height:1123});await page.emulateMedia({media:'print'});
      const printed=await metrics(page,type);assert.equal(printed.text,desktop.text);assert.equal(printed.overflow,false);
      await page.pdf({path:path.join(output,`${type}-${status}-a4.pdf`),preferCSSPageSize:true,printBackground:true});
      // Grayscale simulation changes only the test canvas, not application styles.
      await page.addStyleTag({content:'article { filter: grayscale(1); }'});
      await page.pdf({path:path.join(output,`${type}-${status}-grayscale-a4.pdf`),preferCSSPageSize:true,printBackground:false});
      assert.equal(await page.locator('article').textContent(),desktop.text);
      console.log(`PASS ${type} ${status}: screen/print accents, logo, exact text, A4 and grayscale PDF`);
    }
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
