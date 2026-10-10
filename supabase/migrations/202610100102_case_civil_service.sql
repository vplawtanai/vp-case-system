-- 102 Phase 3B: Human Apply only. Additive DDL and no template edits; no legacy DML/backfill.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
LOCK TABLE public.case_audit_logs,public.case_court_filings,public.case_deadline_extensions,public.case_deadlines,public.case_enforcement_assets,public.case_enforcements,public.case_expense_items,public.case_fee_items,public.case_fees,public.case_judgments,public.case_notes,public.case_services,public.case_tasks,public.case_time_logs,public.case_timeline,public.cases,public.file_no_counters,public.parties,public.case_work_core,public.case_team_assignments,public.case_proceedings,public.case_continuation_decisions,public.case_rescue_requests,public.case_close_reviews,public.case_flow_versions,public.case_flow_stages,public.case_flow_instances,public.case_flow_transitions IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ DECLARE actual jsonb; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'CASE102_OWNER_REQUIRED'; END IF;
 WITH raw AS (WITH rels AS (SELECT c.*,n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname=ANY(ARRAY['case_audit_logs','case_court_filings','case_deadline_extensions','case_deadlines','case_enforcement_assets','case_enforcements','case_expense_items','case_fee_items','case_fees','case_judgments','case_notes','case_services','case_tasks','case_time_logs','case_timeline','cases','file_no_counters','parties','case_work_core','case_team_assignments','case_proceedings','case_continuation_decisions','case_rescue_requests','case_close_reviews','case_flow_versions','case_flow_stages','case_flow_instances','case_flow_transitions']) AND c.relkind='r')
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
 AND (p.oid::regprocedure::text=ANY(ARRAY['can_create_case()','can_view_audit_logs()','can_view_case_data()','can_view_financial_data()','can_write_case_data()','can_write_financial_data()','create_case_with_number(uuid)','generate_file_no()']) OR p.proname LIKE 'case097_%' OR p.proname LIKE 'case098_%' OR p.proname LIKE 'case099_%' OR p.proname LIKE 'case100_%' OR p.proname LIKE 'case101_%')))) SELECT jsonb_build_object('tables',(SELECT coalesce(jsonb_object_agg(key,encode(sha256(convert_to((value)::text,'UTF8')),'hex')),'{}') FROM jsonb_each(c->'tables')),'functions',(SELECT coalesce(jsonb_object_agg(key,encode(sha256(convert_to((value)::text,'UTF8')),'hex')),'{}') FROM jsonb_each(c->'functions'))) FROM raw r(c) INTO actual;
 IF actual IS DISTINCT FROM '{"tables":{"cases":"9853e5d4cae8197058b89762f07fa927ad2a2049c0df4f68e1bda2a60c83c4a4","parties":"d3c1b6fd86f21a548e5b2ce8fe00dfde89c0832e9c85fd4aad39a482e9b1fdeb","case_fees":"e621ea8898b053ff2413ff451556c73750830a76b15c0c7726611395ed7713dd","case_notes":"ac52d2a11b930c65a9be4460d0ac8a7c7229fee981ffc704c131c82b6d5b5559","case_tasks":"8db6701ea72a874abb30d0ea756fee8193d9b509204ebb5f7cc14a9d50c4b062","case_services":"d23afe7141a87a590086f529395f66b3b5d449b4aac161d9720adca4feb5c960","case_timeline":"5af938891b1bc8035b4951568457e5fd88038a16395868658bbe7ab066005537","case_deadlines":"587ddce405382527f91ea30b3c4253ea4530f60369a92db50bdb5b9d83ce58fb","case_fee_items":"362b11033fd2b524f04adb53751dc36620c21f8334a63e2db2a3825c8f6ea2a8","case_judgments":"05b70a994a61224b0275fb93c6d8fc04c3027e35117e90e01b573cc18d189d83","case_time_logs":"118f721eab6b6f416b1df2928ebeb48c1fb5a0a4b55717a1e035a6fe39c1b800","case_work_core":"3148bdc36579d8b081fc7be368c8360e718978e6addd5224248348c6bb3cde50","case_audit_logs":"10553ce47f6cc568656ebacf8e8435235d92456c8f2566f78a6344f597e75113","case_flow_stages":"454f0c51dc3c54fd54b708393764081f75357b81f17cb0957326957b43a41d03","case_proceedings":"e5126488daf57a7c496d2bfc65095b3db017f79fcd4fb9486e751ef84b2958d2","file_no_counters":"f6bdf323fe0ec5295d54f83aedb69b624c2bc67bfb5e2ade4d7a871854244e0d","case_enforcements":"a5ddea95b974a174a6aa86af899091f095c82a2b3ad6a056d10bf2ce65f0810b","case_close_reviews":"ea6f1070d2e790dab2bad6e9504a981375459ac630e72bdb8fc8594ded0c9a12","case_court_filings":"ceafc851c49a128a426cacca71fee530741229dd9afdcc27c1ec36cafa8c0b01","case_expense_items":"fdee8c2f3bb47252bd620062ae566d814ff7f29d24224c87947e6eccba7aa8f1","case_flow_versions":"8957a54b63002880009adc027890aee352ffc911d7f686e12a8d20c67c59bf12","case_flow_instances":"734b3c64507b6d93bb9ec48730f336e7d6b846fc09cb5bd254f47bbd8095162f","case_rescue_requests":"db561570f08c218218a6e4137dc286c7ed55e2c6754a3e8ee95c19f9ab2b33ef","case_flow_transitions":"677c729ef60a3c03ab575a88dbb2dec0d1246d9b35b762c7a53ef86dcfd365ef","case_team_assignments":"7051944c36eaec1dd64a2892fa4d616946fb8d9411f03ac4dbcda48301942f6a","case_enforcement_assets":"835f2682e8bd7af40ef245e5f1c3d2ef669be599ebe549336cf66412e962a029","case_deadline_extensions":"68b48ce1baeb2b69c64a5d7428bdec6971cf8fb44175b9665d8a585807be84ed","case_continuation_decisions":"d435020a1fde9442036c7e83f654883da1f8d676ab60127392f1783d99fe9f59"},"functions":{"can_create_case()":"1fcf05b9f0d44bb4a4c40f3629f64047c8c07bf5eb99f0d804c49bc91c310812","generate_file_no()":"109650cdc970a5580b27eda3de0155f5010e2a9d9e1f2f65b2224a7b0212b4ed","case101_immutable()":"e74ac745a129d3c72c8de80c276fcf1f06d765ac76e12ce28909915e17221f32","can_view_case_data()":"ad88a5bb95bfe18ee038e76e2266996f229459761c56f87b4f7df3280a50f65d","case098_read(bigint)":"4b4f4afa69df8cca582ff79f7078dc3d47ede2798ce229798fff86645621ed8d","case099_read(bigint)":"e25bda6df2559fc1bc39f2d4ef7b5efd779287e776c55615156f8e8688cc0aca","case100_read(bigint)":"74739f13b683868eb89155b9de50ec6e6cd23cbbc62715fcd0fa93bb926fef3d","case101_read(bigint)":"13463513731100b92f566073f92fccca8d6ad1597ccae1c84ba49c45974d18f2","can_view_audit_logs()":"85637e9111c1f1f336dae53daa21d49a327cb98b7a13e64a76ec9151bb3f5998","can_write_case_data()":"bafa2ef5a10fd0d6c5cf7a9359a03f6a05ba67fff74dca194c86a224239991f7","case097_session_ready()":"a07cc46a6e98d8a857148b40afc91ba84ff8484efe23fdd8f7c9511f9a6bef9e","case097_process_writer()":"620c2842c67adf83fc8df9d5d21fe461ffd8ba5a499b3539edecbd3df7488fc1","can_view_financial_data()":"ec99710571b1f61f406cc02b4285bfbce626af09d109f8c01fb2eff3de69cf1b","can_write_financial_data()":"18cc1d6b61cdcc1be8451048efa6e43aea13f0e5f8c91a07f7af5a108e329258","case097_soft_delete_guard()":"38663e021cf199fdd478cd552443ee7ec6ecd244b2ed31ec9d7b21609160e870","create_case_with_number(uuid)":"49cb92595e7acb9d1da0a8fc8e4919c9583d3083c28e126c229a443700e1e555","case098_save(bigint,integer,text,jsonb)":"d7137c546235fbc46f88f98704173cf00d8ddc50e0da506bdf73b7141d0d8bee","case099_save(bigint,uuid,integer,uuid,jsonb)":"044ba83b9fe21b7d1776f2cc93737013e662c95965f1e415e00eb4f7a0821d2c","case101_save(bigint,uuid,integer,uuid,text,jsonb)":"b8a816370544a84549e174fdf0a293f5d08b5a5dec291f1083ea5134ef019e20","case100_save(bigint,text,uuid,integer,uuid,uuid,jsonb)":"0a67cbce7c3733221ca556fa7a7391cc3c713e804d78ef6dbe8565222757798e"}}'::jsonb THEN RAISE EXCEPTION 'CASE102_CONTRACT_DRIFT'; END IF;
 IF NOT (to_regclass('public.case_service_controls') IS NULL AND to_regclass('public.case_service_attempts') IS NULL AND to_regclass('public.case_service_events') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'case102_%')) THEN RAISE EXCEPTION 'CASE102_ALREADY_EXISTS'; END IF;
 IF (SELECT jsonb_build_object('versions',(SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM public.case_flow_versions v),'stages',(SELECT jsonb_agg(to_jsonb(s) ORDER BY template_id,ordinal) FROM public.case_flow_stages s))) IS DISTINCT FROM '{"stages":[{"ordinal":1,"title_en":"Prepare and draft claim","title_th":"เตรียมและร่างคำฟ้อง","stage_key":"prepare_claim","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":2,"title_en":"File claim","title_th":"ยื่นฟ้อง","stage_key":"file_claim","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":3,"title_en":"Claim accepted / first hearing scheduled","title_th":"ศาลรับฟ้อง / ได้วันนัดแรก","stage_key":"accepted","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":4,"title_en":"Await and manage service on defendants","title_th":"รอและจัดการการส่งหมายจำเลย","stage_key":"service","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":5,"title_en":"Await defence / first hearing","title_th":"รอคำให้การ / นัดแรก","stage_key":"defence","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":6,"title_en":"Settlement of issues / mediation","title_th":"ชี้สองสถาน / ไกล่เกลี่ย","stage_key":"issues_mediation","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":7,"title_en":"Prepare evidence hearing","title_th":"เตรียมสืบพยาน","stage_key":"prepare_evidence","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":8,"title_en":"Evidence hearing","title_th":"สืบพยาน","stage_key":"evidence","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":9,"title_en":"Await judgment","title_th":"รอฟังคำพิพากษา","stage_key":"await_judgment","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":10,"title_en":"First-instance judgment / report","title_th":"คำพิพากษาศาลชั้นต้น / รายงานผล","stage_key":"judgment","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":11,"title_en":"Post-judgment analysis and report","title_th":"หลังคำพิพากษา / วิเคราะห์และรายงาน","stage_key":"post_judgment","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":12,"title_en":"Await continuation decision","title_th":"รอการตัดสินใจดำเนินการต่อ","stage_key":"continuation","template_id":"civil_ordinary_plaintiff_v1"}],"versions":[{"id":"civil_ordinary_plaintiff_v1","family":"civil","variant":"ordinary","version":1,"title_en":"Civil Ordinary Plaintiff","title_th":"คดีแพ่งสามัญ — ฝ่ายโจทก์","template_key":"civil_ordinary_plaintiff","represented_role":"plaintiff"}]}'::jsonb THEN RAISE EXCEPTION 'CASE102_TEMPLATE_DRIFT'; END IF;
 IF NOT ((SELECT count(*)=9 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND column_name IN ('id','staff_name','full_name','account_type','assignable','role','active','must_change_password','financial_access'))
 AND (SELECT count(*)=4 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND ((column_name='id' AND data_type='uuid') OR (column_name IN ('active','assignable','must_change_password') AND data_type='boolean')))
 AND EXISTS(SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname='id' WHERE i.indrelid='public.user_profiles'::regclass AND i.indisunique AND i.indisvalid AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum AND i.indpred IS NULL)) THEN RAISE EXCEPTION 'CASE102_PEOPLE_CONTRACT_MISSING'; END IF;
