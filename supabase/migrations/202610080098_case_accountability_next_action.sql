-- 098 Phase 2A: Human Apply after reviewed SELECT-only preflight. No backfill.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
LOCK TABLE public.case_audit_logs,public.case_court_filings,public.case_deadline_extensions,public.case_deadlines,public.case_enforcement_assets,public.case_enforcements,public.case_expense_items,public.case_fee_items,public.case_fees,public.case_judgments,public.case_notes,public.case_services,public.case_tasks,public.case_time_logs,public.case_timeline,public.cases,public.file_no_counters,public.parties IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ DECLARE actual jsonb; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'CASE098_OWNER_REQUIRED'; END IF;
 WITH raw AS (WITH rels AS (SELECT c.*,n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname=ANY(ARRAY['case_audit_logs','case_court_filings','case_deadline_extensions','case_deadlines','case_enforcement_assets','case_enforcements','case_expense_items','case_fee_items','case_fees','case_judgments','case_notes','case_services','case_tasks','case_time_logs','case_timeline','cases','file_no_counters','parties']) AND c.relkind='r')
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
 AND (p.oid::regprocedure::text=ANY(ARRAY['can_create_case()','can_view_audit_logs()','can_view_case_data()','can_view_financial_data()','can_write_case_data()','can_write_financial_data()','create_case_with_number(uuid)','generate_file_no()']) OR p.proname LIKE 'case097_%')))) SELECT jsonb_build_object('tables',(SELECT coalesce(jsonb_object_agg(key,encode(sha256(convert_to((value)::text,'UTF8')),'hex')),'{}') FROM jsonb_each(c->'tables')),'functions',(SELECT coalesce(jsonb_object_agg(key,encode(sha256(convert_to((value)::text,'UTF8')),'hex')),'{}') FROM jsonb_each(c->'functions'))) FROM raw r(c) INTO actual;
 IF actual IS DISTINCT FROM '{"tables":{"cases":"9853e5d4cae8197058b89762f07fa927ad2a2049c0df4f68e1bda2a60c83c4a4","parties":"d3c1b6fd86f21a548e5b2ce8fe00dfde89c0832e9c85fd4aad39a482e9b1fdeb","case_fees":"e621ea8898b053ff2413ff451556c73750830a76b15c0c7726611395ed7713dd","case_notes":"ac52d2a11b930c65a9be4460d0ac8a7c7229fee981ffc704c131c82b6d5b5559","case_tasks":"8db6701ea72a874abb30d0ea756fee8193d9b509204ebb5f7cc14a9d50c4b062","case_services":"d23afe7141a87a590086f529395f66b3b5d449b4aac161d9720adca4feb5c960","case_timeline":"5af938891b1bc8035b4951568457e5fd88038a16395868658bbe7ab066005537","case_deadlines":"587ddce405382527f91ea30b3c4253ea4530f60369a92db50bdb5b9d83ce58fb","case_fee_items":"362b11033fd2b524f04adb53751dc36620c21f8334a63e2db2a3825c8f6ea2a8","case_judgments":"05b70a994a61224b0275fb93c6d8fc04c3027e35117e90e01b573cc18d189d83","case_time_logs":"118f721eab6b6f416b1df2928ebeb48c1fb5a0a4b55717a1e035a6fe39c1b800","case_audit_logs":"10553ce47f6cc568656ebacf8e8435235d92456c8f2566f78a6344f597e75113","file_no_counters":"f6bdf323fe0ec5295d54f83aedb69b624c2bc67bfb5e2ade4d7a871854244e0d","case_enforcements":"a5ddea95b974a174a6aa86af899091f095c82a2b3ad6a056d10bf2ce65f0810b","case_court_filings":"ceafc851c49a128a426cacca71fee530741229dd9afdcc27c1ec36cafa8c0b01","case_expense_items":"fdee8c2f3bb47252bd620062ae566d814ff7f29d24224c87947e6eccba7aa8f1","case_enforcement_assets":"835f2682e8bd7af40ef245e5f1c3d2ef669be599ebe549336cf66412e962a029","case_deadline_extensions":"68b48ce1baeb2b69c64a5d7428bdec6971cf8fb44175b9665d8a585807be84ed"},"functions":{"can_create_case()":"1fcf05b9f0d44bb4a4c40f3629f64047c8c07bf5eb99f0d804c49bc91c310812","generate_file_no()":"109650cdc970a5580b27eda3de0155f5010e2a9d9e1f2f65b2224a7b0212b4ed","can_view_case_data()":"ad88a5bb95bfe18ee038e76e2266996f229459761c56f87b4f7df3280a50f65d","can_view_audit_logs()":"85637e9111c1f1f336dae53daa21d49a327cb98b7a13e64a76ec9151bb3f5998","can_write_case_data()":"bafa2ef5a10fd0d6c5cf7a9359a03f6a05ba67fff74dca194c86a224239991f7","case097_session_ready()":"a07cc46a6e98d8a857148b40afc91ba84ff8484efe23fdd8f7c9511f9a6bef9e","case097_process_writer()":"620c2842c67adf83fc8df9d5d21fe461ffd8ba5a499b3539edecbd3df7488fc1","can_view_financial_data()":"ec99710571b1f61f406cc02b4285bfbce626af09d109f8c01fb2eff3de69cf1b","can_write_financial_data()":"18cc1d6b61cdcc1be8451048efa6e43aea13f0e5f8c91a07f7af5a108e329258","case097_soft_delete_guard()":"38663e021cf199fdd478cd552443ee7ec6ecd244b2ed31ec9d7b21609160e870","create_case_with_number(uuid)":"49cb92595e7acb9d1da0a8fc8e4919c9583d3083c28e126c229a443700e1e555"}}'::jsonb THEN RAISE EXCEPTION 'CASE098_CONTRACT_DRIFT'; END IF;
 IF NOT (to_regclass('public.case_work_core') IS NULL AND to_regclass('public.case_team_assignments') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'case098_%')) THEN RAISE EXCEPTION 'CASE098_ALREADY_EXISTS'; END IF;
 IF NOT (SELECT count(*)=5 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND column_name IN ('id','staff_name','full_name','account_type','assignable')) THEN RAISE EXCEPTION 'CASE098_PEOPLE_CONTRACT_MISSING'; END IF;
