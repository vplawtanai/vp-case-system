-- Phase 4C: controlled Invoice Draft editing and atomic Draft -> Issued workflow.

do $$
begin
  if to_regprocedure('public.create_finance_invoice_draft_from_installment(uuid)') is null
    or to_regprocedure('public.validate_finance_invoice_integrity(uuid)') is null
    or to_regprocedure('public.generate_finance_document_no(text,date)') is null
    or to_regclass('public.finance_invoice_audit_events') is null
  then
    raise exception 'Invoice Draft workflow requires Migrations 017 through 019';
  end if;
end;
$$;

alter table public.finance_invoices
  drop constraint finance_invoices_lifecycle_metadata_check;

alter table public.finance_invoices
  add constraint finance_invoices_lifecycle_metadata_check
  check (
    (
      document_status = 'draft'
      and invoice_no is null
      and issued_snapshot_json is null
      and issued_at is null
      and issued_by_user_id is null
      and cancelled_at is null
      and cancelled_by_user_id is null
      and cancel_reason is null
      and voided_at is null
      and voided_by_user_id is null
      and void_reason is null
    )
    or (
      document_status = 'cancelled'
      and invoice_no is null
      and issue_date is null
      and issued_snapshot_json is null
      and issued_at is null
      and issued_by_user_id is null
      and cancelled_at is not null
      and cancelled_by_user_id is not null
      and nullif(btrim(coalesce(cancel_reason, '')), '') is not null
      and voided_at is null
      and voided_by_user_id is null
      and void_reason is null
    )
    or (
      document_status = 'issued'
      and nullif(btrim(coalesce(invoice_no, '')), '') is not null
      and issue_date is not null
      and issued_snapshot_json is not null
      and issued_snapshot_json <> '{}'::jsonb
      and issued_at is not null
      and issued_by_user_id is not null
      and cancelled_at is null
      and cancelled_by_user_id is null
      and cancel_reason is null
      and voided_at is null
      and voided_by_user_id is null
      and void_reason is null
    )
    or (
      document_status = 'voided'
      and nullif(btrim(coalesce(invoice_no, '')), '') is not null
      and issue_date is not null
      and issued_snapshot_json is not null
      and issued_snapshot_json <> '{}'::jsonb
      and issued_at is not null
      and issued_by_user_id is not null
      and cancelled_at is null
      and cancelled_by_user_id is null
      and cancel_reason is null
      and voided_at is not null
      and voided_by_user_id is not null
      and nullif(btrim(coalesce(void_reason, '')), '') is not null
    )
  );

