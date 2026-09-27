/* eslint-disable @typescript-eslint/no-require-imports */
// Offline 076 artifact builder. Never connects to a database or reads credentials.
const fs=require('node:fs'); const path=require('node:path'); const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const approved=require('./fixtures/non-litigation-076-approved-contract.json');
const candidate=path.join(root,'supabase/migrations/202607180076_non_litigation_matter_control_core.sql');
const newTables=['advisory_matter_control','advisory_matter_team','advisory_matter_stages','advisory_stage_visits','advisory_work_state_events','advisory_matter_activities','advisory_deliverables','advisory_control_requests'];
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
// PostgreSQL jsonb canonical text: object keys ordered by UTF-8 byte length, then byte value.
function pgJson(x){if(Array.isArray(x))return '['+x.map(pgJson).join(', ')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort((a,b)=>Buffer.byteLength(a)-Buffer.byteLength(b)||Buffer.compare(Buffer.from(a),Buffer.from(b))).map(k=>JSON.stringify(k)+': '+pgJson(x[k])).join(', ')+'}';return JSON.stringify(x);}
function snapshotSql(post=false){
 const source=fs.readFileSync(path.join(root,'scripts/sql/preflight_non_litigation_matter_control_core.sql'),'utf8');
 let first=source.slice(source.indexOf('WITH RECURSIVE'),source.indexOf(',\nlegacy_names AS'));
 if(post)first=first.replace("SELECT 'advisory_issue_tasks',to_jsonb(t)","SELECT 'advisory_issue_tasks',to_jsonb(t)-'assignee_user_id'-'stage_id'").replace("SELECT 'advisory_time_logs',to_jsonb(t)","SELECT 'advisory_time_logs',to_jsonb(t)-'stage_id'");
 first=first.replaceAll('WHERE c.conrelid=t.oid)',"WHERE c.conrelid=t.oid AND c.contype<>'n')");
 // New trigger functions must not become historical baseline roots.
 first=first.replaceAll('NOT g.tgisinternal','NOT g.tgisinternal AND g.tgname NOT LIKE \'advisory076_%\'');
 const finance=source.slice(source.indexOf('finance_relations AS ('),source.indexOf(',\ntargets AS'));
 const tables=newTables.map(quote).join(',');
 return `${first},\n${finance},\nnormalized_catalog as (select name,${!post?'evidence':`evidence || jsonb_build_object(
 'columns',(select jsonb_agg(case when name='advisory_issue_tasks' and x->>'name'='advisory_issue_id' then jsonb_set(x,'{not_null}','true') else x end order by n) from jsonb_array_elements(evidence->'columns') with ordinality a(x,n) where not (name='advisory_issue_tasks' and x->>'name' in ('assignee_user_id','stage_id') or name='advisory_time_logs' and x->>'name'='stage_id')),
 'constraints',(select coalesce(jsonb_agg(x order by x->>'name'),'[]') from jsonb_array_elements(evidence->'constraints') x where x->>'name' not like 'advisory076_%'),
 'indexes',(select coalesce(jsonb_agg(x order by n),'[]') from jsonb_array_elements(evidence->'indexes') with ordinality a(x,n) where x#>>'{}' not like '%INDEX advisory076_%'),
 'incoming_foreign_keys',(select coalesce(jsonb_agg(x order by x->>'table',x->>'name'),'[]') from jsonb_array_elements(evidence->'incoming_foreign_keys') x where x->>'table' not in (${tables}) and x->>'name' not like 'advisory076_%'))`} evidence from catalog)
 SELECT jsonb_build_object('catalog',(select jsonb_object_agg(name,evidence) from normalized_catalog),
 'functions',(select jsonb_agg(evidence order by (evidence->>'signature') COLLATE "C") from functions),
 'rows',(select jsonb_object_agg(name,jsonb_build_object('count',row_count,'sha256',rows_sha256)) from fingerprints),
 'finance',(select coalesce(jsonb_object_agg(relname,evidence),'{}') from finance_refs))`;
}
function hashes(x){return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,hash(pgJson(v))]));}
// Byte ordering matches the explicit COLLATE "C" in every preservation snapshot.
function approvedState(){return {catalog:approved.catalog,functions:approved.functions.toSorted((a,b)=>Buffer.compare(Buffer.from(a.signature),Buffer.from(b.signature))),rows:approved.preservation_fingerprints,finance:approved.finance_matter_references};}
function prelude(expected){return `-- BEGIN GENERATED PRESERVATION PRELUDE
lock table public.advisory_matters,public.advisory_issues,public.advisory_issue_tasks,public.advisory_time_logs,public.advisory_advice_records,public.advisory_matter_counters,public.clients,public.user_profiles,public.case_audit_logs in share mode;
${Object.keys(approved.finance_matter_references).map(n=>'lock table public.'+n+' in share mode;').join('\n')}
create temporary table advisory076_before(state jsonb) on commit drop;
insert into advisory076_before ${snapshotSql()};
do $guard$ declare actual jsonb; expected jsonb:=${quote(JSON.stringify(hashes(expected)))}; k text; begin
 select state into actual from advisory076_before;
 for k in select jsonb_object_keys(expected) loop
  if encode(sha256(convert_to((actual->k)::text,'UTF8')),'hex') is distinct from expected->>k then raise exception 'ADVISORY076_BASELINE_MISMATCH: %',k; end if;
 end loop;
end; $guard$;
-- END GENERATED PRESERVATION PRELUDE`;}
function postlude(){return `-- BEGIN GENERATED PRESERVATION POSTLUDE
do $preserved$ declare actual jsonb; before_state jsonb; begin
 ${snapshotSql(true)} into actual;
 select state into before_state from advisory076_before;
 if actual<>before_state then raise exception 'ADVISORY076_PRESERVATION_FAILED: %', (select string_agg(k,', ') from jsonb_object_keys(actual) k where actual->k is distinct from before_state->k); end if;
end; $preserved$;
-- END GENERATED PRESERVATION POSTLUDE`;}
function migration(expected=approvedState()){
 let s=fs.readFileSync(candidate,'utf8');
 s=s.replace(/-- BEGIN GENERATED PRESERVATION PRELUDE[\s\S]*?-- END GENERATED PRESERVATION PRELUDE|-- PRESERVATION_PRELUDE[^\n]*/,()=>prelude(expected));
 s=s.replace(/-- BEGIN GENERATED PRESERVATION POSTLUDE[\s\S]*?-- END GENERATED PRESERVATION POSTLUDE|-- PRESERVATION_POSTLUDE/,()=>postlude());return s;
}
module.exports={root,approved,candidate,newTables,quote,hash,pgJson,snapshotSql,approvedState,migration};


