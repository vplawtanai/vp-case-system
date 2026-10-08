-- 099 Phase 2B: Human Apply only. Additive DDL; no legacy DML/backfill.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
LOCK TABLE public.case_audit_logs,public.case_court_filings,public.case_deadline_extensions,public.case_deadlines,public.case_enforcement_assets,public.case_enforcements,public.case_expense_items,public.case_fee_items,public.case_fees,public.case_judgments,public.case_notes,public.case_services,public.case_tasks,public.case_time_logs,public.case_timeline,public.cases,public.file_no_counters,public.parties,public.case_work_core,public.case_team_assignments IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ DECLARE actual jsonb; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'CASE099_OWNER_REQUIRED'; END IF;
 WITH raw AS (WITH rels AS (SELECT c.*,n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname=ANY(ARRAY['case_audit_logs','case_court_filings','case_deadline_extensions','case_deadlines','case_enforcement_assets','case_enforcements','case_expense_items','case_fee_items','case_fees','case_judgments','case_notes','case_services','case_tasks','case_time_logs','case_timeline','cases','file_no_counters','parties','case_work_core','case_team_assignments']) AND c.relkind='r')
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
 AND (p.oid::regprocedure::text=ANY(ARRAY['can_create_case()','can_view_audit_logs()','can_view_case_data()','can_view_financial_data()','can_write_case_data()','can_write_financial_data()','create_case_with_number(uuid)','generate_file_no()']) OR p.proname LIKE 'case097_%' OR p.proname LIKE 'case098_%')))) SELECT jsonb_build_object('tables',(SELECT coalesce(jsonb_object_agg(key,encode(sha256(convert_to((value)::text,'UTF8')),'hex')),'{}') FROM jsonb_each(c->'tables')),'functions',(SELECT coalesce(jsonb_object_agg(key,encode(sha256(convert_to((value)::text,'UTF8')),'hex')),'{}') FROM jsonb_each(c->'functions'))) FROM raw r(c) INTO actual;
 IF actual IS DISTINCT FROM '{"tables":{"cases":"9853e5d4cae8197058b89762f07fa927ad2a2049c0df4f68e1bda2a60c83c4a4","parties":"d3c1b6fd86f21a548e5b2ce8fe00dfde89c0832e9c85fd4aad39a482e9b1fdeb","case_fees":"e621ea8898b053ff2413ff451556c73750830a76b15c0c7726611395ed7713dd","case_notes":"ac52d2a11b930c65a9be4460d0ac8a7c7229fee981ffc704c131c82b6d5b5559","case_tasks":"8db6701ea72a874abb30d0ea756fee8193d9b509204ebb5f7cc14a9d50c4b062","case_services":"d23afe7141a87a590086f529395f66b3b5d449b4aac161d9720adca4feb5c960","case_timeline":"5af938891b1bc8035b4951568457e5fd88038a16395868658bbe7ab066005537","case_deadlines":"587ddce405382527f91ea30b3c4253ea4530f60369a92db50bdb5b9d83ce58fb","case_fee_items":"362b11033fd2b524f04adb53751dc36620c21f8334a63e2db2a3825c8f6ea2a8","case_judgments":"05b70a994a61224b0275fb93c6d8fc04c3027e35117e90e01b573cc18d189d83","case_time_logs":"118f721eab6b6f416b1df2928ebeb48c1fb5a0a4b55717a1e035a6fe39c1b800","case_work_core":"3148bdc36579d8b081fc7be368c8360e718978e6addd5224248348c6bb3cde50","case_audit_logs":"10553ce47f6cc568656ebacf8e8435235d92456c8f2566f78a6344f597e75113","file_no_counters":"f6bdf323fe0ec5295d54f83aedb69b624c2bc67bfb5e2ade4d7a871854244e0d","case_enforcements":"a5ddea95b974a174a6aa86af899091f095c82a2b3ad6a056d10bf2ce65f0810b","case_court_filings":"ceafc851c49a128a426cacca71fee530741229dd9afdcc27c1ec36cafa8c0b01","case_expense_items":"fdee8c2f3bb47252bd620062ae566d814ff7f29d24224c87947e6eccba7aa8f1","case_team_assignments":"7051944c36eaec1dd64a2892fa4d616946fb8d9411f03ac4dbcda48301942f6a","case_enforcement_assets":"835f2682e8bd7af40ef245e5f1c3d2ef669be599ebe549336cf66412e962a029","case_deadline_extensions":"68b48ce1baeb2b69c64a5d7428bdec6971cf8fb44175b9665d8a585807be84ed"},"functions":{"can_create_case()":"1fcf05b9f0d44bb4a4c40f3629f64047c8c07bf5eb99f0d804c49bc91c310812","generate_file_no()":"109650cdc970a5580b27eda3de0155f5010e2a9d9e1f2f65b2224a7b0212b4ed","can_view_case_data()":"ad88a5bb95bfe18ee038e76e2266996f229459761c56f87b4f7df3280a50f65d","case098_read(bigint)":"4b4f4afa69df8cca582ff79f7078dc3d47ede2798ce229798fff86645621ed8d","can_view_audit_logs()":"85637e9111c1f1f336dae53daa21d49a327cb98b7a13e64a76ec9151bb3f5998","can_write_case_data()":"bafa2ef5a10fd0d6c5cf7a9359a03f6a05ba67fff74dca194c86a224239991f7","case097_session_ready()":"a07cc46a6e98d8a857148b40afc91ba84ff8484efe23fdd8f7c9511f9a6bef9e","case097_process_writer()":"620c2842c67adf83fc8df9d5d21fe461ffd8ba5a499b3539edecbd3df7488fc1","can_view_financial_data()":"ec99710571b1f61f406cc02b4285bfbce626af09d109f8c01fb2eff3de69cf1b","can_write_financial_data()":"18cc1d6b61cdcc1be8451048efa6e43aea13f0e5f8c91a07f7af5a108e329258","case097_soft_delete_guard()":"38663e021cf199fdd478cd552443ee7ec6ecd244b2ed31ec9d7b21609160e870","create_case_with_number(uuid)":"49cb92595e7acb9d1da0a8fc8e4919c9583d3083c28e126c229a443700e1e555","case098_save(bigint,integer,text,jsonb)":"d7137c546235fbc46f88f98704173cf00d8ddc50e0da506bdf73b7141d0d8bee"}}'::jsonb THEN RAISE EXCEPTION 'CASE099_CONTRACT_DRIFT'; END IF;
 IF NOT (to_regclass('public.case_proceedings') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'case099_%')) THEN RAISE EXCEPTION 'CASE099_ALREADY_EXISTS'; END IF;
 IF NOT ((SELECT count(*)=9 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND column_name IN ('id','staff_name','full_name','account_type','assignable','role','active','must_change_password','financial_access'))
 AND (SELECT count(*)=4 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND ((column_name='id' AND data_type='uuid') OR (column_name IN ('active','assignable','must_change_password') AND data_type='boolean')))
 AND EXISTS(SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname='id' WHERE i.indrelid='public.user_profiles'::regclass AND i.indisunique AND i.indisvalid AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum AND i.indpred IS NULL)) THEN RAISE EXCEPTION 'CASE099_PEOPLE_CONTRACT_MISSING'; END IF;
END $guard$;
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

NOTIFY pgrst,'reload schema';
COMMIT;
