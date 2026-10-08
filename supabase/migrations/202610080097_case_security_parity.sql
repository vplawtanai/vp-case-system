-- 097: minimal Case permission parity. Human Apply only after reviewed preflight.
-- No business DML, history rewrite, counter allocation or Finance change.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
-- Lock only Case tables while catalog and row preservation are compared.
LOCK TABLE public.case_audit_logs, public.case_court_filings, public.case_deadline_extensions, public.case_deadlines, public.case_enforcement_assets, public.case_enforcements, public.case_expense_items, public.case_fee_items, public.case_fees, public.case_judgments, public.case_notes, public.case_services, public.case_tasks, public.case_time_logs, public.case_timeline, public.cases, public.file_no_counters, public.parties IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ DECLARE actual jsonb; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'CASE097_OWNER_REQUIRED'; END IF;
 WITH raw AS (WITH rels AS (SELECT c.*,n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname=ANY(ARRAY['case_audit_logs','case_court_filings','case_deadline_extensions','case_deadlines','case_enforcement_assets','case_enforcements','case_expense_items','case_fee_items','case_fees','case_judgments','case_notes','case_services','case_tasks','case_time_logs','case_timeline','cases','file_no_counters','parties']) AND c.relkind='r')
 SELECT jsonb_build_object('tables',-- NOT NULL is pinned in columns; PostgreSQL 18 also catalogs it as contype=n.
(SELECT jsonb_object_agg(r.relname,jsonb_build_object(
  'owner',pg_get_userbyid(r.relowner),'rls_enabled',r.relrowsecurity,'rls_forced',r.relforcerowsecurity,
  'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(ad.adbin,ad.adrelid),'identity',a.attidentity,'generated',a.attgenerated,'acl',a.attacl::text) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped),
  'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',co.conname,'definition',pg_get_constraintdef(co.oid,true),'validated',co.convalidated) ORDER BY co.conname),'[]') FROM pg_constraint co WHERE co.conrelid=r.oid AND co.contype<>'n'),
  'indexes',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',ic.relname,'valid',i.indisvalid,'definition',pg_get_indexdef(i.indexrelid)) ORDER BY ic.relname),'[]') FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=r.oid),
  'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',(SELECT jsonb_agg(CASE WHEN rr=0 THEN 'PUBLIC' ELSE pg_get_userbyid(rr) END) FROM unnest(p.polroles) rr),'using',pg_get_expr(p.polqual,p.polrelid),'with_check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]') FROM pg_policy p WHERE p.polrelid=r.oid),
  'acl',(SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(r.relacl,acldefault('r',r.relowner))) a),
  'api_role_privileges',(SELECT jsonb_object_agg(pr.rolname,jsonb_build_object('select',has_table_privilege(pr.oid,r.oid,'SELECT'),'insert',has_table_privilege(pr.oid,r.oid,'INSERT'),'update',has_table_privilege(pr.oid,r.oid,'UPDATE'),'delete',has_table_privilege(pr.oid,r.oid,'DELETE'),'truncate',has_table_privilege(pr.oid,r.oid,'TRUNCATE'))) FROM pg_roles pr WHERE pr.rolname IN ('anon','authenticated','service_role')),
  'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'function',t.tgfoid::regprocedure::text,'definition',pg_get_triggerdef(t.oid,true)) ORDER BY t.tgname),'[]') FROM pg_trigger t WHERE t.tgrelid=r.oid AND NOT t.tgisinternal)
 ) ORDER BY r.relname) FROM rels r),'functions',
 (SELECT coalesce(jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object(
 'signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
 'security_definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'definition',pg_get_functiondef(p.oid),
 'execute',(SELECT jsonb_object_agg(rr.rolname,has_function_privilege(rr.oid,p.oid,'EXECUTE')) FROM pg_roles rr WHERE rr.rolname IN ('anon','authenticated','service_role')),
 'acl',(SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)
 )),'{}') FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f'
 AND (p.oid::regprocedure::text=ANY(ARRAY['can_create_case()','can_view_audit_logs()','can_view_case_data()','can_view_financial_data()','can_write_case_data()','can_write_financial_data()','create_case_with_number(uuid)','generate_file_no()']) OR p.proname LIKE 'case097_%')))) SELECT jsonb_build_object('tables',(SELECT coalesce(jsonb_object_agg(key,encode(sha256(convert_to((value)::text,'UTF8')),'hex')),'{}') FROM jsonb_each(c->'tables')),'functions',(SELECT coalesce(jsonb_object_agg(key,encode(sha256(convert_to((value)::text,'UTF8')),'hex')),'{}') FROM jsonb_each(c->'functions'))) FROM raw r(c) INTO actual;
 IF actual IS DISTINCT FROM '{"tables":{"cases":"4609010087c2bd8ed0383a57a2eec5d82189edd45b86efc8eabed0edb74699b7","parties":"7d773e70f3da031ccf0bb5b6e3fc31b5a2f81fbbeb46be0e8ce1cb622b341c45","case_fees":"7212b9dd9fe15739bf0187e878d2e15b430d06d083812dd3ed7770d8f6f85ac6","case_notes":"11c5733fd3ca5bd5d3fe4c8dd55a94100bac417cd2e70709155df28d7a9afba1","case_tasks":"368682d03bc2bfec4918321599714f50046fa3536d0f8357b734df099fb55571","case_services":"656dec7d2646aa0957ac40a3eb1496fe3da4d04296530336ddca2afe3b6dd133","case_timeline":"6a17cb2aafb081e6103f648b88e16b89e6bd3e355a771e8526c44fa6142b458d","case_deadlines":"292d7de7de3d7474777386234cc648273e77597954023e46bd051b4ad921b551","case_fee_items":"dc96661f46a126bf95e5a712edfc5258b33ea7fa86828ab2e8e1ef637ec38abb","case_judgments":"0f246e7021289d6d714275969f97e490702f9112a6011541faa249ab79975842","case_time_logs":"c4b64df8552b18c7ce1e4d4b9471bbbb426bd0df89a3119ad503506961a3587c","case_audit_logs":"59e295d701723b8948a76cac53b1a0e3d95501368dfb2f5898b32adc5fcef595","file_no_counters":"f6bdf323fe0ec5295d54f83aedb69b624c2bc67bfb5e2ade4d7a871854244e0d","case_enforcements":"72e3a7edbd25a178ad5760f764e43268e3b753b3288727425659ddfd75588b39","case_court_filings":"1b7669a6efb7a54cd0b15312997aef721df6e94690bd239c6e1061aa2377924c","case_expense_items":"ad8dd133d58aa9ae0c9d2b0a85b0dce6056468fcbe1081fa163eb90a5823d783","case_enforcement_assets":"7192f52549623a01d0cee15a031c249ff4c943159fb6f8c3df475d6098058b68","case_deadline_extensions":"733721a193eaa245f759bafe34444112c153587eb7d59634ecf04cb4cffa7125"},"functions":{"can_create_case()":"480e9effab05286802cbb1b926fe4b0d5940a74e998676ba700f6ebd94bdc11a","can_view_audit_logs()":"85637e9111c1f1f336dae53daa21d49a327cb98b7a13e64a76ec9151bb3f5998","can_view_case_data()":"ad88a5bb95bfe18ee038e76e2266996f229459761c56f87b4f7df3280a50f65d","can_view_financial_data()":"ec99710571b1f61f406cc02b4285bfbce626af09d109f8c01fb2eff3de69cf1b","can_write_case_data()":"bafa2ef5a10fd0d6c5cf7a9359a03f6a05ba67fff74dca194c86a224239991f7","can_write_financial_data()":"18cc1d6b61cdcc1be8451048efa6e43aea13f0e5f8c91a07f7af5a108e329258","create_case_with_number(uuid)":"49cb92595e7acb9d1da0a8fc8e4919c9583d3083c28e126c229a443700e1e555","generate_file_no()":"109650cdc970a5580b27eda3de0155f5010e2a9d9e1f2f65b2224a7b0212b4ed"}}'::jsonb THEN RAISE EXCEPTION 'CASE097_CONTRACT_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND column_name='must_change_password' AND data_type='boolean' AND is_nullable='NO') THEN RAISE EXCEPTION 'CASE097_PROFILE_GUARD_MISSING'; END IF;
 IF EXISTS(SELECT 1 FROM public.case_fees) OR EXISTS(SELECT 1 FROM public.case_services) THEN RAISE EXCEPTION 'CASE097_RETIRED_TABLE_REVIEW_REQUIRED'; END IF;
