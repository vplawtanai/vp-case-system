/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable PostgreSQL only. No credentials, network or Production execution.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto'),{execFileSync}=require('node:child_process');
const a=require('./tax-065-gate.cjs'),prior=require('./tax-simple-artifacts.cjs'),production=require('./tax-064-scoped-contract.json');
const setupPrior=require('./employee-reimbursement-postgres.test.cjs'),company=require('./company-review-modal-postgres.test.cjs'),requests=require('./expense-request-postgres.test.cjs');
const {db,query,scalar,rpc,migration}=require('./receipt-foundation.test.cjs');

test('065 gate exports exact pinned candidate and SELECT-only fresh baseline SQL',()=>{
 assert.equal(a.validateArtifacts(),a.candidateSha);
 const sql=a.preflight(),code=sql.replace(/'(?:[^']|'')*'/g,"''").replace(/--[^\n]*/g,'');
 assert.doesNotMatch(code,/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|do|call|set_config|dblink|query_to_xml)\b/i);
 assert.equal((code.match(/;/g)||[]).length,1);
 assert.match(sql,/historical_rows_unchanged/);assert.match(sql,/null::boolean historical_rows_unchanged/);
 assert.match(sql,/statement_timestamp\(\)/);assert.match(sql,/post_cleanup_live_capture_for_065/);
 assert.ok(sql.includes(a.cleanupReference));assert.ok(sql.includes('490 broader_unresolved_differences'));
 assert.ok(a.rowTables.includes('finance_external_input_vat'));assert.ok(a.rowTables.includes('finance_external_input_vat_reviews'));
 const printed=execFileSync(process.execPath,['scripts/tests/tax-065-gate.cjs','print-preflight'],{encoding:'utf8',maxBuffer:4*1024*1024});assert.equal(printed,sql);
 for(const mode of ['apply','dry-run','execute'])assert.throws(()=>execFileSync(process.execPath,['scripts/tests/tax-065-gate.cjs',mode],{stdio:'pipe'}));
});

