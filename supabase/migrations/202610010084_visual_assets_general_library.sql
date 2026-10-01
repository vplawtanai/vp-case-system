-- 084: allow general images without falsely attesting overlay suitability.
-- HUMAN APPLY ONLY. No row changes, backfill, RPC/grant/policy/storage changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $guard$
DECLARE
  asset_table regclass := to_regclass('public.visual_assets');
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'VISUAL084_OWNER_REQUIRED';
  END IF;
  IF asset_table IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    WHERE a.attrelid = asset_table AND a.attname = 'overlay_ready'
      AND a.atttypid = 'boolean'::regtype AND a.attnotnull
      AND NOT a.attisdropped AND c.relkind = 'r'
      AND pg_get_userbyid(c.relowner) = 'postgres'
      AND NOT EXISTS (
        SELECT 1 FROM pg_attrdef d
        WHERE d.adrelid = a.attrelid AND d.adnum = a.attnum
      )
      AND EXISTS (
        SELECT 1 FROM pg_constraint k
        WHERE k.conrelid = a.attrelid
          AND k.conname = 'visual_assets_overlay_ready_check'
          AND k.contype = 'c' AND k.convalidated
          AND coalesce((to_jsonb(k)->>'conenforced')::boolean, true)
          AND k.conkey = ARRAY[a.attnum]::smallint[]
          AND pg_get_constraintdef(k.oid) = 'CHECK (overlay_ready)'
      )
  ) THEN
    RAISE EXCEPTION 'VISUAL084_OVERLAY_BASELINE_MISMATCH';
  END IF;
END $guard$;

ALTER TABLE public.visual_assets
  DROP CONSTRAINT visual_assets_overlay_ready_check,
  ALTER COLUMN overlay_ready SET DEFAULT false;

COMMIT;
