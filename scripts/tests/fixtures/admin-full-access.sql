-- LOCAL TEST ONLY. Legacy policies/functions copied from SELECT-only capture 2026-09-23.
-- Not an accepted post-073 Production baseline. Shapes/data/grants below are synthetic.
-- Office Work policy evidence is unavailable locally: deliberately adversarial synthetic
-- policy exercises preservation + inactive Admin ceiling; manual preflight returns live policies.
create table public.finance_bank_account_access (
"id" uuid default gen_random_uuid(),
"bank_account_id" uuid,
"user_profile_id" uuid,
"can_view" boolean default true,
"created_at" timestamp with time zone default now()
);
alter table public.finance_bank_account_access enable row level security;
grant select,insert,update,delete on public.finance_bank_account_access to authenticated;
create table public.finance_bank_accounts (
"id" uuid default gen_random_uuid(),
"short_name" text,
"bank_name" text,
"account_name" text,
"account_number" text,
"is_active" boolean default true,
"created_at" timestamp with time zone default now(),
"updated_at" timestamp with time zone default now()
);
alter table public.finance_bank_accounts enable row level security;
grant select,insert,update,delete on public.finance_bank_accounts to authenticated;
create table public.finance_company_ledger (
"id" uuid default gen_random_uuid(),
"transaction_date" date,
"entry_type" text,
"category" text,
"amount" numeric(14,2),
"client_id" uuid,
"case_id" bigint,
"advisory_matter_id" uuid,
"payment_method" text,
"reference_no" text,
"description" text,
"note" text,
"status" text default 'active'::text,
"voided_at" timestamp with time zone,
"voided_by" text,
"void_reason" text,
"created_by_user_id" uuid,
"created_by_email" text,
"created_by_name" text,
"created_at" timestamp with time zone default now(),
"updated_at" timestamp with time zone default now(),
"bank_account_id" uuid,
"expense_claimant_user_id" uuid,
"expense_claimant_name" text,
"source_expense_claim_id" uuid,
"source_compensation_batch_id" uuid,
"transfer_group_id" uuid
);
alter table public.finance_company_ledger enable row level security;
grant select,insert,update,delete on public.finance_company_ledger to authenticated;
create table public.finance_compensation_batches (
"id" uuid default gen_random_uuid(),
"received_date" date default CURRENT_DATE,
"received_amount" numeric(14,2),
"revenue_type" text default 'professional_fee'::text,
"formula_code" text,
"status" text default 'draft'::text,
"client_id" uuid,
"case_id" bigint,
"advisory_matter_id" uuid,
"description" text,
"note" text,
"posted_to_ledger_at" timestamp with time zone,
"ledger_entry_id" uuid,
"voided_at" timestamp with time zone,
"voided_by" text,
"void_reason" text,
"created_by_user_id" uuid,
"created_by_email" text,
"created_by_name" text,
"created_at" timestamp with time zone default now(),
"updated_at" timestamp with time zone default now()
);
alter table public.finance_compensation_batches enable row level security;
grant select,insert,update,delete on public.finance_compensation_batches to authenticated;
create table public.finance_compensation_allocations (
"id" uuid default gen_random_uuid(),
"batch_id" uuid,
"recipient_type" text,
"recipient_user_id" uuid,
"recipient_name" text,
"role_label" text,
"percent" numeric(7,4),
"amount" numeric(14,2),
"is_company_share" boolean default false,
"payment_status" text default 'unpaid'::text,
"paid_at" timestamp with time zone,
"note" text,
"created_by_user_id" uuid,
"created_by_email" text,
"created_by_name" text,
"created_at" timestamp with time zone default now(),
"updated_at" timestamp with time zone default now()
);
alter table public.finance_compensation_allocations enable row level security;
grant select,insert,update,delete on public.finance_compensation_allocations to authenticated;
create table public.finance_expense_claims (
"id" uuid default gen_random_uuid(),
"claim_date" date default CURRENT_DATE,
"claimant_user_id" uuid,
"claimant_name" text,
"category" text,
"amount" numeric(14,2),
"client_id" uuid,
"case_id" bigint,
"advisory_matter_id" uuid,
"description" text,
"note" text,
"status" text default 'submitted'::text,
"approved_by_user_id" uuid,
"approved_by_name" text,
"approved_at" timestamp with time zone,
"rejected_by_user_id" uuid,
"rejected_by_name" text,
"rejected_at" timestamp with time zone,
"reject_reason" text,
"paid_by_user_id" uuid,
"paid_by_name" text,
"paid_at" timestamp with time zone,
"paid_bank_account_id" uuid,
"payment_reference_no" text,
"payment_note" text,
"ledger_entry_id" uuid,
"voided_at" timestamp with time zone,
"voided_by" text,
"void_reason" text,
"created_by_user_id" uuid,
"created_by_email" text,
"created_by_name" text,
"created_at" timestamp with time zone default now(),
"updated_at" timestamp with time zone default now()
);
alter table public.finance_expense_claims enable row level security;
grant select,insert,update,delete on public.finance_expense_claims to authenticated;
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and role = 'admin'
  );
