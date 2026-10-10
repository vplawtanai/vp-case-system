-- 104 Human Apply only. Approved Defendant domain foundation. No business DML/backfill during installation.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
LOCK TABLE public.case_flow_versions,public.case_flow_stages IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.case_flow_instances,public.case_service_controls,public.case_deadlines,public.case_deadline_extensions IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ DECLARE actual jsonb; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'CASE104_OWNER_REQUIRED'; END IF;
 WITH raw AS (WITH rels AS (SELECT c.*,n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname=ANY(ARRAY['cases','parties','case_audit_logs','case_deadlines','case_deadline_extensions','case_work_core','case_team_assignments','case_flow_versions','case_flow_stages','case_flow_instances','case_flow_transitions','case_service_controls','case_service_attempts','case_service_events','case_defendant_representations','case_answer_filings','case_answer_filing_parties','case_extension_groups','case_extension_group_parties','case_counterclaims','case_counterclaim_parties']) AND c.relkind='r')
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
 AND (p.oid::regprocedure::text=ANY(ARRAY['can_create_case()','can_view_audit_logs()','can_view_case_data()','can_view_financial_data()','can_write_case_data()','can_write_financial_data()','create_case_with_number(uuid)','generate_file_no()']) OR p.proname LIKE 'case097_%' OR p.proname LIKE 'case098_%' OR p.proname LIKE 'case099_%' OR p.proname LIKE 'case100_%' OR p.proname LIKE 'case101_%' OR p.proname LIKE 'case102_%' OR p.proname LIKE 'case104_%')))) SELECT jsonb_build_object('tables',(SELECT coalesce(jsonb_object_agg(key,encode(sha256(convert_to((value)::text,'UTF8')),'hex')),'{}') FROM jsonb_each(c->'tables')),'functions',(SELECT coalesce(jsonb_object_agg(key,encode(sha256(convert_to((value)::text,'UTF8')),'hex')),'{}') FROM jsonb_each(c->'functions'))) FROM raw r(c) INTO actual;
 IF actual IS DISTINCT FROM '{"tables":{"cases":"9853e5d4cae8197058b89762f07fa927ad2a2049c0df4f68e1bda2a60c83c4a4","parties":"d3c1b6fd86f21a548e5b2ce8fe00dfde89c0832e9c85fd4aad39a482e9b1fdeb","case_audit_logs":"10553ce47f6cc568656ebacf8e8435235d92456c8f2566f78a6344f597e75113","case_deadlines":"587ddce405382527f91ea30b3c4253ea4530f60369a92db50bdb5b9d83ce58fb","case_deadline_extensions":"68b48ce1baeb2b69c64a5d7428bdec6971cf8fb44175b9665d8a585807be84ed","case_work_core":"3148bdc36579d8b081fc7be368c8360e718978e6addd5224248348c6bb3cde50","case_team_assignments":"7051944c36eaec1dd64a2892fa4d616946fb8d9411f03ac4dbcda48301942f6a","case_flow_versions":"8957a54b63002880009adc027890aee352ffc911d7f686e12a8d20c67c59bf12","case_flow_stages":"454f0c51dc3c54fd54b708393764081f75357b81f17cb0957326957b43a41d03","case_flow_instances":"734b3c64507b6d93bb9ec48730f336e7d6b846fc09cb5bd254f47bbd8095162f","case_flow_transitions":"677c729ef60a3c03ab575a88dbb2dec0d1246d9b35b762c7a53ef86dcfd365ef","case_service_controls":"b3904fe7f2167d611823c2623e6305fa03bfde69ad799fd3e88404f222ef4948","case_service_attempts":"6dfd09648a62f7827d13ed8da2f62c1b3fce267076796bef1f55f9dc687c2d3a","case_service_events":"86bf15b141abc7b69a161f024dc766e4d095c5ec3f39cf9470a64c7e7b95c0a5"},"functions":{"can_create_case()":"1fcf05b9f0d44bb4a4c40f3629f64047c8c07bf5eb99f0d804c49bc91c310812","generate_file_no()":"109650cdc970a5580b27eda3de0155f5010e2a9d9e1f2f65b2224a7b0212b4ed","case101_immutable()":"e74ac745a129d3c72c8de80c276fcf1f06d765ac76e12ce28909915e17221f32","can_view_case_data()":"ad88a5bb95bfe18ee038e76e2266996f229459761c56f87b4f7df3280a50f65d","case098_read(bigint)":"4b4f4afa69df8cca582ff79f7078dc3d47ede2798ce229798fff86645621ed8d","case099_read(bigint)":"e25bda6df2559fc1bc39f2d4ef7b5efd779287e776c55615156f8e8688cc0aca","case100_read(bigint)":"74739f13b683868eb89155b9de50ec6e6cd23cbbc62715fcd0fa93bb926fef3d","case101_read(bigint)":"13463513731100b92f566073f92fccca8d6ad1597ccae1c84ba49c45974d18f2","case102_read(bigint)":"ac0270f0c5ef194b0b5a7360139a9189304d361fe2265637adc0079f63606d58","can_view_audit_logs()":"85637e9111c1f1f336dae53daa21d49a327cb98b7a13e64a76ec9151bb3f5998","can_write_case_data()":"bafa2ef5a10fd0d6c5cf7a9359a03f6a05ba67fff74dca194c86a224239991f7","case097_session_ready()":"a07cc46a6e98d8a857148b40afc91ba84ff8484efe23fdd8f7c9511f9a6bef9e","case097_process_writer()":"620c2842c67adf83fc8df9d5d21fe461ffd8ba5a499b3539edecbd3df7488fc1","can_view_financial_data()":"ec99710571b1f61f406cc02b4285bfbce626af09d109f8c01fb2eff3de69cf1b","can_write_financial_data()":"18cc1d6b61cdcc1be8451048efa6e43aea13f0e5f8c91a07f7af5a108e329258","case097_soft_delete_guard()":"38663e021cf199fdd478cd552443ee7ec6ecd244b2ed31ec9d7b21609160e870","create_case_with_number(uuid)":"49cb92595e7acb9d1da0a8fc8e4919c9583d3083c28e126c229a443700e1e555","case098_save(bigint,integer,text,jsonb)":"d7137c546235fbc46f88f98704173cf00d8ddc50e0da506bdf73b7141d0d8bee","case099_save(bigint,uuid,integer,uuid,jsonb)":"044ba83b9fe21b7d1776f2cc93737013e662c95965f1e415e00eb4f7a0821d2c","case101_save(bigint,uuid,integer,uuid,text,jsonb)":"b8a816370544a84549e174fdf0a293f5d08b5a5dec291f1083ea5134ef019e20","case102_save(bigint,uuid,integer,uuid,text,jsonb)":"4ebc9fcd06cb0019dabb31ada912d8672568b84c4ae7841d5b64a6ab80bd5731","case100_save(bigint,text,uuid,integer,uuid,uuid,jsonb)":"0a67cbce7c3733221ca556fa7a7391cc3c713e804d78ef6dbe8565222757798e"}}'::jsonb THEN RAISE EXCEPTION 'CASE104_CONTRACT_DRIFT'; END IF;
 IF NOT (to_regclass('public.case_defendant_representations') IS NULL AND to_regclass('public.case_answer_filings') IS NULL AND to_regclass('public.case_answer_filing_parties') IS NULL AND to_regclass('public.case_extension_groups') IS NULL AND to_regclass('public.case_extension_group_parties') IS NULL AND to_regclass('public.case_counterclaims') IS NULL AND to_regclass('public.case_counterclaim_parties') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'case104_%')) THEN RAISE EXCEPTION 'CASE104_ALREADY_EXISTS'; END IF;
 IF (SELECT jsonb_build_object('versions',(SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM public.case_flow_versions v),'stages',(SELECT jsonb_agg(to_jsonb(s) ORDER BY template_id,ordinal) FROM public.case_flow_stages s))) IS DISTINCT FROM '{"stages":[{"ordinal":1,"title_en":"Prepare and draft claim","title_th":"เตรียมและร่างคำฟ้อง","stage_key":"prepare_claim","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":2,"title_en":"File claim","title_th":"ยื่นฟ้อง","stage_key":"file_claim","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":3,"title_en":"Claim accepted / first hearing scheduled","title_th":"ศาลรับฟ้อง / ได้วันนัดแรก","stage_key":"accepted","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":4,"title_en":"Await and manage service on defendants","title_th":"รอและจัดการการส่งหมายจำเลย","stage_key":"service","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":5,"title_en":"Await defence / first hearing","title_th":"รอคำให้การ / นัดแรก","stage_key":"defence","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":6,"title_en":"Settlement of issues / mediation","title_th":"ชี้สองสถาน / ไกล่เกลี่ย","stage_key":"issues_mediation","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":7,"title_en":"Prepare evidence hearing","title_th":"เตรียมสืบพยาน","stage_key":"prepare_evidence","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":8,"title_en":"Evidence hearing","title_th":"สืบพยาน","stage_key":"evidence","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":9,"title_en":"Await judgment","title_th":"รอฟังคำพิพากษา","stage_key":"await_judgment","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":10,"title_en":"First-instance judgment / report","title_th":"คำพิพากษาศาลชั้นต้น / รายงานผล","stage_key":"judgment","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":11,"title_en":"Post-judgment analysis and report","title_th":"หลังคำพิพากษา / วิเคราะห์และรายงาน","stage_key":"post_judgment","template_id":"civil_ordinary_plaintiff_v1"},{"ordinal":12,"title_en":"Await continuation decision","title_th":"รอการตัดสินใจดำเนินการต่อ","stage_key":"continuation","template_id":"civil_ordinary_plaintiff_v1"}],"versions":[{"id":"civil_ordinary_plaintiff_v1","family":"civil","variant":"ordinary","version":1,"title_en":"Civil Ordinary Plaintiff","title_th":"คดีแพ่งสามัญ — ฝ่ายโจทก์","template_key":"civil_ordinary_plaintiff","represented_role":"plaintiff"}]}'::jsonb THEN RAISE EXCEPTION 'CASE104_TEMPLATE_DRIFT'; END IF;
 IF NOT ((SELECT count(*)=9 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND column_name IN('id','staff_name','full_name','account_type','assignable','role','active','must_change_password','financial_access'))) THEN RAISE EXCEPTION 'CASE104_PEOPLE_CONTRACT_MISSING'; END IF;
