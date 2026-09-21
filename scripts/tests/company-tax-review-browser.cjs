/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
module.exports=async({page,url,out,translate})=>{
 let scenarios=0;
 for(const [width,locale] of [[390,'th'],[1440,'th'],[1440,'en']]){
  const t=k=>translate(locale,'expenses.'+k),dialog=page.getByRole('dialog');await page.setViewportSize({width,height:950});
  const open=async scenario=>{await page.goto(`${url}/finance/expenses?tax059=1&locale=${locale}&scenario=${scenario}`);await page.locator('[data-request-row] button').click();await dialog.waitFor();};
  const choose=async(vat,wht)=>{await dialog.locator('#company-tax-vat_mode').selectOption(vat);await dialog.locator('#company-tax-wht_state').selectOption(wht);};
  await open('no-tax');
  assert.equal(await dialog.locator('details').filter({has:page.getByText(t('companyOptionalNote'),{exact:true})}).getAttribute('open'),null);
  assert.equal(await dialog.locator('textarea[required]').count(),0);assert.equal(await dialog.locator('#tax-vat_base,#tax-wht_base,input[name=vat_base]').count(),0);
  await dialog.getByRole('button',{name:t('companyReject'),exact:true}).click();await dialog.getByRole('alert').filter({hasText:t('companyRejectReason')}).waitFor();assert.deepEqual(await page.evaluate(()=>window.writes),[]);
  await open('no-tax');
  await choose('exclusive','withhold');await dialog.locator('[data-tax-summary]').getByText('312.00 THB',{exact:true}).waitFor();
  assert.ok((await dialog.locator('[data-tax-summary]').innerText()).includes('321.00 THB'));assert.equal(await dialog.locator('#company-tax-supplier_tax_id').count(),0);
  await dialog.locator('#company-tax-eligibility').selectOption('eligible');await dialog.locator('#company-tax-supplier_tax_id').waitFor();assert.ok(await dialog.getByRole('button',{name:t('companyApprove'),exact:true}).isDisabled());
  await dialog.locator('#company-tax-eligibility').selectOption('pending');await dialog.locator('#company-tax-supplier_tax_id').waitFor({state:'detached'});
  await dialog.locator('[data-readiness-checklist]').waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
  await dialog.locator('[data-tax-summary]').scrollIntoViewIfNeeded();await page.screenshot({path:out+`/company-tax-${locale}-${width}.png`});
  await dialog.getByRole('button',{name:t('companyApprove'),exact:true}).focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('[id^="company-item-"]')?.id.endsWith('002'));
  const calls=await page.evaluate(()=>window.calls),approval=calls.find(c=>c.name==='review_finance_expense'),settlement=calls.find(c=>c.name==='decide_finance_expense_settlement');
  assert.equal(approval.args.p_reason,'');assert.equal(settlement.args.p_amount,321);assert.deepEqual(await page.evaluate(()=>window.fixtureCash),[]);scenarios++;
  await dialog.getByRole('button',{name:t('companyReject'),exact:true}).click();await dialog.locator('#company-review-reason').fill('Synthetic rejection');await dialog.getByRole('button',{name:t('companyReject'),exact:true}).click();await dialog.locator('[id^="company-item-"]').waitFor({state:'hidden'});scenarios++;
  await open('no-tax');await choose('inclusive','none');await dialog.locator('[data-tax-summary]').getByText('19.63 THB',{exact:true}).waitFor();scenarios++;
  await choose('none','none');await dialog.getByText(t('eligibility')+': '+t('companyNotApplicable'),{exact:true}).waitFor();await dialog.locator('[data-tax-summary]').getByText('300.00 THB',{exact:true}).first().waitFor();
  await dialog.locator('[data-readiness-checklist]').waitFor({state:'detached'});assert.ok(await dialog.getByRole('button',{name:t('companyApprove'),exact:true}).isEnabled());scenarios++;
  await page.evaluate(()=>window.failPreview=true);await dialog.locator('#company-tax-vat_mode').selectOption('exclusive');await dialog.getByText(t('companyTaxPreviewFailed'),{exact:true}).waitFor();assert.ok(await dialog.getByRole('button',{name:t('companyApprove'),exact:true}).isDisabled());
  await choose('inclusive','none');await choose('exclusive','withhold');await dialog.locator('[data-tax-summary]').getByText('312.00 THB',{exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>window.writes),[]);scenarios++;
  await open('company-paid');await choose('none','withhold');await dialog.locator('#expense-settlement-mode').selectOption('company_bank');await dialog.getByText(t('companyPaidWhtAck'),{exact:true}).first().waitFor();assert.ok(await dialog.getByRole('button',{name:t('companyApprove'),exact:true}).isDisabled());scenarios++;
  console.log('PASS company tax review',locale,width);
 }
 return scenarios;
};
