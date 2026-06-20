-- Preflight duplicate check before applying this migration:
-- select
--   regexp_replace(lower(coalesce(tax_id, '')), '[^a-z0-9]', '', 'g') as normalized_tax_id,
--   count(*) as duplicate_count,
--   array_agg(id) as client_ids
-- from public.clients
-- where regexp_replace(lower(coalesce(tax_id, '')), '[^a-z0-9]', '', 'g') <> ''
--   and lower(coalesce(status, '')) <> 'deleted'
-- group by normalized_tax_id
-- having count(*) > 1;
--
-- If this query returns rows, clean or merge the duplicate client data before
-- running the unique index below. This migration intentionally does not delete
-- or merge existing client records.

create unique index if not exists uq_clients_active_normalized_tax_id
on public.clients (
  regexp_replace(lower(coalesce(tax_id, '')), '[^a-z0-9]', '', 'g')
)
where regexp_replace(lower(coalesce(tax_id, '')), '[^a-z0-9]', '', 'g') <> ''
  and lower(coalesce(status, '')) <> 'deleted';
