/* eslint-disable @typescript-eslint/no-require-imports */
// Offline 093 generator. Accepted 089–092 pins remain authoritative. Only the
// explicitly changed definitions are captured locally. Production pins are human-bound.
const fs=require('node:fs'),assert=require('node:assert/strict');
const P=require('./finance-payroll-correction-artifacts.cjs'),A=require('./finance-authority-artifacts.cjs'),D=require('./direct-money-documents-artifacts.cjs');
const {q,sha,hash}=A;
const candidate='supabase/migrations/202610040093_finance_payroll_setup_correction.sql';
const preflight='scripts/sql/preflight_finance_payroll_setup_093.sql',verifier='scripts/sql/verify_finance_payroll_setup_093.sql';
const contractPath='scripts/tests/fixtures/finance-payroll-setup-contract.json',baselinePath='scripts/tests/fixtures/finance-payroll-setup-reviewed-baseline.json';
const immutable089='d08607902bb1e04ade69c320d7538336168f83fe627aad19985234a9fb71d53b';
const signatures=['payroll089_protect()','payroll089_manage(text,jsonb,uuid)','payroll093_affected(text,uuid,date)','payroll093_engagement_check(uuid,uuid,text,boolean,date)','payroll093_correct(text,uuid,uuid,text,jsonb,uuid)'];
const immutable090='ac132aca894486c8652f47ad01a7a864a3cd765fd79273d4ab331595eaece74b';
const immutable091='f375b985260d1c132efec25f8f51b4432b6cb5d580ae93d7bc3397d1b29d882b';
const immutable092='4a2288524b8eb7970f44be044d299b354e60f24674a9afe24eec4c5cf42bcb60';
function definition(sql,name){const start=sql.indexOf('create or replace function public.'+name+'(');assert.ok(start>=0);return sql.slice(start,sql.indexOf('end; $$;',start)+8);}
function body(){
 const protect=definition(fs.readFileSync(P.candidate,'utf8'),'payroll089_protect');
 const manage=definition(fs.readFileSync('supabase/migrations/202610040091_finance_payroll_monthly_lines.sql','utf8'),'payroll089_manage');
 const permit=`
 if tg_op in ('UPDATE','DELETE') and exists(select 1 from finance_payroll_requests q
  where q.id::text=current_setting('vp.payroll093_request',true) and q.actor_id=auth.uid() and q.action='setup_correct'
   and q.result->>'transaction_id'=txid_current()::text
   and case when tg_op='UPDATE' then
    tg_table_name=case q.result->>'kind' when 'engagement' then 'finance_payroll_engagements' when 'rate' then 'finance_payroll_rates' end
    and q.result->'before'=to_jsonb(old) and q.result->'after'=to_jsonb(new)
   else tg_table_name='finance_payroll_lines' and q.result->'invalidated_lines' @> jsonb_build_array(to_jsonb(old)) end)
 then
  if tg_op='DELETE' then
   if not public.payroll092_line_safe(old.id) then raise exception 'PAYROLL_SETUP_FINALIZED';end if;
   return old;
  end if;
  return new;
 end if;`;
 const guarded=manage.replace("  if p_action='engagement' then",`  if not isfinite(effective) then raise exception 'PAYROLL_SETUP_INVALID';end if;
  if (p_action='engagement' and exists(select 1 from finance_payroll_engagements where payee_id=payee.id and effective_from=effective))
   or (p_action='rate' and exists(select 1 from finance_payroll_rates where payee_id=payee.id and effective_from=effective)) then raise exception 'PAYROLL_EFFECTIVE_DATE_COLLISION';end if;
  if p_action='engagement' then
   perform public.payroll093_engagement_check(payee.id,new_id,p_payload->>'kind',(p_payload->>'active')::boolean,effective);`);
 assert.notEqual(guarded,manage);
 return fs.readFileSync('scripts/tests/finance-payroll-setup-body.sql','utf8')
  .replace('-- PATCH_093_PROTECT: retain the entire 092 guard after the narrow new permit.',()=>protect.replace(' perform public.payroll089_require_admin();',' perform public.payroll089_require_admin();'+permit))
  .replace('-- PATCH_093_MANAGE: retain the 091 manage body; guard effective events before INSERT.',()=>guarded);
}
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
const functionHashes=()=>`select coalesce(jsonb_object_agg(v->>'signature',${hash('v')}),'{}') from (${A.functionEvidence} and (p.proname in (${[...new Set([...Object.keys(before().functions),...signatures].map(s=>s.split('(')[0]))].map(q)}) or left(p.proname,11)='payroll093_')) f,jsonb_array_elements(f.value) x(v)`;
const snapshot=()=>`select jsonb_build_object('functions',(${functionHashes()}),'tables',(${tableHashes}),'rows',(${rowsSql}),'preserved',(${preservedSql})) state`;
function candidateSql(){return `-- 093 safe Payroll correction candidate. HUMAN MIGRATION GATE; no seed/backfill/business DML.
-- Accepted immutable 089 file SHA-256: ${immutable089}
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
DO $locks$ declare r record; begin
 if current_user<>'postgres' then raise exception 'PAYROLL093_OWNER_REQUIRED';end if;
 for r in select c.oid::regclass rel from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') order by c.oid loop execute format('LOCK TABLE %s IN SHARE MODE',r.rel);end loop;
end;$locks$;
CREATE TEMP TABLE payroll093_before ON COMMIT DROP AS ${snapshot()};
DO $guard$ declare s jsonb;begin
 select state into s from payroll093_before;
 if s->'functions' is distinct from ${q(JSON.stringify(before().functions))}::jsonb or s->'tables' is distinct from ${q(JSON.stringify(before().tables))}::jsonb then raise exception 'PAYROLL093_ACCEPTED_092_CONTRACT_DRIFT';end if;
end;$guard$;
${body()}
DO $preserve$ declare b jsonb;a jsonb;begin
 select state into b from payroll093_before;
 ${snapshot()} into a;
 if a->'rows' is distinct from b->'rows' or a->'preserved' is distinct from b->'preserved' then raise exception 'PAYROLL093_PRESERVATION_FAILED';end if;
 if a->'functions' is distinct from ${q(JSON.stringify(after().functions))}::jsonb or a->'tables' is distinct from ${q(JSON.stringify(after().tables))}::jsonb then raise exception 'PAYROLL093_INSTALLED_CONTRACT_FAILED';end if;
end;$preserve$;
COMMIT;
`;}
function gate(post=false,pins=JSON.parse(fs.readFileSync(baselinePath))){const expected=post?after():before(),pin=k=>pins[k]?q(pins[k]):'NULL::text';return `-- 093 STATIC SELECT-ONLY ${post?'POST-APPLY VERIFIER':'PREFLIGHT'}. No business RPC executed.
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
 ${q(sha(fs.readFileSync(candidate)))} candidate_sha256,${q(immutable089)} accepted_089_sha256,${q(immutable090)} accepted_090_sha256,${q(immutable091)} accepted_091_sha256,${q(immutable092)} accepted_092_sha256,
 (select jsonb_object_agg(kind,value) from differences) object_differences,
 (select state->'rows' from captured) row_fingerprints,(select ${hash("state->'rows'")} from captured) rows_sha256,
 (select ${hash("state->'preserved'")} from captured) preserved_sha256,
 false business_rpc_executed,false historical_migration,false broader_finance_differences_accepted from checks;
`.replace(/[ \t]+$/gm,'');}
function write(){fs.writeFileSync(candidate,candidateSql());fs.writeFileSync(preflight,gate());fs.writeFileSync(verifier,gate(true));}
function validate(){assert.equal(P.validate(),immutable092);assert.equal(sha(fs.readFileSync('supabase/migrations/202610030089_finance_payroll_compensation_foundation.sql')),immutable089);assert.deepEqual(Object.keys(contract().functions).sort(),[...signatures].sort());assert.deepEqual(Object.keys(contract().tables),[]);for(const h of [...Object.values(contract().functions),...Object.values(contract().tables)])assert.match(h,/^[0-9a-f]{64}$/);assert.equal(fs.readFileSync(candidate,'utf8'),candidateSql());assert.equal(fs.readFileSync(preflight,'utf8'),gate());assert.equal(fs.readFileSync(verifier,'utf8'),gate(true));return sha(fs.readFileSync(candidate));}
if(require.main===module){if(process.argv.includes('--write'))write();console.log(validate());}
module.exports={candidate,preflight,verifier,contractPath,baselinePath,immutable089,immutable090,immutable091,immutable092,signatures,body,before,after,contract,snapshot,gate,write,validate};
