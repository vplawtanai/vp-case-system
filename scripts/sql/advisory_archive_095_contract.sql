-- 095 contract source. Offline generator adds views, guards and accepted read bodies.
-- Archive is orthogonal to lifecycle. All pre-existing business rows remain intact.
CREATE TABLE public.advisory_matter_archives (
 matter_id uuid PRIMARY KEY REFERENCES public.advisory_matters(id) ON DELETE RESTRICT,
 matter_no text NOT NULL UNIQUE,
 archived_at timestamptz NOT NULL,
 archived_by uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
 archive_reason text NOT NULL CHECK(length(btrim(archive_reason)) BETWEEN 1 AND 2000),
 request_id uuid NOT NULL,
 reviewed_matter_sha256 text NOT NULL CHECK(reviewed_matter_sha256 ~ '^[0-9a-f]{64}$'),
 reviewed_baseline jsonb NOT NULL CHECK(jsonb_typeof(reviewed_baseline)='object')
);
ALTER TABLE public.advisory_matter_archives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.advisory_matter_archives FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.advisory_matter_archives TO authenticated;
CREATE POLICY advisory095_admin_evidence ON public.advisory_matter_archives
 FOR SELECT TO authenticated USING(public.advisory086_admin());

CREATE FUNCTION public.advisory095_operational(p_matter_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.advisory076_allowed('read') AND NOT EXISTS(
  SELECT 1 FROM public.advisory_matter_archives a WHERE a.matter_id=p_matter_id);
$fn$;

-- Lock the parent even for direct child writes, coordinating with archive.
-- This adds a guard; it never replaces/bypasses any existing guard.
CREATE FUNCTION public.advisory095_write_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE ids uuid[]; k uuid;
BEGIN
 ids:=ARRAY[CASE WHEN TG_OP<>'DELETE' THEN (to_jsonb(NEW)->>TG_ARGV[0])::uuid END,
            CASE WHEN TG_OP<>'INSERT' THEN (to_jsonb(OLD)->>TG_ARGV[0])::uuid END];
 FOR k IN SELECT DISTINCT x FROM unnest(ids) x WHERE x IS NOT NULL ORDER BY x LOOP
  PERFORM 1 FROM public.advisory_matters WHERE id=k FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.advisory_matter_archives WHERE matter_id=k) THEN
   RAISE EXCEPTION 'ADVISORY_ARCHIVED' USING ERRCODE='55000';
  END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $fn$;

CREATE FUNCTION public.advisory095_archive_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
BEGIN RAISE EXCEPTION 'ADVISORY_ARCHIVE_IMMUTABLE'; END $fn$;
CREATE TRIGGER advisory095_archive_immutable BEFORE UPDATE OR DELETE
 ON public.advisory_matter_archives FOR EACH ROW EXECUTE FUNCTION public.advisory095_archive_immutable();