END $guard$;
CREATE TEMP TABLE case098_before_rows ON COMMIT DROP AS SELECT jsonb_object_agg(name,jsonb_build_object('count',x.n::bigint,'sha256',x.h) ORDER BY name)
 FROM unnest(ARRAY['case_audit_logs','case_court_filings','case_deadline_extensions','case_deadlines','case_enforcement_assets','case_enforcements','case_expense_items','case_fee_items','case_fees','case_judgments','case_notes','case_services','case_tasks','case_time_logs','case_timeline','cases','file_no_counters','parties']) tab(name)
 CROSS JOIN LATERAL XMLTABLE('/table/row' PASSING query_to_xml(format(
 'SELECT count(*) n,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text COLLATE "C"),''[]''::jsonb)::text,''UTF8'')),''hex'') h FROM public.%I t %s',name,
 CASE WHEN name='case_audit_logs' THEN 'WHERE case_id IS NOT NULL OR table_name IN (''case_audit_logs'',''case_court_filings'',''case_deadline_extensions'',''case_deadlines'',''case_enforcement_assets'',''case_enforcements'',''case_expense_items'',''case_fee_items'',''case_fees'',''case_judgments'',''case_notes'',''case_services'',''case_tasks'',''case_time_logs'',''case_timeline'',''cases'',''file_no_counters'',''parties'')' ELSE '' END),false,false,'') COLUMNS n text PATH 'n',h text PATH 'h') x;
