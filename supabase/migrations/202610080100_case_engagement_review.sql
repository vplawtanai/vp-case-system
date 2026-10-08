-- 100 Phase 2C: Human Apply only. Additive DDL; no legacy DML/backfill.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
LOCK TABLE public.case_audit_logs,public.case_court_filings,public.case_deadline_extensions,public.case_deadlines,public.case_enforcement_assets,public.case_enforcements,public.case_expense_items,public.case_fee_items,public.case_fees,public.case_judgments,public.case_notes,public.case_services,public.case_tasks,public.case_time_logs,public.case_timeline,public.cases,public.file_no_counters,public.parties,public.case_work_core,public.case_team_assignments,public.case_proceedings IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ DECLARE actual jsonb; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'CASE100_OWNER_REQUIRED'; END IF;
 WITH raw AS (WITH rels AS (SELECT c.*,n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname=ANY(ARRAY['case_audit_logs','case_court_filings','case_deadline_extensions','case_deadlines','case_enforcement_assets','case_enforcements','case_expense_items','case_fee_items','case_fees','case_judgments','case_notes','case_services','case_tasks','case_time_logs','case_timeline','cases','file_no_counters','parties','case_work_core','case_team_assignments','case_proceedings']) AND c.relkind='r')
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
 AND (p.oid::regprocedure::text=ANY(ARRAY['can_create_case()','can_view_audit_logs()','can_view_case_data()','can_view_financial_data()','can_write_case_data()','can_write_financial_data()','create_case_with_number(uuid)','generate_file_no()']) OR p.proname LIKE 'case097_%' OR p.proname LIKE 'case098_%' OR p.proname LIKE 'case099_%')))) SELECT jsonb_build_object('tables',(SELECT coalesce(jsonb_object_agg(key,encode(sha256(convert_to((value)::text,'UTF8')),'hex')),'{}') FROM jsonb_each(c->'tables')),'functions',(SELECT coalesce(jsonb_object_agg(key,encode(sha256(convert_to((value)::text,'UTF8')),'hex')),'{}') FROM jsonb_each(c->'functions'))) FROM raw r(c) INTO actual;
 IF actual IS DISTINCT FROM '{"tables":{"cases":"9853e5d4cae8197058b89762f07fa927ad2a2049c0df4f68e1bda2a60c83c4a4","parties":"d3c1b6fd86f21a548e5b2ce8fe00dfde89c0832e9c85fd4aad39a482e9b1fdeb","case_fees":"e621ea8898b053ff2413ff451556c73750830a76b15c0c7726611395ed7713dd","case_notes":"ac52d2a11b930c65a9be4460d0ac8a7c7229fee981ffc704c131c82b6d5b5559","case_tasks":"8db6701ea72a874abb30d0ea756fee8193d9b509204ebb5f7cc14a9d50c4b062","case_services":"d23afe7141a87a590086f529395f66b3b5d449b4aac161d9720adca4feb5c960","case_timeline":"5af938891b1bc8035b4951568457e5fd88038a16395868658bbe7ab066005537","case_deadlines":"587ddce405382527f91ea30b3c4253ea4530f60369a92db50bdb5b9d83ce58fb","case_fee_items":"362b11033fd2b524f04adb53751dc36620c21f8334a63e2db2a3825c8f6ea2a8","case_judgments":"05b70a994a61224b0275fb93c6d8fc04c3027e35117e90e01b573cc18d189d83","case_time_logs":"118f721eab6b6f416b1df2928ebeb48c1fb5a0a4b55717a1e035a6fe39c1b800","case_work_core":"3148bdc36579d8b081fc7be368c8360e718978e6addd5224248348c6bb3cde50","case_audit_logs":"10553ce47f6cc568656ebacf8e8435235d92456c8f2566f78a6344f597e75113","case_proceedings":"e5126488daf57a7c496d2bfc65095b3db017f79fcd4fb9486e751ef84b2958d2","file_no_counters":"f6bdf323fe0ec5295d54f83aedb69b624c2bc67bfb5e2ade4d7a871854244e0d","case_enforcements":"a5ddea95b974a174a6aa86af899091f095c82a2b3ad6a056d10bf2ce65f0810b","case_court_filings":"ceafc851c49a128a426cacca71fee530741229dd9afdcc27c1ec36cafa8c0b01","case_expense_items":"fdee8c2f3bb47252bd620062ae566d814ff7f29d24224c87947e6eccba7aa8f1","case_team_assignments":"7051944c36eaec1dd64a2892fa4d616946fb8d9411f03ac4dbcda48301942f6a","case_enforcement_assets":"835f2682e8bd7af40ef245e5f1c3d2ef669be599ebe549336cf66412e962a029","case_deadline_extensions":"68b48ce1baeb2b69c64a5d7428bdec6971cf8fb44175b9665d8a585807be84ed"},"functions":{"can_create_case()":"1fcf05b9f0d44bb4a4c40f3629f64047c8c07bf5eb99f0d804c49bc91c310812","generate_file_no()":"109650cdc970a5580b27eda3de0155f5010e2a9d9e1f2f65b2224a7b0212b4ed","can_view_case_data()":"ad88a5bb95bfe18ee038e76e2266996f229459761c56f87b4f7df3280a50f65d","case098_read(bigint)":"4b4f4afa69df8cca582ff79f7078dc3d47ede2798ce229798fff86645621ed8d","case099_read(bigint)":"e25bda6df2559fc1bc39f2d4ef7b5efd779287e776c55615156f8e8688cc0aca","can_view_audit_logs()":"85637e9111c1f1f336dae53daa21d49a327cb98b7a13e64a76ec9151bb3f5998","can_write_case_data()":"bafa2ef5a10fd0d6c5cf7a9359a03f6a05ba67fff74dca194c86a224239991f7","case097_session_ready()":"a07cc46a6e98d8a857148b40afc91ba84ff8484efe23fdd8f7c9511f9a6bef9e","case097_process_writer()":"620c2842c67adf83fc8df9d5d21fe461ffd8ba5a499b3539edecbd3df7488fc1","can_view_financial_data()":"ec99710571b1f61f406cc02b4285bfbce626af09d109f8c01fb2eff3de69cf1b","can_write_financial_data()":"18cc1d6b61cdcc1be8451048efa6e43aea13f0e5f8c91a07f7af5a108e329258","case097_soft_delete_guard()":"38663e021cf199fdd478cd552443ee7ec6ecd244b2ed31ec9d7b21609160e870","create_case_with_number(uuid)":"49cb92595e7acb9d1da0a8fc8e4919c9583d3083c28e126c229a443700e1e555","case098_save(bigint,integer,text,jsonb)":"d7137c546235fbc46f88f98704173cf00d8ddc50e0da506bdf73b7141d0d8bee","case099_save(bigint,uuid,integer,uuid,jsonb)":"044ba83b9fe21b7d1776f2cc93737013e662c95965f1e415e00eb4f7a0821d2c"}}'::jsonb THEN RAISE EXCEPTION 'CASE100_CONTRACT_DRIFT'; END IF;
 IF NOT (to_regclass('public.case_continuation_decisions') IS NULL AND to_regclass('public.case_rescue_requests') IS NULL AND to_regclass('public.case_close_reviews') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'case100_%')) THEN RAISE EXCEPTION 'CASE100_ALREADY_EXISTS'; END IF;
 IF NOT ((SELECT count(*)=9 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND column_name IN ('id','staff_name','full_name','account_type','assignable','role','active','must_change_password','financial_access'))
 AND (SELECT count(*)=4 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND ((column_name='id' AND data_type='uuid') OR (column_name IN ('active','assignable','must_change_password') AND data_type='boolean')))
 AND EXISTS(SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname='id' WHERE i.indrelid='public.user_profiles'::regclass AND i.indisunique AND i.indisvalid AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum AND i.indpred IS NULL)) THEN RAISE EXCEPTION 'CASE100_PEOPLE_CONTRACT_MISSING'; END IF;
END $guard$;
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

NOTIFY pgrst,'reload schema';
COMMIT;
