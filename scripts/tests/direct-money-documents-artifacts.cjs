/* eslint-disable @typescript-eslint/no-require-imports */
// Offline candidate/gate exporter. No network, connection string or execution mode.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const generator=require('./direct-money-documents-migration.cjs');
const migrationPath=generator.path,contractPath='scripts/tests/direct-money-documents-contract.json';
const files={preflight:'scripts/sql/preflight_direct_money_documents_066.sql',dryRun:'scripts/sql/dry_run_direct_money_documents_066.sql',verifier:'scripts/sql/verify_direct_money_documents_066.sql'};
const q=s=>"'"+s.replaceAll("'","''")+"'",list=xs=>xs.map(q).join(','),sha=s=>createHash('sha256').update(s).digest('hex');
const source=()=>fs.readFileSync(migrationPath,'utf8');
const tables=['finance_receipts','finance_tax_invoices','finance_combined_documents','finance_receipt_invoice_allocations','finance_tax_invoice_items','finance_tax_invoice_source_coverages','finance_tax_point_events','finance_tax_document_corrections','finance_direct_money_receipts'];
const newColumns=['direct_money_receipt_id','direct_source_line_id'];
const functionsSql=`select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'security_definer',p.prosecdef,'config',p.proconfig,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text),'[]') value
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'`;
const catalogSql=`select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'generated',a.attgenerated,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum),'[]') from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid),'validated',convalidated) order by conname),'[]') from pg_constraint where conrelid=c.oid),
 'indexes',(select coalesce(jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) order by indexname),'[]') from pg_indexes where schemaname='public' and tablename=c.relname),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by policyname),'[]') from pg_policies p where schemaname='public' and tablename=c.relname),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) order by tgname),'[]') from pg_trigger where tgrelid=c.oid and not tgisinternal),
 'anon_select',has_table_privilege('anon',c.oid,'SELECT'),'authenticated_write',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'),
 'service_select',has_table_privilege('service_role',c.oid,'SELECT')) order by c.relname),'[]') value
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v')`;
function rowsSql(rowTables){return `select jsonb_object_agg(name,hash order by name) value from (values ${rowTables.map(t=>{const row=tables.includes(t)?`to_jsonb(r)-array[${list(newColumns)}]`:'to_jsonb(r)';return `(${q(t)},(select jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(jsonb_agg(${row} order by (${row})::text collate "C"),'[]')::text,'UTF8')),'hex')) from public.${t} r))`;}).join(',')}) data(name,hash)`;}

function captureSql(c){return `select jsonb_build_object('functions',f.value,'catalog',c.value,'rows',r.value,'defaults',(select coalesce(jsonb_agg(to_jsonb(d)-'oid' order by defaclrole,defaclnamespace,defaclobjtype),'[]') from pg_default_acl d)) value from (${functionsSql}) f cross join (${catalogSql}) c cross join (${rowsSql(c.rowTables)}) r`;}
function expectedCtes(c,post){return `expected_functions as (select value v from jsonb_array_elements(${q(JSON.stringify(post?c.after.functions:c.before.functions))}::jsonb)),
 expected_catalog as (select value v from jsonb_array_elements(${q(JSON.stringify(post?c.after.catalog:c.before.catalog))}::jsonb))`;}
