/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
module.exports=(dialog,prefix)=>({
 async choose(field,value){await dialog.locator(`#${prefix}-${field}`).click();await dialog.getByRole('listbox').locator(`[role=option][data-value="${value}"]`).click();},
 async value(field){await dialog.locator(`#${prefix}-${field}`).click();const value=await dialog.getByRole('listbox').getByRole('option',{selected:true}).getAttribute('data-value');await dialog.locator(`#${prefix}-${field}`).press('Escape');return value;},
 async firstClient(){await dialog.locator(`#${prefix}-client`).click();const value=await dialog.getByRole('listbox').getByRole('option').nth(1).getAttribute('data-value');await dialog.locator(`#${prefix}-client`).press('Escape');return value;},
 async absent(value){await dialog.locator(`#${prefix}-work`).click();assert.equal(await dialog.getByRole('listbox').locator(`[data-value="${value}"]`).count(),0);await dialog.locator(`#${prefix}-work`).press('Escape');},
});
