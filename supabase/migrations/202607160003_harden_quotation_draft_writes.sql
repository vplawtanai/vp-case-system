-- Apply only after the atomic-create frontend is deployed and verified.
-- New and edit draft writes are SECURITY DEFINER RPC-only; browser clients retain read access.
drop policy if exists "finance quotation managers insert quotations" on public.finance_quotations;
drop policy if exists "finance quotation managers update draft quotations" on public.finance_quotations;
drop policy if exists "finance quotation managers insert quotation items" on public.finance_quotation_items;
drop policy if exists "finance quotation managers update quotation items" on public.finance_quotation_items;
drop policy if exists "finance quotation managers delete draft quotation items" on public.finance_quotation_items;
