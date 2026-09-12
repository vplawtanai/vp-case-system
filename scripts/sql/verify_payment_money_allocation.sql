-- ONE SELECT-only statement / ONE result row. No application RPC calls.
-- Stop on failed_checks. Compare upstream_evidence_hashes before and after apply.
with expected_functions(signature,hash,security_definer,volatility) as (values ('public.current_user_can_view_finance_payments()','ee655ca91809471d32a79909a8178f66',true,'v'),
('public.confirm_finance_payment(uuid,boolean)','deae5aa01dc48eb0faa64afa82bca8b7',true,'v'),
('public.reverse_finance_payment(uuid,text)','ef2a35fb3570b503f7447614885b81b2',true,'v'),
('public.void_finance_invoice(uuid,text,boolean)','d9055e3d53fbf60cc1554726cc1a5156',true,'v'),
('public.correct_erroneous_finance_payment(uuid,text,boolean)','fe65b1aa1657e9c8e093a0b5378b82a2',true,'v'),
('public.reallocate_finance_payment_allocation(uuid,uuid,uuid,numeric,numeric,text,boolean,uuid)','12bf09cf010f9516d5fcec9055473cd3',true,'v'),
('public.assert_finance_payment_structured_wht(uuid)','52cd73f8b3ba91ff9b297041129cc391',true,'v'),
('public.issue_finance_receipt(uuid,boolean,jsonb)','04ecfe81a3c72f36587f2e7ec06f0a35',true,'v'),
('public.issue_finance_tax_invoice(uuid,jsonb,boolean,boolean)','db1ea3f2895a8eedb121493d8af86955',true,'v'),
('public.finance_vat_treatment(jsonb,boolean,numeric)','d56bba89766a1ee28411a6854f8c573c',false,'i'),
('public.finance_document_invoice_lines(uuid)','5249d7c4e960e43a5ab134152aae2bb9',true,'s'),
('public.issue_finance_combined_document(uuid,jsonb,boolean,boolean,boolean,boolean)','2207c2d70f98db33a2f18eabe05ca624',true,'v'),
('public.issue_finance_tax_correction(uuid,jsonb,boolean,boolean)','b411350ebe4282d5523abb0716fb4087',true,'v'),
('public.money_allocation_admin()','b6c3626891400d6817c575526fedd1c0',true,'s'),
('public.money_allocation_source(uuid)','8d5731f472b38ccc8819bf895c7980ab',true,'s'),
('public.money_allocation_decisions(jsonb,jsonb,boolean)','cd4387f642a85fa521e93daef15ab206',false,'i'),
('public.money_allocation_immutable()','74c569bf901aea6b2a38e62113e6c68a',false,'v'),
('public.money_allocation_lock(uuid)','c77b913cc89847591d3e43837af11ce9',true,'v'),
('public.save_finance_money_allocation(uuid,uuid,integer,jsonb,jsonb,text)','6c2fa19bcee3e7a58c113f13f91ae1c6',true,'v'),
('public.transition_finance_money_allocation(uuid,integer,jsonb,text,boolean,text)','dc4eebfb5f3626aa1068d7ab22adc937',true,'v'),
('public.guard_money_allocation_source()','5b3756000c2780512c22c8ed0beef83b',true,'v'),
('public.validate_money_allocation()','07f745780468339d6e4fb68008c67885',true,'v'),
('public.get_finance_money_allocation(uuid)','7209f17b3b694ef00393b436f2d68ca0',true,'s')),
 function_facts as(select e.*,p.oid,md5(p.prosrc) as actual_hash,p.prosecdef,p.provolatile,p.proconfig from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)),
 function_differences as(select * from function_facts where oid is null or actual_hash is distinct from hash or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or not coalesce(proconfig @> array['search_path=public'],false)),protected as(select jsonb_build_object('finance_payments',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payments r),'finance_payment_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_invoice_allocations r),'finance_payment_allocation_reallocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_allocation_reallocations r),'finance_payment_wht_components',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_wht_components r),'finance_payment_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_audit_events r),'finance_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoices r),'finance_cash_transactions',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_cash_transactions r),'finance_account_opening_balances',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_account_opening_balances r),'finance_company_ledger',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_company_ledger r),'finance_compensation_batches',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_compensation_batches r),'finance_receipts',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_receipts r),'finance_tax_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_invoices r),'finance_combined_documents',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_combined_documents r),'finance_document_counters',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_document_counters r)) as evidence),
 expected_catalog as(select value from jsonb_array_elements('[
  {
    "name": "finance_payment_money_allocation_audit",
    "rls": true,
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "not_null": true
      },
      {
        "name": "allocation_id",
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
        "name": "actor_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "not_null": true
      },
      {
        "name": "evidence_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      }
    ],
    "constraints": [
      {
        "name": "finance_payment_money_allocation_audit_actor_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (actor_id) REFERENCES user_profiles(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_payment_money_allocation_audit_allocation_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (allocation_id) REFERENCES finance_payment_money_allocations(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_payment_money_allocation_audit_event_type_check",
        "type": "c",
        "definition": "CHECK ((event_type = ANY (ARRAY[''created''::text, ''saved''::text, ''reviewed''::text, ''finalized''::text, ''superseded''::text])))"
      },
      {
        "name": "finance_payment_money_allocation_audit_evidence_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(evidence_json) = ''object''::text))"
      },
      {
        "name": "finance_payment_money_allocation_audit_pkey",
        "type": "p",
        "definition": "PRIMARY KEY (id)"
      }
    ],
    "indexes": [
      {
        "name": "finance_payment_money_allocation_audit_pkey",
        "definition": "CREATE UNIQUE INDEX finance_payment_money_allocation_audit_pkey ON public.finance_payment_money_allocation_audit USING btree (id)"
      },
      {
        "name": "money_allocation_audit_parent",
        "definition": "CREATE INDEX money_allocation_audit_parent ON public.finance_payment_money_allocation_audit USING btree (allocation_id, created_at, id)"
      }
    ],
    "policies": [
      {
        "name": "money_allocation_audit_read",
        "check": null,
        "roles": [
          "authenticated"
        ],
        "using": "current_user_can_view_finance_payments()",
        "command": "SELECT"
      }
    ],
    "triggers": [
      {
        "name": "money_allocation_audit_immutable",
        "enabled": "O",
        "definition": "CREATE TRIGGER money_allocation_audit_immutable BEFORE DELETE OR UPDATE ON public.finance_payment_money_allocation_audit FOR EACH ROW EXECUTE FUNCTION money_allocation_immutable()"
      }
    ]
  },
  {
    "name": "finance_payment_money_allocations",
    "rls": true,
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "not_null": true
      },
      {
        "name": "payment_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "revision",
        "type": "integer",
        "default": null,
        "not_null": true
      },
      {
        "name": "previous_id",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "status",
        "type": "text",
        "default": "''draft''::text",
        "not_null": true
      },
      {
        "name": "version",
        "type": "integer",
        "default": "1",
        "not_null": true
      },
      {
        "name": "source_snapshot_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      },
      {
        "name": "decisions_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      },
      {
        "name": "note",
        "type": "text",
        "default": "''''::text",
        "not_null": true
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "not_null": true
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "not_null": true
      },
      {
        "name": "reviewed_at",
        "type": "timestamp with time zone",
        "default": null,
        "not_null": false
      },
      {
        "name": "reviewed_by",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "finalized_at",
        "type": "timestamp with time zone",
        "default": null,
        "not_null": false
      },
      {
        "name": "finalized_by",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "superseded_at",
        "type": "timestamp with time zone",
        "default": null,
        "not_null": false
      },
      {
        "name": "superseded_by",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "supersede_reason",
        "type": "text",
        "default": null,
        "not_null": false
      }
    ],
    "constraints": [
      {
        "name": "finance_payment_money_allocations_check",
        "type": "c",
        "definition": "CHECK (((reviewed_at IS NULL) = (reviewed_by IS NULL)))"
      },
      {
        "name": "finance_payment_money_allocations_check1",
        "type": "c",
        "definition": "CHECK (((finalized_at IS NULL) = (finalized_by IS NULL)))"
      },
      {
        "name": "finance_payment_money_allocations_check2",
        "type": "c",
        "definition": "CHECK (((status <> ALL (ARRAY[''reviewed''::text, ''finalized''::text])) OR (reviewed_at IS NOT NULL)))"
      },
      {
        "name": "finance_payment_money_allocations_check3",
        "type": "c",
        "definition": "CHECK ((((status = ''finalized''::text) OR ((status = ''superseded''::text) AND (finalized_at IS NOT NULL))) = (finalized_at IS NOT NULL)))"
      },
      {
        "name": "finance_payment_money_allocations_check4",
        "type": "c",
        "definition": "CHECK (((status = ''superseded''::text) = ((superseded_at IS NOT NULL) AND (superseded_by IS NOT NULL) AND (NULLIF(btrim(supersede_reason), ''''::text) IS NOT NULL))))"
      },
      {
        "name": "finance_payment_money_allocations_created_by_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (created_by) REFERENCES user_profiles(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_payment_money_allocations_decisions_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(decisions_json) = ''array''::text))"
      },
      {
        "name": "finance_payment_money_allocations_finalized_by_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (finalized_by) REFERENCES user_profiles(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_payment_money_allocations_note_check",
        "type": "c",
        "definition": "CHECK ((length(note) <= 2000))"
      },
      {
        "name": "finance_payment_money_allocations_payment_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (payment_id) REFERENCES finance_payments(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_payment_money_allocations_payment_id_revision_key",
        "type": "u",
        "definition": "UNIQUE (payment_id, revision)"
      },
      {
        "name": "finance_payment_money_allocations_pkey",
        "type": "p",
        "definition": "PRIMARY KEY (id)"
      },
      {
        "name": "finance_payment_money_allocations_previous_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (previous_id) REFERENCES finance_payment_money_allocations(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_payment_money_allocations_previous_id_key",
        "type": "u",
        "definition": "UNIQUE (previous_id)"
      },
      {
        "name": "finance_payment_money_allocations_reviewed_by_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (reviewed_by) REFERENCES user_profiles(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_payment_money_allocations_revision_check",
        "type": "c",
        "definition": "CHECK ((revision > 0))"
      },
      {
        "name": "finance_payment_money_allocations_source_snapshot_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(source_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_payment_money_allocations_status_check",
        "type": "c",
        "definition": "CHECK ((status = ANY (ARRAY[''draft''::text, ''reviewed''::text, ''finalized''::text, ''superseded''::text])))"
      },
      {
        "name": "finance_payment_money_allocations_supersede_reason_check",
        "type": "c",
        "definition": "CHECK ((length(supersede_reason) <= 2000))"
      },
      {
        "name": "finance_payment_money_allocations_superseded_by_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (superseded_by) REFERENCES user_profiles(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_payment_money_allocations_version_check",
        "type": "c",
        "definition": "CHECK ((version > 0))"
      },
      {
        "name": "money_allocation_integrity",
        "type": "t",
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      }
    ],
    "indexes": [
      {
        "name": "finance_payment_money_allocations_payment_id_revision_key",
        "definition": "CREATE UNIQUE INDEX finance_payment_money_allocations_payment_id_revision_key ON public.finance_payment_money_allocations USING btree (payment_id, revision)"
      },
      {
        "name": "finance_payment_money_allocations_pkey",
        "definition": "CREATE UNIQUE INDEX finance_payment_money_allocations_pkey ON public.finance_payment_money_allocations USING btree (id)"
      },
      {
        "name": "finance_payment_money_allocations_previous_id_key",
        "definition": "CREATE UNIQUE INDEX finance_payment_money_allocations_previous_id_key ON public.finance_payment_money_allocations USING btree (previous_id)"
      },
      {
        "name": "money_allocation_current_payment",
        "definition": "CREATE UNIQUE INDEX money_allocation_current_payment ON public.finance_payment_money_allocations USING btree (payment_id) WHERE (status <> ''superseded''::text)"
      }
    ],
    "policies": [
      {
        "name": "money_allocation_read",
        "check": null,
        "roles": [
          "authenticated"
        ],
        "using": "current_user_can_view_finance_payments()",
        "command": "SELECT"
      }
    ],
    "triggers": [
      {
        "name": "money_allocation_immutable",
        "enabled": "O",
        "definition": "CREATE TRIGGER money_allocation_immutable BEFORE DELETE OR UPDATE ON public.finance_payment_money_allocations FOR EACH ROW EXECUTE FUNCTION money_allocation_immutable()"
      },
      {
        "name": "money_allocation_integrity",
        "enabled": "O",
        "definition": "CREATE CONSTRAINT TRIGGER money_allocation_integrity AFTER INSERT OR UPDATE ON public.finance_payment_money_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_money_allocation()"
      }
    ]
  }
]
'::jsonb)),actual_catalog as(select c.relname as name,c.relrowsecurity as rls,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid)) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n') as constraints,
 (select jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(x.indexrelid)) order by i.relname) from pg_index x join pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid) as indexes,
 (select jsonb_agg(jsonb_build_object('name',p.policyname,'command',p.cmd,'roles',p.roles,'using',p.qual,'check',p.with_check) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
 (select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as triggers
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('finance_payment_money_allocations','finance_payment_money_allocation_audit') order by c.relname),
 catalog_differences as(select coalesce(e.value->>'name',a.name) as table_name,e.value as expected,to_jsonb(a) as actual from expected_catalog e full join actual_catalog a on a.name=e.value->>'name' where e.value is distinct from to_jsonb(a)),
 checks(name,passed) as(values
 ('exact_new_catalog',not exists(select 1 from catalog_differences)),
 ('exact_new_and_preserved_functions',not exists(select 1 from function_differences)),
 ('zero_state',not exists(select 1 from public.finance_payment_money_allocations) and not exists(select 1 from public.finance_payment_money_allocation_audit)),
 ('no_cutover',not exists(select 1 from public.finance_account_opening_balances)),
 ('source_guards',(select count(*)=1 and bool_and(tgenabled='O' and tgtype=case when tgrelid in ('public.finance_payment_allocation_reallocations'::regclass) then 7 when tgrelid in ('public.finance_tax_document_corrections'::regclass) then 23 when tgrelid in ('public.finance_payments'::regclass,'public.finance_invoices'::regclass) then 27 else 31 end) from pg_trigger where tgrelid='public.finance_payments'::regclass and tgfoid='public.guard_money_allocation_source()'::regprocedure) and (select count(*)=1 and bool_and(tgenabled='O' and tgtype=case when tgrelid in ('public.finance_payment_allocation_reallocations'::regclass) then 7 when tgrelid in ('public.finance_tax_document_corrections'::regclass) then 23 when tgrelid in ('public.finance_payments'::regclass,'public.finance_invoices'::regclass) then 27 else 31 end) from pg_trigger where tgrelid='public.finance_invoices'::regclass and tgfoid='public.guard_money_allocation_source()'::regprocedure) and (select count(*)=1 and bool_and(tgenabled='O' and tgtype=case when tgrelid in ('public.finance_payment_allocation_reallocations'::regclass) then 7 when tgrelid in ('public.finance_tax_document_corrections'::regclass) then 23 when tgrelid in ('public.finance_payments'::regclass,'public.finance_invoices'::regclass) then 27 else 31 end) from pg_trigger where tgrelid='public.finance_invoice_items'::regclass and tgfoid='public.guard_money_allocation_source()'::regprocedure) and (select count(*)=1 and bool_and(tgenabled='O' and tgtype=case when tgrelid in ('public.finance_payment_allocation_reallocations'::regclass) then 7 when tgrelid in ('public.finance_tax_document_corrections'::regclass) then 23 when tgrelid in ('public.finance_payments'::regclass,'public.finance_invoices'::regclass) then 27 else 31 end) from pg_trigger where tgrelid='public.finance_payment_allocation_reallocations'::regclass and tgfoid='public.guard_money_allocation_source()'::regprocedure) and (select count(*)=1 and bool_and(tgenabled='O' and tgtype=case when tgrelid in ('public.finance_payment_allocation_reallocations'::regclass) then 7 when tgrelid in ('public.finance_tax_document_corrections'::regclass) then 23 when tgrelid in ('public.finance_payments'::regclass,'public.finance_invoices'::regclass) then 27 else 31 end) from pg_trigger where tgrelid='public.finance_payment_invoice_allocations'::regclass and tgfoid='public.guard_money_allocation_source()'::regprocedure) and (select count(*)=1 and bool_and(tgenabled='O' and tgtype=case when tgrelid in ('public.finance_payment_allocation_reallocations'::regclass) then 7 when tgrelid in ('public.finance_tax_document_corrections'::regclass) then 23 when tgrelid in ('public.finance_payments'::regclass,'public.finance_invoices'::regclass) then 27 else 31 end) from pg_trigger where tgrelid='public.finance_payment_wht_components'::regclass and tgfoid='public.guard_money_allocation_source()'::regprocedure) and (select count(*)=1 and bool_and(tgenabled='O' and tgtype=case when tgrelid in ('public.finance_payment_allocation_reallocations'::regclass) then 7 when tgrelid in ('public.finance_tax_document_corrections'::regclass) then 23 when tgrelid in ('public.finance_payments'::regclass,'public.finance_invoices'::regclass) then 27 else 31 end) from pg_trigger where tgrelid='public.finance_tax_document_corrections'::regclass and tgfoid='public.guard_money_allocation_source()'::regprocedure)),
 ('private_and_rpc_privileges',(has_function_privilege('authenticated','public.money_allocation_admin()','EXECUTE')=false and not has_function_privilege('anon','public.money_allocation_admin()','EXECUTE')) and (has_function_privilege('authenticated','public.money_allocation_source(uuid)','EXECUTE')=false and not has_function_privilege('anon','public.money_allocation_source(uuid)','EXECUTE')) and (has_function_privilege('authenticated','public.money_allocation_decisions(jsonb,jsonb,boolean)','EXECUTE')=false and not has_function_privilege('anon','public.money_allocation_decisions(jsonb,jsonb,boolean)','EXECUTE')) and (has_function_privilege('authenticated','public.money_allocation_immutable()','EXECUTE')=false and not has_function_privilege('anon','public.money_allocation_immutable()','EXECUTE')) and (has_function_privilege('authenticated','public.money_allocation_lock(uuid)','EXECUTE')=false and not has_function_privilege('anon','public.money_allocation_lock(uuid)','EXECUTE')) and (has_function_privilege('authenticated','public.save_finance_money_allocation(uuid,uuid,integer,jsonb,jsonb,text)','EXECUTE')=true and not has_function_privilege('anon','public.save_finance_money_allocation(uuid,uuid,integer,jsonb,jsonb,text)','EXECUTE')) and (has_function_privilege('authenticated','public.transition_finance_money_allocation(uuid,integer,jsonb,text,boolean,text)','EXECUTE')=true and not has_function_privilege('anon','public.transition_finance_money_allocation(uuid,integer,jsonb,text,boolean,text)','EXECUTE')) and (has_function_privilege('authenticated','public.guard_money_allocation_source()','EXECUTE')=false and not has_function_privilege('anon','public.guard_money_allocation_source()','EXECUTE')) and (has_function_privilege('authenticated','public.validate_money_allocation()','EXECUTE')=false and not has_function_privilege('anon','public.validate_money_allocation()','EXECUTE')) and (has_function_privilege('authenticated','public.get_finance_money_allocation(uuid)','EXECUTE')=true and not has_function_privilege('anon','public.get_finance_money_allocation(uuid)','EXECUTE'))),
 ('browser_mutation_blocked',(select count(*)=2 and bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE') and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) from pg_class where oid in ('public.finance_payment_money_allocations'::regclass,'public.finance_payment_money_allocation_audit'::regclass))),
 ('dry_run_upstream_unchanged',nullif(current_setting('vp.money044_before',true),'') is null or current_setting('vp.money044_before',true)=(select evidence::text from protected)))
 select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as payment_money_allocation_foundation_verification_pass,
 (select coalesce(jsonb_agg(to_jsonb(f)),'[]') from function_differences f) as function_differences,
 (select evidence from protected) as upstream_evidence_hashes,
 current_setting('server_version_num')::integer as catalog_server_version_num,(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) as catalog_differences,
 jsonb_build_object('finance_payment_money_allocations',(select count(*) from public.finance_payment_money_allocations),'finance_payment_money_allocation_audit',(select count(*) from public.finance_payment_money_allocation_audit)) as new_rows;
