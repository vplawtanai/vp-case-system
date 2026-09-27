-- Phase 8C / 076: FUNCTIONS baseline mismatch diagnostic. HUMAN GATE ONLY.
-- One SELECT statement; catalog reads only. No business rows, locks, DDL or function execution.
-- Function definitions below are inert JSON evidence, NOT executable SQL.
-- Expected capture: 2026-09-27T10:30:22.906424+00:00
-- Source: scripts/tests/fixtures/non-litigation-076-approved-contract.json
-- Candidate file SHA-256 (offline verified; not a claim about Production): fc25a378f675e07c72c67d45d1f1be6aee79b42f1b9b67b99080ec8a0002cae4
-- Uses the candidate's EXACT discovery, pg_get_functiondef, ACL and effective-EXECUTE evidence.
-- Guard normalization: jsonb text; functions ordered by evidence->>'signature' using session collation.
-- Expected array order is preserved from the migration builder. No whitespace/ACL normalization is added.
-- The additional COLLATE C comparison diagnoses ordering only; it does NOT replace/pass the guard.
-- Finance-named profile trigger helpers appear ONLY because the existing 076 baseline already includes them.
-- Does not inspect broader Finance/Case catalogs or accept the 490 unresolved differences.
WITH RECURSIVE
pins AS (SELECT
 'fc25a378f675e07c72c67d45d1f1be6aee79b42f1b9b67b99080ec8a0002cae4'::text candidate_sha256,
 'dffbc07fcd28887910eebe96323cc1b21e756aa71fad061f28b8d454dbdf4372'::text expected_functions_sha256),
