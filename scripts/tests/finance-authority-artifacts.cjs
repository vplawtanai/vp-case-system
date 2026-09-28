/* eslint-disable @typescript-eslint/no-require-imports */
// Offline only. No credentials, URLs, connections, or Production execution mode.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const B=require('./fixtures/finance-authority-before.json'),M=require('./finance-authority-migration.cjs');
const {fingerprint}=require('./direct-money-documents-dry-run.cjs');
const {functionsSql,catalogSql}=require('./direct-money-documents-artifacts.cjs');
const candidate='supabase/migrations/202607180078_finance_go_live_permission_authority_contract.sql';
const preflight='scripts/sql/preflight_finance_permission_authority_078.sql';
const verifier='scripts/sql/verify_finance_permission_authority_078.sql';
const contractPath='scripts/tests/fixtures/finance-authority-after.json';
// Exact HUMAN-REVIEWED Production Preflight values, supplied after Gate 1 PASS.
// These are not computed from the local PostgreSQL fixture. Component evidence
// remains in the gate output; broader Finance differences are not accepted.
const reviewedPreflight=Object.freeze({
 candidate_sha256:'b54d1eb36bba029289eaaea226fa5ab57a5e42710114893ed38d80867e00bc7c',
 rows_sha256:'751daa38ea6138c64943910d142cfd6955cf6fb62caa1f515ea3e3d219d3ecc1',
 preserved_sha256:'86815007700473fe68ed04d66bb3d0d44730a56c87995fa0a3bb26ed215c6d1f',
});
const sha=s=>createHash('sha256').update(s).digest('hex'),q=s=>"'"+s.replaceAll("'","''")+"'";
const body=()=>fs.readFileSync(__dirname+'/finance-authority-body.sql','utf8');
const changed=[...new Set([...Object.keys(M.helpers),...M.changes.map(x=>x.name),...body().matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)/g)].map(x=>typeof x==='string'?x:x[1]))].sort();
const added=[...body().matchAll(/CREATE FUNCTION public\.(\w+)/g)].map(x=>x[1]).sort();
const beforeHashes=Object.fromEntries(B.functions.map(f=>[f.signature,fingerprint(f)]));
const securityHashes=Object.fromEntries(Object.entries(B.security).map(([n,v])=>[n,fingerprint(v)]));
const hash=s=>`encode(sha256(convert_to((${s})::text,'UTF8')),'hex')`;
const functionEvidence=functionsSql.replace('order by p.oid::regprocedure::text','order by p.oid::regprocedure::text COLLATE "C"');
const functionHashes=names=>`select coalesce(jsonb_object_agg(v->>'signature',${hash('v')}),'{}') from (${functionEvidence} and p.proname in (${names.map(q)})) f,jsonb_array_elements(f.value) x(v)`;
const securitySql=`select jsonb_object_agg(c.relname,${hash(`jsonb_build_object('owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by p.policyname COLLATE "C"),'[]') from pg_policies p where p.schemaname='public' and p.tablename=c.relname))`)})
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in (${Object.keys(B.security).map(q)})`;
const authoritySql=`select value->0 from (${catalogSql.replace(/order by (conname|indexname|policyname|tgname|c.relname)\b/g,'order by $1 COLLATE "C"').replace('where conrelid=c.oid',"where conrelid=c.oid and contype<>'n'")} and c.relname='finance_treasury_account_authorities') catalog`;
const additionsSql=`select jsonb_build_object(
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by schemaname COLLATE "C",tablename COLLATE "C",policyname COLLATE "C"),'[]') from pg_policies p where schemaname in ('public','storage') and left(policyname,11)='finance078_'),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(t.oid)) order by tgrelid::regclass::text COLLATE "C",tgname COLLATE "C"),'[]') from pg_trigger t where not tgisinternal and left(tgname,11)='finance078_'))`;
const emptyAdditions={policies:[],triggers:[]};
// Dynamic identifiers come exclusively from pg_class and are %I-quoted. Every
// generated statement is SELECT, with deterministic C-order row fingerprints.
const rowsSql=`select coalesce(jsonb_object_agg(name,jsonb_build_object('count',(xpath('/row/n/text()',x))[1]::text::bigint,'sha256',(xpath('/row/h/text()',x))[1]::text)),'{}') from (
 select c.relname name,query_to_xml(format('select count(*) n,encode(sha256(convert_to(coalesce(string_agg((%s)::text,E''\\n'' order by (%s)::text COLLATE "C"),''''),''UTF8'')),''hex'') h from public.%I t',
 case when c.relname='user_profiles' then 'to_jsonb(t)-''finance_operator''' else 'to_jsonb(t)' end,
 case when c.relname='user_profiles' then 'to_jsonb(t)-''finance_operator''' else 'to_jsonb(t)' end,c.relname),true,true,'') x
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') and (c.relname like 'finance\\_%' escape '\\' or c.relname in ('user_profiles','case_audit_logs','document_numbering_profiles'))) captured`;
// Broad catalog is fingerprinted for preservation only, never accepted as a
// canonical reconciliation. The 490 differences stay explicitly OUT of acceptance.
const preservedSql=`select jsonb_build_object('functions',(select coalesce(jsonb_object_agg(v->>'signature',${hash('v')}),'{}') from (${functionEvidence} and p.proname not in (${[...changed,...added].map(q)})) f,jsonb_array_elements(f.value) x(v)),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by schemaname COLLATE "C",tablename COLLATE "C",policyname COLLATE "C"),'[]') from pg_policies p where schemaname in ('public','storage') and policyname not like 'finance078\\_%' escape '\\'),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(t.oid)) order by tgrelid::regclass::text COLLATE "C",tgname COLLATE "C"),'[]') from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace in ('public'::regnamespace,'storage'::regnamespace) and not t.tgisinternal and t.tgname not like 'finance078\\_%' escape '\\'),
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'acl',a.attacl::text) order by c.relname COLLATE "C",a.attnum),'[]') from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v') and a.attnum>0 and not a.attisdropped and not(c.relname='user_profiles' and a.attname='finance_operator')),
 'relations',(select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,'options',c.reloptions) order by c.relname COLLATE "C"),'[]') from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v')),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid),'validated',c.convalidated) order by c.conrelid::regclass::text COLLATE "C",c.conname COLLATE "C"),'[]') from pg_constraint c where c.connamespace='public'::regnamespace and not(c.conrelid='public.user_profiles'::regclass and c.contype='n' and exists(select 1 from pg_attribute a where a.attrelid='public.user_profiles'::regclass and a.attname='finance_operator' and not a.attisdropped and c.conkey=ARRAY[a.attnum]::smallint[]))),
 'indexes',(select coalesce(jsonb_agg(to_jsonb(i) order by schemaname COLLATE "C",tablename COLLATE "C",indexname COLLATE "C"),'[]') from pg_indexes i where schemaname='public'),
 'views',(select coalesce(jsonb_object_agg(c.relname,pg_get_viewdef(c.oid,true)),'{}') from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v'))`;
function snapshot(){return `select jsonb_build_object('rows',(${rowsSql}),'preserved',(${preservedSql}),'functions',(${functionHashes([...new Set([...B.functions.map(f=>f.name),...changed,...added])])}),'security',(${securitySql}),'authority',(${authoritySql}),'additions',(${additionsSql})) state`;}
function candidateSql(){
 M.buildDefinitions(B.functions); // Validate every fixed anchor independently.
 const full=`CREATE FUNCTION pg_temp.finance078_patch(p_signature text,p_from text,p_to text,p_count integer) RETURNS void LANGUAGE plpgsql AS $patch$
+DECLARE definition text; BEGIN
+ SELECT pg_get_functiondef(to_regprocedure('public.'||p_signature)) INTO definition;
+ IF definition IS NULL OR (length(definition)-length(replace(definition,p_from,'')))/length(p_from)<>p_count THEN RAISE EXCEPTION 'FINANCE078_PATCH_CONTRACT_MISMATCH: %',p_signature; END IF;
+ EXECUTE replace(definition,p_from,p_to);
+END; $patch$;
+${M.patches(B.functions).map(p=>`SELECT pg_temp.finance078_patch(${q(p.signature)},${q(p.from)},${q(p.to)},${p.count});`).join('\n')}`.replace(/^\+/gm,'');
 return `-- 078 candidate. LOCAL VALIDATION / HUMAN MIGRATION GATE. No financial DML.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
DO $locks$ DECLARE r record; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'FINANCE078_OWNER_REQUIRED'; END IF;
 FOR r IN SELECT c.oid::regclass rel FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind in ('r','p') ORDER BY c.oid LOOP EXECUTE format('LOCK TABLE %s IN SHARE MODE',r.rel); END LOOP;
END; $locks$;
CREATE TEMP TABLE finance078_before ON COMMIT DROP AS ${snapshot()};
DO $baseline$ DECLARE s jsonb; BEGIN
 SELECT state INTO s FROM finance078_before;
 IF s->'functions' IS DISTINCT FROM ${q(JSON.stringify(beforeHashes))}::jsonb THEN RAISE EXCEPTION 'FINANCE078_BASELINE_MISMATCH: functions'; END IF;
 IF s->'security' IS DISTINCT FROM ${q(JSON.stringify(securityHashes))}::jsonb THEN RAISE EXCEPTION 'FINANCE078_BASELINE_MISMATCH: security'; END IF;
 IF s->'authority' IS DISTINCT FROM ${q(JSON.stringify(B.authorityCatalog))}::jsonb THEN RAISE EXCEPTION 'FINANCE078_BASELINE_MISMATCH: account_authority_catalog'; END IF;
 IF s->'additions' IS DISTINCT FROM ${q(JSON.stringify(emptyAdditions))}::jsonb THEN RAISE EXCEPTION 'FINANCE078_ALREADY_PRESENT'; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.user_profiles'::regclass AND attname='finance_operator' AND NOT attisdropped) THEN RAISE EXCEPTION 'FINANCE078_ALREADY_PRESENT'; END IF;
END; $baseline$;
-- BEGIN 078 AUTHORITY CONTRACT
${body()}
${full}
-- New helpers are private unless required by an explicit RPC/RLS contract.
DO $security$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature,p.proname FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN (${added.map(q)}) LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f.signature);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public,anon,authenticated,service_role',f.signature);
  IF f.proname IN (${added.filter(n=>n.startsWith('get_')||['finance078_admin','finance078_active','finance078_partner','finance078_operator','finance078_operations','finance078_self_service','finance078_distribution_allowed','finance078_distribution_id_allowed'].includes(n)).map(q)}) THEN
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
  END IF;
 END LOOP;
END; $security$;
GRANT EXECUTE ON FUNCTION public.expense_account_allowed(uuid,uuid,text) TO authenticated;
-- END 078 AUTHORITY CONTRACT
DO $preservation$ DECLARE b jsonb; a jsonb; BEGIN
 SELECT state INTO b FROM finance078_before;
 ${snapshot()} INTO a;
 IF b->'rows' IS DISTINCT FROM a->'rows' OR b->'preserved' IS DISTINCT FROM a->'preserved' THEN RAISE EXCEPTION 'FINANCE078_PRESERVATION_FAILED: rows=%, contracts=%', b->'rows' IS NOT DISTINCT FROM a->'rows',(SELECT jsonb_agg(key ORDER BY key COLLATE "C") FROM jsonb_each(b->'preserved') x WHERE x.value IS DISTINCT FROM a#>ARRAY['preserved',x.key]); END IF;
 IF EXISTS(SELECT 1 FROM public.user_profiles WHERE finance_operator) THEN RAISE EXCEPTION 'FINANCE078_UNEXPECTED_ASSIGNMENT'; END IF;
END; $preservation$;
COMMIT;
`;}
const diffs=`select coalesce(jsonb_agg(jsonb_build_object('object',coalesce(e.key,a.key),'expected',e.value,'actual',a.value) order by coalesce(e.key,a.key) COLLATE "C"),'[]') from jsonb_each(expected) e full join jsonb_each(actual) a using(key) where e.value is distinct from a.value`;
function readGate(post=false,pins=reviewedPreflight){
 if(post){
  assert.equal(sha(fs.readFileSync(candidate)),reviewedPreflight.candidate_sha256,'Reviewed 078 candidate changed');
  for(const key of ['rows_sha256','preserved_sha256'])if(pins[key]!==undefined)assert.match(pins[key],/^[a-f0-9]{64}$/,'Invalid '+key);
 }
 const c=post?JSON.parse(fs.readFileSync(contractPath)):null;
 const literal=k=>pins[k]?q(pins[k]):'NULL::text';
 const expected=post?c.functions:beforeHashes;
 return `-- 078 STATIC SELECT-ONLY ${post?'POST-APPLY VERIFIER':'PREFLIGHT'}. No mutable RPC invoked.
-- Broader unresolved Finance differences are NOT accepted by this scoped gate.
WITH captured AS MATERIALIZED(${snapshot()}), function_diff AS (
 SELECT (${diffs}) value FROM (SELECT ${q(JSON.stringify(expected))}::jsonb expected,state->'functions' actual FROM captured) s),
 security_diff AS (SELECT (${diffs}) value FROM (SELECT ${q(JSON.stringify(post?c.security:securityHashes))}::jsonb expected,state->'security' actual FROM captured) s),
 checks AS (SELECT * FROM (VALUES
 ('owner',current_user='postgres'),
 ('functions_exact',(SELECT value='[]'::jsonb FROM function_diff)),
 ('security_exact',(SELECT value='[]'::jsonb FROM security_diff)),
 ('account_authority_catalog_exact',(SELECT state->'authority'=${q(JSON.stringify(B.authorityCatalog))}::jsonb FROM captured)),
 ('added_policies_triggers_exact',(SELECT state->'additions'=${q(JSON.stringify(post?c.additions:emptyAdditions))}::jsonb FROM captured)),
 ('finance_operator_column',${post?"(select count(*)=1 and bool_and(a.atttypid='boolean'::regtype AND a.attnotnull AND pg_get_expr(d.adbin,d.adrelid)='false') from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='public.user_profiles'::regclass and a.attname='finance_operator' and not a.attisdropped)":"NOT EXISTS(select 1 from pg_attribute where attrelid='public.user_profiles'::regclass and attname='finance_operator' and not attisdropped)"}),
 ('authority_references_valid',NOT EXISTS(SELECT 1 FROM public.finance_treasury_account_authorities a LEFT JOIN public.user_profiles u ON u.id=a.user_id LEFT JOIN public.finance_bank_accounts b ON b.id=a.bank_account_id LEFT JOIN public.finance_cash_locations c ON c.id=a.cash_location_id WHERE u.id IS NULL OR num_nonnulls(a.bank_account_id,a.cash_location_id)<>1 OR (a.bank_account_id IS NOT NULL AND b.id IS NULL) OR (a.cash_location_id IS NOT NULL AND c.id IS NULL) OR (a.confirm_outflow AND NOT a.record_outflow))),
 ('entitlement_references_valid',NOT EXISTS(SELECT 1 FROM public.finance_payable_entitlements e LEFT JOIN public.finance_vp_revenue_distributions d ON d.id=e.distribution_id LEFT JOIN public.user_profiles u ON u.id=e.recipient_id WHERE d.id IS NULL OR(e.recipient_type='user' AND u.id IS NULL)))
${post?` ,('no_assignment_backfill',NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE finance_operator)),
 ('reviewed_baseline_bound',${literal('rows_sha256')} IS NOT NULL AND ${literal('preserved_sha256')} IS NOT NULL),
 ('historical_rows_unchanged',(SELECT ${hash("state->'rows'")}=${literal('rows_sha256')} FROM captured)),
 ('protected_contracts_unchanged',(SELECT ${hash("state->'preserved'")}=${literal('preserved_sha256')} FROM captured))`:''}
 ) c(name,pass))
 SELECT bool_and(coalesce(pass,false)) gate_pass,coalesce(jsonb_agg(name order by name COLLATE "C") FILTER(WHERE pass IS DISTINCT FROM true),'[]') failed_checks,
 ${q(sha(fs.readFileSync(candidate)))} candidate_sha256,
 (SELECT value FROM function_diff) function_differences,(SELECT value FROM security_diff) security_differences,
 (SELECT state->'rows' FROM captured) historical_rows,
 (SELECT ${hash("state->'rows'")} FROM captured) rows_sha256,
 (SELECT ${hash("state->'preserved'")} FROM captured) preserved_sha256,
 ${post?`(SELECT ${hash("state->'rows'")}=${literal('rows_sha256')} FROM captured)`:'NULL::boolean'} historical_rows_unchanged,
 false broader_finance_differences_accepted FROM checks;
`;}
function write(){fs.writeFileSync(candidate,candidateSql());fs.writeFileSync(preflight,readGate());if(fs.existsSync(contractPath))fs.writeFileSync(verifier,readGate(true));}
function validate(){for(const[p,h]of Object.entries(B.priorMigrationHashes))assert.equal(sha(fs.readFileSync(p)),h,'Applied migration changed: '+p);assert.equal(fs.readFileSync(candidate,'utf8'),candidateSql());assert.equal(fs.readFileSync(preflight,'utf8'),readGate());if(fs.existsSync(contractPath))assert.equal(fs.readFileSync(verifier,'utf8'),readGate(true));return sha(fs.readFileSync(candidate));}
if(require.main===module){if(process.argv.includes('--write'))write();console.log('078 artifacts valid; candidate SHA-256: '+validate());}
module.exports={candidate,preflight,verifier,contractPath,reviewedPreflight,changed,added,body,sha,q,hash,snapshot,authoritySql,additionsSql,rowsSql,preservedSql,functionEvidence,functionHashes,securitySql,candidateSql,readGate,write,validate,B};