END $guard$;
-- 104 runtime contract. Installation has no business DML or inferred legacy facts.
-- Reuse case_service_events for immutable, Case-scoped receipts; no new audit/event table.
CREATE TABLE public.case_defendant_representations (
 case_id bigint NOT NULL REFERENCES public.cases(id), party_id uuid NOT NULL REFERENCES public.parties(id),
 active boolean NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0), reason text,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), recorded_by uuid NOT NULL REFERENCES public.user_profiles(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_by uuid NOT NULL REFERENCES public.user_profiles(id),
 PRIMARY KEY(case_id,party_id), CHECK(active OR length(btrim(reason))>0)
);
CREATE TABLE public.case_answer_filings (
 id uuid PRIMARY KEY, case_id bigint NOT NULL REFERENCES public.cases(id), filed_on date NOT NULL CHECK(isfinite(filed_on)),
 document_ref text, note text, lifecycle text NOT NULL DEFAULT 'active' CHECK(lifecycle IN('active','void','corrected')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), coverage_version integer NOT NULL DEFAULT 1 CHECK(coverage_version>0),
 replaces_id uuid, reason text,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), recorded_by uuid NOT NULL REFERENCES public.user_profiles(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_by uuid NOT NULL REFERENCES public.user_profiles(id),
 UNIQUE(id,case_id), FOREIGN KEY(replaces_id,case_id) REFERENCES public.case_answer_filings(id,case_id),
 CHECK(replaces_id IS DISTINCT FROM id), CHECK(document_ref IS NULL OR document_ref~'^https://[^[:space:]]+$'),
 CHECK(lifecycle='active' OR length(btrim(reason))>0)
);
CREATE TABLE public.case_answer_filing_parties (
 filing_id uuid NOT NULL REFERENCES public.case_answer_filings(id), coverage_version integer NOT NULL CHECK(coverage_version>0),
 party_id uuid NOT NULL REFERENCES public.parties(id), PRIMARY KEY(filing_id,coverage_version,party_id)
);
CREATE TABLE public.case_extension_groups (
 id uuid PRIMARY KEY, case_id bigint NOT NULL REFERENCES public.cases(id), requested_on date CHECK(isfinite(requested_on)),
 lifecycle text NOT NULL DEFAULT 'pending' CHECK(lifecycle IN('pending','granted')),
 document_ref text, note text, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), recorded_by uuid NOT NULL REFERENCES public.user_profiles(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_by uuid NOT NULL REFERENCES public.user_profiles(id),
 CHECK(document_ref IS NULL OR document_ref~'^https://[^[:space:]]+$')
);
CREATE TABLE public.case_extension_group_parties (
 group_id uuid NOT NULL REFERENCES public.case_extension_groups(id), party_id uuid NOT NULL REFERENCES public.parties(id),
 deadline_id uuid NOT NULL REFERENCES public.case_deadlines(id), extension_id uuid UNIQUE REFERENCES public.case_deadline_extensions(id),
 PRIMARY KEY(group_id,party_id), UNIQUE(group_id,deadline_id)
);
CREATE TABLE public.case_counterclaims (
 id uuid PRIMARY KEY, case_id bigint NOT NULL REFERENCES public.cases(id), filing_id uuid NOT NULL,
 filed_on date NOT NULL CHECK(isfinite(filed_on)), document_ref text, note text,
 lifecycle text NOT NULL DEFAULT 'active' CHECK(lifecycle IN('active','void','corrected')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), coverage_version integer NOT NULL DEFAULT 1 CHECK(coverage_version>0),
 replaces_id uuid, reason text,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), recorded_by uuid NOT NULL REFERENCES public.user_profiles(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_by uuid NOT NULL REFERENCES public.user_profiles(id),
 UNIQUE(id,case_id), FOREIGN KEY(filing_id,case_id) REFERENCES public.case_answer_filings(id,case_id),
 FOREIGN KEY(replaces_id,case_id) REFERENCES public.case_counterclaims(id,case_id),
 CHECK(replaces_id IS DISTINCT FROM id), CHECK(document_ref IS NULL OR document_ref~'^https://[^[:space:]]+$'),
 CHECK(lifecycle='active' OR length(btrim(reason))>0)
);
CREATE TABLE public.case_counterclaim_parties (
 counterclaim_id uuid NOT NULL REFERENCES public.case_counterclaims(id), coverage_version integer NOT NULL CHECK(coverage_version>0),
 party_id uuid NOT NULL REFERENCES public.parties(id), side text NOT NULL CHECK(side IN('claimant','target')),
 PRIMARY KEY(counterclaim_id,coverage_version,party_id,side)
);
CREATE INDEX case104_filings_case ON public.case_answer_filings(case_id,lifecycle);
CREATE INDEX case104_coverage_party ON public.case_answer_filing_parties(party_id,filing_id);
CREATE INDEX case104_extensions_case ON public.case_extension_groups(case_id);
CREATE INDEX case104_counterclaim_filing ON public.case_counterclaims(filing_id,lifecycle);

-- Only the new Defendant template permits unspecified filing metadata. Plaintiff NOT NULL semantics remain.
ALTER TABLE public.case_flow_instances ALTER COLUMN filing_method DROP NOT NULL;
ALTER TABLE public.case_flow_instances ADD CONSTRAINT case104_filing_method_scope
 CHECK(template_id='civil_ordinary_defendant_v1' OR filing_method IS NOT NULL);
-- The enclosing owner transaction holds ACCESS EXCLUSIVE locks on both catalogs.
-- Restore the exact original immutable trigger definitions before any COMMIT.
DROP TRIGGER case101_immutable ON public.case_flow_versions;
DROP TRIGGER case101_immutable ON public.case_flow_stages;
INSERT INTO public.case_flow_versions VALUES
 ('civil_ordinary_defendant_v1','civil_ordinary_defendant',1,'civil','ordinary','defendant','คดีแพ่งสามัญ — ฝ่ายจำเลย','Civil Ordinary Defendant');
INSERT INTO public.case_flow_stages(template_id,stage_key,ordinal,title_th,title_en) VALUES
 ('civil_ordinary_defendant_v1','D-CIV-01',1,'รับหมายและประเมินกำหนด','Receive summons and assess deadlines'),
 ('civil_ordinary_defendant_v1','D-CIV-02',2,'จัดทำและยื่นคำให้การจำเลย','Prepare and file Defendant Answer'),
 ('civil_ordinary_defendant_v1','D-CIV-03',3,'รอนัดแรก','Await first hearing');
CREATE TRIGGER case101_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.case_flow_versions FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();
CREATE TRIGGER case101_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.case_flow_stages FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();

CREATE FUNCTION public.case104_filed_date(p_case_id bigint,p_party_id uuid) RETURNS date
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $fn$
 SELECT min(f.filed_on) FROM public.case_answer_filings f
 JOIN public.case_answer_filing_parties c ON c.filing_id=f.id AND c.coverage_version=f.coverage_version
 WHERE f.case_id=p_case_id AND f.lifecycle='active' AND c.party_id=p_party_id
$fn$;

CREATE FUNCTION public.case104_all_resolved(p_case_id bigint) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.case_defendant_representations WHERE case_id=p_case_id AND active)
 AND NOT EXISTS(SELECT 1 FROM public.case_defendant_representations r JOIN public.parties p ON p.id=r.party_id
 WHERE r.case_id=p_case_id AND r.active AND (p.case_id<>p_case_id OR p.role<>'defendant' OR p.deleted_at IS NOT NULL
 OR public.case104_filed_date(p_case_id,r.party_id) IS NULL))
$fn$;

CREATE FUNCTION public.case104_flow_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF TG_OP='INSERT' AND NEW.track_key='main' AND NEW.template_id<>'civil_ordinary_defendant_v1'
 AND EXISTS(SELECT 1 FROM public.case_defendant_representations WHERE case_id=NEW.case_id) THEN RAISE EXCEPTION 'CASE104_CONTEXT_CONFLICT'; END IF;
 IF TG_OP='UPDATE' AND (OLD.template_id='civil_ordinary_defendant_v1' OR NEW.template_id='civil_ordinary_defendant_v1')
 AND ROW(OLD.case_id,OLD.template_id,OLD.track_key,OLD.started_stage,OLD.start_kind,OLD.started_at,OLD.started_by)
 IS DISTINCT FROM ROW(NEW.case_id,NEW.template_id,NEW.track_key,NEW.started_stage,NEW.start_kind,NEW.started_at,NEW.started_by)
 THEN RAISE EXCEPTION 'CASE104_FLOW_IDENTITY_IMMUTABLE'; END IF;
 IF NEW.template_id='civil_ordinary_defendant_v1' THEN
  IF NEW.track_key<>'main' THEN RAISE EXCEPTION 'CASE104_MAIN_ONLY'; END IF;
  IF NEW.current_stage='D-CIV-03' AND (TG_OP='INSERT' OR OLD.current_stage IS DISTINCT FROM NEW.current_stage)
   AND NOT public.case104_all_resolved(NEW.case_id) THEN RAISE EXCEPTION 'CASE104_UNRESOLVED'; END IF;
 END IF;
 RETURN NEW;