expected_document AS (SELECT $expected076$[{"acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","owner":"postgres","result":"boolean","arguments":"","proconfig":["search_path=public"],"signature":"admin074_session_allowed()","definition":"CREATE OR REPLACE FUNCTION public.admin074_session_allowed()\n RETURNS boolean\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\n select not exists(select 1 from public.user_profiles where id=auth.uid() and role='admin' and active is not true);\n$function$\n","volatility":"s","security_definer":true,"effective_execute":{"anon":false,"service_role":true,"authenticated":true}},{"acl":"{=X/supabase_auth_admin,postgres=X/supabase_auth_admin,supabase_auth_admin=X/supabase_auth_admin,dashboard_user=X/supabase_auth_admin}","owner":"supabase_auth_admin","result":"jsonb","arguments":"","proconfig":null,"signature":"auth.jwt()","definition":"CREATE OR REPLACE FUNCTION auth.jwt()\n RETURNS jsonb\n LANGUAGE sql\n STABLE\nAS $function$\n  select \n    coalesce(\n        nullif(current_setting('request.jwt.claim', true), ''),\n        nullif(current_setting('request.jwt.claims', true), '')\n    )::jsonb\n$function$\n","volatility":"s","security_definer":false,"effective_execute":{"anon":true,"service_role":true,"authenticated":true}},{"acl":"{=X/supabase_auth_admin,supabase_auth_admin=X/supabase_auth_admin,dashboard_user=X/supabase_auth_admin}","owner":"supabase_auth_admin","result":"uuid","arguments":"","proconfig":null,"signature":"auth.uid()","definition":"CREATE OR REPLACE FUNCTION auth.uid()\n RETURNS uuid\n LANGUAGE sql\n STABLE\nAS $function$\n  select \n  coalesce(\n    nullif(current_setting('request.jwt.claim.sub', true), ''),\n    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')\n  )::uuid\n$function$\n","volatility":"s","security_definer":false,"effective_execute":{"anon":true,"service_role":true,"authenticated":true}},{"acl":"{postgres=X/postgres,authenticated=X/postgres}","owner":"postgres","result":"boolean","arguments":"","proconfig":["search_path=public"],"signature":"can_create_advisory_matter()","definition":"CREATE OR REPLACE FUNCTION public.can_create_advisory_matter()\n RETURNS boolean\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\n  select exists (\n    select 1 from public.user_profiles up\n    where up.id = auth.uid() and up.active = true\n      and up.role in ('admin', 'partner', 'lawyer', 'assistant_lawyer')\n  );\n$function$\n","volatility":"s","security_definer":true,"effective_execute":{"anon":false,"service_role":false,"authenticated":true}},{"acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}","owner":"postgres","result":"boolean","arguments":"","proconfig":["search_path=public"],"signature":"can_view_audit_logs()","definition":"CREATE OR REPLACE FUNCTION public.can_view_audit_logs()\n RETURNS boolean\n LANGUAGE sql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\n  select exists (\n    select 1\n    from public.user_profiles up\n    where up.id = auth.uid()\n      and up.active = true\n      and up.role in ('admin', 'partner', 'lawyer')\n  );\n$function$\n","volatility":"v","security_definer":true,"effective_execute":{"anon":true,"service_role":true,"authenticated":true}},{"acl":"{postgres=X/postgres,authenticated=X/postgres}","owner":"postgres","result":"jsonb","arguments":"p_client_id uuid, p_title text, p_matter_type text, p_retainer_type text, p_status text, p_responsible_lawyer text, p_start_date date, p_end_date date, p_monthly_retainer_amount numeric, p_scope_of_work text, p_note text","proconfig":["search_path=public"],"signature":"create_advisory_matter_with_number(uuid,text,text,text,text,text,date,date,numeric,text,text)","definition":"CREATE OR REPLACE FUNCTION public.create_advisory_matter_with_number(p_client_id uuid, p_title text, p_matter_type text, p_retainer_type text, p_status text, p_responsible_lawyer text, p_start_date date, p_end_date date, p_monthly_retainer_amount numeric, p_scope_of_work text, p_note text)\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\ndeclare\n  created_matter public.advisory_matters%rowtype;\nbegin\n  if auth.uid() is null or public.can_create_advisory_matter() is distinct from true then\n    raise exception 'ADVISORY_CREATE_PERMISSION_DENIED' using errcode = '42501';\n  end if;\n  -- Existing form's required fields. Retainer visibility/edit logic stays in its\n  -- existing workflow; this RPC neither adds Finance privileges nor changes it.\n  if p_client_id is null or nullif(btrim(p_title), '') is null\n    or nullif(btrim(p_matter_type), '') is null then\n    raise exception 'ADVISORY_REQUIRED_FIELDS_MISSING' using errcode = '22023';\n  end if;\n  insert into public.advisory_matters (\n    client_id, matter_no, title, matter_type, retainer_type, status,\n    responsible_lawyer, start_date, end_date, monthly_retainer_amount,\n    scope_of_work, note\n  ) values (\n    p_client_id, public.generate_advisory_matter_no(), p_title, p_matter_type,\n    p_retainer_type, p_status, p_responsible_lawyer, p_start_date, p_end_date,\n    p_monthly_retainer_amount, p_scope_of_work, p_note\n  ) returning * into created_matter;\n  return to_jsonb(created_matter);\nend;\n$function$\n","volatility":"v","security_definer":true,"effective_execute":{"anon":false,"service_role":false,"authenticated":true}},{"acl":"{postgres=X/postgres}","owner":"postgres","result":"text","arguments":"","proconfig":["search_path=public"],"signature":"generate_advisory_matter_no()","definition":"CREATE OR REPLACE FUNCTION public.generate_advisory_matter_no()\n RETURNS text\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\ndeclare\n  current_year integer;\n  next_number integer;\nbegin\n  if auth.uid() is null or public.can_create_advisory_matter() is distinct from true then\n    raise exception 'ADVISORY_CREATE_PERMISSION_DENIED' using errcode = '42501';\n  end if;\n  current_year := extract(year from now())::integer;\n  insert into public.advisory_matter_counters\n    (year, last_number, updated_at)\n  values\n    (current_year, 1, now())\n  on conflict (year)\n  do update\n    set last_number =\n      public.advisory_matter_counters.last_number + 1,\n      updated_at = now()\n  returning last_number into next_number;\n  return\n    'ADV-' ||\n    current_year::text ||\n    '-' ||\n    lpad(next_number::text, 3, '0');\nend;\n$function$\n","volatility":"v","security_definer":true,"effective_execute":{"anon":false,"service_role":false,"authenticated":false}},{"acl":"{postgres=X/postgres,service_role=X/postgres}","owner":"postgres","result":"trigger","arguments":"","proconfig":["search_path=public"],"signature":"payout_profile_delete_guard()","definition":"CREATE OR REPLACE FUNCTION public.payout_profile_delete_guard()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nbegin\n if exists(select 1 from public.finance_payable_entitlements where recipient_type='user' and recipient_id=old.id)\n then raise exception 'PAYABLE_RECIPIENT_HISTORY_REQUIRED'; end if;\n return old;\nend;\n$function$\n","volatility":"v","security_definer":true,"effective_execute":{"anon":false,"service_role":true,"authenticated":false}},{"acl":"{postgres=X/postgres}","owner":"postgres","result":"trigger","arguments":"","proconfig":["search_path=public"],"signature":"people075_profile_insert()","definition":"CREATE OR REPLACE FUNCTION public.people075_profile_insert()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nbegin\n new.must_change_password:=exists(select 1 from auth.users a where a.id=new.id and nullif(a.raw_app_meta_data->>'vp_temporary_password_nonce','') is not null);\n return new;\nend; $function$\n","volatility":"v","security_definer":true,"effective_execute":{"anon":false,"service_role":false,"authenticated":false}},{"acl":"{postgres=X/postgres,authenticated=X/postgres}","owner":"postgres","result":"boolean","arguments":"","proconfig":["search_path=public"],"signature":"people_is_active_admin()","definition":"CREATE OR REPLACE FUNCTION public.people_is_active_admin()\n RETURNS boolean\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\n select exists(select 1 from public.user_profiles where id=auth.uid() and active is true and role='admin');\n$function$\n","volatility":"s","security_definer":true,"effective_execute":{"anon":false,"service_role":false,"authenticated":true}},{"acl":"{postgres=X/postgres,authenticated=X/postgres}","owner":"postgres","result":"boolean","arguments":"p_id uuid","proconfig":["search_path=public"],"signature":"people_is_assignable(uuid)","definition":"CREATE OR REPLACE FUNCTION public.people_is_assignable(p_id uuid)\n RETURNS boolean\n LANGUAGE sql\n STABLE\n SET search_path TO 'public'\nAS $function$\n select exists(select 1 from public.user_profiles where id=p_id and active is true and account_type='operational' and assignable);\n$function$\n","volatility":"s","security_definer":false,"effective_execute":{"anon":false,"service_role":false,"authenticated":true}},{"acl":"{postgres=X/postgres}","owner":"postgres","result":"trigger","arguments":"","proconfig":["search_path=public"],"signature":"people_profile_delete_guard()","definition":"CREATE OR REPLACE FUNCTION public.people_profile_delete_guard()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nbegin\n if pg_trigger_depth()<2 or current_setting('people.delete_target',true) is distinct from old.id::text\n then raise exception 'Use the guarded Auth deletion operation'; end if;\n return old;\nend;\n$function$\n","volatility":"v","security_definer":true,"effective_execute":{"anon":false,"service_role":false,"authenticated":false}},{"acl":"{postgres=X/postgres}","owner":"postgres","result":"trigger","arguments":"","proconfig":["search_path=public"],"signature":"people_profile_update_guard()","definition":"CREATE OR REPLACE FUNCTION public.people_profile_update_guard()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nbegin\n -- Only the private completion RPC / nested Auth reset trigger can change this\n -- field. Preserve the original 073 guard byte-for-byte for every other edit.\n if new.must_change_password is distinct from old.must_change_password then\n  if (to_jsonb(new)-'must_change_password') is distinct from (to_jsonb(old)-'must_change_password')\n    or current_setting('people.password_target',true) is distinct from new.id::text\n    or not (pg_trigger_depth()>1 or current_setting('role',true)='service_role')\n  then raise exception 'PASSWORD_STATE_MANAGED'; end if;\n  return new;\n end if;\n perform pg_advisory_xact_lock(hashtextextended('people-admin',0));\n if not public.people_is_active_admin() then raise exception 'FORBIDDEN'; end if;\n if new.id is distinct from old.id or new.email is distinct from old.email then raise exception 'INVALID_INPUT'; end if;\n if old.id=auth.uid() and (new.role is distinct from 'admin' or new.active is not true) then raise exception 'SELF_PROTECTION'; end if;\n if new.active is not true or new.account_type is distinct from 'operational' then new.assignable:=false; end if;\n return new;\nend;\n$function$\n","volatility":"v","security_definer":true,"effective_execute":{"anon":false,"service_role":false,"authenticated":false}},{"acl":"{postgres=X/postgres,service_role=X/postgres}","owner":"postgres","result":"trigger","arguments":"","proconfig":["search_path=public"],"signature":"protect_finance_billable_charge_permission_fields()","definition":"CREATE OR REPLACE FUNCTION public.protect_finance_billable_charge_permission_fields()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nbegin\n  if not exists (\n    select 1\n    from public.user_profiles\n    where id = auth.uid()\n      and active = true\n      and role = 'admin'\n  ) then\n    raise exception 'Only an active Admin can change Billable Charge authority';\n  end if;\n  return new;\nend;\n$function$\n","volatility":"v","security_definer":true,"effective_execute":{"anon":false,"service_role":true,"authenticated":false}},{"acl":"{postgres=X/postgres,service_role=X/postgres}","owner":"postgres","result":"trigger","arguments":"","proconfig":["search_path=public"],"signature":"protect_finance_cash_permission_fields()","definition":"CREATE OR REPLACE FUNCTION public.protect_finance_cash_permission_fields()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nbegin\n  if not exists (\n    select 1\n    from public.user_profiles\n    where id = auth.uid()\n      and active = true\n      and role = 'admin'\n  ) then\n    raise exception 'Only an active Admin can change Finance Cash authority';\n  end if;\n  return new;\nend;\n$function$\n","volatility":"v","security_definer":true,"effective_execute":{"anon":false,"service_role":true,"authenticated":false}},{"acl":"{postgres=X/postgres,service_role=X/postgres}","owner":"postgres","result":"trigger","arguments":"","proconfig":["search_path=public"],"signature":"protect_finance_payment_permission_fields()","definition":"CREATE OR REPLACE FUNCTION public.protect_finance_payment_permission_fields()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nbegin\n  if not exists (\n    select 1\n    from public.user_profiles\n    where id = auth.uid()\n      and active = true\n      and role = 'admin'\n  ) then\n    raise exception 'Only an active Admin can change Payment authority';\n  end if;\n  return new;\nend;\n$function$\n","volatility":"v","security_definer":true,"effective_execute":{"anon":false,"service_role":true,"authenticated":false}},{"acl":"{postgres=X/postgres,service_role=X/postgres}","owner":"postgres","result":"trigger","arguments":"","proconfig":["search_path=public"],"signature":"protect_finance_receipt_permission_fields()","definition":"CREATE OR REPLACE FUNCTION public.protect_finance_receipt_permission_fields()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nbegin\n  if tg_op = 'INSERT' and not (new.can_view_finance_receipts or new.can_manage_finance_receipts\n    or new.can_issue_finance_receipts or new.can_void_finance_receipts) then return new; end if;\n  if not exists (select 1 from public.user_profiles where id = auth.uid() and active and role = 'admin')\n  then raise exception 'Only an active Admin can change Receipt authority'; end if;\n  return new;\nend;\n$function$\n","volatility":"v","security_definer":true,"effective_execute":{"anon":false,"service_role":true,"authenticated":false}},{"acl":"{postgres=X/postgres,service_role=X/postgres}","owner":"postgres","result":"trigger","arguments":"","proconfig":["search_path=public"],"signature":"protect_finance_tax_invoice_permissions()","definition":"CREATE OR REPLACE FUNCTION public.protect_finance_tax_invoice_permissions()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nbegin\n  if tg_op='INSERT' and not(new.can_view_finance_tax_invoices or new.can_manage_finance_tax_invoices or new.can_issue_finance_tax_invoices) then return new; end if;\n  if not exists(select 1 from public.user_profiles where id=auth.uid() and active and role='admin')\n  then raise exception 'TAX_INVOICE_PERMISSION_ADMIN_REQUIRED'; end if;\n  return new;\nend;\n$function$\n","volatility":"v","security_definer":true,"effective_execute":{"anon":false,"service_role":true,"authenticated":false}}]$expected076$::jsonb evidence),
expected_locators(signature,schema_name,function_name,identity_types) AS (VALUES
 ('admin074_session_allowed()','public','admin074_session_allowed',''),
 ('auth.jwt()','auth','jwt',''),
 ('auth.uid()','auth','uid',''),
 ('can_create_advisory_matter()','public','can_create_advisory_matter',''),
 ('can_view_audit_logs()','public','can_view_audit_logs',''),
 ('create_advisory_matter_with_number(uuid,text,text,text,text,text,date,date,numeric,text,text)','public','create_advisory_matter_with_number','uuid,text,text,text,text,text,date,date,numeric,text,text'),
 ('generate_advisory_matter_no()','public','generate_advisory_matter_no',''),
 ('payout_profile_delete_guard()','public','payout_profile_delete_guard',''),
 ('people075_profile_insert()','public','people075_profile_insert',''),
 ('people_is_active_admin()','public','people_is_active_admin',''),
 ('people_is_assignable(uuid)','public','people_is_assignable','uuid'),
 ('people_profile_delete_guard()','public','people_profile_delete_guard',''),
 ('people_profile_update_guard()','public','people_profile_update_guard',''),
 ('protect_finance_billable_charge_permission_fields()','public','protect_finance_billable_charge_permission_fields',''),
 ('protect_finance_cash_permission_fields()','public','protect_finance_cash_permission_fields',''),
 ('protect_finance_payment_permission_fields()','public','protect_finance_payment_permission_fields',''),
 ('protect_finance_receipt_permission_fields()','public','protect_finance_receipt_permission_fields',''),
 ('protect_finance_tax_invoice_permissions()','public','protect_finance_tax_invoice_permissions','')
),
expected_rows AS (
 SELECT l.*,e.evidence,e.ordinality expected_position,
  format('%I.%I(%s)',l.schema_name,l.function_name,l.identity_types) qualified_signature,
  to_regprocedure(format('%I.%I(%s)',l.schema_name,l.function_name,l.identity_types))::oid resolved_oid
 FROM expected_document d CROSS JOIN LATERAL jsonb_array_elements(d.evidence) WITH ORDINALITY e(evidence,ordinality)
 JOIN expected_locators l ON l.signature=e.evidence->>'signature'
),
scope(name) AS (VALUES
 ('advisory_matters'), ('advisory_issues'), ('advisory_issue_tasks'),
 ('advisory_advice_records'), ('advisory_time_logs'), ('advisory_matter_counters'),
 ('clients'), ('user_profiles'), ('case_audit_logs')
),
relations AS (
 SELECT c.*, n.nspname FROM scope s JOIN pg_class c ON c.oid=to_regclass('public.'||s.name)
 JOIN pg_namespace n ON n.oid=c.relnamespace
),
function_roots(oid) AS (
 SELECT p.oid FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN
  ('create_advisory_matter_with_number','can_create_advisory_matter','generate_advisory_matter_no',
   'people_is_assignable','people_is_active_admin','admin074_session_allowed')
 UNION SELECT g.tgfoid FROM pg_trigger g JOIN relations t ON t.oid=g.tgrelid WHERE NOT g.tgisinternal AND g.tgname NOT LIKE 'advisory076_%'
 UNION SELECT d.refobjid FROM pg_policy p JOIN relations t ON t.oid=p.polrelid
  JOIN pg_depend d ON d.classid='pg_policy'::regclass AND d.objid=p.oid AND d.refclassid='pg_proc'::regclass
),
function_edges(parent,child) AS (
 SELECT p.oid,q.oid FROM pg_proc p JOIN pg_namespace pn ON pn.oid=p.pronamespace
 JOIN pg_proc q ON q.prokind='f' JOIN pg_namespace qn ON qn.oid=q.pronamespace
 WHERE p.prokind='f' AND pn.nspname IN ('public','auth') AND qn.nspname IN ('public','auth')
 AND q.proname ~ '^[a-zA-Z_][a-zA-Z_0-9]*$'
 AND p.prosrc ~ ('\m'||q.proname||'\M[[:space:]]*\(')
 UNION SELECT d.objid,d.refobjid FROM pg_depend d
 WHERE d.classid='pg_proc'::regclass AND d.refclassid='pg_proc'::regclass
),
function_walk(oid,path,depth) AS (
 SELECT oid,ARRAY[oid],0 FROM function_roots
 UNION ALL SELECT e.child,w.path||e.child,w.depth+1 FROM function_walk w
 JOIN function_edges e ON e.parent=w.oid WHERE w.depth<8 AND NOT e.child=ANY(w.path)
),
functions AS (
 SELECT p.oid,jsonb_build_object('signature',p.oid::regprocedure::text,'arguments',pg_get_function_arguments(p.oid),
  'result',pg_get_function_result(p.oid),'definition',pg_get_functiondef(p.oid),
  'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'volatility',p.provolatile,
  'proconfig',p.proconfig,'acl',p.proacl::text,
  'effective_execute',(SELECT jsonb_object_agg(r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE'))
   FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role'))) evidence
 FROM pg_proc p WHERE p.oid IN (SELECT oid FROM function_walk) AND p.prokind='f'
),
expected_functions_outside_graph AS (
 SELECT p.oid,jsonb_build_object('signature',p.oid::regprocedure::text,'arguments',pg_get_function_arguments(p.oid),
  'result',pg_get_function_result(p.oid),'definition',pg_get_functiondef(p.oid),
  'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'volatility',p.provolatile,
  'proconfig',p.proconfig,'acl',p.proacl::text,
  'effective_execute',(SELECT jsonb_object_agg(r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE'))
   FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role'))) evidence
 FROM pg_proc p WHERE p.oid IN (SELECT resolved_oid FROM expected_rows) AND p.oid NOT IN (SELECT oid FROM functions) AND p.prokind='f'
),
observed AS (
 SELECT f.*,n.nspname schema_name,p.proname function_name,
  pg_get_function_identity_arguments(p.oid) identity_arguments,
  format('%I.%I(%s)',n.nspname,p.proname,oidvectortypes(p.proargtypes)) qualified_signature,
  EXISTS(SELECT 1 FROM functions g WHERE g.oid=f.oid) included_in_guard,
  (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'grantor',pg_get_userbyid(a.grantor),
    'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
    'privilege',a.privilege_type,'grantable',a.is_grantable)
    ORDER BY a.grantee,a.grantor,a.privilege_type),'[]')
   FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) expanded_actual_acl,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('table',r.relname,'trigger',t.tgname)
    ORDER BY r.relname,t.tgname),'[]') FROM pg_trigger t JOIN relations r ON r.oid=t.tgrelid
   WHERE t.tgfoid=p.oid AND NOT t.tgisinternal AND t.tgname NOT LIKE 'advisory076_%') trigger_roots,
  (SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('table',r.relname,'policy',pol.polname)),'[]')
   FROM pg_policy pol JOIN relations r ON r.oid=pol.polrelid JOIN pg_depend d
   ON d.classid='pg_policy'::regclass AND d.objid=pol.oid AND d.refclassid='pg_proc'::regclass
   WHERE d.refobjid=p.oid) policy_roots,
  (SELECT coalesce(jsonb_agg(DISTINCT e.parent::regprocedure::text),'[]') FROM function_edges e
   WHERE e.child=p.oid AND e.parent IN (SELECT oid FROM function_walk)) discovered_parent_functions
 FROM (SELECT * FROM functions UNION ALL SELECT * FROM expected_functions_outside_graph) f
 JOIN pg_proc p ON p.oid=f.oid JOIN pg_namespace n ON n.oid=p.pronamespace
),
paired AS (
 SELECT coalesce(e.schema_name,a.schema_name) schema_name,
  coalesce(e.function_name,a.function_name) function_name,
  coalesce(e.qualified_signature,a.qualified_signature) qualified_signature,
  e.identity_types expected_identity_types,e.evidence->>'arguments' expected_identity_arguments,
  a.identity_arguments actual_identity_arguments,e.expected_position,
  e.evidence expected,a.evidence actual,a.oid actual_oid,
  coalesce(a.included_in_guard,false) included_in_guard,
  a.expanded_actual_acl,a.trigger_roots,a.policy_roots,a.discovered_parent_functions
 FROM expected_rows e FULL JOIN observed a ON a.oid=e.resolved_oid
),
compared AS (
 SELECT p.*,
  (SELECT coalesce(jsonb_agg(k ORDER BY k),'[]') FROM jsonb_object_keys(coalesce(expected,'{}')||coalesce(actual,'{}')) k
   WHERE expected IS NOT NULL AND actual IS NOT NULL AND expected->k IS DISTINCT FROM actual->k) differing_fields,
  (SELECT coalesce(jsonb_object_agg(k,jsonb_build_object('expected',expected->k,'actual',actual->k)),'{}')
   FROM jsonb_object_keys(coalesce(expected,'{}')||coalesce(actual,'{}')) k
   WHERE expected IS NOT NULL AND actual IS NOT NULL AND expected->k IS DISTINCT FROM actual->k) field_differences
 FROM paired p
),
classified AS (
 SELECT c.*,
  CASE WHEN expected IS NOT NULL AND actual IS NOT NULL AND included_in_guard AND expected=actual
   THEN ARRAY['match']::text[] ELSE
   array_remove(ARRAY[
    CASE WHEN actual IS NULL THEN 'missing_function' END,
    CASE WHEN expected IS NULL THEN 'unexpected_dependency_in_guard' END,
    CASE WHEN actual IS NOT NULL AND expected IS NOT NULL AND NOT included_in_guard THEN 'expected_function_no_longer_discovered' END,
    CASE WHEN differing_fields ? 'signature' THEN 'display_signature_or_search_path' END,
    CASE WHEN differing_fields ? 'arguments' OR differing_fields ? 'result' THEN 'arguments_or_result' END,
    CASE WHEN differing_fields ? 'definition' THEN 'function_definition' END,
    CASE WHEN differing_fields ? 'owner' THEN 'owner' END,
    CASE WHEN differing_fields ? 'security_definer' THEN 'security_definer' END,
    CASE WHEN differing_fields ? 'volatility' THEN 'volatility' END,
    CASE WHEN differing_fields ? 'proconfig' THEN 'proconfig_or_search_path' END,
    CASE WHEN differing_fields ? 'acl' THEN 'raw_acl' END,
    CASE WHEN differing_fields ? 'effective_execute' THEN 'effective_execute' END
   ],NULL) END mismatch_categories
 FROM compared c
),
function_reports AS (
 SELECT qualified_signature,mismatch_categories,jsonb_build_object(
  'schema',schema_name,'function_name',function_name,'qualified_signature',qualified_signature,
  'expected_identity_types',expected_identity_types,
  'expected_identity_arguments',expected_identity_arguments,'actual_identity_arguments',actual_identity_arguments,
  'expected_array_position',expected_position,'included_in_current_guard',included_in_guard,
  'mismatch_categories',mismatch_categories,'differing_fields',differing_fields,'field_differences',field_differences,
  'expected',expected,'actual',actual,
  'expected_definition_sha256',encode(sha256(convert_to(expected->>'definition','UTF8')),'hex'),
  'actual_definition_sha256',encode(sha256(convert_to(actual->>'definition','UTF8')),'hex'),
  'expected_guard_evidence_sha256',encode(sha256(convert_to(expected::text,'UTF8')),'hex'),
  'actual_guard_evidence_sha256',encode(sha256(convert_to(actual::text,'UTF8')),'hex'),
  'expanded_actual_acl_including_defaults',expanded_actual_acl,
  'actual_trigger_roots',trigger_roots,'actual_policy_roots',policy_roots,
  'actual_discovered_parent_functions',discovered_parent_functions) evidence
 FROM classified
),
aggregates AS (
 SELECT (SELECT evidence FROM expected_document) expected,
  (SELECT jsonb_agg(evidence ORDER BY evidence->>'signature') FROM functions) actual,
  (SELECT jsonb_agg(evidence ORDER BY (evidence->>'signature') COLLATE "C") FROM functions) actual_c_order
),
aggregate_hashes AS (
 SELECT encode(sha256(convert_to(expected::text,'UTF8')),'hex') embedded_expected_sha256,
  encode(sha256(convert_to(actual::text,'UTF8')),'hex') actual_guard_sha256,
  encode(sha256(convert_to(actual_c_order::text,'UTF8')),'hex') actual_c_order_sha256,
  (SELECT coalesce(jsonb_agg(e->>'signature' ORDER BY n),'[]') FROM jsonb_array_elements(expected) WITH ORDINALITY x(e,n)) expected_signature_order,
  (SELECT coalesce(jsonb_agg(e->>'signature' ORDER BY n),'[]') FROM jsonb_array_elements(actual) WITH ORDINALITY x(e,n)) actual_signature_order
 FROM aggregates
),
new_tables(name) AS (VALUES ('advisory_matter_control'),('advisory_matter_team'),('advisory_matter_stages'),('advisory_stage_visits'),('advisory_work_state_events'),('advisory_matter_activities'),('advisory_deliverables'),('advisory_control_requests')),
new_functions(name) AS (VALUES ('advisory076_allowed'),('advisory076_check_person'),('advisory076_template'),('advisory076_task_guard'),('advisory076_task_activity'),('advisory076_time_guard'),('advisory076_issue_guard'),('advisory076_lifecycle_guard'),('advisory_control_write'),('advisory_control_read'),('advisory_control_section')),
added_columns(table_name,column_name) AS (VALUES
 ('advisory_issue_tasks','assignee_user_id'),('advisory_issue_tasks','stage_id'),('advisory_time_logs','stage_id')
),
phase8c_objects_found AS (
 SELECT 'relation'::text object_type,n.nspname schema_name,c.relname object_name,
  NULL::text parent_object,c.relkind::text detail
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND (c.relname IN (SELECT name FROM new_tables) OR c.relname LIKE 'advisory076\_%' ESCAPE '\')
 UNION ALL
 SELECT 'function',n.nspname,p.proname,NULL,pg_get_function_identity_arguments(p.oid)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND (p.proname IN (SELECT name FROM new_functions) OR p.proname LIKE 'advisory076\_%' ESCAPE '\')
 UNION ALL
 SELECT 'column','public',a.attname,t.table_name,format_type(a.atttypid,a.atttypmod)
 FROM added_columns t JOIN pg_attribute a ON a.attrelid=to_regclass('public.'||t.table_name)
  AND a.attname=t.column_name AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL
 SELECT 'trigger',n.nspname,g.tgname,c.relname,pg_get_triggerdef(g.oid,true)
 FROM pg_trigger g JOIN pg_class c ON c.oid=g.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND g.tgname LIKE 'advisory076\_%' ESCAPE '\' AND NOT g.tgisinternal
 UNION ALL
 SELECT 'constraint',n.nspname,k.conname,c.relname,pg_get_constraintdef(k.oid,true)
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND k.conname LIKE 'advisory076\_%' ESCAPE '\'
 UNION ALL
 SELECT 'policy',n.nspname,p.polname,c.relname,p.polcmd::text
 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND p.polname LIKE 'advisory076\_%' ESCAPE '\'
),
old_column_check AS (
 SELECT 'public.advisory_issue_tasks.advisory_issue_id'::text column_name,
  true expected_not_null,
  (SELECT a.attnotnull FROM pg_attribute a
   WHERE a.attrelid=to_regclass('public.advisory_issue_tasks') AND a.attname='advisory_issue_id'
    AND a.attnum>0 AND NOT a.attisdropped) actual_not_null
),
schema_check AS (
 SELECT jsonb_build_object(
  'no_phase8c_objects_found',NOT EXISTS(SELECT 1 FROM phase8c_objects_found),
  'pre076_issue_fk_nullability_preserved',actual_not_null IS NOT DISTINCT FROM expected_not_null,
  'no_phase8c_schema_changes_committed',NOT EXISTS(SELECT 1 FROM phase8c_objects_found)
    AND actual_not_null IS NOT DISTINCT FROM expected_not_null,
  'existing_column',jsonb_build_object('name',column_name,'expected_not_null',expected_not_null,'actual_not_null',actual_not_null),
  'phase8c_objects_found',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY object_type,object_name,parent_object),'[]') FROM phase8c_objects_found x),
  'scope','Catalog evidence only; does not assert historical row preservation or inspect migration-history records.'
 ) evidence FROM old_column_check
)
SELECT jsonb_build_object(
 'diagnostic','ADVISORY076_BASELINE_MISMATCH: functions',
 'candidate_sha256',p.candidate_sha256,
 'expected_functions_sha256_from_migration',p.expected_functions_sha256,
 'embedded_expected_functions_sha256',h.embedded_expected_sha256,
 'expected_evidence_matches_migration_guard',h.embedded_expected_sha256=p.expected_functions_sha256,
 'actual_functions_sha256_exact_guard',h.actual_guard_sha256,
 'functions_baseline_matches_migration',h.actual_guard_sha256 IS NOT DISTINCT FROM p.expected_functions_sha256,
 'expected_function_count',(SELECT count(*) FROM expected_rows),
 'actual_guard_function_count',(SELECT count(*) FROM functions),
 'different_function_count',(SELECT count(*) FROM classified WHERE mismatch_categories<>ARRAY['match']),
 'mismatch_summary',(SELECT coalesce(jsonb_agg(jsonb_build_object('signature',qualified_signature,
   'categories',mismatch_categories,'fields',differing_fields) ORDER BY qualified_signature),'[]')
   FROM classified WHERE mismatch_categories<>ARRAY['match']),
 'aggregate_diagnostic',jsonb_build_object(
   'actual_c_order_sha256',h.actual_c_order_sha256,
   'order_only_mismatch',h.actual_guard_sha256 IS DISTINCT FROM p.expected_functions_sha256
      AND h.actual_c_order_sha256=p.expected_functions_sha256,
   'expected_signature_order',h.expected_signature_order,'actual_signature_order',h.actual_signature_order,
   'session_search_path',current_setting('search_path'),
   'database_collation',(SELECT datcollate FROM pg_database WHERE datname=current_database()),
   'server_version',current_setting('server_version'),
   'normalization','Exact pg_get_functiondef and raw evidence -> jsonb text -> UTF8 -> SHA256. C-order is diagnostic only.'),
 'functions',(SELECT coalesce(jsonb_agg(evidence ORDER BY qualified_signature),'[]') FROM function_reports),
 'phase8c_schema_commit_check',(SELECT evidence FROM schema_check)
) AS advisory076_function_baseline_diagnostic
FROM pins p CROSS JOIN aggregate_hashes h;
