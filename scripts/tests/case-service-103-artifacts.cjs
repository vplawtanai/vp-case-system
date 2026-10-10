/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),path=require('node:path'),B=require('./case-service-102-artifacts.cjs');
const {read,q,j,hash,pins,pgJson,root}=B;
const candidate='supabase/migrations/202610100103_case_service_result_facts.sql';
const afterPath='scripts/tests/fixtures/case-service-103-after.json',reviewedPath='scripts/tests/fixtures/case-service-103-reviewed.json';
const accepted=JSON.parse(read(B.afterPath)),acceptedContractSha=hash(pgJson(pins(accepted)));
const digest=s=>`encode(sha256(convert_to((${s})::text,'UTF8')),'hex')`;
const footprint=B.footprint;
function fingerprint(){return `WITH raw AS (${footprint()}) SELECT jsonb_build_object(${['tables','functions'].map(k=>q(k)+`,(SELECT coalesce(jsonb_object_agg(key,${digest('value')}),'{}') FROM jsonb_each(c->${q(k)}))`).join(',')}) FROM raw r(c)`;}
function additiveApplySql(sql){return B.additiveApplySql(sql.replaceAll('CREATE OR REPLACE FUNCTION','CREATE FUNCTION'));}
function migration(){return `-- 103 Human Apply only. Result-dependent service facts; no backfill or business DML.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
LOCK TABLE public.case_service_attempts,public.case_service_controls IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ DECLARE actual jsonb; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'CASE103_OWNER_REQUIRED'; END IF;
 ${fingerprint()} INTO actual;
 IF actual IS DISTINCT FROM ${j(pins(accepted))} THEN RAISE EXCEPTION 'CASE103_CONTRACT_DRIFT'; END IF;
END $guard$;
${read('scripts/sql/case_service_103_contract.sql')}
NOTIFY pgrst,'reload schema';
COMMIT;
`;}
function gate(post=false){const expected=pins(post?JSON.parse(read(afterPath)):accepted),reviewed=JSON.parse(read(reviewedPath));
return `-- SELECT ONLY. Schema/security scoped to existing 102 dependencies and the two changed objects.
-- Ordinary Case/Party/Timeline/Audit activity is not an Apply blocker; no business RPC executed.
WITH installed AS (${fingerprint()}), evidence AS (SELECT catalog,${j(expected)} expected,jsonb_build_object(
 'contract_exact',catalog=${j(expected)},
 'candidate_apply_has_no_legacy_dml',${additiveApplySql(read(candidate))},
 'existing_attempts_compatible',NOT EXISTS(SELECT 1 FROM public.case_service_attempts WHERE result IN('served','pending') AND (method IS NULL OR attempted_on IS NULL))
 ${post?`,'reviewed_contract_bound',${j(reviewed)}->>'candidate_sha256'=${q(hash(read(candidate)))} AND ${j(reviewed)}->>'accepted_contract_sha256'=${q(acceptedContractSha)}`:''}
 ) checks FROM installed c(catalog))
SELECT jsonb_build_object('gate_pass',NOT EXISTS(SELECT 1 FROM jsonb_each(checks) x WHERE x.value IS DISTINCT FROM 'true'::jsonb),
 'failed_checks',(SELECT coalesce(jsonb_agg(key ORDER BY key),'[]') FROM jsonb_each(checks) x WHERE x.value IS DISTINCT FROM 'true'::jsonb),
 'candidate_sha256',${q(hash(read(candidate)))},'accepted_102_sha256',${q(hash(read(B.candidate)))},'accepted_contract_sha256',${q(acceptedContractSha)},'contract_sha256',${digest('catalog')},'checks',checks,
 'object_differences',(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'name',name) ORDER BY kind,name),'[]') FROM
 (SELECT kind,name FROM (SELECT 'tables' kind,jsonb_object_keys((catalog->'tables')||(expected->'tables')) name UNION ALL SELECT 'functions',jsonb_object_keys((catalog->'functions')||(expected->'functions'))) k WHERE catalog#>ARRAY[kind,name] IS DISTINCT FROM expected#>ARRAY[kind,name]) d),
 'business_rows_are_not_gate_inputs',true,'production_mutation',false,'business_rpc_executed',false,'auth_tables_read',false) AS case_service_103 FROM evidence;
`.replace(/[ \t]+$/gm,'');}
function generate(){fs.writeFileSync(path.join(root,candidate),migration());fs.writeFileSync(path.join(root,'scripts/sql/preflight_case_service_103.sql'),gate());if(fs.existsSync(path.join(root,afterPath)))fs.writeFileSync(path.join(root,'scripts/sql/verify_case_service_103.sql'),gate(true));}
module.exports={...B,candidate,afterPath,reviewedPath,accepted,acceptedContractSha,footprint,fingerprint,migration,gate,generate,additiveApplySql};
if(require.main===module)generate();