$function$
;
CREATE OR REPLACE FUNCTION public.current_user_is_admin_or_partner()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and role in ('admin', 'partner')
  );
$function$
;
CREATE OR REPLACE FUNCTION public.current_user_can_manage_finance_quotations()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and role in ('admin', 'partner')
  );
$function$
;
CREATE OR REPLACE FUNCTION public.current_user_can_approve_document_platform()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and role in ('admin', 'partner')
  );
$function$
;
revoke all on function public.current_user_can_approve_document_platform() from public,anon,authenticated;grant execute on function public.current_user_can_approve_document_platform() to service_role;
CREATE OR REPLACE FUNCTION public.compensation_batch_is_draft(target_batch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.finance_compensation_batches
    where id = target_batch_id
      and status = 'draft'
  );
$function$
;
create policy "finance_bank_access_permission_insert" on public.finance_bank_account_access as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND (up.role = 'admin'::text)))));
create policy "finance_bank_access_permission_select" on public.finance_bank_account_access as PERMISSIVE for SELECT to authenticated using (((user_profile_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND (up.role = 'admin'::text))))));
create policy "finance_bank_access_permission_update" on public.finance_bank_account_access as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND (up.role = 'admin'::text))))) with check ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND (up.role = 'admin'::text)))));
create policy "finance_bank_accounts_permission_insert" on public.finance_bank_accounts as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND (up.role = 'admin'::text)))));
create policy "finance_bank_accounts_permission_select" on public.finance_bank_accounts as PERMISSIVE for SELECT to authenticated using (((is_active = true) AND (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND ((up.can_view_company_ledger = true) OR (up.can_pay_expense_claims = true) OR (up.can_edit_company_ledger = true)))))));
create policy "finance_bank_accounts_permission_update" on public.finance_bank_accounts as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND (up.role = 'admin'::text))))) with check ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND (up.role = 'admin'::text)))));
create policy "finance_ledger_permission_insert" on public.finance_company_ledger as PERMISSIVE for INSERT to authenticated with check (((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND ((up.can_edit_company_ledger = true) OR (up.can_pay_expense_claims = true))))) AND ((bank_account_id IS NULL) OR (EXISTS ( SELECT 1
   FROM finance_bank_account_access fbaa
  WHERE ((fbaa.user_profile_id = auth.uid()) AND (fbaa.bank_account_id = finance_company_ledger.bank_account_id) AND (fbaa.can_view = true)))))));
create policy "finance_ledger_permission_select" on public.finance_company_ledger as PERMISSIVE for SELECT to authenticated using (((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND (up.can_view_company_ledger = true)))) AND ((bank_account_id IS NULL) OR (EXISTS ( SELECT 1
   FROM finance_bank_account_access fbaa
  WHERE ((fbaa.user_profile_id = auth.uid()) AND (fbaa.bank_account_id = finance_company_ledger.bank_account_id) AND (fbaa.can_view = true)))))));
create policy "finance_ledger_permission_update" on public.finance_company_ledger as PERMISSIVE for UPDATE to authenticated using (((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND ((up.can_edit_company_ledger = true) OR (up.can_void_company_ledger = true))))) AND ((bank_account_id IS NULL) OR (EXISTS ( SELECT 1
   FROM finance_bank_account_access fbaa
  WHERE ((fbaa.user_profile_id = auth.uid()) AND (fbaa.bank_account_id = finance_company_ledger.bank_account_id) AND (fbaa.can_view = true))))))) with check (((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND ((up.can_edit_company_ledger = true) OR (up.can_void_company_ledger = true))))) AND ((bank_account_id IS NULL) OR (EXISTS ( SELECT 1
   FROM finance_bank_account_access fbaa
  WHERE ((fbaa.user_profile_id = auth.uid()) AND (fbaa.bank_account_id = finance_company_ledger.bank_account_id) AND (fbaa.can_view = true)))))));
