-- Require auditable paper-execution evidence before a Sent Fee Agreement becomes Signed.
-- Historical Signed/Completed rows and their frozen snapshots remain unchanged.

alter table public.finance_fee_agreements
  add column if not exists executed_on date null,
  add column if not exists signed_evidence_json jsonb null;

alter table public.finance_fee_agreements
  drop constraint if exists finance_fee_agreements_signed_evidence_json_check;

alter table public.finance_fee_agreements
  add constraint finance_fee_agreements_signed_evidence_json_check
  check (signed_evidence_json is null or jsonb_typeof(signed_evidence_json) = 'object');

comment on column public.finance_fee_agreements.executed_on is
  'Actual legal signing date recorded from the executed paper copy; distinct from signed_at, which is the VP OS recording timestamp.';

comment on column public.finance_fee_agreements.signed_evidence_json is
  'Private paper-signing evidence metadata. Storage paths are internal and must be exchanged for short-lived signed URLs at view time.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fee-agreement-executed-documents',
  'fee-agreement-executed-documents',
  false,
  26214400,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 26214400,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

drop policy if exists "fee agreement evidence managers read" on storage.objects;
create policy "fee agreement evidence managers read"
on storage.objects
for select
using (
  bucket_id = 'fee-agreement-executed-documents'
  and public.current_user_can_manage_finance_quotations()
);

drop policy if exists "fee agreement evidence managers insert" on storage.objects;
create policy "fee agreement evidence managers insert"
on storage.objects
for insert
with check (
  bucket_id = 'fee-agreement-executed-documents'
  and public.current_user_can_manage_finance_quotations()
  and name ~ '^fee-agreements/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'
  and lower(coalesce(metadata->>'mimetype', '')) in ('application/pdf', 'image/jpeg', 'image/png')
  and exists (
    select 1
    from public.finance_fee_agreements as agreement
    where agreement.id::text = split_part(name, '/', 2)
      and agreement.status = 'sent'
      and coalesce(agreement.execution_mode, 'paper') = 'paper'
  )
);

drop policy if exists "fee agreement evidence managers delete" on storage.objects;
create policy "fee agreement evidence managers delete"
on storage.objects
for delete
using (
  bucket_id = 'fee-agreement-executed-documents'
  and public.current_user_can_manage_finance_quotations()
  and name ~ '^fee-agreements/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'
  and exists (
    select 1
    from public.finance_fee_agreements as agreement
    where agreement.id::text = split_part(name, '/', 2)
      and agreement.status = 'sent'
      and coalesce(agreement.execution_mode, 'paper') = 'paper'
  )
);

