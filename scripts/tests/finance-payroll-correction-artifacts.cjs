/* eslint-disable @typescript-eslint/no-require-imports */
// Offline 092 generator. Accepted 089/090/091 pins remain authoritative. Only the
// explicitly changed definitions are captured locally. Production pins are human-bound.
const fs=require('node:fs'),assert=require('node:assert/strict');
const P=require('./finance-payroll-monthly-artifacts.cjs'),A=require('./finance-authority-artifacts.cjs'),D=require('./direct-money-documents-artifacts.cjs');
const {q,sha,hash}=A;
const candidate='supabase/migrations/202610040092_finance_payroll_safe_correction.sql';
const preflight='scripts/sql/preflight_finance_payroll_correction_092.sql',verifier='scripts/sql/verify_finance_payroll_correction_092.sql';
const contractPath='scripts/tests/fixtures/finance-payroll-correction-contract.json',baselinePath='scripts/tests/fixtures/finance-payroll-correction-reviewed-baseline.json';
const immutable089='d08607902bb1e04ade69c320d7538336168f83fe627aad19985234a9fb71d53b';
const signatures=['payroll089_protect()','payroll092_line_safe(uuid)','payroll092_rate_lines(uuid)','payroll092_state(uuid)','payroll092_read(date,uuid)','payroll092_correct(text,uuid,uuid,text,text,uuid)'];
const immutable090='ac132aca894486c8652f47ad01a7a864a3cd765fd79273d4ab331595eaece74b';
const immutable091='f375b985260d1c132efec25f8f51b4432b6cb5d580ae93d7bc3397d1b29d882b';
const body=()=>fs.readFileSync('scripts/tests/finance-payroll-correction-body.sql','utf8');
const before=()=>P.after();
const contract=()=>JSON.parse(fs.readFileSync(contractPath));
const after=()=>({functions:{...before().functions,...contract().functions},tables:{...before().tables,...contract().tables}});
const catalog=D.catalogSql.replace(/order by (conname|indexname|policyname|tgname|c.relname)\b/g,'order by $1 COLLATE "C"').replace('where conrelid=c.oid',"where conrelid=c.oid and contype<>'n'").replace("'generated',a.attgenerated","'acl',a.attacl::text,'generated',a.attgenerated");
const tableHashes=`select coalesce(jsonb_object_agg(v->>'name',${hash('v')}),'{}') from (${catalog} and c.relname in (${Object.keys(before().tables).map(q)})) f,jsonb_array_elements(f.value) x(v)`;
const rowsSql=A.rowsSql.replaceAll("case when c.relname='user_profiles' then 'to_jsonb(t)-''finance_operator''' else 'to_jsonb(t)' end","'to_jsonb(t)'");
const preservedSql=`select jsonb_build_object('tables',(select value from (${catalog}) t),
 'functions',(select value from (${A.functionEvidence} and p.oid::regprocedure::text not in (${signatures.map(q)})) f),
 'defaults',(select coalesce(jsonb_agg(to_jsonb(d)-'oid' order by defaclrole,defaclnamespace,defaclobjtype),'[]') from pg_default_acl d),
 'views',(select coalesce(jsonb_object_agg(c.relname,pg_get_viewdef(c.oid,true)),'{}') from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v'))`;
