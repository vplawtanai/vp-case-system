/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
module.exports=async({page,url,out,translate})=>{
 let scenarios=0;
 for(const [width,locale]of [[390,'th'],[1440,'th'],[1440,'en']]){
  const t=k=>translate(locale,'expenses.'+k);await page.setViewportSize({width,height:1050});
  for(const paid of [0,1,2]){
   await page.goto(`${url}/finance/expenses?purchase060=1&scenario=no-tax&paymentCount=${paid}&locale=${locale}`);
   const row=page.locator('[data-request-row]');await row.waitFor();
   await row.getByText(t(['unpaid','partiallyPaid','paid'][paid]),{exact:true}).waitFor();
   assert.equal(await row.locator('[data-payment-progress]').count(),1);
   if(paid===1)assert.equal(await row.locator('[data-payment-progress]').innerText(),t('paid')+' 1 · '+t('unpaid')+' 1');
   assert.equal(await page.locator('article').count(),4);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   if(paid===1)await page.screenshot({path:out+`/partial-list-${locale}-${width}.png`});
   await row.getByRole('button').click();const dialog=page.getByRole('dialog');await dialog.waitFor();
   for(let i=0;i<2;i++){
    await dialog.locator('[data-review-item]').nth(i).click();
    const status=i<paid?'paid':'unpaid';await dialog.locator(`[data-item-payment=${status}]`).waitFor();
    assert.equal(await dialog.locator('[data-paid-facts]').count(),i<paid?1:0);
    if(i<paid){assert.match(await dialog.locator('[data-paid-facts]').innerText(),/2,910\.00/);assert.match(await dialog.locator('[data-paid-facts]').innerText(),/WHT: 90\.00/);}
    assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
    if(paid===1)await page.screenshot({path:out+`/partial-item-${status}-${locale}-${width}.png`});
   }
   assert.deepEqual(await page.evaluate(()=>window.writes),[]);assert.deepEqual(await page.evaluate(()=>window.fixtureCash),[]);scenarios++;
  }
 }
 return scenarios;
};
