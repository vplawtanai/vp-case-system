/* eslint-disable @typescript-eslint/no-require-imports */
// Runs only Company Expense supplier scenarios using the existing local React/RPC fixture.
const assert=require('node:assert/strict');
module.exports=async function supplierQa({page,url,out,translate,id}){
 let count=0;
 const fits=async()=>{
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  const top=page.getByRole('dialog').last();assert.equal(await top.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
  const b=await top.boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=page.viewportSize().width+1&&b.y+b.height<=page.viewportSize().height+1);
 };
 for(const width of [390,1440])for(const locale of width===1440?['th','en']:['th']){
  const t=k=>translate(locale,'expenses.'+k),save=translate(locale,'common.actions.save');await page.setViewportSize({width,height:950});
  async function open(supplier='none',scenario='missing-supplier'){
   await page.goto(`${url}/finance/expenses?locale=${locale}&scenario=${scenario}${supplier?`&supplier=${supplier}`:''}`);
   await page.locator('[data-request-row] button').click();const review=page.getByRole('dialog');await review.waitFor();
   await review.locator('#company-review-reason').fill('Synthetic review only');await review.getByLabel(t('companyNoTaxAck')).check();return review;
  }
  async function add(review){await review.getByRole('button',{name:t('companyAddSupplier'),exact:true}).click();const setup=page.getByRole('dialog').last();await setup.locator('#payee-name').waitFor();return setup;}
  async function selected(){await page.waitForFunction(()=>document.querySelectorAll('[role=dialog]').length===1&&!!document.querySelector('#settlement-payee')?.value);await page.waitForFunction(()=>document.activeElement?.id==='settlement-payee');}
  async function noFinancialWrites(){const writes=await page.evaluate(()=>window.writes);assert.ok(writes.every(w=>w==='save_finance_payee'),JSON.stringify(writes));}
  let review=await open('existing');
  const options=review.locator('#settlement-payee option');assert.equal(await options.count(),2);assert.ok(!(await options.allTextContents()).some(s=>s.includes('employee')));
  assert.ok(await review.getByRole('button',{name:t('companyApprove'),exact:true}).isDisabled());
  await review.locator('#settlement-payee').selectOption(id(4));assert.ok(await review.getByRole('button',{name:t('companyApprove'),exact:true}).isEnabled());
  assert.equal(await review.locator('[aria-live="polite"] li').filter({hasText:t('companyNeedSupplier')}).count(),0);assert.deepEqual(await page.evaluate(()=>window.writes),[]);await fits();count++;
  review=await open('existing');await review.getByRole('button',{name:t('companyUseSupplier'),exact:true}).click();await selected();assert.equal(await review.locator('#settlement-payee').inputValue(),id(4));assert.deepEqual(await page.evaluate(()=>window.writes),[]);count++;
  for(const entity of ['natural_person','juristic_person']){
   review=await open();assert.equal(await review.locator('#settlement-payee option').count(),1);let setup=await add(review);
   assert.ok((await setup.innerText()).includes(t('companyAddSupplier')));assert.equal(await setup.locator('#payee-name').inputValue(),'Synthetic Supplier');
   assert.ok(await setup.locator('#payee-bank').isHidden());assert.equal(await setup.locator('details[open]').count(),0);assert.equal(await setup.locator('#payee-tax').getAttribute('required'),null);
   await setup.locator('#payee-type').selectOption(entity);await fits();await page.screenshot({path:out+`/supplier-create-${entity}-${locale}-${width}.png`});
   const summary=setup.locator('summary');await summary.focus();await page.keyboard.press('Enter');assert.ok(await setup.locator('#payee-bank').isVisible());await page.keyboard.press('Enter');assert.ok(await setup.locator('#payee-bank').isHidden());
   if(entity==='natural_person'){
    await page.evaluate(()=>{window.denyLookup=true;});await setup.getByRole('button',{name:save,exact:true}).click();await setup.getByRole('alert').waitFor();assert.deepEqual(await page.evaluate(()=>window.writes),[]);
    await page.evaluate(()=>{window.denyPayee=true;});await setup.getByRole('button',{name:save,exact:true}).click();await page.waitForFunction(()=>window.calls.filter(c=>c.name==='save_finance_payee').length===1);await setup.getByRole('button',{name:save,exact:true}).waitFor();
    await page.waitForFunction(()=>!document.querySelector('#payee-name')?.disabled);assert.deepEqual(await page.evaluate(()=>window.writes),[]);
   }
   await setup.getByRole('button',{name:save,exact:true}).click();await selected();review=page.getByRole('dialog');
   assert.ok(await review.getByRole('button',{name:t('companyApprove'),exact:true}).isEnabled());assert.equal(await review.locator('[aria-live="polite"] li').filter({hasText:t('companyNeedSupplier')}).count(),0);
   assert.equal(await review.getByRole('button',{name:t('companyAddSupplier'),exact:true}).count(),0);assert.equal(await review.getByRole('button',{name:t('companyUseSupplier'),exact:true}).count(),0);
   const calls=await page.evaluate(()=>window.calls),last=calls.filter(c=>c.name==='save_finance_payee').at(-1).args;
   assert.equal(last.p_input.entity_type,entity);assert.equal(last.p_input.tax_id,null);assert.equal(last.p_input.destination,null);assert.equal(last.p_profile_id,null);assert.equal(await review.locator('#settlement-payee').inputValue(),last.p_id);
   assert.equal((await page.evaluate(()=>window.writes)).length,1);await noFinancialWrites();await fits();await page.screenshot({path:out+`/supplier-selected-${entity}-${locale}-${width}.png`});count++;
  }
  for(const matching of ['tax','name']){
   review=await open('existing');const setup=await add(review);
   if(matching==='tax'){await setup.locator('#payee-name').fill('Another spelling');await setup.locator('#payee-tax').fill('1234567890123');}
   else await setup.locator('#payee-name').fill('  SYNTHETIC SUPPLIER  ');
   await setup.getByRole('button',{name:save,exact:true}).click();await setup.getByRole('status').waitFor();assert.ok((await setup.innerText()).includes(t('companySupplierExists')));
   assert.deepEqual(await page.evaluate(()=>window.writes),[]);await fits();await page.screenshot({path:out+`/supplier-duplicate-${matching}-${locale}-${width}.png`});
   await setup.getByRole('button',{name:t('companyUseSupplier'),exact:true}).click();await selected();assert.equal(await page.locator('#settlement-payee').inputValue(),id(4));assert.deepEqual(await page.evaluate(()=>window.writes),[]);count++;
  }
  review=await open('', 'no-tax');assert.ok(await review.locator('#settlement-payee').getAttribute('readonly')!==null);assert.equal(await review.locator('select#settlement-payee').count(),0);assert.equal(await review.getByRole('button',{name:t('companyAddSupplier'),exact:true}).count(),0);await fits();count++;
  review=await open('', 'reimbursement');assert.equal(await review.locator('#settlement-payee').inputValue(), 'พนักงานทดสอบ / Synthetic employee');assert.equal(await review.getByRole('button',{name:t('companyAddSupplier'),exact:true}).count(),0);await noFinancialWrites();count++;
  console.log('PASS supplier selection/create/duplicates/readiness/personal regression',locale,width);
 }
 return count;
};
