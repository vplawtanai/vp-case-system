/* eslint-disable @typescript-eslint/no-require-imports */
// Offline SQL generator. Never connects to a database or executes the rehearsal.
const fs=require('node:fs'),assert=require('node:assert/strict');
const a=require('./tax-065-gate.cjs'),{contractFacts,functionCtes}=require('./vp-distribution-artifacts.cjs');
const artifactPath='scripts/sql/dry_run_authoritative_input_vat_065.sql';
const hashToken='__APPROVED_BASELINE_SHA256__',timeToken='__APPROVED_CAPTURED_AT__';
const q=s=>"'"+s.replaceAll("'","''")+"'",list=xs=>xs.map(q).join(',');
const allFunctionsSql=`select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
 'acl',p.proacl::text,'security_definer',p.prosecdef,'config',p.proconfig,'definition',pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text),'[]')
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'`;
// Freeze current catalog for before/after preservation, NOT historical acceptance
// of the broader 490 differences. No old whole-database expected catalog is used.
const catalogSql=`select jsonb_build_object(
 'relations',(select jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity) order by c.relname) from pg_class c where c.relnamespace='public'::regnamespace),
 'columns',(select jsonb_agg(jsonb_build_object('table',c.relname,'column',to_jsonb(a),'default',pg_get_expr(d.adbin,d.adrelid)) order by c.relname,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and a.attnum>0),
 'constraints',(select jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid),'validated',convalidated) order by conrelid::regclass::text,conname) from pg_constraint where connamespace='public'::regnamespace),
 'indexes',(select jsonb_agg(to_jsonb(i) order by tablename,indexname) from pg_indexes i where schemaname='public'),
 'policies',(select jsonb_agg(to_jsonb(p) order by tablename,policyname) from pg_policies p where schemaname='public'),
 'triggers',(select jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) order by c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace),
 'defaults',(select jsonb_agg(to_jsonb(d) order by oid) from pg_default_acl d)
)`;
function verifierSql(){
 const f=contractFacts(a.source()),changed=f.filter(x=>!['tax_expense_input_vat_status','tax_input_vat_evidence'].includes(x.name)).map(x=>x.signature.replace(/^public\./,''));
 const created=f.filter(x=>['tax_expense_input_vat_status','tax_input_vat_evidence'].includes(x.name)).map(x=>x.signature.replace(/^public\./,''));
 return `with ${functionCtes(f)}, actual_functions as (${allFunctionsSql}),
 before_functions as (select value v from jsonb_array_elements($2::jsonb)),
 current_functions as (select value v from actual_functions a,jsonb_array_elements(a.coalesce)),
 preserved_function_differences as (
 select b.v expected,c.v actual from before_functions b full join current_functions c on b.v->>'signature'=c.v->>'signature'
 where case when coalesce(c.v->>'signature',b.v->>'signature') in (${list(created)}) then b.v is not null
 when coalesce(c.v->>'signature',b.v->>'signature') in (${list(changed)}) then (b.v-'definition') is distinct from (c.v-'definition')
 else b.v is distinct from c.v end
 ),
 catalog_now as (${catalogSql}), history_now as (${a.rowSql}),
 facts as (select public.tax_filing_monthly_facts(date '2026-09-01') monthly,
 public.tax_filing_pool(date '2026-09-01','wht_natural') wht_natural,
 public.tax_filing_pool(date '2026-09-01','wht_juristic') wht_juristic),
 checks(name,passed) as (values
 ('exact_065_function_definitions',not exists(select 1 from function_differences)),
 ('only_intended_function_delta',not exists(select 1 from preserved_function_differences)
  and (select count(*)=2 from current_functions where v->>'signature' in (${list(created)}))
  and (select count(*)=(select count(*)+2 from before_functions) from current_functions)),
 ('new_helpers_explicit_security',(select count(*)=2 and bool_and(v->>'owner'='postgres' and v->'security_definer'='true'::jsonb
  and v->'config'='["search_path=public"]'::jsonb and v->>'acl'='{postgres=X/postgres,service_role=X/postgres}'
  and has_function_privilege('service_role',v->>'signature','EXECUTE')
  and not has_function_privilege('anon',v->>'signature','EXECUTE') and not has_function_privilege('authenticated',v->>'signature','EXECUTE')) from current_functions where v->>'signature' in (${list(created)}))),
 ('catalog_owner_acl_rls_triggers_preserved',(select jsonb_build_object from catalog_now)=$3::jsonb),
 ('historical_rows_unchanged',(select hashes from history_now)=$1::jsonb->'historical_hashes'),
 ('output_vat_preserved',(select monthly->'output_vat' from facts)=$1::jsonb#>'{september_facts,output_vat}'),
 ('source_vat_19_63_net_680_37',(select (monthly->>'input_vat')::numeric=19.63 and (monthly->>'reviewed_input_vat')::numeric=19.63
  and (monthly->>'net_vat')::numeric=680.37 and monthly->'input_vat_complete'='true'::jsonb
  and monthly->'unresolved_input_sources'='[]'::jsonb and jsonb_array_length(monthly->'input_sources')=1
  and monthly#>>'{input_sources,0,source_type}'='expense' and monthly#>>'{input_sources,0,source_id}'=${q(a.bigC)} from facts)),
 ('no_vat_claims_have_no_input_fact',(select bool_and(public.tax_position_source('expense',id::uuid)->'lines'='[]'::jsonb) from unnest(array[${list(a.claims)}]) id)),
 ('uat_external_absent',not exists(select 1 from public.finance_external_input_vat where invoice_number='5647891231236' or vendor='บริษัท UAT ผู้ขาย จำกัด')),
 ('wht_unchanged',(select wht_natural from facts)=$1::jsonb->'wht_natural' and (select wht_juristic from facts)=$1::jsonb->'wht_juristic')
 ) select jsonb_build_object('gate_pass',(select bool_and(passed is true) from checks),
 'failed_checks',(select coalesce(jsonb_agg(name) filter(where passed is distinct from true),'[]') from checks),
 'checks',(select jsonb_object_agg(name,passed) from checks),
 'function_differences',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d)||
  (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from preserved_function_differences d),
 'catalog_differences',case when (select jsonb_build_object from catalog_now)=$3::jsonb then '[]'::jsonb else '["catalog_changed"]'::jsonb end,
 'historical_rows_unchanged',(select hashes from history_now)=$1::jsonb->'historical_hashes',
 'september_facts',(select monthly from facts),'broader_unresolved_differences',490)`;
}
function generate({baselineSha=hashToken,capturedAt=timeToken,preflightSql=a.preflight()}={}){
 a.validateCandidate();
 if(baselineSha!==hashToken)assert.match(baselineSha,/^[0-9a-f]{64}$/);
 if(capturedAt!==timeToken)assert.match(capturedAt,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/,'Use the exact baseline.captured_at JSON string; do not reformat it');
 const pre=`select to_jsonb(p) from (${preflightSql.trim().replace(/;$/,'')}) p`;
 return `-- 065 MANUAL ROLLBACK-ONLY REHEARSAL. Execute the ENTIRE batch.
-- Exported offline; this tool never connects to Production.
-- Original approved SHA: ${baselineSha}
-- Original captured_at: ${capturedAt}
-- Rebuilds the full baseline using its original timestamp and requires its EXACT SHA.
-- A mismatch stops BEFORE candidate DDL; no fresh baseline is silently substituted.
-- Current public security/catalog is frozen only to prove preservation. The broader
-- 490 unresolved differences are NOT accepted or altered by this rehearsal.
-- Brief application locks: choose a quiet window. Lock timeout fails safely.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
SET LOCAL idle_in_transaction_session_timeout='90s';
SET LOCAL search_path=public;
SET LOCAL row_security=off;
CREATE TEMP TABLE tax065_rehearsal_result(report jsonb) ON COMMIT DROP;
DO $tax065_rehearsal$
DECLARE
 approved_sha constant text:=${q(baselineSha)};
 original_captured_at constant text:=${q(capturedAt)};
 pre_sql constant text:=${q(pre)};
 candidate_sql constant text:=${q(a.source())};
 verification_sql constant text:=${q(verifierSql())};
 before_result jsonb; baseline jsonb; before_functions jsonb; before_catalog jsonb;
 restored_result jsonb; restored_baseline jsonb; after_report jsonb;
 verified boolean:=false; v_lock_table record; v_filing record;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION '065_REQUIRES_FINANCE_OWNER'; END IF;
 IF approved_sha !~ '^[0-9a-f]{64}$' OR left(original_captured_at,2)='__' THEN RAISE EXCEPTION '065_APPROVED_BASELINE_PARAMETERS_REQUIRED'; END IF;
 IF encode(sha256(convert_to(candidate_sql,'UTF8')),'hex')<>${q(a.candidateSha)} THEN RAISE EXCEPTION '065_CANDIDATE_HASH_MISMATCH'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('payout_lifecycle',0));
 PERFORM pg_advisory_xact_lock(500050); PERFORM pg_advisory_xact_lock(500052);
 FOR v_lock_table IN SELECT unnest(array[${list(a.rowTables)}]) name ORDER BY 1 LOOP
  EXECUTE format('LOCK TABLE public.%I IN SHARE MODE',v_lock_table.name);
 END LOOP;
 EXECUTE pre_sql INTO before_result;
 IF before_result->'gate_pass' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION '065_PREFLIGHT_FAILED: %',before_result->'failed_checks'; END IF;
 baseline:=jsonb_set(before_result->'baseline','{captured_at}',to_jsonb(original_captured_at));
 IF encode(sha256(convert_to(baseline::text,'UTF8')),'hex')<>approved_sha THEN RAISE EXCEPTION '065_APPROVED_BASELINE_MISMATCH; stop, do not recapture/replace approval'; END IF;
 SELECT (${allFunctionsSql}) INTO before_functions;
 SELECT (${catalogSql}) INTO before_catalog;
 -- PostgreSQL exception subtransaction provides a mandatory rollback of every
 -- candidate DDL statement. Local report variables survive the intentional rollback.
 BEGIN
  EXECUTE candidate_sql;
  EXECUTE verification_sql INTO after_report USING baseline,before_functions,before_catalog;
  IF after_report->'gate_pass' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION '065_REHEARSAL_FAILED: %',after_report; END IF;
  FOR v_filing IN SELECT id FROM public.finance_tax_filings ORDER BY id LOOP
   PERFORM public.tax_filing_assert(v_filing.id);
  END LOOP;
  verified:=true;
  RAISE EXCEPTION USING ERRCODE='P0065', MESSAGE='065_INTENTIONAL_CANDIDATE_ROLLBACK';
 EXCEPTION WHEN SQLSTATE 'P0065' THEN
  IF NOT verified THEN RAISE; END IF;
 END;
 -- This executes after candidate DDL has already been undone.
 EXECUTE pre_sql INTO restored_result;
 restored_baseline:=jsonb_set(restored_result->'baseline','{captured_at}',to_jsonb(original_captured_at));
 IF restored_result->'gate_pass' IS DISTINCT FROM 'true'::jsonb OR restored_baseline IS DISTINCT FROM baseline
  OR encode(sha256(convert_to(restored_baseline::text,'UTF8')),'hex')<>approved_sha
  OR (${allFunctionsSql}) IS DISTINCT FROM before_functions
  OR (${catalogSql}) IS DISTINCT FROM before_catalog
 THEN RAISE EXCEPTION '065_ROLLBACK_RESTORATION_FAILED'; END IF;
 INSERT INTO tax065_rehearsal_result VALUES(after_report||jsonb_build_object(
  'migration_sha256',${q(a.candidateSha)},'approved_baseline_sha256',approved_sha,
  'approved_captured_at',original_captured_at,'exact_approved_baseline_matched',true,
  'existing_filing_integrity_passed',true,'rollback_verified',true,
  'candidate_present_after_rollback',false,'production_business_rows_changed',false));
END;
$tax065_rehearsal$;
-- Candidate has ALREADY been rolled back and its original contract reverified.
SELECT report AS rollback_only_dry_run FROM tax065_rehearsal_result;
ROLLBACK;
-- No commit or persistent gate objects. On error, issue ROLLBACK if the editor
-- leaves an aborted transaction open. Never run only a selected fragment.
`;
}
function validateTemplate(){a.validateCandidate();assert.equal(fs.readFileSync(artifactPath,'utf8'),generate(),'Stale 065 rollback-only artifact; STOP');}
module.exports={artifactPath,generate,validateTemplate,verifierSql,allFunctionsSql,catalogSql,hashToken,timeToken};
if(require.main===module){assert.deepEqual(process.argv.slice(2),['--write']);fs.writeFileSync(artifactPath,generate());console.log('065 rollback-only template generated locally; no database connection.');}
