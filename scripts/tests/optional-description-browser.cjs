/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
module.exports=async({page,url,out,translate})=>{
 let scenarios=0;
 for(const prefix of ['purchase','claim'])for(const[width,locale]of[[390,'th'],[1440,'th'],[1440,'en']]){
  const claim=prefix==='claim',t=k=>translate(locale,'expenses.'+k),dialog=page.getByRole('dialog');await page.setViewportSize({width,height:1050});
  await page.goto(`${url}/finance/expenses${claim?'/claims?claim061=1':'?purchase060=1'}&locale=${locale}`);await page.getByRole('button',{name:t(claim?'newClaim':'new'),exact:true}).first().click();
  const combo=dialog.locator(`#${prefix}-category`),description=dialog.getByLabel(t('additionalDetails'),{exact:true});assert.equal(await description.getAttribute('required'),null);
  for(let i=0;i<2;i++){
   if(i)await dialog.getByRole('button',{name:t('addItem'),exact:true}).click();await combo.click();assert.equal(await dialog.getByRole('listbox').getByRole('option').last().innerText(),locale==='th'?'อื่น ๆ':'Other');await combo.fill('ค่าเดินทาง');const general=dialog.getByRole('option',{name:locale==='th'?'ค่าเดินทาง':claim?'Travel (general)':'Travel',exact:true});await general.click();
   await dialog.locator(`#${prefix}-amount`).fill('300');if(!claim)await dialog.locator(`#${prefix}-vendor`).fill('Synthetic supplier');if(i)await description.fill('Historical-style details preserved');await dialog.getByRole('button',{name:t('addThisItem'),exact:true}).click();
  }
  await dialog.getByRole('button',{name:t('saveForLater'),exact:true}).click();await dialog.getByRole('button',{name:t('editRequest'),exact:true}).click();assert.equal(await dialog.locator('[data-request-item]').count(),2);
  await dialog.getByRole('button',{name:t('editItem'),exact:true}).first().click();assert.equal(await description.inputValue(),'');await combo.click();assert.equal(await dialog.getByRole('listbox').getByRole('option',{selected:true}).innerText(),locale==='th'?'ค่าเดินทาง':claim?'Travel (general)':'Travel');await combo.fill('fuel');assert.equal(await dialog.getByRole('option',{name:locale==='th'?'ค่าน้ำมัน':'Fuel',exact:true}).count(),1);await combo.press('Escape');assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);await page.screenshot({path:out+`/${prefix}-optional-details-${locale}-${width}.png`});await dialog.getByRole('button',{name:t('saveItemChanges'),exact:true}).click();
  await dialog.getByRole('button',{name:t('editItem'),exact:true}).last().click();assert.equal(await description.inputValue(),'Historical-style details preserved');await dialog.getByRole('button',{name:t('saveItemChanges'),exact:true}).click();await dialog.getByRole('button',{name:t(claim?'submitRequest':'sendForReview'),exact:true}).click();
  await page.waitForFunction(()=>window.calls.some(c=>c.name==='submit_finance_expense_request'));const saves=await page.evaluate(()=>window.calls.filter(c=>c.name==='save_finance_expense_request'));assert.equal(saves.at(-1).args.p_items[0].input.description,'');assert.equal(saves.at(-1).args.p_items[1].input.description,'Historical-style details preserved');scenarios++;console.log('PASS optional description',prefix,width,locale);
 }
 return scenarios;
};