create or replace function public.save_finance_invoice_draft(
  p_invoice_id uuid,
  p_issue_date date,
  p_due_date date,
  p_customer_note text,
  p_payment_terms_text text,
  p_internal_note text,
  p_language_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.finance_invoices%rowtype;
  v_customer_note text := nullif(btrim(coalesce(p_customer_note, '')), '');
  v_payment_terms text := nullif(btrim(coalesce(p_payment_terms_text, '')), '');
  v_internal_note text := nullif(btrim(coalesce(p_internal_note, '')), '');
  v_language text := lower(btrim(coalesce(p_language_code, '')));
  v_actor_email text;
  v_actor_name text;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to save Invoice Draft';
  end if;
  if p_invoice_id is null then raise exception 'Invoice Draft is required'; end if;
  if v_language not in ('th', 'en') then raise exception 'Invoice language is invalid'; end if;
  if p_due_date is not null and p_issue_date is not null and p_due_date < p_issue_date then
    raise exception 'Invoice due date cannot be before issue date';
  end if;
  if length(coalesce(v_customer_note, '')) > 4000 then raise exception 'Invoice customer note is too long'; end if;
  if length(coalesce(v_payment_terms, '')) > 4000 then raise exception 'Invoice payment instructions are too long'; end if;
  if length(coalesce(v_internal_note, '')) > 4000 then raise exception 'Invoice internal note is too long'; end if;

  select * into v_invoice
  from public.finance_invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then raise exception 'Invoice Draft not found'; end if;
  if v_invoice.document_status <> 'draft' then raise exception 'Only a Draft Invoice can be edited'; end if;

  if v_invoice.issue_date is not distinct from p_issue_date
    and v_invoice.due_date is not distinct from p_due_date
    and v_invoice.customer_note is not distinct from v_customer_note
    and v_invoice.payment_terms_text is not distinct from v_payment_terms
    and v_invoice.internal_note is not distinct from v_internal_note
    and v_invoice.language_code is not distinct from v_language
  then
    return v_invoice.id;
  end if;

  select
    profile.email,
    coalesce(nullif(btrim(profile.staff_name), ''), nullif(btrim(profile.full_name), ''), profile.email)
  into v_actor_email, v_actor_name
  from public.user_profiles as profile
  where profile.id = auth.uid();

  update public.finance_invoices
  set
    issue_date = p_issue_date,
    due_date = p_due_date,
    customer_note = v_customer_note,
    payment_terms_text = v_payment_terms,
    internal_note = v_internal_note,
    language_code = v_language,
    updated_by_user_id = auth.uid(),
    updated_at = now()
  where id = v_invoice.id;

  insert into public.finance_invoice_audit_events (
    invoice_id, event_type, event_payload_json,
    actor_user_id, actor_email, actor_name
  ) values (
    v_invoice.id,
    'draft_saved',
    jsonb_build_object(
      'issue_date', p_issue_date,
      'due_date', p_due_date,
      'language_code', v_language,
      'customer_note_present', v_customer_note is not null,
      'payment_instructions_present', v_payment_terms is not null,
      'internal_note_present', v_internal_note is not null,
      'financial_values_changed', false
    ),
    auth.uid(), v_actor_email, v_actor_name
  );

  return v_invoice.id;
end;
$$;

create or replace function public.issue_finance_invoice(
  p_invoice_id uuid,
  p_human_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.finance_invoices%rowtype;
  v_plan public.finance_billing_plans%rowtype;
  v_installment public.finance_billing_installments%rowtype;
  v_invoice_no text;
  v_issued_at timestamptz := now();
  v_snapshot jsonb;
  v_actor_email text;
  v_actor_name text;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to issue Invoice';
  end if;
  if p_invoice_id is null then raise exception 'Invoice Draft is required'; end if;
  if p_human_confirmed is distinct from true then raise exception 'Invoice issue confirmation is required'; end if;

  select * into v_invoice
  from public.finance_invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then raise exception 'Invoice Draft not found'; end if;
  if v_invoice.document_status = 'issued' then
    if v_invoice.invoice_no is null or v_invoice.issued_snapshot_json is null then
      raise exception 'Issued Invoice metadata is incomplete';
    end if;
    return v_invoice.id;
  end if;
  if v_invoice.document_status <> 'draft' then raise exception 'Only a Draft Invoice can be issued'; end if;
  if nullif(btrim(coalesce(v_invoice.customer_name, '')), '') is null then
    raise exception 'Invoice customer name is required';
  end if;
  if v_invoice.issue_date is null then raise exception 'Invoice issue date is required'; end if;
  if v_invoice.issue_date > (now() at time zone 'Asia/Bangkok')::date then
    raise exception 'Invoice issue date cannot be in the future';
  end if;
  if v_invoice.due_date is not null and v_invoice.due_date < v_invoice.issue_date then
    raise exception 'Invoice due date cannot be before issue date';
  end if;

  select * into v_plan
  from public.finance_billing_plans
  where id = v_invoice.billing_plan_id
  for update;
  select * into v_installment
  from public.finance_billing_installments
  where id = v_invoice.primary_billing_installment_id
  for update;

  if v_plan.id is null or v_plan.status <> 'active' then
    raise exception 'Invoice requires an active Billing Plan';
  end if;
  if v_installment.id is null
    or v_installment.billing_plan_id <> v_plan.id
    or v_installment.status <> 'ready_to_invoice'
  then
    raise exception 'Invoice requires its source Billing Installment to remain ready to invoice';
  end if;

  perform public.validate_finance_invoice_integrity(v_invoice.id);
  v_invoice_no := public.generate_finance_document_no('invoice', v_invoice.issue_date);

  select jsonb_build_object(
    'schema_version', 1,
    'invoice', jsonb_strip_nulls(jsonb_build_object(
      'id', v_invoice.id,
      'invoice_no', v_invoice_no,
      'document_status', 'issued',
      'issue_date', v_invoice.issue_date,
      'due_date', v_invoice.due_date,
      'currency', v_invoice.currency,
      'language_code', v_invoice.language_code,
      'customer_note', v_invoice.customer_note,
      'payment_terms_text', v_invoice.payment_terms_text,
      'amount_before_vat', v_invoice.amount_before_vat,
      'vat_amount', v_invoice.vat_amount,
      'total_amount', v_invoice.total_amount,
      'issued_at', v_issued_at,
      'issued_by_user_id', auth.uid()
    )),
    'seller', jsonb_strip_nulls(jsonb_build_object(
      'name_th', v_invoice.seller_name_th,
      'name_en', v_invoice.seller_name_en,
      'tax_id', v_invoice.seller_tax_id,
      'branch', v_invoice.seller_branch,
      'address', v_invoice.seller_address,
      'phone', v_invoice.seller_phone,
      'email', v_invoice.seller_email,
      'website', v_invoice.seller_website,
      'snapshot', v_invoice.seller_snapshot_json
    )),
    'customer', jsonb_strip_nulls(jsonb_build_object(
      'id', v_invoice.client_id,
      'name', v_invoice.customer_name,
      'tax_id', v_invoice.customer_tax_id,
      'branch', v_invoice.customer_branch,
      'billing_address', v_invoice.customer_billing_address,
      'phone', v_invoice.customer_phone,
      'email', v_invoice.customer_email,
      'snapshot', v_invoice.customer_snapshot_json
    )),
    'matter', v_invoice.matter_snapshot_json,
    'source', v_invoice.source_snapshot_json,
    'items', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', item.id,
        'source_fee_agreement_item_id', item.source_fee_agreement_item_id,
        'source_billing_installment_item_id', item.source_billing_installment_item_id,
        'description', item.description,
        'source_quantity', item.source_quantity,
        'source_unit_price', item.source_unit_price,
        'allocation_percent', item.allocation_percent,
        'vat_applicable', item.vat_applicable,
        'vat_rate', item.vat_rate,
        'tax_category', item.tax_category,
        'price_tax_mode', item.price_tax_mode,
        'amount_before_vat', item.amount_before_vat,
        'vat_amount', item.vat_amount,
        'line_total', item.line_total,
        'sort_order', item.sort_order,
        'source_snapshot', item.source_snapshot_json
      )) order by item.sort_order, item.id)
      from public.finance_invoice_items as item
      where item.invoice_id = v_invoice.id
    ), '[]'::jsonb),
    'installment_allocations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', allocation.id,
        'billing_installment_id', allocation.billing_installment_id,
        'allocated_before_vat', allocation.allocated_before_vat,
        'allocated_vat', allocation.allocated_vat,
        'allocated_total', allocation.allocated_total,
        'source_snapshot', allocation.source_snapshot_json
      ) order by allocation.created_at, allocation.id)
      from public.finance_invoice_installment_allocations as allocation
      where allocation.invoice_id = v_invoice.id
    ), '[]'::jsonb)
  ) into v_snapshot;

  select
    profile.email,
    coalesce(nullif(btrim(profile.staff_name), ''), nullif(btrim(profile.full_name), ''), profile.email)
  into v_actor_email, v_actor_name
  from public.user_profiles as profile
  where profile.id = auth.uid();

  update public.finance_invoices
  set
    invoice_no = v_invoice_no,
    document_status = 'issued',
    issued_snapshot_json = v_snapshot,
    issued_at = v_issued_at,
    issued_by_user_id = auth.uid(),
    updated_by_user_id = auth.uid(),
    updated_at = v_issued_at
  where id = v_invoice.id;

  update public.finance_billing_installments
  set
    status = 'invoiced',
    invoiced_at = v_issued_at,
    updated_by_user_id = auth.uid(),
    updated_at = v_issued_at
  where id = v_installment.id;

  perform public.validate_finance_invoice_integrity(v_invoice.id);

  insert into public.finance_invoice_audit_events (
    invoice_id, event_type, event_payload_json,
    actor_user_id, actor_email, actor_name
  ) values (
    v_invoice.id,
    'issued',
    jsonb_build_object(
      'invoice_no', v_invoice_no,
      'issue_date', v_invoice.issue_date,
      'issued_at', v_issued_at,
      'source_billing_plan_id', v_plan.id,
      'source_billing_installment_id', v_installment.id,
      'installment_status_changed_to', 'invoiced',
      'payment_created', false,
      'receipt_created', false,
      'tax_invoice_created', false,
      'ledger_entry_created', false,
      'compensation_entry_created', false
    ),
    auth.uid(), v_actor_email, v_actor_name
  );

  return v_invoice.id;