END $guard$;
-- Phase 3B: explicit service facts and human-confirmed suggestions for the 101 pilot only.
-- Installation is DDL only. Existing Case/Party/Deadline/Flow facts are never backfilled.
CREATE TABLE public.case_service_controls (
 party_id uuid PRIMARY KEY REFERENCES public.parties(id), case_id bigint NOT NULL REFERENCES public.cases(id),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), required boolean NOT NULL DEFAULT true, exemption_reason text,
 lawful_attempt_id uuid, lawful_at timestamptz, lawful_by uuid REFERENCES public.user_profiles(id),
 answer_deadline_id uuid UNIQUE REFERENCES public.case_deadlines(id), default_deadline_id uuid UNIQUE REFERENCES public.case_deadlines(id),
 answer_filed_on date CHECK(isfinite(answer_filed_on)), absent_hearing_id uuid REFERENCES public.case_timeline(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_by uuid NOT NULL REFERENCES public.user_profiles(id),
 UNIQUE(party_id,case_id), CHECK(required OR (exemption_reason IS NOT NULL AND length(btrim(exemption_reason))>0)),
 CHECK((lawful_attempt_id IS NULL AND lawful_at IS NULL AND lawful_by IS NULL) OR (lawful_attempt_id IS NOT NULL AND lawful_at IS NOT NULL AND lawful_by IS NOT NULL))
);
CREATE TABLE public.case_service_attempts (
 id uuid PRIMARY KEY, party_id uuid NOT NULL, case_id bigint NOT NULL,
 method text NOT NULL CHECK(method IN('normal','posting','electronic','other')), attempted_on date NOT NULL CHECK(isfinite(attempted_on)),
 result text NOT NULL CHECK(result IN('pending','served','failed','void')),
 failure_kind text CHECK(failure_kind IN('investigating','not_found','demolished','other')), failure_reason text, note text, void_reason text,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), recorded_by uuid NOT NULL REFERENCES public.user_profiles(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_by uuid NOT NULL REFERENCES public.user_profiles(id),
 UNIQUE(id,party_id), FOREIGN KEY(party_id,case_id) REFERENCES public.case_service_controls(party_id,case_id),
 CHECK(result<>'failed' OR (failure_kind IS NOT NULL AND failure_reason IS NOT NULL AND length(btrim(failure_reason))>0)),
 CHECK(result<>'void' OR (void_reason IS NOT NULL AND length(btrim(void_reason))>0)), CHECK(length(note)<=10000 AND length(failure_reason)<=10000)
);
ALTER TABLE public.case_service_controls ADD CONSTRAINT case102_lawful_party FOREIGN KEY(lawful_attempt_id,party_id) REFERENCES public.case_service_attempts(id,party_id);
CREATE TABLE public.case_service_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id bigint NOT NULL REFERENCES public.cases(id), party_id uuid REFERENCES public.parties(id),
 action text NOT NULL, actor_id uuid NOT NULL REFERENCES public.user_profiles(id), occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 before_data jsonb, after_data jsonb NOT NULL, request_id uuid NOT NULL UNIQUE, request_data jsonb NOT NULL
);
CREATE INDEX case102_case ON public.case_service_controls(case_id);
CREATE INDEX case102_attempts ON public.case_service_attempts(party_id,recorded_at);
CREATE INDEX case102_history ON public.case_service_events(case_id,occurred_at);
CREATE TRIGGER case102_history_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.case_service_events FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();
CREATE TRIGGER case102_controls_preserve BEFORE DELETE OR TRUNCATE ON public.case_service_controls FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();
CREATE TRIGGER case102_attempts_preserve BEFORE DELETE OR TRUNCATE ON public.case_service_attempts FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();
ALTER TABLE public.case_service_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_service_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_service_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_service_controls,public.case_service_attempts,public.case_service_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.case_service_controls,public.case_service_attempts,public.case_service_events TO authenticated;
CREATE POLICY case102_read ON public.case_service_controls FOR SELECT TO authenticated USING(public.case097_session_ready() AND public.can_view_case_data());
CREATE POLICY case102_read ON public.case_service_attempts FOR SELECT TO authenticated USING(public.case097_session_ready() AND public.can_view_case_data());
CREATE POLICY case102_read ON public.case_service_events FOR SELECT TO authenticated USING(public.case097_session_ready() AND public.can_view_case_data());

