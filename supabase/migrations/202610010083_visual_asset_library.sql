-- 083: isolated Admin Visual Asset Library. HUMAN APPLY ONLY.
-- No artwork seed/backfill and no changes to existing business objects.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $guard$
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'VISUAL083_OWNER_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.people_is_active_admin()') AND prosecdef AND provolatile='s'
  AND proconfig=ARRAY['search_path=public']::text[] AND pg_get_userbyid(proowner)='postgres'
  AND regexp_replace(prosrc,'\s','','g')='selectexists(select1frompublic.user_profileswhereid=auth.uid()andactiveistrueandrole=''admin'');')
 THEN RAISE EXCEPTION 'VISUAL083_ADMIN_BASELINE_MISMATCH'; END IF;
 IF to_regclass('public.visual_assets') IS NOT NULL OR to_regclass('public.visual_asset_mappings') IS NOT NULL
  OR EXISTS(SELECT 1 FROM storage.buckets WHERE id='vp-visual-assets' OR name='vp-visual-assets')
 THEN RAISE EXCEPTION 'VISUAL083_ALREADY_PRESENT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='storage.objects'::regclass AND relrowsecurity)
 THEN RAISE EXCEPTION 'VISUAL083_STORAGE_RLS_REQUIRED'; END IF;
END $guard$;

CREATE TABLE public.visual_assets (
 id uuid PRIMARY KEY,
 artwork_key text NOT NULL UNIQUE CHECK(artwork_key ~ '^[a-z][a-z0-9_-]{2,79}$'),
 name_th text NOT NULL CHECK(length(btrim(name_th)) BETWEEN 1 AND 160),
 name_en text NOT NULL CHECK(length(btrim(name_en)) BETWEEN 1 AND 160),
 asset_type text NOT NULL CHECK(asset_type IN ('journey','background','banner','illustration')),
 scope text NOT NULL CHECK(scope IN ('non_litigation','case','both')),
 theme text NOT NULL DEFAULT '' CHECK(length(theme)<=80),
 tags text[] NOT NULL DEFAULT '{}' CHECK(cardinality(tags)<=12 AND length(tags::text)<=600),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','retired')),
 master_path text NOT NULL UNIQUE CHECK(master_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/master\.webp$'),
 thumbnail_path text NOT NULL UNIQUE CHECK(thumbnail_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/thumbnail\.webp$'),
 width integer NOT NULL CHECK(width BETWEEN 1 AND 2560),
 height integer NOT NULL CHECK(height BETWEEN 1 AND 2560),
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 20971520),
 thumbnail_bytes integer NOT NULL CHECK(thumbnail_bytes BETWEEN 1 AND 2097152),
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 overlay_ready boolean NOT NULL CHECK(overlay_ready),
 delete_pending boolean NOT NULL DEFAULT false CHECK(NOT delete_pending OR status='retired'),
 version integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
 updated_by uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.visual_asset_mappings (
 scope text NOT NULL CHECK(scope IN ('non_litigation','case','both')),
 family_key text NOT NULL CHECK(family_key ~ '^[a-z][a-z0-9_-]{2,79}$'),
 artwork_key text NOT NULL REFERENCES public.visual_assets(artwork_key) ON DELETE RESTRICT ON UPDATE RESTRICT,
 updated_by uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(scope,family_key),
 CHECK(family_key<>'universal' OR scope='both')
);
COMMENT ON TABLE public.visual_asset_mappings IS 'Journey/template FAMILY to explicit artwork_key; never Work Type. both/universal is the fallback. Empty library uses neutral UI, never fabricated artwork.';

CREATE FUNCTION public.visual_assets_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
 SELECT public.people_is_active_admin() AND EXISTS(SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND must_change_password IS FALSE);
$fn$;
ALTER TABLE public.visual_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visual_asset_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.visual_assets,public.visual_asset_mappings FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.visual_assets,public.visual_asset_mappings TO authenticated;
CREATE POLICY visual083_assets_read ON public.visual_assets FOR SELECT TO authenticated USING(public.visual_assets_admin());
CREATE POLICY visual083_mappings_read ON public.visual_asset_mappings FOR SELECT TO authenticated USING(public.visual_assets_admin());

-- Serialized small-library mutations: coherent mappings, retire/delete and version checks.
CREATE FUNCTION public.visual_assets_write(p_action text,p_id uuid,p_version integer,p_data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE a public.visual_assets%rowtype; actor uuid:=auth.uid(); old_key text;
BEGIN
 IF NOT public.visual_assets_admin() THEN RAISE EXCEPTION 'VISUAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'VISUAL_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(830083);
 IF p_action='create' THEN
  IF (SELECT count(*) FROM public.visual_assets)>=50 THEN RAISE EXCEPTION 'VISUAL_LIMIT'; END IF;
  IF split_part(p_data->>'master_path','/',1)<>actor::text OR split_part(p_data->>'master_path','/',2)<>p_id::text
   OR replace(p_data->>'master_path','master.webp','thumbnail.webp') IS DISTINCT FROM p_data->>'thumbnail_path'
   OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='vp-visual-assets' AND name=p_data->>'master_path')
   OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='vp-visual-assets' AND name=p_data->>'thumbnail_path')
  THEN RAISE EXCEPTION 'VISUAL_FILE_REQUIRED'; END IF;
  INSERT INTO public.visual_assets(id,artwork_key,name_th,name_en,asset_type,scope,theme,tags,status,master_path,thumbnail_path,width,height,byte_size,thumbnail_bytes,sha256,overlay_ready,created_by,updated_by)
  VALUES(p_id,p_data->>'artwork_key',p_data->>'name_th',p_data->>'name_en',p_data->>'asset_type',p_data->>'scope',coalesce(p_data->>'theme',''),
   ARRAY(SELECT jsonb_array_elements_text(coalesce(p_data->'tags','[]'))),coalesce(p_data->>'status','draft'),p_data->>'master_path',p_data->>'thumbnail_path',
   (p_data->>'width')::integer,(p_data->>'height')::integer,(p_data->>'byte_size')::integer,(p_data->>'thumbnail_bytes')::integer,p_data->>'sha256',(p_data->>'overlay_ready')::boolean,actor,actor) RETURNING * INTO a;
 ELSIF p_action IN ('map','unmap') THEN
  SELECT artwork_key INTO old_key FROM public.visual_asset_mappings WHERE scope=p_data->>'scope' AND family_key=p_data->>'family_key';
  IF old_key IS DISTINCT FROM p_data->>'expected_key' THEN RAISE EXCEPTION 'VISUAL_CONFLICT'; END IF;
  IF p_action='unmap' THEN
   DELETE FROM public.visual_asset_mappings WHERE scope=p_data->>'scope' AND family_key=p_data->>'family_key';
  ELSE
   SELECT * INTO a FROM public.visual_assets WHERE artwork_key=p_data->>'artwork_key';
   IF NOT FOUND OR a.status<>'active' OR a.delete_pending OR NOT(a.scope='both' OR a.scope=p_data->>'scope') THEN RAISE EXCEPTION 'VISUAL_MAPPING_INVALID'; END IF;
   INSERT INTO public.visual_asset_mappings(scope,family_key,artwork_key,updated_by) VALUES(p_data->>'scope',p_data->>'family_key',a.artwork_key,actor)
   ON CONFLICT(scope,family_key) DO UPDATE SET artwork_key=excluded.artwork_key,updated_by=actor,updated_at=now();
  END IF;
  RETURN jsonb_build_object('saved',true);
 ELSE
  SELECT * INTO a FROM public.visual_assets WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VISUAL_NOT_FOUND'; END IF;
  IF a.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'VISUAL_CONFLICT'; END IF;
  IF p_action='edit' AND NOT a.delete_pending THEN
   IF EXISTS(SELECT 1 FROM public.visual_asset_mappings WHERE artwork_key=a.artwork_key)
    AND (p_data->>'status' IS DISTINCT FROM 'active' OR p_data->>'scope' IS DISTINCT FROM a.scope) THEN RAISE EXCEPTION 'VISUAL_IN_USE'; END IF;
   UPDATE public.visual_assets SET name_th=p_data->>'name_th',name_en=p_data->>'name_en',asset_type=p_data->>'asset_type',scope=p_data->>'scope',
    theme=coalesce(p_data->>'theme',''),tags=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_data->'tags','[]'))),status=p_data->>'status',
    version=version+1,updated_at=now(),updated_by=actor WHERE id=a.id RETURNING * INTO a;
  ELSIF p_action='delete_begin' THEN
   IF EXISTS(SELECT 1 FROM public.visual_asset_mappings WHERE artwork_key=a.artwork_key) THEN RAISE EXCEPTION 'VISUAL_IN_USE'; END IF;
   IF NOT a.delete_pending THEN
    UPDATE public.visual_assets SET delete_pending=true,status='retired',version=version+1,updated_at=now(),updated_by=actor WHERE id=a.id RETURNING * INTO a;
   END IF;
  ELSIF p_action='delete_finish' AND a.delete_pending THEN
   IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='vp-visual-assets' AND name IN(a.master_path,a.thumbnail_path)) THEN RAISE EXCEPTION 'VISUAL_CLEANUP_REQUIRED'; END IF;
   DELETE FROM public.visual_assets WHERE id=a.id;
   RETURN jsonb_build_object('deleted',true);
  ELSE RAISE EXCEPTION 'VISUAL_INVALID'; END IF;
 END IF;
 RETURN to_jsonb(a);
