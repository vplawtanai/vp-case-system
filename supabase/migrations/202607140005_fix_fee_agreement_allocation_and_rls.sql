-- Phase 3D-C3: RPC-only writes for immutable quotation-derived Fee Agreements.
drop policy if exists "finance fee agreement managers update draft agreements" on public.finance_fee_agreements;
drop policy if exists "finance fee agreement managers insert draft items" on public.finance_fee_agreement_items;
drop policy if exists "finance fee agreement managers update draft items" on public.finance_fee_agreement_items;
drop policy if exists "finance fee agreement managers delete draft items" on public.finance_fee_agreement_items;
