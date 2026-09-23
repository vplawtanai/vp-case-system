/* eslint-disable @typescript-eslint/no-require-imports */
// Current dependency-scoped gate. Historical whole-catalog evidence stays separate.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const historical=require('./tax-064-historical-artifacts.cjs');
const audit=require('./tax-064-dependency-audit.json');
const accepted=require('./employee-reimbursement-catalog.json');
const migrationPath='supabase/migrations/202607180064_add_external_input_vat_evidence.sql';
const manifestPath='scripts/tests/tax-064-scoped-contract.json';
const files=historical.files,source=()=>fs.readFileSync(migrationPath,'utf8');
const sha=()=>createHash('sha256').update(source()).digest('hex');
const q=s=>"'"+s.replaceAll("'","''")+"'",list=xs=>xs.map(q).join(',');
const newTables=audit.new_tables,newFunctions=audit.new_functions;
const signatures=[...new Set([...audit.runtime_existing_functions.map(f=>f.signature),...audit.affected_tax_readers,...accepted.functions.map(f=>f.signature.replace(/^public\./,'').replace(/\s/g,''))])].sort();
const tableNames=[...new Set([...audit.runtime_existing_tables.map(t=>t.name).filter(n=>n!=='user_profiles'),...audit.protected_finance_tables,...accepted.catalog.map(t=>t.name)])].sort();
const rowTables=[...new Set([...audit.new_path_write_tables,...audit.protected_finance_tables,...accepted.catalog.map(t=>t.name)])].sort();
const functionSql=`select p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,md5(pg_get_functiondef(p.oid)) definition_hash,p.prosecdef security_definer,p.proconfig config,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and replace(p.oid::regprocedure::text,' ','') in (${list([...signatures,...newFunctions])}) order by 1`;
const catalogSql=`select x.*,pg_get_userbyid(c.relowner) owner,c.relforcerowsecurity force_rls from (${historical.catalogSql}) x join pg_class c on c.oid=to_regclass('public.'||x.name) where x.name in (${list([...tableNames,...newTables])}) order by x.name`;
const profileSecuritySql=`select c.relname name,pg_get_userbyid(c.relowner) owner,c.relrowsecurity rls,c.relforcerowsecurity force_rls,c.relacl::text acl from pg_class c where c.oid='public.user_profiles'::regclass`;
const evidenceSql=historical.evidenceSql;
const rowSql=`select jsonb_build_object(${rowTables.map(t=>`${q(t)},(select jsonb_build_object('count',count(*),'hash',md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text)) from public.${t} r)`).join(',')}) hash`;
const defaultsSql=`select pg_get_userbyid(d.defaclrole) owner,coalesce(n.nspname,'*') schema,d.defaclobjtype object_type,d.defaclacl::text acl from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where pg_get_userbyid(d.defaclrole)='postgres' and (d.defaclnamespace=0 or n.nspname='public') and d.defaclobjtype in ('f','r') order by 1,2,3`;
function differences(name,sql,expected,key){return `${name}_actual as (${sql}),${name}_expected as (select value v from jsonb_array_elements(${q(JSON.stringify(expected))}::jsonb)),${name}_differences as (select e.v expected,to_jsonb(a) actual from ${name}_actual a full join ${name}_expected e on to_jsonb(a)->>${q(key)}=e.v->>${q(key)} where to_jsonb(a) is distinct from e.v)`;}
function securitySql(post){
 const names=['finance_tax_source_revisions','finance_tax_position_facts',...(post?newTables:[])];
 return `select
 current_user='postgres' applying_as_finance_owner,
 (select rolbypassrls and not rolsuper from pg_roles where rolname='service_role') service_role_bypasses_rls,
 (select bool_and(has_schema_privilege(r,'public','USAGE')) from unnest(array['postgres','authenticated','service_role']) r) schema_usage,
 has_schema_privilege('postgres','auth','USAGE') identity_schema_usage,
 has_function_privilege('postgres','auth.uid()','EXECUTE') identity_access,
 (select bool_and(has_function_privilege('postgres',signature,'EXECUTE')) from unnest(array[${list(signatures)}]) signature) owner_dependency_execute,
 has_function_privilege('service_role','public.tax_position_source(text,uuid)','EXECUTE') helper_service_execute,
 not has_function_privilege('anon','public.tax_position_source(text,uuid)','EXECUTE') and not has_function_privilege('authenticated','public.tax_position_source(text,uuid)','EXECUTE') helper_clients_denied,
 (select bool_and(has_table_privilege('postgres','public.'||name,'SELECT') and has_table_privilege('service_role','public.'||name,'SELECT') and has_table_privilege('service_role','public.'||name,'INSERT')) from unnest(array[${list(names)}]) name) required_table_access,
 (select bool_and(has_table_privilege('authenticated','public.'||name,'SELECT') and not has_table_privilege('authenticated','public.'||name,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not has_table_privilege('anon','public.'||name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) from unnest(array['finance_tax_source_revisions','finance_tax_position_facts']) name) existing_table_client_access,
 ${post?`(select bool_and(not has_table_privilege('anon','public.'||name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') and not has_table_privilege('authenticated','public.'||name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') and not has_table_privilege('service_role','public.'||name,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')) from unnest(array[${list(newTables)}]) name)`:'true'} new_table_least_privilege,
 ${post?`(select bool_and(has_function_privilege('authenticated',signature,'EXECUTE')) from unnest(array[${list(newFunctions.filter(n=>!n.startsWith('tax_position_source_before')))}]) signature)`:'true'} controlled_rpc_access`;
}
function workflow(manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'))){
 assert.equal(manifest.sha256,sha());assert.equal(manifest.broader_unresolved_differences,490);
 const statement=post=>{
  const expected=manifest[post?'after':'before'];
  return `-- SELECT-only dependency-scoped 064 ${post?'Post-Apply Verifier':'Preflight'}. No business RPC calls.
-- The broader 490 differences remain unresolved, NOT accepted by this gate.
with ${differences('function',functionSql,expected.functions,'signature')},
${differences('catalog',catalogSql,expected.catalog,'name')},
profile_actual as (${profileSecuritySql}),defaults_actual as (${defaultsSql}),
evidence as (${rowSql}),effective as (${securitySql(post)}),
prior_rows as (select convert_from(decode(nullif(current_setting('vp.tax064_before_b64',true),''),'base64'),'UTF8')::jsonb hashes),
checks(name,passed) as (values
 ('candidate_sha256',encode(sha256(convert_to(${q(source())},'UTF8')),'hex')=${q(sha())}),
 ('exact_dependency_functions',not exists(select 1 from function_differences)),
 ('exact_dependency_catalog_and_security',not exists(select 1 from catalog_differences)),
 ('profile_security_preserved',(select to_jsonb(p) from profile_actual p)=${q(JSON.stringify(manifest.profile_security))}::jsonb),
 ('profile_required_fields',(select count(*)=6 from pg_attribute where attrelid='public.user_profiles'::regclass and not attisdropped and ((attname='id' and atttypid='uuid'::regtype) or (attname='role' and atttypid in ('text'::regtype,'varchar'::regtype)) or (attname in ('active','can_view_finance_tax_invoices','can_manage_finance_tax_invoices','can_issue_finance_tax_invoices') and atttypid='boolean'::regtype)))),
 ('creation_defaults_frozen',(select coalesce(jsonb_agg(to_jsonb(d) order by owner,schema,object_type),'[]') from defaults_actual d)=${q(JSON.stringify(manifest.defaults))}::jsonb),
 ('effective_security',(select bool_and(value='true'::jsonb) from effective e,jsonb_each(to_jsonb(e)))),
 ('external_targets_${post?'exact':'absent'}',${post?`(select count(*)=2 from catalog_actual where name in (${list(newTables)})) and (select count(*)=4 from function_actual where signature in (${list(newFunctions)}))`:`not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (${list([...newTables,'external_input_vat_invoice_unique','external_input_vat_initial_review'])})) and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (${list(newFunctions.map(s=>s.split('(')[0]))}))`}),
 ('historical_${post?'rows_unchanged':'baseline_captured'}',${post?'(select hashes is not null and hashes=(select hash from evidence) from prior_rows)':`(select count(*)=${rowTables.length} from evidence e,jsonb_object_keys(e.hash))`})
)
select (select bool_and(passed is true) from checks) gate_pass,
 (select coalesce(jsonb_agg(name) filter(where passed is distinct from true),'[]') from checks) failed_checks,
 (select jsonb_object_agg(name,passed) from checks) checks,
 (select hash from evidence) historical_hashes,
 (select hashes=(select hash from evidence) from prior_rows) historical_rows_unchanged,
 (select to_jsonb(e) from effective e) effective_permissions,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d) function_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) catalog_differences,
 ${q(sha())} migration_sha256,490 broader_unresolved_differences,
 ${q(manifest.capture_sha256)} capture_sha256;
`;
 };
 const pre=statement(false),verify=statement(true),sub=s=>s.trim().replace(/;$/,'');
 const assertGate=setting=>`DO $gate$ BEGIN IF current_setting('${setting}') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION '064 gate ${setting} failed: %; STOP',current_setting('vp.tax064_failed_checks',true); END IF; END $gate$;`;
 const dry=`-- Manual operator only. Session settings hold hashes; no sample business transactions.
-- On any error, psql ON_ERROR_STOP closes the session and rolls back the transaction.
BEGIN READ ONLY;
select set_config('vp.tax064_before_b64',encode(convert_to(historical_hashes::text,'UTF8'),'base64'),false),set_config('vp.tax064_preflight',gate_pass::text,false),set_config('vp.tax064_failed_checks',failed_checks::text,false) from (${sub(pre)}) p;
${assertGate('vp.tax064_preflight')}
COMMIT; -- Ends only the read-only baseline capture; candidate DDL is below.
BEGIN;
${source()}
${verify}
select set_config('vp.tax064_verified',gate_pass::text,true),set_config('vp.tax064_failed_checks',failed_checks::text,true) from (${sub(verify)}) p;
${assertGate('vp.tax064_verified')}
ROLLBACK;
-- Verify the pre-migration contract is restored and all protected rows still match.
select set_config('vp.tax064_rolled_back',(gate_pass and historical_rows_unchanged is true)::text,false),set_config('vp.tax064_failed_checks',(failed_checks||jsonb_build_object('historical_rows_unchanged',historical_rows_unchanged))::text,false) from (${sub(pre)}) p;
${assertGate('vp.tax064_rolled_back')}
${pre}`;
 return {[files.pre]:pre,[files.verify]:verify,[files.dry]:dry};
}
module.exports={migrationPath,manifestPath,sha,source,functionSql,catalogSql,evidenceSql,rowSql,profileSecuritySql,defaultsSql,files,workflow,signatures,tableNames,newTables,newFunctions,rowTables};
if(require.main===module){for(const [p,s] of Object.entries(workflow())){if(process.argv.includes('--write'))fs.writeFileSync(p,s);else assert.equal(fs.readFileSync(p,'utf8'),s);}console.log('064 dependency-scoped artifacts verified; no database connection');}
