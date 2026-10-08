/* eslint-disable @typescript-eslint/no-require-imports */
// Offline, deterministic Case-only artifacts. Never connects to Production.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const q = s => "'" + s.replaceAll("'", "''") + "'";
const j = x => q(JSON.stringify(x)) + '::jsonb';
const hash = s => createHash('sha256').update(s).digest('hex');
const before = JSON.parse(read('scripts/tests/fixtures/case-security-097-before.json'));
const names = Object.keys(before.tables).sort();
const candidate = 'supabase/migrations/202610080097_case_security_parity.sql';
const afterPath = 'scripts/tests/fixtures/case-security-097-after.json';
const reviewedPath = 'scripts/tests/fixtures/case-security-097-reviewed.json';
const extraFunctions = ['case097_session_ready()', 'case097_process_writer()', 'case097_soft_delete_guard()'];
const expectedBefore = { tables: before.tables, functions: before.functions };
const functions = Object.keys(before.functions);
const digest = s => `encode(sha256(convert_to((${s})::text,'UTF8')),'hex')`;
// PostgreSQL jsonb text: keys ordered by UTF-8 byte length then byte value.
// All contract values are strings/booleans/null/arrays/objects (no numeric rounding).
// Live and local SQL recompute every object hash; the full evidence stays in fixtures.
function pgJson(value) {
  if (Array.isArray(value)) return '[' + value.map(pgJson).join(', ') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort((a,b) => Buffer.byteLength(a)-Buffer.byteLength(b) || Buffer.compare(Buffer.from(a),Buffer.from(b))).map(k => JSON.stringify(k)+': '+pgJson(value[k])).join(', ') + '}';
  return JSON.stringify(value);
}
function pins(contract) {
  return Object.fromEntries(['tables','functions'].map(kind => [kind,Object.fromEntries(Object.entries(contract[kind]).map(([name,v]) => [name,hash(pgJson(v))]))]));
}
function fingerprint() {
  return `WITH raw AS (${footprint()}) SELECT jsonb_build_object(${['tables','functions'].map(kind => q(kind)+`,(SELECT coalesce(jsonb_object_agg(key,${digest('value')}),'{}') FROM jsonb_each(c->${q(kind)}))`).join(',')}) FROM raw r(c)`;
}
const tableCatalog = read('scripts/sql/case_security_097_catalog.sql').trim();
function footprint() {
  return `WITH rels AS (SELECT c.*,n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname=ANY(ARRAY[${names.map(q).join(',')}]) AND c.relkind='r')
 SELECT jsonb_build_object('tables',${tableCatalog},'functions',
 (SELECT coalesce(jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object(
 'signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
 'security_definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'definition',pg_get_functiondef(p.oid),
 'execute',(SELECT jsonb_object_agg(rr.rolname,has_function_privilege(rr.oid,p.oid,'EXECUTE')) FROM pg_roles rr WHERE rr.rolname IN ('anon','authenticated','service_role')),
 'acl',(SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)
 )),'{}') FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f'
 AND (p.oid::regprocedure::text=ANY(ARRAY[${functions.map(q).join(',')}]) OR p.proname LIKE 'case097_%')))`;
}
// Counts and opaque hashes only. No auth/profile rows or Finance data are captured.
// Audit is shared: only Case entries are fingerprinted, not unrelated audit history.
function rows() {
  return `SELECT jsonb_object_agg(name,jsonb_build_object('count',x.n::bigint,'sha256',x.h) ORDER BY name)
 FROM unnest(ARRAY[${names.map(q).join(',')}]) tab(name)
 CROSS JOIN LATERAL XMLTABLE('/table/row' PASSING query_to_xml(format(
 'SELECT count(*) n,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text COLLATE "C"),''[]''::jsonb)::text,''UTF8'')),''hex'') h FROM public.%I t %s',name,
 CASE WHEN name='case_audit_logs' THEN ${q('WHERE case_id IS NOT NULL OR table_name IN (' + names.map(q).join(',') + ')')} ELSE '' END),false,false,'') COLUMNS n text PATH 'n',h text PATH 'h') x`;
}
function baseline() { return { tables: expectedBefore.tables, functions: expectedBefore.functions }; }
function gate(post = false) {
  const expected = pins(post ? JSON.parse(read(afterPath)) : baseline());
  const reviewed = JSON.parse(read(reviewedPath));
  const checks = [
    `'contract_exact',catalog=expected`,
    `'profile_guard_columns',EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND column_name='must_change_password' AND data_type='boolean' AND is_nullable='NO')`,
    `'retired_tables_empty',(rows#>>'{case_fees,count}')::bigint=0 AND (rows#>>'{case_services,count}')::bigint=0`,
    ...(post ? [`'reviewed_baseline_bound',${j(reviewed)}->>'candidate_sha256'=${q(hash(read(candidate)))} AND ${j(reviewed)}->>'rows_sha256' IS NOT NULL`, `'rows_preserved',${digest('rows')}=(${j(reviewed)}->>'rows_sha256')`] : []),
  ];
  return `-- SELECT ONLY. No business RPC, DDL, DML, auth rows or Finance mutation.
 WITH accepted AS (SELECT ${j(expected)} expected), installed AS (${fingerprint()}), facts AS (${rows()}), evidence AS (SELECT expected,catalog,rows,jsonb_build_object(${checks.join(',\n')}) checks FROM installed c(catalog),facts r(rows),accepted)
 SELECT jsonb_build_object('gate_pass',NOT EXISTS(SELECT 1 FROM jsonb_each(checks) x WHERE x.value IS DISTINCT FROM 'true'::jsonb),
 'failed_checks',(SELECT coalesce(jsonb_agg(key ORDER BY key),'[]') FROM jsonb_each(checks) x WHERE x.value IS DISTINCT FROM 'true'::jsonb),
 'candidate_sha256',${q(hash(read(candidate)))},'checks',checks,'rows_sha256',${digest('rows')},'row_fingerprints',rows,
 'contract_sha256',${digest('catalog')},'object_differences',(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'name',name) ORDER BY kind,name),'[]') FROM (
 SELECT kind,name FROM (SELECT 'tables' kind,jsonb_object_keys((catalog->'tables')||(expected->'tables')) name UNION ALL SELECT 'functions',jsonb_object_keys((catalog->'functions')||(expected->'functions'))) k
 WHERE catalog#>ARRAY[kind,name] IS DISTINCT FROM expected#>ARRAY[kind,name]) differences),
 'production_mutation',false,'business_rpc_executed',false,'auth_tables_read',false,
 'captured_at',current_timestamp) AS case_security_097 FROM evidence;
`;
}
function migration() {
  return `-- 097: minimal Case permission parity. Human Apply only after reviewed preflight.
-- No business DML, history rewrite, counter allocation or Finance change.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
-- Lock only Case tables while catalog and row preservation are compared.
LOCK TABLE ${names.map(n => 'public.' + n).join(', ')} IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ DECLARE actual jsonb; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'CASE097_OWNER_REQUIRED'; END IF;
 ${fingerprint()} INTO actual;
 IF actual IS DISTINCT FROM ${j(pins(baseline()))} THEN RAISE EXCEPTION 'CASE097_CONTRACT_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND column_name='must_change_password' AND data_type='boolean' AND is_nullable='NO') THEN RAISE EXCEPTION 'CASE097_PROFILE_GUARD_MISSING'; END IF;
 IF EXISTS(SELECT 1 FROM public.case_fees) OR EXISTS(SELECT 1 FROM public.case_services) THEN RAISE EXCEPTION 'CASE097_RETIRED_TABLE_REVIEW_REQUIRED'; END IF;
END $guard$;
CREATE TEMP TABLE case097_before_rows ON COMMIT DROP AS ${rows()};
${read('scripts/sql/case_security_097_contract.sql')}
DO $preserve$ DECLARE old_rows jsonb; new_rows jsonb; BEGIN
 SELECT * INTO old_rows FROM case097_before_rows;
 ${rows()} INTO new_rows;
 IF new_rows IS DISTINCT FROM old_rows THEN RAISE EXCEPTION 'CASE097_HISTORY_CHANGED'; END IF;
END $preserve$;
COMMIT;
`;
}
function generate() {
  fs.writeFileSync(path.join(root, candidate), migration());
  fs.writeFileSync(path.join(root, 'scripts/sql/preflight_case_security_097.sql'), gate());
  if (fs.existsSync(path.join(root, afterPath))) fs.writeFileSync(path.join(root, 'scripts/sql/verify_case_security_097.sql'), gate(true));
}
module.exports = { root, read, q, j, hash, names, before, candidate, afterPath, reviewedPath, extraFunctions, baseline, footprint, rows, gate, migration, generate, pgJson, pins, fingerprint };
if (require.main === module) generate();
