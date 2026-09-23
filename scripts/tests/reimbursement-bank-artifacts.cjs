/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const prior=require('./employee-reimbursement-artifacts.cjs');
const migrationPath='supabase/migrations/202607180063_fix_reimbursement_bank_outflow.sql';
const filenames={pre:'scripts/sql/preflight_reimbursement_bank_outflow.sql',dry:'scripts/sql/dry_run_reimbursement_bank_outflow.sql',verify:'scripts/sql/verify_reimbursement_bank_outflow.sql'};
const manifestPath='scripts/tests/reimbursement-bank-function.json';
const sha=()=>createHash('sha256').update(source()).digest('hex');
const q=s=>"'"+s.replaceAll("'","''")+"'",source=()=>fs.readFileSync(migrationPath,'utf8');
const differences=(name,sql,expected,key)=>`${name}_actual as(${sql}),${name}_expected as(select value expected from jsonb_array_elements(${q(JSON.stringify(expected))}::jsonb)),${name}_differences as(select e.expected,to_jsonb(a) actual from ${name}_expected e full join ${name}_actual a on e.expected->>${q(key)}=a.${key} where e.expected is distinct from to_jsonb(a))`;
function workflow(){
 const before=JSON.parse(fs.readFileSync(prior.manifestPath,'utf8')),after=structuredClone(before.catalog);
 const constraint=after.find(c=>c.name==='finance_expenses').constraints.find(c=>c.name==='finance_expenses_description_check');
 assert.equal(constraint.definition,'CHECK (((length(btrim(description)) >= 1) AND (length(btrim(description)) <= 2000)))');constraint.definition='CHECK ((length(btrim(description)) <= 2000))';
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));assert.equal(manifest.sha256,sha());
 const functions=before.functions.map(f=>f.name==='confirm_finance_expense_payout'?manifest.function:f);
 const tables=['finance_expenses','finance_expense_requests','finance_expense_settlements','finance_expense_obligations','finance_payouts','finance_payout_allocations','finance_cash_transactions','finance_outgoing_wht_obligations','finance_payees','finance_payee_destinations'];
 const statement=post=>`-- SELECT-only: exact 062 baseline / narrow 063 result. No business RPCs.
-- Compare business_evidence_hashes with Preflight after manual apply.
with ${differences('function',prior.functionSql(),post?functions:before.functions,'signature')},${differences('catalog',prior.catalogSql,after,'name')},
evidence as(select jsonb_build_object(${tables.map(t=>`${q(t)},(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.${t} r)`).join(',')}) hash),
checks(name,passed) as(values
 ('exact_${post?'063':'062'}_and_preserved_functions',not exists(select 1 from function_differences)),
 ('exact_062_catalog',not exists(select 1 from catalog_differences)),
 ('historical_rows_unchanged',nullif(current_setting('vp.expense063_before',true),'') is null or current_setting('vp.expense063_before',true)=(select hash::text from evidence)))
select (select bool_and(passed is true) from checks) reimbursement_bank_${post?'verification':'preflight'}_pass,
 (select coalesce(jsonb_agg(name) filter(where passed is distinct from true),'[]') from checks) failed_checks,
 (select jsonb_object_agg(name,passed is true) from checks) checks,
 (select hash from evidence) business_evidence_hashes,
 nullif(current_setting('vp.expense063_before',true),'') is not null rehearsal_baseline_available,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d) function_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) catalog_differences,
 ${q(createHash('sha256').update(source()).digest('hex'))} migration_063_sha256;
`;
 const pre=statement(false),verify=statement(true);
 const dry=`-- Rollback-only rehearsal; no sample business transactions.
BEGIN;
select set_config('vp.expense063_before',business_evidence_hashes::text,true),set_config('vp.expense063_preflight',reimbursement_bank_preflight_pass::text,true) from (${pre.trim().replace(/;$/,'')}) p;
DO $gate$ BEGIN IF current_setting('vp.expense063_preflight')<>'true' THEN RAISE EXCEPTION '063 preflight failed; STOP'; END IF; END $gate$;
${source()}
${verify}ROLLBACK;
`;
 return {[filenames.pre]:pre,[filenames.dry]:dry,[filenames.verify]:verify};
}
module.exports={workflow,filenames,migrationPath,manifestPath,sha,functionSql:prior.functionSql};
if(require.main===module){for(const[file,sql]of Object.entries(workflow())){if(process.argv.includes('--write'))fs.writeFileSync(file,sql);else assert.equal(fs.readFileSync(file,'utf8'),sql);}console.log('063 artifacts verified');}
