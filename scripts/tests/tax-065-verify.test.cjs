/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable PostgreSQL only. No Production connection or exported business rows.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{execFileSync}=require('node:child_process');
const a=require('./tax-065-gate.cjs'),v=require('./tax-065-verify.cjs'),prior=require('./tax-simple-artifacts.cjs'),contract=require('./tax-064-scoped-contract.json');
const setupPrior=require('./employee-reimbursement-postgres.test.cjs'),company=require('./company-review-modal-postgres.test.cjs'),requests=require('./expense-request-postgres.test.cjs');
const {db,query,scalar,rpc,migration}=require('./receipt-foundation.test.cjs');

test('065 verifier is one SELECT, exact pinned artifacts, and offline CLI copies complete SQL',()=>{
 a.validateArtifacts();v.validateTemplate();assert.equal(v.priorDefinitions().length,6);
 const options={baselineSha:'e435c194590aaa322c061e600705613d3757d0e8a8ad5357f6d1a194e6027d59',capturedAt:'2026-09-23T12:40:41.750864+00:00'};
 const sql=v.generate(options),code=sql.replace(/'(?:[^']|'')*'/g,"''").replace(/--[^\n]*/g,'');
 assert.equal((code.match(/;/g)||[]).length,1);
 assert.doesNotMatch(code,/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|do|call|set_config|dblink|query_to_xml|execute)\b/i);
 assert.equal(execFileSync(process.execPath,['scripts/tests/tax-065-gate.cjs','print-verify','--baseline-sha',options.baselineSha,'--captured-at',options.capturedAt],{encoding:'utf8',maxBuffer:4*1024*1024}),sql);
 assert.throws(()=>execFileSync(process.execPath,['scripts/tests/tax-065-gate.cjs','print-verify'],{stdio:'pipe'}));
});

test('065 verifier reproduces approved pre-apply SHA using SELECT only and rejects row/function/security/time drift',async()=>{
 await setupPrior.setup();for(const n of ['62','63','64'])await db.exec(migration(n));
 await db.exec('grant execute on function tax_filing_assert(uuid),tax_filing_allocation_pool_v1(date,text) to service_role');
 const beforeDefs=(await query(a.functionsSql)).filter(f=>v.priorDefinitions().some(p=>p.signature===f.signature)).map(({signature,definition_hash,definition})=>({signature,definition_hash,definition}));assert.deepEqual(beforeDefs,v.priorDefinitions());
 const choices=company.choices({wht_state:'none',wht_rate:0});
 const lines=requests.items([300],{personally_paid:false,reimbursement_requested:0,company_request_version:1,creator_payment_fact:'unpaid',creator_tax:choices,supplier_payee_id:null,vendor_name:'Big C'});lines[0].id=a.bigC;
 const purchase=await requests.save(lines,'company_expense_batch');await rpc('submit_finance_expense_request',[purchase.id,1]);await company.approve((await requests.read(purchase.id)).items[0],choices);
 const claimLines=requests.items([500,300,500]);claimLines.forEach((l,i)=>{l.id=a.claims[i];});const claim=await requests.save(claimLines);await rpc('submit_finance_expense_request',[claim.id,1]);
 for(const e of (await requests.read(claim.id)).items)await rpc('review_finance_employee_reimbursement',[randomUUID(),e.id,e.version,true,e.gross_amount,'']);
 await db.exec("insert into finance_tax_periods(period_month) values(date '2026-09-01') on conflict do nothing");
 await rpc('create_finance_tax_filing',[randomUUID(),'2026-09-01','vat',await scalar("select md5(tax_filing_pool('2026-09-01','vat')::text)"),null,null]);
 // Synthetic catalog only parameterizes this local SQL; never write it to approved artifacts.
 const local={...contract,after:{functions:await query(prior.functionSql),catalog:await query(prior.catalogSql)},profile_security:(await query(prior.profileSecuritySql))[0]};
 const pre=(await query(a.preflight(local)))[0];assert.equal(pre.gate_pass,true);
 const options={baselineSha:pre.baseline_sha256,capturedAt:pre.baseline.captured_at,manifest:local};
 const sql=v.generate(options);
 assert.equal((await query(sql))[0].gate_pass,false,'Pre-apply state is never mistaken for installed 065');
 const rows=await scalar(a.rowSql);await db.exec(migration('65'));
 // Validation must succeed under a real read-only transaction, without temporary
 // compatibility functions, rollback tricks, old RPC execution or restored rows.
 await db.exec('commit;begin read only');
 let result;try{result=(await query(sql))[0];}catch(e){console.error(e.message,e.position,e.where);throw e;}
 assert.deepEqual(result.failed_checks,[]);assert.equal(result.gate_pass,true);
 assert.equal(result.exact_approved_baseline_matched,true);assert.equal(result.reconstructed_preapply_baseline_sha256,pre.baseline_sha256);
 assert.equal(result.historical_rows_unchanged,true);assert.deepEqual(result.function_differences,[]);assert.deepEqual(result.catalog_differences,[]);
 assert.deepEqual([result.september_facts.output_vat,result.september_facts.input_vat,result.september_facts.net_vat],[700,19.63,680.37]);
 assert.deepEqual(await scalar(a.rowSql),rows);assert.equal(result.broader_unresolved_differences,490);
 await db.exec('rollback;begin');
 const wrongSha=(await query(v.generate({...options,baselineSha:'0'.repeat(64)})))[0];assert.equal(wrongSha.gate_pass,false);assert.equal(wrongSha.historical_rows_unchanged,null);
 assert.equal((await query(v.generate({...options,capturedAt:'2020-01-01T00:00:00+00:00'})))[0].gate_pass,false);
 async function drift(change,expected){await db.exec('savepoint drift');await db.exec(change);const r=(await query(sql))[0];assert.equal(r.gate_pass,false);assert.ok(r.failed_checks.includes(expected),JSON.stringify(r.failed_checks));await db.exec('rollback to savepoint drift;release savepoint drift');}
 await drift("update finance_tax_periods set version=version+1 where period_month=date '2026-09-01'",'exact_approved_baseline_matched');
 await drift('grant execute on function tax_input_vat_evidence(date) to anon','new_helpers_explicit_security');
 await drift('grant select on finance_external_input_vat to authenticated','catalog_and_security_preserved');
 await drift('alter table finance_external_input_vat disable trigger external_input_vat_immutable','immutability_triggers_enabled');
 await drift('revoke execute on function tax_filing_assert(uuid) from service_role','exact_approved_baseline_matched');
 await drift("create or replace function tax_filing_monthly_facts(p_month date) returns jsonb language plpgsql stable security definer set search_path=public as $$begin raise exception 'UNVERIFIED_FUNCTION_MUST_NOT_EXECUTE';end$$",'exact_installed_065_functions');
 await drift("create function tax_input_vat_evidence(p_month text) returns jsonb language sql as $$select '{}'::jsonb$$",'new_helpers_exact_namespace');
 assert.deepEqual((await query(sql))[0].failed_checks,[]);assert.deepEqual(await scalar(a.rowSql),rows);
});
