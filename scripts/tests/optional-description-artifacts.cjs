/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const prior=require('./employee-reimbursement-artifacts.cjs');
const migrationPath='supabase/migrations/202607180062_allow_empty_expense_description.sql';
const filenames={pre:'scripts/sql/preflight_optional_expense_description.sql',dry:'scripts/sql/dry_run_optional_expense_description.sql',verify:'scripts/sql/verify_optional_expense_description.sql'};
const q=s=>"'"+s.replaceAll("'","''")+"'",source=()=>fs.readFileSync(migrationPath,'utf8');
const differences=(name,sql,expected,key)=>`${name}_actual as(${sql}),${name}_expected as(select value expected from jsonb_array_elements(${q(JSON.stringify(expected))}::jsonb)),${name}_differences as(select e.expected,to_jsonb(a) actual from ${name}_expected e full join ${name}_actual a on e.expected->>${q(key)}=a.${key} where e.expected is distinct from to_jsonb(a))`;
function workflow(){
 const before=JSON.parse(fs.readFileSync(prior.manifestPath,'utf8')),after=structuredClone(before.catalog);
 const constraint=after.find(c=>c.name==='finance_expenses').constraints.find(c=>c.name==='finance_expenses_description_check');
 assert.equal(constraint.definition,'CHECK (((length(btrim(description)) >= 1) AND (length(btrim(description)) <= 2000)))');constraint.definition='CHECK ((length(btrim(description)) <= 2000))';
 const statement=post=>`-- SELECT-only: exact 061 baseline / narrow 062 result. No business RPCs.
-- Compare expense_evidence_hash with Preflight after manual apply.
with ${differences('function',prior.functionSql(),before.functions,'signature')},${differences('catalog',prior.catalogSql,post?after:before.catalog,'name')},
evidence as(select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]')::text) hash from public.finance_expenses e),
checks(name,passed) as(values
 ('exact_preserved_functions',not exists(select 1 from function_differences)),
 ('exact_${post?'062':'061'}_catalog',not exists(select 1 from catalog_differences)),
 ('historical_rows_unchanged',nullif(current_setting('vp.expense062_before',true),'') is null or current_setting('vp.expense062_before',true)=(select hash from evidence)))
select (select bool_and(passed is true) from checks) optional_description_${post?'verification':'preflight'}_pass,
 (select coalesce(jsonb_agg(name) filter(where passed is distinct from true),'[]') from checks) failed_checks,
 (select jsonb_object_agg(name,passed is true) from checks) checks,
 (select hash from evidence) expense_evidence_hash,
 nullif(current_setting('vp.expense062_before',true),'') is not null rehearsal_baseline_available,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d) function_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) catalog_differences,
 ${q(createHash('sha256').update(source()).digest('hex'))} migration_062_sha256;
`;
 const pre=statement(false),verify=statement(true);
 const dry=`-- Rollback-only rehearsal; no sample business transactions.
BEGIN;
select set_config('vp.expense062_before',expense_evidence_hash,true),set_config('vp.expense062_preflight',optional_description_preflight_pass::text,true) from (${pre.trim().replace(/;$/,'')}) p;
DO $gate$ BEGIN IF current_setting('vp.expense062_preflight')<>'true' THEN RAISE EXCEPTION '062 preflight failed; STOP'; END IF; END $gate$;
${source()}
${verify}ROLLBACK;
`;
 return {[filenames.pre]:pre,[filenames.dry]:dry,[filenames.verify]:verify};
}
module.exports={workflow,filenames,migrationPath};
if(require.main===module){for(const[file,sql]of Object.entries(workflow())){if(process.argv.includes('--write'))fs.writeFileSync(file,sql);else assert.equal(fs.readFileSync(file,'utf8'),sql);}console.log('062 artifacts verified');}