create or replace function public.record_finance_fee_agreement_paper_signed(
  p_fee_agreement_id uuid,
  p_executed_on date,
  p_evidence_storage_path text,
  p_evidence_filename text,
  p_evidence_mime_type text,
  p_evidence_size_bytes bigint,
  p_evidence_sha256 text,
  p_verification_confirmed boolean,
  p_evidence_note text default null,
  p_evidence_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.finance_fee_agreements%rowtype;
  v_requirements jsonb := '{}'::jsonb;
  v_client_count integer := 0;
  v_firm_count integer := 0;
  v_witness_count integer := 0;
  v_minimum_client integer := 1;
  v_minimum_firm integer := 1;
  v_minimum_witness integer := 0;
  v_mime_type text := lower(btrim(coalesce(p_evidence_mime_type, '')));
  v_storage_metadata jsonb;
  v_storage_created_at timestamptz;
  v_actor_name text;
  v_actor_email text;
  v_previous_version_id uuid;
  v_next_version integer;
  v_evidence jsonb;
  v_signed_snapshot jsonb;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to record fee agreement signing evidence';
  end if;

  select *
  into v_agreement
  from public.finance_fee_agreements
  where id = p_fee_agreement_id
  for update;

  if v_agreement.id is null then
    raise exception 'Fee agreement not found';
  end if;
  if v_agreement.status <> 'sent' then
    raise exception 'Only a Sent fee agreement can record paper signing evidence';
  end if;
  if coalesce(v_agreement.execution_mode, 'paper') <> 'paper' then
    raise exception 'Paper signing evidence cannot be used for an electronic agreement';
  end if;
  if p_executed_on is null then
    raise exception 'Actual signing date is required';
  end if;
  if p_executed_on > current_date then
    raise exception 'Actual signing date cannot be in the future';
  end if;
  if coalesce(p_verification_confirmed, false) is not true then
    raise exception 'Executed-copy and signer verification confirmation is required';
  end if;
  if v_agreement.resolved_document_snapshot_json is null
    or jsonb_typeof(v_agreement.resolved_document_snapshot_json) <> 'object'
    or v_agreement.resolved_document_snapshot_json = '{}'::jsonb
  then
    raise exception 'The frozen Sent document snapshot is required before signing can be recorded';
  end if;
  if nullif(btrim(coalesce(p_evidence_storage_path, '')), '') is null
    or p_evidence_storage_path not like 'fee-agreements/' || v_agreement.id::text || '/%'
    or length(p_evidence_storage_path) > 1024
  then
    raise exception 'Invalid executed-document storage path';
  end if;
  if nullif(btrim(coalesce(p_evidence_filename, '')), '') is null
    or length(btrim(p_evidence_filename)) > 255
  then
    raise exception 'Executed-document filename is required and must not exceed 255 characters';
  end if;
  if v_mime_type not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'Executed document must be a PDF, JPEG, or PNG file';
  end if;
  if p_evidence_size_bytes is null
    or p_evidence_size_bytes <= 0
    or p_evidence_size_bytes > 26214400
  then
    raise exception 'Executed document must be larger than zero bytes and no larger than 25 MB';
  end if;
  if lower(btrim(coalesce(p_evidence_sha256, ''))) !~ '^[0-9a-f]{64}$' then
    raise exception 'Executed-document SHA-256 metadata is invalid';
  end if;
  if length(coalesce(p_evidence_note, '')) > 4000 then
    raise exception 'Signing evidence note must not exceed 4000 characters';
  end if;
  if length(coalesce(p_evidence_reference, '')) > 500 then
    raise exception 'Signing evidence reference must not exceed 500 characters';
  end if;

  select evidence.metadata, evidence.created_at
  into v_storage_metadata, v_storage_created_at
  from storage.objects as evidence
  where evidence.bucket_id = 'fee-agreement-executed-documents'
    and evidence.name = p_evidence_storage_path
  limit 1;

  if v_storage_metadata is null then
    raise exception 'Uploaded executed document was not found';
  end if;
  if lower(coalesce(v_storage_metadata->>'mimetype', '')) <> v_mime_type then
    raise exception 'Uploaded executed-document MIME type does not match the signing record';
  end if;
  if coalesce((v_storage_metadata->>'size')::bigint, -1) <> p_evidence_size_bytes then
    raise exception 'Uploaded executed-document size does not match the signing record';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_agreement.signatories_json, '[]'::jsonb)) as signer(value)
    where nullif(btrim(coalesce(signer.value->>'name', signer.value->>'display_name', '')), '') is null
      or coalesce(public.finance_fee_agreement_signatory_party_type(signer.value), '')
        not in ('client', 'firm', 'witness')
  ) then
    raise exception 'Each signatory requires a name and approved party type';
  end if;

  select
    count(*) filter (where public.finance_fee_agreement_signatory_party_type(signer.value) = 'client'),
    count(*) filter (where public.finance_fee_agreement_signatory_party_type(signer.value) = 'firm'),
    count(*) filter (where public.finance_fee_agreement_signatory_party_type(signer.value) = 'witness')
  into v_client_count, v_firm_count, v_witness_count
  from jsonb_array_elements(coalesce(v_agreement.signatories_json, '[]'::jsonb)) as signer(value);

  if v_agreement.selected_template_version_id is not null then
    select coalesce(template_version.signature_requirements_json, '{}'::jsonb)
    into v_requirements
    from public.document_template_versions as template_version
    where template_version.id = v_agreement.selected_template_version_id;

    if not found then
      raise exception 'Selected template version was not found';
    end if;
    perform public.validate_document_signature_requirements(v_requirements);
  end if;

  v_minimum_client := greatest(1, coalesce((v_requirements->>'minimum_client_signers')::integer, 0));
  v_minimum_firm := greatest(1, coalesce((v_requirements->>'minimum_firm_signers')::integer, 0));
  v_minimum_witness := greatest(
    case when coalesce((v_requirements->>'witness_required')::boolean, false) then 1 else 0 end,
    coalesce((v_requirements->>'minimum_witnesses')::integer, 0)
  );

  if v_client_count < v_minimum_client then
    raise exception 'Required client signer identity is missing';
  end if;
  if v_firm_count < v_minimum_firm then
    raise exception 'Required firm signer identity is missing';
  end if;
  if v_witness_count < v_minimum_witness then
    raise exception 'Required witness identity is missing';
  end if;

  select
    coalesce(nullif(btrim(profile.staff_name), ''), nullif(btrim(profile.full_name), ''), profile.email),
    profile.email
  into v_actor_name, v_actor_email
  from public.user_profiles as profile
  where profile.id = auth.uid();

  select version.id
  into v_previous_version_id
  from public.finance_fee_agreement_versions as version
  where version.fee_agreement_id = v_agreement.id
  order by version.version_no desc
  limit 1;

  v_next_version := coalesce(v_agreement.document_version, 0) + 1;
  v_evidence := jsonb_strip_nulls(jsonb_build_object(
    'schema_version', 1,
    'mode', 'paper',
    'executed_on', p_executed_on,
    'recorded_at', now(),
    'recorded_by', jsonb_build_object(
      'user_id', auth.uid(),
      'name', v_actor_name,
      'email', v_actor_email
    ),
    'verification_confirmed', true,
    'evidence_file', jsonb_build_object(
      'storage_bucket', 'fee-agreement-executed-documents',
      'storage_path', p_evidence_storage_path,
      'file_name', btrim(p_evidence_filename),
      'mime_type', v_mime_type,
      'size_bytes', p_evidence_size_bytes,
      'sha256', lower(btrim(p_evidence_sha256)),
      'uploaded_at', v_storage_created_at
    ),
    'note', nullif(btrim(coalesce(p_evidence_note, '')), ''),
    'reference', nullif(btrim(coalesce(p_evidence_reference, '')), '')
  ));

  -- Copy the exact Sent snapshot and add signing evidence at the root. The Sent snapshot column is untouched.
  v_signed_snapshot := v_agreement.resolved_document_snapshot_json
    || jsonb_build_object('execution_evidence', v_evidence)
    || jsonb_build_object(
      'version_context',
      jsonb_build_object(
        'version_no', v_next_version,
        'event_type', 'signed',
        'recorded_at', now(),
        'actor_user_id', auth.uid(),
        'actor_email', v_actor_email,
        'actor_name', v_actor_name
      )
    );

  update public.finance_fee_agreements
  set status = 'signed',
      executed_on = p_executed_on,
      signed_at = now(),
      signed_by_user_id = auth.uid(),
      signed_evidence_reference = nullif(btrim(coalesce(p_evidence_reference, '')), ''),
      signed_evidence_json = v_evidence,
      signed_document_snapshot_json = v_signed_snapshot,
      document_version = v_next_version,
      updated_by_user_id = auth.uid(),
      updated_at = now()
  where id = v_agreement.id;

  insert into public.finance_fee_agreement_versions (
    fee_agreement_id,
    version_no,
    event_type,
    reason,
    previous_version_id,
    source_quotation_id,
    template_id,
    template_version_id,
    document_snapshot_json,
    change_metadata_json,
    actor_user_id,
    actor_email,
    actor_name
  ) values (
    v_agreement.id,
    v_next_version,
    'signed',
    null,
    v_previous_version_id,
    v_agreement.source_quotation_id,
    v_agreement.selected_template_id,
    v_agreement.selected_template_version_id,
    v_signed_snapshot,
    jsonb_build_object(
      'from_status', 'sent',
      'to_status', 'signed',
      'execution_mode', 'paper',
      'executed_on', p_executed_on,
      'verification_confirmed', true,
      'evidence_sha256', lower(btrim(p_evidence_sha256))
    ),
    auth.uid(),
    v_actor_email,
    v_actor_name
  );

  return v_agreement.id;
