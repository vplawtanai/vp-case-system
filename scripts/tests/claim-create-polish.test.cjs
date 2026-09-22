/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
require('./receipt-render-fixture.cjs');
const {claimCategories,claimCategoryOptions,filterClaimCategories}=require('../../app/finance/expenses/claim-categories.ts');
const {expenseCategoryLabel}=require('../../app/finance/expenses/categories.ts');
test('21 atomic choices retain requested group order; Other always last, including search and history',()=>{
 assert.equal(claimCategories.length,21);assert.equal(new Set(claimCategories.map(c=>c.value)).size,21);
 assert.deepEqual(claimCategories.map(c=>c.group.en).filter((g,i,a)=>i===0||a[i-1]!==g),['Travel','Cases / Government','Documents / Delivery','Work expenses','Other']);
 const options=claimCategoryOptions({value:'ค่าเดินทาง',label:expenseCategoryLabel('ค่าเดินทาง','th')});assert.equal(options.length,22);assert.equal(options.at(-1).value,'Other');
 for(const q of ['ศาล',' court ','GrAb','ไม่พบรายการ'])assert.equal(filterClaimCategories(options,q).at(-1).value,'Other');
 assert.deepEqual(filterClaimCategories(claimCategories,'ศาล').map(c=>c.value),['ค่าธรรมเนียมศาล','ค่าคัดถ่าย / รับรองสำเนาเอกสาร','ค่านำหมาย / ค่าดำเนินการเกี่ยวกับคดี','Other']);
 assert.equal(expenseCategoryLabel('ค่าเดินทาง','th'),'ค่าเดินทาง / ที่พัก');assert.equal(expenseCategoryLabel('หมวดประวัติเดิม','th'),'หมวดประวัติเดิม');
});
