/* eslint-disable @typescript-eslint/no-require-imports */
// Deterministic local artifact generation; never connects to any database.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const prior=require('./vp-distribution-artifacts.cjs');
const {definition}=require('./tax-invoice-sql-artifacts.cjs');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const migrationPath='supabase/migrations/202607180046_add_vp_distribution_formula_evidence.sql';
const filenames={pre:'scripts/sql/preflight_vp_distribution_formula_evidence.sql',dry:'scripts/sql/dry_run_vp_distribution_formula_evidence.sql',verify:'scripts/sql/verify_vp_distribution_formula_evidence.sql'};
const q=s=>"'"+s.replaceAll("'","''")+"'";
function replace(source,from,to){assert.ok(source.includes(from),'Missing artifact anchor '+from.slice(0,90));return source.replace(from,to);}
function workflow(){
 const sql=read(migrationPath),facts=prior.contractFacts(sql);
 const catalog=JSON.parse(read('app/finance/compensation/formula-definitions.json'));
 assert.equal(JSON.parse(/\$json\$([\s\S]*?)\$json\$/.exec(sql)[1]).version,catalog.version);
 assert.deepEqual(JSON.parse(/\$json\$([\s\S]*?)\$json\$/.exec(sql)[1]),catalog);
 assert.equal(definition(sql,'vp_distribution_amount_choices_v1'),definition(read(prior.migrationPath),'vp_distribution_choices').replace('vp_distribution_choices','vp_distribution_amount_choices_v1'));
 const additions=facts.filter(f=>f.name!=='vp_distribution_choices'),signatures=additions.map(f=>q(f.signature)).join(',');
 let base=prior.workflow()[prior.filenames.verify].trim().replace(/;$/,'');
 base=replace(base,"\n ('zero_state',not exists(select 1 from public.finance_vp_revenue_distributions) and not exists(select 1 from public.finance_vp_revenue_distribution_audit)),","\n");
 const extraEvidence=`jsonb_build_object('finance_vp_revenue_distributions',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_vp_revenue_distributions r),'finance_vp_revenue_distribution_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_vp_revenue_distribution_audit r))`;
 const header='-- ONE SELECT-only statement / ONE result row. No application RPC calls.\n-- Stop on any failed_checks. Compare ALL upstream_evidence_hashes between preflight and post-apply; mutable row counts are not gates.\n-- No operator attestation here substitutes for the external human Production apply decision.\n';
 function make(post){
  let contract=base;
  if(post){
   const previous=prior.contractFacts(read(prior.migrationPath)).find(f=>f.name==='vp_distribution_choices'),next=facts.find(f=>f.name==='vp_distribution_choices');
   contract=replace(contract,q(previous.hash),q(next.hash));
   contract=replace(contract,"actual_domain_functions as(select p.oid,p.oid::regprocedure::text as signature from pg_proc p where p.pronamespace='public'::regnamespace and",
    "actual_domain_functions as(select p.oid,p.oid::regprocedure::text as signature from pg_proc p where p.oid not in (select to_regprocedure(s) from unnest(array["+signatures+"]::text[]) s) and p.pronamespace='public'::regnamespace and");
   contract=replace(contract,"and not t.tgisinternal) as triggers","and not t.tgisinternal and t.tgname<>'vp_formula_result_guard') as triggers");
  }
  const prefix=post?prior.functionCtes(facts.map(f=>({...f,isNew:true})))+',':'';
  const unused=`not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and (proname like 'vp_formula_%' or proname in('vp_compensation_formula_catalog','vp_distribution_amount_choices_v1','get_finance_vp_formula_context'))) and not exists(select 1 from pg_trigger where tgname='vp_formula_result_guard')`;
  const guard=`(select count(*)=1 and bool_and(t.tgrelid='public.finance_vp_revenue_distributions'::regclass and t.tgfoid=to_regprocedure('public.vp_formula_result_guard()') and t.tgtype=23 and t.tgenabled='O' and not t.tgdeferrable and not t.tgisinternal and t.tgqual is null and t.tgnargs=0 and t.tgattr::text='') from pg_trigger t where t.tgname='vp_formula_result_guard' or t.tgfoid=to_regprocedure('public.vp_formula_result_guard()'))`;
  const extraChecks=post?`('exact_formula_functions',not exists(select 1 from function_differences)),
 ('formula_rpc_private_permissions',${prior.functionPrivileges(facts,['get_finance_vp_formula_context'])}),
 ('formula_function_inventory',(select count(*)=${additions.length} and bool_and(oid in(select to_regprocedure(s) from unnest(array[${signatures}]::text[]) s)) from pg_proc where pronamespace='public'::regnamespace and (proname like 'vp_formula_%' or proname in('vp_compensation_formula_catalog','vp_distribution_amount_choices_v1','get_finance_vp_formula_context')))),
 ('mandatory_formula_guard',${guard}),
 ('rollback_evidence_unchanged',nullif(current_setting('vp.formula046_before',true),'') is null or current_setting('vp.formula046_before',true)=(select evidence::text from protected))`:
 `('046_namespace_unused',${unused}),
 ('recipient_profile_contract',(select count(*)=5 and bool_and(case when attname='id' then atttypid='uuid'::regtype when attname='active' then atttypid='boolean'::regtype else atttypid in('text'::regtype,'varchar'::regtype) end) from pg_attribute where attrelid='public.user_profiles'::regclass and attname in('id','active','staff_name','full_name','email') and not attisdropped))`;
  return header+`with ${prefix}predecessor as(${contract}),
 protected as(select upstream_evidence_hashes || ${extraEvidence} as evidence from predecessor),
 extra_checks(name,passed) as(values ${extraChecks}),
 checks as(select key as name,value='true'::jsonb as passed from predecessor,jsonb_each(checks)
 union all select name,passed is true from extra_checks)
 select (select jsonb_object_agg(name,passed order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where not passed),'[]') from checks) as failed_checks,
 (select bool_and(passed) from checks) as vp_distribution_formula_${post?'verification':'preflight'}_pass,
 (select evidence from protected) as upstream_evidence_hashes,
 (select to_jsonb(p)-'upstream_evidence_hashes' from predecessor p) as predecessor_diagnostics,
 ${post?"(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d)":" '[]'::jsonb"} as formula_function_differences,
 jsonb_build_object('distribution_rows',(select count(*) from public.finance_vp_revenue_distributions),'distribution_audit_rows',(select count(*) from public.finance_vp_revenue_distribution_audit)) as observability_only,
 current_setting('server_version_num')::integer as server_version_num;\n`;
 }
 const pre=make(false),verify=make(true);
 return {[filenames.pre]:pre,[filenames.verify]:verify,[filenames.dry]:'BEGIN;\n-- ROLLBACK ONLY. No business RPCs or synthetic row creation.\n'+
 `select set_config('vp.formula046_before',upstream_evidence_hashes::text,true) from (${pre.trim().replace(/;$/,'')}) p;\n`+
 `-- BEGIN EMBEDDED MIGRATION 046\n${sql}-- END EMBEDDED MIGRATION 046\n${verify}ROLLBACK;\n`};
}
module.exports={workflow,filenames,migrationPath};
if(require.main===module){
 for(const [file,content] of Object.entries(workflow())){
  if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,file),content);
  else assert.equal(read(file),content,file);
 }
 console.log('046 local artifacts '+(process.argv.includes('--write')?'generated':'verified'));
}
