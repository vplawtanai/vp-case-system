/* eslint-disable @typescript-eslint/no-require-imports */
// Emits deterministic artifacts for apply_patch, or validates them with --check.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const migrationPath = 'supabase/migrations/202607180038_add_immutable_document_logo_evidence.sql';
const migration = read(migrationPath);
const policyCapability = migration.split('-- BEGIN STORAGE POLICY CAPABILITY SELECT\n')[1].split('\n-- END STORAGE POLICY CAPABILITY SELECT')[0];
const previous = read('scripts/sql/verify_finance_receipt_foundation.sql');
const protectedSql = read('scripts/sql/verify_structured_wht_confirmed_payment_uat.sql').trim().replace(/;$/, '');
const catalogs = 'receipt_tables' + previous.split('), receipt_tables')[1].split('), expected_manifest as (')[0];
const expected = previous.split('-- BEGIN GENERATED MIGRATION 037 CATALOG MANIFEST\n')[1].split('\n-- END GENERATED MIGRATION 037 CATALOG MANIFEST')[0];
function functions(sql) {
  return [...sql.matchAll(/create (?:or replace )?function public\.(\w+)\([\s\S]*?\bas (\$[\w]*\$)([\s\S]*?)\2;/gi)]
    .map(m => ({name:m[1],definer:/security definer/i.test(m[0].split(m[2])[0]),hash:crypto.createHash('md5').update(m[3]).digest('hex')}));
}
const functionValues = functions(migration).map(f => `('${f.name}','${f.hash}',${f.definer})`).join(',\n    ');
function sql(post) {
  return `-- Phase 6A.1 ${post ? 'post-apply verification' : 'preflight'}: ONE SELECT-only statement / ONE row.
-- Run manually, with SQL Editor read access. No Storage API or lifecycle RPC calls.
-- Storage catalog presence cannot prove bytes are downloadable; synthetic API-path
-- tests plus human Preview after deployment complete that operational check.
-- Protected WHT assertions are retained except obsolete Receipt-table absence.
with protected_wht as (
${protectedSql}
), ${catalogs}
), expected_manifest as (
  select * from jsonb_to_recordset(
${expected}
  ) as x(kind text,name text,definition jsonb)
), logo_functions(name,source_md5,security_definer) as (values
    ${functionValues}
), storage_policy_capability as (
${policyCapability}
), storage_access as (
  select current_user as sql_editor_role,
    (select pg_get_userbyid(relowner) from pg_class where oid='storage.objects'::regclass) as storage_objects_owner,
    has_table_privilege(current_user,'storage.objects','TRIGGER') as storage_trigger_privilege_observed_only,
    (select pg_has_role(current_user,relowner,'USAGE') from pg_class where oid='storage.objects'::regclass) as storage_owner_membership_observed_only,
    (select nullif(setting,'')::jsonb->current_user from pg_settings where name='supautils.policy_grants'
      and context in ('sighup','postmaster','superuser')) as platform_policy_grants_for_current_role,
    (select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
      'roles',p.polroles,'using',pg_get_expr(p.polqual,p.polrelid),'with_check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname),'[]'::jsonb)
      from pg_policy p where p.polrelid='storage.objects'::regclass) as existing_storage_policies,
    (select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.tgname),'[]'::jsonb)::text)
      from pg_trigger t where t.tgrelid='storage.objects'::regclass) as managed_storage_trigger_fingerprint
), current_logo as (
  select p.logo_storage_path, o.id as object_id, to_jsonb(o)->>'version' as storage_version,
    o.metadata, b.public as bucket_public,
    (p.logo_storage_path ~ '^company/logo/[^/]+$' and p.logo_storage_path not like '%..%'
      and lower(coalesce(o.metadata->>'mimetype','')) in ('image/png','image/jpeg','image/webp','image/svg+xml')) as valid_reference
  from public.finance_company_profiles p
  left join storage.objects o on o.bucket_id='vp-document-assets' and o.name=p.logo_storage_path
  left join storage.buckets b on b.id='vp-document-assets'
  where p.id='default'
), target_receipt as (
  select * from public.finance_receipts where id='a76cd43d-fe52-4008-ade1-f1d79a9f27bf'::uuid
), facts as (
  select
    (select count(*) from public.finance_receipts) as receipt_rows,
    (select count(*) from public.finance_receipt_audit_events) as receipt_audit_rows,
    (select count(*) from public.finance_receipt_invoice_allocations) as receipt_allocation_rows,
    (select count(*) from public.finance_document_counters where doc_type='receipt') as receipt_counter_rows,
    (select count(*) from public.finance_receipts where receipt_no is not null or status in ('issued','voided')) as numbered_receipt_rows,
    (select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from target_receipt r) as target_receipt,
    (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb)::text) from public.finance_receipts r) as receipt_rows_fingerprint,
    (select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)::text) from public.finance_receipt_audit_events a) as receipt_audit_fingerprint,
    (select count(*) from public.finance_cash_transactions) as cash_rows_observed,
    (select count(*) from public.finance_account_opening_balances) as opening_rows_observed,
    (select count(*) from public.finance_payments) as payment_rows_observed
), checks as (
  select
    not exists(select 1 from jsonb_each(w.checks - 'receipt_tax_invoice_absence_established_by_catalog') c
      where c.value is distinct from 'true'::jsonb) as protected_payment_invoice_unchanged,
    not exists(select 1 from expected_manifest e
      where ${post ? "e.name <> 'build_finance_receipt_source(uuid)' and" : ''} not exists(select 1 from actual_manifest a
        where a.kind=e.kind and a.name=e.name and a.definition=e.definition)) as receipt_037_contract_retained,
    (select count(*)=1 and coalesce(bool_and(valid_reference and object_id is not null and bucket_public=false),false) from current_logo) as current_logo_catalog_reference_valid,
    (select count(*)=1 and coalesce(bool_and(status='draft' and receipt_no is null and issued_at is null
      and payment_id='9e2f601e-13ef-4165-8e2c-1887c3ad8861'::uuid
      and cash_amount=4859.81 and wht_amount=140.19 and settlement_amount=5000
      and draft_snapshot_json->'schema_version'='1'::jsonb and issued_snapshot_json is null),false) from target_receipt) as target_legacy_draft_unissued_and_not_refreshed,
    f.receipt_counter_rows=0 and f.numbered_receipt_rows=0 and f.receipt_allocation_rows=0 as no_receipt_issue_or_number_consumption,
    not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname ~ '^finance_.*tax_invoice') as tax_invoice_absent,
    exists(select 1 from pg_class where oid='storage.objects'::regclass and relrowsecurity) as storage_rls_enabled,
    exists(select 1 from pg_index i where i.indrelid='storage.objects'::regclass and i.indisunique and i.indisvalid
      and i.indpred is null and (select array_agg(a.attname::text order by k.n) from unnest(i.indkey::smallint[]) with ordinality k(attnum,n)
      join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum)=array['bucket_id','name']) as storage_path_uniqueness,
    (select can_manage_storage_policies from storage_policy_capability) as sql_editor_can_manage_storage_policies,
    has_table_privilege(current_user,'storage.objects','SELECT') as sql_editor_can_read_logo_catalog,
    not exists(select 1 from pg_roles r cross join pg_class c
      where r.rolname in ('anon','authenticated') and c.oid='storage.objects'::regclass
        and (r.rolsuper or r.rolbypassrls or pg_has_role(r.oid,c.relowner,'USAGE'))) as browser_roles_subject_to_storage_rls,
    not exists(select 1 from pg_trigger where tgrelid='storage.objects'::regclass
      and tgname in ('document_logo_object_immutability','document_logo_truncate_guard'))
      and to_regprocedure('public.protect_document_logo_object()') is null
      and to_regprocedure('public.protect_document_logo_truncate()') is null as no_038_managed_storage_triggers,
    not exists(select 1 from (values ('finance_receipts'),('finance_receipt_audit_events'),('finance_receipt_invoice_allocations')) t(name)
      cross join (values ('anon'),('authenticated')) r(role)
      where has_table_privilege(r.role,'public.'||t.name,'INSERT,UPDATE,DELETE')) as receipt_browser_writes_blocked,
    ${post ? `not exists(select 1 from logo_functions f where not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=f.name and md5(p.prosrc)=f.source_md5 and p.prosecdef=f.security_definer
      and p.proconfig=array['search_path=public'] and not has_function_privilege('anon',p.oid,'EXECUTE')
      and not has_function_privilege('authenticated',p.oid,'EXECUTE'))) as exact_038_functions_and_private_grants,
    exists(select 1 from pg_trigger where tgrelid='public.finance_receipts'::regclass and tgname='receipt_logo_issue_guard'
      and tgenabled='O' and tgtype=19 and tgfoid='public.guard_receipt_logo_issue()'::regprocedure) as mandatory_new_issue_evidence_guard,
    (select count(*)=2 and bool_and(not polpermissive and polroles=array[0::oid]
      and pg_get_expr(polqual,polrelid) = $$(NOT ((bucket_id = 'vp-document-assets'::text) AND (name ~~ 'company/logo/%'::text)))$$
      and ((polname='document_logos_no_delete' and polcmd='d' and polwithcheck is null)
        or (polname='document_logos_no_update' and polcmd='w' and pg_get_expr(polwithcheck,polrelid)=pg_get_expr(polqual,polrelid))))
      from pg_policy where polrelid='storage.objects'::regclass and polname in ('document_logos_no_update','document_logos_no_delete')) as storage_api_overwrite_delete_blocked,
    exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='receipt_document_logos_read'
      and polpermissive and polcmd='r' and polroles=array['authenticated'::regrole::oid]
      and pg_get_expr(polqual,polrelid) = $$((bucket_id = 'vp-document-assets'::text) AND (name ~~ 'company/logo/%'::text) AND current_user_can_view_finance_receipts())$$) as receipt_viewers_can_read_logo`
      : `not exists(select 1 from logo_functions f join pg_proc p on p.proname=f.name join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and f.name<>'build_finance_receipt_source')
      and not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass
        and polname in ('document_logos_no_update','document_logos_no_delete','receipt_document_logos_read'))
      and not exists(select 1 from pg_trigger where tgname in ('document_logo_object_immutability','document_logo_truncate_guard','receipt_logo_issue_guard')) as migration_038_not_installed`}
  from facts f cross join protected_wht w
)
select ${post ? "'post-apply'" : "'preflight'"} as phase,
  (select to_jsonb(a) from storage_access a) as storage_policy_installation_and_audit,
  (select jsonb_agg(to_jsonb(l)) from current_logo l) as current_logo,
  to_jsonb(f) as receipt_and_financial_observability, w.payment, w.authoritative_settlement,
  w.legacy_observability, to_jsonb(ch) as checks,
  coalesce((select jsonb_agg(c.key order by c.key) from jsonb_each(to_jsonb(ch)) c where c.value is distinct from 'true'::jsonb),'[]'::jsonb) as failed_checks,
  not exists(select 1 from jsonb_each(to_jsonb(ch)) c where c.value is distinct from 'true'::jsonb)
    as document_logo_immutability_${post ? 'verification' : 'preflight'}_pass
from facts f cross join protected_wht w cross join checks ch;
`;
}
function artifacts() {
  const preflight = sql(false), verifier = sql(true);
  return {
    'scripts/sql/preflight_document_logo_immutability.sql': preflight,
    'scripts/sql/verify_document_logo_immutability.sql': verifier,
    'scripts/sql/dry_run_document_logo_immutability.sql': `BEGIN;\n-- Manual rollback-only schema rehearsal; no Receipt/Payment operations.\n-- BEGIN EMBEDDED MIGRATION 038 (byte-for-byte)\n${migration}-- END EMBEDDED MIGRATION 038\n-- BEGIN EMBEDDED LOGO VERIFIER (byte-for-byte)\n${verifier}-- END EMBEDDED LOGO VERIFIER\nROLLBACK;\n`,
  };
}
if (require.main === module) {
  if (process.argv.includes('--check')) {
    for (const [p, content] of Object.entries(artifacts())) assert.equal(read(p),content,`${p} is stale`);
    console.log('PASS exact generated preflight / verifier / rollback-only dry-run');
  } else console.log(JSON.stringify(artifacts()));
}
module.exports = {artifacts};
