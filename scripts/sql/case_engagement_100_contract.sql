-- Phase 2C: factual engagement decisions, exceptional help requests and close reviews.
-- No legal status, procedural stages, task mutation or historical backfill.
CREATE TABLE public.case_continuation_decisions (
 id uuid PRIMARY KEY, case_id bigint NOT NULL REFERENCES public.cases(id),
 sequence_no integer NOT NULL CHECK(sequence_no>0),
 decision text NOT NULL CHECK(decision IN ('waiting','continue','end')),
 confirmed_on date, note text CHECK(length(note)<=10000),
 request_id uuid NOT NULL, request_data jsonb NOT NULL,
 recorded_by uuid NOT NULL REFERENCES public.user_profiles(id), recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(case_id,sequence_no), UNIQUE(id,case_id),
 CHECK((decision='waiting' AND confirmed_on IS NULL) OR (decision IN ('continue','end') AND confirmed_on IS NOT NULL AND isfinite(confirmed_on)))
);
CREATE TABLE public.case_rescue_requests (
 id uuid PRIMARY KEY, case_id bigint NOT NULL REFERENCES public.cases(id),
 requested_by uuid NOT NULL REFERENCES public.user_profiles(id),
 escalated_to uuid NOT NULL REFERENCES public.user_profiles(id),
 subject text NOT NULL CHECK(length(btrim(subject)) BETWEEN 1 AND 500),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 10000),
 occurred_at timestamptz NOT NULL CHECK(isfinite(occurred_at)),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 resolution text, resolved_at timestamptz, resolved_by uuid REFERENCES public.user_profiles(id),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), last_request_id uuid NOT NULL, last_request jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_by uuid NOT NULL REFERENCES public.user_profiles(id), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((status='open' AND resolution IS NULL AND resolved_at IS NULL AND resolved_by IS NULL) OR
 (status='resolved' AND length(btrim(resolution)) BETWEEN 1 AND 10000 AND resolution IS NOT NULL AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL))
);
CREATE INDEX case100_rescue_case ON public.case_rescue_requests(case_id,occurred_at DESC,id);
CREATE TABLE public.case_close_reviews (
 id uuid PRIMARY KEY, case_id bigint NOT NULL REFERENCES public.cases(id),
 decision_id uuid NOT NULL UNIQUE, FOREIGN KEY(decision_id,case_id) REFERENCES public.case_continuation_decisions(id,case_id),
 objective text NOT NULL CHECK(objective IN ('achieved','partial','not_achieved','not_applicable')),
 variance text CHECK(length(variance)<=10000), lessons text CHECK(length(lessons)<=10000),
 knowledge text CHECK(length(knowledge)<=10000), document_ref text CHECK(document_ref IS NULL OR(length(document_ref)<=2000 AND document_ref ~ '^https://[^[:space:]]+$')),
 closed_at date NOT NULL CHECK(isfinite(closed_at)),
 team_evidence jsonb NOT NULL, -- observed People IDs/roles at review creation, never guessed from owner text
 recorded_by uuid NOT NULL REFERENCES public.user_profiles(id), recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_by uuid NOT NULL REFERENCES public.user_profiles(id), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), last_request_id uuid NOT NULL, last_request jsonb NOT NULL
);
CREATE INDEX case100_review_case ON public.case_close_reviews(case_id,closed_at DESC,id);
ALTER TABLE public.case_continuation_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_rescue_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_close_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_continuation_decisions,public.case_rescue_requests,public.case_close_reviews FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.case_continuation_decisions,public.case_rescue_requests,public.case_close_reviews TO authenticated;
CREATE POLICY case100_read ON public.case_continuation_decisions FOR SELECT TO authenticated USING(public.case097_session_ready() AND public.can_view_case_data());
CREATE POLICY case100_read ON public.case_rescue_requests FOR SELECT TO authenticated USING(public.case097_session_ready() AND public.can_view_case_data());
CREATE POLICY case100_read ON public.case_close_reviews FOR SELECT TO authenticated USING(public.case097_session_ready() AND public.can_view_case_data());