END $guard$;
CREATE TEMP TABLE case097_before_rows ON COMMIT DROP AS SELECT jsonb_object_agg(name,jsonb_build_object('count',x.n::bigint,'sha256',x.h) ORDER BY name)
 FROM unnest(ARRAY['case_audit_logs','case_court_filings','case_deadline_extensions','case_deadlines','case_enforcement_assets','case_enforcements','case_expense_items','case_fee_items','case_fees','case_judgments','case_notes','case_services','case_tasks','case_time_logs','case_timeline','cases','file_no_counters','parties']) tab(name)
 CROSS JOIN LATERAL XMLTABLE('/table/row' PASSING query_to_xml(format(
 'SELECT count(*) n,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text COLLATE "C"),''[]''::jsonb)::text,''UTF8'')),''hex'') h FROM public.%I t %s',name,
 CASE WHEN name='case_audit_logs' THEN 'WHERE case_id IS NOT NULL OR table_name IN (''case_audit_logs'',''case_court_filings'',''case_deadline_extensions'',''case_deadlines'',''case_enforcement_assets'',''case_enforcements'',''case_expense_items'',''case_fee_items'',''case_fees'',''case_judgments'',''case_notes'',''case_services'',''case_tasks'',''case_time_logs'',''case_timeline'',''cases'',''file_no_counters'',''parties'')' ELSE '' END),false,false,'') COLUMNS n text PATH 'n',h text PATH 'h') x;
