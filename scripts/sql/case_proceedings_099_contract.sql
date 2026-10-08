-- Phase 2B facts only. Follow-ups are explicit; no procedural engine or legal date calculation.
CREATE TABLE public.case_proceedings (
 id uuid PRIMARY KEY,
 case_id bigint NOT NULL REFERENCES public.cases(id),
 kind text NOT NULL CHECK(kind IN ('hearing_report','own_motion','opponent_motion','court_order')),
 hearing_id uuid REFERENCES public.case_timeline(id),
 event_date date NOT NULL CHECK(isfinite(event_date)),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 500),
 details text NOT NULL CHECK(length(btrim(details)) BETWEEN 1 AND 20000),
 court_result text, party_statement text, note text, document_ref text,
 next_hearing_id uuid REFERENCES public.case_timeline(id),
 deadline_id uuid REFERENCES public.case_deadlines(id),
 handoff jsonb NOT NULL DEFAULT '{}'::jsonb,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 last_request_id uuid NOT NULL,
 last_request jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES public.user_profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid NOT NULL REFERENCES public.user_profiles(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((kind='hearing_report')=(hearing_id IS NOT NULL)),
 CHECK(length(coalesce(court_result,''))<=20000 AND length(coalesce(party_statement,''))<=20000 AND length(coalesce(note,''))<=20000),
 CHECK(document_ref IS NULL OR (length(document_ref)<=2000 AND document_ref ~ '^https://[^[:space:]]+$'))
);
CREATE UNIQUE INDEX case099_one_report ON public.case_proceedings(hearing_id) WHERE hearing_id IS NOT NULL;
CREATE INDEX case099_case_date ON public.case_proceedings(case_id,event_date DESC,created_at DESC);
ALTER TABLE public.case_proceedings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_proceedings FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.case_proceedings TO authenticated;
CREATE POLICY case099_read ON public.case_proceedings FOR SELECT TO authenticated
 USING(public.case097_session_ready() AND public.can_view_case_data());

