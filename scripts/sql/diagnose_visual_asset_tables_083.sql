-- Visual Asset Library 083: TABLE CATALOG DIAGNOSTIC ONLY.
-- One static SELECT. No writes, no business RPC, no data-row reads.
-- Expected evidence is copied unchanged from the reviewed 083 verifier fixture.
-- Compares ONLY public.visual_assets and public.visual_asset_mappings.
-- Version/NOT NULL classification is diagnostic, NOT acceptance or a guard change.
WITH
expected AS (SELECT '{"visual_assets":{"acl":[["authenticated","SELECT",false],["postgres","DELETE",false],["postgres","INSERT",false],["postgres","MAINTAIN",false],["postgres","REFERENCES",false],["postgres","SELECT",false],["postgres","TRIGGER",false],["postgres","TRUNCATE",false],["postgres","UPDATE",false]],"rls":true,"kind":"r","owner":"postgres","forced":false,"columns":[["id","uuid",true,null],["artwork_key","text",true,null],["name_th","text",true,null],["name_en","text",true,null],["asset_type","text",true,null],["scope","text",true,null],["theme","text",true,"''''::text"],["tags","text[]",true,"''{}''::text[]"],["status","text",true,"''draft''::text"],["master_path","text",true,null],["thumbnail_path","text",true,null],["width","integer",true,null],["height","integer",true,null],["byte_size","integer",true,null],["thumbnail_bytes","integer",true,null],["sha256","text",true,null],["overlay_ready","boolean",true,null],["delete_pending","boolean",true,"false"],["version","integer",true,"1"],["created_by","uuid",true,null],["updated_by","uuid",true,null],["created_at","timestamp with time zone",true,"now()"],["updated_at","timestamp with time zone",true,"now()"]],"indexes":["CREATE UNIQUE INDEX visual_assets_artwork_key_key ON public.visual_assets USING btree (artwork_key)","CREATE UNIQUE INDEX visual_assets_master_path_key ON public.visual_assets USING btree (master_path)","CREATE UNIQUE INDEX visual_assets_pkey ON public.visual_assets USING btree (id)","CREATE UNIQUE INDEX visual_assets_thumbnail_path_key ON public.visual_assets USING btree (thumbnail_path)"],"policies":[{"cmd":"SELECT","qual":"visual_assets_admin()","roles":["authenticated"],"tablename":"visual_assets","permissive":"PERMISSIVE","policyname":"visual083_assets_read","schemaname":"public","with_check":null}],"triggers":[],"constraints":[["visual_assets_artwork_key_check","CHECK ((artwork_key ~ ''^[a-z][a-z0-9_-]{2,79}$''::text))"],["visual_assets_artwork_key_key","UNIQUE (artwork_key)"],["visual_assets_artwork_key_not_null","NOT NULL artwork_key"],["visual_assets_asset_type_check","CHECK ((asset_type = ANY (ARRAY[''journey''::text, ''background''::text, ''banner''::text, ''illustration''::text])))"],["visual_assets_asset_type_not_null","NOT NULL asset_type"],["visual_assets_byte_size_check","CHECK (((byte_size >= 1) AND (byte_size <= 20971520)))"],["visual_assets_byte_size_not_null","NOT NULL byte_size"],["visual_assets_check","CHECK (((NOT delete_pending) OR (status = ''retired''::text)))"],["visual_assets_created_at_not_null","NOT NULL created_at"],["visual_assets_created_by_fkey","FOREIGN KEY (created_by) REFERENCES user_profiles(id) ON DELETE RESTRICT"],["visual_assets_created_by_not_null","NOT NULL created_by"],["visual_assets_delete_pending_not_null","NOT NULL delete_pending"],["visual_assets_height_check","CHECK (((height >= 1) AND (height <= 2560)))"],["visual_assets_height_not_null","NOT NULL height"],["visual_assets_id_not_null","NOT NULL id"],["visual_assets_master_path_check","CHECK ((master_path ~ ''^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/master\\.webp$''::text))"],["visual_assets_master_path_key","UNIQUE (master_path)"],["visual_assets_master_path_not_null","NOT NULL master_path"],["visual_assets_name_en_check","CHECK (((length(btrim(name_en)) >= 1) AND (length(btrim(name_en)) <= 160)))"],["visual_assets_name_en_not_null","NOT NULL name_en"],["visual_assets_name_th_check","CHECK (((length(btrim(name_th)) >= 1) AND (length(btrim(name_th)) <= 160)))"],["visual_assets_name_th_not_null","NOT NULL name_th"],["visual_assets_overlay_ready_check","CHECK (overlay_ready)"],["visual_assets_overlay_ready_not_null","NOT NULL overlay_ready"],["visual_assets_pkey","PRIMARY KEY (id)"],["visual_assets_scope_check","CHECK ((scope = ANY (ARRAY[''non_litigation''::text, ''case''::text, ''both''::text])))"],["visual_assets_scope_not_null","NOT NULL scope"],["visual_assets_sha256_check","CHECK ((sha256 ~ ''^[0-9a-f]{64}$''::text))"],["visual_assets_sha256_not_null","NOT NULL sha256"],["visual_assets_status_check","CHECK ((status = ANY (ARRAY[''draft''::text, ''active''::text, ''retired''::text])))"],["visual_assets_status_not_null","NOT NULL status"],["visual_assets_tags_check","CHECK (((cardinality(tags) <= 12) AND (length((tags)::text) <= 600)))"],["visual_assets_tags_not_null","NOT NULL tags"],["visual_assets_theme_check","CHECK ((length(theme) <= 80))"],["visual_assets_theme_not_null","NOT NULL theme"],["visual_assets_thumbnail_bytes_check","CHECK (((thumbnail_bytes >= 1) AND (thumbnail_bytes <= 2097152)))"],["visual_assets_thumbnail_bytes_not_null","NOT NULL thumbnail_bytes"],["visual_assets_thumbnail_path_check","CHECK ((thumbnail_path ~ ''^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/thumbnail\\.webp$''::text))"],["visual_assets_thumbnail_path_key","UNIQUE (thumbnail_path)"],["visual_assets_thumbnail_path_not_null","NOT NULL thumbnail_path"],["visual_assets_updated_at_not_null","NOT NULL updated_at"],["visual_assets_updated_by_fkey","FOREIGN KEY (updated_by) REFERENCES user_profiles(id) ON DELETE RESTRICT"],["visual_assets_updated_by_not_null","NOT NULL updated_by"],["visual_assets_version_not_null","NOT NULL version"],["visual_assets_width_check","CHECK (((width >= 1) AND (width <= 2560)))"],["visual_assets_width_not_null","NOT NULL width"]]},"visual_asset_mappings":{"acl":[["authenticated","SELECT",false],["postgres","DELETE",false],["postgres","INSERT",false],["postgres","MAINTAIN",false],["postgres","REFERENCES",false],["postgres","SELECT",false],["postgres","TRIGGER",false],["postgres","TRUNCATE",false],["postgres","UPDATE",false]],"rls":true,"kind":"r","owner":"postgres","forced":false,"columns":[["scope","text",true,null],["family_key","text",true,null],["artwork_key","text",true,null],["updated_by","uuid",true,null],["updated_at","timestamp with time zone",true,"now()"]],"indexes":["CREATE UNIQUE INDEX visual_asset_mappings_pkey ON public.visual_asset_mappings USING btree (scope, family_key)"],"policies":[{"cmd":"SELECT","qual":"visual_assets_admin()","roles":["authenticated"],"tablename":"visual_asset_mappings","permissive":"PERMISSIVE","policyname":"visual083_mappings_read","schemaname":"public","with_check":null}],"triggers":[],"constraints":[["visual_asset_mappings_artwork_key_fkey","FOREIGN KEY (artwork_key) REFERENCES visual_assets(artwork_key) ON UPDATE RESTRICT ON DELETE RESTRICT"],["visual_asset_mappings_artwork_key_not_null","NOT NULL artwork_key"],["visual_asset_mappings_check","CHECK (((family_key <> ''universal''::text) OR (scope = ''both''::text)))"],["visual_asset_mappings_family_key_check","CHECK ((family_key ~ ''^[a-z][a-z0-9_-]{2,79}$''::text))"],["visual_asset_mappings_family_key_not_null","NOT NULL family_key"],["visual_asset_mappings_pkey","PRIMARY KEY (scope, family_key)"],["visual_asset_mappings_scope_check","CHECK ((scope = ANY (ARRAY[''non_litigation''::text, ''case''::text, ''both''::text])))"],["visual_asset_mappings_scope_not_null","NOT NULL scope"],["visual_asset_mappings_updated_at_not_null","NOT NULL updated_at"],["visual_asset_mappings_updated_by_fkey","FOREIGN KEY (updated_by) REFERENCES user_profiles(id) ON DELETE RESTRICT"],["visual_asset_mappings_updated_by_not_null","NOT NULL updated_by"]]}}'::jsonb AS tables),
relations AS (
 SELECT c.relname,jsonb_build_object('owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,
 'acl',(SELECT coalesce(jsonb_agg(jsonb_build_array(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) ORDER BY CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END COLLATE "C",x.privilege_type COLLATE "C"),'[]') FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname COLLATE "C") FROM pg_constraint WHERE conrelid=c.oid),
 'indexes',(SELECT jsonb_agg(indexdef ORDER BY indexname COLLATE "C") FROM pg_indexes WHERE schemaname='public' AND tablename=c.relname),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname COLLATE "C") FROM pg_policies p WHERE schemaname='public' AND tablename=c.relname),
 'triggers',(SELECT coalesce(jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname COLLATE "C"),'[]') FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)) evidence
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('visual_assets','visual_asset_mappings')
),
actual AS (SELECT coalesce(jsonb_object_agg(relname,evidence),'{}') AS tables FROM relations),
targets AS (SELECT k AS table_name,e.tables->k AS expected,a.tables->k AS actual
 FROM expected e CROSS JOIN actual a CROSS JOIN LATERAL jsonb_object_keys(e.tables||a.tables) k),
components AS (SELECT t.table_name,c.key AS component,c.value AS expected,t.actual->c.key AS actual
 FROM targets t CROSS JOIN LATERAL jsonb_each(t.expected) c),
-- Stable named entries expose a precise object/definition rather than just a hash.
entries AS (
 SELECT t.table_name,s.side,c.key AS component,
 CASE c.key
  WHEN 'columns' THEN item.value->>0
  WHEN 'constraints' THEN item.value->>0
  WHEN 'acl' THEN (item.value->>0)||':'||(item.value->>1)
  WHEN 'policies' THEN item.value->>'policyname'
  WHEN 'indexes' THEN regexp_replace(item.value#>>'{}','^CREATE (UNIQUE )?INDEX ([^ ]+) ON .*$','\2')
  WHEN 'triggers' THEN regexp_replace(item.value#>>'{}','^CREATE (CONSTRAINT )?TRIGGER ([^ ]+) .*$','\2')
 END AS object_name,
 CASE WHEN c.key='constraints' THEN item.value->1 ELSE item.value END AS definition
 FROM targets t CROSS JOIN LATERAL (VALUES ('expected',t.expected),('actual',t.actual)) s(side,evidence)
 CROSS JOIN LATERAL jsonb_each(coalesce(s.evidence,'{}')) c
 CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(c.value)='array' THEN c.value ELSE '[]'::jsonb END) item
 WHERE c.key IN('columns','constraints','acl','policies','indexes','triggers')
),
paired AS (SELECT coalesce(e.table_name,a.table_name) AS table_name,
 coalesce(e.component,a.component) AS component,coalesce(e.object_name,a.object_name) AS object_name,
 e.definition AS expected,a.definition AS actual
 FROM (SELECT * FROM entries WHERE side='expected') e
 FULL JOIN (SELECT * FROM entries WHERE side='actual') a
 USING(table_name,component,object_name)),
entry_differences AS (
 SELECT p.*,CASE
 WHEN component='constraints' AND actual IS NULL AND (expected#>>'{}') LIKE 'NOT NULL %'
  AND current_setting('server_version_num')::integer<180000
  AND EXISTS(SELECT 1 FROM pg_attribute c WHERE c.attrelid=to_regclass('public.'||p.table_name)
   AND c.attname=substring(p.expected#>>'{}' FROM 10) AND c.attnotnull AND NOT c.attisdropped)
  THEN 'postgres18_not_null_catalog_representation_only'
 WHEN component='acl' AND actual IS NULL AND expected=jsonb_build_array('postgres','MAINTAIN',false)
  AND current_setting('server_version_num')::integer<170000
  THEN 'owner_maintain_privilege_not_supported_by_server_version'
 WHEN actual IS NULL THEN 'expected_entry_missing'
 WHEN expected IS NULL THEN 'unexpected_entry'
 WHEN component='columns' AND expected->2 IS DISTINCT FROM actual->2 THEN 'column_nullability_mismatch'
 WHEN component='acl' THEN 'permissions_grants_mismatch'
 WHEN component='policies' THEN 'policy_mismatch'
 WHEN component='triggers' THEN 'trigger_mismatch'
 ELSE 'definition_mismatch' END AS mismatch_category,
 CASE WHEN component='constraints' AND (expected#>>'{}') LIKE 'NOT NULL %' THEN
 (SELECT jsonb_build_object('column',c.attname,'actual_attnotnull',c.attnotnull)
 FROM pg_attribute c WHERE c.attrelid=to_regclass('public.'||p.table_name)
 AND c.attname=substring(p.expected#>>'{}' FROM 10) AND c.attnum>0 AND NOT c.attisdropped) END AS nullability_evidence
 FROM paired p WHERE expected IS DISTINCT FROM actual
),
property_differences AS (
 SELECT table_name,component,component AS object_name,expected,actual,'table_property_mismatch' AS mismatch_category,NULL::jsonb AS nullability_evidence
 FROM components WHERE component IN('owner','kind','rls','forced') AND expected IS DISTINCT FROM actual
 UNION ALL
 SELECT table_name,'relation',table_name,expected,actual,'relation_missing',NULL::jsonb FROM targets WHERE actual IS NULL
),
representation_differences AS (
 SELECT c.table_name,c.component,c.component AS object_name,c.expected,c.actual,
 'array_order_or_null_empty_representation_mismatch' AS mismatch_category,NULL::jsonb AS nullability_evidence
 FROM components c WHERE c.component IN('columns','constraints','acl','policies','indexes','triggers')
 AND c.expected IS DISTINCT FROM c.actual
 AND NOT EXISTS(SELECT 1 FROM entry_differences d WHERE d.table_name=c.table_name AND d.component=c.component)
),
all_differences AS (SELECT * FROM entry_differences UNION ALL SELECT * FROM property_differences UNION ALL SELECT * FROM representation_differences),
constraint_evidence AS (
 SELECT c.relname AS table_name,con.conname AS constraint_name,con.contype AS constraint_type,
 pg_get_constraintdef(con.oid) AS definition,con.convalidated,con.condeferrable,con.condeferred,
 to_jsonb(con)->'conenforced' AS enforced_when_supported
 FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN('visual_assets','visual_asset_mappings')
),
index_evidence AS (
 SELECT c.relname AS table_name,i.relname AS index_name,x.indisvalid,x.indisready,x.indisunique,x.indisprimary
 FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('visual_assets','visual_asset_mappings')
)
SELECT jsonb_build_object(
 'diagnostic','visual083_tables_only',
 'candidate_sha256','3682c449f708f600468f6cbd36d3b6de60fd7cc5850f6e9802f38b898481edfa',
 'expected_catalog_source','Exact 083 candidate captured in disposable PostgreSQL 18',
 'server',jsonb_build_object('version',current_setting('server_version'),'version_num',current_setting('server_version_num'),'collation',(SELECT datcollate FROM pg_database WHERE datname=current_database()),'search_path',current_setting('search_path')),
 'raw_tables_match',(SELECT e.tables=a.tables FROM expected e,actual a),
 'differing_tables',(SELECT coalesce(jsonb_agg(table_name ORDER BY table_name COLLATE "C"),'[]') FROM targets WHERE expected IS DISTINCT FROM actual),
 'differences',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY table_name COLLATE "C",component COLLATE "C",object_name COLLATE "C"),'[]') FROM all_differences d),
 'table_summary',(SELECT jsonb_agg(jsonb_build_object('table','public.'||t.table_name,'exists',t.actual IS NOT NULL,
  'expected_sha256',encode(sha256(convert_to(t.expected::text,'UTF8')),'hex'),
  'actual_sha256',encode(sha256(convert_to(t.actual::text,'UTF8')),'hex'),
  'component_matches',(SELECT jsonb_object_agg(component,expected IS NOT DISTINCT FROM actual) FROM components c WHERE c.table_name=t.table_name),
  'expected_not_null_columns',(SELECT jsonb_agg(v->>0 ORDER BY (v->>0) COLLATE "C") FROM jsonb_array_elements(t.expected->'columns') v WHERE v->2='true'::jsonb),
  'actual_not_null_columns',(SELECT jsonb_agg(v->>0 ORDER BY (v->>0) COLLATE "C") FROM jsonb_array_elements(t.actual->'columns') v WHERE v->2='true'::jsonb)
 ) ORDER BY t.table_name COLLATE "C") FROM targets t),
 'actual_constraint_flags',(SELECT jsonb_agg(to_jsonb(c) ORDER BY table_name COLLATE "C",constraint_name COLLATE "C") FROM constraint_evidence c),
 'actual_index_flags',(SELECT jsonb_agg(to_jsonb(i) ORDER BY table_name COLLATE "C",index_name COLLATE "C") FROM index_evidence i),
 'writes_performed',false,'business_rpc_executed',false
) AS visual083_table_catalog_diagnostic;
