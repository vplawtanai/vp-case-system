/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs');const path=require('node:path');
const A=require('./case-security-097-artifacts.cjs');
const {read,q,j,hash,pins}=A;
const candidate='supabase/migrations/202610080098_case_accountability_next_action.sql';
const accepted=JSON.parse(read('scripts/tests/fixtures/case-security-097-after.json'));
const newTables=['case_work_core','case_team_assignments'];
const afterPath='scripts/tests/fixtures/case-core-098-after.json';
const reviewedPath='scripts/tests/fixtures/case-core-098-reviewed.json';
const digest=s=>`encode(sha256(convert_to((${s})::text,'UTF8')),'hex')`;
const existing=A.fingerprint();
function footprint(){return A.footprint().replace(A.names.map(q).join(','),[...A.names,...newTables].map(q).join(',')).replace("p.proname LIKE 'case097_%'","p.proname LIKE 'case097_%' OR p.proname LIKE 'case098_%'");}
function fingerprint(){return `WITH raw AS (${footprint()}) SELECT jsonb_build_object(${['tables','functions'].map(k=>q(k)+`,(SELECT coalesce(jsonb_object_agg(key,${digest('value')}),'{}') FROM jsonb_each(c->${q(k)}))`).join(',')}) FROM raw r(c)`;}
function absence(){return `to_regclass('public.case_work_core') IS NULL AND to_regclass('public.case_team_assignments') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'case098_%')`;}
const profile=`(SELECT count(*)=5 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND column_name IN ('id','staff_name','full_name','account_type','assignable'))`;
function migration(){return `-- 098 Phase 2A: Human Apply after reviewed SELECT-only preflight. No backfill.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
LOCK TABLE ${A.names.map(n=>'public.'+n).join(',')} IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ DECLARE actual jsonb; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'CASE098_OWNER_REQUIRED'; END IF;
 ${existing} INTO actual;
 IF actual IS DISTINCT FROM ${j(pins(accepted))} THEN RAISE EXCEPTION 'CASE098_CONTRACT_DRIFT'; END IF;
 IF NOT (${absence()}) THEN RAISE EXCEPTION 'CASE098_ALREADY_EXISTS'; END IF;
 IF NOT ${profile} THEN RAISE EXCEPTION 'CASE098_PEOPLE_CONTRACT_MISSING'; END IF;
END $guard$;
CREATE TEMP TABLE case098_before_rows ON COMMIT DROP AS ${A.rows()};
${read('scripts/sql/case_core_098_contract.sql')}
DO $preserve$ DECLARE old_rows jsonb; new_rows jsonb; BEGIN
 SELECT * INTO old_rows FROM case098_before_rows;
 ${A.rows()} INTO new_rows;
 IF old_rows IS DISTINCT FROM new_rows THEN RAISE EXCEPTION 'CASE098_HISTORY_CHANGED'; END IF;
END $preserve$;
NOTIFY pgrst,'reload schema';
COMMIT;
`;}
const approvedCandidateSha='c9cf604b4e92eeb2dde685a00816cfc5770e7d02ba45a58ff76b744fee81570c';
const acceptedContractSha=hash(A.pgJson(pins(accepted)));
// Function bodies are installed, not executed during Apply. Their audit writes are
// intentional authenticated business RPC behavior; Apply itself has no legacy DML.
function additiveApplySql(sql=read(candidate)) {
 const apply=sql.replace(/CREATE FUNCTION[\s\S]*?\$fn\$;/g,'').replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''");
 return !/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE)\b/i.test(apply);
}
const peopleReferences=`(SELECT count(*)=9 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND column_name IN ('id','staff_name','full_name','account_type','assignable','role','active','must_change_password','financial_access'))
 AND (SELECT count(*)=4 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND ((column_name='id' AND data_type='uuid') OR (column_name IN ('active','assignable','must_change_password') AND data_type='boolean')))
 AND EXISTS(SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname='id' WHERE i.indrelid='public.user_profiles'::regclass AND i.indisunique AND i.indisvalid AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum AND i.indpred IS NULL)`;
function gate(post=false){const reviewed=JSON.parse(read(reviewedPath));const expected=pins(post?JSON.parse(read(afterPath)):accepted);
return `-- SELECT ONLY: exact scoped schema/security contract. Normal business activity is not drift.
-- Candidate SHA and additive-Apply attestation are verified locally by artifact tests.
WITH installed AS (${post?fingerprint():existing}), evidence AS (SELECT catalog,jsonb_build_object(
 'candidate_sha_verified',${hash(read(candidate))===approvedCandidateSha},'candidate_apply_has_no_legacy_dml',${additiveApplySql()},
 'contract_exact',catalog=${j(expected)},'people_references',${peopleReferences},
 ${post?`'reviewed_contract_bound',${j(reviewed)}->>'candidate_sha256'=${q(approvedCandidateSha)} AND ${j(reviewed)}->>'accepted_contract_sha256'=${q(acceptedContractSha)}`:`'098_absent',${absence()}`}
 ) checks FROM installed c(catalog))
SELECT jsonb_build_object('gate_pass',NOT EXISTS(SELECT 1 FROM jsonb_each(checks) x WHERE x.value IS DISTINCT FROM 'true'::jsonb),
 'failed_checks',(SELECT coalesce(jsonb_agg(key),'[]') FROM jsonb_each(checks) x WHERE x.value IS DISTINCT FROM 'true'::jsonb),
 'candidate_sha256',${q(hash(read(candidate)))},'accepted_097_sha256',${q(hash(read(A.candidate)))},'accepted_contract_sha256',${q(acceptedContractSha)},'checks',checks,
 'contract_sha256',${digest('catalog')},'business_rows_are_not_gate_inputs',true,
 'object_differences',(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'name',name)),'[]') FROM
 (SELECT kind,name FROM (SELECT 'tables' kind,jsonb_object_keys((catalog->'tables')||(${j(expected)}->'tables')) name UNION ALL SELECT 'functions',jsonb_object_keys((catalog->'functions')||(${j(expected)}->'functions'))) k WHERE catalog#>ARRAY[kind,name] IS DISTINCT FROM ${j(expected)}#>ARRAY[kind,name]) d),
 'production_mutation',false,'business_rpc_executed',false,'auth_tables_read',false) AS case_core_098 FROM evidence;
`;}
function generate(){if(hash(read(candidate))!==approvedCandidateSha)throw new Error('CASE098_CANDIDATE_CHANGED');fs.writeFileSync(path.join(A.root,'scripts/sql/preflight_case_core_098.sql'),gate());if(fs.existsSync(path.join(A.root,afterPath)))fs.writeFileSync(path.join(A.root,'scripts/sql/verify_case_core_098.sql'),gate(true));}
module.exports={...A,candidate,accepted,newTables,afterPath,reviewedPath,footprint,fingerprint,migration,gate,generate,approvedCandidateSha,acceptedContractSha,additiveApplySql};
if(require.main===module)generate();
