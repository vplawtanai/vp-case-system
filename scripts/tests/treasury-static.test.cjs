/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {lexical}=require('./receipt-sql-static.test.cjs');
const {workflow,filenames,migrationPath}=require('./treasury-artifacts.cjs');
const {definition}=require('./tax-invoice-sql-artifacts.cjs');
require('./receipt-render-fixture.cjs');
const {locationKey,openingStart,sourceBlock,treasuryError}=require('../../app/finance/treasury/shared.ts');
const {messages,translate}=require('../../lib/i18n/catalog.ts');
const {financeNavigationLinks,activeFinancePage}=require('../../app/finance/finance-navigation.ts');
const {buildPermissions}=require('../../lib/permissions.ts');
const {safePaymentError}=require('../../app/finance/payments/shared.ts');
test('049 operator artifacts are reproducible, SELECT-only, one statement and rollback-only',()=>{
 const files=workflow();for(const [file,text] of Object.entries(files))assert.equal(fs.readFileSync(file,'utf8'),text);
 for(const file of [filenames.pre,filenames.verify]){
  const clean=lexical(files[file]);assert.equal(clean.split(';').filter(s=>s.trim()).length,1);assert.match(clean.trim(),/^with\b/i);
  assert.doesNotMatch(clean,/\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|call|do|set_config)\b/i);
  assert.doesNotMatch(clean,/\b(?:public\.)?(?:treasury_source|treasury_post_source|get_finance_treasury|materialize_finance_treasury_source|save_finance_treasury_opening|confirm_finance_treasury_opening)\s*\(/i);
  let balance=0;for(const c of clean){if(c==='(')balance++;if(c===')')balance--;assert.ok(balance>=0);}assert.equal(balance,0);
  assert.match(files[file],/failed_checks/);assert.match(files[file],/function_differences/);assert.match(files[file],/catalog_differences/);
 }
 const sql=fs.readFileSync(migrationPath,'utf8'),dry=files[filenames.dry],clean=lexical(dry);
 assert.match(clean.trim(),/^begin;/i);assert.match(clean.trim(),/rollback;$/i);assert.doesNotMatch(clean,/\bcommit\b/i);
 assert.equal(dry.split('-- BEGIN EMBEDDED MIGRATION 049\n')[1].split('-- END EMBEDDED MIGRATION 049')[0],sql);
});
test('049 no historical backfill, accounting, payout or document DML; applied migrations unchanged',()=>{
 const sql=fs.readFileSync(migrationPath,'utf8'),clean=lexical(sql);
 assert.deepEqual([...clean.matchAll(/\b(?:insert\s+into|update|delete\s+from)\s+public\.(\w+)/gi)].map(m=>m[1]),['finance_cash_locations']);
 for(const m of sql.matchAll(/create (?:or replace )?function public\.(\w+)\(/g)){
  const fn=definition(sql.slice(m.index),m[1]),tag=/\bas\s+(\$\w*\$)/i.exec(fn),body=lexical(fn.slice(tag.index+tag[0].length,fn.lastIndexOf(tag[1])));
  for(const target of body.matchAll(/\b(?:insert\s+into|update|delete\s+from)\s+public\.(\w+)/gi))assert.ok(['finance_cash_transactions','finance_account_opening_balances'].includes(target[1]),target[1]);
 }
 assert.equal(cp.execFileSync('git',['diff','--name-only','--','supabase/migrations'],{encoding:'utf8'}).trim(),'');
});
test('049 UI uses server money and stable typed location identities; exact Bangkok cutoff',()=>{
 assert.notEqual(locationKey({bank_account_id:'same',cash_location_id:null}),locationKey({bank_account_id:null,cash_location_id:'same'}));
 const cutoff='2026-09-30T16:59:59.999999+00:00';assert.equal(openingStart(cutoff),'2026-10-01');
 const source={source_type:'payment',bank_account_id:'bank',received_on:'2026-09-30'},account={is_active:true,opening_id:'opening',opening_as_of:cutoff};
 assert.equal(sourceBlock(source,account),'cutoffCovered');assert.equal(sourceBlock({...source,received_on:'2026-10-01'},account),null);
 assert.equal(sourceBlock(source,{...account,opening_id:null}),'unknown');assert.equal(sourceBlock({...source,bank_account_id:null},account),'paymentLocationRequired');
 const ui=fs.readFileSync('app/finance/treasury/page.tsx','utf8');assert.doesNotMatch(ui,/\.from\(|alert\(|confirm_finance_payment|transition_finance_direct_money|issue_finance|ensure_finance_payable|\.reduce\(/);
 assert.match(ui,/p_expected_source: selected/);assert.match(ui,/p_expected_updated_at/);
});
test('049 TH/EN, source error guidance and permission-gated Treasury navigation',()=>{
 for(const locale of ['th','en'])for(const key of Object.keys(messages).filter(k=>k.startsWith('treasury.')))assert.ok(translate(locale,key)&&translate(locale,key)!==key,key);
 for(const locale of ['th','en'])assert.equal(treasuryError({message:'TREASURY_CASH_CORRECTION_WORKFLOW_REQUIRED'},locale),translate(locale,'treasury.error.correction'));
 for(const locale of ['th','en'])assert.equal(safePaymentError({message:'TREASURY_LOCATION_REQUIRED'},'fallback',locale),translate(locale,'treasury.error.location'));
 assert.equal(activeFinancePage('/finance/treasury','invoices'),'treasury');
 for(const locale of ['th','en']){
  for(const role of ['admin','partner'])assert.equal(financeNavigationLinks(buildPermissions({role}),locale).find(l=>l.page==='treasury')?.label,translate(locale,'treasury.title'));
  assert.equal(financeNavigationLinks({},locale).some(l=>l.page==='treasury'),false);
  assert.equal(activeFinancePage('/finance/treasury/example','invoices'),'treasury');
 }
 assert.equal(translate('th','treasury.unknown'),'ยังไม่ได้กำหนดยอดยกมา');
 assert.equal(translate('en','treasury.unknown'),'Opening balance not set');
 const form=fs.readFileSync('app/finance/direct-money/form.tsx','utf8');assert.match(form,/receiving_cash_location_id: location\?\.id/);assert.match(form,/cashLocations\.find\(c => c\.id === e\.target\.value\)/);
});
test('Pending cash copy distinguishes confirmed money from distribution without adding a distribution dependency',()=>{
 const expected={
  th:{pending:'เงินรับที่รอบันทึกเข้าความเคลื่อนไหวเงินจริง',pendingHelp:'รายการที่ยืนยันว่ารับเงินจริงแล้ว แต่ยังไม่ได้สร้างรายการเงินเข้าในเงินสดและบัญชี การแบ่งรายได้ไม่เกี่ยวกับขั้นตอนนี้',materialize:'บันทึกเงินเข้าจากรายการนี้'},
  en:{pending:'Receipts awaiting cashbook entry',pendingHelp:'Confirmed real-money receipts that have not yet been recorded as Treasury inflows. Revenue distribution is separate from this step.',materialize:'Record cash inflow'},
 };
 for(const [locale,copy] of Object.entries(expected))for(const [key,value] of Object.entries(copy))assert.equal(translate(locale,'treasury.'+key),value);
 const ui=fs.readFileSync('app/finance/treasury/page.tsx','utf8');
 assert.match(ui,/data\.pending_sources\.map\(s =>/);
 assert.doesNotMatch(ui,/vp_revenue_distribution|vp-distribution|money_nature|business_revenue|ensure_finance_payable/);
 assert.match(ui,/supabase\.rpc\("materialize_finance_treasury_source", \{ p_source_type: selected\.source_type, p_source_id: selected\.source_id,/);
 assert.match(ui,/p_expected_source: selected, p_acknowledged: ack/);
});
