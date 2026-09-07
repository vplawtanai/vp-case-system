/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {documentHtml}=require('./document-theme-fixture.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const output=process.env.DOCUMENT_AUTHORIZATION_QA_DIR||'/private/tmp/vp-document-authorization-qa';

async function geometry(page,type) {
  const result=await page.evaluate(()=>{
    const article=document.querySelector('article');
    const signature=article.querySelector('[data-document-authorization]');
    const box=signature?.getBoundingClientRect();
    const footer=article.querySelector('footer')?.getBoundingClientRect();
    return {overflow:document.documentElement.scrollWidth>innerWidth,text:article.textContent,
      logoLoaded:article.querySelector('img')?.naturalWidth>0,
      signature:box?{left:box.left,right:box.right,bottom:box.bottom,width:box.width,
        space:signature.firstElementChild.getBoundingClientRect().height,
        line:signature.querySelector('[class*="signingLine"]')?.getBoundingClientRect().width,
        clipped:[...signature.querySelectorAll('*')].some(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+1),
        keep:getComputedStyle(signature).breakInside,footerTop:footer?.top}:null,
      articleRight:article.getBoundingClientRect().right};
  });
  assert.equal(result.logoLoaded,true);
  if(type!=='quotation') {
    assert.equal(result.overflow,false);assert.ok(result.signature);
    assert.equal(result.signature.clipped,false);
    assert.ok(result.signature.right<=result.articleRight+1);
    assert.ok(result.signature.bottom<=result.signature.footerTop+1);
    assert.ok(result.signature.space>=18*96/25.4-1);
    assert.ok(result.signature.line>150);assert.equal(result.signature.keep,'avoid');
  }
  return result.text;
}

async function main() {
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
  try {
    const page=await browser.newPage();await page.route('**/*',route=>route.abort());
    for(const type of ['quotation','invoice','receipt'])for(const status of ['draft',type==='quotation'?'sent':'issued']) {
      let text;
      for(const width of [1280,375,320]) {
        await page.emulateMedia({media:'screen'});await page.setViewportSize({width,height:1100});
        await page.setContent(documentHtml(type,status,{signature:true}));
        await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode()));});
        const current=await geometry(page,type);if(text)assert.equal(current,text);else text=current;
        await page.screenshot({path:path.join(output,`${type}-${status}-${width}.png`),fullPage:true});
      }
      await page.setViewportSize({width:794,height:1123});await page.emulateMedia({media:'print'});
      assert.equal(await geometry(page,type),text);
      await page.pdf({path:path.join(output,`${type}-${status}-a4.pdf`),preferCSSPageSize:true,printBackground:true});
      await page.addStyleTag({content:'article {filter:grayscale(1)}'});
      await page.pdf({path:path.join(output,`${type}-${status}-grayscale-a4.pdf`),preferCSSPageSize:true,printBackground:false});
      console.log(`PASS ${type} ${status}: screen 1280/375/320, print, grayscale; manual block/footer geometry where applicable`);
    }
    for(const type of ['invoice','receipt']) {
      await page.setContent(documentHtml(type,'issued',{count:35}));await page.emulateMedia({media:'print'});
      await geometry(page,type);
      const pdf=path.join(output,`${type}-multipage-a4.pdf`);
      await page.pdf({path:pdf,preferCSSPageSize:true,printBackground:true});
      const pages=execFileSync(process.env.PDFTOTEXT_EXECUTABLE||'pdftotext',['-layout',pdf,'-'],{encoding:'utf8'}).split('\f').filter(page=>page.trim());
      assert.ok(pages.length>1);
      // Strip extraction whitespace only; both signing/name controls and footer must end together.
      const last=pages.at(-1).replace(/\s/g,'');
      assert.ok(last.includes('ลงชื่อ'),last);assert.ok(last.includes('(ชื่อผู้ลงนาม)'),last);
      assert.ok(last.includes('02-000-0000'),last);
      for(const earlier of pages.slice(0,-1))assert.ok(!earlier.replace(/\s/g,'').includes('(ชื่อผู้ลงนาม)'));
      console.log(`PASS ${type}: ${pages.length} A4 pages, one final signature with footer`);
    }
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