function appliedSql(){
 const source=fs.readFileSync(path.join(root,'scripts/sql/preflight_non_litigation_matter_control_core.sql'),'utf8');
 let first=source.slice(source.indexOf('WITH RECURSIVE'),source.indexOf(',\nfunction_roots'));
 first=first.replace("('clients'), ('user_profiles'), ('case_audit_logs')", "('clients'), ('user_profiles'), ('case_audit_logs'),"+newTables.map(n=>'('+quote(n)+')').join(','));
 first=first.replaceAll('WHERE c.conrelid=t.oid)',"WHERE c.conrelid=t.oid AND c.contype<>'n')");
 return `${first}, new_functions as (select p.oid::regprocedure::text name,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'acl',p.proacl::text,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE')) evidence from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'advisory076_%' or p.proname in ('advisory_control_read','advisory_control_write','advisory_control_section')))
 select jsonb_build_object('tables',(select jsonb_object_agg(name,evidence) from catalog where name in (${newTables.map(quote)})),
 'functions',(select jsonb_object_agg(name,evidence) from new_functions),
 'deltas',(select jsonb_object_agg(name,jsonb_build_object(
 'columns',(select coalesce(jsonb_agg(x order by n),'[]') from jsonb_array_elements(evidence->'columns') with ordinality a(x,n) where name='advisory_issue_tasks' and x->>'name' in ('advisory_matter_id','advisory_issue_id','assignee_user_id','stage_id') or name='advisory_time_logs' and x->>'name'='stage_id'),
 'constraints',(select coalesce(jsonb_agg(x order by x->>'name'),'[]') from jsonb_array_elements(evidence->'constraints') x where x->>'name' like 'advisory076_%'),
 'indexes',(select coalesce(jsonb_agg(x order by n),'[]') from jsonb_array_elements(evidence->'indexes') with ordinality a(x,n) where x#>>'{}' like '%INDEX advisory076_%'),
 'triggers',(select coalesce(jsonb_agg(x order by x->>'definition'),'[]') from jsonb_array_elements(evidence->'triggers') x where x->>'definition' like '%TRIGGER advisory076_%'))) from catalog where name in ('advisory_matters','advisory_issue_tasks','advisory_time_logs','advisory_issues')))`;
}
function verifier(applied,baseline=approvedState(),candidateSha=hash(fs.readFileSync(candidate))){return `-- Phase 8C / 076 post-apply verifier. SELECT ONLY; no helper/numbering/write RPC.
-- Approved reviewed capture: ${approved.captured_at}. No identity or journey backfill.
-- Broader Finance differences are outside acceptance. No JSON/CSV transfer required.
WITH preserved AS (${snapshotSql(true)}),applied AS (${appliedSql()}),
actual as (select (select * from preserved) old,(select * from applied) added),
checks as (select jsonb_build_object(
 'historical_rows_unchanged',encode(sha256(convert_to((old->'rows')::text,'UTF8')),'hex')=${quote(hash(pgJson(baseline.rows)))},
 'finance_references_unchanged',encode(sha256(convert_to((old->'finance')::text,'UTF8')),'hex')=${quote(hash(pgJson(baseline.finance)))},
 'existing_catalog_security_preserved',encode(sha256(convert_to((old->'catalog')::text,'UTF8')),'hex')=${quote(hash(pgJson(baseline.catalog)))},
 'existing_functions_preserved',encode(sha256(convert_to((old->'functions')::text,'UTF8')),'hex')=${quote(hash(pgJson(baseline.functions)))},
 'applied_state_exact',encode(sha256(convert_to(added::text,'UTF8')),'hex')=${quote(hash(pgJson(applied)))},
 'no_invented_control_history',not exists(select 1 from public.advisory_matter_control) and not exists(select 1 from public.advisory_matter_team) and not exists(select 1 from public.advisory_matter_stages) and not exists(select 1 from public.advisory_stage_visits) and not exists(select 1 from public.advisory_matter_activities) and not exists(select 1 from public.advisory_work_state_events) and not exists(select 1 from public.advisory_deliverables) and not exists(select 1 from public.advisory_control_requests),
 'no_identity_or_time_backfill',not exists(select 1 from public.advisory_issue_tasks where assignee_user_id is not null or stage_id is not null) and not exists(select 1 from public.advisory_time_logs where stage_id is not null),
 'unrestricted_owner_snapshot',current_user='postgres' and not current_setting('row_security')='off'
 ) result from actual), failures as (select coalesce(jsonb_agg(key order by key),'[]') failed from checks,jsonb_each(result) where value is distinct from 'true'::jsonb)
select jsonb_build_object('gate_pass',jsonb_array_length(failed)=0,'failed_checks',failed,
 'candidate_sha256',${quote(candidateSha)},'approved_historical_rows_sha256',${quote(approved.historical_rows_sha256)},'checks',result,
 'historical_rows_unchanged',result->'historical_rows_unchanged','applied_state_exact',result->'applied_state_exact') phase8c_076_verification from checks,failures;
`;}
module.exports.appliedSql=appliedSql;module.exports.verifier=verifier;

if(require.main===module){if(process.argv[2]==='--generate-candidate-guards'){fs.writeFileSync(candidate,migration());console.log('Offline 076 preservation guards refreshed. No database connection.');}else if(process.argv[2]==='--check'){if(fs.readFileSync(candidate,'utf8')!==migration())throw Error('076 guard artifacts stale');console.log('076 guards exact; candidate SHA-256 '+hash(fs.readFileSync(candidate)));}else if(process.argv[2]==='--generate-verifier'){const artifact=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/non-litigation-076-applied-contract.json'),'utf8'));if(artifact.candidate_sha256!==hash(fs.readFileSync(candidate)))throw Error('Applied artifact candidate hash stale');fs.writeFileSync(path.join(root,'scripts/sql/verify_non_litigation_matter_control_076.sql'),verifier(artifact.contract));console.log('076 SELECT-only verifier generated offline.');}else throw Error('Expected --check or --generate-candidate-guards');}
