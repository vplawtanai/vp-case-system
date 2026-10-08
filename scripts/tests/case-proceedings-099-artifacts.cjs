/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),path=require('node:path');
const B=require('./case-core-098-artifacts.cjs');
const {read,q,j,hash,pins,pgJson,root}=B;
const candidate='supabase/migrations/202610080099_case_hearing_proceedings.sql';
const afterPath='scripts/tests/fixtures/case-proceedings-099-after.json';
const reviewedPath='scripts/tests/fixtures/case-proceedings-099-reviewed.json';
const accepted=JSON.parse(read(B.afterPath));
const acceptedContractSha=hash(pgJson(pins(accepted)));
const tables=[...B.names,...B.newTables,'case_proceedings'];
const digest=s=>`encode(sha256(convert_to((${s})::text,'UTF8')),'hex')`;
const people=`(SELECT count(*)=9 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND column_name IN ('id','staff_name','full_name','account_type','assignable','role','active','must_change_password','financial_access'))
 AND (SELECT count(*)=4 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND ((column_name='id' AND data_type='uuid') OR (column_name IN ('active','assignable','must_change_password') AND data_type='boolean')))
 AND EXISTS(SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname='id' WHERE i.indrelid='public.user_profiles'::regclass AND i.indisunique AND i.indisvalid AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum AND i.indpred IS NULL)`;
const absent=`to_regclass('public.case_proceedings') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'case099_%')`;
function footprint(){return B.footprint().replace("]) AND c.relkind='r'",",'case_proceedings']) AND c.relkind='r'").replace("p.proname LIKE 'case098_%'","p.proname LIKE 'case098_%' OR p.proname LIKE 'case099_%'");}
function fingerprint(post=false){return `WITH raw AS (${post?footprint():B.footprint()}) SELECT jsonb_build_object(${['tables','functions'].map(k=>q(k)+`,(SELECT coalesce(jsonb_object_agg(key,${digest('value')}),'{}') FROM jsonb_each(c->${q(k)}))`).join(',')}) FROM raw r(c)`;}
function migration(){return `-- 099 Phase 2B: Human Apply only. Additive DDL; no legacy DML/backfill.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
LOCK TABLE ${[...B.names,...B.newTables].map(n=>'public.'+n).join(',')} IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ DECLARE actual jsonb; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'CASE099_OWNER_REQUIRED'; END IF;
 ${fingerprint()} INTO actual;
 IF actual IS DISTINCT FROM ${j(pins(accepted))} THEN RAISE EXCEPTION 'CASE099_CONTRACT_DRIFT'; END IF;
 IF NOT (${absent}) THEN RAISE EXCEPTION 'CASE099_ALREADY_EXISTS'; END IF;
 IF NOT (${people}) THEN RAISE EXCEPTION 'CASE099_PEOPLE_CONTRACT_MISSING'; END IF;
END $guard$;
${read('scripts/sql/case_proceedings_099_contract.sql')}
NOTIFY pgrst,'reload schema';
COMMIT;
`;}
function gate(post=false){const expected=pins(post?JSON.parse(read(afterPath)):accepted);const reviewed=JSON.parse(read(reviewedPath));
 return `-- SELECT ONLY. Scoped schema/security evidence. Normal Case activity is not drift.
-- Local artifact checks attest candidate hash and absence of business DML during Apply.
WITH installed AS (${fingerprint(post)}),evidence AS (SELECT catalog,${j(expected)} expected,jsonb_build_object(
 'contract_exact',catalog=${j(expected)},'people_contract',${people},
 'candidate_apply_has_no_legacy_dml',${B.additiveApplySql(read(candidate))},
 ${post?`'reviewed_contract_bound',${j(reviewed)}->>'candidate_sha256'=${q(hash(read(candidate)))} AND ${j(reviewed)}->>'accepted_contract_sha256'=${q(acceptedContractSha)}`:`'099_absent',${absent}`}
 ) checks FROM installed c(catalog))
SELECT jsonb_build_object('gate_pass',NOT EXISTS(SELECT 1 FROM jsonb_each(checks) x WHERE x.value IS DISTINCT FROM 'true'::jsonb),
 'failed_checks',(SELECT coalesce(jsonb_agg(key ORDER BY key),'[]') FROM jsonb_each(checks) x WHERE x.value IS DISTINCT FROM 'true'::jsonb),
 'candidate_sha256',${q(hash(read(candidate)))},'accepted_098_sha256',${q(hash(read(B.candidate)))},'accepted_contract_sha256',${q(acceptedContractSha)},'contract_sha256',${digest('catalog')},'checks',checks,
 'object_differences',(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'name',name) ORDER BY kind,name),'[]') FROM
 (SELECT kind,name FROM (SELECT 'tables' kind,jsonb_object_keys((catalog->'tables')||(expected->'tables')) name UNION ALL SELECT 'functions',jsonb_object_keys((catalog->'functions')||(expected->'functions'))) k WHERE catalog#>ARRAY[kind,name] IS DISTINCT FROM expected#>ARRAY[kind,name]) d),
 'business_rows_are_not_gate_inputs',true,'production_mutation',false,'business_rpc_executed',false,'auth_tables_read',false) AS case_proceedings_099 FROM evidence;
`;}
function generate(){fs.writeFileSync(path.join(root,candidate),migration());fs.writeFileSync(path.join(root,'scripts/sql/preflight_case_proceedings_099.sql'),gate());if(fs.existsSync(path.join(root,afterPath)))fs.writeFileSync(path.join(root,'scripts/sql/verify_case_proceedings_099.sql'),gate(true));}
module.exports={...B,candidate,afterPath,reviewedPath,accepted,acceptedContractSha,tables,footprint,fingerprint,migration,gate,generate};
if(require.main===module)generate();