function checkSql(c,post=false,baseline=null){
 const changed=c.changed,newNames=c.created;
 return `with state as (${captureSql(c)}), now_functions as (select item.value v from state,jsonb_array_elements(state.value->'functions') item),
 now_catalog as (select item.value v from state,jsonb_array_elements(state.value->'catalog') item),
 ${expectedCtes(c,post)},
 function_differences as (select e.v expected,a.v actual from expected_functions e left join now_functions a on e.v->>'signature'=a.v->>'signature'
 where case when e.v->>'signature' in (${list(c.pinnedFunctionSecurity)}) then e.v is distinct from a.v
 else (e.v-array['acl','service_execute']) is distinct from (a.v-array['acl','service_execute']) end),
 catalog_differences as (select e.v expected,a.v actual from expected_catalog e left join now_catalog a on e.v->>'name'=a.v->>'name'
 where (e.v-array['acl','service_select']) is distinct from (a.v-array['acl','service_select'])),
 baseline as (select ${baseline||'null::jsonb'} value),
 preserved_function_differences as (select b.v expected,a.v actual from (select item.value v from baseline,jsonb_array_elements(baseline.value->'state'->'functions') item) b full join now_functions a on b.v->>'signature'=a.v->>'signature'
 where (select value is not null from baseline) and case
 when coalesce(a.v->>'name',b.v->>'name') in (${list(newNames)}) then b.v is not null or not exists(select 1 from expected_functions e where e.v is not distinct from a.v)
 when coalesce(a.v->>'name',b.v->>'name') in (${list(changed)}) then (a.v-'definition') is distinct from (b.v-'definition')
 else a.v is distinct from b.v end),
 preserved_catalog_differences as (select b.v expected,a.v actual from (select item.value v from baseline,jsonb_array_elements(baseline.value->'state'->'catalog') item) b full join now_catalog a on b.v->>'name'=a.v->>'name'
 where (select value is not null from baseline) and case when coalesce(a.v->>'name',b.v->>'name') in (${list(tables)}) then
 (a.v-array['columns','constraints','indexes','triggers']) is distinct from (b.v-array['columns','constraints','indexes','triggers']) else a.v is distinct from b.v end),
 checks as (select * from (values
 ('candidate_sha256_exact',encode(sha256(convert_to(${q(source())},'UTF8')),'hex')=${q(c.candidateSha)}),
 ('dependency_functions_exact',not exists(select 1 from function_differences)),
 ('dependency_catalog_exact',not exists(select 1 from catalog_differences)),
 ('target_state_exact',${post?`(select count(*)=${newNames.length} from now_functions where v->>'name' in (${list(newNames)}))`:`not exists(select 1 from now_functions where v->>'name' in (${list(newNames)})) and not exists(select 1 from information_schema.columns where table_schema='public' and table_name in (${list(tables.filter(t=>t!=='finance_direct_money_receipts'))}) and column_name in (${list(newColumns)}))`}),
 ('required_security',not exists(select 1 from now_catalog where v->>'name' in (${list(tables)}) and (v->'rls'<>'true' or v->'anon_select'<>'false' or v->'authenticated_write'<>'false'))),
 ('preserved_functions',not exists(select 1 from preserved_function_differences)),
 ('preserved_catalog_security',not exists(select 1 from preserved_catalog_differences)),
 ('historical_rows_unchanged',${post?`(select state.value->'rows'=baseline.value->'state'->'rows' from state,baseline)`:'true'}),
 ('default_privileges_unchanged',${post?`(select state.value->'defaults'=baseline.value->'state'->'defaults' from state,baseline)`:'true'}),
 ('approved_baseline_matches',${post?`(select value->>'candidate_sha256'=${q(c.candidateSha)} and value->>'state_sha256'=encode(sha256(convert_to((value->'state')::text,'UTF8')),'hex') and value->>'gate_pass'='true' from baseline)`:'true'})
 ) x(name,pass))
 select bool_and(coalesce(pass,false)) gate_pass,coalesce(jsonb_agg(name order by name) filter(where pass is distinct from true),'[]') failed_checks,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d) function_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) catalog_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from preserved_function_differences d) preserved_function_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from preserved_catalog_differences d) preserved_catalog_differences,
 ${post?`(select state.value->'rows'=baseline.value->'state'->'rows' from state,baseline)`:'null::boolean'} historical_rows_unchanged,
 ${q(c.candidateSha)} candidate_sha256,
 (select jsonb_build_object('candidate_sha256',${q(c.candidateSha)},'captured_at',statement_timestamp(),'gate_pass',(select bool_and(coalesce(pass,false)) from checks),
 'state_sha256',encode(sha256(convert_to(value::text,'UTF8')),'hex'),'state',value,'broader_baseline_evidence','Prior 490 unresolved differences are not accepted by this capture; only 066 dependencies are compared, all current unrelated definitions/security are frozen for before/after preservation.') from state) baseline
 from checks`;
}
function preflight(c){return '-- 066 SELECT-only preflight. No candidate execution or business-row writes.\n'+checkSql(c)+';\n';}
function verifier(c,baseline){return require('./direct-money-documents-verifier.cjs').verifier({functionsSql,catalogSql,rowsSql,source,tables,sha},c,baseline);}
function dryRun(c,baseline){return require('./direct-money-documents-dry-run.cjs').dryRun({functionsSql,catalogSql,rowsSql,source,tables},c,baseline);}
function validate(){const c=JSON.parse(fs.readFileSync(contractPath));assert.equal(sha(source()),c.candidateSha);assert.equal(source().split(generator.marker)[1],generator.generated());
 const security=require('./direct-money-documents-security.cjs');security.assertPinnedHelper(c.before.functions);security.assertPinnedHelper(c.after.functions);assert.deepEqual(c.pinnedFunctionSecurity,[security.signature]);
 const predecessor=fs.readdirSync('supabase/migrations').find(p=>p.startsWith('202607180065_'));
 assert.equal(sha(fs.readFileSync('supabase/migrations/'+predecessor,'utf8')),c.accepted065Sha,'Applied 065 hash changed');return c;}
function baselineFrom(path,c){const input=JSON.parse(fs.readFileSync(path));const r=Array.isArray(input)?input[0]:input,b=r.baseline||r;assert.equal(b.gate_pass,true);assert.equal(b.candidate_sha256,c.candidateSha);assert.ok(b.state&&/^[a-f0-9]{64}$/.test(b.state_sha256));return JSON.stringify(b);}
if(require.main===module){const c=validate(),mode=process.argv[2];if(mode==='--write'){fs.writeFileSync(files.preflight,preflight(c));fs.writeFileSync(files.dryRun,dryRun(c));fs.writeFileSync(files.verifier,verifier(c));}
else if(mode==='--write-dry-run'){assert.ok(process.argv[3],'Pass the approved Preflight JSON path');const b=baselineFrom(process.argv[3],c),compact=require('./direct-money-documents-dry-run.cjs');fs.writeFileSync(compact.manifestPath,JSON.stringify(compact.buildManifest({source,tables},c,b),null,2)+'\n');fs.writeFileSync(files.dryRun,dryRun(c,b));}
else if(mode==='--write-verifier'){assert.ok(process.argv[3],'Pass the approved Preflight JSON path');fs.writeFileSync(files.verifier,verifier(c,baselineFrom(process.argv[3],c)));}
else if(mode==='--preflight')process.stdout.write(preflight(c));else if(mode==='--dry-run'||mode==='--verify'){assert.ok(process.argv[3],'Pass the approved Preflight JSON path');const b=baselineFrom(process.argv[3],c);process.stdout.write(mode==='--dry-run'?dryRun(c,b):verifier(c,b));}
else {assert.equal(fs.readFileSync(files.preflight,'utf8'),preflight(c));assert.equal(fs.readFileSync(files.dryRun,'utf8'),dryRun(c));assert.equal(fs.readFileSync(files.verifier,'utf8'),verifier(c));console.log('066 candidate and gate artifacts PASS '+c.candidateSha);}}
module.exports={migrationPath,contractPath,files,tables,source,sha,functionsSql,catalogSql,rowsSql,captureSql,preflight,verifier,dryRun,checkSql,validate};