create policy "finance_comp_batches_permission_insert" on public.finance_compensation_batches as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND (up.can_edit_lawyer_compensation = true)))));
create policy "finance_comp_batches_permission_select" on public.finance_compensation_batches as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND (up.can_view_lawyer_compensation = true)))));
create policy "finance_comp_batches_permission_update" on public.finance_compensation_batches as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND ((up.can_edit_lawyer_compensation = true) OR (up.can_void_lawyer_compensation = true)))))) with check ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND ((up.can_edit_lawyer_compensation = true) OR (up.can_void_lawyer_compensation = true))))));
create policy "partner_insert_compensation_batches" on public.finance_compensation_batches as PERMISSIVE for INSERT to authenticated with check ((current_user_is_admin_or_partner() AND (status = 'draft'::text) AND ((created_by_user_id IS NULL) OR (created_by_user_id = auth.uid()))));
create policy "partner_select_compensation_batches" on public.finance_compensation_batches as PERMISSIVE for SELECT to authenticated using (current_user_is_admin_or_partner());
create policy "partner_update_compensation_draft_batches" on public.finance_compensation_batches as PERMISSIVE for UPDATE to authenticated using ((current_user_is_admin_or_partner() AND (status = 'draft'::text))) with check ((current_user_is_admin_or_partner() AND (status = 'draft'::text)));
create policy "finance_comp_allocations_permission_delete" on public.finance_compensation_allocations as PERMISSIVE for DELETE to authenticated using ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND (up.can_edit_lawyer_compensation = true)))));
create policy "finance_comp_allocations_permission_insert" on public.finance_compensation_allocations as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND (up.can_edit_lawyer_compensation = true)))));
create policy "finance_comp_allocations_permission_select" on public.finance_compensation_allocations as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND (up.can_view_lawyer_compensation = true)))));
create policy "finance_comp_allocations_permission_update" on public.finance_compensation_allocations as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND (up.can_edit_lawyer_compensation = true))))) with check ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND (up.can_edit_lawyer_compensation = true)))));
create policy "partner_delete_compensation_draft_allocations" on public.finance_compensation_allocations as PERMISSIVE for DELETE to authenticated using ((current_user_is_admin_or_partner() AND compensation_batch_is_draft(batch_id)));
create policy "partner_insert_compensation_allocations" on public.finance_compensation_allocations as PERMISSIVE for INSERT to authenticated with check ((current_user_is_admin_or_partner() AND compensation_batch_is_draft(batch_id) AND ((created_by_user_id IS NULL) OR (created_by_user_id = auth.uid()))));
create policy "partner_select_compensation_allocations" on public.finance_compensation_allocations as PERMISSIVE for SELECT to authenticated using (current_user_is_admin_or_partner());
create policy "partner_update_compensation_draft_allocations" on public.finance_compensation_allocations as PERMISSIVE for UPDATE to authenticated using ((current_user_is_admin_or_partner() AND compensation_batch_is_draft(batch_id))) with check ((current_user_is_admin_or_partner() AND compensation_batch_is_draft(batch_id)));
create policy "finance_expense_claims_permission_insert" on public.finance_expense_claims as PERMISSIVE for INSERT to authenticated with check (((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND (up.can_submit_expense_claim = true)))) AND ((created_by_user_id = auth.uid()) OR (claimant_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND (up.can_view_all_expense_claims = true)))))));
create policy "finance_expense_claims_permission_select" on public.finance_expense_claims as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND ((up.can_view_all_expense_claims = true) OR ((up.can_view_own_expense_claims = true) AND ((finance_expense_claims.created_by_user_id = auth.uid()) OR (finance_expense_claims.claimant_user_id = auth.uid()))))))));
create policy "finance_expense_claims_permission_update" on public.finance_expense_claims as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND ((up.can_approve_expense_claims = true) OR (up.can_pay_expense_claims = true)))))) with check ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = auth.uid()) AND (up.active = true) AND ((up.can_approve_expense_claims = true) OR (up.can_pay_expense_claims = true))))));
alter table public.office_work_logs enable row level security;
grant select,insert,update on public.office_work_logs to authenticated;
create policy fixture_office_old on public.office_work_logs for all to authenticated
 using (exists(select 1 from user_profiles where id=auth.uid() and (role='admin' or can_view_all_office_work_logs)))
 with check (exists(select 1 from user_profiles where id=auth.uid() and (role='admin' or can_edit_office_work_logs)));
