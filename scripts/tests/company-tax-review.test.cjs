/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
require('./receipt-render-fixture.cjs');
const {companyApprovalMissing}=require('../../app/finance/expenses/company-money.ts');
const {companyReviewComplete}=require('../../app/finance/expenses/company-workflow.ts');
const {fixture,expense}=require('./expense-foundation-fixture.cjs');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
test('059 direct Company detail reuses the review; Claim and old-server behavior remain isolated',()=>{
 const w=workspaceFixture('app/finance/expenses/workspace.tsx',['ExpenseDetail']),f=fixture('list');
 const props={row:{...expense(10),status:'submitted',creator_payment_fact:'unpaid'},data:{...f.data,access:{...f.data.access,company_tax_calculation_supported:true}},lookups:f.lookups,run:()=>{throw Error('No writes');},busy:false};
 for(const locale of ['th','en']){
  const company=w.render(locale,{},props,'ExpenseDetail');assert.match(company,/company-tax-vat_mode/);assert.doesNotMatch(company,/id="expense-review-reason"/);
  const claim=w.render(locale,{}, {...props,row:{...props.row,origin:'employee_claim',personally_paid:true}},'ExpenseDetail');assert.doesNotMatch(claim,/company-tax-vat_mode/);assert.match(claim,/expense-review-reason/);
 }
});
test('059 monetary readiness is separate from VAT evidence, optional note and stale settlement amount',()=>{
 const f=fixture('list'),row={...expense(10),status:'submitted',creator_payment_fact:'unpaid',gross_amount:321,tax_review:null,settlement:null};
 const money={p_mode:'supplier_unpaid',p_payee:row.supplier_payee_id,p_amount:321},calculation={ready:true,missing:[],gross:321};
 assert.deepEqual(companyApprovalMissing(row,money,null,'',f.lookups,calculation),[]);
 assert.ok(companyApprovalMissing(row,{...money,p_amount:300},null,'',f.lookups,calculation).includes('companyTaxCalculating'));
 assert.ok(companyApprovalMissing(row,money,null,'',f.lookups,null).includes('companyTaxCalculating'));
 assert.equal(companyReviewComplete({...row,status:'accepted',settlement:{mode:'supplier_unpaid'},tax_review:{vat_state:'exists',wht_state:'none',eligibility:'pending',wht_exception:false,request_json:{schema_version:2}}}),true);
});
test('059 SELECT-only artifacts, exact candidate embedding and applied migrations unchanged',()=>{
 const a=require('./company-tax-review-artifacts.cjs'),src=fs.readFileSync('scripts/tests/receipt-sql-static.test.cjs','utf8');
 const lexical=require('node:vm').runInNewContext(src.slice(src.indexOf('function lexical('),src.indexOf('module.exports'))+';lexical',{assert});
 const files=a.workflow();for(const file of [a.filenames.pre,a.filenames.verify]){
  const sql=lexical(files[file]);assert.equal(sql.split(';').filter(s=>s.trim()).length,1);assert.match(sql.trim(),/^with /i);
  assert.doesNotMatch(sql,/\b(insert|update|delete|merge|call|execute|do|create|alter|drop|truncate|copy|into)\b/i);
 }
 assert.equal(files[a.filenames.dry].split('-- BEGIN EMBEDDED MIGRATION 059\n')[1].split('-- END EMBEDDED MIGRATION 059')[0],a.source());
 const dry=lexical(files[a.filenames.dry]);assert.match(dry.trim(),/^begin;/i);assert.match(dry.trim(),/rollback;$/i);assert.doesNotMatch(dry,/\bcommit\b/i);
 for(const file of cp.execFileSync('git',['ls-tree','-r','--name-only','b805f832','supabase/migrations'],{encoding:'utf8'}).trim().split('\n'))assert.deepEqual(fs.readFileSync(file),cp.execFileSync('git',['show','b805f832:'+file]),file);
});
