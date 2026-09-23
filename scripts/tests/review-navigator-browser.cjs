/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
module.exports=async({page,url,out,translate})=>{
 let scenarios=0;
 for(const claim of [false,true])for(const [width,locale] of [[390,'th'],[1440,'th'],[1440,'en']]){
  const t=(key,values)=>translate(locale,'expenses.'+key,values),dialog=page.getByRole('dialog');
  const base=`${url}/finance/expenses${claim?'/claims':''}?${claim?'claim061':'purchase060'}=1&navigator=1&scenario=submitted&locale=${locale}`;
  await page.setViewportSize({width,height:1050});
  for(const states of ['pending,pending,pending','approved,pending,pending','approved,reject,pending','approved,reject,approved','paid,approved,reject','paid,paid,reject']){
   await page.goto(base+'&states='+states);const row=page.locator('[data-request-row]').first();await row.waitFor();
   const cell=row.locator('[data-request-status]');assert.ok((await cell.boundingBox()).height<=46,'two-line status');
   const split=states.split(','),reviewed=split.filter(s=>s!=='pending').length;
   assert.ok((await row.locator('[data-review-progress]').innerText()).includes(t(reviewed===3&&!claim?'reviewCompactDone':'reviewCompactCount',{count:reviewed,total:3})));
   if(reviewed===3)assert.ok(!(await row.innerText()).includes(t('claimPending')));
   await row.getByRole('button').click();await dialog.locator('[data-review-item]').first().waitFor();
   assert.equal(await dialog.locator('[data-review-item]').count(),3);assert.equal(await dialog.locator('select[id$="review-item"]').count(),0);
   for(let n=0;n<3;n++){
    await dialog.locator('[data-review-item]').nth(n).click();assert.equal(await dialog.locator('[data-review-item]').nth(n).getAttribute('aria-current'),'true');
    if(split[n]!=='pending')assert.equal(await dialog.getByRole('button',{name:t(claim?'claimApprove':'companyApprove'),exact:true}).count(),0);
   }
   assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   if(states==='approved,reject,pending')await page.screenshot({path:out+`/navigator-${claim?'claim':'company'}-${locale}-${width}.png`,fullPage:true});
   scenarios++;
  }
  for(const count of [1,2,4]){
   await page.goto(base+'&navItems='+count+'&longTitles=1');const row=page.locator('[data-request-row]').first();await row.waitFor();
   const status=row.locator('[data-request-status]');assert.ok((await status.boundingBox()).height<=46,'status has at most two text lines');
   assert.equal(await status.locator('[data-tone]').count(),1);
   await row.getByRole('button').click();assert.equal(await dialog.locator('[data-review-item]').count(),count);
   assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await dialog.locator('[data-review-item]').last().click();
   assert.equal(await dialog.locator('[data-review-item]').last().getAttribute('aria-current'),'true');
   await page.screenshot({path:out+`/polish-${claim?'claim':'company'}-${locale}-${width}-${count}.png`,fullPage:true});scenarios++;
  }
  await page.goto(base.replace('scenario=submitted','scenario=draft'));await page.locator('[data-request-row]').first().getByRole('button').click();
  await dialog.getByRole('button',{name:t(claim?'submitRequest':'sendForReview'),exact:true}).click();
  const selected=()=>dialog.locator('[data-review-item][aria-current=true]');
  await selected().waitFor();assert.match(await selected().innerText(),/Synthetic item 1/);
  if(!claim)await dialog.locator('#purchase-review-recipient').fill('Synthetic vendor');
  const approve=dialog.getByRole('button',{name:t(claim?'claimApprove':'companyApprove'),exact:true});
  await page.evaluate(()=>window.loseReviewResponse=true);await approve.click();
  await dialog.getByRole('button',{name:t('companyRetryReview'),exact:true}).waitFor();assert.match(await selected().innerText(),/Synthetic item 1/);
  await dialog.getByRole('button',{name:t('companyRetryReview'),exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-review-item][aria-current=true]')?.textContent.includes('Synthetic item 2'));
  // A reviewed item is still openable; returning to it must not trigger auto-next again.
  await dialog.locator('[data-review-item]').nth(0).click();assert.match(await selected().innerText(),/Synthetic item 1/);assert.equal(await approve.count(),0);
  await dialog.locator('[data-review-item]').nth(1).click();
  await dialog.getByRole('button',{name:t('companyReject'),exact:true}).click();
  await dialog.locator(claim?'#claim-review-note':'textarea').fill('Synthetic rejection');
  await dialog.getByRole('button',{name:t('companyReject'),exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-review-item][aria-current=true]')?.textContent.includes('Synthetic item 3'));
  await approve.click();await dialog.locator('[data-item-navigator]').getByText(t('reviewAllDone',{count:3,total:3}),{exact:true}).waitFor();
  assert.equal(await approve.count(),0);assert.equal(await page.evaluate(()=>window.fixtureCash.length),0);
  assert.deepEqual(await page.evaluate(()=>window.fixtureRequests[0].items.map(i=>i.status)),['accepted','rejected','accepted']);
  scenarios++;
 }
 return scenarios;
};
