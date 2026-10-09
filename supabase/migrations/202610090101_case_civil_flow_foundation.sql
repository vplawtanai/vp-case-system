-- 101 Phase 3A: Human Apply only. Additive DDL and immutable template seed only; no legacy DML/backfill.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
LOCK TABLE public.case_audit_logs,public.case_court_filings,public.case_deadline_extensions,public.case_deadlines,public.case_enforcement_assets,public.case_enforcements,public.case_expense_items,public.case_fee_items,public.case_fees,public.case_judgments,public.case_notes,public.case_services,public.case_tasks,public.case_time_logs,public.case_timeline,public.cases,public.file_no_counters,public.parties,public.case_work_core,public.case_team_assignments,public.case_proceedings,public.case_continuation_decisions,public.case_rescue_requests,public.case_close_reviews IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ DECLARE actual jsonb; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'CASE101_OWNER_REQUIRED'; END IF;
 WITH raw AS (WITH rels AS (SELECT c.*,n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname=ANY(ARRAY['case_audit_logs','case_court_filings','case_deadline_extensions','case_deadlines','case_enforcement_assets','case_enforcements','case_expense_items','case_fee_items','case_fees','case_judgments','case_notes','case_services','case_tasks','case_time_logs','case_timeline','cases','file_no_counters','parties','case_work_core','case_team_assignments','case_proceedings','case_continuation_decisions','case_rescue_requests','case_close_reviews']) AND c.relkind='r')
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
 AND (p.oid::regprocedure::text=ANY(ARRAY['can_create_case()','can_view_audit_logs()','can_view_case_data()','can_view_financial_data()','can_write_case_data()','can_write_financial_data()','create_case_with_number(uuid)','generate_file_no()']) OR p.proname LIKE 'case097_%' OR p.proname LIKE 'case098_%' OR p.proname LIKE 'case099_%' OR p.proname LIKE 'case100_%')))) SELECT jsonb_build_object('tables',(SELECT coalesce(jsonb_object_agg(key,encode(sha256(convert_to((value)::text,'UTF8')),'hex')),'{}') FROM jsonb_each(c->'tables')),'functions',(SELECT coalesce(jsonb_object_agg(key,encode(sha256(convert_to((value)::text,'UTF8')),'hex')),'{}') FROM jsonb_each(c->'functions'))) FROM raw r(c) INTO actual;
 IF actual IS DISTINCT FROM '{"tables":{"cases":"9853e5d4cae8197058b89762f07fa927ad2a2049c0df4f68e1bda2a60c83c4a4","parties":"d3c1b6fd86f21a548e5b2ce8fe00dfde89c0832e9c85fd4aad39a482e9b1fdeb","case_fees":"e621ea8898b053ff2413ff451556c73750830a76b15c0c7726611395ed7713dd","case_notes":"ac52d2a11b930c65a9be4460d0ac8a7c7229fee981ffc704c131c82b6d5b5559","case_tasks":"8db6701ea72a874abb30d0ea756fee8193d9b509204ebb5f7cc14a9d50c4b062","case_services":"d23afe7141a87a590086f529395f66b3b5d449b4aac161d9720adca4feb5c960","case_timeline":"5af938891b1bc8035b4951568457e5fd88038a16395868658bbe7ab066005537","case_deadlines":"587ddce405382527f91ea30b3c4253ea4530f60369a92db50bdb5b9d83ce58fb","case_fee_items":"362b11033fd2b524f04adb53751dc36620c21f8334a63e2db2a3825c8f6ea2a8","case_judgments":"05b70a994a61224b0275fb93c6d8fc04c3027e35117e90e01b573cc18d189d83","case_time_logs":"118f721eab6b6f416b1df2928ebeb48c1fb5a0a4b55717a1e035a6fe39c1b800","case_work_core":"3148bdc36579d8b081fc7be368c8360e718978e6addd5224248348c6bb3cde50","case_audit_logs":"10553ce47f6cc568656ebacf8e8435235d92456c8f2566f78a6344f597e75113","case_proceedings":"e5126488daf57a7c496d2bfc65095b3db017f79fcd4fb9486e751ef84b2958d2","file_no_counters":"f6bdf323fe0ec5295d54f83aedb69b624c2bc67bfb5e2ade4d7a871854244e0d","case_enforcements":"a5ddea95b974a174a6aa86af899091f095c82a2b3ad6a056d10bf2ce65f0810b","case_close_reviews":"ea6f1070d2e790dab2bad6e9504a981375459ac630e72bdb8fc8594ded0c9a12","case_court_filings":"ceafc851c49a128a426cacca71fee530741229dd9afdcc27c1ec36cafa8c0b01","case_expense_items":"fdee8c2f3bb47252bd620062ae566d814ff7f29d24224c87947e6eccba7aa8f1","case_rescue_requests":"db561570f08c218218a6e4137dc286c7ed55e2c6754a3e8ee95c19f9ab2b33ef","case_team_assignments":"7051944c36eaec1dd64a2892fa4d616946fb8d9411f03ac4dbcda48301942f6a","case_enforcement_assets":"835f2682e8bd7af40ef245e5f1c3d2ef669be599ebe549336cf66412e962a029","case_deadline_extensions":"68b48ce1baeb2b69c64a5d7428bdec6971cf8fb44175b9665d8a585807be84ed","case_continuation_decisions":"d435020a1fde9442036c7e83f654883da1f8d676ab60127392f1783d99fe9f59"},"functions":{"can_create_case()":"1fcf05b9f0d44bb4a4c40f3629f64047c8c07bf5eb99f0d804c49bc91c310812","generate_file_no()":"109650cdc970a5580b27eda3de0155f5010e2a9d9e1f2f65b2224a7b0212b4ed","can_view_case_data()":"ad88a5bb95bfe18ee038e76e2266996f229459761c56f87b4f7df3280a50f65d","case098_read(bigint)":"4b4f4afa69df8cca582ff79f7078dc3d47ede2798ce229798fff86645621ed8d","case099_read(bigint)":"e25bda6df2559fc1bc39f2d4ef7b5efd779287e776c55615156f8e8688cc0aca","case100_read(bigint)":"74739f13b683868eb89155b9de50ec6e6cd23cbbc62715fcd0fa93bb926fef3d","can_view_audit_logs()":"85637e9111c1f1f336dae53daa21d49a327cb98b7a13e64a76ec9151bb3f5998","can_write_case_data()":"bafa2ef5a10fd0d6c5cf7a9359a03f6a05ba67fff74dca194c86a224239991f7","case097_session_ready()":"a07cc46a6e98d8a857148b40afc91ba84ff8484efe23fdd8f7c9511f9a6bef9e","case097_process_writer()":"620c2842c67adf83fc8df9d5d21fe461ffd8ba5a499b3539edecbd3df7488fc1","can_view_financial_data()":"ec99710571b1f61f406cc02b4285bfbce626af09d109f8c01fb2eff3de69cf1b","can_write_financial_data()":"18cc1d6b61cdcc1be8451048efa6e43aea13f0e5f8c91a07f7af5a108e329258","case097_soft_delete_guard()":"38663e021cf199fdd478cd552443ee7ec6ecd244b2ed31ec9d7b21609160e870","create_case_with_number(uuid)":"49cb92595e7acb9d1da0a8fc8e4919c9583d3083c28e126c229a443700e1e555","case098_save(bigint,integer,text,jsonb)":"d7137c546235fbc46f88f98704173cf00d8ddc50e0da506bdf73b7141d0d8bee","case099_save(bigint,uuid,integer,uuid,jsonb)":"044ba83b9fe21b7d1776f2cc93737013e662c95965f1e415e00eb4f7a0821d2c","case100_save(bigint,text,uuid,integer,uuid,uuid,jsonb)":"0a67cbce7c3733221ca556fa7a7391cc3c713e804d78ef6dbe8565222757798e"}}'::jsonb THEN RAISE EXCEPTION 'CASE101_CONTRACT_DRIFT'; END IF;
 IF NOT (to_regclass('public.case_flow_versions') IS NULL AND to_regclass('public.case_flow_stages') IS NULL AND to_regclass('public.case_flow_instances') IS NULL AND to_regclass('public.case_flow_transitions') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'case101_%')) THEN RAISE EXCEPTION 'CASE101_ALREADY_EXISTS'; END IF;
 IF NOT ((SELECT count(*)=9 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND column_name IN ('id','staff_name','full_name','account_type','assignable','role','active','must_change_password','financial_access'))
 AND (SELECT count(*)=4 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND ((column_name='id' AND data_type='uuid') OR (column_name IN ('active','assignable','must_change_password') AND data_type='boolean')))
 AND EXISTS(SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname='id' WHERE i.indrelid='public.user_profiles'::regclass AND i.indisunique AND i.indisvalid AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum AND i.indpred IS NULL)) THEN RAISE EXCEPTION 'CASE101_PEOPLE_CONTRACT_MISSING'; END IF;
END $guard$;
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

NOTIFY pgrst,'reload schema';
COMMIT;