-- 097 Case security parity only. Existing role/financial/Time business rules remain.
-- Shared authorization helpers are deliberately not replaced.
CREATE FUNCTION public.case097_session_ready() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid() AND p.active IS TRUE AND p.must_change_password IS FALSE);
$function$;

CREATE FUNCTION public.case097_process_writer() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
  SELECT public.case097_session_ready() AND EXISTS (SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin','partner','lawyer','assistant_lawyer'));
$function$;

-- Case-only helper used by both the direct INSERT policy and the atomic create RPC.
-- Preserve its signature, owner, ACL, volatility and existing role set.
CREATE OR REPLACE FUNCTION public.can_create_case() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.active IS TRUE AND up.must_change_password IS FALSE
      AND up.role IN ('admin','partner','lawyer'));
$function$;

-- OLD/NEW comparison belongs in a trigger: an RLS row expression cannot tell
-- an ordinary edit from a soft-delete/restore. No existing row is rewritten.
CREATE FUNCTION public.case097_soft_delete_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    changed := NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL;
  ELSE
    changed := NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
      OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by;
  END IF;
  IF changed AND NOT EXISTS (SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid() AND p.active IS TRUE AND p.must_change_password IS FALSE
        AND p.role IN ('admin','partner')) THEN
    RAISE EXCEPTION 'CASE_SOFT_DELETE_PARTNER_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.case097_session_ready() OWNER TO postgres;
ALTER FUNCTION public.case097_process_writer() OWNER TO postgres;
ALTER FUNCTION public.case097_soft_delete_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.case097_session_ready(), public.case097_process_writer(),
  public.case097_soft_delete_guard() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.case097_session_ready(), public.case097_process_writer() TO authenticated;

