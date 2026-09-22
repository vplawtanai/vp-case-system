/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
module.exports=async({page,url,out,translate})=>{
 let scenarios=0;
 for(const[width,locale]of[[390,'th'],[1440,'th'],[1440,'en']]){
  const t=k=>translate(locale,'expenses.'+k),dialog=page.getByRole('dialog');await page.setViewportSize({width,height:1050});
  await page.goto(`${url}/finance/expenses/claims?claim061=1&locale=${locale}`);await page.getByRole('button',{name:t('newClaim'),exact:true}).first().click();
  const combo=dialog.getByRole('combobox',{name:t('category'),exact:true});await combo.click();
  assert.equal(await dialog.getByRole('option').count(),22);assert.equal(await dialog.getByRole('option').last().innerText(),locale==='th'?'อื่น ๆ':'Other');
  await combo.fill('ศาล');assert.equal(await dialog.getByRole('option').count(),4);await page.screenshot({path:out+`/claim-category-search-${locale}-${width}.png`});
  await combo.press('ArrowDown');await combo.press('Enter');assert.equal(await combo.inputValue(),locale==='th'?'ค่าคัดถ่าย / รับรองสำเนาเอกสาร':'Document copies / Certification');assert.equal(await dialog.getByRole('listbox').count(),0);
  await combo.click();assert.equal(await dialog.getByRole('option',{selected:true}).innerText(),await dialog.getByRole('option',{name:locale==='th'?'ค่าคัดถ่าย / รับรองสำเนาเอกสาร':'Document copies / Certification',exact:true}).innerText());
  await combo.press('Escape');assert.equal(await dialog.count(),1);await combo.press('Tab');
  assert.equal(await dialog.locator('#claim-note').count(),0);await dialog.locator('#claim-amount').fill('1000');await dialog.locator('#claim-description').fill('Court copy expense');
  await dialog.getByRole('button',{name:t('addThisItem'),exact:true}).click();
  const summary=dialog.getByRole('region',{name:t('requestSummary')});assert.equal(await summary.locator('dt').count(),2);assert.ok(!(await summary.innerText()).includes(t('expenseTotal')));assert.ok((await summary.innerText()).includes('1,000.00'));
  await dialog.getByRole('button',{name:t('addItem'),exact:true}).click();await combo.fill('arbitrary unlisted category');await dialog.locator('#claim-amount').fill('300');await dialog.locator('#claim-description').fill('Custom expense');await dialog.getByRole('button',{name:t('addThisItem'),exact:true}).click();assert.equal(await dialog.locator('[data-request-item]').count(),1);
  await combo.click();await dialog.getByRole('option',{name:locale==='th'?'อื่น ๆ':'Other',exact:true}).click();const custom=dialog.getByLabel(t('claimCustomCategory'),{exact:true});assert.equal(await custom.getAttribute('required'),'');
  await dialog.getByRole('button',{name:t('addThisItem'),exact:true}).click();assert.equal(await dialog.locator('[data-request-item]').count(),1);
  await custom.fill('   ');await dialog.getByRole('button',{name:t('addThisItem'),exact:true}).click();assert.equal(await dialog.locator('[data-request-item]').count(),1);await custom.fill('หมวดเฉพาะที่ผู้ขอระบุ');await dialog.getByRole('button',{name:t('addThisItem'),exact:true}).click();assert.equal(await dialog.locator('[data-request-item]').count(),2);assert.ok((await summary.innerText()).includes('1,300.00'));
  await dialog.locator('summary').filter({hasText:t('requestNote')}).click();await dialog.locator('#expense-request-note').fill('Request-level note only');await dialog.getByRole('button',{name:t('saveForLater'),exact:true}).click();await dialog.getByRole('button',{name:t('editRequest'),exact:true}).click();
  assert.equal(await dialog.locator('[data-request-item]').count(),2);await dialog.getByRole('button',{name:t('editItem'),exact:true}).first().click();await combo.click();assert.equal(await dialog.getByRole('option',{selected:true}).innerText(),locale==='th'?'ค่าคัดถ่าย / รับรองสำเนาเอกสาร':'Document copies / Certification');await combo.press('Escape');await dialog.getByRole('button',{name:t('saveItemChanges'),exact:true}).click();
  await dialog.getByRole('button',{name:t('editItem'),exact:true}).last().click();assert.equal(await custom.inputValue(),'หมวดเฉพาะที่ผู้ขอระบุ');await dialog.getByRole('button',{name:t('saveItemChanges'),exact:true}).click();
  const saved=await page.evaluate(()=>window.calls.find(c=>c.name==='save_finance_expense_request').args);assert.equal(saved.p_items[0].input.category,'ค่าคัดถ่าย / รับรองสำเนาเอกสาร');assert.equal(saved.p_items[1].input.category,'หมวดเฉพาะที่ผู้ขอระบุ');assert.equal(saved.p_note,'Request-level note only');
  assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);await page.screenshot({path:out+`/claim-create-summary-${locale}-${width}.png`});scenarios++;
  await page.goto(`${url}/finance/expenses/claims?claim061=1&locale=${locale}&scenario=draft&historicalClaim=1`);await page.locator('[data-request-row] button').click();await dialog.getByRole('button',{name:t('editRequest'),exact:true}).click();await dialog.getByRole('button',{name:t('editItem'),exact:true}).first().click();
  await combo.click();assert.equal(await dialog.getByRole('option',{selected:true}).innerText(),locale==='th'?'ค่าเดินทาง':'Travel (general)');assert.equal(await dialog.getByRole('option').last().innerText(),locale==='th'?'อื่น ๆ':'Other');await combo.press('Escape');assert.equal(await dialog.locator('#claim-note').count(),0);await dialog.getByRole('button',{name:t('saveItemChanges'),exact:true}).click();await dialog.getByRole('button',{name:t('saveForLater'),exact:true}).click();await dialog.getByRole('button',{name:t('editRequest'),exact:true}).waitFor();
  const historical=await page.evaluate(()=>window.calls.find(c=>c.name==='save_finance_expense_request').args.p_items[0].input);assert.equal(historical.category,'ค่าเดินทาง');assert.equal(historical.note,'Preserved historical item note');scenarios++;
  console.log('PASS Create polish + historical preservation',width,locale);
 }
 return scenarios;
};