-- Additive Shared Case Core. No legacy owner matching, task creation or backfill.
CREATE TABLE public.case_work_core (
 case_id bigint PRIMARY KEY REFERENCES public.cases(id),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 work_state text CHECK(work_state IN ('action_required','waiting_court','waiting_client','waiting_opponent','waiting_external','no_current_action')),
 next_mode text NOT NULL DEFAULT 'none' CHECK(next_mode IN ('none','manual','task')),
 next_task_id uuid REFERENCES public.case_tasks(id),
 next_title text, next_assignee_id uuid REFERENCES public.user_profiles(id), next_due date,
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL REFERENCES public.user_profiles(id),
 CHECK ((next_mode='none' AND next_task_id IS NULL AND next_title IS NULL AND next_assignee_id IS NULL AND next_due IS NULL)
 OR (next_mode='task' AND next_task_id IS NOT NULL AND next_title IS NULL AND next_assignee_id IS NULL AND next_due IS NULL)
 OR (next_mode='manual' AND next_task_id IS NULL AND length(btrim(next_title)) BETWEEN 1 AND 500)),
 CHECK(next_due IS NULL OR isfinite(next_due))
);
CREATE TABLE public.case_team_assignments (
 case_id bigint NOT NULL REFERENCES public.case_work_core(case_id),
 person_id uuid NOT NULL REFERENCES public.user_profiles(id),
 team_role text NOT NULL CHECK(team_role IN ('lead','strategy','qc','member','current_actor')),
 PRIMARY KEY(case_id,person_id,team_role)
);
CREATE UNIQUE INDEX case098_single_role ON public.case_team_assignments(case_id,team_role) WHERE team_role<>'member';
ALTER TABLE public.case_work_core ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_team_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_work_core,public.case_team_assignments FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.case_work_core,public.case_team_assignments TO authenticated;
CREATE POLICY case098_read ON public.case_work_core FOR SELECT TO authenticated
 USING(public.case097_session_ready() AND public.can_view_case_data());
CREATE POLICY case098_read ON public.case_team_assignments FOR SELECT TO authenticated
 USING(public.case097_session_ready() AND public.can_view_case_data());

CREATE FUNCTION public.case098_read(p_case_id bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE result jsonb;
BEGIN
 IF NOT(public.case097_session_ready() AND public.can_view_case_data()) THEN RAISE EXCEPTION 'CASE098_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cases WHERE id=p_case_id) THEN RAISE EXCEPTION 'CASE098_NOT_FOUND'; END IF;
 SELECT jsonb_build_object(
  'core',(SELECT to_jsonb(c) FROM public.case_work_core c WHERE c.case_id=p_case_id),
  'team',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.team_role,t.person_id),'[]') FROM public.case_team_assignments t WHERE t.case_id=p_case_id),
  'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(p.staff_name,''),nullif(p.full_name,''),p.id::text),'full_name',p.full_name,
    'eligible',p.active IS TRUE AND p.account_type='operational' AND p.assignable IS TRUE) ORDER BY p.id),'[]') FROM public.user_profiles p
   WHERE (p.active IS TRUE AND p.account_type='operational' AND p.assignable IS TRUE)
    OR p.id IN (SELECT t.person_id FROM public.case_team_assignments t WHERE t.case_id=p_case_id)
    OR p.id IN (SELECT c.next_assignee_id FROM public.case_work_core c WHERE c.case_id=p_case_id)),
  'tasks',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'task_type',t.task_type,'task_other',t.task_other,'assignee_name',t.assignee_name,'due_date',t.due_date,'status',t.status,'deleted_at',t.deleted_at) ORDER BY t.created_at,t.id),'[]') FROM public.case_tasks t
   WHERE t.case_id=p_case_id AND ((t.deleted_at IS NULL AND coalesce(t.status,'Pending')<>'Done') OR t.id IN(SELECT c.next_task_id FROM public.case_work_core c WHERE c.case_id=p_case_id)))
 ) INTO result;
 RETURN result;
END $fn$;