end;
$$;

-- Preserve every existing lifecycle transition except direct Sent -> Signed, which now requires evidence.
create or replace function public.set_finance_fee_agreement_status(
  p_fee_agreement_id uuid,
  p_next_status text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.finance_fee_agreements%rowtype;
  v_next text := lower(btrim(coalesce(p_next_status, '')));
  v_event text;
  v_retired boolean;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to update finance fee agreement status';
  end if;
  select * into v_agreement
  from public.finance_fee_agreements
  where id = p_fee_agreement_id
  for update;
  if v_agreement.id is null then raise exception 'Fee agreement not found'; end if;
  if v_agreement.status = 'sent' and v_next = 'signed' then
    raise exception 'กรุณาบันทึกหลักฐานการลงนามก่อนเปลี่ยนสถานะเป็นลงนามแล้ว';
  end if;
  if not (
    (v_agreement.status = 'draft' and v_next in ('under_review', 'cancelled'))
    or (v_agreement.status = 'under_review' and v_next in ('sent', 'cancelled'))
    or (v_agreement.status = 'signed' and v_next = 'completed')
    or (v_agreement.status = 'draft' and v_next = 'active')
    or (v_agreement.status = 'active' and v_next in ('completed', 'cancelled'))
  ) then
    raise exception 'Invalid finance fee agreement status transition';
  end if;
  if v_next in ('under_review', 'sent', 'active')
    and (v_agreement.source_document_snapshot_json is null or v_agreement.commercial_terms_snapshot_json is null)
  then
    raise exception 'Fee agreement source evidence is required';
  end if;
  if v_next = 'sent' and v_agreement.agreement_date is null then
    raise exception 'กรุณาระบุวันที่ทำสัญญาก่อนส่งเอกสาร';
  end if;
  if v_next = 'sent'
    and (v_agreement.agreement_no is null or v_agreement.legal_terms_json is null or v_agreement.signatories_json is null)
  then
    raise exception 'Fee agreement legal document data is not ready';
  end if;
  if v_next = 'sent' and v_agreement.selected_template_version_id is not null then
    perform public.validate_finance_fee_agreement_template_ready(v_agreement.id);
    select tv.status = 'retired' or t.status = 'retired'
    into v_retired
    from public.document_template_versions as tv
    join public.document_templates as t on t.id = tv.template_id
    where tv.id = v_agreement.selected_template_version_id;
    if coalesce(v_retired, false)
      and (
        v_agreement.retired_template_use_approved_version_id is distinct from v_agreement.selected_template_version_id
        or v_agreement.retired_template_use_approved_by_user_id is null
        or nullif(btrim(coalesce(v_agreement.retired_template_use_reason, '')), '') is null
      )
    then
      raise exception 'Partner approval is required before sending an agreement that uses a retired template version';
    end if;
  end if;
  if v_next = 'cancelled'
    and exists (
      select 1 from public.finance_billing_plans
      where fee_agreement_id = v_agreement.id
        and status <> 'cancelled'
    )
  then
    raise exception 'Cancel the Billing Plan before cancelling this agreement';
  end if;

  update public.finance_fee_agreements
  set status = v_next,
      sent_at = case when v_next = 'sent' then now() else sent_at end,
      sent_by_user_id = case when v_next = 'sent' then auth.uid() else sent_by_user_id end,
      cancelled_at = case when v_next = 'cancelled' then now() else cancelled_at end,
      cancelled_by_user_id = case when v_next = 'cancelled' then auth.uid() else cancelled_by_user_id end,
      updated_by_user_id = auth.uid(),
      updated_at = now()
  where id = v_agreement.id;

  v_event := v_next;
  perform public.record_finance_fee_agreement_version(
    v_agreement.id,
    v_event,
    null,
    jsonb_build_object('from_status', v_agreement.status, 'to_status', v_next)
  );
  return v_agreement.id;
end;
$$;

revoke all on function public.record_finance_fee_agreement_paper_signed(uuid, date, text, text, text, bigint, text, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.record_finance_fee_agreement_paper_signed(uuid, date, text, text, text, bigint, text, boolean, text, text)
  to authenticated;

revoke all on function public.set_finance_fee_agreement_status(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_finance_fee_agreement_status(uuid, text)
  to authenticated;

comment on function public.record_finance_fee_agreement_paper_signed(uuid, date, text, text, text, bigint, text, boolean, text, text) is
  'Atomically records verified paper-execution evidence, derives the Signed snapshot from the frozen Sent snapshot, and creates exactly one version event.';
