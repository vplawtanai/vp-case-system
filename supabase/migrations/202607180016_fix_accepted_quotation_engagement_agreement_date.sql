-- Accepted-Quotation engagements are commercial evidence records, not Agreement documents.
-- Preserve the legal agreement-date default for formal Fee Agreements only.

create or replace function public.default_finance_fee_agreement_agreement_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.engagement_basis is distinct from 'accepted_quotation'
    and new.agreement_date is null
  then
    new.agreement_date := (now() at time zone 'Asia/Bangkok')::date;
  end if;
  return new;
end;
$$;

revoke all on function public.default_finance_fee_agreement_agreement_date()
  from public, anon, authenticated;
