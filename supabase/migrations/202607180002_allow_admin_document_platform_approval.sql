-- Allow system administrators and partners to approve Document Platform content.
-- Additive permission correction: lifecycle, RLS, and document-readiness rules are unchanged.

create or replace function public.current_user_can_approve_document_platform()
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

-- Compatibility wrapper retained because the applied lifecycle and retired-template
-- approval RPCs call this signature. Its authority now follows the locked policy above.
create or replace function public.current_user_is_document_platform_partner()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.current_user_can_approve_document_platform();
$$;

comment on function public.current_user_can_approve_document_platform() is
  'Returns true only for authenticated Admin or Partner profiles authorized to approve Document Platform content.';

comment on function public.current_user_is_document_platform_partner() is
  'Compatibility wrapper for applied Document Platform RPCs; approval authority includes Admin and Partner.';

revoke all on function public.current_user_can_approve_document_platform() from public, anon, authenticated;
revoke all on function public.current_user_is_document_platform_partner() from public, anon, authenticated;
