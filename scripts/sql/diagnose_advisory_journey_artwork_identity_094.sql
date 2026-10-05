-- SELECT ONLY: identity/usability evidence for the eight Human-approved artworks.
-- Run as postgres in the intended Production project. No business RPC is called.
-- Match the Admin UI's visualAssetCode(artwork_key) exactly, NOT a UUID/hash guess.
-- Storage existence means metadata only; this does not download/decode image bytes.
WITH approved(ord, displayed_code) AS (VALUES
  (1, 'VP-IMG-7D8735910A68'),
  (2, 'VP-IMG-45BE01527AF4'),
  (3, 'VP-IMG-12F92E9A6B60'),
  (4, 'VP-IMG-4C8237B6AB72'),
  (5, 'VP-IMG-207F2702ED6C'),
  (6, 'VP-IMG-AF2748CFE7D9'),
  (7, 'VP-IMG-379E81E18666'),
  (8, 'VP-IMG-8CB0B8B078E2')
), matched AS MATERIALIZED (
  SELECT p.ord, p.displayed_code AS requested_code,
    CASE WHEN a.artwork_key ~ '^vp-img-[a-f0-9]{12}$'
      THEN upper(a.artwork_key) ELSE a.artwork_key END AS displayed_code,
    a.id, a.artwork_key, a.status, a.asset_type, a.scope, a.overlay_ready,
    a.delete_pending, a.width, a.height, a.master_path, a.created_by
  FROM approved p
  LEFT JOIN public.visual_assets a ON
    CASE WHEN a.artwork_key ~ '^vp-img-[a-f0-9]{12}$'
      THEN upper(a.artwork_key) ELSE a.artwork_key END = p.displayed_code
), facts AS (
  SELECT a.*,
    a.artwork_key = lower(a.requested_code) AS identity_matches_094,
    a.asset_type IN ('journey','background','illustration') AS type_eligible,
    a.scope IN ('both','non_litigation') AS scope_eligible,
    a.status = 'active' AS status_eligible,
    NOT a.delete_pending AS not_pending_deletion,
    a.master_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/master[.]webp$' AS path_format_valid,
    split_part(a.master_path,'/',2) = a.id::text AS path_matches_asset,
    split_part(a.master_path,'/',1) = a.created_by::text AS path_matches_creator,
    a.width BETWEEN 1 AND 2560 AND a.height BETWEEN 1 AND 2560 AS dimensions_valid,
    EXISTS (SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'vp-visual-assets' AND o.name = a.master_path) AS master_object_exists,
    EXISTS (SELECT 1 FROM storage.buckets b
      WHERE b.id = 'vp-visual-assets' AND b.public IS FALSE) AS private_bucket_exists
  FROM matched a
), assessed AS (
  SELECT f.*, CASE WHEN id IS NULL THEN ARRAY['ASSET_NOT_FOUND_BY_UI_CODE']::text[]
    ELSE array_remove(ARRAY[
      CASE WHEN identity_matches_094 IS NOT TRUE THEN 'CANONICAL_KEY_DIFFERS_FROM_094' END,
      CASE WHEN type_eligible IS NOT TRUE THEN 'ASSET_TYPE_NOT_JOURNEY_COMPATIBLE' END,
      CASE WHEN scope_eligible IS NOT TRUE THEN 'SCOPE_NOT_ADVISORY_COMPATIBLE' END,
      CASE WHEN status_eligible IS NOT TRUE THEN 'STATUS_NOT_ACTIVE:' || coalesce(status,'NULL') END,
      CASE WHEN not_pending_deletion IS NOT TRUE THEN 'DELETE_PENDING' END,
      CASE WHEN path_format_valid IS NOT TRUE THEN 'MASTER_PATH_FORMAT_INVALID' END,
      CASE WHEN path_matches_asset IS NOT TRUE THEN 'MASTER_PATH_ASSET_MISMATCH' END,
      CASE WHEN path_matches_creator IS NOT TRUE THEN 'MASTER_PATH_CREATOR_MISMATCH' END,
      CASE WHEN dimensions_valid IS NOT TRUE THEN 'DIMENSIONS_INVALID' END,
      CASE WHEN NOT master_object_exists THEN 'MASTER_OBJECT_METADATA_MISSING' END,
      CASE WHEN NOT private_bucket_exists THEN 'PRIVATE_BUCKET_MISSING_OR_PUBLIC' END
    ], NULL) END AS usability_reasons
  FROM facts f
)
SELECT jsonb_build_object(
  'inspection_role', current_user,
  'owner_context', current_user = 'postgres',
  'business_rpc_executed', false,
  'production_mutation', false,
  'overlay_ready_required_by_094', false,
  'storage_check', 'metadata existence only; image bytes not downloaded',
  'assets', jsonb_agg(jsonb_build_object(
    'requested_code', requested_code,
    'displayed_code', displayed_code,
    'artwork_key', artwork_key,
    'status', status,
    'asset_type', asset_type,
    'scope', scope,
    'overlay_ready', overlay_ready,
    'delete_pending', delete_pending,
    'width', width,
    'height', height,
    'identity_matches_094', coalesce(identity_matches_094,false),
    'master_object_exists', master_object_exists,
    'private_bucket_exists', private_bucket_exists,
    'master_path_checks', jsonb_build_object(
      'format_valid', coalesce(path_format_valid,false),
      'matches_asset', coalesce(path_matches_asset,false),
      'matches_creator', coalesce(path_matches_creator,false)),
    'usable', cardinality(usability_reasons) = 0,
    'usability_reasons', usability_reasons
  ) ORDER BY ord)
) AS diagnostic
FROM assessed;
