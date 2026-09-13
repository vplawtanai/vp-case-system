BEGIN;
-- ROLLBACK ONLY. No business RPCs or synthetic row creation.
select set_config('vp.formula046_before',upstream_evidence_hashes::text,true) from (-- ONE SELECT-only statement / ONE result row. No application RPC calls.
-- Stop on any failed_checks. Compare ALL upstream_evidence_hashes between preflight and post-apply; mutable row counts are not gates.
-- No operator attestation here substitutes for the external human Production apply decision.
with predecessor as(-- ONE SELECT-only statement / ONE result row. No application RPC calls.
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
('public.get_finance_money_allocation(uuid)','7209f17b3b694ef00393b436f2d68ca0',true,'s',false,'jsonb','plpgsql',array['p_payment_id']::text[],0,false,'u',false),
('public.vp_distribution_frozen_source(jsonb,jsonb)','dd7c249818f0918fd05b711d4af60d2d',false,'i',true,'jsonb','plpgsql',array['p_money_source','p_money_allocation']::text[],0,false,'u',false),
('public.vp_distribution_source(uuid)','db9cc5233dae9af6e728416b96b23989',true,'s',true,'jsonb','plpgsql',array['p_payment_id']::text[],0,false,'u',false),
('public.vp_distribution_choices(jsonb,jsonb,boolean)','6bc574a243fe094d1443ff0ff6343c78',false,'i',true,'jsonb','plpgsql',array['p_source','p_choices','p_complete']::text[],0,false,'u',false),
('public.vp_distribution_immutable()','b11fdf476b490cc8971fc62d33ba7ea1',true,'v',true,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)','276a63b50873c2ae5fd971207c0d6a69',true,'v',true,'uuid','plpgsql',array['p_payment_id','p_expected_id','p_expected_version','p_source','p_choices','p_note']::text[],0,false,'u',false),
('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)','1c80933e8c6df2b50a601cd3f5182a2b',true,'v',true,'uuid','plpgsql',array['p_id','p_expected_version','p_source','p_action','p_acknowledged','p_reason']::text[],0,false,'u',false),
('public.guard_vp_distribution_source()','d9c2dfe4aedd09392bf393e1a91587ab',true,'v',true,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.vp_distribution_validate()','28858e2881c548358be1eedd2f8f178d',true,'v',true,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.get_finance_vp_distribution(uuid)','6e6d47836c88dd5616e7e42b6b9aa015',true,'s',true,'jsonb','plpgsql',array['p_payment_id']::text[],0,false,'u',false)),
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
  expected_catalog as(select value from jsonb_array_elements('[
  {
    "name": "finance_vp_revenue_distribution_audit",
    "kind": "r",
    "rls": true,
    "force_rls": false,
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "distribution_id",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "event_type",
        "type": "text",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "actor_id",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "evidence_json",
        "type": "jsonb",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      }
    ],
    "constraints": [
      {
        "name": "finance_vp_revenue_distribution_audit_actor_id_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (actor_id) REFERENCES user_profiles(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distribution_audit_distribution_id_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (distribution_id) REFERENCES finance_vp_revenue_distributions(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distribution_audit_event_type_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((event_type = ANY (ARRAY[''created''::text, ''saved''::text, ''reviewed''::text, ''finalized''::text, ''superseded''::text])))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distribution_audit_evidence_json_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((jsonb_typeof(evidence_json) = ''object''::text))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distribution_audit_evidence_json_check1",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (COALESCE(((jsonb_typeof((evidence_json -> ''version''::text)) = ''number''::text) AND (((evidence_json ->> ''version''::text))::numeric >= (1)::numeric) AND (((evidence_json ->> ''version''::text))::numeric = trunc(((evidence_json ->> ''version''::text))::numeric))), false))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distribution_audit_pkey",
        "type": "p",
        "validated": true,
        "deferrable": false,
        "definition": "PRIMARY KEY (id)",
        "initially_deferred": false
      },
      {
        "name": "vp_distribution_audit_integrity",
        "type": "t",
        "validated": true,
        "deferrable": true,
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED",
        "initially_deferred": true
      }
    ],
    "indexes": [
      {
        "name": "finance_vp_revenue_distribution_audit_pkey",
        "ready": true,
        "valid": true,
        "definition": "CREATE UNIQUE INDEX finance_vp_revenue_distribution_audit_pkey ON public.finance_vp_revenue_distribution_audit USING btree (id)"
      },
      {
        "name": "vp_distribution_audit_parent",
        "ready": true,
        "valid": true,
        "definition": "CREATE INDEX vp_distribution_audit_parent ON public.finance_vp_revenue_distribution_audit USING btree (distribution_id, created_at, id)"
      },
      {
        "name": "vp_distribution_audit_version",
        "ready": true,
        "valid": true,
        "definition": "CREATE UNIQUE INDEX vp_distribution_audit_version ON public.finance_vp_revenue_distribution_audit USING btree (distribution_id, (((evidence_json ->> ''version''::text))::integer))"
      }
    ],
    "policies": [
      {
        "name": "vp_distribution_audit_read",
        "check": null,
        "roles": [
          "authenticated"
        ],
        "using": "current_user_can_view_finance_payments()",
        "command": "SELECT",
        "permissive": "PERMISSIVE"
      }
    ],
    "triggers": [
      {
        "name": "vp_distribution_audit_immutable",
        "enabled": "O",
        "definition": "CREATE TRIGGER vp_distribution_audit_immutable BEFORE DELETE OR UPDATE ON public.finance_vp_revenue_distribution_audit FOR EACH ROW EXECUTE FUNCTION vp_distribution_immutable()"
      },
      {
        "name": "vp_distribution_audit_integrity",
        "enabled": "O",
        "definition": "CREATE CONSTRAINT TRIGGER vp_distribution_audit_integrity AFTER INSERT ON public.finance_vp_revenue_distribution_audit DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION vp_distribution_validate()"
      },
      {
        "name": "vp_distribution_audit_no_truncate",
        "enabled": "O",
        "definition": "CREATE TRIGGER vp_distribution_audit_no_truncate BEFORE TRUNCATE ON public.finance_vp_revenue_distribution_audit FOR EACH STATEMENT EXECUTE FUNCTION vp_distribution_immutable()"
      }
    ]
  },
  {
    "name": "finance_vp_revenue_distributions",
    "kind": "r",
    "rls": true,
    "force_rls": false,
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "payment_id",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "money_allocation_id",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "revision",
        "type": "integer",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "previous_id",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "status",
        "type": "text",
        "default": "''draft''::text",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "version",
        "type": "integer",
        "default": "1",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "source_snapshot_json",
        "type": "jsonb",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "decisions_json",
        "type": "jsonb",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "note",
        "type": "text",
        "default": "''''::text",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "reviewed_at",
        "type": "timestamp with time zone",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "reviewed_by",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "finalized_at",
        "type": "timestamp with time zone",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "finalized_by",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "superseded_at",
        "type": "timestamp with time zone",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "superseded_by",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "supersede_reason",
        "type": "text",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      }
    ],
    "constraints": [
      {
        "name": "finance_vp_revenue_distributions_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((revision = 1) = (previous_id IS NULL)))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check1",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((updated_at >= created_at))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check10",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((finalized_at IS NULL) OR ((finalized_at >= reviewed_at) AND (finalized_at <= updated_at))))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check11",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((((status = ''superseded''::text) AND (superseded_at IS NOT NULL) AND (superseded_by IS NOT NULL) AND (COALESCE(NULLIF(btrim(supersede_reason), ''''::text), ''''::text) <> ''''::text) AND (supersede_reason = btrim(supersede_reason)) AND (superseded_at >= COALESCE(finalized_at, reviewed_at, created_at)) AND (superseded_at <= updated_at)) OR ((status <> ''superseded''::text) AND (superseded_at IS NULL) AND (superseded_by IS NULL) AND (supersede_reason IS NULL))))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check2",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((reviewed_at IS NULL) = (reviewed_by IS NULL)))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check3",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((finalized_at IS NULL) = (finalized_by IS NULL)))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check4",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((status <> ''draft''::text) OR ((reviewed_at IS NULL) AND (finalized_at IS NULL))))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check5",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((status <> ALL (ARRAY[''reviewed''::text, ''finalized''::text])) OR (reviewed_at IS NOT NULL)))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check6",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((status <> ''reviewed''::text) OR (finalized_at IS NULL)))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check7",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((status <> ''finalized''::text) OR (finalized_at IS NOT NULL)))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check8",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((finalized_at IS NULL) OR ((reviewed_at IS NOT NULL) AND (status = ANY (ARRAY[''finalized''::text, ''superseded''::text])))))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check9",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((reviewed_at IS NULL) OR ((reviewed_at >= created_at) AND (reviewed_at <= updated_at))))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_created_by_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (created_by) REFERENCES user_profiles(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_decisions_json_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((jsonb_typeof(decisions_json) = ''array''::text))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_finalized_by_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (finalized_by) REFERENCES user_profiles(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_money_allocation_id_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (money_allocation_id) REFERENCES finance_payment_money_allocations(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_note_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((length(note) <= 2000) AND (note = btrim(note))))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_payment_id_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (payment_id) REFERENCES finance_payments(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_payment_id_revision_key",
        "type": "u",
        "validated": true,
        "deferrable": false,
        "definition": "UNIQUE (payment_id, revision)",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_pkey",
        "type": "p",
        "validated": true,
        "deferrable": false,
        "definition": "PRIMARY KEY (id)",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_previous_id_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (previous_id) REFERENCES finance_vp_revenue_distributions(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_previous_id_key",
        "type": "u",
        "validated": true,
        "deferrable": false,
        "definition": "UNIQUE (previous_id)",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_reviewed_by_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (reviewed_by) REFERENCES user_profiles(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_revision_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((revision > 0))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_source_snapshot_json_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((jsonb_typeof(source_snapshot_json) = ''object''::text))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_status_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((status = ANY (ARRAY[''draft''::text, ''reviewed''::text, ''finalized''::text, ''superseded''::text])))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_supersede_reason_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((length(supersede_reason) <= 2000))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_superseded_by_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (superseded_by) REFERENCES user_profiles(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_version_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((version > 0))",
        "initially_deferred": false
      },
      {
        "name": "vp_distribution_integrity",
        "type": "t",
        "validated": true,
        "deferrable": true,
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED",
        "initially_deferred": true
      }
    ],
    "indexes": [
      {
        "name": "finance_vp_revenue_distributions_payment_id_revision_key",
        "ready": true,
        "valid": true,
        "definition": "CREATE UNIQUE INDEX finance_vp_revenue_distributions_payment_id_revision_key ON public.finance_vp_revenue_distributions USING btree (payment_id, revision)"
      },
      {
        "name": "finance_vp_revenue_distributions_pkey",
        "ready": true,
        "valid": true,
        "definition": "CREATE UNIQUE INDEX finance_vp_revenue_distributions_pkey ON public.finance_vp_revenue_distributions USING btree (id)"
      },
      {
        "name": "finance_vp_revenue_distributions_previous_id_key",
        "ready": true,
        "valid": true,
        "definition": "CREATE UNIQUE INDEX finance_vp_revenue_distributions_previous_id_key ON public.finance_vp_revenue_distributions USING btree (previous_id)"
      },
      {
        "name": "vp_distribution_current_payment",
        "ready": true,
        "valid": true,
        "definition": "CREATE UNIQUE INDEX vp_distribution_current_payment ON public.finance_vp_revenue_distributions USING btree (payment_id) WHERE (status <> ''superseded''::text)"
      },
      {
        "name": "vp_distribution_money_allocation",
        "ready": true,
        "valid": true,
        "definition": "CREATE INDEX vp_distribution_money_allocation ON public.finance_vp_revenue_distributions USING btree (money_allocation_id) WHERE (money_allocation_id IS NOT NULL)"
      }
    ],
    "policies": [
      {
        "name": "vp_distribution_read",
        "check": null,
        "roles": [
          "authenticated"
        ],
        "using": "current_user_can_view_finance_payments()",
        "command": "SELECT",
        "permissive": "PERMISSIVE"
      }
    ],
    "triggers": [
      {
        "name": "vp_distribution_immutable",
        "enabled": "O",
        "definition": "CREATE TRIGGER vp_distribution_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.finance_vp_revenue_distributions FOR EACH ROW EXECUTE FUNCTION vp_distribution_immutable()"
      },
      {
        "name": "vp_distribution_integrity",
        "enabled": "O",
        "definition": "CREATE CONSTRAINT TRIGGER vp_distribution_integrity AFTER INSERT OR UPDATE ON public.finance_vp_revenue_distributions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION vp_distribution_validate()"
      },
      {
        "name": "vp_distribution_no_truncate",
        "enabled": "O",
        "definition": "CREATE TRIGGER vp_distribution_no_truncate BEFORE TRUNCATE ON public.finance_vp_revenue_distributions FOR EACH STATEMENT EXECUTE FUNCTION vp_distribution_immutable()"
      }
    ]
  }
]
'::jsonb)),actual_catalog as(select c.relname as name,c.relkind as kind,c.relrowsecurity as rls,c.relforcerowsecurity as force_rls,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid),'validated',con.convalidated,'deferrable',con.condeferrable,'initially_deferred',con.condeferred) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n') as constraints,
 (select jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(x.indexrelid),'valid',x.indisvalid,'ready',x.indisready) order by i.relname) from pg_index x join pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid) as indexes,
 (select jsonb_agg(jsonb_build_object('name',p.policyname,'command',p.cmd,'roles',p.roles,'using',p.qual,'check',p.with_check,'permissive',p.permissive) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
 (select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as triggers
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit') order by c.relname),
  catalog_differences as(select coalesce(e.value->>'name',a.name) as table_name,e.value as expected,to_jsonb(a) as actual from expected_catalog e full join actual_catalog a on a.name=e.value->>'name' where e.value is distinct from to_jsonb(a)),
 expected_domain_relations(name,kind) as(values ('finance_vp_revenue_distribution_audit','r'),('finance_vp_revenue_distribution_audit_pkey','i'),('vp_distribution_audit_parent','i'),('vp_distribution_audit_version','i'),('finance_vp_revenue_distributions','r'),('finance_vp_revenue_distributions_payment_id_revision_key','i'),('finance_vp_revenue_distributions_pkey','i'),('finance_vp_revenue_distributions_previous_id_key','i'),('vp_distribution_current_payment','i'),('vp_distribution_money_allocation','i')),
 actual_domain_relations as(select c.relname as name,c.relkind::text as kind from pg_class c where c.relnamespace='public'::regnamespace and (c.relname ~ '^(finance_vp_revenue_distribution|vp_distribution_)' or c.relname in(select name from expected_domain_relations))),
 relation_inventory_differences as(select e.name as expected_name,e.kind as expected_kind,a.name as actual_name,a.kind as actual_kind from expected_domain_relations e full join actual_domain_relations a on a.name=e.name where e.name is null or a.name is null or a.kind is distinct from e.kind),
 actual_domain_functions as(select p.oid,p.oid::regprocedure::text as signature from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname ~ '^vp_distribution_' or p.proname='guard_vp_distribution_source' or p.proname in ('get_finance_vp_distribution','save_finance_vp_distribution','transition_finance_vp_distribution'))),
 function_inventory_differences as(select e.signature as expected_signature,a.signature as actual_signature from (select * from expected_functions where is_new) e full join actual_domain_functions a on a.oid=to_regprocedure(e.signature) where e.signature is null or a.oid is null),
 distribution_expected_guards(table_name,trigger_name,trigger_type) as (values ('finance_payments','vp_distribution_payment_guard',27),
('finance_invoices','vp_distribution_invoice_guard',27),
('finance_invoice_items','vp_distribution_item_guard',31),
('finance_payment_allocation_reallocations','vp_distribution_reallocation_guard',31),
('finance_payment_invoice_allocations','vp_distribution_raw_guard',31),
('finance_payment_wht_components','vp_distribution_wht_guard',31),
('finance_tax_document_corrections','vp_distribution_correction_guard',31),
('finance_payment_money_allocations','vp_distribution_money_allocation_guard',31),
('finance_payments','vp_distribution_source_no_truncate',34),
('finance_invoices','vp_distribution_source_no_truncate',34),
('finance_invoice_items','vp_distribution_source_no_truncate',34),
('finance_payment_allocation_reallocations','vp_distribution_source_no_truncate',34),
('finance_payment_invoice_allocations','vp_distribution_source_no_truncate',34),
('finance_payment_wht_components','vp_distribution_source_no_truncate',34),
('finance_tax_document_corrections','vp_distribution_source_no_truncate',34),
('finance_payment_money_allocations','vp_distribution_source_no_truncate',34)),
 distribution_actual_guards as(select n.nspname as schema_name,c.relname as table_name,t.tgname as trigger_name,t.tgtype as trigger_type,
 t.tgenabled,t.tgfoid,t.tgisinternal,t.tgdeferrable,t.tginitdeferred,t.tgnargs,t.tgattr::text as columns,t.tgqual,pg_get_triggerdef(t.oid) as definition
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where t.tgfoid=to_regprocedure('public.guard_vp_distribution_source()') or (n.nspname='public' and t.tgname in ('vp_distribution_payment_guard','vp_distribution_invoice_guard','vp_distribution_item_guard','vp_distribution_reallocation_guard','vp_distribution_raw_guard','vp_distribution_wht_guard','vp_distribution_correction_guard','vp_distribution_money_allocation_guard','vp_distribution_source_no_truncate','vp_distribution_source_no_truncate','vp_distribution_source_no_truncate','vp_distribution_source_no_truncate','vp_distribution_source_no_truncate','vp_distribution_source_no_truncate','vp_distribution_source_no_truncate','vp_distribution_source_no_truncate'))),
 distribution_guard_differences as(select e.table_name as expected_table,e.trigger_name as expected_name,e.trigger_type as expected_type,to_jsonb(a) as actual
 from distribution_expected_guards e full join distribution_actual_guards a on a.schema_name='public' and a.table_name=e.table_name and a.trigger_name=e.trigger_name
 where e.table_name is null or a.table_name is null or a.trigger_type is distinct from e.trigger_type or a.tgenabled<>'O'
 or a.tgfoid is distinct from to_regprocedure('public.guard_vp_distribution_source()') or a.tgisinternal or a.tgdeferrable or a.tginitdeferred or a.tgnargs<>0 or a.columns<>'' or a.tgqual is not null),
 checks(name,passed) as(values
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
 ('no_opening_cutover',not exists(select 1 from public.finance_account_opening_balances)),
 ('exact_new_catalog',not exists(select 1 from catalog_differences)),
 ('exact_new_relation_inventory',not exists(select 1 from relation_inventory_differences)),
 ('exact_new_and_preserved_functions',not exists(select 1 from function_differences)),
 ('exact_new_function_inventory',not exists(select 1 from function_inventory_differences)),

 ('source_guards',not exists(select 1 from distribution_guard_differences) and (select count(*)=8 from distribution_actual_guards where (trigger_type & 1)=1)),
 ('source_truncate_guards',not exists(select 1 from distribution_guard_differences) and (select count(*)=8 from distribution_actual_guards where trigger_type=34)),
 ('private_and_rpc_privileges',(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_frozen_source(jsonb,jsonb)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_frozen_source(jsonb,jsonb)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_frozen_source(jsonb,jsonb)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_frozen_source(jsonb,jsonb)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_source(uuid)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_source(uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_source(uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_source(uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_immutable()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_immutable()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_immutable()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_immutable()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.guard_vp_distribution_source()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.guard_vp_distribution_source()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.guard_vp_distribution_source()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.guard_vp_distribution_source()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_validate()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_validate()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_validate()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_validate()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_vp_distribution(uuid)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_vp_distribution(uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.get_finance_vp_distribution(uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.get_finance_vp_distribution(uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE'))),
 ('only_three_authenticated_rpcs',(select count(*)=3 and bool_and(p.proname in ('get_finance_vp_distribution','save_finance_vp_distribution','transition_finance_vp_distribution')) from actual_domain_functions a join pg_proc p on p.oid=a.oid where has_function_privilege('authenticated',p.oid,'EXECUTE'))),
 ('no_anon_execute',not exists(select 1 from actual_domain_functions where has_function_privilege('anon',oid,'EXECUTE'))),
 ('browser_mutation_blocked',(select count(*)=2 and bool_and(relrowsecurity and relkind='r'
 and has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'SELECT WITH GRANT OPTION')
 and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege('authenticated',oid,'INSERT,UPDATE,REFERENCES')
 and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege('anon',oid,'SELECT,INSERT,UPDATE,REFERENCES')
 and not exists(select 1 from aclexplode(coalesce(relacl,acldefault('r',relowner))) acl where acl.grantee=0))
 from pg_class where relnamespace='public'::regnamespace and relname in ('finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit'))),
 ('explicit_read_policies',(select count(*)=2 and count(distinct tablename)=2 and bool_and(cmd='SELECT' and roles=array['authenticated']::name[] and qual='current_user_can_view_finance_payments()' and with_check is null and permissive='PERMISSIVE') from pg_policies where schemaname='public' and tablename in ('finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit'))),
 ('dry_run_upstream_unchanged',nullif(current_setting('vp.distribution045_before',true),'') is null or current_setting('vp.distribution045_before',true)=(select evidence::text from protected)))
 select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as vp_revenue_distribution_foundation_verification_pass,
 (select coalesce(jsonb_agg(to_jsonb(f) order by signature),'[]') from function_differences f) as function_differences,
 (select coalesce(jsonb_agg(to_jsonb(d) order by table_name),'[]') from money_catalog_differences d) as money_catalog_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from money_guard_differences d) as money_guard_differences,
 (select coalesce(jsonb_agg(to_jsonb(d) order by table_name,column_name),'[]') from source_contract_differences d) as missing_source_contracts,
 (select evidence from protected) as upstream_evidence_hashes,
 current_setting('server_version_num')::integer as catalog_server_version_num,
 (select coalesce(jsonb_agg(to_jsonb(d) order by table_name),'[]') from catalog_differences d) as catalog_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from relation_inventory_differences d) as relation_inventory_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_inventory_differences d) as function_inventory_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from distribution_guard_differences d) as source_guard_differences,
 nullif(current_setting('vp.distribution045_before',true),'') is not null as dry_run_baseline_present,
 jsonb_build_object('finance_vp_revenue_distributions',(select count(*) from public.finance_vp_revenue_distributions),'finance_vp_revenue_distribution_audit',(select count(*) from public.finance_vp_revenue_distribution_audit)) as new_rows),
 protected as(select upstream_evidence_hashes || jsonb_build_object('finance_vp_revenue_distributions',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_vp_revenue_distributions r),'finance_vp_revenue_distribution_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_vp_revenue_distribution_audit r)) as evidence from predecessor),
 extra_checks(name,passed) as(values ('046_namespace_unused',not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and (proname like 'vp_formula_%' or proname in('vp_compensation_formula_catalog','vp_distribution_amount_choices_v1','get_finance_vp_formula_context'))) and not exists(select 1 from pg_trigger where tgname='vp_formula_result_guard')),
 ('recipient_profile_contract',(select count(*)=5 and bool_and(case when attname='id' then atttypid='uuid'::regtype when attname='active' then atttypid='boolean'::regtype else atttypid in('text'::regtype,'varchar'::regtype) end) from pg_attribute where attrelid='public.user_profiles'::regclass and attname in('id','active','staff_name','full_name','email') and not attisdropped))),
 checks as(select key as name,value='true'::jsonb as passed from predecessor,jsonb_each(checks)
 union all select name,passed is true from extra_checks)
 select (select jsonb_object_agg(name,passed order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where not passed),'[]') from checks) as failed_checks,
 (select bool_and(passed) from checks) as vp_distribution_formula_preflight_pass,
 (select evidence from protected) as upstream_evidence_hashes,
 (select to_jsonb(p)-'upstream_evidence_hashes' from predecessor p) as predecessor_diagnostics,
  '[]'::jsonb as formula_function_differences,
 jsonb_build_object('distribution_rows',(select count(*) from public.finance_vp_revenue_distributions),'distribution_audit_rows',(select count(*) from public.finance_vp_revenue_distribution_audit)) as observability_only,
 current_setting('server_version_num')::integer as server_version_num) p;
-- BEGIN EMBEDDED MIGRATION 046
-- CANDIDATE 046. Formula evidence only; no backfill or downstream posting.
-- Shared catalog is generated from compensation/formula-definitions.json.
do $pre$
begin
 if to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)') is null
   or to_regprocedure('public.get_finance_vp_distribution(uuid)') is null
   or to_regprocedure('public.get_finance_vp_formula_context(uuid)') is not null
 then raise exception 'VP_FORMULA_PREDECESSOR_OR_CONFLICT'; end if;
end;
$pre$;

-- BEGIN GENERATED CATALOG AND LEGACY VALIDATOR
create function public.vp_compensation_formula_catalog() returns jsonb language sql immutable set search_path=public as $catalog$
 select $json${"version":1,"formulas":[{"code":"pao_line","label_key":"finance.compensation.formula.pao_line","mode":"percent","defaults":[{"type":"company","name":"Company","percent":20,"company":true,"role":"Company"},{"type":"lawyer","name":"ทนายเป้า","percent":55,"company":false,"role":"Lawyer"},{"type":"lawyer","name":"ทนายตุลย์","percent":25,"company":false,"role":"Lawyer"}]},{"code":"tun_line","label_key":"finance.compensation.formula.tun_line","mode":"percent","defaults":[{"type":"company","name":"Company","percent":20,"company":true,"role":"Company"},{"type":"lawyer","name":"ทนายเป้า","percent":40,"company":false,"role":"Lawyer"},{"type":"lawyer","name":"ทนายตุลย์","percent":40,"company":false,"role":"Lawyer"}]},{"code":"source_worker_qc","label_key":"finance.compensation.formula.source_worker_qc","mode":"work_pool","source_percent":20,"company_percent":40,"work_percent":40,"defaults":[{"type":"source","name":"","percent":20,"company":false,"role":"Client Source / Broker"},{"type":"company","name":"Company","percent":40,"company":true,"role":"Company Share"},{"type":"worker","name":"","percent":40,"company":false,"role":"Lead Lawyer / Case Owner"}]},{"code":"travel_fee","label_key":"finance.compensation.revenue.travel_fee","mode":"company_only","defaults":[{"type":"company","name":"Company","percent":100,"company":true,"role":"Company"}]},{"code":"custom","label_key":"finance.compensation.formula.custom","mode":"fixed","defaults":[]}],"recipient_buckets":{"company":"company_share_amount","source":"referral_amount","lawyer":"work_compensation_amount","lead_lawyer":"work_compensation_amount","worker":"work_compensation_amount","assistant":"work_compensation_amount","qc":"work_compensation_amount","other":"work_compensation_amount"},"distribution_calculation":"exact_cents_largest_remainder_v1"}$json$::jsonb;
$catalog$;

create function public.vp_distribution_amount_choices_v1(p_source jsonb,p_choices jsonb,p_complete boolean)
returns jsonb language plpgsql immutable set search_path=public as $choices$
declare l jsonb; c jsonb; k text; amount numeric; total numeric; pool numeric; result jsonb:='[]';
begin
 if p_complete is null or jsonb_typeof(p_source->'lines') is distinct from 'array'
   or jsonb_typeof(p_choices) is distinct from 'array' then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
 if exists(select 1 from jsonb_array_elements(p_choices) x where jsonb_typeof(x) is distinct from 'object')
   or jsonb_array_length(p_choices)<>(select count(*) from jsonb_array_elements(p_source->'lines') x where x->>'classification'='professional_fee')
 then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
 for l in select value from jsonb_array_elements(p_source->'lines') where value->>'classification'='professional_fee' order by value->>'invoice_item_id' loop
  if (select count(*) from jsonb_array_elements(p_choices) x where x->>'invoice_item_id'=l->>'invoice_item_id')<>1
  then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
  select value into c from jsonb_array_elements(p_choices) where value->>'invoice_item_id'=l->>'invoice_item_id';
  if jsonb_typeof(c->'invoice_item_id') is distinct from 'string'
    or exists(select 1 from jsonb_object_keys(c) as keys(key) where keys.key not in ('invoice_item_id','referral_amount','company_share_amount','work_compensation_amount'))
  then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
  total:=0;
  for k in select unnest(array['referral_amount','company_share_amount','work_compensation_amount']) loop
   if jsonb_typeof(c->k) is distinct from 'number' then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
   amount:=(c->>k)::numeric;
   if amount<0 or amount<>round(amount,2) then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
   total:=total+amount;
  end loop;
  if jsonb_typeof(l->'professional_pool') is distinct from 'number' then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
  pool:=(l->>'professional_pool')::numeric;
  if pool<0 or pool<>round(pool,2) then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
  if total>pool then raise exception 'VP_DISTRIBUTION_POOL_EXCEEDED'; end if;
  if p_complete and total<>pool then raise exception 'VP_DISTRIBUTION_REVIEW_REQUIRED'; end if;
  result:=result||jsonb_build_array(jsonb_build_object('invoice_item_id',l->>'invoice_item_id',
   'referral_amount',(c->>'referral_amount')::numeric,'company_share_amount',(c->>'company_share_amount')::numeric,
   'work_compensation_amount',(c->>'work_compensation_amount')::numeric));
 end loop;
 return result;
end;
$choices$;
-- END GENERATED CATALOG AND LEGACY VALIDATOR

create function public.vp_formula_calculate(p_pool numeric,p_code text,p_version integer,p_definition jsonb,p_recipients jsonb)
returns jsonb language plpgsql immutable set search_path=public as $calc$
declare r jsonb; i integer; n integer; mode text; parameter numeric; parameters numeric[]:='{}'; amounts numeric[]:='{}';
 floors numeric[]:='{}'; weights numeric[]:='{}'; pool_cents numeric; remaining integer; total numeric:=0;
 source_count integer:=0; company_count integer:=0; owner_count integer:=0;
 source_percent numeric:=0; company_percent numeric:=0; work_percent numeric:=0;
 recipient_type text; kind text; label text; role_label text; uid uuid; bucket text;
 output jsonb:='[]'; identity_keys text[]:='{}'; identity_key text;
 referral numeric:=0; company numeric:=0; work numeric:=0;
begin
 if p_pool is null or p_pool<0 or p_pool<>round(p_pool,2) or p_pool>90071992547409.91
   or p_version is null or p_version<1 or p_code is null
   or jsonb_typeof(p_definition) is distinct from 'object'
   or p_definition->>'code' is distinct from p_code
   or p_definition->'version' is distinct from to_jsonb(p_version)
   or p_definition->>'calculation' is distinct from 'exact_cents_largest_remainder_v1'
   or jsonb_typeof(p_definition->'recipient_buckets') is distinct from 'object'
   or jsonb_typeof(p_recipients) is distinct from 'array'
 then raise exception 'VP_FORMULA_INVALID'; end if;
 mode:=p_definition->>'mode'; n:=jsonb_array_length(p_recipients); pool_cents:=p_pool*100;
 if mode is null or mode not in ('percent','fixed','work_pool','company_only') or n not between 1 and 50
 then raise exception 'VP_FORMULA_INVALID'; end if;
 for i in 1..n loop
  r:=p_recipients->(i-1);
  if jsonb_typeof(r) is distinct from 'object' then raise exception 'VP_FORMULA_INVALID'; end if;
  if mode='fixed' then
   if jsonb_typeof(r->'fixed_amount') is distinct from 'number' or r->'percent' is distinct from 'null'::jsonb then raise exception 'VP_FORMULA_PARAMETER'; end if;
   parameter:=(r->>'fixed_amount')::numeric;
   if parameter<0 or parameter<>round(parameter,2) then raise exception 'VP_FORMULA_PARAMETER'; end if;
   parameters:=array_append(parameters,parameter); amounts:=array_append(amounts,parameter*100); weights:=array_append(weights,0);
  else
   if jsonb_typeof(r->'percent') is distinct from 'number' or r->'fixed_amount' is distinct from 'null'::jsonb then raise exception 'VP_FORMULA_PARAMETER'; end if;
   parameter:=(r->>'percent')::numeric;
   if parameter<0 or parameter>100 or parameter<>round(parameter,4) then raise exception 'VP_FORMULA_PARAMETER'; end if;
   parameters:=array_append(parameters,parameter); amounts:=array_append(amounts,floor(pool_cents*parameter/100));
   weights:=array_append(weights,mod(pool_cents*parameter,100));
  end if;
  total:=total+parameter;
  recipient_type:=r->>'recipient_type';
  if recipient_type='source' then source_count:=source_count+1; source_percent:=source_percent+parameter;
  elsif recipient_type='company' then company_count:=company_count+1; company_percent:=company_percent+parameter;
  else work_percent:=work_percent+parameter;
   if r->>'role_label'='Lead Lawyer / Case Owner' then owner_count:=owner_count+1; end if;
  end if;
 end loop;
 if (mode='fixed' and total<>p_pool) or (mode<>'fixed' and total<>100) then raise exception 'VP_FORMULA_RECONCILE'; end if;
 if mode='company_only' and (n<>1 or company_count<>1) then raise exception 'VP_FORMULA_CONTRACT'; end if;
 if mode<>'fixed' and company_count=0 then raise exception 'VP_FORMULA_CONTRACT'; end if;
 if mode='work_pool' and (source_count<>1 or company_count<>1 or owner_count<>1
   or to_jsonb(source_percent) is distinct from p_definition->'source_percent'
   or to_jsonb(company_percent) is distinct from p_definition->'company_percent'
   or to_jsonb(work_percent) is distinct from p_definition->'work_percent') then raise exception 'VP_FORMULA_CONTRACT'; end if;
 floors:=amounts;
 if mode<>'fixed' then
  remaining:=(pool_cents-(select sum(value) from unnest(amounts) value))::integer;
  for i in select index from generate_series(1,n) index order by weights[index] desc,index limit remaining loop amounts[i]:=amounts[i]+1; end loop;
 end if;
 for i in 1..n loop
  r:=p_recipients->(i-1); recipient_type:=r->>'recipient_type'; kind:=r->>'recipient_kind';
  if p_pool>0 and amounts[i]<=0 then raise exception 'VP_FORMULA_PARAMETER'; end if;
  bucket:=p_definition->'recipient_buckets'->>recipient_type;
  if bucket is null or bucket not in ('referral_amount','company_share_amount','work_compensation_amount')
    or kind is null or kind not in ('company','user','external')
    or (recipient_type='company') is distinct from (kind='company')
    or (bucket='company_share_amount') is distinct from (kind='company')
  then raise exception 'VP_FORMULA_ROLE'; end if;
  label:=r->>'recipient_name'; role_label:=r->>'role_label'; uid:=null;
  if jsonb_typeof(r->'recipient_name') is distinct from 'string' or nullif(btrim(label),'') is null or length(label)>300 or label<>btrim(label)
    or jsonb_typeof(r->'role_label') is distinct from 'string' or nullif(btrim(role_label),'') is null or length(role_label)>200 or role_label<>btrim(role_label)
  then raise exception 'VP_FORMULA_RECIPIENT'; end if;
  if kind='user' then
   if jsonb_typeof(r->'recipient_user_id') is distinct from 'string' then raise exception 'VP_FORMULA_RECIPIENT'; end if;
   uid:=(r->>'recipient_user_id')::uuid;
  elsif r->'recipient_user_id' is distinct from 'null'::jsonb then raise exception 'VP_FORMULA_RECIPIENT'; end if;
  if kind='company' and label<>'Company' then raise exception 'VP_FORMULA_RECIPIENT'; end if;
  identity_key:=jsonb_build_array(kind,coalesce(uid::text,label),role_label,bucket)::text;
  if identity_key=any(identity_keys) then raise exception 'VP_FORMULA_DUPLICATE_RECIPIENT'; end if;
  identity_keys:=array_append(identity_keys,identity_key);
  output:=output||jsonb_build_array(jsonb_build_object('component_no',i,'recipient_type',recipient_type,'role_label',role_label,
   'recipient_kind',kind,'recipient_user_id',uid,'recipient_name',label,'percent',case when mode='fixed' then null else parameters[i] end,
   'fixed_amount',case when mode='fixed' then parameters[i] else null end,'amount',amounts[i]/100,'bucket',bucket,'rounding_adjustment_cents',amounts[i]-floors[i]));
  if bucket='referral_amount' then referral:=referral+amounts[i]/100;
  elsif bucket='company_share_amount' then company:=company+amounts[i]/100;
  else work:=work+amounts[i]/100; end if;
 end loop;
 return jsonb_build_object('schema_version',1,'formula_code',p_code,'formula_version',p_version,'formula_snapshot',p_definition,
  'calculation','exact_cents_largest_remainder_v1','pool',p_pool,'recipients',output,
  'referral_amount',referral,'company_share_amount',company,'work_compensation_amount',work);
end;
$calc$;

create or replace function public.vp_distribution_choices(p_source jsonb,p_choices jsonb,p_complete boolean)
returns jsonb language plpgsql immutable set search_path=public as $choices$
declare base jsonb; result jsonb:='[]'; c jsonb; l jsonb; f jsonb; canonical jsonb;
begin
 if jsonb_typeof(p_choices) is distinct from 'array' then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
 base:=public.vp_distribution_amount_choices_v1(p_source,(select coalesce(jsonb_agg(value-'formula_result'),'[]') from jsonb_array_elements(p_choices)),p_complete);
 for c in select value from jsonb_array_elements(base) loop
  select value->'formula_result' into f from jsonb_array_elements(p_choices) where value->>'invoice_item_id'=c->>'invoice_item_id';
  if f is not null then
   select value into l from jsonb_array_elements(p_source->'lines') where value->>'invoice_item_id'=c->>'invoice_item_id';
   canonical:=public.vp_formula_calculate((l->>'professional_pool')::numeric,f->>'formula_code',(f->>'formula_version')::integer,f->'formula_snapshot',f->'recipients');
   if canonical is distinct from f or c->'referral_amount' is distinct from f->'referral_amount'
     or c->'company_share_amount' is distinct from f->'company_share_amount' or c->'work_compensation_amount' is distinct from f->'work_compensation_amount'
   then raise exception 'VP_FORMULA_EVIDENCE_INVALID'; end if;
   c:=c||jsonb_build_object('formula_result',canonical);
  end if;
  result:=result||jsonb_build_array(c);
 end loop;
 return result;
end;
$choices$;

create function public.vp_formula_result_guard()
returns trigger language plpgsql security definer set search_path=public as $guard$
declare choice jsonb; f jsonb; definition jsonb; person jsonb; profile public.user_profiles%rowtype; catalog jsonb;
begin
 -- Old aggregate-only evidence stays historical and may always be superseded.
 if new.status='superseded' then return new; end if;
 catalog:=public.vp_compensation_formula_catalog();
 if public.vp_distribution_choices(new.source_snapshot_json,new.decisions_json,true) is distinct from new.decisions_json
 then raise exception 'VP_FORMULA_EVIDENCE_INVALID'; end if;
 for choice in select value from jsonb_array_elements(new.decisions_json) loop
  f:=choice->'formula_result';
  if f is null then raise exception 'VP_FORMULA_REQUIRED'; end if;
  select value||jsonb_build_object('version',catalog->'version','recipient_buckets',catalog->'recipient_buckets','calculation',catalog->'distribution_calculation')
   into definition from jsonb_array_elements(catalog->'formulas') where value->>'code'=f->>'formula_code';
  if definition is null or f->'formula_version' is distinct from catalog->'version' or f->'formula_snapshot' is distinct from definition
  then raise exception 'VP_FORMULA_STALE'; end if;
  for person in select value from jsonb_array_elements(f->'recipients') where value->>'recipient_kind'='user' loop
   select * into profile from public.user_profiles where id=(person->>'recipient_user_id')::uuid for share;
   if profile.id is null or profile.active is distinct from true
     or person->>'recipient_name' is distinct from coalesce(nullif(btrim(profile.staff_name),''),nullif(btrim(profile.full_name),''),nullif(btrim(profile.email),''),profile.id::text)
   then raise exception 'VP_FORMULA_RECIPIENT_STALE'; end if;
  end loop;
 end loop;
 return new;
end;
$guard$;
create trigger vp_formula_result_guard before insert or update on public.finance_vp_revenue_distributions for each row execute function public.vp_formula_result_guard();

create function public.get_finance_vp_formula_context(p_payment_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $get$
declare context jsonb; people jsonb:='[]';
begin
 context:=public.get_finance_vp_distribution(p_payment_id);
 if public.money_allocation_admin() then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',coalesce(nullif(btrim(staff_name),''),nullif(btrim(full_name),''),nullif(btrim(email),''),id::text)) order by id),'[]')
   into people from public.user_profiles where active is true;
 end if;
 return context||jsonb_build_object('formula_schema_version',1,'formula_catalog',public.vp_compensation_formula_catalog(),'formula_people',people);
end;
$get$;

revoke all on function public.vp_compensation_formula_catalog() from public,anon,authenticated;
revoke all on function public.vp_distribution_amount_choices_v1(jsonb,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.vp_formula_calculate(numeric,text,integer,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.vp_formula_result_guard() from public,anon,authenticated;
revoke all on function public.vp_distribution_choices(jsonb,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.get_finance_vp_formula_context(uuid) from public,anon;
grant execute on function public.get_finance_vp_formula_context(uuid) to authenticated;
-- END EMBEDDED MIGRATION 046
-- ONE SELECT-only statement / ONE result row. No application RPC calls.
-- Stop on any failed_checks. Compare ALL upstream_evidence_hashes between preflight and post-apply; mutable row counts are not gates.
-- No operator attestation here substitutes for the external human Production apply decision.
with expected_functions(signature,hash,security_definer,volatility,is_new,return_type,language,argument_names,default_count,is_strict,parallel,leakproof) as (values ('public.vp_compensation_formula_catalog()','e7dd3b4645419ad707ba60494dd9d301',false,'i',true,'jsonb','sql',null::text[],0,false,'u',false),
('public.vp_distribution_amount_choices_v1(jsonb,jsonb,boolean)','6bc574a243fe094d1443ff0ff6343c78',false,'i',true,'jsonb','plpgsql',array['p_source','p_choices','p_complete']::text[],0,false,'u',false),
('public.vp_formula_calculate(numeric,text,integer,jsonb,jsonb)','db2a144bd77af5c64a72f28cf81fa4f8',false,'i',true,'jsonb','plpgsql',array['p_pool','p_code','p_version','p_definition','p_recipients']::text[],0,false,'u',false),
('public.vp_distribution_choices(jsonb,jsonb,boolean)','9ba3597e77ecbee804cbca3dc2e8d7d6',false,'i',true,'jsonb','plpgsql',array['p_source','p_choices','p_complete']::text[],0,false,'u',false),
('public.vp_formula_result_guard()','c0e42b906d2a4198ee95ce82ab1cdf5a',true,'v',true,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.get_finance_vp_formula_context(uuid)','310a4a2b7fdcb5989b377c3aa6f98b17',true,'s',true,'jsonb','plpgsql',array['p_payment_id']::text[],0,false,'u',false)),
 function_facts as(select e.*,p.oid,md5(p.prosrc) as actual_hash,p.prosecdef,p.provolatile,p.proconfig,p.prokind,p.prorettype,p.proretset,l.lanname,p.proargnames,p.pronargdefaults,p.proisstrict,p.proparallel,p.proleakproof from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature) left join pg_language l on l.oid=p.prolang),
 function_differences as(select * from function_facts where oid is null or actual_hash is distinct from hash or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or prokind<>'f' or proconfig is distinct from array['search_path=public']
 or prorettype is distinct from to_regtype(return_type) or proretset or lanname is distinct from language or proargnames is distinct from argument_names or pronargdefaults is distinct from default_count or proisstrict is distinct from is_strict or proparallel::text is distinct from parallel or proleakproof is distinct from leakproof),predecessor as(-- ONE SELECT-only statement / ONE result row. No application RPC calls.
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
('public.get_finance_money_allocation(uuid)','7209f17b3b694ef00393b436f2d68ca0',true,'s',false,'jsonb','plpgsql',array['p_payment_id']::text[],0,false,'u',false),
('public.vp_distribution_frozen_source(jsonb,jsonb)','dd7c249818f0918fd05b711d4af60d2d',false,'i',true,'jsonb','plpgsql',array['p_money_source','p_money_allocation']::text[],0,false,'u',false),
('public.vp_distribution_source(uuid)','db9cc5233dae9af6e728416b96b23989',true,'s',true,'jsonb','plpgsql',array['p_payment_id']::text[],0,false,'u',false),
('public.vp_distribution_choices(jsonb,jsonb,boolean)','9ba3597e77ecbee804cbca3dc2e8d7d6',false,'i',true,'jsonb','plpgsql',array['p_source','p_choices','p_complete']::text[],0,false,'u',false),
('public.vp_distribution_immutable()','b11fdf476b490cc8971fc62d33ba7ea1',true,'v',true,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)','276a63b50873c2ae5fd971207c0d6a69',true,'v',true,'uuid','plpgsql',array['p_payment_id','p_expected_id','p_expected_version','p_source','p_choices','p_note']::text[],0,false,'u',false),
('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)','1c80933e8c6df2b50a601cd3f5182a2b',true,'v',true,'uuid','plpgsql',array['p_id','p_expected_version','p_source','p_action','p_acknowledged','p_reason']::text[],0,false,'u',false),
('public.guard_vp_distribution_source()','d9c2dfe4aedd09392bf393e1a91587ab',true,'v',true,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.vp_distribution_validate()','28858e2881c548358be1eedd2f8f178d',true,'v',true,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.get_finance_vp_distribution(uuid)','6e6d47836c88dd5616e7e42b6b9aa015',true,'s',true,'jsonb','plpgsql',array['p_payment_id']::text[],0,false,'u',false)),
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
  expected_catalog as(select value from jsonb_array_elements('[
  {
    "name": "finance_vp_revenue_distribution_audit",
    "kind": "r",
    "rls": true,
    "force_rls": false,
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "distribution_id",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "event_type",
        "type": "text",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "actor_id",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "evidence_json",
        "type": "jsonb",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      }
    ],
    "constraints": [
      {
        "name": "finance_vp_revenue_distribution_audit_actor_id_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (actor_id) REFERENCES user_profiles(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distribution_audit_distribution_id_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (distribution_id) REFERENCES finance_vp_revenue_distributions(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distribution_audit_event_type_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((event_type = ANY (ARRAY[''created''::text, ''saved''::text, ''reviewed''::text, ''finalized''::text, ''superseded''::text])))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distribution_audit_evidence_json_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((jsonb_typeof(evidence_json) = ''object''::text))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distribution_audit_evidence_json_check1",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (COALESCE(((jsonb_typeof((evidence_json -> ''version''::text)) = ''number''::text) AND (((evidence_json ->> ''version''::text))::numeric >= (1)::numeric) AND (((evidence_json ->> ''version''::text))::numeric = trunc(((evidence_json ->> ''version''::text))::numeric))), false))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distribution_audit_pkey",
        "type": "p",
        "validated": true,
        "deferrable": false,
        "definition": "PRIMARY KEY (id)",
        "initially_deferred": false
      },
      {
        "name": "vp_distribution_audit_integrity",
        "type": "t",
        "validated": true,
        "deferrable": true,
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED",
        "initially_deferred": true
      }
    ],
    "indexes": [
      {
        "name": "finance_vp_revenue_distribution_audit_pkey",
        "ready": true,
        "valid": true,
        "definition": "CREATE UNIQUE INDEX finance_vp_revenue_distribution_audit_pkey ON public.finance_vp_revenue_distribution_audit USING btree (id)"
      },
      {
        "name": "vp_distribution_audit_parent",
        "ready": true,
        "valid": true,
        "definition": "CREATE INDEX vp_distribution_audit_parent ON public.finance_vp_revenue_distribution_audit USING btree (distribution_id, created_at, id)"
      },
      {
        "name": "vp_distribution_audit_version",
        "ready": true,
        "valid": true,
        "definition": "CREATE UNIQUE INDEX vp_distribution_audit_version ON public.finance_vp_revenue_distribution_audit USING btree (distribution_id, (((evidence_json ->> ''version''::text))::integer))"
      }
    ],
    "policies": [
      {
        "name": "vp_distribution_audit_read",
        "check": null,
        "roles": [
          "authenticated"
        ],
        "using": "current_user_can_view_finance_payments()",
        "command": "SELECT",
        "permissive": "PERMISSIVE"
      }
    ],
    "triggers": [
      {
        "name": "vp_distribution_audit_immutable",
        "enabled": "O",
        "definition": "CREATE TRIGGER vp_distribution_audit_immutable BEFORE DELETE OR UPDATE ON public.finance_vp_revenue_distribution_audit FOR EACH ROW EXECUTE FUNCTION vp_distribution_immutable()"
      },
      {
        "name": "vp_distribution_audit_integrity",
        "enabled": "O",
        "definition": "CREATE CONSTRAINT TRIGGER vp_distribution_audit_integrity AFTER INSERT ON public.finance_vp_revenue_distribution_audit DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION vp_distribution_validate()"
      },
      {
        "name": "vp_distribution_audit_no_truncate",
        "enabled": "O",
        "definition": "CREATE TRIGGER vp_distribution_audit_no_truncate BEFORE TRUNCATE ON public.finance_vp_revenue_distribution_audit FOR EACH STATEMENT EXECUTE FUNCTION vp_distribution_immutable()"
      }
    ]
  },
  {
    "name": "finance_vp_revenue_distributions",
    "kind": "r",
    "rls": true,
    "force_rls": false,
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "payment_id",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "money_allocation_id",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "revision",
        "type": "integer",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "previous_id",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "status",
        "type": "text",
        "default": "''draft''::text",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "version",
        "type": "integer",
        "default": "1",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "source_snapshot_json",
        "type": "jsonb",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "decisions_json",
        "type": "jsonb",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "note",
        "type": "text",
        "default": "''''::text",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "reviewed_at",
        "type": "timestamp with time zone",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "reviewed_by",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "finalized_at",
        "type": "timestamp with time zone",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "finalized_by",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "superseded_at",
        "type": "timestamp with time zone",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "superseded_by",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "supersede_reason",
        "type": "text",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      }
    ],
    "constraints": [
      {
        "name": "finance_vp_revenue_distributions_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((revision = 1) = (previous_id IS NULL)))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check1",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((updated_at >= created_at))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check10",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((finalized_at IS NULL) OR ((finalized_at >= reviewed_at) AND (finalized_at <= updated_at))))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check11",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((((status = ''superseded''::text) AND (superseded_at IS NOT NULL) AND (superseded_by IS NOT NULL) AND (COALESCE(NULLIF(btrim(supersede_reason), ''''::text), ''''::text) <> ''''::text) AND (supersede_reason = btrim(supersede_reason)) AND (superseded_at >= COALESCE(finalized_at, reviewed_at, created_at)) AND (superseded_at <= updated_at)) OR ((status <> ''superseded''::text) AND (superseded_at IS NULL) AND (superseded_by IS NULL) AND (supersede_reason IS NULL))))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check2",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((reviewed_at IS NULL) = (reviewed_by IS NULL)))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check3",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((finalized_at IS NULL) = (finalized_by IS NULL)))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check4",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((status <> ''draft''::text) OR ((reviewed_at IS NULL) AND (finalized_at IS NULL))))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check5",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((status <> ALL (ARRAY[''reviewed''::text, ''finalized''::text])) OR (reviewed_at IS NOT NULL)))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check6",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((status <> ''reviewed''::text) OR (finalized_at IS NULL)))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check7",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((status <> ''finalized''::text) OR (finalized_at IS NOT NULL)))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check8",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((finalized_at IS NULL) OR ((reviewed_at IS NOT NULL) AND (status = ANY (ARRAY[''finalized''::text, ''superseded''::text])))))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check9",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((reviewed_at IS NULL) OR ((reviewed_at >= created_at) AND (reviewed_at <= updated_at))))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_created_by_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (created_by) REFERENCES user_profiles(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_decisions_json_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((jsonb_typeof(decisions_json) = ''array''::text))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_finalized_by_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (finalized_by) REFERENCES user_profiles(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_money_allocation_id_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (money_allocation_id) REFERENCES finance_payment_money_allocations(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_note_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((length(note) <= 2000) AND (note = btrim(note))))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_payment_id_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (payment_id) REFERENCES finance_payments(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_payment_id_revision_key",
        "type": "u",
        "validated": true,
        "deferrable": false,
        "definition": "UNIQUE (payment_id, revision)",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_pkey",
        "type": "p",
        "validated": true,
        "deferrable": false,
        "definition": "PRIMARY KEY (id)",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_previous_id_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (previous_id) REFERENCES finance_vp_revenue_distributions(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_previous_id_key",
        "type": "u",
        "validated": true,
        "deferrable": false,
        "definition": "UNIQUE (previous_id)",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_reviewed_by_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (reviewed_by) REFERENCES user_profiles(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_revision_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((revision > 0))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_source_snapshot_json_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((jsonb_typeof(source_snapshot_json) = ''object''::text))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_status_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((status = ANY (ARRAY[''draft''::text, ''reviewed''::text, ''finalized''::text, ''superseded''::text])))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_supersede_reason_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((length(supersede_reason) <= 2000))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_superseded_by_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (superseded_by) REFERENCES user_profiles(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_version_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((version > 0))",
        "initially_deferred": false
      },
      {
        "name": "vp_distribution_integrity",
        "type": "t",
        "validated": true,
        "deferrable": true,
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED",
        "initially_deferred": true
      }
    ],
    "indexes": [
      {
        "name": "finance_vp_revenue_distributions_payment_id_revision_key",
        "ready": true,
        "valid": true,
        "definition": "CREATE UNIQUE INDEX finance_vp_revenue_distributions_payment_id_revision_key ON public.finance_vp_revenue_distributions USING btree (payment_id, revision)"
      },
      {
        "name": "finance_vp_revenue_distributions_pkey",
        "ready": true,
        "valid": true,
        "definition": "CREATE UNIQUE INDEX finance_vp_revenue_distributions_pkey ON public.finance_vp_revenue_distributions USING btree (id)"
      },
      {
        "name": "finance_vp_revenue_distributions_previous_id_key",
        "ready": true,
        "valid": true,
        "definition": "CREATE UNIQUE INDEX finance_vp_revenue_distributions_previous_id_key ON public.finance_vp_revenue_distributions USING btree (previous_id)"
      },
      {
        "name": "vp_distribution_current_payment",
        "ready": true,
        "valid": true,
        "definition": "CREATE UNIQUE INDEX vp_distribution_current_payment ON public.finance_vp_revenue_distributions USING btree (payment_id) WHERE (status <> ''superseded''::text)"
      },
      {
        "name": "vp_distribution_money_allocation",
        "ready": true,
        "valid": true,
        "definition": "CREATE INDEX vp_distribution_money_allocation ON public.finance_vp_revenue_distributions USING btree (money_allocation_id) WHERE (money_allocation_id IS NOT NULL)"
      }
    ],
    "policies": [
      {
        "name": "vp_distribution_read",
        "check": null,
        "roles": [
          "authenticated"
        ],
        "using": "current_user_can_view_finance_payments()",
        "command": "SELECT",
        "permissive": "PERMISSIVE"
      }
    ],
    "triggers": [
      {
        "name": "vp_distribution_immutable",
        "enabled": "O",
        "definition": "CREATE TRIGGER vp_distribution_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.finance_vp_revenue_distributions FOR EACH ROW EXECUTE FUNCTION vp_distribution_immutable()"
      },
      {
        "name": "vp_distribution_integrity",
        "enabled": "O",
        "definition": "CREATE CONSTRAINT TRIGGER vp_distribution_integrity AFTER INSERT OR UPDATE ON public.finance_vp_revenue_distributions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION vp_distribution_validate()"
      },
      {
        "name": "vp_distribution_no_truncate",
        "enabled": "O",
        "definition": "CREATE TRIGGER vp_distribution_no_truncate BEFORE TRUNCATE ON public.finance_vp_revenue_distributions FOR EACH STATEMENT EXECUTE FUNCTION vp_distribution_immutable()"
      }
    ]
  }
]
'::jsonb)),actual_catalog as(select c.relname as name,c.relkind as kind,c.relrowsecurity as rls,c.relforcerowsecurity as force_rls,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid),'validated',con.convalidated,'deferrable',con.condeferrable,'initially_deferred',con.condeferred) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n') as constraints,
 (select jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(x.indexrelid),'valid',x.indisvalid,'ready',x.indisready) order by i.relname) from pg_index x join pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid) as indexes,
 (select jsonb_agg(jsonb_build_object('name',p.policyname,'command',p.cmd,'roles',p.roles,'using',p.qual,'check',p.with_check,'permissive',p.permissive) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
 (select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal and t.tgname<>'vp_formula_result_guard') as triggers
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit') order by c.relname),
  catalog_differences as(select coalesce(e.value->>'name',a.name) as table_name,e.value as expected,to_jsonb(a) as actual from expected_catalog e full join actual_catalog a on a.name=e.value->>'name' where e.value is distinct from to_jsonb(a)),
 expected_domain_relations(name,kind) as(values ('finance_vp_revenue_distribution_audit','r'),('finance_vp_revenue_distribution_audit_pkey','i'),('vp_distribution_audit_parent','i'),('vp_distribution_audit_version','i'),('finance_vp_revenue_distributions','r'),('finance_vp_revenue_distributions_payment_id_revision_key','i'),('finance_vp_revenue_distributions_pkey','i'),('finance_vp_revenue_distributions_previous_id_key','i'),('vp_distribution_current_payment','i'),('vp_distribution_money_allocation','i')),
 actual_domain_relations as(select c.relname as name,c.relkind::text as kind from pg_class c where c.relnamespace='public'::regnamespace and (c.relname ~ '^(finance_vp_revenue_distribution|vp_distribution_)' or c.relname in(select name from expected_domain_relations))),
 relation_inventory_differences as(select e.name as expected_name,e.kind as expected_kind,a.name as actual_name,a.kind as actual_kind from expected_domain_relations e full join actual_domain_relations a on a.name=e.name where e.name is null or a.name is null or a.kind is distinct from e.kind),
 actual_domain_functions as(select p.oid,p.oid::regprocedure::text as signature from pg_proc p where p.oid not in (select to_regprocedure(s) from unnest(array['public.vp_compensation_formula_catalog()','public.vp_distribution_amount_choices_v1(jsonb,jsonb,boolean)','public.vp_formula_calculate(numeric,text,integer,jsonb,jsonb)','public.vp_formula_result_guard()','public.get_finance_vp_formula_context(uuid)']::text[]) s) and p.pronamespace='public'::regnamespace and (p.proname ~ '^vp_distribution_' or p.proname='guard_vp_distribution_source' or p.proname in ('get_finance_vp_distribution','save_finance_vp_distribution','transition_finance_vp_distribution'))),
 function_inventory_differences as(select e.signature as expected_signature,a.signature as actual_signature from (select * from expected_functions where is_new) e full join actual_domain_functions a on a.oid=to_regprocedure(e.signature) where e.signature is null or a.oid is null),
 distribution_expected_guards(table_name,trigger_name,trigger_type) as (values ('finance_payments','vp_distribution_payment_guard',27),
('finance_invoices','vp_distribution_invoice_guard',27),
('finance_invoice_items','vp_distribution_item_guard',31),
('finance_payment_allocation_reallocations','vp_distribution_reallocation_guard',31),
('finance_payment_invoice_allocations','vp_distribution_raw_guard',31),
('finance_payment_wht_components','vp_distribution_wht_guard',31),
('finance_tax_document_corrections','vp_distribution_correction_guard',31),
('finance_payment_money_allocations','vp_distribution_money_allocation_guard',31),
('finance_payments','vp_distribution_source_no_truncate',34),
('finance_invoices','vp_distribution_source_no_truncate',34),
('finance_invoice_items','vp_distribution_source_no_truncate',34),
('finance_payment_allocation_reallocations','vp_distribution_source_no_truncate',34),
('finance_payment_invoice_allocations','vp_distribution_source_no_truncate',34),
('finance_payment_wht_components','vp_distribution_source_no_truncate',34),
('finance_tax_document_corrections','vp_distribution_source_no_truncate',34),
('finance_payment_money_allocations','vp_distribution_source_no_truncate',34)),
 distribution_actual_guards as(select n.nspname as schema_name,c.relname as table_name,t.tgname as trigger_name,t.tgtype as trigger_type,
 t.tgenabled,t.tgfoid,t.tgisinternal,t.tgdeferrable,t.tginitdeferred,t.tgnargs,t.tgattr::text as columns,t.tgqual,pg_get_triggerdef(t.oid) as definition
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where t.tgfoid=to_regprocedure('public.guard_vp_distribution_source()') or (n.nspname='public' and t.tgname in ('vp_distribution_payment_guard','vp_distribution_invoice_guard','vp_distribution_item_guard','vp_distribution_reallocation_guard','vp_distribution_raw_guard','vp_distribution_wht_guard','vp_distribution_correction_guard','vp_distribution_money_allocation_guard','vp_distribution_source_no_truncate','vp_distribution_source_no_truncate','vp_distribution_source_no_truncate','vp_distribution_source_no_truncate','vp_distribution_source_no_truncate','vp_distribution_source_no_truncate','vp_distribution_source_no_truncate','vp_distribution_source_no_truncate'))),
 distribution_guard_differences as(select e.table_name as expected_table,e.trigger_name as expected_name,e.trigger_type as expected_type,to_jsonb(a) as actual
 from distribution_expected_guards e full join distribution_actual_guards a on a.schema_name='public' and a.table_name=e.table_name and a.trigger_name=e.trigger_name
 where e.table_name is null or a.table_name is null or a.trigger_type is distinct from e.trigger_type or a.tgenabled<>'O'
 or a.tgfoid is distinct from to_regprocedure('public.guard_vp_distribution_source()') or a.tgisinternal or a.tgdeferrable or a.tginitdeferred or a.tgnargs<>0 or a.columns<>'' or a.tgqual is not null),
 checks(name,passed) as(values
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
 ('no_opening_cutover',not exists(select 1 from public.finance_account_opening_balances)),
 ('exact_new_catalog',not exists(select 1 from catalog_differences)),
 ('exact_new_relation_inventory',not exists(select 1 from relation_inventory_differences)),
 ('exact_new_and_preserved_functions',not exists(select 1 from function_differences)),
 ('exact_new_function_inventory',not exists(select 1 from function_inventory_differences)),

 ('source_guards',not exists(select 1 from distribution_guard_differences) and (select count(*)=8 from distribution_actual_guards where (trigger_type & 1)=1)),
 ('source_truncate_guards',not exists(select 1 from distribution_guard_differences) and (select count(*)=8 from distribution_actual_guards where trigger_type=34)),
 ('private_and_rpc_privileges',(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_frozen_source(jsonb,jsonb)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_frozen_source(jsonb,jsonb)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_frozen_source(jsonb,jsonb)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_frozen_source(jsonb,jsonb)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_source(uuid)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_source(uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_source(uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_source(uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_immutable()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_immutable()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_immutable()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_immutable()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.guard_vp_distribution_source()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.guard_vp_distribution_source()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.guard_vp_distribution_source()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.guard_vp_distribution_source()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_validate()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_validate()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_validate()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_validate()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_vp_distribution(uuid)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_vp_distribution(uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.get_finance_vp_distribution(uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.get_finance_vp_distribution(uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE'))),
 ('only_three_authenticated_rpcs',(select count(*)=3 and bool_and(p.proname in ('get_finance_vp_distribution','save_finance_vp_distribution','transition_finance_vp_distribution')) from actual_domain_functions a join pg_proc p on p.oid=a.oid where has_function_privilege('authenticated',p.oid,'EXECUTE'))),
 ('no_anon_execute',not exists(select 1 from actual_domain_functions where has_function_privilege('anon',oid,'EXECUTE'))),
 ('browser_mutation_blocked',(select count(*)=2 and bool_and(relrowsecurity and relkind='r'
 and has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'SELECT WITH GRANT OPTION')
 and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege('authenticated',oid,'INSERT,UPDATE,REFERENCES')
 and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege('anon',oid,'SELECT,INSERT,UPDATE,REFERENCES')
 and not exists(select 1 from aclexplode(coalesce(relacl,acldefault('r',relowner))) acl where acl.grantee=0))
 from pg_class where relnamespace='public'::regnamespace and relname in ('finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit'))),
 ('explicit_read_policies',(select count(*)=2 and count(distinct tablename)=2 and bool_and(cmd='SELECT' and roles=array['authenticated']::name[] and qual='current_user_can_view_finance_payments()' and with_check is null and permissive='PERMISSIVE') from pg_policies where schemaname='public' and tablename in ('finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit'))),
 ('dry_run_upstream_unchanged',nullif(current_setting('vp.distribution045_before',true),'') is null or current_setting('vp.distribution045_before',true)=(select evidence::text from protected)))
 select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as vp_revenue_distribution_foundation_verification_pass,
 (select coalesce(jsonb_agg(to_jsonb(f) order by signature),'[]') from function_differences f) as function_differences,
 (select coalesce(jsonb_agg(to_jsonb(d) order by table_name),'[]') from money_catalog_differences d) as money_catalog_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from money_guard_differences d) as money_guard_differences,
 (select coalesce(jsonb_agg(to_jsonb(d) order by table_name,column_name),'[]') from source_contract_differences d) as missing_source_contracts,
 (select evidence from protected) as upstream_evidence_hashes,
 current_setting('server_version_num')::integer as catalog_server_version_num,
 (select coalesce(jsonb_agg(to_jsonb(d) order by table_name),'[]') from catalog_differences d) as catalog_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from relation_inventory_differences d) as relation_inventory_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_inventory_differences d) as function_inventory_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from distribution_guard_differences d) as source_guard_differences,
 nullif(current_setting('vp.distribution045_before',true),'') is not null as dry_run_baseline_present,
 jsonb_build_object('finance_vp_revenue_distributions',(select count(*) from public.finance_vp_revenue_distributions),'finance_vp_revenue_distribution_audit',(select count(*) from public.finance_vp_revenue_distribution_audit)) as new_rows),
 protected as(select upstream_evidence_hashes || jsonb_build_object('finance_vp_revenue_distributions',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_vp_revenue_distributions r),'finance_vp_revenue_distribution_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_vp_revenue_distribution_audit r)) as evidence from predecessor),
 extra_checks(name,passed) as(values ('exact_formula_functions',not exists(select 1 from function_differences)),
 ('formula_rpc_private_permissions',(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_compensation_formula_catalog()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_compensation_formula_catalog()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_compensation_formula_catalog()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_compensation_formula_catalog()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_amount_choices_v1(jsonb,jsonb,boolean)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_amount_choices_v1(jsonb,jsonb,boolean)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_amount_choices_v1(jsonb,jsonb,boolean)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_amount_choices_v1(jsonb,jsonb,boolean)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_formula_calculate(numeric,text,integer,jsonb,jsonb)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_formula_calculate(numeric,text,integer,jsonb,jsonb)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_formula_calculate(numeric,text,integer,jsonb,jsonb)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_formula_calculate(numeric,text,integer,jsonb,jsonb)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_formula_result_guard()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_formula_result_guard()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_formula_result_guard()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_formula_result_guard()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_vp_formula_context(uuid)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_vp_formula_context(uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.get_finance_vp_formula_context(uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.get_finance_vp_formula_context(uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE'))),
 ('formula_function_inventory',(select count(*)=5 and bool_and(oid in(select to_regprocedure(s) from unnest(array['public.vp_compensation_formula_catalog()','public.vp_distribution_amount_choices_v1(jsonb,jsonb,boolean)','public.vp_formula_calculate(numeric,text,integer,jsonb,jsonb)','public.vp_formula_result_guard()','public.get_finance_vp_formula_context(uuid)']::text[]) s)) from pg_proc where pronamespace='public'::regnamespace and (proname like 'vp_formula_%' or proname in('vp_compensation_formula_catalog','vp_distribution_amount_choices_v1','get_finance_vp_formula_context')))),
 ('mandatory_formula_guard',(select count(*)=1 and bool_and(t.tgrelid='public.finance_vp_revenue_distributions'::regclass and t.tgfoid=to_regprocedure('public.vp_formula_result_guard()') and t.tgtype=23 and t.tgenabled='O' and not t.tgdeferrable and not t.tgisinternal and t.tgqual is null and t.tgnargs=0 and t.tgattr::text='') from pg_trigger t where t.tgname='vp_formula_result_guard' or t.tgfoid=to_regprocedure('public.vp_formula_result_guard()'))),
 ('rollback_evidence_unchanged',nullif(current_setting('vp.formula046_before',true),'') is null or current_setting('vp.formula046_before',true)=(select evidence::text from protected))),
 checks as(select key as name,value='true'::jsonb as passed from predecessor,jsonb_each(checks)
 union all select name,passed is true from extra_checks)
 select (select jsonb_object_agg(name,passed order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where not passed),'[]') from checks) as failed_checks,
 (select bool_and(passed) from checks) as vp_distribution_formula_verification_pass,
 (select evidence from protected) as upstream_evidence_hashes,
 (select to_jsonb(p)-'upstream_evidence_hashes' from predecessor p) as predecessor_diagnostics,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d) as formula_function_differences,
 jsonb_build_object('distribution_rows',(select count(*) from public.finance_vp_revenue_distributions),'distribution_audit_rows',(select count(*) from public.finance_vp_revenue_distribution_audit)) as observability_only,
 current_setting('server_version_num')::integer as server_version_num;
ROLLBACK;