DO $policies$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['cases','parties','case_timeline','case_judgments',
    'case_court_filings','case_enforcements','case_enforcement_assets','case_tasks',
    'case_deadlines','case_deadline_extensions','case_time_logs','case_fee_items',
    'case_expense_items','case_notes','case_audit_logs'] LOOP
    -- Restrictive AND policies cannot be bypassed by existing permissive policies.
    EXECUTE format('CREATE POLICY case097_ready ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.case097_session_ready()) WITH CHECK (public.case097_session_ready())',tab);
  END LOOP;
  FOREACH tab IN ARRAY ARRAY['cases','parties','case_timeline','case_judgments',
    'case_court_filings','case_enforcements','case_enforcement_assets',
    'case_deadlines','case_deadline_extensions'] LOOP
    EXECUTE format('CREATE POLICY case097_process_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.case097_process_writer())',tab);
    EXECUTE format('CREATE POLICY case097_process_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.case097_process_writer()) WITH CHECK (public.case097_process_writer())',tab);
  END LOOP;
  FOREACH tab IN ARRAY ARRAY['parties','case_timeline','case_judgments',
    'case_court_filings','case_enforcements','case_enforcement_assets','case_tasks',
    'case_deadlines','case_deadline_extensions','case_time_logs','case_fee_items',
    'case_expense_items','case_notes'] LOOP
    EXECUTE format('CREATE TRIGGER case097_soft_delete BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.case097_soft_delete_guard()',tab);
  END LOOP;
END;
$policies$;

-- Shared audit table: legitimate browser inserts already send the signed-in UUID.
-- Existing server-side audit producers are unchanged; this restricts API INSERT.
CREATE POLICY case097_audit_actor ON public.case_audit_logs AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Retired, unused legacy tables: no application path requires API access.
-- RLS with no policies denies API CRUD, retaining every historical row and owner access.
ALTER TABLE public.case_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_services ENABLE ROW LEVEL SECURITY;

-- RLS does not govern TRUNCATE. Revoke only the unnecessary API privilege.
REVOKE TRUNCATE ON TABLE public.cases, public.parties, public.case_timeline,
  public.case_judgments, public.case_court_filings, public.case_enforcements,
  public.case_enforcement_assets, public.case_tasks, public.case_deadlines,
  public.case_deadline_extensions, public.case_time_logs, public.case_fee_items,
  public.case_expense_items, public.case_notes, public.case_audit_logs,
  public.case_fees, public.case_services, public.file_no_counters
  FROM PUBLIC, anon, authenticated;

DO $preserve$ DECLARE old_rows jsonb; new_rows jsonb; BEGIN
 SELECT * INTO old_rows FROM case097_before_rows;
 SELECT jsonb_object_agg(name,jsonb_build_object('count',x.n::bigint,'sha256',x.h) ORDER BY name)
 FROM unnest(ARRAY['case_audit_logs','case_court_filings','case_deadline_extensions','case_deadlines','case_enforcement_assets','case_enforcements','case_expense_items','case_fee_items','case_fees','case_judgments','case_notes','case_services','case_tasks','case_time_logs','case_timeline','cases','file_no_counters','parties']) tab(name)
 CROSS JOIN LATERAL XMLTABLE('/table/row' PASSING query_to_xml(format(
 'SELECT count(*) n,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text COLLATE "C"),''[]''::jsonb)::text,''UTF8'')),''hex'') h FROM public.%I t %s',name,
 CASE WHEN name='case_audit_logs' THEN 'WHERE case_id IS NOT NULL OR table_name IN (''case_audit_logs'',''case_court_filings'',''case_deadline_extensions'',''case_deadlines'',''case_enforcement_assets'',''case_enforcements'',''case_expense_items'',''case_fee_items'',''case_fees'',''case_judgments'',''case_notes'',''case_services'',''case_tasks'',''case_time_logs'',''case_timeline'',''cases'',''file_no_counters'',''parties'')' ELSE '' END),false,false,'') COLUMNS n text PATH 'n',h text PATH 'h') x INTO new_rows;
 IF new_rows IS DISTINCT FROM old_rows THEN RAISE EXCEPTION 'CASE097_HISTORY_CHANGED'; END IF;
END $preserve$;
COMMIT;