end;
$$;

create or replace function public.cancel_finance_invoice_draft(
  p_invoice_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.finance_invoices%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_cancelled_at timestamptz := now();
  v_actor_email text;
  v_actor_name text;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to cancel Invoice Draft';
  end if;
  if p_invoice_id is null then raise exception 'Invoice Draft is required'; end if;
  if v_reason is null then raise exception 'Invoice Draft cancellation reason is required'; end if;
  if length(v_reason) > 1000 then raise exception 'Invoice Draft cancellation reason is too long'; end if;

  select * into v_invoice
  from public.finance_invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then raise exception 'Invoice Draft not found'; end if;
  if v_invoice.document_status = 'cancelled' then return v_invoice.id; end if;
  if v_invoice.document_status <> 'draft' then raise exception 'Only a Draft Invoice can be cancelled'; end if;

  select
    profile.email,
    coalesce(nullif(btrim(profile.staff_name), ''), nullif(btrim(profile.full_name), ''), profile.email)
  into v_actor_email, v_actor_name
  from public.user_profiles as profile
  where profile.id = auth.uid();

  update public.finance_invoices
  set
    document_status = 'cancelled',
    issue_date = null,
    cancelled_at = v_cancelled_at,
    cancelled_by_user_id = auth.uid(),
    cancel_reason = v_reason,
    updated_by_user_id = auth.uid(),
    updated_at = v_cancelled_at
  where id = v_invoice.id;

  insert into public.finance_invoice_audit_events (
    invoice_id, event_type, event_payload_json,
    actor_user_id, actor_email, actor_name
  ) values (
    v_invoice.id,
    'cancelled',
    jsonb_build_object(
      'reason', v_reason,
      'source_installment_status_changed', false,
      'invoice_number_allocated', false
    ),
    auth.uid(), v_actor_email, v_actor_name
  );

  return v_invoice.id;
end;
$$;

revoke all on function public.save_finance_invoice_draft(uuid,date,date,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.save_finance_invoice_draft(uuid,date,date,text,text,text,text)
  to authenticated;

revoke all on function public.issue_finance_invoice(uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.issue_finance_invoice(uuid,boolean)
  to authenticated;

revoke all on function public.cancel_finance_invoice_draft(uuid,text)
  from public, anon, authenticated;
grant execute on function public.cancel_finance_invoice_draft(uuid,text)
  to authenticated;

comment on function public.save_finance_invoice_draft(uuid,date,date,text,text,text,text) is
  'Controlled no-op-aware save for non-financial Invoice Draft presentation fields.';
comment on function public.issue_finance_invoice(uuid,boolean) is
  'Atomically allocates the official Invoice number, freezes the issued snapshot, and marks the source installment invoiced.';
comment on function public.cancel_finance_invoice_draft(uuid,text) is
  'Cancels an unnumbered Invoice Draft without changing the source installment readiness state.';
