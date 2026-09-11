-- ONE SELECT-only statement / ONE result row. No application RPC calls.
-- Compare protected_evidence_hash before/after apply; stop on ANY failed check.
-- Competing Client tax fields/profiles require schema review, never automatic overwrite.
with expected_functions(signature,hash,callable,security_definer,volatility) as (values ('public.protect_customer_tax_profile_audit()','a7e401cd7fce56208458721c29131bef',false,false,'v'),
('public.finance_customer_tax_identity(uuid)','259e4e1c344e24a112eaecd86bc0f6d6',false,true,'s'),
('public.get_finance_customer_tax_profile(uuid)','b0f24853759ff637123268398ca5cdba',true,true,'s'),
('public.save_finance_customer_tax_profile(uuid,boolean,text,text,text,boolean,jsonb,timestamptz)','e91913ab1a8349a70778be75d699d30c',true,true,'v'),
('public.build_finance_document_tax_source(uuid)','6738b2496a31ae3236145dc121f55c6c',false,true,'v'),
('public.finance_tax_invoice_draft_snapshot(jsonb,jsonb,date)','98adea2dd41c427318401559df580a84',false,false,'i'),
('public.confirm_finance_payment(uuid,boolean)','deae5aa01dc48eb0faa64afa82bca8b7',false,true,'v'),
('public.build_finance_receipt_source(uuid)','1fe91b4d85e36bdc913b5427f5a8e270',false,true,'v'),
('public.issue_finance_receipt(uuid,boolean,jsonb)','04ecfe81a3c72f36587f2e7ec06f0a35',true,true,'v'),
('public.document_logo_evidence(text)','a76bf15714d1c4811e7845033b4afe72',false,true,'v'),
('public.current_user_can_view_finance_tax_invoices()','61b920f71b441ab396a6058f9903c903',false,true,'s'),
('public.current_user_can_manage_finance_tax_invoices()','d049e03a67dd6c81f2309d134138dcb6',false,true,'s'),
('public.document_tax_snapshot_pre042(jsonb,jsonb,date)','bef394e77841bd9e6394511f3eebc7bd',false,false,'i'),
('public.finance_tax_invoice_issue_blockers(jsonb)','e7f592f622ab0494cbf15c160b2807bb',false,false,'i'),
('public.issue_finance_tax_invoice(uuid,jsonb,boolean,boolean)','db1ea3f2895a8eedb121493d8af86955',true,true,'v'),
('public.get_finance_document_decision(uuid)','17a217ed95ffb1cd2efb7262921f0f90',true,true,'v'),
('public.document_tax_source_pre042(uuid)','1629c804cf013b519759d672541d7d09',false,true,'v'),
('public.issue_finance_combined_document(uuid,jsonb,boolean,boolean,boolean,boolean)','2207c2d70f98db33a2f18eabe05ca624',true,true,'v'),
('public.refresh_finance_combined_document_draft(uuid,timestamptz)','d89ddafc6bedf1d621950a427b9cffea',true,true,'v'),
('public.save_finance_payment_wht_lines_draft(uuid,date,text,uuid,text,text,text,text,jsonb)','dfbd31e473a7d682a1329c18a7c1ee93',true,true,'v')),
 function_facts as (select e.*,p.oid,md5(p.prosrc)=e.hash as exact_body,p.proconfig,p.prosecdef,p.provolatile,
 coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) as authenticated_execute,
 coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) as anon_execute
 from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)),protected_evidence as (select jsonb_build_object(
 'invoices',(select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]') from public.finance_invoices i where id in ('74461042-e3ba-4922-9b64-55aac9ebd8aa','a392a5ec-cc84-4c74-bd7a-5636a984f9c6')),
 'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.finance_payments p where id in ('9e2f601e-13ef-4165-8e2c-1887c3ad8861','95e22d0e-1996-4f16-98e4-218db1cbd857')),
 'receipt',(select to_jsonb(r) from public.finance_receipts r where id='a76cd43d-fe52-4008-ade1-f1d79a9f27bf'),
 'clients',(select coalesce(jsonb_agg(to_jsonb(c) order by id),'[]') from public.clients c where id in (select client_id from public.finance_invoices where id in ('74461042-e3ba-4922-9b64-55aac9ebd8aa','a392a5ec-cc84-4c74-bd7a-5636a984f9c6')))
 ) as evidence),
 client_columns as (select column_name,data_type,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name='clients'),
 competing_fields as (select column_name from client_columns where column_name ~* '(vat|branch|tax.*address|tax.*evidence|tax.*verif|legal_name|billing_address)'),
 competing_profiles as (select table_name from information_schema.tables where table_schema='public' and table_name ~* '(client|customer).*(tax|vat)|(tax|vat).*(client|customer)' and table_name not in ('finance_customer_tax_profiles','finance_customer_tax_profile_audit_events')),
 protected_checks(name,passed) as (values
 ('protected_invoices',(select count(*)=2 and bool_and(document_status='issued' and ((id='74461042-e3ba-4922-9b64-55aac9ebd8aa' and invoice_no='VP-IV-202609-000003' and total_amount=5000) or (id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6' and invoice_no='VP-IV-202609-000004' and total_amount=19280 and vat_amount=607.10))) from public.finance_invoices where id in ('74461042-e3ba-4922-9b64-55aac9ebd8aa','a392a5ec-cc84-4c74-bd7a-5636a984f9c6'))),
 ('protected_payments',(select count(*)=2 and bool_and(status='confirmed' and ((id='9e2f601e-13ef-4165-8e2c-1887c3ad8861' and cash_amount=4859.81 and wht_amount=140.19 and settlement_amount=5000) or (id='95e22d0e-1996-4f16-98e4-218db1cbd857' and cash_amount=19160 and wht_amount=120 and settlement_amount=19280))) from public.finance_payments where id in ('9e2f601e-13ef-4165-8e2c-1887c3ad8861','95e22d0e-1996-4f16-98e4-218db1cbd857'))),
 ('protected_receipt',(select count(*)=1 and bool_and(status='issued' and receipt_no='VP-RC-202609-000001' and payment_id='9e2f601e-13ef-4165-8e2c-1887c3ad8861') from public.finance_receipts where id='a76cd43d-fe52-4008-ade1-f1d79a9f27bf')),
 ('no_cash_cutover',not exists(select 1 from public.finance_cash_transactions) and not exists(select 1 from public.finance_account_opening_balances)),
 ('client_columns_compatible',(select count(*)=6 and bool_and(case when column_name='id' then udt_name='uuid' else data_type in ('text','character varying') end) from client_columns where column_name in ('id','name','tax_id','address','client_type','status'))),
 ('no_competing_profile_to_review',not exists(select 1 from competing_fields) and not exists(select 1 from competing_profiles))
 ),
 expected_catalog as (select value from jsonb_array_elements('[
  {
    "name": "finance_customer_tax_profile_audit_events",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "not_null": true
      },
      {
        "name": "client_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "event_type",
        "type": "text",
        "default": null,
        "not_null": true
      },
      {
        "name": "event_payload_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      },
      {
        "name": "actor_user_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "clock_timestamp()",
        "not_null": true
      }
    ],
    "constraints": [
      {
        "name": "finance_customer_tax_profile_audit_eve_event_payload_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(event_payload_json) = ''object''::text))"
      },
      {
        "name": "finance_customer_tax_profile_audit_events_actor_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (actor_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_customer_tax_profile_audit_events_client_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (client_id) REFERENCES finance_customer_tax_profiles(client_id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_customer_tax_profile_audit_events_event_type_check",
        "type": "c",
        "definition": "CHECK ((event_type = ''profile_saved''::text))"
      },
      {
        "name": "finance_customer_tax_profile_audit_events_pkey",
        "type": "p",
        "definition": "PRIMARY KEY (id)"
      }
    ],
    "indexes": [
      {
        "name": "customer_tax_profile_audit_history",
        "definition": "CREATE INDEX customer_tax_profile_audit_history ON public.finance_customer_tax_profile_audit_events USING btree (client_id, created_at)"
      },
      {
        "name": "finance_customer_tax_profile_audit_events_pkey",
        "definition": "CREATE UNIQUE INDEX finance_customer_tax_profile_audit_events_pkey ON public.finance_customer_tax_profile_audit_events USING btree (id)"
      }
    ]
  },
  {
    "name": "finance_customer_tax_profiles",
    "columns": [
      {
        "name": "client_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "vat_registered",
        "type": "boolean",
        "default": null,
        "not_null": false
      },
      {
        "name": "branch_type",
        "type": "text",
        "default": null,
        "not_null": false
      },
      {
        "name": "branch_code",
        "type": "text",
        "default": null,
        "not_null": false
      },
      {
        "name": "identity_evidence",
        "type": "text",
        "default": null,
        "not_null": false
      },
      {
        "name": "identity_snapshot_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      },
      {
        "name": "verified_at",
        "type": "timestamp with time zone",
        "default": null,
        "not_null": false
      },
      {
        "name": "verified_by_user_id",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "default": "clock_timestamp()",
        "not_null": true
      },
      {
        "name": "updated_by_user_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      }
    ],
    "constraints": [
      {
        "name": "customer_tax_profile_branch",
        "type": "c",
        "definition": "CHECK ((((vat_registered IS DISTINCT FROM true) AND (branch_type IS NULL) AND (branch_code IS NULL)) OR ((vat_registered IS TRUE) AND ((((branch_type IS NULL) AND (branch_code IS NULL)) OR ((branch_type = ''head_office''::text) AND (branch_code = ''00000''::text)) OR ((branch_type = ''branch''::text) AND (branch_code ~ ''^[0-9]{5}$''::text) AND (branch_code <> ''00000''::text))) IS TRUE))))"
      },
      {
        "name": "customer_tax_profile_verified",
        "type": "c",
        "definition": "CHECK ((((verified_at IS NULL) AND (verified_by_user_id IS NULL)) OR ((verified_at IS NOT NULL) AND (verified_by_user_id IS NOT NULL) AND (vat_registered IS NOT NULL) AND (NULLIF(btrim((identity_snapshot_json ->> ''name''::text)), ''''::text) IS NOT NULL) AND (NULLIF(btrim((identity_snapshot_json ->> ''address''::text)), ''''::text) IS NOT NULL) AND (((vat_registered = false) OR (((identity_snapshot_json ->> ''tax_id''::text) ~ ''^[0-9]{13}$''::text) AND (branch_type = ANY (ARRAY[''head_office''::text, ''branch''::text])) AND (branch_code IS NOT NULL))) IS TRUE))))"
      },
      {
        "name": "finance_customer_tax_profiles_client_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_customer_tax_profiles_identity_evidence_check",
        "type": "c",
        "definition": "CHECK ((length(identity_evidence) <= 2000))"
      },
      {
        "name": "finance_customer_tax_profiles_identity_snapshot_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(identity_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_customer_tax_profiles_pkey",
        "type": "p",
        "definition": "PRIMARY KEY (client_id)"
      },
      {
        "name": "finance_customer_tax_profiles_updated_by_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (updated_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_customer_tax_profiles_verified_by_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (verified_by_user_id) REFERENCES user_profiles(id)"
      }
    ],
    "indexes": [
      {
        "name": "finance_customer_tax_profiles_pkey",
        "definition": "CREATE UNIQUE INDEX finance_customer_tax_profiles_pkey ON public.finance_customer_tax_profiles USING btree (client_id)"
      }
    ]
  }
]
'::jsonb)), actual_catalog as (select c.relname as name,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid)) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n') as constraints,
 (select jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(x.indexrelid)) order by i.relname) from pg_index x join pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid) as indexes
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('finance_customer_tax_profiles','finance_customer_tax_profile_audit_events') order by c.relname),
 catalog_differences as (select coalesce(e.value->>'name',a.name) as table_name,e.value as expected,to_jsonb(a) as actual from expected_catalog e full join actual_catalog a on a.name=e.value->>'name' where e.value is distinct from to_jsonb(a)),
 checks(name,passed) as (select * from protected_checks union all select * from (values
 ('exact_new_and_preserved_functions',(select bool_and(oid is not null and exact_body and prosecdef=security_definer and provolatile::text=volatility and proconfig @> array['search_path=public']) from function_facts)),
 ('new_private_and_rpc_privileges',(select bool_and(not anon_execute and authenticated_execute=callable) from function_facts where signature in ('public.protect_customer_tax_profile_audit()','public.finance_customer_tax_identity(uuid)','public.get_finance_customer_tax_profile(uuid)','public.save_finance_customer_tax_profile(uuid,boolean,text,text,text,boolean,jsonb,timestamptz)','public.build_finance_document_tax_source(uuid)','public.finance_tax_invoice_draft_snapshot(jsonb,jsonb,date)'))),
 ('private_predecessors',not has_function_privilege('authenticated','public.document_tax_source_pre042(uuid)','EXECUTE') and not has_function_privilege('authenticated','public.document_tax_snapshot_pre042(jsonb,jsonb,date)','EXECUTE') and not has_function_privilege('anon','public.document_tax_source_pre042(uuid)','EXECUTE') and not has_function_privilege('anon','public.document_tax_snapshot_pre042(jsonb,jsonb,date)','EXECUTE')),
 ('exact_catalog',not exists(select 1 from catalog_differences)),
 ('rls_no_browser_mutation',(select count(*)=2 and bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE') and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) from pg_class where oid in ('public.finance_customer_tax_profiles'::regclass,'public.finance_customer_tax_profile_audit_events'::regclass))),
 ('read_policies_only',(select count(*)=2 and bool_and(cmd='SELECT' and roles=array['authenticated']::name[] and qual='current_user_can_view_finance_tax_invoices()' and with_check is null) from pg_policies where schemaname='public' and tablename in ('finance_customer_tax_profiles','finance_customer_tax_profile_audit_events'))),
 ('audit_immutable',(select count(*)=1 and bool_and(tgtype=27 and tgenabled='O' and tgfoid='public.protect_customer_tax_profile_audit()'::regprocedure) from pg_trigger where tgrelid='public.finance_customer_tax_profile_audit_events'::regclass and not tgisinternal)),
 ('new_profile_zero_state',not exists(select 1 from public.finance_customer_tax_profiles) and not exists(select 1 from public.finance_customer_tax_profile_audit_events)),
 ('dry_run_protected_evidence_unchanged',nullif(current_setting('vp.tax042_before',true),'') is null or current_setting('vp.tax042_before',true)=(select md5(evidence::text) from protected_evidence))
 ) x(name,passed)) select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as customer_tax_identity_verification_pass,
 (select md5(evidence::text) from protected_evidence) as protected_evidence_hash,
 (select coalesce(jsonb_agg(to_jsonb(c)),'[]') from client_columns c) as client_columns,
 (select coalesce(jsonb_agg(column_name),'[]') from competing_fields) as competing_client_fields,
 (select coalesce(jsonb_agg(table_name),'[]') from competing_profiles) as competing_profile_tables,
 (select coalesce(jsonb_agg(to_jsonb(f)),'[]') from function_facts f where oid is null or exact_body is distinct from true or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or not coalesce(proconfig @> array['search_path=public'],false)) as function_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) as catalog_differences,
 jsonb_build_object('finance_customer_tax_profiles',(select count(*) from public.finance_customer_tax_profiles),'finance_customer_tax_profile_audit_events',(select count(*) from public.finance_customer_tax_profile_audit_events)) as new_rows;
