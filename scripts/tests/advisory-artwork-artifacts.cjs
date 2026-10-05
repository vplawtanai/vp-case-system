/* eslint-disable @typescript-eslint/no-require-imports */
// 094 offline artifacts. Accepted 083/084 foundation, never a synthetic replacement.
const fs=require('node:fs'),assert=require('node:assert/strict'),base=require('./visual-assets-artifacts.cjs'),general=require('./visual-assets-general-artifacts.cjs');
const {root,q,hash,digest}=base,config=require('../../lib/advisory-journey-artwork-config.json');
const candidate=root+'/supabase/migrations/202610050094_advisory_journey_artwork_access.sql';
const preflight=root+'/scripts/sql/preflight_advisory_journey_artwork_094.sql',verifier=root+'/scripts/sql/verify_advisory_journey_artwork_094.sql';
const applyDiagnostic=root+'/scripts/sql/diagnose_advisory_journey_artwork_apply_094.sql';
const contractPath=__dirname+'/fixtures/advisory-artwork-094-contract.json',pinsPath=__dirname+'/fixtures/advisory-artwork-094-reviewed-baseline.json';
const keys=Object.keys(config.assets),accepted084='50cf5e40963a92d2a28772602852145b1bb183dc8b2958f24c6a34f0a16a9536';
function foundation(){assert.equal(hash(fs.readFileSync(general.candidate)),accepted084);return general.expectedContract(true);}
const validAsset=`a.asset_type IN ('journey','background','illustration') AND a.scope IN ('both','non_litigation') AND a.status='active' AND NOT a.delete_pending
 AND a.master_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/master\\.webp$'
 AND split_part(a.master_path,'/',2)=a.id::text AND split_part(a.master_path,'/',1)=a.created_by::text
 AND a.width BETWEEN 1 AND 2560 AND a.height BETWEEN 1 AND 2560
 AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='vp-visual-assets' AND o.name=a.master_path)
 AND EXISTS(SELECT 1 FROM storage.buckets b WHERE b.id='vp-visual-assets' AND b.public IS FALSE)`;
const effective=`NOT has_table_privilege('service_role','public.visual_assets','SELECT') AND NOT has_any_column_privilege('service_role','public.visual_assets','SELECT')
 AND NOT has_table_privilege('service_role','public.visual_asset_mappings','SELECT')
 AND NOT has_any_column_privilege('service_role','public.visual_asset_mappings','SELECT')
 AND NOT has_table_privilege('anon','public.visual_assets','SELECT')
 AND NOT has_any_column_privilege('anon','public.visual_assets','SELECT')
 AND NOT has_any_column_privilege('anon','public.visual_asset_mappings','SELECT')
 AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid IN ('public.visual_assets'::regclass,'public.visual_asset_mappings'::regclass) AND attnum>0 AND NOT attisdropped AND attacl IS NOT NULL)
 AND EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.people_is_active_admin()') AND prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=public']::text[] AND pg_get_userbyid(proowner)='postgres' AND regexp_replace(prosrc,'\\s','','g')='selectexists(select1frompublic.user_profileswhereid=auth.uid()andactiveistrueandrole=''admin'');') AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('authenticated','anon') AND (rolsuper OR rolbypassrls))`;
function rpcEvidence(){return `SELECT coalesce(jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'config',p.proconfig,
 'acl',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) ORDER BY x.grantee::regrole::text COLLATE "C",x.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x))),'{}') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='journey_artwork094_read'`;}
function preservation(){return `SELECT jsonb_build_object(
 'functions',(SELECT jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner),p.proacl::text) ORDER BY p.oid::regprocedure::text COLLATE "C") FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','storage') AND p.prokind='f' AND p.proname<>'journey_artwork094_read'),
 'tables',(SELECT jsonb_agg(jsonb_build_array(c.relname,pg_get_userbyid(c.relowner),c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,
 (SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 (SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname COLLATE "C") FROM pg_constraint WHERE conrelid=c.oid AND contype<>'n'),
 (SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname COLLATE "C") FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
 (SELECT jsonb_agg(indexdef ORDER BY indexname COLLATE "C") FROM pg_indexes WHERE schemaname=n.nspname AND tablename=c.relname)) ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C") FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','storage') AND c.relkind IN ('r','p','v')),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY schemaname COLLATE "C",tablename COLLATE "C",policyname COLLATE "C") FROM pg_policies p WHERE schemaname IN ('public','storage')),
 'roles',(SELECT jsonb_agg(jsonb_build_array(rolname,rolsuper,rolinherit,rolbypassrls) ORDER BY rolname COLLATE "C") FROM pg_roles),
 'members',(SELECT jsonb_agg(jsonb_build_array(roleid::regrole::text,member::regrole::text,admin_option) ORDER BY roleid::regrole::text COLLATE "C",member::regrole::text COLLATE "C") FROM pg_auth_members)
 )`;}
