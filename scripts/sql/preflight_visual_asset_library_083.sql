-- STATIC SELECT ONLY. No business/storage writes or RPC calls.
WITH state AS MATERIALIZED (WITH funcs AS (
 SELECT p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' signature,jsonb_build_object(
 'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,
 'acl',(SELECT coalesce(jsonb_agg(jsonb_build_array(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) ORDER BY CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END COLLATE "C",x.privilege_type COLLATE "C"),'[]') FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x)) evidence
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('visual_assets_admin','visual_assets_write')
), relations AS (
 SELECT c.relname,jsonb_build_object('owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,
 'acl',(SELECT coalesce(jsonb_agg(jsonb_build_array(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) ORDER BY CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END COLLATE "C",x.privilege_type COLLATE "C"),'[]') FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname COLLATE "C") FROM pg_constraint WHERE conrelid=c.oid),
 'indexes',(SELECT jsonb_agg(indexdef ORDER BY indexname COLLATE "C") FROM pg_indexes WHERE schemaname='public' AND tablename=c.relname),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname COLLATE "C") FROM pg_policies p WHERE schemaname='public' AND tablename=c.relname),
 'triggers',(SELECT coalesce(jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname COLLATE "C"),'[]') FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)) evidence
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('visual_assets','visual_asset_mappings')
), policies AS (SELECT to_jsonb(p) evidence,policyname FROM pg_policies p WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'visual083_%'),
 existing AS (SELECT jsonb_build_object(
 'profiles', (SELECT coalesce(jsonb_agg(jsonb_build_array(id,encode(sha256(convert_to((to_jsonb(u))::text,'UTF8')),'hex')) ORDER BY id),'[]') FROM public.user_profiles u),
 'buckets',(SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY id COLLATE "C"),'[]') FROM storage.buckets b WHERE id<>'vp-visual-assets'),
 'objects',(SELECT coalesce(jsonb_agg(jsonb_build_array(id,encode(sha256(convert_to((to_jsonb(o))::text,'UTF8')),'hex')) ORDER BY id),'[]') FROM storage.objects o WHERE bucket_id<>'vp-visual-assets')) rows,
 jsonb_build_object('storage_policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY policyname COLLATE "C"),'[]') FROM pg_policies p WHERE schemaname='storage' AND tablename='objects' AND policyname NOT LIKE 'visual083_%'),
 'storage_security',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner),relacl::text) FROM pg_class WHERE oid='storage.objects'::regclass),
 'admin_helper',(SELECT jsonb_build_array(pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner),p.proacl::text) FROM pg_proc p WHERE p.oid=to_regprocedure('public.people_is_active_admin()'))) security)
 SELECT jsonb_build_object('contract',jsonb_build_object(
 'functions',(SELECT coalesce(jsonb_object_agg(signature,evidence),'{}') FROM funcs),
 'tables',(SELECT coalesce(jsonb_object_agg(relname,evidence),'{}') FROM relations),
 'policies',(SELECT coalesce(jsonb_agg(evidence ORDER BY policyname COLLATE "C"),'[]') FROM policies),
 'bucket',(SELECT jsonb_build_object('id',id,'name',name,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types) FROM storage.buckets WHERE id='vp-visual-assets')),
 'rows',rows,'security',security) FROM existing), checks AS (SELECT jsonb_build_object(
 'owner',current_user='postgres',
 'new_objects_absent',state->'contract'='{"functions":{},"tables":{},"policies":[],"bucket":null}'::jsonb,
 'bucket_name_available',NOT EXISTS(SELECT 1 FROM storage.buckets WHERE name='vp-visual-assets'),
 'active_admin_helper_exact',EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.people_is_active_admin()') AND prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=public']::text[] AND pg_get_userbyid(proowner)='postgres' AND regexp_replace(prosrc,'\s','','g')='selectexists(select1frompublic.user_profileswhereid=auth.uid()andactiveistrueandrole=''admin'');'),
 'password_contract',EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.user_profiles'::regclass AND attname='must_change_password' AND atttypid='boolean'::regtype AND NOT attisdropped),
 'storage_rls',EXISTS(SELECT 1 FROM pg_class WHERE oid='storage.objects'::regclass AND relrowsecurity)
 ) value FROM state s(state)),failures AS(SELECT coalesce(jsonb_agg(key ORDER BY key COLLATE "C"),'[]') value FROM checks,jsonb_each(checks.value) c(key,passed) WHERE passed IS DISTINCT FROM 'true'::jsonb)
SELECT jsonb_build_object('gate_pass',failures.value='[]'::jsonb,'failed_checks',failures.value,'candidate_sha256','3682c449f708f600468f6cbd36d3b6de60fd7cc5850f6e9802f38b898481edfa',
 'rows_sha256',encode(sha256(convert_to((state->'rows')::text,'UTF8')),'hex'),'security_sha256',encode(sha256(convert_to((state->'security')::text,'UTF8')),'hex'),'checks',checks.value,
 'scope','083 Visual Asset Library only; does not accept broader business/schema drift','business_rpc_executed',false)
FROM state s(state),checks,failures;