CREATE FUNCTION public.case099_read(p_case_id bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT(public.case097_session_ready() AND public.can_view_case_data()) THEN RAISE EXCEPTION 'CASE099_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cases WHERE id=p_case_id) THEN RAISE EXCEPTION 'CASE099_NOT_FOUND'; END IF;
 RETURN (SELECT coalesce(jsonb_agg((to_jsonb(r)-'last_request'-'last_request_id')||jsonb_build_object(
  'author_name',coalesce(nullif(a.staff_name,''),a.full_name),
  'editor_name',coalesce(nullif(e.staff_name,''),e.full_name),
  'next_hearing',(SELECT jsonb_build_object('date',h.event_date,'title',coalesce(h.appointment_other,h.appointment_type),'status',h.status,'deleted',h.deleted_at IS NOT NULL) FROM public.case_timeline h WHERE h.id=r.next_hearing_id),
  'deadline',(SELECT jsonb_build_object('date',d.current_due_date,'title',d.deadline_other,'status',d.status,'deleted',d.deleted_at IS NOT NULL) FROM public.case_deadlines d WHERE d.id=r.deadline_id)) ORDER BY r.event_date DESC,r.created_at DESC,r.id),'[]')
 FROM public.case_proceedings r JOIN public.user_profiles a ON a.id=r.created_by JOIN public.user_profiles e ON e.id=r.updated_by WHERE r.case_id=p_case_id);
END $fn$;

CREATE FUNCTION public.case099_save(p_case_id bigint,p_id uuid,p_version integer,p_request_id uuid,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE
 old_row public.case_proceedings; saved public.case_proceedings;
 hearing public.case_timeline; follow_hearing public.case_timeline; deadline public.case_deadlines;
 actor public.user_profiles; facts jsonb; followups jsonb; entry jsonb; person uuid;
 old_hearing jsonb; team jsonb; result jsonb; core_version integer; report_date date;
 request jsonb:=jsonb_build_object('case_id',p_case_id,'version',p_version,'data',p_data);
BEGIN
 IF NOT(public.case097_session_ready() AND public.can_view_case_data() AND public.case097_process_writer()) THEN RAISE EXCEPTION 'CASE099_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_request_id IS NULL OR p_version IS NULL OR p_version<0 OR jsonb_typeof(p_data) IS DISTINCT FROM 'object'
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN ('facts','followups','hearing_updated_at','core_version')) THEN RAISE EXCEPTION 'CASE099_INVALID_INPUT'; END IF;
 -- Same lock order as 098. Serializes report/follow-up creation within this Case.
 PERFORM 1 FROM public.cases WHERE id=p_case_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CASE099_NOT_FOUND'; END IF;
 SELECT * INTO old_row FROM public.case_proceedings WHERE id=p_id FOR UPDATE;
 IF old_row.id IS NOT NULL THEN
  IF old_row.case_id<>p_case_id THEN RAISE EXCEPTION 'CASE099_NOT_FOUND'; END IF;
  IF old_row.last_request_id=p_request_id THEN
   IF old_row.last_request IS DISTINCT FROM request OR old_row.updated_by<>auth.uid() THEN RAISE EXCEPTION 'CASE099_REQUEST_CONFLICT'; END IF;
   RETURN public.case099_read(p_case_id);
  END IF;
 END IF;
 IF coalesce(old_row.version,0)<>p_version THEN RAISE EXCEPTION 'CASE099_STALE'; END IF;
 facts:=p_data->'facts'; followups:=coalesce(p_data->'followups','{}');
 IF jsonb_typeof(facts) IS DISTINCT FROM 'object' OR jsonb_typeof(followups) IS DISTINCT FROM 'object'
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(facts) k WHERE k NOT IN ('kind','hearing_id','event_date','title','details','court_result','party_statement','note','document_ref'))
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(followups) k WHERE k NOT IN ('hearing','deadline','next','current_actor')) THEN RAISE EXCEPTION 'CASE099_INVALID_INPUT'; END IF;
 IF old_row.id IS NOT NULL AND followups<>'{}' THEN RAISE EXCEPTION 'CASE099_FOLLOWUPS_ALREADY_SAVED'; END IF;
 IF old_row.id IS NOT NULL AND ((old_row.kind='hearing_report') IS DISTINCT FROM (facts->>'kind'='hearing_report') OR old_row.hearing_id IS DISTINCT FROM nullif(facts->>'hearing_id','')::uuid) THEN RAISE EXCEPTION 'CASE099_IDENTITY_FIXED'; END IF;
 report_date:=(facts->>'event_date')::date;
 IF facts->>'kind'='hearing_report' THEN
  SELECT * INTO hearing FROM public.case_timeline WHERE id=(facts->>'hearing_id')::uuid AND case_id=p_case_id FOR UPDATE;
  IF NOT FOUND OR hearing.deleted_at IS NOT NULL OR hearing.event_type<>'hearing' OR hearing.status='Cancelled' THEN RAISE EXCEPTION 'CASE099_HEARING_UNAVAILABLE'; END IF;
  IF old_row.id IS NULL THEN
   IF hearing.updated_at IS DISTINCT FROM (p_data->>'hearing_updated_at')::timestamptz THEN RAISE EXCEPTION 'CASE099_HEARING_STALE'; END IF;
   IF hearing.event_date IS NULL OR hearing.event_date !~ '^\d{4}-\d{2}-\d{2}$' OR hearing.event_date::date>(now() AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION 'CASE099_HEARING_NOT_HELD'; END IF;
   IF EXISTS(SELECT 1 FROM public.case_proceedings WHERE hearing_id=hearing.id) THEN RAISE EXCEPTION 'CASE099_REPORT_EXISTS'; END IF;
   report_date:=hearing.event_date::date;
  ELSIF report_date IS DISTINCT FROM old_row.event_date THEN RAISE EXCEPTION 'CASE099_IDENTITY_FIXED'; END IF;
 END IF;
 -- Explicitly selected assignment identities only, using the Phase 2A operational picker rule.
 FOR person IN SELECT v FROM (VALUES(nullif(followups->>'current_actor','')::uuid),(nullif(followups#>>'{next,assignee_id}','')::uuid)) x(v) WHERE v IS NOT NULL LOOP
  PERFORM 1 FROM public.user_profiles p WHERE p.id=person AND p.active IS TRUE AND p.account_type='operational' AND p.assignable IS TRUE
   AND p.must_change_password IS FALSE AND p.role IN ('admin','partner','lawyer','assistant_lawyer','staff') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CASE099_PERSON_INELIGIBLE'; END IF;
 END LOOP;
 IF followups ? 'current_actor' AND nullif(followups->>'current_actor','') IS NULL THEN RAISE EXCEPTION 'CASE099_INVALID_INPUT'; END IF;
 IF followups ? 'next' OR followups ? 'current_actor' THEN
  SELECT coalesce((SELECT version FROM public.case_work_core WHERE case_id=p_case_id),0) INTO core_version;
  IF core_version IS DISTINCT FROM (p_data->>'core_version')::integer THEN RAISE EXCEPTION 'CASE099_CORE_STALE'; END IF;
 END IF;
 SELECT * INTO actor FROM public.user_profiles WHERE id=auth.uid();
 IF old_row.id IS NULL AND hearing.id IS NOT NULL AND hearing.status IS DISTINCT FROM 'Done' THEN
  old_hearing:=to_jsonb(hearing);
  UPDATE public.case_timeline SET status='Done',updated_at=clock_timestamp() WHERE id=hearing.id RETURNING * INTO hearing;
  INSERT INTO public.case_audit_logs(case_id,table_name,record_id,action,user_id,user_name,user_role,old_data,new_data,note)
  VALUES(p_case_id,'case_timeline',hearing.id::text,'update',auth.uid(),coalesce(nullif(actor.staff_name,''),actor.full_name),actor.role,old_hearing,to_jsonb(hearing),'case099_hearing_done');
 END IF;
 IF followups ? 'hearing' THEN
  entry:=followups->'hearing';
  IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(entry) k WHERE k NOT IN ('date','time','title','note'))
   OR NOT coalesce(isfinite((entry->>'date')::date),false) OR nullif(btrim(entry->>'title'),'') IS NULL OR length(entry->>'title')>500
   OR (nullif(entry->>'time','') IS NOT NULL AND (entry->>'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN RAISE EXCEPTION 'CASE099_INVALID_HEARING'; END IF;
  INSERT INTO public.case_timeline(case_id,event_type,event_date,event_time,appointment_type,appointment_other,note,order_no,status)
  VALUES(p_case_id,'hearing',((entry->>'date')::date)::text,nullif(entry->>'time',''),'นัดอื่นๆ',btrim(entry->>'title'),nullif(entry->>'note',''),
   (SELECT coalesce(max(order_no),0)+1 FROM public.case_timeline WHERE case_id=p_case_id AND event_type='hearing'),'Scheduled') RETURNING * INTO follow_hearing;
  INSERT INTO public.case_audit_logs(case_id,table_name,record_id,action,user_id,user_name,user_role,new_data,note)
  VALUES(p_case_id,'case_timeline',follow_hearing.id::text,'create',auth.uid(),coalesce(nullif(actor.staff_name,''),actor.full_name),actor.role,to_jsonb(follow_hearing),'case099_followup');
 END IF;
 IF followups ? 'deadline' THEN
  entry:=followups->'deadline';
  IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(entry) k WHERE k NOT IN ('date','title','note'))
   OR NOT coalesce(isfinite((entry->>'date')::date),false) OR nullif(btrim(entry->>'title'),'') IS NULL OR length(entry->>'title')>500 THEN RAISE EXCEPTION 'CASE099_INVALID_DEADLINE'; END IF;
  INSERT INTO public.case_deadlines(case_id,deadline_type,deadline_other,original_due_date,current_due_date,note,status,order_no)
  VALUES(p_case_id,'other',btrim(entry->>'title'),(entry->>'date')::date,(entry->>'date')::date,nullif(entry->>'note',''),'Active',
   (SELECT coalesce(max(order_no),0)+1 FROM public.case_deadlines WHERE case_id=p_case_id)) RETURNING * INTO deadline;
  INSERT INTO public.case_audit_logs(case_id,table_name,record_id,action,user_id,user_name,user_role,new_data,note)
  VALUES(p_case_id,'case_deadlines',deadline.id::text,'create',auth.uid(),coalesce(nullif(actor.staff_name,''),actor.full_name),actor.role,to_jsonb(deadline),'case099_followup');
 END IF;
 IF followups ? 'next' THEN
  IF followups#>>'{next,mode}' NOT IN ('manual','task') OR followups#>>'{next,mode}' IS NULL THEN RAISE EXCEPTION 'CASE099_INVALID_INPUT'; END IF;
  result:=public.case098_save(p_case_id,core_version,'next',followups->'next'); core_version:=(result#>>'{core,version}')::integer;
 END IF;
 IF followups ? 'current_actor' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('person_id',person_id,'team_role',team_role) ORDER BY team_role,person_id),'[]') INTO team FROM public.case_team_assignments WHERE case_id=p_case_id AND team_role<>'current_actor';
  result:=public.case098_save(p_case_id,core_version,'team',jsonb_build_object('assignments',team||jsonb_build_array(jsonb_build_object('person_id',followups->>'current_actor','team_role','current_actor'))));
 END IF;
 IF old_row.id IS NULL THEN
  INSERT INTO public.case_proceedings(id,case_id,kind,hearing_id,event_date,title,details,court_result,party_statement,note,document_ref,next_hearing_id,deadline_id,handoff,last_request_id,last_request,created_by,updated_by)
  VALUES(p_id,p_case_id,facts->>'kind',nullif(facts->>'hearing_id','')::uuid,report_date,btrim(facts->>'title'),btrim(facts->>'details'),nullif(facts->>'court_result',''),nullif(facts->>'party_statement',''),nullif(facts->>'note',''),nullif(facts->>'document_ref',''),follow_hearing.id,deadline.id,
   CASE WHEN result IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('requested',followups-'hearing'-'deadline','core',result->'core','team',result->'team',
    'people',(SELECT coalesce(jsonb_agg(v),'[]') FROM jsonb_array_elements(result->'people') v WHERE v->>'id'=result#>>'{core,next_assignee_id}' OR v->>'id'=followups->>'current_actor'),
    'task',(SELECT v FROM jsonb_array_elements(result->'tasks') v WHERE v->>'id'=result#>>'{core,next_task_id}')) END,p_request_id,request,auth.uid(),auth.uid()) RETURNING * INTO saved;
 ELSE
  UPDATE public.case_proceedings SET kind=facts->>'kind',event_date=report_date,title=btrim(facts->>'title'),details=btrim(facts->>'details'),court_result=nullif(facts->>'court_result',''),party_statement=nullif(facts->>'party_statement',''),note=nullif(facts->>'note',''),document_ref=nullif(facts->>'document_ref',''),version=version+1,last_request_id=p_request_id,last_request=request,updated_by=auth.uid(),updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO saved;
 END IF;
 INSERT INTO public.case_audit_logs(case_id,table_name,record_id,action,user_id,user_name,user_role,old_data,new_data,note)
 VALUES(p_case_id,'case_proceedings',p_id::text,CASE WHEN old_row.id IS NULL THEN 'create' ELSE 'update' END,auth.uid(),coalesce(nullif(actor.staff_name,''),actor.full_name),actor.role,
  CASE WHEN old_row.id IS NULL THEN NULL ELSE to_jsonb(old_row)-'last_request'-'last_request_id' END,to_jsonb(saved)-'last_request'-'last_request_id','case099_saved');
 RETURN public.case099_read(p_case_id);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR check_violation OR unique_violation OR not_null_violation OR foreign_key_violation THEN RAISE EXCEPTION 'CASE099_INVALID_INPUT';
END $fn$;
ALTER FUNCTION public.case099_read(bigint) OWNER TO postgres;
ALTER FUNCTION public.case099_save(bigint,uuid,integer,uuid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.case099_read(bigint),public.case099_save(bigint,uuid,integer,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.case099_read(bigint),public.case099_save(bigint,uuid,integer,uuid,jsonb) TO authenticated;