CREATE FUNCTION public.case100_read(p_case_id bigint) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT(public.case097_session_ready() AND public.can_view_case_data()) THEN RAISE EXCEPTION 'CASE100_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cases WHERE id=p_case_id) THEN RAISE EXCEPTION 'CASE100_NOT_FOUND'; END IF;
 RETURN jsonb_build_object(
 'decisions',(SELECT coalesce(jsonb_agg((to_jsonb(d)-'request_id'-'request_data')||jsonb_build_object('author_name',coalesce(nullif(p.staff_name,''),p.full_name)) ORDER BY d.sequence_no DESC),'[]') FROM public.case_continuation_decisions d JOIN public.user_profiles p ON p.id=d.recorded_by WHERE d.case_id=p_case_id),
 'rescues',(SELECT coalesce(jsonb_agg((to_jsonb(r)-'last_request_id'-'last_request')||jsonb_build_object('requester_name',coalesce(nullif(p.staff_name,''),p.full_name),'recipient_name',coalesce(nullif(t.staff_name,''),t.full_name),'editor_name',coalesce(nullif(e.staff_name,''),e.full_name),'resolver_name',coalesce(nullif(v.staff_name,''),v.full_name)) ORDER BY r.occurred_at DESC,r.id),'[]') FROM public.case_rescue_requests r JOIN public.user_profiles p ON p.id=r.requested_by JOIN public.user_profiles t ON t.id=r.escalated_to JOIN public.user_profiles e ON e.id=r.updated_by LEFT JOIN public.user_profiles v ON v.id=r.resolved_by WHERE r.case_id=p_case_id),
 'reviews',(SELECT coalesce(jsonb_agg((to_jsonb(r)-'last_request_id'-'last_request')||jsonb_build_object('author_name',coalesce(nullif(p.staff_name,''),p.full_name),'editor_name',coalesce(nullif(e.staff_name,''),e.full_name)) ORDER BY r.recorded_at DESC,r.id),'[]') FROM public.case_close_reviews r JOIN public.user_profiles p ON p.id=r.recorded_by JOIN public.user_profiles e ON e.id=r.updated_by WHERE r.case_id=p_case_id)
 );
END $fn$;

