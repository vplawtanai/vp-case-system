-- Remove the obsolete overloaded RPC that combined metadata and allocation updates.
drop function if exists public.save_finance_fee_agreement_draft_metadata(
  uuid,
  text,
  date,
  date,
  text,
  text,
  jsonb
);