CREATE FUNCTION public.case102_read(p_case_id bigint) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT(public.case097_session_ready() AND public.can_view_case_data()) THEN RAISE EXCEPTION 'CASE102_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cases WHERE id=p_case_id) THEN RAISE EXCEPTION 'CASE102_NOT_FOUND'; END IF;
 RETURN jsonb_build_object(
 'today',(current_timestamp AT TIME ZONE 'Asia/Bangkok')::date,
 'flow',(SELECT to_jsonb(i) FROM public.case_flow_instances i WHERE case_id=p_case_id AND track_key='main' AND template_id='civil_ordinary_plaintiff_v1'),
 'defendants',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',CASE WHEN p.entity_type='company' THEN p.company_name ELSE concat_ws(' ',nullif(p.title,''),nullif(p.first_name,''),nullif(p.last_name,'')) END,'order_no',p.order_no,
 'control',to_jsonb(c),'attempts',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY recorded_at DESC,id),'[]') FROM public.case_service_attempts a WHERE a.party_id=p.id),
 'answer_deadline',(SELECT to_jsonb(d) FROM public.case_deadlines d WHERE id=c.answer_deadline_id),
 'default_deadline',(SELECT to_jsonb(d) FROM public.case_deadlines d WHERE id=c.default_deadline_id),
 'extensions',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY extension_no,created_at),'[]') FROM public.case_deadline_extensions e WHERE deadline_id=c.answer_deadline_id AND deleted_at IS NULL)) ORDER BY p.order_no,p.id),'[]')
 FROM public.parties p LEFT JOIN public.case_service_controls c ON c.party_id=p.id WHERE p.case_id=p_case_id AND p.role='defendant' AND p.deleted_at IS NULL),
 'deadlines',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY order_no,id),'[]') FROM public.case_deadlines d WHERE case_id=p_case_id AND deleted_at IS NULL AND status='Active'),
 'hearings',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'event_date',t.event_date,'appointment_type',t.appointment_type,'appointment_other',t.appointment_other) ORDER BY event_date DESC,id),'[]') FROM public.case_timeline t WHERE case_id=p_case_id AND deleted_at IS NULL AND event_type='hearing' AND status IS DISTINCT FROM 'Cancelled'),
 'history',(SELECT coalesce(jsonb_agg((to_jsonb(e)-'request_data'-'request_id')||jsonb_build_object('actor_name',coalesce(nullif(p.staff_name,''),p.full_name)) ORDER BY occurred_at DESC,e.id),'[]') FROM public.case_service_events e JOIN public.user_profiles p ON p.id=e.actor_id WHERE e.case_id=p_case_id));
