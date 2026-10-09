-- Phase 3A: manual Main Track only. No legal rules or historical backfill.
CREATE TABLE public.case_flow_versions (
 id text PRIMARY KEY, template_key text NOT NULL, version integer NOT NULL CHECK(version>0),
 family text NOT NULL, variant text NOT NULL, represented_role text NOT NULL,
 title_th text NOT NULL, title_en text NOT NULL, UNIQUE(template_key,version)
);
CREATE TABLE public.case_flow_stages (
 template_id text NOT NULL REFERENCES public.case_flow_versions(id), stage_key text NOT NULL,
 ordinal integer NOT NULL CHECK(ordinal>0), title_th text NOT NULL, title_en text NOT NULL,
 PRIMARY KEY(template_id,stage_key), UNIQUE(template_id,ordinal)
);
CREATE TABLE public.case_flow_instances (
 id uuid PRIMARY KEY, case_id bigint NOT NULL REFERENCES public.cases(id),
 track_key text NOT NULL CHECK(length(btrim(track_key)) BETWEEN 1 AND 100),
 template_id text NOT NULL REFERENCES public.case_flow_versions(id),
 filing_method text NOT NULL CHECK(filing_method IN('not_filed','paper','efiling_v3','efiling_v4')),
 current_stage text NOT NULL, started_stage text NOT NULL,
 lifecycle text NOT NULL DEFAULT 'active' CHECK(lifecycle IN('active','paused','exited')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 start_kind text NOT NULL CHECK(start_kind IN('new','cut_in')),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(), started_by uuid NOT NULL REFERENCES public.user_profiles(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_by uuid NOT NULL REFERENCES public.user_profiles(id),
 UNIQUE(case_id,track_key), UNIQUE(id,template_id),
 FOREIGN KEY(template_id,current_stage) REFERENCES public.case_flow_stages(template_id,stage_key),
 FOREIGN KEY(template_id,started_stage) REFERENCES public.case_flow_stages(template_id,stage_key)
);
CREATE TABLE public.case_flow_transitions (
 id uuid PRIMARY KEY, instance_id uuid NOT NULL, template_id text NOT NULL, sequence_no integer NOT NULL CHECK(sequence_no>0),
 event_kind text NOT NULL CHECK(event_kind IN('start','transition','correction')),
 transition_code text CHECK(transition_code IN('NEXT','REPEAT','SKIP','BRANCH','PAUSE','RETURN','PARALLEL','EXIT')),
 from_stage text, to_stage text NOT NULL, from_lifecycle text, to_lifecycle text NOT NULL CHECK(to_lifecycle IN('active','paused','exited')),
 reason text CHECK(length(reason)<=10000), corrects_id uuid,
 actor_id uuid NOT NULL REFERENCES public.user_profiles(id), occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 request_id uuid NOT NULL UNIQUE, request_data jsonb NOT NULL,
 UNIQUE(instance_id,sequence_no), UNIQUE(id,instance_id),
 FOREIGN KEY(instance_id,template_id) REFERENCES public.case_flow_instances(id,template_id),
 FOREIGN KEY(template_id,from_stage) REFERENCES public.case_flow_stages(template_id,stage_key),
 FOREIGN KEY(template_id,to_stage) REFERENCES public.case_flow_stages(template_id,stage_key),
 FOREIGN KEY(corrects_id,instance_id) REFERENCES public.case_flow_transitions(id,instance_id),
 CHECK((event_kind='start' AND sequence_no=1 AND transition_code IS NULL AND from_stage IS NULL AND from_lifecycle IS NULL AND corrects_id IS NULL)
 OR (event_kind<>'start' AND sequence_no>1 AND transition_code IS NOT NULL AND from_stage IS NOT NULL AND from_lifecycle IN('active','paused','exited'))),
 CHECK((event_kind='correction' AND corrects_id IS NOT NULL AND reason IS NOT NULL AND length(btrim(reason))>0) OR(event_kind<>'correction' AND corrects_id IS NULL))
);
-- Immutable, versioned configuration is the only seed data.
INSERT INTO public.case_flow_versions VALUES('civil_ordinary_plaintiff_v1','civil_ordinary_plaintiff',1,'civil','ordinary','plaintiff','คดีแพ่งสามัญ — ฝ่ายโจทก์','Civil Ordinary Plaintiff');
INSERT INTO public.case_flow_stages(template_id,stage_key,ordinal,title_th,title_en) VALUES
 ('civil_ordinary_plaintiff_v1','prepare_claim',1,'เตรียมและร่างคำฟ้อง','Prepare and draft claim'),
 ('civil_ordinary_plaintiff_v1','file_claim',2,'ยื่นฟ้อง','File claim'),
 ('civil_ordinary_plaintiff_v1','accepted',3,'ศาลรับฟ้อง / ได้วันนัดแรก','Claim accepted / first hearing scheduled'),
 ('civil_ordinary_plaintiff_v1','service',4,'รอและจัดการการส่งหมายจำเลย','Await and manage service on defendants'),
 ('civil_ordinary_plaintiff_v1','defence',5,'รอคำให้การ / นัดแรก','Await defence / first hearing'),
 ('civil_ordinary_plaintiff_v1','issues_mediation',6,'ชี้สองสถาน / ไกล่เกลี่ย','Settlement of issues / mediation'),
 ('civil_ordinary_plaintiff_v1','prepare_evidence',7,'เตรียมสืบพยาน','Prepare evidence hearing'),
 ('civil_ordinary_plaintiff_v1','evidence',8,'สืบพยาน','Evidence hearing'),
 ('civil_ordinary_plaintiff_v1','await_judgment',9,'รอฟังคำพิพากษา','Await judgment'),
 ('civil_ordinary_plaintiff_v1','judgment',10,'คำพิพากษาศาลชั้นต้น / รายงานผล','First-instance judgment / report'),
 ('civil_ordinary_plaintiff_v1','post_judgment',11,'หลังคำพิพากษา / วิเคราะห์และรายงาน','Post-judgment analysis and report'),
 ('civil_ordinary_plaintiff_v1','continuation',12,'รอการตัดสินใจดำเนินการต่อ','Await continuation decision');

CREATE FUNCTION public.case101_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
BEGIN RAISE EXCEPTION 'CASE101_IMMUTABLE'; END $fn$;
CREATE TRIGGER case101_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.case_flow_versions FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();
CREATE TRIGGER case101_no_truncate BEFORE TRUNCATE ON public.case_flow_versions FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();
CREATE TRIGGER case101_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.case_flow_stages FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();
CREATE TRIGGER case101_no_truncate BEFORE TRUNCATE ON public.case_flow_stages FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();
CREATE TRIGGER case101_immutable BEFORE UPDATE OR DELETE ON public.case_flow_transitions FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();
CREATE TRIGGER case101_no_truncate BEFORE TRUNCATE ON public.case_flow_transitions FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();
CREATE TRIGGER case101_no_delete BEFORE DELETE OR TRUNCATE ON public.case_flow_instances FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();
ALTER TABLE public.case_flow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_flow_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_flow_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_flow_transitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_flow_versions,public.case_flow_stages,public.case_flow_instances,public.case_flow_transitions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.case_flow_versions,public.case_flow_stages,public.case_flow_instances,public.case_flow_transitions TO authenticated;
CREATE POLICY case101_read ON public.case_flow_versions FOR SELECT TO authenticated USING(public.case097_session_ready() AND public.can_view_case_data());
CREATE POLICY case101_read ON public.case_flow_stages FOR SELECT TO authenticated USING(public.case097_session_ready() AND public.can_view_case_data());
CREATE POLICY case101_read ON public.case_flow_instances FOR SELECT TO authenticated USING(public.case097_session_ready() AND public.can_view_case_data());
CREATE POLICY case101_read ON public.case_flow_transitions FOR SELECT TO authenticated USING(public.case097_session_ready() AND public.can_view_case_data());

CREATE FUNCTION public.case101_read(p_case_id bigint) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT(public.case097_session_ready() AND public.can_view_case_data()) THEN RAISE EXCEPTION 'CASE101_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cases WHERE id=p_case_id) THEN RAISE EXCEPTION 'CASE101_NOT_FOUND'; END IF;
 RETURN jsonb_build_object(
 'template',(SELECT to_jsonb(v) FROM public.case_flow_versions v WHERE id='civil_ordinary_plaintiff_v1'),
 'stages',(SELECT jsonb_agg(to_jsonb(s) ORDER BY ordinal) FROM public.case_flow_stages s WHERE template_id='civil_ordinary_plaintiff_v1'),
 'instance',(SELECT to_jsonb(i) FROM public.case_flow_instances i WHERE case_id=p_case_id AND track_key='main'),
 'history',(SELECT coalesce(jsonb_agg((to_jsonb(t)-'request_data'-'request_id')||jsonb_build_object('actor_name',coalesce(nullif(p.staff_name,''),p.full_name)) ORDER BY sequence_no DESC),'[]') FROM public.case_flow_transitions t JOIN public.case_flow_instances i ON i.id=t.instance_id JOIN public.user_profiles p ON p.id=t.actor_id WHERE i.case_id=p_case_id AND i.track_key='main')
 );
END $fn$;
CREATE FUNCTION public.case101_save(p_case_id bigint,p_instance_id uuid,p_version integer,p_request_id uuid,p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE i public.case_flow_instances; prev public.case_flow_transitions; retried public.case_flow_transitions; actor public.user_profiles;
 target text; method text; why text; code text; state text; from_pos integer; to_pos integer; correcting uuid; eid uuid:=gen_random_uuid();
 old_facts jsonb; request jsonb:=jsonb_build_object('case_id',p_case_id,'instance_id',p_instance_id,'version',p_version,'action',p_action,'data',p_data);
BEGIN
 IF NOT(public.case097_session_ready() AND public.can_view_case_data() AND public.case097_process_writer()) THEN RAISE EXCEPTION 'CASE101_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.user_profiles WHERE id=auth.uid();
 IF p_instance_id IS NULL OR p_request_id IS NULL OR p_version IS NULL OR p_version<0 OR p_action IS NULL OR p_action NOT IN('start','advance','pause','resume','exit','correct') OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'CASE101_INVALID_INPUT'; END IF;
 IF p_action='start' AND actor.role NOT IN('admin','partner','lawyer') THEN RAISE EXCEPTION 'CASE101_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Serialize the one Main Track and immutable event receipt under the existing Case identity.
 PERFORM 1 FROM public.cases WHERE id=p_case_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CASE101_NOT_FOUND'; END IF;
 SELECT * INTO retried FROM public.case_flow_transitions WHERE request_id=p_request_id;
 IF retried.id IS NOT NULL THEN
  IF retried.actor_id<>auth.uid() OR retried.request_data IS DISTINCT FROM request THEN RAISE EXCEPTION 'CASE101_REQUEST_CONFLICT'; END IF;
  RETURN public.case101_read(p_case_id);
 END IF;
 SELECT * INTO i FROM public.case_flow_instances WHERE case_id=p_case_id AND track_key='main' FOR UPDATE;
 why:=nullif(btrim(p_data->>'reason'),''); target:=p_data->>'stage';
 IF p_action='start' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('stage','filing_method','acknowledged','start_kind')) OR p_data->'acknowledged' IS DISTINCT FROM 'true'::jsonb OR p_data->>'start_kind' IS NULL OR p_data->>'start_kind' NOT IN('new','cut_in') THEN RAISE EXCEPTION 'CASE101_INVALID_INPUT'; END IF;
  IF i.id IS NOT NULL OR p_version<>0 THEN RAISE EXCEPTION 'CASE101_STALE'; END IF;
  IF p_data->>'start_kind'='new' AND target IS DISTINCT FROM 'prepare_claim' THEN RAISE EXCEPTION 'CASE101_CUT_IN_REQUIRED'; END IF;
  method:=p_data->>'filing_method';
  INSERT INTO public.case_flow_instances(id,case_id,track_key,template_id,filing_method,current_stage,started_stage,start_kind,started_by,updated_by)
  VALUES(p_instance_id,p_case_id,'main','civil_ordinary_plaintiff_v1',method,target,target,p_data->>'start_kind',auth.uid(),auth.uid()) RETURNING * INTO i;
  INSERT INTO public.case_flow_transitions(id,instance_id,template_id,sequence_no,event_kind,to_stage,to_lifecycle,actor_id,request_id,request_data)
  VALUES(eid,i.id,i.template_id,1,'start',target,'active',auth.uid(),p_request_id,request);
 ELSE
  IF i.id IS DISTINCT FROM p_instance_id THEN RAISE EXCEPTION 'CASE101_NOT_FOUND'; END IF;
  IF i.version<>p_version THEN RAISE EXCEPTION 'CASE101_STALE'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('stage','reason','corrects_id')) THEN RAISE EXCEPTION 'CASE101_INVALID_INPUT'; END IF;
  IF p_action<>'correct' AND p_data ? 'corrects_id' THEN RAISE EXCEPTION 'CASE101_INVALID_INPUT'; END IF;
  SELECT * INTO prev FROM public.case_flow_transitions WHERE instance_id=i.id ORDER BY sequence_no DESC LIMIT 1;
  old_facts:=to_jsonb(i); state:=i.lifecycle;
  IF p_action='correct' THEN
   correcting:=(p_data->>'corrects_id')::uuid;
   IF correcting IS NULL OR correcting<>prev.id THEN RAISE EXCEPTION 'CASE101_STALE'; END IF;
   -- Correct the latest fact, preserve its original event, restore its prior lifecycle.
   state:=coalesce(prev.from_lifecycle,'active'); code:='RETURN';
  ELSIF p_action='pause' THEN
   IF i.lifecycle<>'active' THEN RAISE EXCEPTION 'CASE101_STATE'; END IF; state:='paused';code:='PAUSE';
  ELSIF p_action='resume' THEN
   IF i.lifecycle<>'paused' THEN RAISE EXCEPTION 'CASE101_STATE'; END IF; state:='active';code:='RETURN';
  ELSIF p_action='exit' THEN
   IF i.lifecycle='exited' THEN RAISE EXCEPTION 'CASE101_STATE'; END IF; state:='exited';code:='EXIT';
  ELSE
   IF i.lifecycle<>'active' THEN RAISE EXCEPTION 'CASE101_STATE'; END IF;
   SELECT ordinal INTO from_pos FROM public.case_flow_stages WHERE template_id=i.template_id AND stage_key=i.current_stage;
   SELECT ordinal INTO to_pos FROM public.case_flow_stages WHERE template_id=i.template_id AND stage_key=target;
   IF to_pos IS NULL THEN RAISE EXCEPTION 'CASE101_INVALID_INPUT'; END IF;
   code:=CASE WHEN to_pos=from_pos+1 THEN 'NEXT' WHEN to_pos=from_pos THEN 'REPEAT' WHEN to_pos>from_pos+1 THEN 'SKIP' ELSE 'RETURN' END;
  END IF;
  IF p_action IN('pause','resume','exit') THEN
   IF target IS NOT NULL AND target<>i.current_stage THEN RAISE EXCEPTION 'CASE101_INVALID_INPUT'; END IF;target:=i.current_stage;
  END IF;
  IF (code<>'NEXT' OR p_action='correct') AND why IS NULL THEN RAISE EXCEPTION 'CASE101_REASON_REQUIRED'; END IF;
  UPDATE public.case_flow_instances SET current_stage=target,lifecycle=state,version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=i.id RETURNING * INTO i;
  INSERT INTO public.case_flow_transitions(id,instance_id,template_id,sequence_no,event_kind,transition_code,from_stage,to_stage,from_lifecycle,to_lifecycle,reason,corrects_id,actor_id,request_id,request_data)
  VALUES(eid,i.id,i.template_id,i.version,CASE WHEN p_action='correct' THEN 'correction' ELSE 'transition' END,code,old_facts->>'current_stage',target,old_facts->>'lifecycle',state,why,correcting,auth.uid(),p_request_id,request);
 END IF;
 INSERT INTO public.case_audit_logs(case_id,table_name,record_id,action,user_id,user_name,user_role,old_data,new_data,note)
 VALUES(p_case_id,'case_flow_instances',i.id::text,CASE WHEN p_action='start' THEN 'create' ELSE 'update' END,auth.uid(),coalesce(nullif(actor.staff_name,''),actor.full_name),actor.role,old_facts,to_jsonb(i)||jsonb_build_object('transition_id',eid,'reason',why),'case101_'||p_action);
 RETURN public.case101_read(p_case_id);
EXCEPTION WHEN invalid_text_representation OR check_violation OR not_null_violation OR foreign_key_violation OR unique_violation THEN RAISE EXCEPTION 'CASE101_INVALID_INPUT';
END $fn$;
ALTER FUNCTION public.case101_immutable() OWNER TO postgres;
ALTER FUNCTION public.case101_read(bigint) OWNER TO postgres;
ALTER FUNCTION public.case101_save(bigint,uuid,integer,uuid,text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.case101_immutable(),public.case101_read(bigint),public.case101_save(bigint,uuid,integer,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.case101_read(bigint),public.case101_save(bigint,uuid,integer,uuid,text,jsonb) TO authenticated;