test('065 gate closes the complete candidate function/table dependency surface without accepting broader differences',()=>{
 const names=new Set([...production.after.functions.map(f=>f.signature.split('(')[0]),...a.extraFunctions.map(f=>f.name),'tax_expense_input_vat_status','tax_input_vat_evidence']);
 // All explicit candidate calls must be the checked dependencies or the two new helpers.
 for(const m of a.source().matchAll(/public\.([a-z_0-9]+)\s*\(/g))assert.ok(names.has(m[1])||a.rowTables.includes(m[1]),m[1]);
 for(const m of a.source().matchAll(/public\.((?:finance_|user_)[a-z_0-9]+)/g))assert.ok(a.rowTables.includes(m[1])||names.has(m[1]),m[1]);
 assert.deepEqual(a.extraFunctions.map(f=>f.name).sort(),['tax_filing_allocation_pool_v1','tax_filing_assert']);
 assert.equal(require('./tax-064-reconciliation.json').differences.length,490);
 // The known two additional dependency definitions match the historical repository
 // artifact; current raw ACLs are captured, not silently replaced by old defaults.
 const fixture=require('./tax-simple-catalog.json').before.functions;
 assert.ok(fixture.some(f=>f.signature==='tax_filing_assert(uuid)'&&f.definition_hash==='77df358dc8258f0b092102538deb0e72'));
 assert.ok(fixture.some(f=>f.signature==='tax_filing_allocation_pool_v1(date,text)'&&f.definition_hash==='6f5882e267c72ceab9abc7d4629c456e'));
 assert.doesNotMatch(fs.readFileSync('scripts/tests/tax-065-gate.cjs','utf8'),/VP_DATABASE_URL|psql|@supabase/);
});

test('065 gate executes read-only, captures post-cleanup state, rejects residual UAT/drift/applied candidate',async()=>{
 await setupPrior.setup();for(const n of ['62','63','64'])await db.exec(migration(n));
 await db.exec('grant execute on function tax_filing_assert(uuid),tax_filing_allocation_pool_v1(date,text) to service_role');
 const choices=company.choices({wht_state:'none',wht_rate:0});
 const lines=requests.items([300],{personally_paid:false,reimbursement_requested:0,company_request_version:1,creator_payment_fact:'unpaid',creator_tax:choices,supplier_payee_id:null,vendor_name:'Big C'});lines[0].id=a.bigC;
 const purchase=await requests.save(lines,'company_expense_batch');await rpc('submit_finance_expense_request',[purchase.id,1]);await company.approve((await requests.read(purchase.id)).items[0],choices);
 const claimLines=requests.items([500,300,500]);claimLines.forEach((l,i)=>{l.id=a.claims[i];});const claims=await requests.save(claimLines);await rpc('submit_finance_expense_request',[claims.id,1]);
 for(const e of (await requests.read(claims.id)).items)await rpc('review_finance_employee_reimbursement',[randomUUID(),e.id,e.version,true,e.gross_amount,'']);
 // Only the local fixture uses synthetic security/catalog. Never write it as an artifact.
 const local={...production,after:{functions:await query(prior.functionSql),catalog:await query(prior.catalogSql)},profile_security:(await query(prior.profileSecuritySql))[0]};
 const sql=a.preflight(local),before=await scalar(a.rowSql);
 await db.exec('commit;begin read only');
 const pre=(await query(sql))[0];assert.deepEqual(pre.failed_checks,[]);assert.equal(pre.gate_pass,true);assert.deepEqual(pre.historical_hashes,before);assert.equal(pre.historical_rows_unchanged,null);
 assert.equal(pre.baseline.historical_hashes.finance_external_input_vat.count,0);assert.equal(pre.baseline.september_facts.output_vat,700);assert.equal(pre.baseline.september_facts.reviewed_input_vat,0);
 assert.equal(pre.baseline.september_sources.length,4);assert.equal(pre.baseline.functions.length,57);
 assert.deepEqual(await scalar(a.rowSql),before,'SELECT-only preflight never appends tax facts/reviews/audits or money rows');
 await db.exec('rollback;begin');
 async function checkDrift(sqlChange,expected){await db.exec('savepoint bad');await db.exec(sqlChange);const result=(await query(sql))[0];assert.equal(result.gate_pass,false);assert.ok(result.failed_checks.includes(expected),JSON.stringify(result.failed_checks));await db.exec('rollback to savepoint bad;release savepoint bad');}
 await checkDrift('alter table finance_external_input_vat disable trigger external_input_vat_immutable','immutability_and_integrity_triggers_enabled');
 await checkDrift('grant select on finance_external_input_vat to anon','accepted_post064_catalog_security_exact');
 await checkDrift('revoke execute on function tax_filing_assert(uuid) from service_role','additional_filing_security');
 await checkDrift("create or replace function tax_filing_assert(p_id uuid) returns void language plpgsql security definer set search_path=public as $$begin raise exception 'must never be called';end$$",'additional_filing_dependencies_exact');
 await db.exec('savepoint uat');const ex=randomUUID();await rpc('save_finance_external_input_vat',[ex,{vendor:'บริษัท UAT ผู้ขาย จำกัด',invoice_date:'2026-09-23',invoice_number:'5647891231236',tax_base:10000,vat_amount:700,note:'Synthetic fixture',funding_source:'third_party_no_reimbursement'},true]);await rpc('review_finance_external_input_vat',[randomUUID(),ex,null,'eligible','Synthetic UAT',true]);
 const stale=(await query(sql))[0];assert.ok(stale.failed_checks.includes('uat_dataset_absent'));assert.ok(stale.failed_checks.includes('post_cleanup_vat_totals'));assert.notDeepEqual(stale.historical_hashes,pre.historical_hashes);
 await db.exec('rollback to savepoint uat;release savepoint uat');
 assert.deepEqual((await query(sql))[0].historical_hashes,pre.historical_hashes,'Fresh capture reflects restored post-cleanup state');
 await checkDrift(migration('65'),'065_new_helpers_absent');
 assert.deepEqual((await query(sql))[0].failed_checks,[]);
});
