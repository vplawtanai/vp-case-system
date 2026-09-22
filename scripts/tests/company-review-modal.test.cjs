/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
test('060 supersedes old candidate without replacing calculation/posting or adding tables/columns/backfill',()=>{
 const a=require('./company-review-modal-artifacts.cjs');
 assert.doesNotMatch(a.source(),/create (?:or replace )?function public.(?:company_expense_tax_calculation|confirm_finance_payout)/i);
 assert.doesNotMatch(a.source(),/\bcreate table\b|\bbackfill\b/i);
 assert.match(a.source(),/review_finance_expense_tax\(p_operation/);assert.match(a.source(),/'supplier_unpaid'/);
 assert.equal(fs.existsSync('supabase/migrations/202607180060_simplify_company_paid_wht_acknowledgement.sql'),false);
});
test('060 UI scopes new requests, titles and tax choices; no second calculation engine or hidden tax evidence',()=>{
 require('./receipt-render-fixture.cjs');const {companyDeclarationsMatch}=require('../../app/finance/expenses/company-declarations.ts');
 const {translate}=require('../../lib/i18n/catalog.ts');const choices={vat_mode:'inclusive',vat_rate:7,wht_state:'withhold',wht_rate:3};
 assert.equal(companyDeclarationsMatch([{id:'a',input:{creator_tax:choices}}],{items:[{id:'a',creator_tax:choices}]}),true);
 assert.equal(companyDeclarationsMatch([{id:'a',input:{creator_tax:choices}}],{items:[{id:'a'}]}),false);
 assert.equal(companyDeclarationsMatch([{id:'a',input:{creator_tax:choices}}],{items:[{id:'a',creator_tax:{...choices,wht_rate:5}}]}),false);
 const ui=fs.readFileSync('app/finance/expenses/purchase-request-review.tsx','utf8'),form=fs.readFileSync('app/finance/expenses/purchase-request-form.tsx','utf8');
 assert.match(ui,/preview_finance_company_expense_tax/);assert.match(ui,/review_finance_company_purchase_request/);assert.doesNotMatch(ui,/Math\.round|paid_withholding_ack|TaxForm|supplier_tax_id|type="checkbox"|type="file"|prepare_finance_expense_payout/);
 assert.doesNotMatch(form,/company_paid|payment-status|type="file"|bank_account_id|cash_location_id/);
 assert.equal(translate('th','expenses.purchaseRequestCreate'),'สร้างคำขอซื้อหรือค่าใช้จ่าย');assert.equal(translate('th','expenses.purchaseRequestReview'),'ตรวจสอบคำขอซื้อหรือค่าใช้จ่าย');
 for(const locale of ['th','en'])for(const key of ['purchaseRequestCreate','purchaseRequestReview','purchaseRequestVendor','purchaseRequestDate','purchaseRequestNet','purchaseRequestPayeeRequired','purchaseRequestRetry'])assert.notEqual(translate(locale,'expenses.'+key),'expenses.'+key);
});
test('060 preflight/verifier SELECT-only one statement; exact rollback-only embedding; applied migrations unchanged',()=>{
 const a=require('./company-review-modal-artifacts.cjs'),src=fs.readFileSync('scripts/tests/receipt-sql-static.test.cjs','utf8');
 const lexical=require('node:vm').runInNewContext(src.slice(src.indexOf('function lexical('),src.indexOf('module.exports'))+';lexical',{assert});
 const files=a.workflow();for(const file of [a.filenames.pre,a.filenames.verify]){
  assert.equal(fs.readFileSync(file,'utf8'),files[file]);const sql=lexical(files[file]);assert.equal(sql.split(';').filter(s=>s.trim()).length,1);assert.match(sql.trim(),/^with /i);
  assert.doesNotMatch(sql,/\b(insert|update|delete|merge|call|execute|do|create|alter|drop|truncate|copy|into)\b/i);
 }
 assert.equal(files[a.filenames.dry].split('-- BEGIN EMBEDDED MIGRATION 060\n')[1].split('-- END EMBEDDED MIGRATION 060')[0],a.source());
 const dry=lexical(files[a.filenames.dry]);assert.match(dry.trim(),/^begin;/i);assert.match(dry.trim(),/rollback;$/i);assert.doesNotMatch(dry,/\bcommit\b/i);
 for(const file of cp.execFileSync('git',['ls-tree','-r','--name-only','b56a39b','supabase/migrations'],{encoding:'utf8'}).trim().split('\n'))assert.deepEqual(fs.readFileSync(file),cp.execFileSync('git',['show','b56a39b:'+file]),file);
});