CREATE FUNCTION public.case100_save(p_case_id bigint,p_section text,p_id uuid,p_version integer,p_request_id uuid,p_current_decision uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE d public.case_continuation_decisions; current_d public.case_continuation_decisions;
 r public.case_rescue_requests; review public.case_close_reviews; actor public.user_profiles;
 old_facts jsonb; new_facts jsonb; table_name text; person uuid; facts jsonb; confirmed date; closed date; occurred timestamptz;
 request jsonb:=jsonb_build_object('case_id',p_case_id,'section',p_section,'version',p_version,'current_decision',p_current_decision,'data',p_data);
BEGIN
 IF NOT(public.case097_session_ready() AND public.can_view_case_data() AND public.case097_process_writer()) THEN RAISE EXCEPTION 'CASE100_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_request_id IS NULL OR p_section IS NULL OR p_section NOT IN('decision','rescue','review') OR p_version IS NULL OR p_version<0 OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'CASE100_INVALID_INPUT'; END IF;
 PERFORM 1 FROM public.cases WHERE id=p_case_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CASE100_NOT_FOUND'; END IF;
 SELECT * INTO actor FROM public.user_profiles WHERE id=auth.uid();
 SELECT * INTO current_d FROM public.case_continuation_decisions WHERE case_id=p_case_id ORDER BY sequence_no DESC LIMIT 1;
 IF p_section='decision' THEN
  SELECT * INTO d FROM public.case_continuation_decisions WHERE id=p_id;
  IF d.id IS NOT NULL THEN
   IF d.case_id<>p_case_id THEN RAISE EXCEPTION 'CASE100_NOT_FOUND'; END IF;
   IF d.request_id=p_request_id AND d.request_data=request AND d.recorded_by=auth.uid() THEN RETURN public.case100_read(p_case_id); END IF;
   RAISE EXCEPTION 'CASE100_DECISION_APPEND_ONLY';
  END IF;
  IF p_version<>0 OR current_d.id IS DISTINCT FROM p_current_decision THEN RAISE EXCEPTION 'CASE100_STALE'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('decision','confirmed_on','note')) THEN RAISE EXCEPTION 'CASE100_INVALID_INPUT'; END IF;
  confirmed:=nullif(p_data->>'confirmed_on','')::date;
  IF confirmed>(now() AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION 'CASE100_INVALID_DATE'; END IF;
  INSERT INTO public.case_continuation_decisions(id,case_id,sequence_no,decision,confirmed_on,note,request_id,request_data,recorded_by)
   VALUES(p_id,p_case_id,coalesce(current_d.sequence_no,0)+1,p_data->>'decision',confirmed,nullif(btrim(p_data->>'note'),''),p_request_id,request,auth.uid()) RETURNING * INTO d;
  table_name:='case_continuation_decisions'; new_facts:=to_jsonb(d)-'request_id'-'request_data';
 ELSIF p_section='rescue' THEN
  SELECT * INTO r FROM public.case_rescue_requests WHERE id=p_id FOR UPDATE;
  IF r.id IS NOT NULL THEN
   IF r.case_id<>p_case_id THEN RAISE EXCEPTION 'CASE100_NOT_FOUND'; END IF;
   IF r.last_request_id=p_request_id THEN
    IF r.last_request IS DISTINCT FROM request OR r.updated_by<>auth.uid() THEN RAISE EXCEPTION 'CASE100_REQUEST_CONFLICT'; END IF;
    RETURN public.case100_read(p_case_id);
   END IF;
  END IF;
  IF coalesce(r.version,0)<>p_version THEN RAISE EXCEPTION 'CASE100_STALE'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('escalated_to','subject','reason','occurred_at','status','resolution')) THEN RAISE EXCEPTION 'CASE100_INVALID_INPUT'; END IF;
  person:=(p_data->>'escalated_to')::uuid; occurred:=(p_data->>'occurred_at')::timestamptz;
  IF person IS NULL THEN RAISE EXCEPTION 'CASE100_PERSON_INELIGIBLE'; END IF;
  IF r.id IS NULL OR person IS DISTINCT FROM r.escalated_to THEN
   PERFORM 1 FROM public.user_profiles WHERE id=person AND active IS TRUE AND account_type='operational' AND assignable IS TRUE AND must_change_password IS FALSE AND role IN('admin','partner','lawyer','assistant_lawyer','staff') FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'CASE100_PERSON_INELIGIBLE'; END IF;
  END IF;
  IF occurred>clock_timestamp() THEN RAISE EXCEPTION 'CASE100_INVALID_DATE'; END IF;
  old_facts:=CASE WHEN r.id IS NULL THEN NULL ELSE to_jsonb(r)-'last_request_id'-'last_request' END;
  IF r.id IS NULL THEN
   INSERT INTO public.case_rescue_requests(id,case_id,requested_by,escalated_to,subject,reason,occurred_at,status,resolution,resolved_at,resolved_by,last_request_id,last_request,updated_by)
   VALUES(p_id,p_case_id,auth.uid(),person,btrim(p_data->>'subject'),btrim(p_data->>'reason'),occurred,p_data->>'status',nullif(btrim(p_data->>'resolution'),''),CASE WHEN p_data->>'status'='resolved' THEN clock_timestamp() END,CASE WHEN p_data->>'status'='resolved' THEN auth.uid() END,p_request_id,request,auth.uid()) RETURNING * INTO r;
  ELSE
   UPDATE public.case_rescue_requests SET escalated_to=person,subject=btrim(p_data->>'subject'),reason=btrim(p_data->>'reason'),occurred_at=occurred,status=p_data->>'status',resolution=nullif(btrim(p_data->>'resolution'),''),
    resolved_at=CASE WHEN p_data->>'status'='resolved' THEN coalesce(r.resolved_at,clock_timestamp()) END,resolved_by=CASE WHEN p_data->>'status'='resolved' THEN coalesce(r.resolved_by,auth.uid()) END,
    version=p_version+1,last_request_id=p_request_id,last_request=request,updated_by=auth.uid(),updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO r;
  END IF;
  table_name:='case_rescue_requests'; new_facts:=to_jsonb(r)-'last_request_id'-'last_request';
 ELSE
  SELECT * INTO review FROM public.case_close_reviews WHERE id=p_id FOR UPDATE;
  IF review.id IS NOT NULL THEN
   IF review.case_id<>p_case_id THEN RAISE EXCEPTION 'CASE100_NOT_FOUND'; END IF;
   IF review.last_request_id=p_request_id THEN
    IF review.last_request IS DISTINCT FROM request OR review.updated_by<>auth.uid() THEN RAISE EXCEPTION 'CASE100_REQUEST_CONFLICT'; END IF;
    RETURN public.case100_read(p_case_id);
   END IF;
  END IF;
  IF coalesce(review.version,0)<>p_version THEN RAISE EXCEPTION 'CASE100_STALE'; END IF;
  IF current_d.id IS DISTINCT FROM p_current_decision THEN RAISE EXCEPTION 'CASE100_STALE'; END IF;
  IF current_d.decision IS DISTINCT FROM 'end' OR (review.id IS NOT NULL AND review.decision_id<>current_d.id) THEN RAISE EXCEPTION 'CASE100_END_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('objective','variance','lessons','knowledge','document_ref','closed_at')) THEN RAISE EXCEPTION 'CASE100_INVALID_INPUT'; END IF;
  closed:=(p_data->>'closed_at')::date;
  IF closed>(now() AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION 'CASE100_INVALID_DATE'; END IF;
  old_facts:=CASE WHEN review.id IS NULL THEN NULL ELSE to_jsonb(review)-'last_request_id'-'last_request' END;
  IF review.id IS NULL THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('person_id',t.person_id,'team_role',t.team_role,'name',coalesce(nullif(p.staff_name,''),p.full_name)) ORDER BY t.team_role,t.person_id),'[]') INTO facts FROM public.case_team_assignments t JOIN public.user_profiles p ON p.id=t.person_id WHERE t.case_id=p_case_id;
   INSERT INTO public.case_close_reviews(id,case_id,decision_id,objective,variance,lessons,knowledge,document_ref,closed_at,team_evidence,recorded_by,updated_by,last_request_id,last_request)
   VALUES(p_id,p_case_id,current_d.id,p_data->>'objective',nullif(btrim(p_data->>'variance'),''),nullif(btrim(p_data->>'lessons'),''),nullif(btrim(p_data->>'knowledge'),''),nullif(btrim(p_data->>'document_ref'),''),closed,facts,auth.uid(),auth.uid(),p_request_id,request) RETURNING * INTO review;
  ELSE
   UPDATE public.case_close_reviews SET objective=p_data->>'objective',variance=nullif(btrim(p_data->>'variance'),''),lessons=nullif(btrim(p_data->>'lessons'),''),knowledge=nullif(btrim(p_data->>'knowledge'),''),document_ref=nullif(btrim(p_data->>'document_ref'),''),closed_at=closed,updated_by=auth.uid(),updated_at=clock_timestamp(),version=p_version+1,last_request_id=p_request_id,last_request=request WHERE id=p_id RETURNING * INTO review;
  END IF;
  table_name:='case_close_reviews'; new_facts:=to_jsonb(review)-'last_request_id'-'last_request';
 END IF;
 INSERT INTO public.case_audit_logs(case_id,table_name,record_id,action,user_id,user_name,user_role,old_data,new_data,note)
 VALUES(p_case_id,table_name,p_id::text,CASE WHEN old_facts IS NULL THEN 'create' ELSE 'update' END,auth.uid(),coalesce(nullif(actor.staff_name,''),actor.full_name),actor.role,old_facts,new_facts,'case100_'||p_section);
 RETURN public.case100_read(p_case_id);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR check_violation OR unique_violation OR not_null_violation OR foreign_key_violation THEN RAISE EXCEPTION 'CASE100_INVALID_INPUT';
END $fn$;
ALTER FUNCTION public.case100_read(bigint) OWNER TO postgres;
ALTER FUNCTION public.case100_save(bigint,text,uuid,integer,uuid,uuid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.case100_read(bigint),public.case100_save(bigint,text,uuid,integer,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.case100_read(bigint),public.case100_save(bigint,text,uuid,integer,uuid,uuid,jsonb) TO authenticated;