CREATE FUNCTION public.case098_save(p_case_id bigint,p_version integer,p_section text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.case_work_core; old_facts jsonb; new_facts jsonb; person uuid; entry jsonb; target uuid; actor public.user_profiles;
BEGIN
 IF NOT public.case097_session_ready() OR NOT public.can_view_case_data()
 OR (p_section IN ('team','work') AND NOT public.case097_process_writer())
 OR (p_section='next' AND NOT public.can_write_case_data()) THEN RAISE EXCEPTION 'CASE098_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_section IS NULL OR p_section NOT IN ('team','work','next') OR p_version IS NULL OR p_version<0
 OR p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'CASE098_INVALID_INPUT'; END IF;
 PERFORM 1 FROM public.cases WHERE id=p_case_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CASE098_NOT_FOUND'; END IF;
 SELECT * INTO c FROM public.case_work_core WHERE case_id=p_case_id;
 IF coalesce(c.version,0)<>p_version THEN RAISE EXCEPTION 'CASE098_STALE'; END IF;
 SELECT jsonb_build_object('core',to_jsonb(c),'team',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY team_role,person_id),'[]') FROM public.case_team_assignments t WHERE case_id=p_case_id)) INTO old_facts;
 IF c.case_id IS NULL THEN
  INSERT INTO public.case_work_core(case_id,updated_by) VALUES(p_case_id,auth.uid()) RETURNING * INTO c;
 END IF;
 IF p_section='team' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k<>'assignments') OR jsonb_typeof(p_data->'assignments') IS DISTINCT FROM 'array'
   OR jsonb_array_length(p_data->'assignments')>100 THEN RAISE EXCEPTION 'CASE098_INVALID_INPUT'; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_data->'assignments') LOOP
   IF jsonb_typeof(entry)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(entry) k WHERE k NOT IN('person_id','team_role'))
    OR entry->>'team_role' IS NULL OR entry->>'team_role' NOT IN('lead','strategy','qc','member','current_actor') THEN RAISE EXCEPTION 'CASE098_INVALID_INPUT'; END IF;
   person:=(entry->>'person_id')::uuid;
   IF person IS NULL OR (NOT EXISTS(SELECT 1 FROM public.case_team_assignments t WHERE t.case_id=p_case_id AND t.person_id=person AND t.team_role=entry->>'team_role')
    AND NOT EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.id=person AND p.active IS TRUE AND p.account_type='operational' AND p.assignable IS TRUE)) THEN RAISE EXCEPTION 'CASE098_PERSON_INELIGIBLE'; END IF;
  END LOOP;
  DELETE FROM public.case_team_assignments WHERE case_id=p_case_id;
  INSERT INTO public.case_team_assignments(case_id,person_id,team_role) SELECT p_case_id,(value->>'person_id')::uuid,value->>'team_role' FROM jsonb_array_elements(p_data->'assignments');
 ELSIF p_section='work' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k<>'work_state') OR NOT(p_data ? 'work_state') THEN RAISE EXCEPTION 'CASE098_INVALID_INPUT'; END IF;
  UPDATE public.case_work_core SET work_state=p_data->>'work_state' WHERE case_id=p_case_id;
 ELSE
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('mode','task_id','title','assignee_id','due'))
   OR p_data->>'mode' IS NULL OR p_data->>'mode' NOT IN('none','manual','task') THEN RAISE EXCEPTION 'CASE098_INVALID_INPUT'; END IF;
  IF p_data->>'mode'='task' THEN
   target:=(p_data->>'task_id')::uuid;
   -- Lock the existing task for validation, but never edit or copy its business facts.
   PERFORM 1 FROM public.case_tasks WHERE id=target AND case_id=p_case_id AND deleted_at IS NULL AND coalesce(status,'Pending')<>'Done' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'CASE098_TASK_UNAVAILABLE'; END IF;
  ELSIF p_data->>'mode'='manual' THEN
   person:=nullif(p_data->>'assignee_id','')::uuid;
   IF person IS NOT NULL AND person IS DISTINCT FROM c.next_assignee_id AND NOT EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.id=person AND p.active IS TRUE AND p.account_type='operational' AND p.assignable IS TRUE) THEN RAISE EXCEPTION 'CASE098_PERSON_INELIGIBLE'; END IF;
   IF nullif(btrim(p_data->>'title'),'') IS NULL THEN RAISE EXCEPTION 'CASE098_INVALID_INPUT'; END IF;
  END IF;
  UPDATE public.case_work_core SET next_mode=p_data->>'mode',next_task_id=target,
   next_title=CASE WHEN p_data->>'mode'='manual' THEN btrim(p_data->>'title') END,
   next_assignee_id=person,next_due=CASE WHEN p_data->>'mode'='manual' THEN nullif(p_data->>'due','')::date END WHERE case_id=p_case_id;
 END IF;
 UPDATE public.case_work_core SET version=p_version+1,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE case_id=p_case_id RETURNING * INTO c;
 SELECT jsonb_build_object('core',to_jsonb(c),'team',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY team_role,person_id),'[]') FROM public.case_team_assignments t WHERE case_id=p_case_id)) INTO new_facts;
 SELECT * INTO actor FROM public.user_profiles WHERE id=auth.uid();
 INSERT INTO public.case_audit_logs(case_id,table_name,record_id,action,user_id,user_name,user_role,old_data,new_data,note)
 VALUES(p_case_id,'case_work_core',p_case_id::text,'update',auth.uid(),coalesce(nullif(actor.staff_name,''),actor.full_name),actor.role,old_facts,new_facts,'case098_'||p_section);
 RETURN public.case098_read(p_case_id);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR check_violation OR unique_violation OR not_null_violation THEN RAISE EXCEPTION 'CASE098_INVALID_INPUT';
