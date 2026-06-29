-- Allow partners to create and edit compensation drafts without granting
-- Company Ledger, Expense Claims, or void permissions.

create or replace function public.current_user_is_admin_or_partner()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and role in ('admin', 'partner')
  );
$$;

create or replace function public.compensation_batch_is_draft(target_batch_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.finance_compensation_batches
    where id = target_batch_id
      and status = 'draft'
  );
$$;

alter table public.finance_compensation_batches enable row level security;
alter table public.finance_compensation_allocations enable row level security;

drop policy if exists "partner_select_compensation_batches" on public.finance_compensation_batches;
create policy "partner_select_compensation_batches"
on public.finance_compensation_batches
for select
to authenticated
using (public.current_user_is_admin_or_partner());

drop policy if exists "partner_insert_compensation_batches" on public.finance_compensation_batches;
create policy "partner_insert_compensation_batches"
on public.finance_compensation_batches
for insert
to authenticated
with check (
  public.current_user_is_admin_or_partner()
  and status = 'draft'
  and (created_by_user_id is null or created_by_user_id = auth.uid())
);

drop policy if exists "partner_update_compensation_draft_batches" on public.finance_compensation_batches;
create policy "partner_update_compensation_draft_batches"
on public.finance_compensation_batches
for update
to authenticated
using (
  public.current_user_is_admin_or_partner()
  and status = 'draft'
)
with check (
  public.current_user_is_admin_or_partner()
  and status = 'draft'
);

drop policy if exists "partner_select_compensation_allocations" on public.finance_compensation_allocations;
create policy "partner_select_compensation_allocations"
on public.finance_compensation_allocations
for select
to authenticated
using (public.current_user_is_admin_or_partner());

drop policy if exists "partner_insert_compensation_allocations" on public.finance_compensation_allocations;
create policy "partner_insert_compensation_allocations"
on public.finance_compensation_allocations
for insert
to authenticated
with check (
  public.current_user_is_admin_or_partner()
  and public.compensation_batch_is_draft(batch_id)
  and (created_by_user_id is null or created_by_user_id = auth.uid())
);

drop policy if exists "partner_update_compensation_draft_allocations" on public.finance_compensation_allocations;
create policy "partner_update_compensation_draft_allocations"
on public.finance_compensation_allocations
for update
to authenticated
using (
  public.current_user_is_admin_or_partner()
  and public.compensation_batch_is_draft(batch_id)
)
with check (
  public.current_user_is_admin_or_partner()
  and public.compensation_batch_is_draft(batch_id)
);

drop policy if exists "partner_delete_compensation_draft_allocations" on public.finance_compensation_allocations;
create policy "partner_delete_compensation_draft_allocations"
on public.finance_compensation_allocations
for delete
to authenticated
using (
  public.current_user_is_admin_or_partner()
  and public.compensation_batch_is_draft(batch_id)
);
