/* eslint-disable @typescript-eslint/no-require-imports */
// Offline exporter; no Production connection or business RPC execution mode.
const fs=require('node:fs'),assert=require('node:assert/strict');
const A=require('./finance-authority-artifacts.cjs'),D=require('./direct-money-documents-artifacts.cjs');
const {q,sha,hash}=A;
const name='finance_expense_payout_batch';
const candidate='supabase/migrations/202610030088_finance_payable_bulk_payment.sql';
const preflight='scripts/sql/preflight_finance_payable_bulk_088.sql';
const verifier='scripts/sql/verify_finance_payable_bulk_088.sql';
const contractPath='scripts/tests/fixtures/finance-payable-bulk-contract.json';
const baselinePath='scripts/tests/fixtures/finance-payable-bulk-reviewed-baseline.json';
const functions=['finance078_active','finance078_admin','finance078_require_payout','finance078_execution_account','expense_account_allowed','treasury_location_active','prepare_finance_expense_payout','confirm_finance_expense_payout','confirm_finance_payout','cancel_finance_payout','expense_payout_choice','payout_assert','payout_integrity','get_finance_expenses','get_finance_expense_obligations','get_finance_account_statement','company_purchase_request_recipient','company_purchase_request_declaration','finance_bangkok_completed_day_end','record_finance_cash_transaction_audit_event','expense_payout_model_guard','expense_integrity','validate_finance_cash_transaction_integrity','enforce_finance_cash_transaction_integrity','protect_finance_cash_audit_event'];
const tables=['finance_expenses','finance_expense_settlements','finance_expense_obligations','finance_expense_tax_reviews','finance_expense_audit','finance_expense_obligation_waivers','finance_payouts','finance_payout_allocations','finance_payout_audit','finance_cash_transactions','finance_cash_transaction_audit_events','finance_outgoing_wht_obligations','finance_payees','finance_payee_destinations','finance_account_opening_balances','finance_treasury_account_authorities'];
const catalog=D.catalogSql.replace(/order by (conname|indexname|policyname|tgname|c.relname)\b/g,'order by $1 COLLATE "C"').replace('where conrelid=c.oid',"where conrelid=c.oid and contype<>'n'").replace("'generated',a.attgenerated","'acl',a.attacl::text,'generated',a.attgenerated");
const rowsSql=A.rowsSql.replaceAll("case when c.relname='user_profiles' then 'to_jsonb(t)-''finance_operator''' else 'to_jsonb(t)' end","'to_jsonb(t)'");
const fnSql=names=>A.functionHashes(names);
const catalogSql=`select coalesce(jsonb_object_agg(v->>'name',${hash('v')}),'{}') from (${catalog} and c.relname in (${tables.map(q)})) f,jsonb_array_elements(f.value) x(v)`;
const preservedSql=`select jsonb_build_object('tables',(select value from (${catalog}) t),'functions',(select value from (${A.functionEvidence} and p.proname<>${q(name)}) f),'defaults',(select coalesce(jsonb_agg(to_jsonb(d)-'oid' order by defaclrole,defaclnamespace,defaclobjtype),'[]') from pg_default_acl d),'views',(select coalesce(jsonb_object_agg(c.relname,pg_get_viewdef(c.oid,true)),'{}') from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v'))`;
const snapshot=()=>`select jsonb_build_object('functions',(${fnSql(functions)}),'tables',(${catalogSql}),'batch',(${fnSql([name])}),'rows',(${rowsSql}),'preserved',(${preservedSql})) state`;
const body=()=>fs.readFileSync('scripts/tests/finance-payable-bulk-body.sql','utf8');
const contract=()=>JSON.parse(fs.readFileSync(contractPath));
function candidateSql(){const c=contract();return `-- 088. Additive Admin bulk expense/reimbursement orchestration only. HUMAN APPLY GATE.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
DO $locks$ DECLARE r record; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'FINANCE088_OWNER_REQUIRED'; END IF;
 FOR r IN SELECT c.oid::regclass rel FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p') AND (left(c.relname,8)='finance_' OR c.relname IN ('user_profiles','case_audit_logs','document_numbering_profiles')) ORDER BY c.oid LOOP EXECUTE format('LOCK TABLE %s IN SHARE MODE',r.rel); END LOOP;
END; $locks$;
CREATE TEMP TABLE finance088_before ON COMMIT DROP AS ${snapshot()};
DO $guard$ DECLARE s jsonb; BEGIN
 SELECT state INTO s FROM finance088_before;
 IF s->'functions' IS DISTINCT FROM ${q(JSON.stringify(c.functions))}::jsonb OR s->'tables' IS DISTINCT FROM ${q(JSON.stringify(c.tables))}::jsonb THEN RAISE EXCEPTION 'FINANCE088_CONTRACT_DRIFT'; END IF;
 IF s->'batch'<>'{}'::jsonb THEN RAISE EXCEPTION 'FINANCE088_ALREADY_PRESENT'; END IF;
END; $guard$;
${body()}
DO $preserve$ DECLARE before_state jsonb; after_state jsonb; BEGIN
 SELECT state INTO before_state FROM finance088_before;
 ${snapshot()} INTO after_state;
 IF before_state-'batch' IS DISTINCT FROM after_state-'batch' OR after_state->'batch' IS DISTINCT FROM ${q(JSON.stringify(c.batch))}::jsonb THEN RAISE EXCEPTION 'FINANCE088_PRESERVATION_FAILED'; END IF;
END; $preserve$;
COMMIT;
`;}
const diffs=`select coalesce(jsonb_agg(jsonb_build_object('object',coalesce(e.key,a.key),'expected',e.value,'actual',a.value) order by coalesce(e.key,a.key) COLLATE "C"),'[]') from jsonb_each(expected) e full join jsonb_each(actual) a using(key) where e.value is distinct from a.value`;
function gate(post=false,pins=JSON.parse(fs.readFileSync(baselinePath))){const c=contract();const pin=k=>pins[k]?q(pins[k]):'NULL::text';return `-- 088 STATIC SELECT-ONLY ${post?'POST-APPLY VERIFIER':'PREFLIGHT'}.
-- No business RPC, no rows created, no financial mutation. NOT a broad Finance reconciliation.
WITH captured AS MATERIALIZED(${snapshot()}), differences AS (
 SELECT key,(${diffs}) value FROM captured CROSS JOIN LATERAL (VALUES
 ('functions',${q(JSON.stringify(c.functions))}::jsonb,state->'functions'),
 ('tables',${q(JSON.stringify(c.tables))}::jsonb,state->'tables'),
 ('batch',${q(JSON.stringify(post?c.batch:{}))}::jsonb,state->'batch')) d(key,expected,actual)),
 checks AS (SELECT * FROM (VALUES
 ('owner',current_user='postgres'),
 ('contract_exact',(select bool_and(value='[]'::jsonb) from differences))
 ${post?`,('reviewed_baseline_bound',${pin('rows_sha256')} IS NOT NULL AND ${pin('preserved_sha256')} IS NOT NULL),
 ('historical_rows_unchanged',(SELECT ${hash("state->'rows'")}=${pin('rows_sha256')} FROM captured)),
 ('unrelated_contracts_unchanged',(SELECT ${hash("state->'preserved'")}=${pin('preserved_sha256')} FROM captured))`:''}
 ) c(name,pass))
 SELECT bool_and(coalesce(pass,false)) gate_pass,coalesce(jsonb_agg(name order by name COLLATE "C") FILTER(WHERE pass IS DISTINCT FROM true),'[]') failed_checks,
 ${q(sha(fs.readFileSync(candidate)))} candidate_sha256,
 (SELECT jsonb_object_agg(key,value) FROM differences) object_differences,
 (SELECT state->'rows' FROM captured) row_fingerprints,
 (SELECT ${hash("state->'rows'")} FROM captured) rows_sha256,
 (SELECT ${hash("state->'preserved'")} FROM captured) preserved_sha256,
 (SELECT bool_and(value='[]'::jsonb) FROM differences WHERE key IN ('functions','tables')) individual_contract_preserved,
 ${post?"(SELECT value='[]'::jsonb FROM differences WHERE key='batch')":"NULL::boolean"} batch_rpc_installed_exact,
 ${post?`(SELECT ${hash("state->'rows'")}=${pin('rows_sha256')} FROM captured)`:"NULL::boolean"} historical_rows_unchanged,
 ${post?`(SELECT ${hash("state->'preserved'")}=${pin('preserved_sha256')} FROM captured)`:"NULL::boolean"} unrelated_contracts_unchanged,
 false business_rpc_executed,false broader_finance_differences_accepted FROM checks;
`.replace(/[ \t]+$/gm,'');}
function write(){require('./finance-payable-bulk-reconcile.cjs').validate();fs.writeFileSync(candidate,candidateSql());fs.writeFileSync(preflight,gate());fs.writeFileSync(verifier,gate(true));}
function validate(){require('./finance-payable-bulk-reconcile.cjs').validate();for(const [p,h]of Object.entries(contract().immutableMigrationSha256||{}))assert.equal(sha(fs.readFileSync(p)),h,'Immutable migration changed: '+p);assert.equal(fs.readFileSync(candidate,'utf8'),candidateSql());assert.equal(fs.readFileSync(preflight,'utf8'),gate());assert.equal(fs.readFileSync(verifier,'utf8'),gate(true));return sha(fs.readFileSync(candidate));}
if(require.main===module){if(process.argv.includes('--write'))write();console.log(validate());}
module.exports={candidate,preflight,verifier,contractPath,baselinePath,body,snapshot,gate,write,validate,sha,hash,q,functions,tables,contract};