END $fn$;

CREATE FUNCTION public.case102_save(p_case_id bigint,p_party_id uuid,p_version integer,p_request_id uuid,p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.case_service_controls; a public.case_service_attempts; d public.case_deadlines; f public.case_flow_instances; actor public.user_profiles; receipt public.case_service_events;
 old_facts jsonb; new_facts jsonb; deadline_before jsonb; deadline_after jsonb; flow_before jsonb; next_before jsonb; next_after jsonb;
 req jsonb:=jsonb_build_object('case_id',p_case_id,'party_id',p_party_id,'version',p_version,'action',p_action,'data',p_data);
 allowed text[]; why text; due date; event_day date; today date:=(current_timestamp AT TIME ZONE 'Asia/Bangkok')::date; target uuid; person uuid; did uuid; attempts_id uuid; dst text;
BEGIN
 IF NOT(public.case097_session_ready() AND public.can_view_case_data() AND public.case097_process_writer()) THEN RAISE EXCEPTION 'CASE102_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.user_profiles WHERE id=auth.uid();
 IF p_request_id IS NULL OR p_version IS NULL OR p_version<0 OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR p_action IS NULL THEN RAISE EXCEPTION 'CASE102_INVALID_INPUT'; END IF;
 allowed:=CASE p_action
 WHEN 'attempt' THEN ARRAY['attempt_id','method','attempted_on','result','failure_kind','failure_reason','note']
 WHEN 'void' THEN ARRAY['attempt_id','reason']
 WHEN 'lawful' THEN ARRAY['attempt_id','confirmed']
 WHEN 'required' THEN ARRAY['required','reason']
 WHEN 'deadline' THEN ARRAY['kind','due','confirmed','existing_id','reason','expected_due','expected_updated_at']
 WHEN 'answer' THEN ARRAY['date','expected_due','expected_updated_at']
 WHEN 'absence' THEN ARRAY['hearing_id','confirmed']
 WHEN 'next' THEN ARRAY['core_version','next']
 WHEN 'advance' THEN ARRAY['flow_version','confirmed']
 WHEN 'branch' THEN ARRAY['flow_version','confirmed','reason'] END;
 IF allowed IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE NOT(k=ANY(allowed))) THEN RAISE EXCEPTION 'CASE102_INVALID_INPUT'; END IF;
 IF p_action IN('lawful','required','deadline','answer','absence','advance','branch','void') AND actor.role NOT IN('lawyer','partner','admin') THEN RAISE EXCEPTION 'CASE102_LAWYER_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.cases WHERE id=p_case_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CASE102_NOT_FOUND'; END IF;
 SELECT * INTO receipt FROM public.case_service_events WHERE request_id=p_request_id;
 IF receipt.id IS NOT NULL THEN
  IF receipt.actor_id<>auth.uid() OR receipt.request_data IS DISTINCT FROM req THEN RAISE EXCEPTION 'CASE102_REQUEST_CONFLICT'; END IF;
  RETURN public.case102_read(p_case_id);
 END IF;
 SELECT * INTO f FROM public.case_flow_instances WHERE case_id=p_case_id AND track_key='main' FOR UPDATE;
 IF f.id IS NULL OR f.template_id<>'civil_ordinary_plaintiff_v1' OR f.lifecycle<>'active' THEN RAISE EXCEPTION 'CASE102_PILOT_REQUIRED'; END IF;
 IF p_action IN('advance','branch') THEN
  IF p_party_id IS NOT NULL OR p_version<>0 OR (p_data->>'flow_version')::integer IS DISTINCT FROM f.version THEN RAISE EXCEPTION 'CASE102_STALE'; END IF;
  IF p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'CASE102_CONFIRM_REQUIRED'; END IF;
  -- All currently required live defendants, never inferred from a display name.
  IF NOT EXISTS(SELECT 1 FROM public.parties p LEFT JOIN public.case_service_controls s ON s.party_id=p.id WHERE p.case_id=p_case_id AND p.role='defendant' AND p.deleted_at IS NULL AND coalesce(s.required,true))
   OR EXISTS(SELECT 1 FROM public.parties p LEFT JOIN public.case_service_controls s ON s.party_id=p.id LEFT JOIN public.case_service_attempts x ON x.id=s.lawful_attempt_id
    WHERE p.case_id=p_case_id AND p.role='defendant' AND p.deleted_at IS NULL AND coalesce(s.required,true) AND (s.lawful_attempt_id IS NULL OR x.result IS DISTINCT FROM 'served')) THEN RAISE EXCEPTION 'CASE102_NOT_ALL_LAWFUL'; END IF;
  flow_before:=to_jsonb(f);
  IF p_action='advance' THEN
   IF f.current_stage<>'service' THEN RAISE EXCEPTION 'CASE102_FLOW_STATE'; END IF;
   PERFORM public.case101_save(p_case_id,f.id,f.version,p_request_id,'advance','{"stage":"defence"}'::jsonb);
  ELSE
   why:=nullif(btrim(p_data->>'reason'),'');
   IF why IS NULL THEN RAISE EXCEPTION 'CASE102_REASON_REQUIRED'; END IF;
   IF f.current_stage NOT IN('service','defence') THEN RAISE EXCEPTION 'CASE102_FLOW_STATE'; END IF;
   -- This conservative case-wide branch requires explicit nonappearance evidence for every required defendant.
   IF EXISTS(SELECT 1 FROM public.parties p JOIN public.case_service_controls s ON s.party_id=p.id LEFT JOIN public.case_timeline h ON h.id=s.absent_hearing_id
    WHERE p.case_id=p_case_id AND p.role='defendant' AND p.deleted_at IS NULL AND s.required AND (s.answer_filed_on IS NOT NULL OR h.id IS NULL OR h.deleted_at IS NOT NULL OR h.status='Cancelled')) THEN RAISE EXCEPTION 'CASE102_BRANCH_EVIDENCE_REQUIRED'; END IF;
   dst:='evidence';
   UPDATE public.case_flow_instances SET current_stage=dst,version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=f.id;
   INSERT INTO public.case_flow_transitions(id,instance_id,template_id,sequence_no,event_kind,transition_code,from_stage,to_stage,from_lifecycle,to_lifecycle,reason,actor_id,request_id,request_data)
   VALUES(gen_random_uuid(),f.id,f.template_id,f.version+1,'transition','BRANCH',f.current_stage,dst,'active','active',why,auth.uid(),p_request_id,req);
   INSERT INTO public.case_audit_logs(case_id,table_name,record_id,action,user_id,user_name,user_role,old_data,new_data,note)
   SELECT p_case_id,'case_flow_instances',i.id::text,'update',auth.uid(),coalesce(nullif(actor.staff_name,''),actor.full_name),actor.role,flow_before,to_jsonb(i),'case102_branch' FROM public.case_flow_instances i WHERE id=f.id;
  END IF;
  SELECT to_jsonb(i) INTO new_facts FROM public.case_flow_instances i WHERE id=f.id;old_facts:=flow_before;
 ELSE
  PERFORM 1 FROM public.parties WHERE id=p_party_id AND case_id=p_case_id AND role='defendant' AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CASE102_PARTY_UNAVAILABLE'; END IF;
  SELECT * INTO c FROM public.case_service_controls WHERE party_id=p_party_id FOR UPDATE;
  IF coalesce(c.version,0)<>p_version THEN RAISE EXCEPTION 'CASE102_STALE'; END IF;
  old_facts:=jsonb_build_object('control',to_jsonb(c),'attempts',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.case_service_attempts x WHERE party_id=p_party_id));
  IF c.party_id IS NULL THEN INSERT INTO public.case_service_controls(party_id,case_id,updated_by) VALUES(p_party_id,p_case_id,auth.uid()) RETURNING * INTO c; END IF;
  why:=nullif(btrim(p_data->>'reason'),'');
  IF p_action='attempt' THEN
   attempts_id:=nullif(p_data->>'attempt_id','')::uuid;
   IF attempts_id IS NOT NULL THEN
    SELECT * INTO a FROM public.case_service_attempts WHERE id=attempts_id AND party_id=p_party_id FOR UPDATE;
    IF a.id IS NULL OR a.result<>'pending' OR c.lawful_attempt_id=a.id THEN RAISE EXCEPTION 'CASE102_ATTEMPT_FINAL'; END IF;
   END IF;
   event_day:=(p_data->>'attempted_on')::date;
   IF event_day IS NULL OR NOT isfinite(event_day) OR event_day>today OR p_data->>'result' IS NULL OR p_data->>'result' NOT IN('pending','served','failed') THEN RAISE EXCEPTION 'CASE102_INVALID_INPUT'; END IF;
   IF attempts_id IS NULL THEN
    INSERT INTO public.case_service_attempts(id,party_id,case_id,method,attempted_on,result,failure_kind,failure_reason,note,recorded_by,updated_by)
    VALUES(gen_random_uuid(),p_party_id,p_case_id,p_data->>'method',event_day,p_data->>'result',nullif(p_data->>'failure_kind',''),nullif(btrim(p_data->>'failure_reason'),''),nullif(btrim(p_data->>'note'),''),auth.uid(),auth.uid());
   ELSE
    UPDATE public.case_service_attempts SET method=p_data->>'method',attempted_on=event_day,result=p_data->>'result',failure_kind=nullif(p_data->>'failure_kind',''),failure_reason=nullif(btrim(p_data->>'failure_reason'),''),note=nullif(btrim(p_data->>'note'),''),updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=attempts_id;
   END IF;
  ELSIF p_action='lawful' THEN
   IF p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'CASE102_CONFIRM_REQUIRED'; END IF;
   SELECT * INTO a FROM public.case_service_attempts WHERE id=(p_data->>'attempt_id')::uuid AND party_id=p_party_id FOR UPDATE;
   IF a.id IS NULL OR a.result<>'served' OR c.lawful_attempt_id IS NOT NULL THEN RAISE EXCEPTION 'CASE102_ATTEMPT_FINAL'; END IF;
   UPDATE public.case_service_controls SET lawful_attempt_id=a.id,lawful_at=clock_timestamp(),lawful_by=auth.uid() WHERE party_id=p_party_id;
  ELSIF p_action='void' THEN
   IF why IS NULL THEN RAISE EXCEPTION 'CASE102_REASON_REQUIRED'; END IF;
   SELECT * INTO a FROM public.case_service_attempts WHERE id=(p_data->>'attempt_id')::uuid AND party_id=p_party_id FOR UPDATE;
   IF a.id IS NULL OR a.result='void' THEN RAISE EXCEPTION 'CASE102_ATTEMPT_FINAL'; END IF;
   IF c.lawful_attempt_id=a.id THEN
    IF c.answer_filed_on IS NOT NULL OR EXISTS(SELECT 1 FROM public.case_deadlines WHERE id IN(c.answer_deadline_id,c.default_deadline_id) AND deleted_at IS NULL AND status IS DISTINCT FROM 'Cancelled') THEN RAISE EXCEPTION 'CASE102_DEADLINE_REVIEW_REQUIRED'; END IF;
    UPDATE public.case_service_controls SET lawful_attempt_id=NULL,lawful_at=NULL,lawful_by=NULL,answer_deadline_id=NULL,default_deadline_id=NULL,absent_hearing_id=NULL WHERE party_id=p_party_id;
   END IF;
   UPDATE public.case_service_attempts SET result='void',void_reason=why,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=a.id;
  ELSIF p_action='required' THEN
   IF jsonb_typeof(p_data->'required') IS DISTINCT FROM 'boolean' OR why IS NULL THEN RAISE EXCEPTION 'CASE102_REASON_REQUIRED'; END IF;
   UPDATE public.case_service_controls SET required=(p_data->>'required')::boolean,exemption_reason=why WHERE party_id=p_party_id;
  ELSIF p_action='deadline' THEN
   IF p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'CASE102_CONFIRM_REQUIRED'; END IF;
   IF p_data->>'kind' IS NULL OR p_data->>'kind' NOT IN('answer','default','court') THEN RAISE EXCEPTION 'CASE102_INVALID_INPUT'; END IF;
   IF p_data->>'kind' IN('answer','default') AND (c.lawful_attempt_id IS NULL OR c.answer_filed_on IS NOT NULL) THEN RAISE EXCEPTION 'CASE102_LAWFUL_REQUIRED'; END IF;
   IF p_data->>'kind'='answer' AND c.answer_deadline_id IS NOT NULL OR p_data->>'kind'='default' AND c.default_deadline_id IS NOT NULL THEN RAISE EXCEPTION 'CASE102_DEADLINE_LINKED'; END IF;
   IF p_data->>'kind'='default' THEN
    SELECT * INTO d FROM public.case_deadlines WHERE id=c.answer_deadline_id AND case_id=p_case_id AND deleted_at IS NULL AND status='Active' FOR UPDATE;
    IF d.id IS NULL OR d.current_due_date IS NULL OR d.current_due_date>=today THEN RAISE EXCEPTION 'CASE102_NOT_OVERDUE'; END IF;
    IF d.current_due_date IS DISTINCT FROM (p_data->>'expected_due')::date OR d.updated_at IS DISTINCT FROM (p_data->>'expected_updated_at')::timestamptz THEN RAISE EXCEPTION 'CASE102_STALE'; END IF;
   END IF;
   did:=nullif(p_data->>'existing_id','')::uuid;
   IF did IS NOT NULL THEN
    IF p_data->>'kind'<>'answer' THEN RAISE EXCEPTION 'CASE102_INVALID_INPUT'; END IF;
    SELECT * INTO d FROM public.case_deadlines WHERE id=did AND case_id=p_case_id AND deadline_type='answer' AND status='Active' AND deleted_at IS NULL FOR UPDATE;
    IF d.id IS NULL THEN RAISE EXCEPTION 'CASE102_DEADLINE_UNAVAILABLE'; END IF;
    IF d.current_due_date IS DISTINCT FROM (p_data->>'expected_due')::date OR d.updated_at IS DISTINCT FROM (p_data->>'expected_updated_at')::timestamptz THEN RAISE EXCEPTION 'CASE102_STALE'; END IF;
   ELSE
    due:=(p_data->>'due')::date;
    IF due IS NULL OR NOT isfinite(due) THEN RAISE EXCEPTION 'CASE102_INVALID_INPUT'; END IF;
    IF p_data->>'kind'='court' AND why IS NULL THEN RAISE EXCEPTION 'CASE102_REASON_REQUIRED'; END IF;
    INSERT INTO public.case_deadlines(case_id,order_no,deadline_type,deadline_other,original_due_date,current_due_date,status,note)
    VALUES(p_case_id,(SELECT coalesce(max(order_no),0)+1 FROM public.case_deadlines WHERE case_id=p_case_id),CASE WHEN p_data->>'kind'='answer' THEN 'answer' ELSE 'other' END,
     CASE WHEN p_data->>'kind'='default' THEN 'คำร้องขาดนัด' WHEN p_data->>'kind'='court' THEN why END,due,due,'Active',why) RETURNING * INTO d;
    did:=d.id;deadline_after:=to_jsonb(d);
   END IF;
   IF p_data->>'kind'='answer' THEN UPDATE public.case_service_controls SET answer_deadline_id=did WHERE party_id=p_party_id;
   ELSIF p_data->>'kind'='default' THEN UPDATE public.case_service_controls SET default_deadline_id=did WHERE party_id=p_party_id; END IF;
  ELSIF p_action='answer' THEN
   event_day:=(p_data->>'date')::date;
   IF event_day IS NULL OR NOT isfinite(event_day) OR event_day>today OR c.answer_filed_on IS NOT NULL THEN RAISE EXCEPTION 'CASE102_INVALID_INPUT'; END IF;
   IF c.answer_deadline_id IS NOT NULL THEN
    SELECT * INTO d FROM public.case_deadlines WHERE id=c.answer_deadline_id AND case_id=p_case_id AND deleted_at IS NULL AND status='Active' FOR UPDATE;
    IF d.id IS NULL THEN RAISE EXCEPTION 'CASE102_DEADLINE_UNAVAILABLE'; END IF;
    IF d.current_due_date IS DISTINCT FROM (p_data->>'expected_due')::date OR d.updated_at IS DISTINCT FROM (p_data->>'expected_updated_at')::timestamptz THEN RAISE EXCEPTION 'CASE102_STALE'; END IF;
    deadline_before:=to_jsonb(d);
    UPDATE public.case_deadlines SET status='Done',updated_at=clock_timestamp() WHERE id=d.id RETURNING to_jsonb(case_deadlines.*) INTO deadline_after;
   END IF;
   UPDATE public.case_service_controls SET answer_filed_on=event_day WHERE party_id=p_party_id;
  ELSIF p_action='absence' THEN
   IF p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'CASE102_CONFIRM_REQUIRED'; END IF;
   target:=(p_data->>'hearing_id')::uuid;
   PERFORM 1 FROM public.case_timeline WHERE id=target AND case_id=p_case_id AND event_type='hearing' AND deleted_at IS NULL AND status IS DISTINCT FROM 'Cancelled'
    AND CASE WHEN event_date~'^\d{4}-\d{2}-\d{2}$' THEN event_date::date BETWEEN (SELECT attempted_on FROM public.case_service_attempts WHERE id=c.lawful_attempt_id) AND today ELSE false END FOR SHARE;
   IF NOT FOUND OR c.lawful_attempt_id IS NULL THEN RAISE EXCEPTION 'CASE102_BRANCH_EVIDENCE_REQUIRED'; END IF;
   UPDATE public.case_service_controls SET absent_hearing_id=target WHERE party_id=p_party_id;
  ELSIF p_action='next' THEN
   IF jsonb_typeof(p_data->'next') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'CASE102_INVALID_INPUT'; END IF;
   person:=nullif(p_data->'next'->>'assignee_id','')::uuid;
   IF person IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=person AND active AND account_type='operational' AND assignable AND NOT must_change_password AND role IN('admin','partner','lawyer','assistant_lawyer','staff')) THEN RAISE EXCEPTION 'CASE102_PERSON_INELIGIBLE'; END IF;
   next_before:=public.case098_read(p_case_id);
   next_after:=public.case098_save(p_case_id,(p_data->>'core_version')::integer,'next',p_data->'next');
  END IF;
  UPDATE public.case_service_controls SET version=p_version+1,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE party_id=p_party_id RETURNING * INTO c;
  new_facts:=jsonb_build_object('control',to_jsonb(c),'attempts',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.case_service_attempts x WHERE party_id=p_party_id),'deadline',deadline_after,'next',next_after);
 END IF;
 INSERT INTO public.case_service_events(case_id,party_id,action,actor_id,before_data,after_data,request_id,request_data)
 VALUES(p_case_id,p_party_id,p_action,auth.uid(),old_facts||jsonb_build_object('deadline',deadline_before,'next',next_before),new_facts,p_request_id,req);
 INSERT INTO public.case_audit_logs(case_id,table_name,record_id,action,user_id,user_name,user_role,old_data,new_data,note)
 VALUES(p_case_id,'case_service_controls',coalesce(p_party_id,f.id)::text,'update',auth.uid(),coalesce(nullif(actor.staff_name,''),actor.full_name),actor.role,old_facts,new_facts,'case102_'||p_action);
 IF deadline_after IS NOT NULL THEN
  INSERT INTO public.case_audit_logs(case_id,table_name,record_id,action,user_id,user_name,user_role,old_data,new_data,note)
  VALUES(p_case_id,'case_deadlines',deadline_after->>'id',CASE WHEN deadline_before IS NULL THEN 'create' ELSE 'update' END,auth.uid(),coalesce(nullif(actor.staff_name,''),actor.full_name),actor.role,deadline_before,deadline_after,'case102_'||p_action);
 END IF;
 RETURN public.case102_read(p_case_id);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR check_violation OR not_null_violation OR foreign_key_violation OR unique_violation THEN RAISE EXCEPTION 'CASE102_INVALID_INPUT';
END $fn$;
ALTER FUNCTION public.case102_read(bigint) OWNER TO postgres;
ALTER FUNCTION public.case102_save(bigint,uuid,integer,uuid,text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.case102_read(bigint),public.case102_save(bigint,uuid,integer,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.case102_read(bigint),public.case102_save(bigint,uuid,integer,uuid,text,jsonb) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
