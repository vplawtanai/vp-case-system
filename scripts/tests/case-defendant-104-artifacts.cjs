/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),path=require('node:path'),B=require('./case-service-103-artifacts.cjs');
const {root,read,q,j,hash,pins,pgJson}=B;
const candidate='supabase/migrations/202610100104_case_civil_defendant.sql';
const afterPath='scripts/tests/fixtures/case-defendant-104-after.json',reviewedPath='scripts/tests/fixtures/case-defendant-104-reviewed.json';
const newTables=['case_defendant_representations','case_answer_filings','case_answer_filing_parties','case_extension_groups','case_extension_group_parties','case_counterclaims','case_counterclaim_parties'];
const baseTables=['cases','parties','case_audit_logs','case_deadlines','case_deadline_extensions','case_work_core','case_team_assignments','case_flow_versions','case_flow_stages','case_flow_instances','case_flow_transitions','case_service_controls','case_service_attempts','case_service_events'];
const tables=[...baseTables,...newTables];
const signatures=['case104_filed_date(bigint,uuid)','case104_all_resolved(bigint)','case104_flow_guard()','case104_counterclaim_write(bigint,text,jsonb)','case104_deadline_token(uuid,jsonb)','case104_sync(bigint,uuid[],jsonb)','case104_integrity()','case104_projection_guard()','case104_deadline_guard()','case104_parties(bigint,jsonb,text,boolean)','case104_read(bigint)','case104_save(bigint,uuid,text,jsonb,jsonb)'];
const acceptedAll=JSON.parse(read(B.afterPath));
const accepted={tables:Object.fromEntries(baseTables.map(t=>[t,acceptedAll.tables[t]])),functions:acceptedAll.functions,seed:acceptedAll.seed};
const acceptedContractSha=hash(pgJson(pins(accepted)));
const digest=s=>`encode(sha256(convert_to((${s})::text,'UTF8')),'hex')`;
function footprint(){return B.footprint().replace(/c\.relname=ANY\(ARRAY\[[^\]]*\]\)/,`c.relname=ANY(ARRAY[${tables.map(q).join(',')}])`).replace("p.proname LIKE 'case102_%'","p.proname LIKE 'case102_%' OR p.proname LIKE 'case104_%'");}
function fingerprint(){return `WITH raw AS (${footprint()}) SELECT jsonb_build_object(${['tables','functions'].map(k=>q(k)+`,(SELECT coalesce(jsonb_object_agg(key,${digest('value')}),'{}') FROM jsonb_each(c->${q(k)}))`).join(',')}) FROM raw r(c)`;}
function security(){return newTables.map(t=>`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.${t} FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.${t} TO authenticated;
CREATE POLICY case104_read ON public.${t} FOR SELECT TO authenticated USING(public.case097_session_ready() AND public.can_view_case_data());
CREATE TRIGGER case104_preserve BEFORE ${['case_answer_filing_parties','case_counterclaim_parties'].includes(t)?'UPDATE OR ':''}DELETE OR TRUNCATE ON public.${t} FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();`).join('\n')+'\n'+signatures.map(s=>`ALTER FUNCTION public.${s} OWNER TO postgres;
REVOKE ALL ON FUNCTION public.${s} FROM PUBLIC,anon,authenticated,service_role;`).join('\n')+`
GRANT EXECUTE ON FUNCTION public.case104_read(bigint),public.case104_save(bigint,uuid,text,jsonb,jsonb) TO authenticated;
`;}
const absent=newTables.map(t=>`to_regclass('public.${t}') IS NULL`).join(' AND ')+" AND NOT EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'case104_%')";
const people="(SELECT count(*)=9 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND column_name IN('id','staff_name','full_name','account_type','assignable','role','active','must_change_password','financial_access'))";
function additiveApplySql(sql){
 const stripped=sql.replace(/CREATE FUNCTION[\s\S]*?\$fn\$;/g,'').replace(/--[^\n]*/g,'').replace(/CREATE(?: CONSTRAINT)? TRIGGER[\s\S]*?;/g,'').replace(/INSERT INTO public\.case_flow_(?:versions|stages)[\s\S]*?;/g,'').replace(/'(?:''|[^'])*'/g,"''");
 return !/\b(?:INSERT\s+INTO|UPDATE\s+(?:public\.)?\w+\s+SET|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE\s+(?:TABLE\s+)?(?:public\.)?\w+)\b/i.test(stripped)&&! /\b(?:PERFORM|CALL)\s+(?:public\.)?case\d+_save/i.test(stripped);
}
function migration(){return `-- 104 Human Apply only. Approved Defendant domain foundation. No business DML/backfill during installation.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
LOCK TABLE public.case_flow_versions,public.case_flow_stages IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.case_flow_instances,public.case_service_controls,public.case_deadlines,public.case_deadline_extensions IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ DECLARE actual jsonb; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'CASE104_OWNER_REQUIRED'; END IF;
 ${fingerprint()} INTO actual;
 IF actual IS DISTINCT FROM ${j(pins(accepted))} THEN RAISE EXCEPTION 'CASE104_CONTRACT_DRIFT'; END IF;
 IF NOT (${absent}) THEN RAISE EXCEPTION 'CASE104_ALREADY_EXISTS'; END IF;
 IF (${B.seed()}) IS DISTINCT FROM ${j(accepted.seed)} THEN RAISE EXCEPTION 'CASE104_TEMPLATE_DRIFT'; END IF;
 IF NOT (${people}) THEN RAISE EXCEPTION 'CASE104_PEOPLE_CONTRACT_MISSING'; END IF;
END $guard$;
${read('scripts/sql/case_defendant_104_contract.sql')}
${security()}
NOTIFY pgrst,'reload schema';
COMMIT;
`;}
function gate(post=false){
 const expected=post?JSON.parse(read(afterPath)):accepted,reviewed=JSON.parse(read(reviewedPath));
 return `-- SELECT ONLY: scoped schema/security/configuration, never business RPCs or auth/business-table fingerprints.
-- Candidate SHA/no-DML attestation is produced by local artifact validation, not by reading a server-side SQL file.
WITH installed AS (${fingerprint()}), evidence AS (SELECT catalog,${j(pins(expected))} expected,jsonb_build_object(
 'contract_exact',catalog=${j(pins(expected))},'people_contract',${people},
 'template_seed_exact',(${B.seed()})=${j(expected.seed)},
 'candidate_apply_has_no_legacy_dml',${additiveApplySql(read(candidate))},
 ${post?`'reviewed_contract_bound',coalesce(${j(reviewed)}->>'candidate_sha256'=${q(hash(read(candidate)))} AND ${j(reviewed)}->>'accepted_contract_sha256'=${q(acceptedContractSha)},false)`:`'104_absent',${absent}`}
 ) checks FROM installed c(catalog))
SELECT jsonb_build_object('gate_pass',NOT EXISTS(SELECT 1 FROM jsonb_each(checks) x WHERE x.value IS DISTINCT FROM 'true'::jsonb),
 'failed_checks',(SELECT coalesce(jsonb_agg(key ORDER BY key),'[]') FROM jsonb_each(checks) x WHERE x.value IS DISTINCT FROM 'true'::jsonb),
 'candidate_sha256',${q(hash(read(candidate)))},'accepted_103_sha256',${q(hash(read(B.candidate)))},'accepted_contract_sha256',${q(acceptedContractSha)},'contract_sha256',${digest('catalog')},'checks',checks,
 'object_differences',(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'name',name) ORDER BY kind,name),'[]') FROM
 (SELECT kind,name FROM (SELECT 'tables' kind,jsonb_object_keys((catalog->'tables')||(expected->'tables')) name UNION ALL SELECT 'functions',jsonb_object_keys((catalog->'functions')||(expected->'functions'))) k WHERE catalog#>ARRAY[kind,name] IS DISTINCT FROM expected#>ARRAY[kind,name]) d),
 'business_rows_are_not_gate_inputs',true,'production_mutation',false,'business_rpc_executed',false,'auth_tables_read',false) AS case_defendant_104 FROM evidence;
`.replace(/[ \t]+$/gm,'');
}
function objectDiff(){const after=JSON.parse(read(afterPath));return ['tables','functions'].flatMap(kind=>Object.keys({...accepted[kind],...after[kind]}).filter(n=>pgJson(accepted[kind][n]??null)!==pgJson(after[kind][n]??null)).map(name=>({kind,name,change:accepted[kind][name]?'modified':'added',before_sha256:accepted[kind][name]?hash(pgJson(accepted[kind][name])):null,after_sha256:hash(pgJson(after[kind][name])),...(kind==='tables'?{details:Object.fromEntries(Object.entries(after[kind][name]).filter(([key,value])=>pgJson(value)!==pgJson(accepted[kind][name]?.[key]??null)).map(([key,value])=>[key,{before:accepted[kind][name]?.[key]??null,after:value}]))}:{})})));}
function generate(){fs.writeFileSync(path.join(root,candidate),migration());fs.writeFileSync(path.join(root,'scripts/sql/preflight_case_defendant_104.sql'),gate());if(fs.existsSync(path.join(root,afterPath))){fs.writeFileSync(path.join(root,'scripts/sql/verify_case_defendant_104.sql'),gate(true));fs.writeFileSync(path.join(root,'docs/core/evidence/case-defendant-104-object-diff.json'),JSON.stringify(objectDiff(),null,2)+'\n');}}
module.exports={...B,candidate,afterPath,reviewedPath,newTables,tables,baseTables,signatures,accepted,acceptedContractSha,footprint,fingerprint,security,migration,gate,generate,additiveApplySql,objectDiff};
if(require.main===module)generate();
