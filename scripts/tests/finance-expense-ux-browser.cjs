/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
module.exports=async function({page,url,out,translate,id}){
 let scenarios=0;
 async function fits(){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);for(const dialog of await page.getByRole('dialog').all()){assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);const b=await dialog.boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=page.viewportSize().width+1&&b.y+b.height<=page.viewportSize().height+1);}}
 for(const [width,locale] of [[390,'th'],[1440,'th'],[1440,'en']]){
  const t=k=>translate(locale,'expenses.'+k),dialog=page.getByRole('dialog');await page.setViewportSize({width,height:950});
  const open=async(scenario,extra='')=>{await page.goto(`${url}/finance/expenses?ux=1&locale=${locale}&scenario=${scenario}${extra}`);await page.locator('[data-request-row] button').click();await dialog.waitFor();};
  await open('no-tax','&admin=1');
  assert.ok(await dialog.getByRole('button',{name:t('companyApprove'),exact:true}).isDisabled());assert.ok(await dialog.getByRole('button',{name:t('companyReject'),exact:true}).isDisabled());
  assert.equal(await dialog.locator('#settlement-payee').getAttribute('readonly'),'');assert.equal(await dialog.getByRole('link',{name:t('managePayee')}).count(),0);
  assert.equal(await dialog.locator('#settlement-due').getAttribute('required'),null);assert.ok((await dialog.innerText()).includes(t('dueOptional')));
  assert.equal(await dialog.locator('[data-expense-technical]').count(),1);assert.equal(await dialog.locator('[data-expense-technical]').getAttribute('open'),null);assert.ok(!(await dialog.innerText()).includes('technical_marker'));
  const before=await dialog.locator('[data-readiness-checklist] li').count();await dialog.getByLabel(t('companyNoTaxAck')).check();await page.waitForFunction(n=>document.querySelectorAll('[data-readiness-checklist] li').length<n,before);
  await dialog.locator('#company-review-reason').fill('Synthetic normal approval required by backend');await dialog.locator('[data-readiness-checklist]').waitFor({state:'detached'});
  await fits();await page.screenshot({path:out+`/ux-review-${locale}-${width}.png`});
  await dialog.getByRole('button',{name:t('companyApprove'),exact:true}).click();await page.waitForFunction(()=>document.querySelector('[id^="company-item-"]')?.id.endsWith('002'));
  assert.deepEqual(await page.evaluate(()=>window.writes),['review_finance_expense','review_finance_expense_tax','decide_finance_expense_settlement']);assert.deepEqual(await page.evaluate(()=>window.fixtureCash),[]);
  await dialog.locator('#company-review-reason').fill('Synthetic rejection');await dialog.getByRole('button',{name:t('companyReject'),exact:true}).click();await dialog.locator('[id^="company-item-"]').waitFor({state:'hidden'});
  await dialog.locator('[data-expense-technical] summary').click();assert.ok((await dialog.innerText()).includes('technical_marker'));scenarios++;
  // Company-paid review still prepares first; acknowledgement is required for actual confirmation.
  await open('company-paid');await dialog.getByLabel(t('companyNoTaxAck')).check();await dialog.locator('#expense-settlement-mode').selectOption('company_bank');await dialog.locator('#company-review-reason').fill('Synthetic paid review');await dialog.getByRole('button',{name:t('companyApprove'),exact:true}).click();await page.waitForFunction(()=>document.querySelector('[id^="company-item-"]')?.id.endsWith('002'));
  await dialog.locator('[aria-controls^="company-item-"]').first().click();const selector=dialog.locator('#expense-payment-account');await selector.waitFor();
  assert.ok(await selector.locator('option[value=ktb]').isDisabled());assert.ok((await selector.locator('option[value=ktb]').innerText()).includes(t('accountOpeningMissing')));assert.ok(await selector.locator('option[value=denied]').isDisabled());
  assert.equal(await dialog.getByRole('button',{name:t('preparePayment'),exact:true}).count(),0);await selector.selectOption('handoff');assert.ok((await dialog.innerText()).includes(t('accountConfirmDenied')));assert.ok(await dialog.getByRole('button',{name:t('recordPaidOutflow'),exact:true}).isEnabled());
  await selector.selectOption(id(2));assert.ok(!(await selector.locator(`option[value="${id(2)}"]`).isDisabled()));await dialog.locator('#payout-date').fill('2026-09-20');
  await fits();await page.screenshot({path:out+`/ux-paid-accounts-${locale}-${width}.png`});await dialog.getByRole('button',{name:t('recordPaidOutflow'),exact:true}).click();await dialog.getByLabel(t('paymentAck')).waitFor();assert.deepEqual(await page.evaluate(()=>window.fixtureCash),[]);
  assert.ok(await dialog.getByRole('button',{name:t('confirmPayment'),exact:true}).isDisabled());await dialog.getByLabel(t('paymentAck')).check();await dialog.getByRole('button',{name:t('confirmPayment'),exact:true}).click();await page.waitForFunction(()=>window.fixtureCash.length===1);assert.equal((await page.evaluate(()=>window.fixtureCash))[0].amount,300);assert.equal(await dialog.locator('[data-expense-technical]').count(),0);scenarios++;
  // Read-only modal: pointer/keyboard open, real tax values, one Admin disclosure and Escape focus restore.
  await page.goto(`${url}/finance/payables?ux=1&locale=${locale}&scenario=waiting&admin=1`);const view=page.getByRole('button',{name:t('view'),exact:true});await view.focus();await page.keyboard.press('Enter');await dialog.waitFor();await dialog.getByText(t('exists')+' · 700.00 THB',{exact:true}).waitFor();
  assert.ok((await dialog.innerText()).includes('EXP-TEST'));assert.ok((await dialog.innerText()).includes(t('supplier_payable')));assert.equal(await dialog.locator('form').count(),0);assert.equal(await dialog.locator('[data-expense-technical]').count(),1);assert.ok(!(await dialog.innerText()).includes('technical_marker'));assert.deepEqual(await page.evaluate(()=>window.writes),[]);
  await fits();await page.screenshot({path:out+`/ux-payable-${locale}-${width}.png`});await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.ok(await view.evaluate(e=>e===document.activeElement));scenarios++;
  for(const extra of ['&missingTax=1','&failedRead=1']){await page.goto(`${url}/finance/payables?ux=1&locale=${locale}&scenario=waiting${extra}`);await page.getByRole('button',{name:t('view'),exact:true}).click();await dialog.getByText(t(extra.includes('failedRead')?'sourceReadFailed':'pending'),{exact:false}).first().waitFor();assert.equal(await dialog.locator('[data-expense-technical]').count(),0);assert.deepEqual(await page.evaluate(()=>window.writes),[]);await fits();}scenarios++;
  await page.goto(`${url}/finance/treasury?ux=1&locale=${locale}`);const label=translate(locale,'treasury.companyExpenseOutflow')+' - UAT PAID';await page.getByText(label,{exact:true}).waitFor();assert.ok(!(await page.locator('body').innerText()).includes('Expense payout'));
  await page.locator('[data-movement] button').click();await dialog.waitFor();assert.ok((await dialog.innerText()).includes(label));await fits();await page.screenshot({path:out+`/ux-cashbook-${locale}-${width}.png`});assert.deepEqual(await page.evaluate(()=>window.writes),[]);scenarios++;
  await page.goto(`${url}/finance/treasury?ux=1&locale=${locale}&missingEvidence=1`);await page.getByText(translate(locale,'treasury.expenseOutflow'),{exact:true}).waitFor();assert.ok(!(await page.locator('body').innerText()).includes('UAT PAID'));assert.deepEqual(await page.evaluate(()=>window.writes),[]);scenarios++;
  console.log('PASS targeted UX',locale,width);
 }
 return scenarios;
};
