-- Only the nine real Legacy Matters 004..012. No generic archive input or UI.
CREATE FUNCTION public.advisory096_archive_legacy(p_request_id uuid,p_reason text,p_reviewed jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor uuid:=auth.uid(); state jsonb; after_state jsonb; r record; n integer;
 moment timestamptz:=clock_timestamp(); expected_numbers text[]:=ARRAY['ADV-2026-004','ADV-2026-005','ADV-2026-006','ADV-2026-007','ADV-2026-008','ADV-2026-009','ADV-2026-010','ADV-2026-011','ADV-2026-012'];
BEGIN
 IF NOT coalesce(public.advisory086_admin(),false) THEN RAISE EXCEPTION 'ADVISORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000
  OR p_reviewed IS NULL OR jsonb_typeof(p_reviewed)<>'object'
  OR jsonb_typeof(p_reviewed->'targets') IS DISTINCT FROM 'array'
  OR jsonb_typeof(p_reviewed->'external_references') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'ADVISORY096_REVIEW_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('advisory096-fixed-legacy-batch',0));
 -- Coordinate only the target-history tables and Finance tables with target references.
 -- No auth/Storage/shared-data fingerprint or whole-database lock.
 SELECT public.advisory096_capture() INTO state;
 FOR r IN SELECT relname FROM (
  SELECT unnest(ARRAY['advisory_matters','advisory_issues','advisory_issue_tasks','advisory_time_logs',
   'advisory_advice_records','advisory_matter_control','advisory_matter_team','advisory_matter_stages',
   'advisory_stage_visits','advisory_journey_snapshots','advisory_matter_activities',
   'advisory_work_state_events','advisory_deliverables','advisory_control_requests',
   'advisory_journey_requests','case_audit_logs','office_work_logs']) relname
  UNION SELECT value->>'table_name' FROM jsonb_array_elements(state->'external_references')
 ) scoped ORDER BY relname COLLATE "C"
 LOOP EXECUTE format('LOCK TABLE public.%I IN SHARE MODE',r.relname); END LOOP;
 -- Keep only the applying Admin's eligibility stable for this transaction.
 PERFORM 1 FROM public.user_profiles WHERE id=actor FOR SHARE;
 LOCK TABLE public.advisory_matter_archives IN EXCLUSIVE MODE;
 IF NOT coalesce(public.advisory086_admin(),false) THEN RAISE EXCEPTION 'ADVISORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM m.id FROM public.advisory_matters m WHERE m.matter_no=ANY(expected_numbers) ORDER BY m.id FOR UPDATE;
 SELECT public.advisory096_capture() INTO state;
 IF NOT coalesce((state->>'targets_exact')::boolean,false)
  OR state->'targets' IS DISTINCT FROM p_reviewed->'targets'
 THEN RAISE EXCEPTION 'ADVISORY096_IDENTITY_CHANGED'; END IF;
 IF NOT coalesce((state->>'legacy_origin_readable')::boolean,false)
  OR NOT coalesce((state->>'prior_archive_exact')::boolean,false)
  OR NOT coalesce((state->>'contract095_exact')::boolean,false)
  OR NOT coalesce((state->>'foundation_exact')::boolean,false)
 THEN RAISE EXCEPTION 'ADVISORY096_ACCEPTED_STATE_CHANGED'; END IF;
 FOR r IN SELECT unnest(ARRAY['rows_sha256','preserved_sha256','targets_sha256','prior_archives_sha256']) k LOOP
  IF coalesce(p_reviewed->>r.k,'') !~ '^[0-9a-f]{64}$' OR state->>r.k IS DISTINCT FROM p_reviewed->>r.k
  THEN RAISE EXCEPTION 'ADVISORY096_REVIEW_STALE'; END IF;
 END LOOP;
 IF state->'external_references' IS DISTINCT FROM p_reviewed->'external_references' THEN RAISE EXCEPTION 'ADVISORY096_REFERENCES_CHANGED'; END IF;
 SELECT count(*) INTO n FROM public.advisory_matter_archives a WHERE a.matter_no=ANY(expected_numbers);
 IF (SELECT count(*) FROM public.advisory_matter_archives)<>11+n THEN RAISE EXCEPTION 'ADVISORY096_UNEXPECTED_ARCHIVE'; END IF;
 IF n<>0 THEN
  IF n=9 AND NOT EXISTS(SELECT 1 FROM public.advisory_matter_archives a LEFT JOIN public.advisory_matters m ON m.id=a.matter_id
   WHERE a.matter_no=ANY(expected_numbers) AND (m.id IS NULL OR m.matter_no<>a.matter_no OR a.request_id<>p_request_id OR a.archived_by<>actor
    OR a.archive_reason<>btrim(p_reason) OR a.reviewed_baseline<>p_reviewed
    OR a.reviewed_matter_sha256<>encode(sha256(convert_to(to_jsonb(m)::text,'UTF8')),'hex')))
  THEN RETURN jsonb_build_object('archived',9,'request_id',p_request_id,'replayed',true); END IF;
  RAISE EXCEPTION 'ADVISORY096_RETRY_MISMATCH';
 END IF;
 IF EXISTS(SELECT 1 FROM public.advisory_matter_archives WHERE request_id=p_request_id) THEN RAISE EXCEPTION 'ADVISORY096_REQUEST_REUSED'; END IF;
 INSERT INTO public.advisory_matter_archives(matter_id,matter_no,archived_at,archived_by,archive_reason,request_id,reviewed_matter_sha256,reviewed_baseline)
 SELECT m.id,m.matter_no,moment,actor,btrim(p_reason),p_request_id,
  encode(sha256(convert_to(to_jsonb(m)::text,'UTF8')),'hex'),p_reviewed
 FROM public.advisory_matters m WHERE m.matter_no=ANY(expected_numbers);
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>9 THEN RAISE EXCEPTION 'ADVISORY096_TARGET_COUNT'; END IF;
 SELECT public.advisory096_capture() INTO after_state;
 IF state IS DISTINCT FROM after_state THEN RAISE EXCEPTION 'ADVISORY096_PRESERVATION_FAILED'; END IF;
 RETURN jsonb_build_object('archived',n,'request_id',p_request_id,'replayed',false);
END $fn$;