END $fn$;

CREATE FUNCTION public.case104_counterclaim_write(p_case_id bigint,p_action text,p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
DECLARE c public.case_counterclaims; f public.case_answer_filings; ids uuid[]; targets uuid[]; dst uuid; v integer; why text; day date; BEGIN
 IF p_action IS NULL OR p_action NOT IN('create','correct','void','relink') THEN RAISE EXCEPTION 'CASE104_INVALID_INPUT'; END IF;
 IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('id','version','filing_id','filed_on','document_ref','note','claimants','targets','reason','replacement_id'))
 THEN RAISE EXCEPTION 'CASE104_INVALID_INPUT'; END IF;
 dst:=(p_data->>'id')::uuid; why:=nullif(btrim(p_data->>'reason'),'');
 IF dst IS NULL THEN RAISE EXCEPTION 'CASE104_INVALID_INPUT'; END IF;
 SELECT * INTO c FROM public.case_counterclaims WHERE id=dst FOR UPDATE;
 IF p_action='create' THEN
  IF c.id IS NOT NULL OR (p_data->>'version')::integer IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'CASE104_STALE'; END IF;
 ELSE
  IF c.id IS NULL OR c.case_id<>p_case_id OR c.lifecycle<>'active' OR (p_data->>'version')::integer IS DISTINCT FROM c.version THEN RAISE EXCEPTION 'CASE104_STALE'; END IF;
  IF why IS NULL THEN RAISE EXCEPTION 'CASE104_REASON_REQUIRED'; END IF;
 END IF;
 IF p_action='void' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('id','version','reason')) THEN RAISE EXCEPTION 'CASE104_INVALID_INPUT'; END IF;
  UPDATE public.case_counterclaims SET lifecycle='void',reason=why,version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=dst;
  RETURN dst;
 END IF;
 IF p_action NOT IN('create','correct','relink') THEN RAISE EXCEPTION 'CASE104_INVALID_INPUT'; END IF;
 SELECT * INTO f FROM public.case_answer_filings WHERE id=coalesce((p_data->>'filing_id')::uuid,c.filing_id) AND case_id=p_case_id AND lifecycle='active' FOR UPDATE;
 IF f.id IS NULL THEN RAISE EXCEPTION 'CASE104_FILING_UNAVAILABLE'; END IF;
 IF p_data ? 'claimants' OR p_action='create' THEN ids:=public.case104_parties(p_case_id,p_data->'claimants','defendant');
 ELSE SELECT array_agg(party_id ORDER BY party_id) INTO ids FROM public.case_counterclaim_parties WHERE counterclaim_id=c.id AND coverage_version=c.coverage_version AND side='claimant'; END IF;
 IF p_data ? 'targets' OR p_action='create' THEN targets:=public.case104_parties(p_case_id,p_data->'targets','plaintiff',false);
 ELSE SELECT array_agg(party_id ORDER BY party_id) INTO targets FROM public.case_counterclaim_parties WHERE counterclaim_id=c.id AND coverage_version=c.coverage_version AND side='target'; END IF;
 IF cardinality(ids) IS NULL OR cardinality(targets) IS NULL OR EXISTS(SELECT 1 FROM unnest(ids) p WHERE NOT EXISTS(SELECT 1 FROM public.case_answer_filing_parties a WHERE a.filing_id=f.id AND a.coverage_version=f.coverage_version AND a.party_id=p)) THEN RAISE EXCEPTION 'CASE104_COUNTERCLAIM_COVERAGE'; END IF;
 day:=coalesce((p_data->>'filed_on')::date,c.filed_on);
 IF day IS NULL OR NOT isfinite(day) OR day>(current_timestamp AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION 'CASE104_INVALID_DATE'; END IF;
 IF p_action='create' THEN
  INSERT INTO public.case_counterclaims(id,case_id,filing_id,filed_on,document_ref,note,recorded_by,updated_by)
  VALUES(dst,p_case_id,f.id,day,nullif(p_data->>'document_ref',''),p_data->>'note',auth.uid(),auth.uid());v:=1;
 ELSE
  IF p_data ? 'replacement_id' THEN
   dst:=(p_data->>'replacement_id')::uuid;
   IF dst IS NULL OR EXISTS(SELECT 1 FROM public.case_counterclaims WHERE id=dst) THEN RAISE EXCEPTION 'CASE104_INVALID_INPUT'; END IF;
   UPDATE public.case_counterclaims SET lifecycle='corrected',version=version+1,reason=why,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=c.id;
   INSERT INTO public.case_counterclaims(id,case_id,filing_id,filed_on,document_ref,note,replaces_id,reason,recorded_by,updated_by)
   VALUES(dst,p_case_id,f.id,day,CASE WHEN p_data ? 'document_ref' THEN nullif(p_data->>'document_ref','') ELSE c.document_ref END,coalesce(p_data->>'note',c.note),c.id,why,auth.uid(),auth.uid());v:=1;
  ELSE
   v:=c.coverage_version+1;
   UPDATE public.case_counterclaims SET filing_id=f.id,filed_on=day,document_ref=CASE WHEN p_data ? 'document_ref' THEN nullif(p_data->>'document_ref','') ELSE document_ref END,
    note=CASE WHEN p_data ? 'note' THEN p_data->>'note' ELSE note END,reason=why,version=version+1,coverage_version=v,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=c.id;
  END IF;
 END IF;
 INSERT INTO public.case_counterclaim_parties SELECT dst,v,x,'claimant' FROM unnest(ids) x;
 INSERT INTO public.case_counterclaim_parties SELECT dst,v,x,'target' FROM unnest(targets) x;
 RETURN dst;
END $fn$;

CREATE FUNCTION public.case104_deadline_token(p_deadline_id uuid,p_versions jsonb) RETURNS public.case_deadlines
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
DECLARE d public.case_deadlines; t jsonb; BEGIN
 SELECT * INTO d FROM public.case_deadlines WHERE id=p_deadline_id FOR UPDATE;
 t:=p_versions->'deadlines'->p_deadline_id::text;
 IF d.id IS NULL OR d.deleted_at IS NOT NULL OR d.status NOT IN('Active','Done') THEN RAISE EXCEPTION 'CASE104_DEADLINE_UNAVAILABLE'; END IF;
 IF jsonb_typeof(t) IS DISTINCT FROM 'object' OR (t->>'updated_at')::timestamptz IS DISTINCT FROM d.updated_at OR (t->>'due')::date IS DISTINCT FROM d.current_due_date
 THEN RAISE EXCEPTION 'CASE104_STALE_DEADLINE'; END IF;
 RETURN d;
END $fn$;

CREATE FUNCTION public.case104_sync(p_case_id bigint,p_parties uuid[],p_versions jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
DECLARE pid uuid; c public.case_service_controls; d public.case_deadlines; day date; old_d jsonb; effects jsonb:='[]'; BEGIN
 FOR pid IN SELECT DISTINCT x FROM unnest(p_parties) x ORDER BY x LOOP
  day:=public.case104_filed_date(p_case_id,pid);
  SELECT * INTO c FROM public.case_service_controls WHERE case_id=p_case_id AND party_id=pid FOR UPDATE;
  IF c.party_id IS NULL THEN
   INSERT INTO public.case_service_controls(party_id,case_id,answer_filed_on,updated_by) VALUES(pid,p_case_id,day,auth.uid());
   CONTINUE;
  END IF;
  IF c.answer_deadline_id IS NOT NULL THEN
   d:=public.case104_deadline_token(c.answer_deadline_id,p_versions);old_d:=to_jsonb(d);
   IF d.case_id<>p_case_id THEN RAISE EXCEPTION 'CASE104_DEADLINE_UNAVAILABLE'; END IF;
   IF day IS NOT NULL AND c.answer_filed_on IS NULL THEN
    IF d.status<>'Active' THEN RAISE EXCEPTION 'CASE104_DEADLINE_REVIEW_REQUIRED'; END IF;
    UPDATE public.case_deadlines SET status='Done',updated_at=clock_timestamp() WHERE id=d.id RETURNING * INTO d;
   ELSIF day IS NULL AND c.answer_filed_on IS NOT NULL THEN
    -- Reopen only the completion performed by this contract, never a later independent edit/cancellation.
    IF d.status<>'Done' OR NOT EXISTS(SELECT 1 FROM public.case_service_events e CROSS JOIN LATERAL jsonb_array_elements(coalesce(e.after_data->'deadline_effects','[]')) x
     WHERE e.case_id=p_case_id AND e.action LIKE 'case104_%' AND x->'after'->>'id'=d.id::text AND x->'before'->>'status'='Active' AND x->'after'->>'status'='Done'
     AND (x->'after'->>'updated_at')::timestamptz IS NOT DISTINCT FROM d.updated_at)
    THEN RAISE EXCEPTION 'CASE104_DEADLINE_REVIEW_REQUIRED'; END IF;
    UPDATE public.case_deadlines SET status='Active',updated_at=clock_timestamp() WHERE id=d.id RETURNING * INTO d;
   END IF;
   IF old_d IS DISTINCT FROM to_jsonb(d) THEN effects:=effects||jsonb_build_array(jsonb_build_object('party_id',pid,'before',old_d,'after',to_jsonb(d))); END IF;
  END IF;
  IF c.answer_filed_on IS DISTINCT FROM day THEN
   UPDATE public.case_service_controls SET answer_filed_on=day,version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp() WHERE party_id=pid;
  END IF;
 END LOOP;
 RETURN effects;
END $fn$;

CREATE FUNCTION public.case104_integrity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE cid bigint; BEGIN
 IF TG_TABLE_NAME IN('case_answer_filings','case_counterclaims','case_service_controls') THEN cid:=NEW.case_id;
 ELSIF TG_TABLE_NAME='case_answer_filing_parties' THEN SELECT case_id INTO cid FROM public.case_answer_filings WHERE id=NEW.filing_id;
 ELSE SELECT case_id INTO cid FROM public.case_counterclaims WHERE id=NEW.counterclaim_id; END IF;
 IF EXISTS(SELECT 1 FROM public.case_counterclaims c JOIN public.case_answer_filings f ON f.id=c.filing_id
 WHERE c.case_id=cid AND c.lifecycle='active' AND (f.lifecycle<>'active' OR f.case_id<>c.case_id
 OR NOT EXISTS(SELECT 1 FROM public.case_counterclaim_parties p WHERE p.counterclaim_id=c.id AND p.coverage_version=c.coverage_version AND p.side='claimant')
 OR NOT EXISTS(SELECT 1 FROM public.case_counterclaim_parties p WHERE p.counterclaim_id=c.id AND p.coverage_version=c.coverage_version AND p.side='target')
 OR EXISTS(SELECT 1 FROM public.case_counterclaim_parties p WHERE p.counterclaim_id=c.id AND p.coverage_version=c.coverage_version AND p.side='claimant'
 AND NOT EXISTS(SELECT 1 FROM public.case_answer_filing_parties a WHERE a.filing_id=f.id AND a.coverage_version=f.coverage_version AND a.party_id=p.party_id))))
 THEN RAISE EXCEPTION 'CASE104_ACTIVE_COUNTERCLAIM'; END IF;
 IF EXISTS(SELECT 1 FROM public.case_service_controls c JOIN public.case_defendant_representations r USING(case_id,party_id)
 WHERE c.case_id=cid AND c.answer_filed_on IS DISTINCT FROM public.case104_filed_date(cid,c.party_id))
 OR EXISTS(SELECT 1 FROM public.case_answer_filings f JOIN public.case_answer_filing_parties p ON p.filing_id=f.id AND p.coverage_version=f.coverage_version
 WHERE f.case_id=cid AND f.lifecycle='active' AND NOT EXISTS(SELECT 1 FROM public.case_service_controls c WHERE c.case_id=cid AND c.party_id=p.party_id AND c.answer_filed_on IS NOT NULL))
 THEN RAISE EXCEPTION 'CASE104_PROJECTION_ONLY'; END IF;
 RETURN NULL;
END $fn$;
CREATE CONSTRAINT TRIGGER case104_integrity AFTER INSERT OR UPDATE ON public.case_answer_filings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.case104_integrity();
CREATE CONSTRAINT TRIGGER case104_integrity AFTER INSERT ON public.case_answer_filing_parties DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.case104_integrity();
CREATE CONSTRAINT TRIGGER case104_integrity AFTER INSERT OR UPDATE ON public.case_counterclaims DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.case104_integrity();
CREATE CONSTRAINT TRIGGER case104_integrity AFTER INSERT ON public.case_counterclaim_parties DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.case104_integrity();
CREATE CONSTRAINT TRIGGER case104_integrity AFTER INSERT OR UPDATE ON public.case_service_controls DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.case104_integrity();
CREATE TRIGGER case104_flow BEFORE INSERT OR UPDATE ON public.case_flow_instances FOR EACH ROW EXECUTE FUNCTION public.case104_flow_guard();

CREATE FUNCTION public.case104_projection_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF EXISTS(SELECT 1 FROM public.case_defendant_representations WHERE case_id=NEW.case_id AND party_id=NEW.party_id)
 AND NEW.answer_filed_on IS DISTINCT FROM public.case104_filed_date(NEW.case_id,NEW.party_id)
 THEN RAISE EXCEPTION 'CASE104_PROJECTION_ONLY'; END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER case104_projection BEFORE INSERT OR UPDATE ON public.case_service_controls FOR EACH ROW EXECUTE FUNCTION public.case104_projection_guard();

-- Existing generic Deadline API remains available for other data. 104-linked obligations use controlled RPCs only.
-- SECURITY INVOKER is intentional: authenticated table writes are denied, owner RPC writes continue through integrity guards.
CREATE FUNCTION public.case104_deadline_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
DECLARE did uuid; old_did uuid; BEGIN
 IF TG_TABLE_NAME='case_deadlines' THEN
  did:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  IF TG_OP='UPDATE' THEN old_did:=OLD.id; END IF;
 ELSE
  did:=CASE WHEN TG_OP='DELETE' THEN OLD.deadline_id ELSE NEW.deadline_id END;
  IF TG_OP='UPDATE' THEN
   old_did:=OLD.deadline_id;
   IF OLD.deadline_id<>NEW.deadline_id AND EXISTS(SELECT 1 FROM public.case_extension_group_parties WHERE extension_id=OLD.id)
   THEN RAISE EXCEPTION 'CASE104_EXTENSION_IDENTITY_IMMUTABLE'; END IF;
  END IF;
 END IF;
 IF current_user<>'postgres' AND EXISTS(SELECT 1 FROM public.case_service_controls c JOIN public.case_defendant_representations r USING(case_id,party_id) WHERE c.answer_deadline_id IN(did,old_did))
 THEN RAISE EXCEPTION 'CASE104_CONTROLLED_DEADLINE_ONLY'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $fn$;
CREATE TRIGGER case104_deadline BEFORE INSERT OR UPDATE OR DELETE ON public.case_deadlines FOR EACH ROW EXECUTE FUNCTION public.case104_deadline_guard();
CREATE TRIGGER case104_extension BEFORE INSERT OR UPDATE OR DELETE ON public.case_deadline_extensions FOR EACH ROW EXECUTE FUNCTION public.case104_deadline_guard();

CREATE FUNCTION public.case104_parties(p_case_id bigint,p_ids jsonb,p_role text,p_represented boolean DEFAULT true) RETURNS uuid[]
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
DECLARE ids uuid[]; n integer; BEGIN
 IF jsonb_typeof(p_ids) IS DISTINCT FROM 'array' OR jsonb_array_length(p_ids)<1 OR jsonb_array_length(p_ids)>100 THEN RAISE EXCEPTION 'CASE104_PARTIES_REQUIRED'; END IF;
 SELECT array_agg(x::uuid ORDER BY x::uuid),count(DISTINCT x) INTO ids,n FROM jsonb_array_elements_text(p_ids) x;
 IF n<>cardinality(ids) OR array_position(ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'CASE104_DUPLICATE_PARTY'; END IF;
 PERFORM 1 FROM public.parties WHERE id=ANY(ids) ORDER BY id FOR SHARE;
 IF (SELECT count(*) FROM public.parties WHERE id=ANY(ids) AND case_id=p_case_id AND role=p_role AND deleted_at IS NULL)<>cardinality(ids)
 OR (p_represented AND (SELECT count(*) FROM public.case_defendant_representations WHERE case_id=p_case_id AND party_id=ANY(ids) AND active)<>cardinality(ids))
 THEN RAISE EXCEPTION 'CASE104_PARTY_UNAVAILABLE'; END IF;
 RETURN ids;
END $fn$;

CREATE FUNCTION public.case104_read(p_case_id bigint) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE f public.case_flow_instances; ready boolean; inconsistent boolean; BEGIN
 IF NOT(public.case097_session_ready() AND public.can_view_case_data()) THEN RAISE EXCEPTION 'CASE104_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cases WHERE id=p_case_id) THEN RAISE EXCEPTION 'CASE104_NOT_FOUND'; END IF;
 SELECT * INTO f FROM public.case_flow_instances WHERE case_id=p_case_id AND track_key='main' AND template_id='civil_ordinary_defendant_v1';
 ready:=public.case104_all_resolved(p_case_id);
 inconsistent:=coalesce(f.current_stage='D-CIV-03',false) AND NOT ready AND EXISTS(SELECT 1 FROM public.case_defendant_representations r WHERE r.case_id=p_case_id AND r.active);
 RETURN jsonb_build_object(
 'version',(SELECT count(*) FROM public.case_service_events WHERE case_id=p_case_id AND action LIKE 'case104_%'),
 'represented',(SELECT coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('party',to_jsonb(p),'resolved',public.case104_filed_date(p_case_id,r.party_id) IS NOT NULL,'filed_on',public.case104_filed_date(p_case_id,r.party_id),'control',to_jsonb(c),'deadline',to_jsonb(d),'extensions',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.extension_no),'[]') FROM public.case_deadline_extensions e WHERE e.deadline_id=d.id),'attempts',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.recorded_at,a.id),'[]') FROM public.case_service_attempts a WHERE a.party_id=r.party_id)) ORDER BY r.party_id),'[]') FROM public.case_defendant_representations r JOIN public.parties p ON p.id=r.party_id LEFT JOIN public.case_service_controls c ON c.case_id=r.case_id AND c.party_id=r.party_id LEFT JOIN public.case_deadlines d ON d.id=c.answer_deadline_id WHERE r.case_id=p_case_id),
 'filings',(SELECT coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('coverage',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.coverage_version,c.party_id) FROM public.case_answer_filing_parties c WHERE c.filing_id=a.id)) ORDER BY a.recorded_at,a.id),'[]') FROM public.case_answer_filings a WHERE a.case_id=p_case_id),
 'extension_groups',(SELECT coalesce(jsonb_agg(to_jsonb(g)||jsonb_build_object('coverage',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.party_id) FROM public.case_extension_group_parties c WHERE c.group_id=g.id)) ORDER BY g.id),'[]') FROM public.case_extension_groups g WHERE g.case_id=p_case_id),
 'counterclaims',(SELECT coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('coverage',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.coverage_version,c.side,c.party_id) FROM public.case_counterclaim_parties c WHERE c.counterclaim_id=a.id)) ORDER BY a.id),'[]') FROM public.case_counterclaims a WHERE a.case_id=p_case_id),
 'flow',to_jsonb(f),'template',(SELECT to_jsonb(t) FROM public.case_flow_versions t WHERE id='civil_ordinary_defendant_v1'),
 'stages',(SELECT jsonb_agg(to_jsonb(s) ORDER BY ordinal) FROM public.case_flow_stages s WHERE template_id='civil_ordinary_defendant_v1'),
 'transitions',(SELECT coalesce(jsonb_agg(to_jsonb(t)-'request_data' ORDER BY sequence_no DESC),'[]') FROM public.case_flow_transitions t WHERE t.instance_id=f.id),
 'all_resolved',ready,'flow_inconsistency',inconsistent,
 'suggestion',CASE WHEN f.lifecycle='active' AND inconsistent THEN jsonb_build_object('code','RETURN','stage','D-CIV-02','human_confirm_required',true)
 WHEN f.lifecycle='active' AND ready AND f.current_stage<>'D-CIV-03' THEN jsonb_build_object('code','NEXT','stage','D-CIV-03','human_confirm_required',true) ELSE NULL END,
 'history',(SELECT coalesce(jsonb_agg(to_jsonb(e)-'request_data' ORDER BY e.occurred_at DESC,e.id),'[]') FROM public.case_service_events e WHERE e.case_id=p_case_id AND e.action LIKE 'case104_%')
 );