const snapshot=()=>`select jsonb_build_object('functions',(${A.functionHashes([...new Set([...Object.keys(before().functions),...signatures].map(s=>s.split('(')[0]))])}),'tables',(${tableHashes}),'rows',(${rowsSql}),'preserved',(${preservedSql})) state`;
function candidateSql(){return `-- 092 safe Payroll correction candidate. HUMAN MIGRATION GATE; no seed/backfill/business DML.
-- Accepted immutable 089 file SHA-256: ${immutable089}
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
DO $locks$ declare r record; begin
 if current_user<>'postgres' then raise exception 'PAYROLL092_OWNER_REQUIRED';end if;
 for r in select c.oid::regclass rel from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') order by c.oid loop execute format('LOCK TABLE %s IN SHARE MODE',r.rel);end loop;
end;$locks$;
CREATE TEMP TABLE payroll092_before ON COMMIT DROP AS ${snapshot()};
DO $guard$ declare s jsonb;begin
 select state into s from payroll092_before;
 if s->'functions' is distinct from ${q(JSON.stringify(before().functions))}::jsonb or s->'tables' is distinct from ${q(JSON.stringify(before().tables))}::jsonb then raise exception 'PAYROLL092_ACCEPTED_091_CONTRACT_DRIFT';end if;
end;$guard$;
${body()}
DO $preserve$ declare b jsonb;a jsonb;begin
 select state into b from payroll092_before;
 ${snapshot()} into a;
 if a->'rows' is distinct from b->'rows' or a->'preserved' is distinct from b->'preserved' then raise exception 'PAYROLL092_PRESERVATION_FAILED';end if;
 if a->'functions' is distinct from ${q(JSON.stringify(after().functions))}::jsonb or a->'tables' is distinct from ${q(JSON.stringify(after().tables))}::jsonb then raise exception 'PAYROLL092_INSTALLED_CONTRACT_FAILED';end if;
end;$preserve$;
COMMIT;
`;}
function gate(post=false,pins=JSON.parse(fs.readFileSync(baselinePath))){const expected=post?after():before(),pin=k=>pins[k]?q(pins[k]):'NULL::text';return `-- 092 STATIC SELECT-ONLY ${post?'POST-APPLY VERIFIER':'PREFLIGHT'}. No business RPC executed.
-- Review component row fingerprints, then bind HUMAN-reviewed baselines before apply.
WITH captured AS MATERIALIZED(${snapshot()}), differences AS (
 select kind,(select coalesce(jsonb_agg(jsonb_build_object('object',coalesce(e.key,a.key),'expected',e.value,'actual',a.value) order by coalesce(e.key,a.key) COLLATE "C"),'[]') from jsonb_each(expected) e full join jsonb_each(actual) a using(key) where e.value is distinct from a.value) value
 from captured cross join lateral(values ('functions',${q(JSON.stringify(expected.functions))}::jsonb,state->'functions'),('tables',${q(JSON.stringify(expected.tables))}::jsonb,state->'tables')) d(kind,expected,actual)
), checks AS(select * from (values
 ('owner',current_user='postgres'),('contract_exact',(select bool_and(value='[]'::jsonb) from differences))
 ${post?`,('reviewed_baseline_bound',${pin('rows_sha256')} is not null and ${pin('preserved_sha256')} is not null),
 ('historical_rows_unchanged',(select ${hash("state->'rows'")}=${pin('rows_sha256')} from captured)),
 ('unrelated_contracts_unchanged',(select ${hash("state->'preserved'")}=${pin('preserved_sha256')} from captured))`:''}
 ) c(name,pass))
 select bool_and(coalesce(pass,false)) gate_pass,coalesce(jsonb_agg(name order by name COLLATE "C") filter(where pass is distinct from true),'[]') failed_checks,
 ${q(sha(fs.readFileSync(candidate)))} candidate_sha256,${q(immutable089)} accepted_089_sha256,${q(immutable090)} accepted_090_sha256,${q(immutable091)} accepted_091_sha256,
 (select jsonb_object_agg(kind,value) from differences) object_differences,
 (select state->'rows' from captured) row_fingerprints,(select ${hash("state->'rows'")} from captured) rows_sha256,
 (select ${hash("state->'preserved'")} from captured) preserved_sha256,
 false business_rpc_executed,false historical_migration,false broader_finance_differences_accepted from checks;
`.replace(/[ \t]+$/gm,'');}
function write(){fs.writeFileSync(candidate,candidateSql());fs.writeFileSync(preflight,gate());fs.writeFileSync(verifier,gate(true));}
function validate(){assert.equal(P.validate(),immutable091);assert.equal(sha(fs.readFileSync('supabase/migrations/202610030089_finance_payroll_compensation_foundation.sql')),immutable089);assert.deepEqual(Object.keys(contract().functions).sort(),[...signatures].sort());assert.deepEqual(Object.keys(contract().tables),[]);for(const h of [...Object.values(contract().functions),...Object.values(contract().tables)])assert.match(h,/^[0-9a-f]{64}$/);assert.equal(fs.readFileSync(candidate,'utf8'),candidateSql());assert.equal(fs.readFileSync(preflight,'utf8'),gate());assert.equal(fs.readFileSync(verifier,'utf8'),gate(true));return sha(fs.readFileSync(candidate));}
if(require.main===module){if(process.argv.includes('--write'))write();console.log(validate());}
module.exports={candidate,preflight,verifier,contractPath,baselinePath,immutable089,immutable090,immutable091,signatures,body,before,after,contract,snapshot,gate,write,validate};