END $fn$;
REVOKE ALL ON FUNCTION public.visual_assets_admin(),public.visual_assets_write(text,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.visual_assets_admin() TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.visual_assets_write(text,uuid,integer,jsonb) TO authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('vp-visual-assets','vp-visual-assets',false,20971520,ARRAY['image/jpeg','image/png','image/webp']);
-- Private reads require active Admin; originals + optimized files cannot be
-- written through raw authenticated Storage APIs. Only guarded server pipeline
-- issues a signed upload for an actor-owned original and writes decoded output.
CREATE POLICY visual083_read ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='vp-visual-assets' AND public.visual_assets_admin());
CREATE POLICY visual083_read_ceiling ON storage.objects AS RESTRICTIVE FOR SELECT TO public
 USING(bucket_id<>'vp-visual-assets' OR (auth.role()='authenticated' AND public.visual_assets_admin()));
CREATE POLICY visual083_insert_ceiling ON storage.objects AS RESTRICTIVE FOR INSERT TO public
 WITH CHECK(bucket_id<>'vp-visual-assets');
CREATE POLICY visual083_update_ceiling ON storage.objects AS RESTRICTIVE FOR UPDATE TO public
 USING(bucket_id<>'vp-visual-assets') WITH CHECK(bucket_id<>'vp-visual-assets');
CREATE POLICY visual083_delete_ceiling ON storage.objects AS RESTRICTIVE FOR DELETE TO public
 USING(bucket_id<>'vp-visual-assets');
COMMIT;