END $fn$;

CREATE FUNCTION public.case104_save(p_case_id bigint,p_request_id uuid,p_action text,p_versions jsonb,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor public.user_profiles; receipt public.case_service_events; req jsonb; v bigint; old_facts jsonb; new_facts jsonb;
 allowed text[]; ids uuid[]; old_ids uuid[]; affected uuid[]:='{}'; pid uuid; fid uuid; dst uuid; day date; why text; entry jsonb; deps jsonb;
 f public.case_answer_filings; c public.case_service_controls; a public.case_service_attempts; d public.case_deadlines; g public.case_extension_groups;
 x public.case_extension_group_parties; i public.case_flow_instances; prev public.case_flow_transitions; old_d jsonb; effects jsonb:='[]';
 event_id uuid:=gen_random_uuid(); result jsonb; cv integer; code text; before_stage text; state text; existed boolean; impact boolean; claimant uuid;
BEGIN
 IF NOT(public.case097_session_ready() AND public.can_view_case_data() AND public.case097_process_writer()) THEN RAISE EXCEPTION 'CASE104_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.user_profiles WHERE id=auth.uid();
 IF p_request_id IS NULL OR jsonb_typeof(p_versions) IS DISTINCT FROM 'object' OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR p_action IS NULL
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_versions) k WHERE k NOT IN('scope','entity','flow','core','deadlines')) THEN RAISE EXCEPTION 'CASE104_INVALID_INPUT'; END IF;
 allowed:=CASE p_action
 WHEN 'representation' THEN ARRAY['parties','active','reason']
 WHEN 'service' THEN ARRAY['party_id','attempt_id','method','attempted_on','result','failure_kind','failure_reason','note','confirm_lawful']
 WHEN 'service_void' THEN ARRAY['party_id','attempt_id','reason']
 WHEN 'deadline' THEN ARRAY['party_id','existing_id','due','confirmed','reason']
 WHEN 'filing_create' THEN ARRAY['id','parties','filed_on','document_ref','note']
 WHEN 'filing_correct' THEN ARRAY['id','parties','filed_on','document_ref','note','reason','replacement_id','dependencies']
 WHEN 'filing_void' THEN ARRAY['id','reason','dependencies']
 WHEN 'extension' THEN ARRAY['id','parties','requested_on','document_ref','note','grants','confirmed','reason']
 WHEN 'counterclaim_create' THEN ARRAY['id','version','filing_id','filed_on','document_ref','note','claimants','targets']
 WHEN 'counterclaim_correct' THEN ARRAY['id','version','filing_id','filed_on','document_ref','note','claimants','targets','reason','replacement_id']
 WHEN 'counterclaim_void' THEN ARRAY['id','version','reason']
 WHEN 'counterclaim_relink' THEN ARRAY['id','version','filing_id','reason']
 WHEN 'flow_start' THEN ARRAY['id','stage','start_kind','acknowledged','filing_method']
 WHEN 'flow_transition' THEN ARRAY['id','stage','confirmed','reason','corrects_id']
 WHEN 'next' THEN ARRAY['next','assignments'] END;
 IF allowed IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE NOT(k=ANY(allowed))) THEN RAISE EXCEPTION 'CASE104_INVALID_INPUT'; END IF;
 IF p_action NOT IN('service','next','flow_transition') AND actor.role NOT IN('lawyer','partner','admin') THEN RAISE EXCEPTION 'CASE104_LAWYER_REQUIRED' USING ERRCODE='42501'; END IF;
 req:=jsonb_build_object('case_id',p_case_id,'action',p_action,'versions',p_versions,'data',p_data);
 -- Serialize all 104 operations (including counterclaim dependencies), without updating legacy Case rows.
 PERFORM 1 FROM public.cases WHERE id=p_case_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CASE104_NOT_FOUND'; END IF;
 SELECT * INTO receipt FROM public.case_service_events WHERE request_id=p_request_id;
 IF receipt.id IS NOT NULL THEN
  IF receipt.actor_id<>auth.uid() OR receipt.action<>'case104_'||p_action OR receipt.request_data IS DISTINCT FROM req THEN RAISE EXCEPTION 'CASE104_REQUEST_CONFLICT'; END IF;
  RETURN receipt.after_data->'result';
 END IF;
 SELECT count(*) INTO v FROM public.case_service_events WHERE case_id=p_case_id AND action LIKE 'case104_%';
 IF (p_versions->>'scope')::bigint IS DISTINCT FROM v THEN RAISE EXCEPTION 'CASE104_STALE'; END IF;
 IF EXISTS(SELECT 1 FROM public.case_flow_instances WHERE case_id=p_case_id AND track_key='main' AND template_id<>'civil_ordinary_defendant_v1') THEN RAISE EXCEPTION 'CASE104_CONTEXT_CONFLICT'; END IF;
 old_facts:=public.case104_read(p_case_id)-'history'-'transitions'-'stages'-'template';
 why:=nullif(btrim(p_data->>'reason'),'');
 IF length(p_data::text)>150000 THEN RAISE EXCEPTION 'CASE104_INVALID_INPUT'; END IF;

 IF p_action='representation' THEN
  IF jsonb_typeof(p_data->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'CASE104_INVALID_INPUT'; END IF;
  ids:=public.case104_parties(p_case_id,p_data->'parties','defendant',false);
  IF p_data->'active'='false'::jsonb AND why IS NULL THEN RAISE EXCEPTION 'CASE104_REASON_REQUIRED'; END IF;
  FOR pid IN SELECT unnest(ids) LOOP
   SELECT EXISTS(SELECT 1 FROM public.case_defendant_representations WHERE case_id=p_case_id AND party_id=pid) INTO existed;
   IF NOT existed AND p_data->'active'='false'::jsonb THEN RAISE EXCEPTION 'CASE104_PARTY_UNAVAILABLE'; END IF;
   -- An old unstructured filed date cannot silently become a newly inferred Filing.
   IF NOT existed AND EXISTS(SELECT 1 FROM public.case_service_controls WHERE party_id=pid AND answer_filed_on IS NOT NULL) THEN RAISE EXCEPTION 'CASE104_LEGACY_FILING_REVIEW'; END IF;
   INSERT INTO public.case_defendant_representations(case_id,party_id,active,reason,recorded_by,updated_by)
   VALUES(p_case_id,pid,(p_data->>'active')::boolean,why,auth.uid(),auth.uid())
   ON CONFLICT(case_id,party_id) DO UPDATE SET active=excluded.active,reason=excluded.reason,version=case_defendant_representations.version+1,updated_at=clock_timestamp(),updated_by=auth.uid();
  END LOOP;
  -- Withdrawal/re-add changes membership only; no sync, completion, deletion or fresh obligation.
  affected:=ids;

 ELSIF p_action IN('service','service_void','deadline') THEN
  ids:=public.case104_parties(p_case_id,jsonb_build_array(p_data->>'party_id'),'defendant');pid:=ids[1];affected:=ids;
  SELECT * INTO c FROM public.case_service_controls WHERE party_id=pid AND case_id=p_case_id FOR UPDATE;
  IF c.party_id IS NULL THEN
   INSERT INTO public.case_service_controls(party_id,case_id,answer_filed_on,updated_by) VALUES(pid,p_case_id,public.case104_filed_date(p_case_id,pid),auth.uid()) RETURNING * INTO c;
  END IF;
  IF p_action='service_void' THEN
   IF why IS NULL THEN RAISE EXCEPTION 'CASE104_REASON_REQUIRED'; END IF;
   SELECT * INTO a FROM public.case_service_attempts WHERE id=(p_data->>'attempt_id')::uuid AND party_id=pid AND case_id=p_case_id FOR UPDATE;
   IF a.id IS NULL OR a.result='void' THEN RAISE EXCEPTION 'CASE104_ATTEMPT_UNAVAILABLE'; END IF;
   IF c.lawful_attempt_id=a.id AND (c.answer_deadline_id IS NOT NULL OR c.answer_filed_on IS NOT NULL) THEN RAISE EXCEPTION 'CASE104_DEADLINE_REVIEW_REQUIRED'; END IF;
   UPDATE public.case_service_attempts SET result='void',void_reason=why,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=a.id;
   IF c.lawful_attempt_id=a.id THEN UPDATE public.case_service_controls SET lawful_attempt_id=NULL,lawful_at=NULL,lawful_by=NULL WHERE party_id=pid; END IF;
  ELSIF p_action='service' THEN
   day:=(p_data->>'attempted_on')::date;
   IF day IS NOT NULL AND (NOT isfinite(day) OR day>(current_timestamp AT TIME ZONE 'Asia/Bangkok')::date) THEN RAISE EXCEPTION 'CASE104_INVALID_DATE'; END IF;
   IF p_data->>'result' IS NULL OR p_data->>'result' NOT IN('pending','served','failed') THEN RAISE EXCEPTION 'CASE104_INVALID_INPUT'; END IF;
   IF p_data->'confirm_lawful'='true'::jsonb AND (actor.role NOT IN('lawyer','partner','admin') OR p_data->>'result'<>'served') THEN RAISE EXCEPTION 'CASE104_LAWYER_REQUIRED'; END IF;
   IF p_data ? 'confirm_lawful' AND jsonb_typeof(p_data->'confirm_lawful') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'CASE104_INVALID_INPUT'; END IF;
   dst:=(p_data->>'attempt_id')::uuid;
   IF dst IS NULL THEN
    dst:=gen_random_uuid();
    INSERT INTO public.case_service_attempts(id,party_id,case_id,method,attempted_on,result,failure_kind,failure_reason,note,recorded_by,updated_by)
    VALUES(dst,pid,p_case_id,p_data->>'method',day,p_data->>'result',p_data->>'failure_kind',p_data->>'failure_reason',p_data->>'note',auth.uid(),auth.uid());
   ELSE
    SELECT * INTO a FROM public.case_service_attempts WHERE id=dst AND party_id=pid AND case_id=p_case_id FOR UPDATE;
    IF a.id IS NULL OR a.result<>'pending' THEN RAISE EXCEPTION 'CASE104_ATTEMPT_FINAL'; END IF;
    UPDATE public.case_service_attempts SET method=p_data->>'method',attempted_on=day,result=p_data->>'result',failure_kind=p_data->>'failure_kind',failure_reason=p_data->>'failure_reason',note=p_data->>'note',updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=dst;
   END IF;
   IF p_data->'confirm_lawful'='true'::jsonb THEN
    IF c.lawful_attempt_id IS NOT NULL AND c.lawful_attempt_id<>dst THEN RAISE EXCEPTION 'CASE104_DEADLINE_REVIEW_REQUIRED'; END IF;
    UPDATE public.case_service_controls SET lawful_attempt_id=dst,lawful_at=clock_timestamp(),lawful_by=auth.uid() WHERE party_id=pid;
   END IF;
  ELSE
   IF p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'CASE104_CONFIRM_REQUIRED'; END IF;
   IF c.answer_deadline_id IS NOT NULL OR public.case104_filed_date(p_case_id,pid) IS NOT NULL THEN RAISE EXCEPTION 'CASE104_DEADLINE_LINKED'; END IF;
   dst:=(p_data->>'existing_id')::uuid;
   IF dst IS NULL THEN
    day:=(p_data->>'due')::date;IF day IS NULL OR NOT isfinite(day) THEN RAISE EXCEPTION 'CASE104_INVALID_DATE'; END IF;
    INSERT INTO public.case_deadlines(case_id,order_no,deadline_type,original_due_date,current_due_date,status,note)
    VALUES(p_case_id,(SELECT coalesce(max(order_no),0)+1 FROM public.case_deadlines WHERE case_id=p_case_id),'answer',day,day,'Active',why) RETURNING * INTO d;
   ELSE
    d:=public.case104_deadline_token(dst,p_versions);
    IF d.case_id<>p_case_id OR d.deadline_type<>'answer' OR d.status<>'Active' OR EXISTS(SELECT 1 FROM public.case_service_controls WHERE answer_deadline_id=dst OR default_deadline_id=dst) THEN RAISE EXCEPTION 'CASE104_DEADLINE_UNAVAILABLE'; END IF;
   END IF;
   UPDATE public.case_service_controls SET answer_deadline_id=d.id WHERE party_id=pid;
  END IF;
  UPDATE public.case_service_controls SET version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE party_id=pid;

 ELSIF p_action IN('filing_create','filing_correct','filing_void') THEN
  fid:=(p_data->>'id')::uuid;IF fid IS NULL THEN RAISE EXCEPTION 'CASE104_INVALID_INPUT'; END IF;
  SELECT * INTO f FROM public.case_answer_filings WHERE id=fid FOR UPDATE;
  IF p_action='filing_create' THEN
   IF f.id IS NOT NULL OR (p_versions->>'entity')::integer IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'CASE104_STALE'; END IF;
  ELSE
   IF f.id IS NULL OR f.case_id<>p_case_id OR f.lifecycle<>'active' OR (p_versions->>'entity')::integer IS DISTINCT FROM f.version THEN RAISE EXCEPTION 'CASE104_STALE'; END IF;
   IF why IS NULL THEN RAISE EXCEPTION 'CASE104_REASON_REQUIRED'; END IF;
   SELECT array_agg(party_id ORDER BY party_id) INTO old_ids FROM public.case_answer_filing_parties WHERE filing_id=f.id AND coverage_version=f.coverage_version;
  END IF;
  IF p_action='filing_void' THEN ids:=old_ids;
  ELSIF p_action='filing_create' OR p_data ? 'parties' THEN ids:=public.case104_parties(p_case_id,p_data->'parties','defendant');
  ELSE ids:=old_ids; END IF;
  affected:=coalesce(old_ids,'{}'::uuid[])||coalesce(ids,'{}'::uuid[]);
  impact:=p_action='filing_void' OR (p_action='filing_correct' AND (old_ids IS DISTINCT FROM ids OR p_data ? 'replacement_id'));
  deps:=coalesce(p_data->'dependencies','[]'::jsonb);
  IF jsonb_typeof(deps)<>'array' OR jsonb_array_length(deps)>100 OR (NOT impact AND jsonb_array_length(deps)>0) THEN RAISE EXCEPTION 'CASE104_INVALID_INPUT'; END IF;
  IF impact AND EXISTS(SELECT 1 FROM public.case_counterclaims q WHERE q.filing_id=fid AND q.lifecycle='active'
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(deps) z WHERE z->>'id'=q.id::text)) THEN RAISE EXCEPTION 'CASE104_ACTIVE_COUNTERCLAIM'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(deps))<>(SELECT count(DISTINCT z->>'id') FROM jsonb_array_elements(deps) z) THEN RAISE EXCEPTION 'CASE104_INVALID_INPUT'; END IF;
  -- All dependencies are explicit. A replacement is created inside this same transaction, never exposed partially.
  IF p_action<>'filing_void' THEN
   day:=coalesce((p_data->>'filed_on')::date,f.filed_on);
   IF day IS NULL OR NOT isfinite(day) OR day>(current_timestamp AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION 'CASE104_INVALID_DATE'; END IF;
   dst:=CASE WHEN p_action='filing_create' THEN fid ELSE coalesce((p_data->>'replacement_id')::uuid,fid) END;
   IF p_action='filing_create' OR dst<>fid THEN
    INSERT INTO public.case_answer_filings(id,case_id,filed_on,document_ref,note,replaces_id,reason,recorded_by,updated_by)
    VALUES(dst,p_case_id,day,CASE WHEN p_data ? 'document_ref' THEN nullif(p_data->>'document_ref','') ELSE f.document_ref END,coalesce(p_data->>'note',f.note),CASE WHEN dst<>fid THEN fid ELSE NULL END,why,auth.uid(),auth.uid());cv:=1;
   ELSE
    cv:=f.coverage_version+CASE WHEN ids IS DISTINCT FROM old_ids THEN 1 ELSE 0 END;
    UPDATE public.case_answer_filings SET filed_on=day,document_ref=CASE WHEN p_data ? 'document_ref' THEN nullif(p_data->>'document_ref','') ELSE document_ref END,note=CASE WHEN p_data ? 'note' THEN p_data->>'note' ELSE note END,
     reason=why,version=version+1,coverage_version=cv,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=fid;
   END IF;
   IF p_action='filing_create' OR dst<>fid OR ids IS DISTINCT FROM old_ids THEN INSERT INTO public.case_answer_filing_parties SELECT dst,cv,u.party_id FROM unnest(ids) u(party_id); END IF;
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(deps) LOOP
   IF entry->>'action' IS NULL OR entry->>'action' NOT IN('void','correct','relink') OR NOT EXISTS(SELECT 1 FROM public.case_counterclaims WHERE id=(entry->>'id')::uuid AND case_id=p_case_id AND filing_id=fid AND lifecycle='active') THEN RAISE EXCEPTION 'CASE104_INVALID_DEPENDENCY'; END IF;
   PERFORM public.case104_counterclaim_write(p_case_id,entry->>'action',entry-'action');
  END LOOP;
  IF p_action='filing_void' OR (p_action='filing_correct' AND dst<>fid) THEN
   IF EXISTS(SELECT 1 FROM public.case_counterclaims WHERE filing_id=fid AND lifecycle='active') THEN RAISE EXCEPTION 'CASE104_ACTIVE_COUNTERCLAIM'; END IF;
   UPDATE public.case_answer_filings SET lifecycle=CASE WHEN p_action='filing_void' THEN 'void' ELSE 'corrected' END,reason=why,version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=fid;
  END IF;
  effects:=public.case104_sync(p_case_id,affected,p_versions);

 ELSIF p_action LIKE 'counterclaim_%' THEN
  dst:=public.case104_counterclaim_write(p_case_id,substr(p_action,14),p_data);

 ELSIF p_action='extension' THEN
  dst:=(p_data->>'id')::uuid;IF dst IS NULL THEN RAISE EXCEPTION 'CASE104_INVALID_INPUT'; END IF;
  SELECT * INTO g FROM public.case_extension_groups WHERE id=dst FOR UPDATE;
  IF g.id IS NULL THEN
   IF (p_versions->>'entity')::integer IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'CASE104_STALE'; END IF;
   ids:=public.case104_parties(p_case_id,p_data->'parties','defendant');
   day:=(p_data->>'requested_on')::date;IF day IS NOT NULL AND (NOT isfinite(day) OR day>(current_timestamp AT TIME ZONE 'Asia/Bangkok')::date) THEN RAISE EXCEPTION 'CASE104_INVALID_DATE'; END IF;
   INSERT INTO public.case_extension_groups(id,case_id,requested_on,document_ref,note,recorded_by,updated_by) VALUES(dst,p_case_id,day,nullif(p_data->>'document_ref',''),p_data->>'note',auth.uid(),auth.uid()) RETURNING * INTO g;
   FOR pid IN SELECT unnest(ids) LOOP
    SELECT * INTO c FROM public.case_service_controls WHERE party_id=pid AND case_id=p_case_id FOR UPDATE;
    IF c.answer_deadline_id IS NULL OR public.case104_filed_date(p_case_id,pid) IS NOT NULL THEN RAISE EXCEPTION 'CASE104_DEADLINE_UNAVAILABLE'; END IF;
    d:=public.case104_deadline_token(c.answer_deadline_id,p_versions);
    IF d.case_id<>p_case_id OR d.status<>'Active' THEN RAISE EXCEPTION 'CASE104_DEADLINE_UNAVAILABLE'; END IF;
    INSERT INTO public.case_extension_group_parties(group_id,party_id,deadline_id) VALUES(dst,pid,d.id);
   END LOOP;
  ELSE
   IF g.case_id<>p_case_id OR (p_versions->>'entity')::integer IS DISTINCT FROM g.version THEN RAISE EXCEPTION 'CASE104_STALE'; END IF;
   IF why IS NULL THEN RAISE EXCEPTION 'CASE104_REASON_REQUIRED'; END IF;
   IF p_data ? 'parties' THEN RAISE EXCEPTION 'CASE104_EXTENSION_COVERAGE_IMMUTABLE'; END IF;
   IF p_data ? 'requested_on' THEN RAISE EXCEPTION 'CASE104_INVALID_INPUT'; END IF;
   SELECT array_agg(party_id ORDER BY party_id) INTO ids FROM public.case_extension_group_parties WHERE group_id=g.id;
   PERFORM public.case104_parties(p_case_id,to_jsonb(ids),'defendant');
  END IF;
  affected:=ids;
  IF p_data ? 'grants' THEN
   IF p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'CASE104_CONFIRM_REQUIRED'; END IF;
   IF jsonb_typeof(p_data->'grants') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'grants')<>cardinality(ids)
    OR (SELECT count(DISTINCT z->>'party_id') FROM jsonb_array_elements(p_data->'grants') z)<>cardinality(ids) THEN RAISE EXCEPTION 'CASE104_EXTENSION_COVERAGE'; END IF;
   FOR entry IN SELECT value FROM jsonb_array_elements(p_data->'grants') ORDER BY value->>'party_id' LOOP
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(entry) k WHERE k NOT IN('party_id','due')) THEN RAISE EXCEPTION 'CASE104_INVALID_INPUT'; END IF;
    pid:=(entry->>'party_id')::uuid;day:=(entry->>'due')::date;
    IF pid IS NULL OR NOT(pid=ANY(ids)) OR day IS NULL OR NOT isfinite(day) OR public.case104_filed_date(p_case_id,pid) IS NOT NULL THEN RAISE EXCEPTION 'CASE104_EXTENSION_COVERAGE'; END IF;
    SELECT * INTO x FROM public.case_extension_group_parties WHERE group_id=dst AND party_id=pid FOR UPDATE;
    d:=public.case104_deadline_token(x.deadline_id,p_versions);old_d:=to_jsonb(d);
    IF d.status<>'Active' OR d.case_id<>p_case_id THEN RAISE EXCEPTION 'CASE104_DEADLINE_UNAVAILABLE'; END IF;
    IF x.extension_id IS NULL THEN
     INSERT INTO public.case_deadline_extensions(deadline_id,extension_no,requested_date,granted_until_date,note)
     VALUES(d.id,(SELECT coalesce(max(extension_no),0)+1 FROM public.case_deadline_extensions WHERE deadline_id=d.id),g.requested_on,day,coalesce(p_data->>'note',g.note)) RETURNING id INTO claimant;
     UPDATE public.case_extension_group_parties SET extension_id=claimant WHERE group_id=dst AND party_id=pid;
    ELSE
     IF NOT EXISTS(SELECT 1 FROM public.case_deadline_extensions e WHERE e.id=x.extension_id AND e.deleted_at IS NULL AND e.granted_until_date=d.current_due_date
      AND e.extension_no=(SELECT max(extension_no) FROM public.case_deadline_extensions WHERE deadline_id=d.id AND deleted_at IS NULL)) THEN RAISE EXCEPTION 'CASE104_EXTENSION_REVIEW_REQUIRED'; END IF;
     UPDATE public.case_deadline_extensions SET granted_until_date=day,note=coalesce(p_data->>'note',note),updated_at=clock_timestamp() WHERE id=x.extension_id;
    END IF;
    UPDATE public.case_deadlines SET current_due_date=day,updated_at=clock_timestamp() WHERE id=d.id RETURNING * INTO d;
    effects:=effects||jsonb_build_array(jsonb_build_object('party_id',pid,'before',old_d,'after',to_jsonb(d)));
   END LOOP;
   UPDATE public.case_extension_groups SET lifecycle='granted' WHERE id=dst;
  END IF;
  UPDATE public.case_extension_groups SET version=CASE WHEN (p_versions->>'entity')::integer=0 THEN 1 ELSE version+1 END,
   document_ref=CASE WHEN p_data ? 'document_ref' THEN nullif(p_data->>'document_ref','') ELSE document_ref END,note=CASE WHEN p_data ? 'note' THEN p_data->>'note' ELSE note END,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=dst;

 ELSIF p_action IN('flow_start','flow_transition') THEN
  dst:=(p_data->>'id')::uuid;IF dst IS NULL THEN RAISE EXCEPTION 'CASE104_INVALID_INPUT'; END IF;
  SELECT * INTO i FROM public.case_flow_instances WHERE case_id=p_case_id AND track_key='main' FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.case_defendant_representations WHERE case_id=p_case_id AND active) THEN RAISE EXCEPTION 'CASE104_PARTIES_REQUIRED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.case_flow_stages WHERE template_id='civil_ordinary_defendant_v1' AND stage_key=p_data->>'stage') THEN RAISE EXCEPTION 'CASE104_INVALID_STAGE'; END IF;
  IF p_action='flow_start' THEN
   IF i.id IS NOT NULL OR (p_versions->>'flow')::integer IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'CASE104_STALE'; END IF;
   IF p_data->'acknowledged' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'CASE104_CONFIRM_REQUIRED'; END IF;
   IF p_data->>'start_kind' IS NULL OR p_data->>'start_kind' NOT IN('new','cut_in') OR (p_data->>'start_kind'='new' AND p_data->>'stage'<>'D-CIV-01') THEN RAISE EXCEPTION 'CASE104_CUT_IN_REQUIRED'; END IF;
   INSERT INTO public.case_flow_instances(id,case_id,track_key,template_id,filing_method,current_stage,started_stage,start_kind,started_by,updated_by)
   VALUES(dst,p_case_id,'main','civil_ordinary_defendant_v1',p_data->>'filing_method',p_data->>'stage',p_data->>'stage',p_data->>'start_kind',auth.uid(),auth.uid()) RETURNING * INTO i;
   INSERT INTO public.case_flow_transitions(id,instance_id,template_id,sequence_no,event_kind,to_stage,to_lifecycle,actor_id,request_id,request_data)
   VALUES(gen_random_uuid(),i.id,i.template_id,1,'start',i.current_stage,i.lifecycle,auth.uid(),p_request_id,req);
  ELSE
   IF i.id IS DISTINCT FROM dst OR i.template_id<>'civil_ordinary_defendant_v1' OR i.lifecycle<>'active' OR (p_versions->>'flow')::integer IS DISTINCT FROM i.version THEN RAISE EXCEPTION 'CASE104_STALE'; END IF;
   IF p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'CASE104_CONFIRM_REQUIRED'; END IF;
   before_stage:=i.current_stage;state:=i.lifecycle;
   SELECT CASE WHEN dest.ordinal=src.ordinal+1 THEN 'NEXT' WHEN dest.ordinal=src.ordinal THEN 'REPEAT' WHEN dest.ordinal>src.ordinal+1 THEN 'SKIP' ELSE 'RETURN' END INTO code
    FROM public.case_flow_stages src CROSS JOIN public.case_flow_stages dest WHERE src.template_id=i.template_id AND dest.template_id=i.template_id AND src.stage_key=i.current_stage AND dest.stage_key=p_data->>'stage';
   IF p_data ? 'corrects_id' THEN
    SELECT * INTO prev FROM public.case_flow_transitions WHERE instance_id=i.id ORDER BY sequence_no DESC LIMIT 1;
    IF (p_data->>'corrects_id')::uuid IS DISTINCT FROM prev.id THEN RAISE EXCEPTION 'CASE104_STALE'; END IF;code:='RETURN';
   END IF;
   IF code<>'NEXT' AND why IS NULL THEN RAISE EXCEPTION 'CASE104_REASON_REQUIRED'; END IF;
   UPDATE public.case_flow_instances SET current_stage=p_data->>'stage',version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=i.id RETURNING * INTO i;
   INSERT INTO public.case_flow_transitions(id,instance_id,template_id,sequence_no,event_kind,transition_code,from_stage,to_stage,from_lifecycle,to_lifecycle,reason,corrects_id,actor_id,request_id,request_data)
   VALUES(gen_random_uuid(),i.id,i.template_id,i.version,CASE WHEN p_data ? 'corrects_id' THEN 'correction' ELSE 'transition' END,code,before_stage,i.current_stage,state,i.lifecycle,why,(p_data->>'corrects_id')::uuid,auth.uid(),p_request_id,req);
  END IF;

 ELSIF p_action='next' THEN
  IF NOT EXISTS(SELECT 1 FROM public.case_defendant_representations WHERE case_id=p_case_id AND active) THEN RAISE EXCEPTION 'CASE104_PARTIES_REQUIRED'; END IF;
  IF NOT(p_data ? 'next' OR p_data ? 'assignments') THEN RAISE EXCEPTION 'CASE104_INVALID_INPUT'; END IF;
  IF p_data ? 'next' THEN
   pid:=(p_data->'next'->>'assignee_id')::uuid;
   IF pid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=pid AND active AND NOT must_change_password AND account_type='operational' AND assignable AND role IN('admin','partner','lawyer','assistant_lawyer','staff')) THEN RAISE EXCEPTION 'CASE104_PERSON_INELIGIBLE'; END IF;
   result:=public.case098_save(p_case_id,(p_versions->>'core')::integer,'next',p_data->'next');
  END IF;
  IF p_data ? 'assignments' THEN
   FOR entry IN SELECT value FROM jsonb_array_elements(p_data->'assignments') LOOP
    IF NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=(entry->>'person_id')::uuid AND active AND NOT must_change_password AND account_type='operational' AND assignable AND role IN('admin','partner','lawyer','assistant_lawyer','staff')) THEN RAISE EXCEPTION 'CASE104_PERSON_INELIGIBLE'; END IF;
   END LOOP;
   result:=public.case098_save(p_case_id,CASE WHEN p_data ? 'next' THEN (result->'core'->>'version')::integer ELSE (p_versions->>'core')::integer END,'team',jsonb_build_object('assignments',p_data->'assignments'));
  END IF;
 END IF;

 -- Dependency and projection checks run before acknowledging success, not only at outer COMMIT.
 SET CONSTRAINTS case104_integrity IMMEDIATE;
 SET CONSTRAINTS case104_integrity DEFERRED;
 SELECT coalesce(array_agg(DISTINCT u.party_id ORDER BY u.party_id),'{}') INTO affected FROM unnest(affected) u(party_id) WHERE u.party_id IS NOT NULL;
 IF p_action='filing_void' THEN dst:=fid; END IF;
 new_facts:=(public.case104_read(p_case_id)-'history'-'transitions'-'stages'-'template')||jsonb_build_object('version',v+1);
 result:=jsonb_build_object('receipt_id',event_id,'request_id',p_request_id,'version',v+1,'entity_id',dst,'affected_parties',to_jsonb(affected),
  'deadline_effects',effects,'all_resolved',new_facts->'all_resolved','flow_inconsistency',new_facts->'flow_inconsistency','suggestion',new_facts->'suggestion');
 INSERT INTO public.case_service_events(id,case_id,party_id,action,actor_id,before_data,after_data,request_id,request_data)
 VALUES(event_id,p_case_id,NULL,'case104_'||p_action,auth.uid(),old_facts,new_facts||jsonb_build_object('version',v+1,'deadline_effects',effects,'result',result),p_request_id,req);
 INSERT INTO public.case_audit_logs(case_id,table_name,record_id,action,user_id,user_name,user_role,old_data,new_data,note)
 VALUES(p_case_id,CASE WHEN p_action LIKE 'filing_%' THEN 'case_answer_filings' WHEN p_action LIKE 'counterclaim_%' THEN 'case_counterclaims'
  WHEN p_action='extension' THEN 'case_extension_groups' WHEN p_action LIKE 'flow_%' THEN 'case_flow_instances' WHEN p_action LIKE 'service%' THEN 'case_service_attempts'
  WHEN p_action='deadline' THEN 'case_deadlines' WHEN p_action='next' THEN 'case_work_core' ELSE 'case_defendant_representations' END,
  coalesce(dst::text,p_case_id::text),'update',auth.uid(),coalesce(nullif(actor.staff_name,''),actor.full_name),actor.role,old_facts,new_facts||jsonb_build_object('receipt_id',event_id,'deadline_effects',effects),'case104_'||p_action||coalesce(': '||why,''));
 RETURN result;
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR check_violation OR not_null_violation OR foreign_key_violation OR unique_violation THEN RAISE EXCEPTION 'CASE104_INVALID_INPUT';
END $fn$;

