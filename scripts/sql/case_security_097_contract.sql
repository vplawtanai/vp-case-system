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
