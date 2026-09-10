-- SELECT-only post-apply/candidate dry-run verifier. One statement, one row.
-- No Payment save/confirm RPC is called. Pure frozen-evidence test vectors only.
with expected_functions as (
  -- GENERATED CANDIDATE FUNCTION MANIFEST
  select * from jsonb_to_recordset('[{"signature":"public.assert_finance_payment_structured_wht(uuid)","body_md5":"52cd73f8b3ba91ff9b297041129cc391","security_definer":true,"authenticated_execute":false},{"signature":"public.assert_finance_payment_structured_wht_v1(uuid)","body_md5":"1114ee87e6f2e74fedcfbb096065388c","security_definer":true,"authenticated_execute":false},{"signature":"public.finance_invoice_wht_lines_v2(jsonb)","body_md5":"b8cdedf15dceee0c3d4b03ef7fbc7e2c","security_definer":false,"authenticated_execute":false},{"signature":"public.finance_payment_wht_review_v2(jsonb,jsonb)","body_md5":"4af13910a5ee37ce68948fb6c9c7156e","security_definer":false,"authenticated_execute":false},{"signature":"public.guard_finance_payment_wht_confirmation()","body_md5":"5773fee1676451fc5d80c7b30ff7cb4f","security_definer":true,"authenticated_execute":false},{"signature":"public.save_finance_payment_wht_lines_draft(uuid,date,text,uuid,text,text,text,text,jsonb)","body_md5":"dfbd31e473a7d682a1329c18a7c1ee93","security_definer":true,"authenticated_execute":true}]'::jsonb) x(signature text,body_md5 text,security_definer boolean,authenticated_execute boolean)
), function_differences as (
  select e.signature,e.body_md5 as expected_body_md5,md5(p.prosrc) as actual_body_md5,
    e.security_definer as expected_security_definer,p.prosecdef as actual_security_definer
  from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)
  where p.oid is null or md5(p.prosrc) is distinct from e.body_md5 or p.prosecdef is distinct from e.security_definer
    or p.proconfig is distinct from array['search_path=public']::text[]
    or has_function_privilege('authenticated',p.oid,'EXECUTE') is distinct from e.authenticated_execute
    or has_function_privilege('anon',p.oid,'EXECUTE')
    or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')
), preserved_functions as (
  -- GENERATED PRESERVED FUNCTION MANIFEST
  select * from jsonb_to_recordset('[{"signature":"public.confirm_finance_payment(uuid,boolean)","body_md5":"deae5aa01dc48eb0faa64afa82bca8b7"},{"signature":"public.finance_invoice_wht_basis_v1(jsonb)","body_md5":"e48a9550e6c675f034714a907ddfca9b"},{"signature":"public.guard_structured_wht_reallocation()","body_md5":"229b0af17984dd64228c9a1258f548b9"},{"signature":"public.post_confirmed_payment_to_finance_cash_transaction(uuid)","body_md5":"5cff47abdf1ae86983b201d88cd8e64c"},{"signature":"public.save_finance_payment_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb)","body_md5":"ecc24e593d80a9c1e93ea6ea236c3f17"},{"signature":"public.save_finance_payment_tax_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb,text,numeric)","body_md5":"acb0e612b8a816a04108182d31f21e7a"}]'::jsonb) x(signature text,body_md5 text)
), preserved_function_differences as (
  select e.signature,e.body_md5 as expected_body_md5,md5(p.prosrc) as actual_body_md5
  from preserved_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)
  where p.oid is null or md5(p.prosrc) is distinct from e.body_md5
), expected_catalog as (
  -- GENERATED CANDIDATE CATALOG MANIFEST
  select * from jsonb_to_recordset('[{"kind":"column","name":"base_amount","definition":"numeric(14,2):true:"},{"kind":"column","name":"basis_snapshot_json","definition":"jsonb:true:"},{"kind":"column","name":"calculated_wht_amount","definition":"numeric(14,2):true:"},{"kind":"column","name":"calculation_rule","definition":"text:true:"},{"kind":"column","name":"created_at","definition":"timestamp with time zone:true:now()"},{"kind":"column","name":"created_by_user_id","definition":"uuid:false:"},{"kind":"column","name":"id","definition":"uuid:true:gen_random_uuid()"},{"kind":"column","name":"invoice_id","definition":"uuid:true:"},{"kind":"column","name":"invoice_item_id","definition":"uuid:true:"},{"kind":"column","name":"payment_id","definition":"uuid:true:"},{"kind":"column","name":"rate_percent","definition":"numeric(7,4):false:"},{"kind":"constraint","name":"finance_payment_wht_calculation_check","definition":"CHECK (calculation_rule = ''single_line_full_invoice_v1''::text AND rate_percent IS NOT NULL AND calculated_wht_amount > 0::numeric AND calculated_wht_amount = round(base_amount * rate_percent / 100::numeric, 2) OR calculation_rule = ''line_review_full_invoice_v2''::text AND COALESCE(jsonb_typeof(basis_snapshot_json -> ''basis''::text) = ''object''::text, false) AND (COALESCE((basis_snapshot_json ->> ''applicability''::text) = ''applies''::text, false) AND rate_percent IS NOT NULL AND calculated_wht_amount > 0::numeric AND calculated_wht_amount = round(base_amount * rate_percent / 100::numeric, 2) OR COALESCE((basis_snapshot_json ->> ''applicability''::text) = ''does_not_apply''::text, false) AND rate_percent IS NULL AND calculated_wht_amount = 0::numeric))"},{"kind":"constraint","name":"finance_payment_wht_components_base_amount_check","definition":"CHECK (base_amount > 0::numeric)"},{"kind":"constraint","name":"finance_payment_wht_components_basis_snapshot_json_check","definition":"CHECK (jsonb_typeof(basis_snapshot_json) = ''object''::text)"},{"kind":"constraint","name":"finance_payment_wht_components_calculation_rule_check","definition":"CHECK (calculation_rule = ANY (ARRAY[''single_line_full_invoice_v1''::text, ''line_review_full_invoice_v2''::text]))"},{"kind":"constraint","name":"finance_payment_wht_components_created_by_user_id_fkey","definition":"FOREIGN KEY (created_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL"},{"kind":"constraint","name":"finance_payment_wht_components_invoice_id_fkey","definition":"FOREIGN KEY (invoice_id) REFERENCES finance_invoices(id) ON DELETE RESTRICT"},{"kind":"constraint","name":"finance_payment_wht_components_invoice_item_id_fkey","definition":"FOREIGN KEY (invoice_item_id) REFERENCES finance_invoice_items(id) ON DELETE RESTRICT"},{"kind":"constraint","name":"finance_payment_wht_components_payment_id_fkey","definition":"FOREIGN KEY (payment_id) REFERENCES finance_payments(id) ON DELETE RESTRICT"},{"kind":"constraint","name":"finance_payment_wht_components_pkey","definition":"PRIMARY KEY (id)"},{"kind":"constraint","name":"finance_payment_wht_components_rate_percent_check","definition":"CHECK (rate_percent > 0::numeric AND rate_percent <= 100::numeric)"},{"kind":"constraint","name":"finance_payment_wht_line_unique","definition":"UNIQUE (payment_id, invoice_id, invoice_item_id)"},{"kind":"constraint","name":"finance_payments_wht_calculation_mode_check","definition":"CHECK (wht_calculation_mode = ANY (ARRAY[''none''::text, ''rate''::text, ''line_review''::text]))"},{"kind":"index","name":"finance_payment_wht_components_pkey","definition":"CREATE UNIQUE INDEX finance_payment_wht_components_pkey ON public.finance_payment_wht_components USING btree (id)"},{"kind":"index","name":"finance_payment_wht_invoice_idx","definition":"CREATE INDEX finance_payment_wht_invoice_idx ON public.finance_payment_wht_components USING btree (invoice_id)"},{"kind":"index","name":"finance_payment_wht_line_unique","definition":"CREATE UNIQUE INDEX finance_payment_wht_line_unique ON public.finance_payment_wht_components USING btree (payment_id, invoice_id, invoice_item_id)"}]'::jsonb) x(kind text,name text,definition text)
), actual_catalog as (
  select 'constraint'::text as kind,c.conname::text as name,pg_get_constraintdef(c.oid,true) as definition
  from pg_constraint c where c.conrelid in ('public.finance_payment_wht_components'::regclass,'public.finance_payments'::regclass)
    and (c.conrelid='public.finance_payment_wht_components'::regclass or c.conname='finance_payments_wht_calculation_mode_check')
  union all select 'column',a.attname::text,format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),'')
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid='public.finance_payment_wht_components'::regclass and a.attnum>0 and not a.attisdropped
  union all select 'index',c.relname::text,pg_get_indexdef(c.oid) from pg_index i join pg_class c on c.oid=i.indexrelid
    where i.indrelid='public.finance_payment_wht_components'::regclass
), catalog_differences as (
  select coalesce(e.kind,a.kind) as kind,coalesce(e.name,a.name) as name,e.definition as expected,a.definition as actual
  from expected_catalog e full join actual_catalog a using(kind,name) where e.definition is distinct from a.definition
), vector as (
  select '{"schema_version":2,"source_model":"billable_charge_v2","invoice":{"id":"00000000-0000-4000-8000-000000000001","document_status":"issued","currency":"THB","amount_before_vat":18672.90,"vat_amount":607.10,"total_amount":19280},"items":[{"invoice_item":{"id":"00000000-0000-4000-8000-000000000011","invoice_id":"00000000-0000-4000-8000-000000000001","source_state":"active","vat_applicable":true,"amount_before_vat":4000,"vat_amount":280,"line_total":4280}},{"invoice_item":{"id":"00000000-0000-4000-8000-000000000012","invoice_id":"00000000-0000-4000-8000-000000000001","source_state":"active","vat_applicable":false,"amount_before_vat":10000,"vat_amount":0,"line_total":10000}},{"invoice_item":{"id":"00000000-0000-4000-8000-000000000013","invoice_id":"00000000-0000-4000-8000-000000000001","source_state":"active","vat_applicable":true,"amount_before_vat":4672.90,"vat_amount":327.10,"line_total":5000}}]}'::jsonb as snapshot
), math as (
  select public.finance_invoice_wht_lines_v2(snapshot) as bases,
    public.finance_payment_wht_review_v2(snapshot,(select jsonb_agg(jsonb_build_object('invoice_item_id',i->'invoice_item'->>'id','applicability','applies','rate_percent',3)) from jsonb_array_elements(snapshot->'items') i)) as all_applies,
    public.finance_payment_wht_review_v2(snapshot,(select jsonb_agg(jsonb_build_object('invoice_item_id',i->'invoice_item'->>'id',
      'applicability',case when i->'invoice_item'->>'id'='00000000-0000-4000-8000-000000000012' then 'does_not_apply' else 'applies' end,
      'rate_percent',case when i->'invoice_item'->>'id'='00000000-0000-4000-8000-000000000012' then null else 3 end)) from jsonb_array_elements(snapshot->'items') i)) as mixed
  from vector
), checks as (
  select 'exact_function_bodies_security_privileges' as name,(select count(*) from expected_functions)>=6 and not exists(select 1 from function_differences) as pass
  union all select 'existing_payment_cash_single_line_rpcs_preserved',(select count(*) from preserved_functions)>=6 and not exists(select 1 from preserved_function_differences)
  union all select 'exact_component_catalog',(select count(*) from expected_catalog)>10 and not exists(select 1 from catalog_differences)
  union all select 'component_browser_mutation_blocked',(select relrowsecurity from pg_class where oid='public.finance_payment_wht_components'::regclass)
    and has_table_privilege('authenticated','public.finance_payment_wht_components','SELECT')
    and not has_table_privilege('authenticated','public.finance_payment_wht_components','INSERT,UPDATE,DELETE,TRUNCATE')
    and not has_table_privilege('anon','public.finance_payment_wht_components','INSERT,UPDATE,DELETE,TRUNCATE')
  union all select 'read_policy_preserved',exists(select 1 from pg_policies where schemaname='public' and tablename='finance_payment_wht_components'
    and policyname='payment viewers read wht components' and cmd='SELECT' and roles=array['authenticated']::name[]
    and qual='current_user_can_view_finance_payments()')
  union all select 'transition_child_reallocation_triggers_preserved',(select count(*) from pg_trigger t where not t.tgisinternal and t.tgenabled='O' and
    ((t.tgrelid='public.finance_payments'::regclass and t.tgname='finance_payment_structured_wht_before_write' and t.tgfoid='public.guard_finance_payment_wht_confirmation()'::regprocedure)
    or (t.tgrelid='public.finance_payment_wht_components'::regclass and t.tgname='finance_payment_wht_component_draft_guard' and t.tgfoid='public.guard_finance_payment_child_mutation()'::regprocedure)
    or (t.tgrelid='public.finance_payment_allocation_reallocations'::regclass and t.tgname='finance_payment_structured_wht_reallocation_guard' and t.tgfoid='public.guard_structured_wht_reallocation()'::regprocedure)))=3
  union all select 'all_applicable_before_vat_exact',
    (select sum((c->>'calculated_wht_amount')::numeric) from math,jsonb_array_elements(all_applies)c)=560.19
    and (select sum((c->>'base_amount')::numeric) from math,jsonb_array_elements(all_applies)c)=18672.90
  union all select 'mixed_applicability_exact',
    (select sum((c->>'calculated_wht_amount')::numeric) from math,jsonb_array_elements(mixed)c)=260.19
    and (select count(*) from math,jsonb_array_elements(mixed)c where c->'basis_snapshot_json'->>'applicability'='does_not_apply' and c->'rate_percent'='null'::jsonb and (c->>'calculated_wht_amount')::numeric=0)=1
  union all select 'base_reader_does_not_infer_rate_or_applicability',not exists(select 1 from math,jsonb_array_elements(bases)c where c?'rate_percent' or c?'applicability')
  union all select 'target_draft_unchanged',count(*)=1 and bool_and(status='draft' and cash_amount+wht_amount=19280)
    from public.finance_payments where id='95e22d0e-1996-4f16-98e4-218db1cbd857'
  union all select 'target_invoice_unchanged',count(*)=1 and bool_and(document_status='issued' and invoice_no='VP-IV-202609-000004'
    and total_amount=19280 and amount_before_vat=18672.90 and vat_amount=607.10)
    from public.finance_invoices where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6'
  union all select 'historical_single_line_payment_unchanged',count(*)=1 and bool_and(status='confirmed' and wht_calculation_mode='rate'
    and cash_amount=4859.81 and wht_amount=140.19 and settlement_amount=5000) from public.finance_payments where id='9e2f601e-13ef-4165-8e2c-1887c3ad8861'
  union all select 'historical_single_line_component_unchanged',count(*)=1 and bool_and(calculation_rule='single_line_full_invoice_v1'
    and base_amount=4672.90 and rate_percent=3 and calculated_wht_amount=140.19) from public.finance_payment_wht_components where payment_id='9e2f601e-13ef-4165-8e2c-1887c3ad8861'
  union all select 'historical_receipt_unchanged',count(*)=1 and bool_and(status='issued' and receipt_no='VP-RC-202609-000001'
    and payment_id='9e2f601e-13ef-4165-8e2c-1887c3ad8861') from public.finance_receipts where id='a76cd43d-fe52-4008-ade1-f1d79a9f27bf'
  union all select 'no_line_review_rows_created_by_migration',not exists(select 1 from public.finance_payment_wht_components where calculation_rule='line_review_full_invoice_v2')
    and not exists(select 1 from public.finance_payments where wht_calculation_mode='line_review')
  union all select 'no_cash_cutover',not exists(select 1 from public.finance_account_opening_balances)
)
select current_setting('server_version_num') as catalog_server_version_num,
  (select jsonb_object_agg(name,coalesce(pass,false) order by name) from checks) as checks,
  (select coalesce(jsonb_agg(name order by name),'[]') from checks where pass is not true) as failed_checks,
  (select coalesce(jsonb_agg(to_jsonb(d) order by signature),'[]') from function_differences d) as function_differences,
  (select coalesce(jsonb_agg(to_jsonb(d) order by signature),'[]') from preserved_function_differences d) as preserved_function_differences,
  (select coalesce(jsonb_agg(to_jsonb(d) order by kind,name),'[]') from catalog_differences d) as catalog_differences,
  (select count(*) from public.finance_payments) as payment_rows_observability,
  (select count(*) from public.finance_company_ledger) as ledger_rows_observability,
  (select count(*) from public.finance_compensation_batches) as compensation_rows_observability,
  not exists(select 1 from checks where pass is not true) as payment_wht_line_review_verification_pass;
