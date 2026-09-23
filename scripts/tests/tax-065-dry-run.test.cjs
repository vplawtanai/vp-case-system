/* eslint-disable @typescript-eslint/no-require-imports */
// Local in-memory PostgreSQL only. No network/Production connection.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{execFileSync}=require('node:child_process');
const a=require('./tax-065-gate.cjs'),dry=require('./tax-065-dry-run.cjs'),prior=require('./tax-simple-artifacts.cjs'),production=require('./tax-064-scoped-contract.json');
const setupPrior=require('./employee-reimbursement-postgres.test.cjs'),company=require('./company-review-modal-postgres.test.cjs'),requests=require('./expense-request-postgres.test.cjs');
const {db,query,scalar,rpc,migration}=require('./receipt-foundation.test.cjs');

test('065 rollback export is offline, pinned, parameterized and cannot commit candidate DDL',()=>{
 a.validateArtifacts();dry.validateTemplate();
 const args={baselineSha:'e435c194590aaa322c061e600705613d3757d0e8a8ad5357f6d1a194e6027d59',capturedAt:'2026-09-23T13:00:00.123456+00:00'};
 const sql=dry.generate(args);const code=sql.replace(/'(?:[^']|'')*'/g,"''").replace(/--[^\n]*/g,'');
 assert.doesNotMatch(code,/\bCOMMIT\s*;/i);assert.match(code,/ROLLBACK;/);assert.match(code,/EXCEPTION WHEN SQLSTATE/);
 assert.ok(sql.includes('065_APPROVED_BASELINE_MISMATCH'));assert.ok(sql.indexOf('065_APPROVED_BASELINE_MISMATCH')<sql.indexOf('EXECUTE candidate_sql;'));
 assert.ok(sql.includes('065_ROLLBACK_RESTORATION_FAILED'));assert.ok(sql.includes('broader_unresolved_differences'));
 assert.equal(execFileSync(process.execPath,['scripts/tests/tax-065-gate.cjs','print-dry-run','--baseline-sha',args.baselineSha,'--captured-at',args.capturedAt],{encoding:'utf8',maxBuffer:4*1024*1024}),sql);
 assert.throws(()=>dry.generate({...args,baselineSha:'not-a-hash'}));assert.throws(()=>dry.generate({...args,capturedAt:"x'; commit; --"}));
 assert.throws(()=>execFileSync(process.execPath,['scripts/tests/tax-065-gate.cjs','print-dry-run','--baseline-sha',args.baselineSha],{stdio:'pipe'}));
});

test('065 rollback uses exact timestamp-bound baseline, rolls back DDL/data/security even on failure, and returns one verified report',async()=>{
 await setupPrior.setup();for(const n of ['62','63','64'])await db.exec(migration(n));
 await db.exec('grant execute on function tax_filing_assert(uuid),tax_filing_allocation_pool_v1(date,text) to service_role');
 const choices=company.choices({wht_state:'none',wht_rate:0});
 const lines=requests.items([300],{personally_paid:false,reimbursement_requested:0,company_request_version:1,creator_payment_fact:'unpaid',creator_tax:choices,supplier_payee_id:null,vendor_name:'Big C'});lines[0].id=a.bigC;
 const purchase=await requests.save(lines,'company_expense_batch');await rpc('submit_finance_expense_request',[purchase.id,1]);await company.approve((await requests.read(purchase.id)).items[0],choices);
 const claimLines=requests.items([500,300,500]);claimLines.forEach((l,i)=>{l.id=a.claims[i];});const claims=await requests.save(claimLines);await rpc('submit_finance_expense_request',[claims.id,1]);
 for(const e of (await requests.read(claims.id)).items)await rpc('review_finance_employee_reimbursement',[randomUUID(),e.id,e.version,true,e.gross_amount,'']);
 await db.exec("insert into finance_tax_periods(period_month) values(date '2026-09-01') on conflict do nothing");
 const filingId=randomUUID();await rpc('create_finance_tax_filing',[filingId,'2026-09-01','vat',await scalar("select md5(tax_filing_pool('2026-09-01','vat')::text)"),null,null]);
 const local={...production,after:{functions:await query(prior.functionSql),catalog:await query(prior.catalogSql)},profile_security:(await query(prior.profileSecuritySql))[0]};
 const preSql=a.preflight(local),pre=(await query(preSql))[0];assert.deepEqual(pre.failed_checks,[]);
 const options={baselineSha:pre.baseline_sha256,capturedAt:pre.baseline.captured_at,preflightSql:preSql};
 const sql=dry.generate(options);
 await db.exec('commit');
 const snapshot=async()=>({rows:await scalar(a.rowSql),functions:await scalar(dry.allFunctionsSql),catalog:await scalar(dry.catalogSql)});
 const before=await snapshot();
 async function fails(code,re){await assert.rejects(db.exec(code),re);await db.exec('rollback');assert.deepEqual(await snapshot(),before);}
 await fails(dry.generate({...options,baselineSha:'0'.repeat(64)}),/065_APPROVED_BASELINE_MISMATCH/);
 await fails(dry.generate({...options,capturedAt:'2020-01-01T00:00:00+00:00'}),/065_APPROVED_BASELINE_MISMATCH/);
 const stale=dry.generate(options).replace('EXECUTE pre_sql INTO before_result;',"UPDATE public.finance_tax_periods SET version=version+1 WHERE period_month=date '2026-09-01'; EXECUTE pre_sql INTO before_result;");
 await fails(stale,/065_APPROVED_BASELINE_MISMATCH/);
 for(const injected of [
  "UPDATE public.finance_tax_periods SET version=version+1 WHERE period_month=date '2026-09-01';",
  "EXECUTE 'grant select on public.finance_external_input_vat to anon';",
  "EXECUTE 'create function public.unintended065() returns boolean language sql as ''select true''';"
 ])await fails(sql.replace('EXECUTE candidate_sql;',`EXECUTE candidate_sql; ${injected}`),/065_REHEARSAL_FAILED/);
 let result;try{result=await db.exec(sql);}catch(e){console.error(e.message,e.where,e.internalQuery?.slice(0,1000));throw e;}
 const reports=result.flatMap(r=>r.rows||[]).filter(r=>r.rollback_only_dry_run);assert.equal(reports.length,1);
 const report=reports[0].rollback_only_dry_run;assert.equal(report.gate_pass,true);assert.deepEqual(report.failed_checks,[]);
 assert.deepEqual(report.function_differences,[]);assert.deepEqual(report.catalog_differences,[]);assert.equal(report.historical_rows_unchanged,true);
 assert.equal(report.approved_baseline_sha256,pre.baseline_sha256);assert.equal(report.exact_approved_baseline_matched,true);assert.equal(report.rollback_verified,true);
 assert.equal(report.existing_filing_integrity_passed,true);assert.equal(report.candidate_present_after_rollback,false);
 assert.deepEqual([report.september_facts.output_vat,report.september_facts.input_vat,report.september_facts.net_vat],[700,19.63,680.37]);
 assert.deepEqual(await snapshot(),before,'Full outer rollback preserves data, all public functions/catalog, and money tables');
 assert.equal(await scalar("select to_regclass('pg_temp.tax065_rehearsal_result') is null"),true);
 assert.equal(await scalar("select to_regprocedure('public.tax_input_vat_evidence(date)') is null"),true);
 assert.equal((await scalar("select tax_filing_monthly_facts('2026-09-01')")).reviewed_input_vat,0);
});
