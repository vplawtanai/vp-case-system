/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
module.exports=async({page,url,out,translate})=>{
 const links=require('./linkage-combobox-helper.cjs')(page.getByRole('dialog'),'claim');
 let scenarios=0;
 for(const [width,locale] of [[390,'th'],[1440,'th'],[1440,'en']]){
  const t=k=>translate(locale,'expenses.'+k),dialog=page.getByRole('dialog');
  await page.setViewportSize({width,height:1050});
  for(const mode of ['none','empty','client','case','advisory','cleared']){
   await page.goto(`${url}/finance/expenses/claims?claim061=1&locale=${locale}`);
   await page.getByRole('button',{name:t('newClaim'),exact:true}).first().click();
   const toggle=dialog.getByRole('checkbox',{name:t('purchaseRelatedWork'),exact:true});
   assert.equal(await toggle.isChecked(),false);assert.equal(await dialog.locator('#claim-context').count(),0);
   await dialog.locator('#claim-category').click();await dialog.getByRole('option',{name:locale==='th'?'ค่าวัสดุ / อุปกรณ์สำนักงาน':'Office supplies / Equipment',exact:true}).click();await dialog.locator('#claim-amount').fill('300');await dialog.locator('#claim-description').fill('Optional linkage fixture');await dialog.locator('#claim-vendor').fill('Typed recipient');
   let client=null,caseId=null,advisory=null;
   if(mode!=='none'){
    await toggle.check();
    client=await links.firstClient();
    if(mode==='empty')client=null;
    else if(mode==='client') await links.choose('client',client);
    else {
     await links.choose('work','case:55');
     assert.equal(await links.value('client'),client);
     await links.choose('client','other-client');
     assert.equal(await links.value('work'),'');
     await links.absent('case:55');
     await links.choose('client',mode==='case'?client:'');
     await links.choose('work',mode==='advisory'?'advisory:advisory-test':'case:55');
     assert.equal(await links.value('client'),client);
     if(mode==='advisory')advisory='advisory-test';else caseId=55;
    }
    if(mode==='cleared'){await toggle.uncheck();client=null;caseId=null;assert.equal(await dialog.locator('#claim-context').count(),0);}
   }
   const expected={client_id:client,case_id:caseId,advisory_matter_id:advisory};
   await dialog.getByRole('button',{name:t('addThisItem'),exact:true}).click();
   await dialog.getByRole('button',{name:t('saveForLater'),exact:true}).click();
   await dialog.getByRole('button',{name:t('editRequest'),exact:true}).waitFor();
   const calls=await page.evaluate(()=>window.calls),saved=calls.find(c=>c.name==='save_finance_expense_request').args.p_items[0].input;
   for(const [key,value] of Object.entries(expected))assert.equal(saved[key],value);
   assert.equal(await dialog.locator('[data-claim-linkage]').count(),client?1:0);
   if(client){assert.match(await dialog.locator('[data-claim-linkage]').innerText(),/Synthetic client/);if(caseId)assert.match(await dialog.locator('[data-claim-linkage]').innerText(),/Synthetic case/);if(advisory)assert.match(await dialog.locator('[data-claim-linkage]').innerText(),/Synthetic advisory/);}
   await dialog.getByRole('button',{name:t('editRequest'),exact:true}).click();await dialog.getByRole('button',{name:t('editItem'),exact:true}).click();
   assert.equal(await toggle.isChecked(),!!client);
   if(client){assert.equal(await links.value('client'),client);assert.equal(await links.value('work'),caseId?'case:55':advisory?'advisory:advisory-test':'');}
   if(mode==='advisory'){await dialog.locator('#claim-context').scrollIntoViewIfNeeded();assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);await page.screenshot({path:out+`/claim-linkage-${locale}-${width}.png`});}
   await dialog.getByRole('button',{name:t('saveItemChanges'),exact:true}).click();await dialog.getByRole('button',{name:t('submitRequest'),exact:true}).click();
   await dialog.locator('#claim-approved').waitFor();assert.equal(await dialog.locator('#claim-approved').inputValue(),'300');
   assert.equal(await dialog.locator('[data-claim-linkage]').count(),client?1:0);
   assert.ok(!(await dialog.innerText()).includes('WHT'));
   if(mode==='case')await dialog.locator('#claim-approved').fill('250');
   if(mode==='advisory')await page.evaluate(()=>window.loseReviewResponse=true);
   await dialog.getByRole('button',{name:t('claimApprove'),exact:true}).click();
   if(mode==='advisory'){await dialog.getByRole('button',{name:t('companyRetryReview'),exact:true}).click();}
   await dialog.locator('#claim-approved').waitFor({state:'hidden'});
   const result=await page.evaluate(()=>({item:window.fixtureRequests[0].items[0],cash:window.fixtureCash,calls:window.calls}));
   assert.equal(result.item.obligation.gross_amount,mode==='case'?250:300);assert.equal(result.item.settlement.mode,'reimburse');assert.equal(result.cash.length,0);
   assert.equal(result.calls.filter(c=>c.name==='review_finance_employee_reimbursement').at(-1).args.p_amount,mode==='case'?250:300);
   assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);await page.screenshot({path:out+`/claim-review-${mode}-${locale}-${width}.png`});
   console.log('PASS reimbursement',width,locale,mode);scenarios++;
  }
 }
 for(const [width,locale] of [[390,'th'],[1440,'th'],[1440,'en']])for(const [scenario,status] of [['submitted','claimPending'],['waiting','claimAwaitingRefund'],['paid','claimRefunded'],['rejected','claimRejected']]){
  await page.setViewportSize({width,height:1050});await page.goto(`${url}/finance/expenses/claims?claim061=1&locale=${locale}&scenario=${scenario}`);
  const row=page.locator('[data-request-row]');await row.waitFor();assert.ok((await row.innerText()).includes(translate(locale,'expenses.'+status)));assert.equal(await row.locator('[data-tone]').getAttribute('data-tone'),({claimPending:'warn',claimAwaitingRefund:'payable',claimRefunded:'good',claimRejected:'bad'})[status]);assert.equal(await page.locator('[data-claim-summary] article').count(),4);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.ok((await row.locator('button').boundingBox()).width>=70);
  if(scenario==='submitted')await page.screenshot({path:out+`/claim-list-${locale}-${width}.png`,fullPage:true});scenarios++;
 }
 // Multi-item authoring: copy, edit, delete, add and reopen use the real envelope handlers.
 const t=k=>translate('th','expenses.'+k),dialog=page.getByRole('dialog');
 await page.goto(`${url}/finance/expenses/claims?claim061=1&locale=th`);
 await page.getByRole('button',{name:t('newClaim'),exact:true}).first().click();
 await dialog.locator('#claim-category').click();await dialog.getByRole('option',{name:'ค่าแท็กซี่ / Grab / รถรับจ้าง',exact:true}).click();await dialog.locator('#claim-amount').fill('3000');await dialog.locator('#claim-description').fill('Personal trip');
 await dialog.getByRole('button',{name:t('addThisItem'),exact:true}).click();
 await dialog.getByRole('button',{name:t('copyItem'),exact:true}).click();assert.equal(await dialog.locator('[data-request-item]').count(),2);
 await dialog.getByRole('button',{name:t('editItem'),exact:true}).last().click();await dialog.locator('#claim-amount').fill('850');await dialog.getByRole('button',{name:t('saveItemChanges'),exact:true}).click();
 await dialog.getByRole('button',{name:t('removeItem'),exact:true}).last().click();assert.equal(await dialog.locator('[data-request-item]').count(),1);
 await dialog.getByRole('button',{name:t('addItem'),exact:true}).click();await dialog.locator('#claim-category').click();await dialog.getByRole('option',{name:'ค่าแท็กซี่ / Grab / รถรับจ้าง',exact:true}).click();await dialog.locator('#claim-amount').fill('850');await dialog.locator('#claim-description').fill('Second trip');await dialog.getByRole('button',{name:t('addThisItem'),exact:true}).click();
 await dialog.getByRole('button',{name:t('saveForLater'),exact:true}).click();await dialog.getByRole('button',{name:t('editRequest'),exact:true}).click();assert.equal(await dialog.locator('[data-request-item]').count(),2);
 await dialog.getByRole('button',{name:t('submitRequest'),exact:true}).click();await dialog.locator('#claim-approved').waitFor();
 assert.equal(await dialog.locator('[data-review-item]').count(),2);await dialog.getByRole('button',{name:t('claimApprove'),exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-claim-review] h3')?.textContent==='Second trip');
 await dialog.getByRole('button',{name:t('companyReject'),exact:true}).click();assert.ok(await dialog.getByRole('alert').count());await dialog.locator('#claim-review-note').fill('Not reimbursable');await dialog.getByRole('button',{name:t('companyReject'),exact:true}).click();await dialog.locator('#claim-approved').waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>window.fixtureCash.length),0);scenarios++;console.log('PASS multi-item edit/copy/delete/add/draft/submit/rejection');
 return scenarios;
};