ALTER TABLE public.case_defendant_representations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_defendant_representations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.case_defendant_representations TO authenticated;
CREATE POLICY case104_read ON public.case_defendant_representations FOR SELECT TO authenticated USING(public.case097_session_ready() AND public.can_view_case_data());
CREATE TRIGGER case104_preserve BEFORE DELETE OR TRUNCATE ON public.case_defendant_representations FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();
ALTER TABLE public.case_answer_filings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_answer_filings FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.case_answer_filings TO authenticated;
CREATE POLICY case104_read ON public.case_answer_filings FOR SELECT TO authenticated USING(public.case097_session_ready() AND public.can_view_case_data());
CREATE TRIGGER case104_preserve BEFORE DELETE OR TRUNCATE ON public.case_answer_filings FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();
ALTER TABLE public.case_answer_filing_parties ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_answer_filing_parties FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.case_answer_filing_parties TO authenticated;
CREATE POLICY case104_read ON public.case_answer_filing_parties FOR SELECT TO authenticated USING(public.case097_session_ready() AND public.can_view_case_data());
CREATE TRIGGER case104_preserve BEFORE UPDATE OR DELETE OR TRUNCATE ON public.case_answer_filing_parties FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();
ALTER TABLE public.case_extension_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_extension_groups FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.case_extension_groups TO authenticated;
CREATE POLICY case104_read ON public.case_extension_groups FOR SELECT TO authenticated USING(public.case097_session_ready() AND public.can_view_case_data());
CREATE TRIGGER case104_preserve BEFORE DELETE OR TRUNCATE ON public.case_extension_groups FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();
ALTER TABLE public.case_extension_group_parties ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_extension_group_parties FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.case_extension_group_parties TO authenticated;
CREATE POLICY case104_read ON public.case_extension_group_parties FOR SELECT TO authenticated USING(public.case097_session_ready() AND public.can_view_case_data());
CREATE TRIGGER case104_preserve BEFORE DELETE OR TRUNCATE ON public.case_extension_group_parties FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();
ALTER TABLE public.case_counterclaims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_counterclaims FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.case_counterclaims TO authenticated;
CREATE POLICY case104_read ON public.case_counterclaims FOR SELECT TO authenticated USING(public.case097_session_ready() AND public.can_view_case_data());
CREATE TRIGGER case104_preserve BEFORE DELETE OR TRUNCATE ON public.case_counterclaims FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();
ALTER TABLE public.case_counterclaim_parties ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_counterclaim_parties FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.case_counterclaim_parties TO authenticated;
CREATE POLICY case104_read ON public.case_counterclaim_parties FOR SELECT TO authenticated USING(public.case097_session_ready() AND public.can_view_case_data());
CREATE TRIGGER case104_preserve BEFORE UPDATE OR DELETE OR TRUNCATE ON public.case_counterclaim_parties FOR EACH STATEMENT EXECUTE FUNCTION public.case101_immutable();
ALTER FUNCTION public.case104_filed_date(bigint,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.case104_filed_date(bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.case104_all_resolved(bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.case104_all_resolved(bigint) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.case104_flow_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.case104_flow_guard() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.case104_counterclaim_write(bigint,text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.case104_counterclaim_write(bigint,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.case104_deadline_token(uuid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.case104_deadline_token(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.case104_sync(bigint,uuid[],jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.case104_sync(bigint,uuid[],jsonb) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.case104_integrity() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.case104_integrity() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.case104_projection_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.case104_projection_guard() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.case104_deadline_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.case104_deadline_guard() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.case104_parties(bigint,jsonb,text,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.case104_parties(bigint,jsonb,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.case104_read(bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.case104_read(bigint) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.case104_save(bigint,uuid,text,jsonb,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.case104_save(bigint,uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.case104_read(bigint),public.case104_save(bigint,uuid,text,jsonb,jsonb) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
