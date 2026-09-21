/* eslint-disable @typescript-eslint/no-require-imports */
// 058 declaration UI and existing controlled Finance confirmation, all on synthetic local data.
const assert=require('node:assert/strict');
module.exports=async({page,url,out,translate,id})=>{
 let scenarios=0;
 for(const width of [390,1440])for(const locale of width===1440?['th','en']:['th']){
  const t=k=>translate(locale,'expenses.'+k);await page.setViewportSize({width,height:950});
  const fits=async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await page.getByRole('dialog').last().evaluate(e=>e.scrollWidth>e.clientWidth+1),false);};
  const openCreate=async()=>{await page.goto(`${url}/finance/expenses?locale=${locale}`);await page.getByRole('button',{name:t('new'),exact:true}).click();await page.locator('#expense-category').waitFor();};
  const fill=async(description)=>{await page.locator('#expense-category').selectOption('company.travel');await page.locator('#expense-gross_amount').fill('100');await page.locator('#expense-description').fill(description);};
  await openCreate();await fill('Synthetic incomplete money');const dialog=page.getByRole('dialog');
  assert.equal(await dialog.getByRole('radio').count(),2);assert.equal(await page.locator('#expense-handling').count(),0);
  await dialog.getByRole('button',{name:t('addThisItem'),exact:true}).click();assert.ok(await dialog.getByRole('button',{name:t('sendForReview'),exact:true}).isDisabled());assert.ok(await dialog.getByRole('button',{name:t('saveForLater'),exact:true}).isEnabled());
  await dialog.getByRole('button',{name:t('saveForLater'),exact:true}).click();await page.waitForFunction(()=>window.writes.length===1&&document.querySelector('[aria-controls^="company-item-"]'));
  assert.equal((await page.evaluate(()=>window.calls)).find(c=>c.name==='save_finance_expense_request').args.p_items[0].input.creator_payment_fact,null);
  assert.ok(await page.getByRole('dialog').getByRole('button',{name:t('sendForReview'),exact:true}).isDisabled());scenarios++;
  await openCreate();
  for(const fact of ['company_paid','unpaid']){
   if(fact==='unpaid')await page.getByRole('dialog').getByRole('button',{name:t('addItem'),exact:true}).click();await fill('Synthetic '+fact);
   const radio=page.locator(`input[type=radio][value=${fact}]`);await radio.check();await radio.focus();assert.ok(await radio.evaluate(e=>document.activeElement===e));
   if(fact==='unpaid'){assert.equal(await page.locator('#expense-payment-account').count(),0);await page.locator('#expense-supplier_payee_id').selectOption(id(4));}
   await page.locator('#expense-vendor_name').fill('Synthetic vendor');await page.locator('summary').filter({hasText:t('taxIfKnown')}).click();await page.locator('#expense-vat_awareness').selectOption('no');await page.locator('#expense-wht_awareness').selectOption('no');
   await fits();await page.screenshot({path:out+`/two-flow-create-${fact}-${locale}-${width}.png`});await page.getByRole('button',{name:t('addThisItem'),exact:true}).click();
   try{await page.locator('#expense-category').waitFor({state:'hidden',timeout:5000});}catch(e){console.error('Item validity',await page.locator('form input, form select').evaluateAll(es=>es.map(e=>({id:e.id,value:e.value,invalid:e.validationMessage}))));throw e;}
  }
  await page.getByRole('button',{name:t('sendForReview'),exact:true}).click();await page.locator('[id^="company-item-"]').waitFor();
  const calls=await page.evaluate(()=>window.calls),lines=calls.find(c=>c.name==='save_finance_expense_request').args.p_items;assert.deepEqual(lines.map(i=>i.input.creator_payment_fact),['company_paid','unpaid']);
  assert.deepEqual(await page.evaluate(()=>window.writes),['save_finance_expense_request','submit_finance_expense_request']);
  assert.ok((await page.getByRole('dialog').innerText()).includes(t('handlingCompanyPaid')));assert.ok(await page.getByRole('button',{name:t('companyApprove'),exact:true}).isDisabled());
  assert.ok((await page.locator('form[data-review-plan="settlement"]').innerText()).includes(t('companyPaidChannel')));
  assert.ok(!(await page.locator('form[data-review-plan="settlement"]').innerText()).includes(t('companyMoneyDecision')));
  await page.locator('#expense-settlement-mode').selectOption('company_bank');await page.locator('#company-review-reason').fill('Synthetic review');await page.getByLabel(t('companyNoTaxAck')).check();
  await page.getByRole('button',{name:t('companyApprove'),exact:true}).click();await page.waitForFunction(()=>document.querySelector('[id^="company-item-"]')?.textContent.includes('Synthetic unpaid'));
  assert.equal(await page.locator('#expense-settlement-mode').count(),0);assert.ok((await page.getByRole('dialog').innerText()).includes(t('companyUnpaid')));
  assert.ok(await page.locator('#settlement-payee').getAttribute('readonly')!==null);await page.locator('#company-review-reason').fill('Synthetic unpaid review');await page.getByLabel(t('companyNoTaxAck')).check();await fits();await page.screenshot({path:out+`/two-flow-review-unpaid-${locale}-${width}.png`});
  await page.getByRole('button',{name:t('companyApprove'),exact:true}).click();await page.locator('[id^="company-item-"]').waitFor({state:'hidden'});
  const decisions=(await page.evaluate(()=>window.calls)).filter(c=>c.name==='decide_finance_expense_settlement');assert.deepEqual(decisions.map(c=>c.args.p_mode),['company_bank','supplier_unpaid']);assert.equal(decisions[0].args.p_payee,null);assert.equal(decisions[1].args.p_payee,id(4));
  assert.ok((await page.evaluate(()=>window.writes)).every(w=>['save_finance_expense_request','submit_finance_expense_request','review_finance_expense','review_finance_expense_tax','decide_finance_expense_settlement'].includes(w)));scenarios++;
  assert.deepEqual(await page.evaluate(()=>window.fixtureCash),[]);
  await page.locator(`[aria-controls="company-item-${lines[0].id}"]`).click();await page.locator('#expense-payment-account').selectOption(id(2));
  await page.getByRole('button',{name:t('preparePayment'),exact:true}).click();await page.getByLabel(t('paymentAck')).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.fixtureCash),[]);assert.ok(await page.getByRole('button',{name:t('confirmPayment'),exact:true}).isDisabled());
  await page.getByLabel(t('paymentAck')).check();await fits();await page.screenshot({path:out+`/two-flow-confirm-paid-${locale}-${width}.png`});
  await page.getByRole('button',{name:t('confirmPayment'),exact:true}).click();await page.waitForFunction(()=>window.fixtureCash.length===1);assert.equal((await page.evaluate(()=>window.fixtureCash))[0].amount,100);scenarios++;
  for(const fact of ['company_paid','unpaid']){
   await page.goto(`${url}/finance/expenses?locale=${locale}&role=creator`);await page.getByRole('button',{name:t('new'),exact:true}).click();await page.locator('#expense-category').waitFor();
   await fill('Synthetic staff '+fact);await page.locator(`input[type=radio][value=${fact}]`).check();await page.locator('#expense-vendor_name').fill('Supplier reported by staff');
   assert.equal(await page.locator('#expense-payment-account').count(),0);assert.equal(await page.locator('#expense-paid-on').count(),0);
   await page.getByRole('button',{name:t('addThisItem'),exact:true}).click();await page.getByRole('button',{name:t('sendForReview'),exact:true}).click();await page.waitForFunction(()=>window.writes.length===2);
   const sent=(await page.evaluate(()=>window.calls)).find(c=>c.name==='save_finance_expense_request').args.p_items[0].input;
   assert.equal(sent.creator_payment_fact,fact);assert.equal(sent.bank_account_id,null);assert.equal(sent.cash_location_id,null);assert.equal(sent.vat_awareness,'unknown');assert.equal(sent.wht_awareness,'unknown');
   const toggle=page.locator('[aria-controls^="company-item-"]').first();await toggle.click();await fits();assert.deepEqual(await page.evaluate(()=>window.fixtureCash),[]);assert.equal(await page.locator('#expense-settlement-mode').count(),0);scenarios++;
  }
  for(const scenario of ['reimbursement','unknown']){
   await page.goto(`${url}/finance/expenses?locale=${locale}&scenario=${scenario}`);await page.locator('[data-request-row] button').click();await page.locator('#expense-settlement-mode').waitFor();
   assert.equal(await page.locator('#expense-settlement-mode').inputValue(),scenario==='reimbursement'?'reimburse':'undecided');await fits();assert.deepEqual(await page.evaluate(()=>window.writes),[]);scenarios++;
  }
  console.log('PASS two-flow 058 declarations, controlled paid confirmation and historical compatibility',locale,width);
 }
 return scenarios;
};
