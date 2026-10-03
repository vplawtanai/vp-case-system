/* eslint-disable @typescript-eslint/no-require-imports */
// Local artifact generation only. Accepted 088 pins are imported, not re-learned.
const fs=require('node:fs'),assert=require('node:assert/strict');
const A=require('./finance-authority-artifacts.cjs'),B=require('./finance-payable-bulk-artifacts.cjs'),D=require('./direct-money-documents-artifacts.cjs');
const {q,sha,hash}=A;
const candidate='supabase/migrations/202610030089_finance_payroll_compensation_foundation.sql';
const preflight='scripts/sql/preflight_finance_payroll_089.sql',verifier='scripts/sql/verify_finance_payroll_089.sql';
const contractPath='scripts/tests/fixtures/finance-payroll-contract.json',baselinePath='scripts/tests/fixtures/finance-payroll-reviewed-baseline.json';
const tables=['finance_payroll_engagements','finance_payroll_rates','finance_payroll_periods','finance_payroll_lines','finance_payroll_obligations','finance_payroll_payments','finance_payroll_requests','finance_payroll_audit'];
const accepted071=require('./executive-finance-contract.json'),accepted078=require('./fixtures/finance-authority-after.json');
const extraFunctions=['payout_immutable','get_finance_payees','payout_assert_before_expense','enforce_finance_cash_transaction_lifecycle','tax_position_immutable','get_finance_treasury'];
const extraPins=Object.fromEntries(Object.entries({...accepted071.after.functions,...accepted078.functions}).filter(([s])=>extraFunctions.includes(s.split('(')[0])));
const changedFunctions=['payout_assert','get_finance_account_statement'];
const catalog=D.catalogSql.replace(/order by (conname|indexname|policyname|tgname|c.relname)\b/g,'order by $1 COLLATE "C"').replace('where conrelid=c.oid',"where conrelid=c.oid and contype<>'n'").replace("'generated',a.attgenerated","'acl',a.attacl::text,'generated',a.attgenerated");
const tableHashes=names=>`select coalesce(jsonb_object_agg(v->>'name',${hash('v')}),'{}') from (${catalog} and c.relname in (${names.map(q)})) f,jsonb_array_elements(f.value) x(v)`;
const bodyFile='scripts/tests/finance-payroll-body.sql';
const addedFunctions=()=>[...fs.readFileSync(bodyFile,'utf8').matchAll(/create function public\.(\w+)/g)].map(x=>x[1]);
const rowsSql=A.rowsSql.replaceAll("case when c.relname='user_profiles' then 'to_jsonb(t)-''finance_operator''' else 'to_jsonb(t)' end","'to_jsonb(t)'").replace(') captured',` and c.relname not in (${tables.map(q)})) captured`);
const preservedSql=`select jsonb_build_object('tables',(select value from (${catalog} and c.relname not in (${[...tables,'finance_payouts'].map(q)})) t),'functions',(select value from (${A.functionEvidence} and p.proname not in (${[...addedFunctions(),...changedFunctions].map(q)})) f),'defaults',(select coalesce(jsonb_agg(to_jsonb(d)-'oid' order by defaclrole,defaclnamespace,defaclobjtype),'[]') from pg_default_acl d),'views',(select coalesce(jsonb_object_agg(c.relname,pg_get_viewdef(c.oid,true)),'{}') from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v'))`;
const snapshot=()=>`select jsonb_build_object('functions',(${A.functionHashes([...B.functions,...extraFunctions,'finance_expense_payout_batch',...addedFunctions()])}),'tables',(${tableHashes([...B.tables,...tables])}),'rows',(${rowsSql}),'preserved',(${preservedSql}),'new_row_count',(select coalesce(sum((xpath('/row/n/text()',x))[1]::text::bigint),0) from (select query_to_xml(format('select count(*) n from public.%I',c.relname),true,true,'') x from pg_class c where c.relnamespace='public'::regnamespace and c.relname in (${tables.map(q)}) and c.relkind='r') n)) state`;
const patches=[
 {signature:'payout_assert(uuid)',from:"if p.source_model='revenue_distribution_v1' then",to:"if p.source_model='payroll_v1' then perform public.payroll089_payment_assert(p_id);return; end if;\n if p.source_model='revenue_distribution_v1' then"},
 {signature:'get_finance_account_statement(uuid,uuid,date,date,text,text,integer)',from:"when h.source_payout_id is not null then 'participant_payout'",to:"when p.source_model='payroll_v1' then 'other' when h.source_payout_id is not null then 'participant_payout'"},
 {signature:'get_finance_account_statement(uuid,uuid,date,date,text,text,integer)',from:"when h.source_payout_id is not null and public.current_user_can_view_finance_payments() then",to:"when p.source_model='payroll_v1' then case when public.finance078_admin() then '/finance/payroll' else null end\n    when h.source_payout_id is not null and public.current_user_can_view_finance_payments() then"},
 {signature:'get_finance_account_statement(uuid,uuid,date,date,text,text,integer)',from:'coalesce(e.vendor_name,dm.payer_name) party',to:"coalesce(e.vendor_name,dm.payer_name,case when p.source_model='payroll_v1' then p.confirmed_snapshot_json#>>'{payee,legal_name}' end) party"}
];
function body(){return fs.readFileSync(bodyFile,'utf8')+`\nDO $patch$ declare definition text; begin\n${patches.map(p=>` select pg_get_functiondef(to_regprocedure(${q(p.signature)})) into definition;\n if definition is null or (length(definition)-length(replace(definition,${q(p.from)},'')))/length(${q(p.from)})<>1 then raise exception 'PAYROLL_PATCH_CONTRACT_MISMATCH'; end if;\n execute replace(definition,${q(p.from)},${q(p.to)});`).join('\n')}\nend; $patch$;\n`;}
const before=()=>({functions:{...B.contract().functions,...B.contract().batch,...extraPins},tables:B.contract().tables});
const contract=()=>JSON.parse(fs.readFileSync(contractPath));
function candidateSql(){const c=contract(),b=before();return `-- 089 P1 candidate. HUMAN MIGRATION GATE. No business DML/backfill/seed.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
DO $locks$ declare r record; begin
 if current_user<>'postgres' then raise exception 'PAYROLL_OWNER_REQUIRED';end if;
 for r in select c.oid::regclass rel from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') order by c.oid loop execute format('LOCK TABLE %s IN SHARE MODE',r.rel);end loop;
end;$locks$;
CREATE TEMP TABLE payroll089_before ON COMMIT DROP AS ${snapshot()};
DO $guard$ declare s jsonb;begin
 select state into s from payroll089_before;
 if s->'functions' is distinct from ${q(JSON.stringify(b.functions))}::jsonb or s->'tables' is distinct from ${q(JSON.stringify(b.tables))}::jsonb then raise exception 'PAYROLL_ACCEPTED_088_CONTRACT_DRIFT';end if;
 if exists(select 1 from pg_class where relnamespace='public'::regnamespace and left(relname,16)='finance_payroll_') or exists(select 1 from pg_proc where pronamespace='public'::regnamespace and left(proname,11)='payroll089_') then raise exception 'PAYROLL_ALREADY_PRESENT';end if;
end;$guard$;
${body()}
DO $preserve$ declare b jsonb;a jsonb;begin
 select state into b from payroll089_before;
 ${snapshot()} into a;
 if a->'rows' is distinct from b->'rows' or a->'preserved' is distinct from b->'preserved' or (a->>'new_row_count')::integer<>0 then raise exception 'PAYROLL_PRESERVATION_FAILED';end if;
 if a->'functions' is distinct from ${q(JSON.stringify(c.functions))}::jsonb or a->'tables' is distinct from ${q(JSON.stringify(c.tables))}::jsonb then raise exception 'PAYROLL_INSTALLED_CONTRACT_FAILED';end if;
end;$preserve$;
COMMIT;
`;}
function gate(post=false,pins=JSON.parse(fs.readFileSync(baselinePath))){const expected=post?contract():before(),pin=k=>pins[k]?q(pins[k]):'NULL::text';return `-- 089 STATIC SELECT-ONLY ${post?'POST-APPLY VERIFIER':'PREFLIGHT'}. No business RPC is executed.
WITH captured AS MATERIALIZED(${snapshot()}), differences AS (
 select kind,(select coalesce(jsonb_agg(jsonb_build_object('object',coalesce(e.key,a.key),'expected',e.value,'actual',a.value) order by coalesce(e.key,a.key) COLLATE "C"),'[]') from jsonb_each(expected) e full join jsonb_each(actual) a using(key) where e.value is distinct from a.value) value
 from captured cross join lateral(values ('functions',${q(JSON.stringify(expected.functions))}::jsonb,state->'functions'),('tables',${q(JSON.stringify(expected.tables))}::jsonb,state->'tables')) d(kind,expected,actual)
), checks AS(select * from (values
 ('owner',current_user='postgres'),('payroll_namespace_exact',(select count(*) from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p') and left(relname,16)='finance_payroll_')=${post?tables.length:0} and (select count(*) from pg_proc where pronamespace='public'::regnamespace and left(proname,11)='payroll089_')=${post?addedFunctions().length:0}),('contract_exact',(select bool_and(value='[]'::jsonb) from differences)),
 ('no_payroll_seed',(select (state->>'new_row_count')::integer=0 from captured))
 ${post?`,('reviewed_baseline_bound',${pin('rows_sha256')} is not null and ${pin('preserved_sha256')} is not null),
 ('historical_rows_unchanged',(select ${hash("state->'rows'")}=${pin('rows_sha256')} from captured)),
 ('unrelated_contracts_unchanged',(select ${hash("state->'preserved'")}=${pin('preserved_sha256')} from captured))`:''}
 ) c(name,pass))
 select bool_and(coalesce(pass,false)) gate_pass,coalesce(jsonb_agg(name order by name COLLATE "C") filter(where pass is distinct from true),'[]') failed_checks,
 ${q(sha(fs.readFileSync(candidate)))} candidate_sha256,
 (select jsonb_object_agg(kind,value) from differences) object_differences,
 (select state->'rows' from captured) row_fingerprints,(select ${hash("state->'rows'")} from captured) rows_sha256,
 (select ${hash("state->'preserved'")} from captured) preserved_sha256,
 false business_rpc_executed,false historical_migration,false broader_finance_differences_accepted from checks;
`.replace(/[ \t]+$/gm,'');}
function write(){fs.writeFileSync(candidate,candidateSql());fs.writeFileSync(preflight,gate());fs.writeFileSync(verifier,gate(true));}
function validate(){B.validate();assert.equal(sha(fs.readFileSync(B.candidate)),'79ebc328357144bc11ce3884924fc9361f1889fe8609adc602c05062ff8828cd');for(const [p,h]of Object.entries(contract().immutableMigrationSha256||{}))assert.equal(sha(fs.readFileSync(p)),h,p);assert.equal(fs.readFileSync(candidate,'utf8'),candidateSql());assert.equal(fs.readFileSync(preflight,'utf8'),gate());assert.equal(fs.readFileSync(verifier,'utf8'),gate(true));return sha(fs.readFileSync(candidate));}
if(require.main===module){if(process.argv.includes('--write'))write();console.log(validate());}
module.exports={q,sha,hash,candidate,preflight,verifier,contractPath,baselinePath,tables,extraPins,body,before,snapshot,patches,write,validate,gate,contract};
