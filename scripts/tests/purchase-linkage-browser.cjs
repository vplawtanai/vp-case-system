/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
module.exports=async({page,url,out,translate})=>{
 const links=require('./linkage-combobox-helper.cjs')(page.getByRole('dialog'),'purchase');
 let scenarios=0;
 for(const [width,locale] of [[390,'th'],[1440,'th'],[1440,'en']]){
  const t=k=>translate(locale,'expenses.'+k),dialog=page.getByRole('dialog');
  await page.setViewportSize({width,height:1050});
  for(const mode of ['none','empty','client','case','advisory','cleared']){
   await page.goto(`${url}/finance/expenses?purchase060=1&locale=${locale}`);
   await page.getByRole('button',{name:t('new'),exact:true}).click();
   const toggle=dialog.getByRole('checkbox',{name:t('purchaseRelatedWork'),exact:true});
   assert.equal(await toggle.isChecked(),false);assert.equal(await dialog.locator('#purchase-context').count(),0);
   await dialog.locator('#purchase-category').click();await dialog.getByRole('option',{name:locale==='th'?'วัสดุสำนักงาน':'Office supplies',exact:true}).click();await dialog.locator('#purchase-amount').fill('300');await dialog.locator('#purchase-description').fill('Optional linkage fixture');await dialog.locator('#purchase-vendor').fill('Typed recipient');
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
    if(mode==='cleared'){await toggle.uncheck();client=null;caseId=null;assert.equal(await dialog.locator('#purchase-context').count(),0);}
   }
   const expected={client_id:client,case_id:caseId,advisory_matter_id:advisory};
   await dialog.getByRole('button',{name:t('addThisItem'),exact:true}).click();
   await dialog.getByRole('button',{name:t('saveForLater'),exact:true}).click();
   await dialog.getByRole('button',{name:t('editRequest'),exact:true}).waitFor();
   const calls=await page.evaluate(()=>window.calls),saved=calls.find(c=>c.name==='save_finance_expense_request').args.p_items[0].input;
   for(const [key,value] of Object.entries(expected))assert.equal(saved[key],value);
   assert.equal(await dialog.locator('[data-purchase-linkage]').count(),client?1:0);
   if(client){assert.match(await dialog.locator('[data-purchase-linkage]').innerText(),/Synthetic client/);if(caseId)assert.match(await dialog.locator('[data-purchase-linkage]').innerText(),/Synthetic case/);if(advisory)assert.match(await dialog.locator('[data-purchase-linkage]').innerText(),/Synthetic advisory/);}
   await dialog.getByRole('button',{name:t('editRequest'),exact:true}).click();await dialog.getByRole('button',{name:t('editItem'),exact:true}).click();
   assert.equal(await toggle.isChecked(),!!client);
   if(client){assert.equal(await links.value('client'),client);assert.equal(await links.value('work'),caseId?'case:55':advisory?'advisory:advisory-test':'');}
   if(mode==='advisory'){await dialog.locator('#purchase-context').scrollIntoViewIfNeeded();assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);await page.screenshot({path:out+`/purchase-linkage-${locale}-${width}.png`});}
   await dialog.getByRole('button',{name:t('saveItemChanges'),exact:true}).click();await dialog.getByRole('button',{name:t('sendForReview'),exact:true}).click();
   await dialog.getByRole('heading',{name:t('purchaseRequestReview'),exact:true}).waitFor();
   assert.equal(await dialog.locator('[data-purchase-linkage]').count(),client?1:0);
   if(mode==='advisory')await page.screenshot({path:out+`/purchase-linkage-review-${locale}-${width}.png`});
   assert.deepEqual(await page.evaluate(()=>window.fixtureCash),[]);scenarios++;
  }
 }
 console.log('PASS optional purchase linkage',scenarios);return scenarios;
};