END $fn$;
ALTER FUNCTION public.case098_read(bigint) OWNER TO postgres;
ALTER FUNCTION public.case098_save(bigint,integer,text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.case098_read(bigint),public.case098_save(bigint,integer,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.case098_read(bigint),public.case098_save(bigint,integer,text,jsonb) TO authenticated;

DO $preserve$ DECLARE old_rows jsonb; new_rows jsonb; BEGIN
 SELECT * INTO old_rows FROM case098_before_rows;
 SELECT jsonb_object_agg(name,jsonb_build_object('count',x.n::bigint,'sha256',x.h) ORDER BY name)
 FROM unnest(ARRAY['case_audit_logs','case_court_filings','case_deadline_extensions','case_deadlines','case_enforcement_assets','case_enforcements','case_expense_items','case_fee_items','case_fees','case_judgments','case_notes','case_services','case_tasks','case_time_logs','case_timeline','cases','file_no_counters','parties']) tab(name)
 CROSS JOIN LATERAL XMLTABLE('/table/row' PASSING query_to_xml(format(
 'SELECT count(*) n,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text COLLATE "C"),''[]''::jsonb)::text,''UTF8'')),''hex'') h FROM public.%I t %s',name,
 CASE WHEN name='case_audit_logs' THEN 'WHERE case_id IS NOT NULL OR table_name IN (''case_audit_logs'',''case_court_filings'',''case_deadline_extensions'',''case_deadlines'',''case_enforcement_assets'',''case_enforcements'',''case_expense_items'',''case_fee_items'',''case_fees'',''case_judgments'',''case_notes'',''case_services'',''case_tasks'',''case_time_logs'',''case_timeline'',''cases'',''file_no_counters'',''parties'')' ELSE '' END),false,false,'') COLUMNS n text PATH 'n',h text PATH 'h') x INTO new_rows;
 IF old_rows IS DISTINCT FROM new_rows THEN RAISE EXCEPTION 'CASE098_HISTORY_CHANGED'; END IF;
END $preserve$;
NOTIFY pgrst,'reload schema';
COMMIT;
