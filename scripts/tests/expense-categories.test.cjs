/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs'),{fixture,expense}=require('./expense-foundation-fixture.cjs');
const {expenseCategories,expenseCategoryOptions,expenseCategoryChoice,expenseCategoryLabel}=require('../../app/finance/expenses/categories.ts');
const forms=workspaceFixture('app/finance/expenses/forms.tsx',['ExpenseFactsForm']);
const lists=workspaceFixture('app/finance/expenses/workspace.tsx',['ExpenseList','ExpenseClaimList','ExpenseBadge','ExpenseDetail'],{'./data':{}});
const values=html=>[...html.match(/<select\b[^>]*id="expense-category"[\s\S]*?<\/select>/)[0].matchAll(/<option value="([^"]*)"/g)].map(match=>match[1]).filter(Boolean);
const excluded=['เงินเดือน / ค่าจ้าง','ค่าอากร / ภาษี','ค่าใช้จ่ายทั่วไป'];
const claimValues=['ค่าเดินทาง','ค่าน้ำมัน / ทางด่วน / ที่จอดรถ','ค่าส่งเอกสาร','ค่าถ่ายเอกสาร / ค่าเอกสาร','ค่าธรรมเนียมศาล / ค่าธรรมเนียมราชการ','อุปกรณ์สำนักงาน','รับรองลูกค้า / ประชุมงาน','Other'];

test('One registry filters by workflow metadata, with 15 Company and 8 Claim choices',()=>{
 assert.equal(new Set(expenseCategories.map(c=>c.value)).size,expenseCategories.length);
 for(const workflow of ['company','claim']){
  const active=expenseCategoryOptions(workflow);assert.deepEqual(active,expenseCategories.filter(c=>[workflow,'both'].includes(c.workflow)));
  for(const value of excluded)assert.ok(!active.some(c=>c.value===value));
  assert.ok(!active.some(c=>c.value==='ค่าเว็บไซต์ / Hosting / Domain'));
  assert.ok(active.every(c=>c.value.length<=150&&c.label.th&&c.label.en));
  assert.ok(active.every(c=>!/[A-Za-z]/.test(c.label.th)&&!/[\u0e00-\u0e7f]/.test(c.label.en)));
 }
 assert.equal(expenseCategoryOptions('company').length,15);assert.deepEqual(expenseCategoryOptions('claim').map(c=>c.value),claimValues);
 assert.ok(expenseCategoryOptions('company').some(c=>c.value==='ค่าซ่อมบำรุง / ทรัพย์สิน / อุปกรณ์'));
 assert.equal(expenseCategoryLabel('ค่าเดินทาง','th'),'ค่าเดินทาง / ที่พัก');assert.equal(expenseCategoryLabel('ค่า Software / System','en'),'Software / Systems / Websites / Domains');
 assert.equal(expenseCategoryLabel('User-entered category','th'),'User-entered category');assert.equal(expenseCategoryLabel(null,'en'),'-');
});

for(const locale of ['th','en'])for(const claim of [false,true]){
 test(`${locale} ${claim?'Claim':'Company'} form filters new options but preserves a saved excluded or out-of-workflow category`,()=>{
  const f=fixture('list'),props={claim,access:f.data.access,accounts:f.data.accounts,lookups:f.lookups,run:()=>null,busy:false};
  const html=forms.render(locale,{},props,'ExpenseFactsForm');assert.deepEqual(values(html),expenseCategoryOptions(claim?'claim':'company').map(c=>c.value));
  for(const stored of [...excluded,'ค่าเว็บไซต์ / Hosting / Domain','ค่า Software / System']){
   const row={...f.data.rows[0],category:stored},before=JSON.stringify(row);
   const edit=forms.render(locale,{}, {...props,row},'ExpenseFactsForm');assert.ok(values(edit).includes(stored));assert.equal(expenseCategoryChoice(stored),stored);assert.ok(edit.includes(expenseCategoryLabel(stored,locale)));assert.equal(JSON.stringify(row),before);
  }
  const custom=forms.render(locale,{}, {...props,row:{...f.data.rows[0],category:'Custom historic text'}},'ExpenseFactsForm');assert.match(custom,/value="Custom historic text"/);assert.match(custom,/id="expense-custom-category"/);
 });
 test(`${locale} ${claim?'Claim':'Company'} list and detail use display labels; search retains stored values and matches aliases`,()=>{
  const row=expense(10,{category:'ค่าเดินทาง',origin:claim?'employee_claim':'company_purchase'}),rows=[row],component=claim?'ExpenseClaimList':'ExpenseList';
  const props=claim?{rows,canCreate:false,viewAll:false,onCreate:()=>{}}:{rows,claims:false};
  for(const query of ['ค่าเดินทาง',expenseCategoryLabel(row.category,locale)]){
   const html=lists.render(locale,{[component+'.search']:query},props,component);assert.match(html,/<tbody>/);assert.ok(html.includes(expenseCategoryLabel(row.category,locale)));
  }
  const absent=lists.render(locale,{[component+'.search']:'no matching category'},props,component);assert.doesNotMatch(absent,/<tbody>/);
  const f=fixture('list'),detail=lists.render(locale,{}, {data:f.data,row,lookups:f.lookups,run:()=>null,busy:false},'ExpenseDetail');assert.ok(detail.includes(expenseCategoryLabel(row.category,locale)));assert.equal(row.category,'ค่าเดินทาง');
 });
}