CREATE FUNCTION public.advisory095_archive_uat(p_request_id uuid,p_reason text,p_reviewed jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor uuid:=auth.uid(); state jsonb; after_state jsonb; r record; n integer;
 moment timestamptz:=clock_timestamp();
BEGIN
 IF NOT coalesce(public.advisory086_admin(),false) THEN
  RAISE EXCEPTION 'ADVISORY_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000
  OR p_reviewed IS NULL OR jsonb_typeof(p_reviewed)<>'object'
  OR coalesce(p_reviewed->>'rows_sha256','') !~ '^[0-9a-f]{64}$'
  OR coalesce(p_reviewed->>'preserved_sha256','') !~ '^[0-9a-f]{64}$'
  OR coalesce(p_reviewed->>'targets_sha256','') !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'ADVISORY_ARCHIVE_REVIEW_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('advisory095-fixed-uat-batch',0));
 -- One-time maintenance operation: short, deterministic SHARE locks keep the
 -- whole reviewed preservation snapshot stable. No business table is written.
 FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p') AND NOT c.relispartition AND
   (n.nspname='public' OR n.nspname='auth' AND c.relname='users'
    OR n.nspname='storage' AND c.relname IN ('buckets','objects'))
  AND c.relname<>'advisory_matter_archives' ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C"
 LOOP EXECUTE format('LOCK TABLE %I.%I IN SHARE MODE',r.nspname,r.relname); END LOOP;
 LOCK TABLE public.advisory_matter_archives IN EXCLUSIVE MODE;
 IF NOT coalesce(public.advisory086_admin(),false) THEN
  RAISE EXCEPTION 'ADVISORY_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM m.id FROM public.advisory_matters m JOIN public.advisory095_targets() t ON t.id=m.id ORDER BY m.id FOR UPDATE OF m;
 SELECT public.advisory095_capture() INTO state;
 IF NOT coalesce((state->>'targets_exact')::boolean,false) THEN RAISE EXCEPTION 'ADVISORY_ARCHIVE_IDENTITY_CHANGED'; END IF;
 IF (state->>'protected_count')::integer<>9
  OR (state#>>'{reviewed_special_evidence,time_023_minutes}')::bigint<>90
  OR (state#>>'{reviewed_special_evidence,audit_014_count}')::bigint<1
  OR state#>'{reviewed_special_evidence,snapshot_matters}'<>'["ADV-2026-019","ADV-2026-020","ADV-2026-021","ADV-2026-022","ADV-2026-023"]'::jsonb
 THEN RAISE EXCEPTION 'ADVISORY_ARCHIVE_REVIEWED_EVIDENCE_CHANGED'; END IF;
 IF state->>'rows_sha256' IS DISTINCT FROM p_reviewed->>'rows_sha256'
  OR state->>'preserved_sha256' IS DISTINCT FROM p_reviewed->>'preserved_sha256'
  OR state->>'targets_sha256' IS DISTINCT FROM p_reviewed->>'targets_sha256'
 THEN RAISE EXCEPTION 'ADVISORY_ARCHIVE_REVIEW_STALE'; END IF;
 IF state->'external_references'<>'[]'::jsonb THEN RAISE EXCEPTION 'ADVISORY_ARCHIVE_EXTERNAL_REFERENCE'; END IF;
 SELECT count(*) INTO n FROM public.advisory_matter_archives;
 IF n<>0 THEN
  IF n=11 AND NOT EXISTS(SELECT 1 FROM public.advisory_matter_archives a
    LEFT JOIN public.advisory095_targets() t ON t.id=a.matter_id AND t.matter_no=a.matter_no
    WHERE t.id IS NULL OR a.request_id<>p_request_id OR a.archived_by<>actor
     OR a.archive_reason<>btrim(p_reason) OR a.reviewed_baseline<>p_reviewed
     OR a.reviewed_matter_sha256<>(SELECT encode(sha256(convert_to(to_jsonb(m)::text,'UTF8')),'hex')
       FROM public.advisory_matters m WHERE m.id=a.matter_id))
  THEN RETURN jsonb_build_object('archived',11,'request_id',p_request_id,'replayed',true); END IF;
  RAISE EXCEPTION 'ADVISORY_ARCHIVE_RETRY_MISMATCH';
 END IF;
 INSERT INTO public.advisory_matter_archives(matter_id,matter_no,archived_at,archived_by,archive_reason,request_id,reviewed_matter_sha256,reviewed_baseline)
 SELECT m.id,m.matter_no,moment,actor,btrim(p_reason),p_request_id,
  encode(sha256(convert_to(to_jsonb(m)::text,'UTF8')),'hex'),p_reviewed
 FROM public.advisory_matters m JOIN public.advisory095_targets() t ON t.id=m.id AND t.matter_no=m.matter_no;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>11 THEN RAISE EXCEPTION 'ADVISORY_ARCHIVE_TARGET_COUNT'; END IF;
 SELECT public.advisory095_capture() INTO after_state;
 IF state IS DISTINCT FROM after_state THEN RAISE EXCEPTION 'ADVISORY_ARCHIVE_PRESERVATION_FAILED'; END IF;
 RETURN jsonb_build_object('archived',n,'request_id',p_request_id,'replayed',false);
END $fn$;
