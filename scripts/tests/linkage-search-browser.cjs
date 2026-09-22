/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
module.exports=async({page,url,out,translate})=>{
 let scenarios=0;
 for(const prefix of ['purchase','claim'])for(const[width,locale]of[[390,'th'],[1440,'th'],[1440,'en']]){
  const t=k=>translate(locale,'expenses.'+k),dialog=page.getByRole('dialog');await page.setViewportSize({width,height:1050});
  await page.goto(`${url}/finance/expenses${prefix==='claim'?'/claims?claim061=1':'?purchase060=1'}&locale=${locale}`);await page.getByRole('button',{name:t(prefix==='claim'?'newClaim':'new'),exact:true}).first().click();
  const toggle=dialog.getByRole('checkbox',{name:t('purchaseRelatedWork'),exact:true});assert.equal(await dialog.locator(`#${prefix}-client`).count(),0);await toggle.check();
  const client=dialog.locator(`#${prefix}-client`),work=dialog.locator(`#${prefix}-work`),options=dialog.getByRole('listbox').getByRole('option');
  await client.click();assert.equal(await options.count(),3);for(const q of ['ลูกค้า','SYNTHETIC CLIENT']){await client.fill(q);assert.equal(await options.count(),2);assert.match(await options.last().innerText(),/Synthetic client/);}
  await client.press('ArrowDown');await client.press('Enter');assert.match(await client.inputValue(),/Synthetic client/);await client.click();assert.match(await options.filter({hasText:'Synthetic client'}).getAttribute('aria-selected'),/true/);await client.press('Escape');
  await work.click();assert.equal(await options.count(),3);assert.equal(await options.filter({hasText:'Other case'}).count(),0);
  for(const q of ['CASE-TEST','คดีทดสอบ','Synthetic case']){await work.fill(q);assert.equal(await options.count(),2);assert.match(await options.last().innerText(),locale==='th'?/— คดี/:/— Case/);}
  for(const q of ['ADV-TEST','งานที่ปรึกษา','Synthetic advisory']){await work.fill(q);assert.equal(await options.count(),2);assert.match(await options.last().innerText(),locale==='th'?/— ที่ปรึกษา/:/— Advisory/);}
  await options.last().click();assert.match(await work.inputValue(),/ADV-TEST/);await client.click();await options.filter({hasText:'Other client'}).click();assert.equal(await work.inputValue(),locale==='th'?'ไม่ระบุ':'Not specified');await work.click();assert.equal(await options.count(),2);assert.match(await options.last().innerText(),/OTHER/);await work.press('Escape');
  await client.click();await options.first().click();await work.click();assert.equal(await options.count(),4);await work.fill('ADV-TEST');await options.last().click();assert.match(await client.inputValue(),/Synthetic client/);
  await work.click();assert.equal(await options.filter({hasText:'ADV-TEST'}).getAttribute('aria-selected'),'true');await work.press('Escape');await work.press('Tab');assert.equal(await dialog.getByRole('listbox').count(),0);
  await client.fill('arbitrary nonexistent client');await client.press('Tab');assert.match(await client.inputValue(),/Synthetic client/);await work.fill('arbitrary nonexistent matter');await work.press('Tab');assert.match(await work.inputValue(),/ADV-TEST/);
  await client.click();await options.filter({hasText:'Synthetic client'}).click();assert.match(await work.inputValue(),/ADV-TEST/);
  await work.click();assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:out+`/${prefix}-linkage-search-${locale}-${width}.png`});await work.press('Escape');await toggle.uncheck();assert.equal(await client.count(),0);await toggle.check();assert.equal(await client.inputValue(),locale==='th'?'ไม่ระบุ':'Not specified');assert.equal(await work.inputValue(),locale==='th'?'ไม่ระบุ':'Not specified');
  assert.deepEqual(await page.evaluate(()=>window.writes),[]);scenarios++;console.log('PASS linkage search',prefix,width,locale);
 }
 return scenarios;
};
