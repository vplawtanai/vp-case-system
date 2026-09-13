-- ONE SELECT-only statement / ONE result row. No application RPC calls.
-- Stop on failed_checks. Compare every upstream_evidence_hashes entry before and after apply, including both 044 tables.
-- Legacy row counts are not readiness gates; only opening cutover must be absent.
with expected_functions(signature,hash,security_definer,volatility,is_new,return_type,language,argument_names,default_count,is_strict,parallel,leakproof) as (values ('public.current_user_can_view_finance_payments()','ee655ca91809471d32a79909a8178f66',true,'v',false,'boolean','sql',null::text[],0,false,'u',false),
('public.confirm_finance_payment(uuid,boolean)','deae5aa01dc48eb0faa64afa82bca8b7',true,'v',false,'uuid','plpgsql',array['p_payment_id','p_confirmation_acknowledged']::text[],0,false,'u',false),
('public.reverse_finance_payment(uuid,text)','ef2a35fb3570b503f7447614885b81b2',true,'v',false,'uuid','plpgsql',array['p_payment_id','p_reason']::text[],0,false,'u',false),
('public.void_finance_invoice(uuid,text,boolean)','d9055e3d53fbf60cc1554726cc1a5156',true,'v',false,'uuid','plpgsql',array['p_invoice_id','p_reason','p_acknowledged']::text[],0,false,'u',false),
('public.correct_erroneous_finance_payment(uuid,text,boolean)','fe65b1aa1657e9c8e093a0b5378b82a2',true,'v',false,'uuid','plpgsql',array['p_payment_id','p_reason','p_acknowledged']::text[],0,false,'u',false),
('public.reallocate_finance_payment_allocation(uuid,uuid,uuid,numeric,numeric,text,boolean,uuid)','12bf09cf010f9516d5fcec9055473cd3',true,'v',false,'uuid','plpgsql',array['p_payment_id','p_source_invoice_id','p_target_invoice_id','p_cash_amount','p_wht_amount','p_reason','p_acknowledged','p_request_id']::text[],0,false,'u',false),
('public.assert_finance_payment_structured_wht(uuid)','52cd73f8b3ba91ff9b297041129cc391',true,'v',false,'void','plpgsql',array['p_payment_id']::text[],0,false,'u',false),
('public.issue_finance_receipt(uuid,boolean,jsonb)','04ecfe81a3c72f36587f2e7ec06f0a35',true,'v',false,'uuid','plpgsql',array['p_receipt_id','p_acknowledged','p_reviewed_snapshot_json']::text[],1,false,'u',false),
('public.issue_finance_tax_invoice(uuid,jsonb,boolean,boolean)','db1ea3f2895a8eedb121493d8af86955',true,'v',false,'uuid','plpgsql',array['p_tax_invoice_id','p_reviewed_snapshot_json','p_acknowledged','p_delayed_issue_acknowledged']::text[],0,false,'u',false),
('public.finance_vat_treatment(jsonb,boolean,numeric)','d56bba89766a1ee28411a6854f8c573c',false,'i',false,'jsonb','plpgsql',array['p_evidence','p_applicable','p_rate']::text[],0,false,'u',false),
('public.finance_document_invoice_lines(uuid)','5249d7c4e960e43a5ab134152aae2bb9',true,'s',false,'jsonb','plpgsql',array['p_invoice_id']::text[],0,false,'u',false),
('public.issue_finance_combined_document(uuid,jsonb,boolean,boolean,boolean,boolean)','2207c2d70f98db33a2f18eabe05ca624',true,'v',false,'uuid','plpgsql',array['p_combined_id','p_reviewed_snapshot_json','p_acknowledged','p_delayed_issue_acknowledged','p_external_receipt_checked','p_external_tax_checked']::text[],0,false,'u',false),
('public.issue_finance_tax_correction(uuid,jsonb,boolean,boolean)','b411350ebe4282d5523abb0716fb4087',true,'v',false,'uuid','plpgsql',array['p_id','p_reviewed_snapshot_json','p_acknowledged','p_external_number_checked']::text[],0,false,'u',false),
('public.money_allocation_admin()','b6c3626891400d6817c575526fedd1c0',true,'s',false,'boolean','sql',null::text[],0,false,'u',false),
('public.money_allocation_source(uuid)','8d5731f472b38ccc8819bf895c7980ab',true,'s',false,'jsonb','plpgsql',array['p_payment_id']::text[],0,false,'u',false),
('public.money_allocation_decisions(jsonb,jsonb,boolean)','cd4387f642a85fa521e93daef15ab206',false,'i',false,'jsonb','plpgsql',array['p_source','p_choices','p_complete']::text[],0,false,'u',false),
('public.money_allocation_immutable()','74c569bf901aea6b2a38e62113e6c68a',false,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.money_allocation_lock(uuid)','c77b913cc89847591d3e43837af11ce9',true,'v',false,'void','plpgsql',array['p_payment_id']::text[],0,false,'u',false),
('public.save_finance_money_allocation(uuid,uuid,integer,jsonb,jsonb,text)','6c2fa19bcee3e7a58c113f13f91ae1c6',true,'v',false,'uuid','plpgsql',array['p_payment_id','p_expected_id','p_expected_version','p_source','p_choices','p_note']::text[],0,false,'u',false),
('public.transition_finance_money_allocation(uuid,integer,jsonb,text,boolean,text)','dc4eebfb5f3626aa1068d7ab22adc937',true,'v',false,'uuid','plpgsql',array['p_id','p_expected_version','p_source','p_action','p_acknowledged','p_reason']::text[],0,false,'u',false),
('public.guard_money_allocation_source()','5b3756000c2780512c22c8ed0beef83b',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.validate_money_allocation()','07f745780468339d6e4fb68008c67885',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.get_finance_money_allocation(uuid)','7209f17b3b694ef00393b436f2d68ca0',true,'s',false,'jsonb','plpgsql',array['p_payment_id']::text[],0,false,'u',false)),
 function_facts as(select e.*,p.oid,md5(p.prosrc) as actual_hash,p.prosecdef,p.provolatile,p.proconfig,p.prokind,p.prorettype,p.proretset,l.lanname,p.proargnames,p.pronargdefaults,p.proisstrict,p.proparallel,p.proleakproof from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature) left join pg_language l on l.oid=p.prolang),
 function_differences as(select * from function_facts where oid is null or actual_hash is distinct from hash or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or prokind<>'f' or proconfig is distinct from array['search_path=public']
 or prorettype is distinct from to_regtype(return_type) or proretset or lanname is distinct from language or proargnames is distinct from argument_names or pronargdefaults is distinct from default_count or proisstrict is distinct from is_strict or proparallel::text is distinct from parallel or proleakproof is distinct from leakproof),protected as(select jsonb_build_object('finance_payment_money_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_money_allocations r),
'finance_payment_money_allocation_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_money_allocation_audit r),
'finance_payments',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payments r),
'finance_payment_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_invoice_allocations r),
'finance_payment_effective_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_effective_invoice_allocations r),
'finance_payment_allocation_reallocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_allocation_reallocations r),
'finance_payment_wht_components',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_wht_components r),
'finance_payment_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_audit_events r),
'finance_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoices r),
'finance_invoice_items',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoice_items r),
'finance_invoice_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoice_audit_events r),
'finance_invoice_settlement_summary',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoice_settlement_summary r),
'finance_cash_transactions',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_cash_transactions r),
'finance_account_opening_balances',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_account_opening_balances r),
'finance_cash_transaction_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_cash_transaction_audit_events r),
'finance_company_ledger',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_company_ledger r),
'finance_compensation_batches',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_compensation_batches r),
'finance_compensation_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_compensation_allocations r),
'finance_receipts',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_receipts r),
'finance_receipt_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_receipt_invoice_allocations r),
'finance_receipt_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_receipt_audit_events r),
'finance_tax_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_invoices r),
'finance_tax_invoice_items',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_invoice_items r),
'finance_tax_point_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_point_events r),
'finance_combined_documents',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_combined_documents r),
'finance_combined_document_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_combined_document_audit_events r),
'finance_tax_document_corrections',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_document_corrections r),
'finance_tax_correction_lines',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_correction_lines r),
'finance_tax_correction_documents',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_correction_documents r),
'finance_tax_correction_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_correction_audit_events r),
'finance_document_counters',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_document_counters r)) as evidence),
 expected_money_catalog as(select value from jsonb_array_elements('[
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
'::jsonb)),actual_money_catalog as(select c.relname as name,c.relrowsecurity as rls,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid)) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n') as constraints,
 (select jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(x.indexrelid)) order by i.relname) from pg_index x join pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid) as indexes,
 (select jsonb_agg(jsonb_build_object('name',p.policyname,'command',p.cmd,'roles',p.roles,'using',p.qual,'check',p.with_check) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
 (select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal and t.tgfoid is distinct from to_regprocedure('public.guard_vp_distribution_source()')) as triggers
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('finance_payment_money_allocations','finance_payment_money_allocation_audit') order by c.relname),
 money_catalog_differences as(select coalesce(e.value->>'name',a.name) as table_name,e.value as expected,to_jsonb(a) as actual from expected_money_catalog e full join actual_money_catalog a on a.name=e.value->>'name' where e.value is distinct from to_jsonb(a)),
 money_expected_guards(table_name,trigger_name,trigger_type) as (values ('finance_payments','money_allocation_payment_guard',27),
('finance_invoices','money_allocation_invoice_guard',27),
('finance_invoice_items','money_allocation_item_guard',31),
('finance_payment_allocation_reallocations','money_allocation_reallocation_guard',7),
('finance_payment_invoice_allocations','money_allocation_raw_guard',31),
('finance_payment_wht_components','money_allocation_wht_guard',31),
('finance_tax_document_corrections','money_allocation_correction_guard',23)),
 money_actual_guards as(select n.nspname as schema_name,c.relname as table_name,t.tgname as trigger_name,t.tgtype as trigger_type,
 t.tgenabled,t.tgfoid,t.tgisinternal,t.tgdeferrable,t.tginitdeferred,t.tgnargs,t.tgattr::text as columns,t.tgqual,pg_get_triggerdef(t.oid) as definition
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where t.tgfoid=to_regprocedure('public.guard_money_allocation_source()') or (n.nspname='public' and t.tgname in ('money_allocation_payment_guard','money_allocation_invoice_guard','money_allocation_item_guard','money_allocation_reallocation_guard','money_allocation_raw_guard','money_allocation_wht_guard','money_allocation_correction_guard'))),
 money_guard_differences as(select e.table_name as expected_table,e.trigger_name as expected_name,e.trigger_type as expected_type,to_jsonb(a) as actual
 from money_expected_guards e full join money_actual_guards a on a.schema_name='public' and a.table_name=e.table_name and a.trigger_name=e.trigger_name
 where e.table_name is null or a.table_name is null or a.trigger_type is distinct from e.trigger_type or a.tgenabled<>'O'
 or a.tgfoid is distinct from to_regprocedure('public.guard_money_allocation_source()') or a.tgisinternal or a.tgdeferrable or a.tginitdeferred or a.tgnargs<>0 or a.columns<>'' or a.tgqual is not null),
 source_contracts(table_name,kind) as(values ('finance_payment_money_allocations','r'),('finance_payment_money_allocation_audit','r'),('finance_payments','r'),('finance_payment_invoice_allocations','r'),('finance_payment_effective_invoice_allocations','v'),('finance_payment_allocation_reallocations','r'),('finance_payment_wht_components','r'),('finance_payment_audit_events','r'),('finance_invoices','r'),('finance_invoice_items','r'),('finance_invoice_audit_events','r'),('finance_invoice_settlement_summary','v'),('finance_cash_transactions','r'),('finance_account_opening_balances','r'),('finance_cash_transaction_audit_events','r'),('finance_company_ledger','r'),('finance_compensation_batches','r'),('finance_compensation_allocations','r'),('finance_receipts','r'),('finance_receipt_invoice_allocations','r'),('finance_receipt_audit_events','r'),('finance_tax_invoices','r'),('finance_tax_invoice_items','r'),('finance_tax_point_events','r'),('finance_combined_documents','r'),('finance_combined_document_audit_events','r'),('finance_tax_document_corrections','r'),('finance_tax_correction_lines','r'),('finance_tax_correction_documents','r'),('finance_tax_correction_audit_events','r'),('finance_document_counters','r')),
 source_columns(table_name,column_name,data_type) as(values ('finance_payments','id','uuid'),('finance_payments','status','text'),('finance_payments','cash_amount','numeric'),('finance_payments','wht_amount','numeric'),('finance_payments','settlement_amount','numeric'),('finance_invoices','id','uuid'),('finance_invoices','document_status','text'),('finance_invoices','issued_snapshot_json','jsonb'),('finance_invoices','amount_before_vat','numeric'),('finance_invoices','vat_amount','numeric'),('finance_invoices','total_amount','numeric'),('finance_invoice_items','id','uuid'),('finance_invoice_items','invoice_id','uuid'),('finance_payment_effective_invoice_allocations','payment_id','uuid'),('finance_payment_effective_invoice_allocations','invoice_id','uuid'),('finance_payment_effective_invoice_allocations','effective_cash_allocated','numeric'),('finance_payment_effective_invoice_allocations','effective_wht_credit_allocated','numeric'),('finance_payment_effective_invoice_allocations','effective_settlement_total','numeric'),('finance_payment_wht_components','payment_id','uuid'),('finance_payment_wht_components','invoice_id','uuid'),('finance_payment_wht_components','invoice_item_id','uuid'),('finance_payment_wht_components','basis_snapshot_json','jsonb'),('finance_payment_wht_components','calculated_wht_amount','numeric'),('finance_payment_money_allocations','id','uuid'),('finance_payment_money_allocations','payment_id','uuid'),('finance_payment_money_allocations','status','text'),('finance_payment_money_allocations','version','integer'),('finance_payment_money_allocations','source_snapshot_json','jsonb'),('finance_payment_money_allocations','decisions_json','jsonb'),('finance_payment_money_allocation_audit','allocation_id','uuid'),('finance_payment_money_allocation_audit','evidence_json','jsonb'),('finance_tax_document_corrections','original_tax_invoice_id','uuid'),('finance_tax_document_corrections','status','text'),('finance_tax_document_corrections','correction_mode','text')),
 source_contract_differences as(select s.table_name,null::text as column_name from source_contracts s left join pg_class c on c.oid=to_regclass('public.'||s.table_name) where c.oid is null or c.relkind::text<>s.kind
 union all select s.table_name,s.column_name from source_columns s left join pg_attribute a on a.attrelid=to_regclass('public.'||s.table_name) and a.attname=s.column_name and a.attnum>0 and not a.attisdropped where a.attname is null or a.atttypid is distinct from to_regtype(s.data_type)),
 competing_relations as(select c.relname from pg_class c where c.relnamespace='public'::regnamespace and c.relname ~ '^(finance_vp_revenue_distribution|vp_distribution_)'),
 competing_functions as(select p.oid::regprocedure::text as signature from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname ~ '^vp_distribution_' or p.proname='guard_vp_distribution_source' or p.proname in ('get_finance_vp_distribution','save_finance_vp_distribution','transition_finance_vp_distribution'))),
 competing_types as(select t.typname from pg_type t where t.typnamespace='public'::regnamespace and t.typname ~ '^_?(finance_vp_revenue_distribution|vp_distribution_)'),
 competing_triggers as(select c.relname as table_name,t.tgname as trigger_name from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and t.tgname ~ '^vp_distribution_'),
 checks(name,passed) as(values
 ('045_objects_unused',not exists(select 1 from competing_relations) and not exists(select 1 from competing_functions) and not exists(select 1 from competing_types) and not exists(select 1 from competing_triggers)),
 ('predecessor_functions_exact',not exists(select 1 from function_differences where not is_new)),
 ('044_catalog_preserved',not exists(select 1 from money_catalog_differences)),
 ('044_source_guards_preserved',not exists(select 1 from money_guard_differences)),
 ('044_privileges_preserved',(coalesce(has_function_privilege('authenticated',to_regprocedure('public.money_allocation_admin()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.money_allocation_admin()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.money_allocation_admin()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.money_allocation_admin()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.money_allocation_source(uuid)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.money_allocation_source(uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.money_allocation_source(uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.money_allocation_source(uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.money_allocation_decisions(jsonb,jsonb,boolean)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.money_allocation_decisions(jsonb,jsonb,boolean)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.money_allocation_decisions(jsonb,jsonb,boolean)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.money_allocation_decisions(jsonb,jsonb,boolean)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.money_allocation_immutable()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.money_allocation_immutable()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.money_allocation_immutable()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.money_allocation_immutable()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.money_allocation_lock(uuid)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.money_allocation_lock(uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.money_allocation_lock(uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.money_allocation_lock(uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_money_allocation(uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_money_allocation(uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.save_finance_money_allocation(uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.save_finance_money_allocation(uuid,uuid,integer,jsonb,jsonb,text)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.transition_finance_money_allocation(uuid,integer,jsonb,text,boolean,text)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.transition_finance_money_allocation(uuid,integer,jsonb,text,boolean,text)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.transition_finance_money_allocation(uuid,integer,jsonb,text,boolean,text)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.transition_finance_money_allocation(uuid,integer,jsonb,text,boolean,text)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.guard_money_allocation_source()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.guard_money_allocation_source()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.guard_money_allocation_source()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.guard_money_allocation_source()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.validate_money_allocation()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.validate_money_allocation()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.validate_money_allocation()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.validate_money_allocation()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_money_allocation(uuid)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_money_allocation(uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.get_finance_money_allocation(uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.get_finance_money_allocation(uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and (select count(*)=2 and bool_and(relrowsecurity and relkind='r'
 and has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'SELECT WITH GRANT OPTION')
 and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege('authenticated',oid,'INSERT,UPDATE,REFERENCES')
 and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege('anon',oid,'SELECT,INSERT,UPDATE,REFERENCES')
 and not exists(select 1 from aclexplode(coalesce(relacl,acldefault('r',relowner))) acl where acl.grantee=0))
 from pg_class where relnamespace='public'::regnamespace and relname in ('finance_payment_money_allocations','finance_payment_money_allocation_audit'))),
 ('source_contracts_present',not exists(select 1 from source_contract_differences)),
 ('no_opening_cutover',not exists(select 1 from public.finance_account_opening_balances)))
 select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as vp_revenue_distribution_preflight_pass,
 (select coalesce(jsonb_agg(to_jsonb(f) order by signature),'[]') from function_differences f) as function_differences,
 (select coalesce(jsonb_agg(to_jsonb(d) order by table_name),'[]') from money_catalog_differences d) as money_catalog_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from money_guard_differences d) as money_guard_differences,
 (select coalesce(jsonb_agg(to_jsonb(d) order by table_name,column_name),'[]') from source_contract_differences d) as missing_source_contracts,
 (select evidence from protected) as upstream_evidence_hashes,
 current_setting('server_version_num')::integer as catalog_server_version_num,
 (select coalesce(jsonb_agg(relname order by relname),'[]') from competing_relations) as competing_relations,
 (select coalesce(jsonb_agg(signature order by signature),'[]') from competing_functions) as competing_functions,
 (select coalesce(jsonb_agg(typname order by typname),'[]') from competing_types) as competing_types,
 (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from competing_triggers t) as competing_triggers;