function snapshot(){return `WITH original AS MATERIALIZED (${general.snapshot()}) SELECT jsonb_build_object('foundation',value->'contract','rows',value->'rows','preserved',(${preservation()}),'rpc',(${rpcEvidence()})) FROM original s(value)`;}
function gateSql(applied,pins={}){
 const sha=hash(fs.readFileSync(candidate));for(const k of ['rows_sha256','preserved_sha256'])if(pins[k])assert.match(pins[k],/^[a-f0-9]{64}$/);if(pins.candidate_sha256)assert.equal(pins.candidate_sha256,sha);
 const expected=applied?JSON.parse(fs.readFileSync(contractPath)):{};if(applied)assert.equal(expected.candidate_sha256,sha);
 const pin=k=>pins[k]?q(pins[k]):'NULL::text';
 return `-- 094 SELECT ONLY. No business RPC, writes, seed or backfill. PG17/18 portable NOT NULL.
-- Post-Apply fails closed until Human-reviewed Production Preflight baseline is bound.
WITH state AS MATERIALIZED (${snapshot()}), expected AS (SELECT ${q(JSON.stringify(foundation()))}::jsonb value),
asset_checks AS (SELECT k.code,coalesce((${validAsset}),false) usable FROM (VALUES ${keys.map(k=>'('+q(k)+')').join(',')}) k(code) LEFT JOIN public.visual_assets a ON a.artwork_key=k.code),
checks AS (SELECT jsonb_build_object('owner',current_user='postgres','foundation_exact',state->'foundation'=expected.value,
 'no_broad_registry_access',${effective},
 'matter_read_dependency',to_regprocedure('public.advisory_control_read(uuid,jsonb)') IS NOT NULL,
 'approved_artworks_usable',NOT EXISTS(SELECT 1 FROM asset_checks WHERE NOT usable),
 'rpc_exact',state->'rpc'=${q(JSON.stringify(applied?expected.rpc:{}))}::jsonb${applied?`,
 'service_only_execute',coalesce(has_function_privilege('service_role',to_regprocedure('public.journey_artwork094_read(text)')::oid,'EXECUTE') AND NOT has_function_privilege('anon',to_regprocedure('public.journey_artwork094_read(text)')::oid,'EXECUTE') AND NOT has_function_privilege('authenticated',to_regprocedure('public.journey_artwork094_read(text)')::oid,'EXECUTE'),false),
 'reviewed_baseline_bound',${pin('rows_sha256')} IS NOT NULL AND ${pin('preserved_sha256')} IS NOT NULL,
 'historical_rows_unchanged',${digest("state->'rows'")} IS NOT DISTINCT FROM ${pin('rows_sha256')},
 'unrelated_contracts_unchanged',${digest("state->'preserved'")} IS NOT DISTINCT FROM ${pin('preserved_sha256')}`:''}) value FROM state s(state),expected),
failures AS(SELECT coalesce(jsonb_agg(key ORDER BY key COLLATE "C"),'[]') value FROM checks,jsonb_each(checks.value) c(key,passed) WHERE passed IS DISTINCT FROM 'true'::jsonb)
SELECT jsonb_build_object('gate_pass',failures.value='[]'::jsonb,'failed_checks',failures.value,'checks',checks.value,
 'candidate_sha256','${sha}','accepted_083_sha256','${general.accepted083}','accepted_084_sha256','${accepted084}',
 'rows_sha256',${digest("state->'rows'")},'preserved_sha256',${digest("state->'preserved'")},
 'artwork_checks',(SELECT jsonb_agg(to_jsonb(a) ORDER BY code COLLATE "C") FROM asset_checks a),
 'object_differences',(SELECT coalesce(jsonb_agg(k ORDER BY k COLLATE "C"),'[]') FROM jsonb_object_keys(expected.value||(state->'foundation')) k WHERE expected.value->k IS DISTINCT FROM state->'foundation'->k),
 'business_rpc_executed',false,'historical_migration',false,'broader_finance_differences_accepted',false)
FROM state s(state),expected,checks,failures;
`;
}
function migrationSql(){return `-- 094: server-only approved Journey artwork metadata. HUMAN APPLY ONLY.
-- 083/084 tables, policies, data and Admin management remain unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $guard$
DECLARE state jsonb;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'ARTWORK094_OWNER_REQUIRED'; END IF;
 SELECT value INTO state FROM (${base.snapshot({portableNotNull:true})}) s(value);
 IF state->'contract' IS DISTINCT FROM ${q(JSON.stringify(foundation()))}::jsonb OR NOT (${effective}) THEN RAISE EXCEPTION 'ARTWORK094_FOUNDATION_MISMATCH'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='journey_artwork094_read') THEN RAISE EXCEPTION 'ARTWORK094_ALREADY_PRESENT'; END IF;
 IF to_regprocedure('public.advisory_control_read(uuid,jsonb)') IS NULL THEN RAISE EXCEPTION 'ARTWORK094_MATTER_READ_REQUIRED'; END IF;
END $guard$;
CREATE FUNCTION public.journey_artwork094_read(p_artwork_key text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE result jsonb;
BEGIN
 IF p_artwork_key IS NULL OR p_artwork_key<>ALL(ARRAY[${keys.map(q).join(',')}]) THEN RAISE EXCEPTION 'ARTWORK094_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('artwork_key',a.artwork_key,'master_path',a.master_path,'width',a.width,'height',a.height) INTO result
 FROM public.visual_assets a WHERE a.artwork_key=p_artwork_key AND ${validAsset};
 IF result IS NULL THEN RAISE EXCEPTION 'ARTWORK094_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 RETURN result;
END $fn$;
ALTER FUNCTION public.journey_artwork094_read(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.journey_artwork094_read(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.journey_artwork094_read(text) TO service_role;
DO $security$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
 WHERE p.oid='public.journey_artwork094_read(text)'::regprocedure AND x.grantee NOT IN (p.proowner,'service_role'::regrole))
 OR has_function_privilege('authenticated','public.journey_artwork094_read(text)','EXECUTE')
 OR has_function_privilege('anon','public.journey_artwork094_read(text)','EXECUTE')
 THEN RAISE EXCEPTION 'ARTWORK094_EXECUTE_SCOPE'; END IF;
END $security$;
COMMIT;
`;}
const preflightSql=()=>gateSql(false),verifierSql=pins=>gateSql(true,pins);
function applyDiagnosticSql(pins={}){return `-- 094 HUMAN diagnostic: ONE SELECT, no business RPC or mutation.
-- Missing function is evidence, not a SQL error. No automatic retry/apply.
WITH verification AS MATERIALIZED (${verifierSql(pins).trim().replace(/;$/,'')}),
inventory AS MATERIALIZED (
 SELECT p.oid,n.nspname,p.proname,p.prokind,
 jsonb_build_object('schema',n.nspname,'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),
 'kind',p.prokind,'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'config',p.proconfig,
 'definition_sha256',CASE WHEN p.prokind IN ('f','p') THEN ${digest('pg_get_functiondef(p.oid)')} END,
 'acl',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) ORDER BY x.grantee::regrole::text COLLATE "C",x.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x)) evidence
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname LIKE 'journey_artwork094%'
), assessment AS (
 SELECT value,
 NOT EXISTS(SELECT 1 FROM jsonb_each(value->'checks') c(key,passed) WHERE key NOT IN ('rpc_exact','service_only_execute') AND passed IS DISTINCT FROM 'true'::jsonb) preserved_and_usable,
 NOT EXISTS(SELECT 1 FROM inventory) no_094_functions,
 (SELECT count(*)=1 AND bool_and(nspname='public' AND proname='journey_artwork094_read' AND prokind='f' AND oid=to_regprocedure('public.journey_artwork094_read(text)')::oid) FROM inventory) only_expected_signature
 FROM verification v(value)
)
SELECT jsonb_build_object(
 'production_state',CASE WHEN preserved_and_usable AND no_094_functions THEN 'CLEAN_PRE_094' WHEN value->'gate_pass'='true'::jsonb AND only_expected_signature THEN 'EXACT_APPLIED_094' ELSE 'UNEXPECTED_OR_PARTIAL_STATE' END,
 'expected_function_exists',to_regprocedure('public.journey_artwork094_read(text)') IS NOT NULL,
 'no_094_functions',no_094_functions,
 'functions_found',(SELECT coalesce(jsonb_agg(evidence ORDER BY nspname COLLATE "C",proname COLLATE "C",oid),'[]') FROM inventory),
 'accepted_083_084_contract_unchanged',value->'checks'->'foundation_exact',
 'reviewed_rows_unchanged',value->'checks'->'historical_rows_unchanged',
 'reviewed_preserved_contracts_unchanged',value->'checks'->'unrelated_contracts_unchanged',
 'checks',value->'checks','post_apply_failed_checks',value->'failed_checks',
 'candidate_sha256',value->'candidate_sha256','accepted_083_sha256',value->'accepted_083_sha256','accepted_084_sha256',value->'accepted_084_sha256',
 'rows_sha256',value->'rows_sha256','preserved_sha256',value->'preserved_sha256',
 'object_differences',value->'object_differences',
 'business_rpc_executed',false,'production_mutation',false)
FROM assessment;
`;}
function generate(){const pins=JSON.parse(fs.readFileSync(pinsPath));fs.writeFileSync(preflight,preflightSql());fs.writeFileSync(verifier,verifierSql(pins));fs.writeFileSync(applyDiagnostic,applyDiagnosticSql(pins));}
module.exports={...base,candidate,preflight,verifier,applyDiagnostic,contractPath,pinsPath,keys,validAsset,effective,snapshot,rpcEvidence,migrationSql,preflightSql,verifierSql,applyDiagnosticSql,generate};
if(require.main===module){if(process.argv[2]==='--candidate')fs.writeFileSync(candidate,migrationSql());else if(process.argv[2]==='--generate')generate();else if(process.argv[2]==='--check'){const pins=JSON.parse(fs.readFileSync(pinsPath));assert.equal(fs.readFileSync(candidate,'utf8'),migrationSql());assert.equal(fs.readFileSync(preflight,'utf8'),preflightSql());assert.equal(fs.readFileSync(verifier,'utf8'),verifierSql(pins));assert.equal(fs.readFileSync(applyDiagnostic,'utf8'),applyDiagnosticSql(pins));}else throw Error('Use --candidate (prepare only), --generate, --check');}
