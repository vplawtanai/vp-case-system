-- Phase 2.11: correct the current title and protect signer lifecycle changes.
update public.finance_authorized_signers
set
  position_th = 'หุ้นส่วนบริหาร',
  updated_at = now()
where signer_key = 'preecha'
  and email = 'preecha@vplawyer.com'
  and position_th = 'หุ้นส่วนผู้จัดการ';

create or replace function public.finance_authorized_signer_lifecycle_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and old.is_default = true
    and old.is_active = true
    and new.is_active = false then
    raise exception 'กรุณาตั้งผู้ลงนามเริ่มต้นคนใหม่ก่อนปิดใช้งานรายนี้';
  end if;

  if tg_op = 'DELETE' and old.is_default = true then
    raise exception 'กรุณาตั้งผู้ลงนามเริ่มต้นคนใหม่ก่อนลบรายนี้';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists finance_authorized_signer_lifecycle_guard on public.finance_authorized_signers;
create trigger finance_authorized_signer_lifecycle_guard
before update or delete on public.finance_authorized_signers
for each row execute function public.finance_authorized_signer_lifecycle_guard();

create or replace function public.set_finance_authorized_signer_active(
  p_signer_id uuid,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signer public.finance_authorized_signers%rowtype;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to update authorized signer';
  end if;

  select * into v_signer
  from public.finance_authorized_signers
  where id = p_signer_id
  for update;

  if v_signer.id is null then
    raise exception 'Authorized signer not found';
  end if;

  if not p_is_active and v_signer.is_default then
    raise exception 'กรุณาตั้งผู้ลงนามเริ่มต้นคนใหม่ก่อนปิดใช้งานรายนี้';
  end if;

  update public.finance_authorized_signers
  set
    is_active = p_is_active,
    updated_at = now(),
    updated_by_user_id = auth.uid()
  where id = v_signer.id;

  return v_signer.id;
end;
$$;

create or replace function public.delete_finance_authorized_signer(
  p_signer_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signer public.finance_authorized_signers%rowtype;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to delete authorized signer';
  end if;

  select * into v_signer
  from public.finance_authorized_signers
  where id = p_signer_id
  for update;

  if v_signer.id is null then
    raise exception 'Authorized signer not found';
  end if;

  if v_signer.is_default then
    raise exception 'กรุณาตั้งผู้ลงนามเริ่มต้นคนใหม่ก่อนลบรายนี้';
  end if;

  if exists (
    select 1
    from public.finance_quotations q
    where q.authorized_signer_key = v_signer.signer_key
      or q.authorized_signer_name = v_signer.display_name
      or q.authorized_signer_email = v_signer.email
      or q.document_data_snapshot_json -> 'authorized_signer' ->> 'key' = v_signer.signer_key
  ) then
    raise exception 'ผู้ลงนามรายนี้เคยถูกใช้ในเอกสารแล้ว กรุณาปิดใช้งานแทนการลบ';
  end if;

  delete from public.finance_authorized_signers where id = v_signer.id;
  return coalesce(v_signer.signature_storage_path, '');
end;
$$;

revoke all on function public.set_finance_authorized_signer_active(uuid, boolean) from public;
revoke all on function public.delete_finance_authorized_signer(uuid) from public;
grant execute on function public.set_finance_authorized_signer_active(uuid, boolean) to authenticated;
grant execute on function public.delete_finance_authorized_signer(uuid) to authenticated;
