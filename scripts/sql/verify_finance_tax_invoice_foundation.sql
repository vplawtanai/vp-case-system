-- Phase 6B manual SQL Editor review: ONE SELECT-only statement, ONE result row.
-- No lifecycle RPC calls. No business writes. Global Ledger counts are observation only.
-- Compare protected full-row hashes before/after apply; fixed facts are independently checked.
-- Technical catalog checks cannot verify external/manual VAT coverage or legal tax-point facts.
-- Those remain mandatory human decisions at Issue, not approval granted by this script.
with expected_functions(name,signature,body_hash,definer,callable) as (values
  ('current_user_can_view_finance_tax_invoices','public.current_user_can_view_finance_tax_invoices()','61b920f71b441ab396a6058f9903c903',true,true),
  ('current_user_can_manage_finance_tax_invoices','public.current_user_can_manage_finance_tax_invoices()','d049e03a67dd6c81f2309d134138dcb6',true,true),
  ('current_user_can_issue_finance_tax_invoices','public.current_user_can_issue_finance_tax_invoices()','6a613b3a2687144ca420f2aea28ffa0a',true,true),
  ('protect_finance_tax_invoice_permissions','public.protect_finance_tax_invoice_permissions()','cb5196416e6aa3d43b8f95296750fdcc',true,false),
  ('build_finance_tax_invoice_source','public.build_finance_tax_invoice_source(uuid)','be385f81fd68a12a3929901550ae7106',true,false),
  ('finance_tax_invoice_draft_snapshot','public.finance_tax_invoice_draft_snapshot(jsonb,jsonb,date)','e49e30e3642346e411eb479c3c172521',false,false),
  ('finance_tax_invoice_issue_blockers','public.finance_tax_invoice_issue_blockers(jsonb)','9956fcd2141247a996e3ac72600eff67',false,false),
  ('get_finance_tax_invoice_eligibility','public.get_finance_tax_invoice_eligibility(uuid)','d1517db4abb2c4437225928bee6c8173',true,true),
  ('record_finance_tax_invoice_audit','public.record_finance_tax_invoice_audit(uuid,text,jsonb)','d1d553369d3a1da5db5e1463c7c57ed5',true,false),
  ('create_finance_tax_invoice_draft','public.create_finance_tax_invoice_draft(uuid)','36460837a51d8bf25e3c15c8071cccf8',true,true),
  ('save_finance_tax_invoice_draft','public.save_finance_tax_invoice_draft(uuid,date,jsonb,timestamptz)','982f39ad0345366279a9c49b45a081e3',true,true),
  ('refresh_finance_tax_invoice_draft','public.refresh_finance_tax_invoice_draft(uuid,timestamptz)','dde80410373f2c781a6900b8edc2bbfd',true,true),
  ('issue_finance_tax_invoice','public.issue_finance_tax_invoice(uuid,jsonb,boolean,boolean)','82817a02817e85f05d992ab05ad3f183',true,true),
  ('cancel_finance_tax_invoice_draft','public.cancel_finance_tax_invoice_draft(uuid,text)','f8b815d6f05e1b217e816a1db65fb4b1',true,true),
  ('protect_finance_tax_invoice_history','public.protect_finance_tax_invoice_history()','b901f3edfabaa50b2259d76c531bb2b5',true,false),
  ('validate_finance_tax_invoice_integrity','public.validate_finance_tax_invoice_integrity()','b67d9db41ffb7c4407f62ce5f523eed6',true,false),
  ('assert_finance_tax_invoice_dependencies','public.assert_finance_tax_invoice_dependencies(uuid,uuid[])','e690121c3d9580a526b6fb4403c2a35d',true,false),
  ('guard_finance_tax_invoice_upstream','public.guard_finance_tax_invoice_upstream()','5dd37d44c791f9894cde57b6c25c2cef',true,false),
  ('generate_finance_document_no','public.generate_finance_document_no(text,date)','ab7482a8fee260d784ee579184d59517',true,false),
  ('assert_finance_payment_has_no_downstream_dependencies','public.assert_finance_payment_has_no_downstream_dependencies(uuid)','8fa53aace141bd6f6776cf3a36138ace',true,false),
  ('assert_finance_erroneous_payment_correction_dependencies','public.assert_finance_erroneous_payment_correction_dependencies(uuid)','ba3f4bb61867f1b9377754654c3e87a2',true,false),
  ('assert_finance_payment_reallocation_dependencies','public.assert_finance_payment_reallocation_dependencies(uuid,uuid,uuid)','d417d76282ec8d49036ad7d8e0820931',true,false),
  ('assert_finance_invoice_has_no_void_dependencies','public.assert_finance_invoice_has_no_void_dependencies(uuid)','fa8d75dd42f45c8b8d89350d340861a4',true,false)
), function_facts as (select e.*,p.oid,p.prosecdef,p.proconfig,md5(p.prosrc)=e.body_hash as exact_body,
  coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) as authenticated_execute,
  coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) as anon_execute
  from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)),
expected_tables as (select value as spec from jsonb_array_elements('[
  {
    "name": "finance_tax_invoice_audit_events",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "not_null": true,
        "position": 1,
        "has_default": true,
        "default_expression": "gen_random_uuid()"
      },
      {
        "name": "tax_invoice_id",
        "type": "uuid",
        "not_null": true,
        "position": 2,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "event_type",
        "type": "text",
        "not_null": true,
        "position": 3,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "event_payload_json",
        "type": "jsonb",
        "not_null": true,
        "position": 4,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "actor_user_id",
        "type": "uuid",
        "not_null": true,
        "position": 5,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "not_null": true,
        "position": 6,
        "has_default": true,
        "default_expression": "now()"
      }
    ],
    "constraints": [
      {
        "name": "finance_tax_invoice_audit_events_actor_user_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (actor_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_invoice_audit_events_event_payload_json_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((jsonb_typeof(event_payload_json) = ''object''::text))"
      },
      {
        "name": "finance_tax_invoice_audit_events_event_type_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((event_type = ANY (ARRAY[''draft_created''::text, ''draft_saved''::text, ''draft_refreshed''::text, ''issued''::text, ''cancelled''::text])))"
      },
      {
        "name": "finance_tax_invoice_audit_events_pkey",
        "type": "p",
        "valid": true,
        "definition": "PRIMARY KEY (id)"
      },
      {
        "name": "finance_tax_invoice_audit_events_tax_invoice_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (tax_invoice_id) REFERENCES finance_tax_invoices(id) ON DELETE RESTRICT"
      },
      {
        "name": "tax_invoice_integrity",
        "type": "t",
        "valid": true,
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      }
    ],
    "indexes": [
      {
        "name": "finance_tax_invoice_audit_events_pkey",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX finance_tax_invoice_audit_events_pkey ON public.finance_tax_invoice_audit_events USING btree (id)"
      },
      {
        "name": "tax_invoice_audit_history",
        "valid": true,
        "unique": false,
        "definition": "CREATE INDEX tax_invoice_audit_history ON public.finance_tax_invoice_audit_events USING btree (tax_invoice_id, created_at)"
      }
    ]
  },
  {
    "name": "finance_tax_invoice_items",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "not_null": true,
        "position": 1,
        "has_default": true,
        "default_expression": "gen_random_uuid()"
      },
      {
        "name": "tax_invoice_id",
        "type": "uuid",
        "not_null": true,
        "position": 2,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "invoice_item_id",
        "type": "uuid",
        "not_null": true,
        "position": 3,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "amount_before_vat",
        "type": "numeric(14,2)",
        "not_null": true,
        "position": 4,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "vat_amount",
        "type": "numeric(14,2)",
        "not_null": true,
        "position": 5,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "total_amount",
        "type": "numeric(14,2)",
        "not_null": true,
        "position": 6,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "source_snapshot_json",
        "type": "jsonb",
        "not_null": true,
        "position": 7,
        "has_default": false,
        "default_expression": null
      }
    ],
    "constraints": [
      {
        "name": "finance_tax_invoice_items_amount_before_vat_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((amount_before_vat > (0)::numeric))"
      },
      {
        "name": "finance_tax_invoice_items_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((total_amount = (amount_before_vat + vat_amount)))"
      },
      {
        "name": "finance_tax_invoice_items_invoice_item_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (invoice_item_id) REFERENCES finance_invoice_items(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_invoice_items_pkey",
        "type": "p",
        "valid": true,
        "definition": "PRIMARY KEY (id)"
      },
      {
        "name": "finance_tax_invoice_items_source_snapshot_json_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((jsonb_typeof(source_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_tax_invoice_items_tax_invoice_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (tax_invoice_id) REFERENCES finance_tax_invoices(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_invoice_items_tax_invoice_id_invoice_item_id_key",
        "type": "u",
        "valid": true,
        "definition": "UNIQUE (tax_invoice_id, invoice_item_id)"
      },
      {
        "name": "finance_tax_invoice_items_vat_amount_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((vat_amount >= (0)::numeric))"
      },
      {
        "name": "tax_invoice_integrity",
        "type": "t",
        "valid": true,
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      }
    ],
    "indexes": [
      {
        "name": "finance_tax_invoice_items_pkey",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX finance_tax_invoice_items_pkey ON public.finance_tax_invoice_items USING btree (id)"
      },
      {
        "name": "finance_tax_invoice_items_tax_invoice_id_invoice_item_id_key",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX finance_tax_invoice_items_tax_invoice_id_invoice_item_id_key ON public.finance_tax_invoice_items USING btree (tax_invoice_id, invoice_item_id)"
      }
    ]
  },
  {
    "name": "finance_tax_invoice_source_coverages",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "not_null": true,
        "position": 1,
        "has_default": true,
        "default_expression": "gen_random_uuid()"
      },
      {
        "name": "tax_invoice_id",
        "type": "uuid",
        "not_null": true,
        "position": 2,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "tax_invoice_item_id",
        "type": "uuid",
        "not_null": true,
        "position": 3,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "invoice_item_id",
        "type": "uuid",
        "not_null": true,
        "position": 4,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "tax_point_event_id",
        "type": "uuid",
        "not_null": true,
        "position": 5,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "status",
        "type": "text",
        "not_null": true,
        "position": 6,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "amount_before_vat",
        "type": "numeric(14,2)",
        "not_null": true,
        "position": 7,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "vat_amount",
        "type": "numeric(14,2)",
        "not_null": true,
        "position": 8,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "total_amount",
        "type": "numeric(14,2)",
        "not_null": true,
        "position": 9,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "source_snapshot_json",
        "type": "jsonb",
        "not_null": true,
        "position": 10,
        "has_default": false,
        "default_expression": null
      }
    ],
    "constraints": [
      {
        "name": "finance_tax_invoice_source_coverages_amount_before_vat_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((amount_before_vat > (0)::numeric))"
      },
      {
        "name": "finance_tax_invoice_source_coverages_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((total_amount = (amount_before_vat + vat_amount)))"
      },
      {
        "name": "finance_tax_invoice_source_coverages_invoice_item_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (invoice_item_id) REFERENCES finance_invoice_items(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_invoice_source_coverages_pkey",
        "type": "p",
        "valid": true,
        "definition": "PRIMARY KEY (id)"
      },
      {
        "name": "finance_tax_invoice_source_coverages_source_snapshot_json_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((jsonb_typeof(source_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_tax_invoice_source_coverages_status_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((status = ANY (ARRAY[''reserved''::text, ''issued''::text, ''released''::text])))"
      },
      {
        "name": "finance_tax_invoice_source_coverages_tax_invoice_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (tax_invoice_id) REFERENCES finance_tax_invoices(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_invoice_source_coverages_tax_invoice_item_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (tax_invoice_item_id) REFERENCES finance_tax_invoice_items(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_invoice_source_coverages_tax_invoice_item_id_key",
        "type": "u",
        "valid": true,
        "definition": "UNIQUE (tax_invoice_item_id)"
      },
      {
        "name": "finance_tax_invoice_source_coverages_tax_point_event_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (tax_point_event_id) REFERENCES finance_tax_point_events(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_invoice_source_coverages_vat_amount_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((vat_amount >= (0)::numeric))"
      },
      {
        "name": "tax_invoice_integrity",
        "type": "t",
        "valid": true,
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      }
    ],
    "indexes": [
      {
        "name": "finance_tax_invoice_source_coverages_pkey",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX finance_tax_invoice_source_coverages_pkey ON public.finance_tax_invoice_source_coverages USING btree (id)"
      },
      {
        "name": "finance_tax_invoice_source_coverages_tax_invoice_item_id_key",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX finance_tax_invoice_source_coverages_tax_invoice_item_id_key ON public.finance_tax_invoice_source_coverages USING btree (tax_invoice_item_id)"
      },
      {
        "name": "tax_invoice_coverage_document",
        "valid": true,
        "unique": false,
        "definition": "CREATE INDEX tax_invoice_coverage_document ON public.finance_tax_invoice_source_coverages USING btree (tax_invoice_id)"
      },
      {
        "name": "tax_invoice_full_line_coverage",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX tax_invoice_full_line_coverage ON public.finance_tax_invoice_source_coverages USING btree (invoice_item_id) WHERE (status = ANY (ARRAY[''reserved''::text, ''issued''::text]))"
      }
    ]
  },
  {
    "name": "finance_tax_invoices",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "not_null": true,
        "position": 1,
        "has_default": true,
        "default_expression": "gen_random_uuid()"
      },
      {
        "name": "payment_id",
        "type": "uuid",
        "not_null": true,
        "position": 2,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "invoice_id",
        "type": "uuid",
        "not_null": true,
        "position": 3,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "client_id",
        "type": "uuid",
        "not_null": true,
        "position": 4,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "status",
        "type": "text",
        "not_null": true,
        "position": 5,
        "has_default": true,
        "default_expression": "''draft''::text"
      },
      {
        "name": "tax_invoice_no",
        "type": "text",
        "not_null": false,
        "position": 6,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "issue_date",
        "type": "date",
        "not_null": true,
        "position": 7,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "source_snapshot_json",
        "type": "jsonb",
        "not_null": true,
        "position": 8,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "decisions_json",
        "type": "jsonb",
        "not_null": true,
        "position": 9,
        "has_default": true,
        "default_expression": "''{}''::jsonb"
      },
      {
        "name": "draft_snapshot_json",
        "type": "jsonb",
        "not_null": true,
        "position": 10,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "issued_snapshot_json",
        "type": "jsonb",
        "not_null": false,
        "position": 11,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "issued_at",
        "type": "timestamp with time zone",
        "not_null": false,
        "position": 12,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "issued_by_user_id",
        "type": "uuid",
        "not_null": false,
        "position": 13,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "cancelled_at",
        "type": "timestamp with time zone",
        "not_null": false,
        "position": 14,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "cancel_reason",
        "type": "text",
        "not_null": false,
        "position": 15,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "cancelled_by_user_id",
        "type": "uuid",
        "not_null": false,
        "position": 16,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "not_null": true,
        "position": 17,
        "has_default": true,
        "default_expression": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "not_null": true,
        "position": 18,
        "has_default": true,
        "default_expression": "now()"
      },
      {
        "name": "created_by_user_id",
        "type": "uuid",
        "not_null": true,
        "position": 19,
        "has_default": false,
        "default_expression": null
      }
    ],
    "constraints": [
      {
        "name": "finance_tax_invoices_cancelled_by_user_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (cancelled_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_invoices_client_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_invoices_created_by_user_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (created_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_invoices_decisions_json_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((jsonb_typeof(decisions_json) = ''object''::text))"
      },
      {
        "name": "finance_tax_invoices_draft_snapshot_json_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((jsonb_typeof(draft_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_tax_invoices_invoice_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (invoice_id) REFERENCES finance_invoices(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_invoices_issued_by_user_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (issued_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_invoices_payment_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (payment_id) REFERENCES finance_payments(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_invoices_pkey",
        "type": "p",
        "valid": true,
        "definition": "PRIMARY KEY (id)"
      },
      {
        "name": "finance_tax_invoices_source_snapshot_json_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((jsonb_typeof(source_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_tax_invoices_status_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((status = ANY (ARRAY[''draft''::text, ''issued''::text, ''cancelled''::text])))"
      },
      {
        "name": "finance_tax_invoices_tax_invoice_no_key",
        "type": "u",
        "valid": true,
        "definition": "UNIQUE (tax_invoice_no)"
      },
      {
        "name": "tax_invoice_cancel_evidence",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((((status = ''cancelled''::text) AND (cancelled_at IS NOT NULL) AND (cancelled_by_user_id IS NOT NULL) AND (NULLIF(btrim(cancel_reason), ''''::text) IS NOT NULL)) OR ((status <> ''cancelled''::text) AND (cancelled_at IS NULL) AND (cancelled_by_user_id IS NULL) AND (cancel_reason IS NULL))))"
      },
      {
        "name": "tax_invoice_integrity",
        "type": "t",
        "valid": true,
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      },
      {
        "name": "tax_invoice_lifecycle",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((((status = ANY (ARRAY[''draft''::text, ''cancelled''::text])) AND (tax_invoice_no IS NULL) AND (issued_at IS NULL) AND (issued_by_user_id IS NULL) AND (issued_snapshot_json IS NULL)) OR ((status = ''issued''::text) AND (tax_invoice_no ~ ''^VP-TI-[0-9]{6}-[0-9]{6}$''::text) AND (tax_invoice_no IS NOT NULL) AND (issued_at IS NOT NULL) AND (issued_by_user_id IS NOT NULL) AND (issued_snapshot_json IS NOT NULL) AND (jsonb_typeof(issued_snapshot_json) = ''object''::text))))"
      }
    ],
    "indexes": [
      {
        "name": "finance_tax_invoices_pkey",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX finance_tax_invoices_pkey ON public.finance_tax_invoices USING btree (id)"
      },
      {
        "name": "finance_tax_invoices_tax_invoice_no_key",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX finance_tax_invoices_tax_invoice_no_key ON public.finance_tax_invoices USING btree (tax_invoice_no)"
      },
      {
        "name": "tax_invoice_active_payment",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX tax_invoice_active_payment ON public.finance_tax_invoices USING btree (payment_id) WHERE (status = ANY (ARRAY[''draft''::text, ''issued''::text]))"
      },
      {
        "name": "tax_invoice_source_invoice",
        "valid": true,
        "unique": false,
        "definition": "CREATE INDEX tax_invoice_source_invoice ON public.finance_tax_invoices USING btree (invoice_id)"
      }
    ]
  },
  {
    "name": "finance_tax_point_events",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "not_null": true,
        "position": 1,
        "has_default": true,
        "default_expression": "gen_random_uuid()"
      },
      {
        "name": "tax_invoice_id",
        "type": "uuid",
        "not_null": true,
        "position": 2,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "event_type",
        "type": "text",
        "not_null": true,
        "position": 3,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "occurred_on",
        "type": "date",
        "not_null": true,
        "position": 4,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "evidence_json",
        "type": "jsonb",
        "not_null": true,
        "position": 5,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "approved_at",
        "type": "timestamp with time zone",
        "not_null": false,
        "position": 6,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "approved_by_user_id",
        "type": "uuid",
        "not_null": false,
        "position": 7,
        "has_default": false,
        "default_expression": null
      }
    ],
    "constraints": [
      {
        "name": "finance_tax_point_events_approved_by_user_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (approved_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_point_events_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK (((approved_at IS NULL) = (approved_by_user_id IS NULL)))"
      },
      {
        "name": "finance_tax_point_events_event_type_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((event_type = ''payment_received''::text))"
      },
      {
        "name": "finance_tax_point_events_evidence_json_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((jsonb_typeof(evidence_json) = ''object''::text))"
      },
      {
        "name": "finance_tax_point_events_pkey",
        "type": "p",
        "valid": true,
        "definition": "PRIMARY KEY (id)"
      },
      {
        "name": "finance_tax_point_events_tax_invoice_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (tax_invoice_id) REFERENCES finance_tax_invoices(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_point_events_tax_invoice_id_key",
        "type": "u",
        "valid": true,
        "definition": "UNIQUE (tax_invoice_id)"
      },
      {
        "name": "tax_invoice_integrity",
        "type": "t",
        "valid": true,
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      }
    ],
    "indexes": [
      {
        "name": "finance_tax_point_events_pkey",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX finance_tax_point_events_pkey ON public.finance_tax_point_events USING btree (id)"
      },
      {
        "name": "finance_tax_point_events_tax_invoice_id_key",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX finance_tax_point_events_tax_invoice_id_key ON public.finance_tax_point_events USING btree (tax_invoice_id)"
      }
    ]
  }
]
'::jsonb)),
table_facts as (select e.spec,c.oid,c.relrowsecurity,
  (select jsonb_agg(jsonb_build_object('name',a.attname,'position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
    'has_default',d.oid is not null,'default_expression',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
  -- PostgreSQL 18 adds table NOT NULL catalog rows. Check nullability through attnotnull on every version.
  (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'valid',con.convalidated,'definition',pg_get_constraintdef(con.oid)) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype <> 'n') as constraints,
  (select jsonb_agg(jsonb_build_object('name',idx.relname,'unique',i.indisunique,'valid',i.indisvalid,'definition',pg_get_indexdef(i.indexrelid)) order by idx.relname) from pg_index i join pg_class idx on idx.oid=i.indexrelid where i.indrelid=c.oid) as indexes
  from expected_tables e left join pg_class c on c.oid=to_regclass('public.'||(e.spec->>'name'))),
catalog_objects as (
  select t.spec->>'name' as table_name,part.category,side.source,item.value->>'name' as object_name,item.value as definition
  from table_facts t
  cross join lateral (values ('columns',t.spec->'columns',t.columns),('constraints',t.spec->'constraints',t.constraints),('indexes',t.spec->'indexes',t.indexes)) part(category,expected,actual)
  cross join lateral (values ('expected',part.expected),('actual',part.actual)) side(source,objects)
  cross join lateral jsonb_array_elements(side.objects) item(value)
), catalog_pairs as (
  select coalesce(e.table_name,a.table_name) as table_name,coalesce(e.category,a.category) as category,
    coalesce(e.object_name,a.object_name) as object_name,e.definition as expected,a.definition as actual
  from (select * from catalog_objects where source='expected') e
  full join (select * from catalog_objects where source='actual') a using(table_name,category,object_name)
), catalog_differences as (
  select p.table_name,p.category,p.object_name,d.property,d.expected,d.actual,
    case when p.actual is null then 'missing_object' when p.expected is null then 'unexpected_object' else 'property_mismatch' end as reason
  from catalog_pairs p cross join lateral (
    select null::text as property,p.expected,p.actual where p.expected is null or p.actual is null
    union all
    select coalesce(e.key,a.key),e.value,a.value
    from jsonb_each(p.expected) e full join jsonb_each(p.actual) a using(key)
    where p.expected is not null and p.actual is not null and e.value is distinct from a.value
  ) d
  union all
  select spec->>'name','table',spec->>'name','exists','true'::jsonb,'false'::jsonb,'missing_object'
  from table_facts where oid is null
),
protected_payment as (select * from public.finance_payments where id='9e2f601e-13ef-4165-8e2c-1887c3ad8861'),
protected_invoice as (select * from public.finance_invoices where id='74461042-e3ba-4922-9b64-55aac9ebd8aa'),
protected_receipt as (select * from public.finance_receipts where id='a76cd43d-fe52-4008-ade1-f1d79a9f27bf'),
protected_observation as (select jsonb_build_object(
  'payment',(select to_jsonb(p) from protected_payment p),'invoice',(select to_jsonb(i)-'issued_snapshot_json'-'draft_snapshot_json' from protected_invoice i),
  'receipt',(select to_jsonb(r)-'issued_snapshot_json'-'draft_snapshot_json' from protected_receipt r),
  'payment_hash',(select md5(to_jsonb(p)::text) from protected_payment p),
  'invoice_hash',(select md5(to_jsonb(i)::text) from protected_invoice i),
  'receipt_hash',(select md5(to_jsonb(r)::text) from protected_receipt r),
  'cash_rows',(select count(*) from public.finance_cash_transactions),'opening_rows',(select count(*) from public.finance_account_opening_balances),
  'legacy_ledger_rows',(select count(*) from public.finance_company_ledger),
  'buyer_identity_incomplete',(select nullif(btrim(issued_snapshot_json #>> '{customer,address}'),'') is null from protected_invoice)
) as facts),
protected_checks(name,passed) as (values
  ('protected_payment_unchanged_facts',(select count(*)=1 and coalesce(bool_and(status='confirmed' and cash_amount=4859.81 and wht_amount=140.19 and settlement_amount=5000),false) from protected_payment)),
  ('protected_invoice_unchanged_facts',(select count(*)=1 and coalesce(bool_and(document_status='issued' and invoice_no='VP-IV-202609-000003' and amount_before_vat=4672.90 and vat_amount=327.10 and total_amount=5000),false) from protected_invoice)),
  ('protected_receipt_unchanged_facts',(select count(*)=1 and coalesce(bool_and(status='issued' and receipt_no='VP-RC-202609-000001' and payment_id='9e2f601e-13ef-4165-8e2c-1887c3ad8861' and cash_amount=4859.81 and wht_amount=140.19 and settlement_amount=5000 and issued_snapshot_json->'schema_version'='2'::jsonb),false) from protected_receipt)),
  ('protected_effective_settlement',(select count(*)=1 and coalesce(bool_and(effective_cash_allocated=4859.81 and effective_wht_credit_allocated=140.19 and effective_settlement_total=5000),false) from public.finance_payment_effective_invoice_allocations where payment_id='9e2f601e-13ef-4165-8e2c-1887c3ad8861' and invoice_id='74461042-e3ba-4922-9b64-55aac9ebd8aa')),
  ('protected_no_cash_cutover',not exists(select 1 from public.finance_cash_transactions) and not exists(select 1 from public.finance_account_opening_balances))
),
checks(name,passed) as (select * from protected_checks union all select * from (values
  ('exact_039_functions_and_search_path',(select count(*)=23 and bool_and(oid is not null and exact_body and prosecdef=definer and proconfig @> array['search_path=public']) from function_facts)),
  ('rpc_and_private_grants',(select bool_and(not anon_execute and authenticated_execute=callable) from function_facts)),
  ('exact_tables_columns_constraints_indexes',(select count(*)=5 from table_facts) and not exists(select 1 from catalog_differences)),
  ('rls_and_browser_direct_mutation_blocked',(select bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE') and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) from table_facts)),
  ('only_permission_gated_read_policies',(select count(*)=5 and bool_and(p.cmd='SELECT' and p.roles=array['authenticated']::name[] and p.qual like '%current_user_can_view_finance_tax_invoices%') from pg_policies p join table_facts t on p.tablename=t.spec->>'name' where p.schemaname='public')),
  ('append_only_and_deferred_integrity_triggers',(select count(*)=10 and bool_and(g.tgenabled='O' and ((g.tgname='tax_invoice_history' and g.tgfoid=to_regprocedure('public.protect_finance_tax_invoice_history()')) or (g.tgname='tax_invoice_integrity' and g.tgdeferrable and g.tginitdeferred and g.tgfoid=to_regprocedure('public.validate_finance_tax_invoice_integrity()')))) from pg_trigger g join table_facts t on t.oid=g.tgrelid where not g.tgisinternal)),
  ('upstream_dependency_triggers',(select count(*)=4 and bool_and(tgenabled='O' and tgfoid=to_regprocedure('public.guard_finance_tax_invoice_upstream()')) from pg_trigger where tgname in ('tax_invoice_payment_guard','tax_invoice_invoice_guard','tax_invoice_receipt_guard','tax_invoice_reallocation_guard') and not tgisinternal)),
  ('permission_escalation_guard',(select count(*)=1 and bool_and(tgenabled='O' and tgfoid=to_regprocedure('public.protect_finance_tax_invoice_permissions()')) from pg_trigger where tgname='protect_finance_tax_invoice_permissions' and tgrelid='public.user_profiles'::regclass)),
  ('new_permissions_default_false',(select count(*)=3 and bool_and(data_type='boolean' and is_nullable='NO' and column_default='false') from information_schema.columns where table_schema='public' and table_name='user_profiles' and column_name in ('can_view_finance_tax_invoices','can_manage_finance_tax_invoices','can_issue_finance_tax_invoices'))),
  ('logo_read_policy',(select count(*)=1 and bool_and(cmd='SELECT' and roles=array['authenticated']::name[] and qual like '%current_user_can_view_finance_tax_invoices%' and qual like '%company/logo/%') from pg_policies where schemaname='storage' and tablename='objects' and policyname='tax_invoice_document_logos_read')),
  ('numbering_profile_valid',(select count(*)=1 and coalesce(bool_and(is_active and display_prefix='VP-TI' and period_scope='monthly' and sequence_width=6),false) from public.document_numbering_profiles where document_type='tax_invoice')),('no_tax_invoice_number_consumption',not exists(select 1 from public.finance_document_counters where lower(doc_type) in ('tax_invoice','ti','vp-ti') or prefix like 'VP-TI-%')),
  ('tax_foundation_zero_state',not exists(select 1 from public.finance_tax_invoices) and not exists(select 1 from public.finance_tax_invoice_items) and not exists(select 1 from public.finance_tax_invoice_source_coverages) and not exists(select 1 from public.finance_tax_point_events) and not exists(select 1 from public.finance_tax_invoice_audit_events)),
  ('receipt_038_functions_unchanged',coalesce((select md5(prosrc)='a76bf15714d1c4811e7845033b4afe72' from pg_proc where oid=to_regprocedure('public.document_logo_evidence(text)')),false) and coalesce((select md5(prosrc)='1fe91b4d85e36bdc913b5427f5a8e270' from pg_proc where oid=to_regprocedure('public.build_finance_receipt_source(uuid)')),false))
) v(name,passed))
select (select jsonb_object_agg(name,passed order by name) from checks) as checks,
  (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
  (select facts from protected_observation) as protected_uat_observation,
  coalesce((select bool_and(passed is true) from checks),false) as tax_invoice_foundation_verification_pass,
  current_setting('server_version_num')::integer as catalog_server_version_num,
  (select coalesce(jsonb_agg(to_jsonb(d) order by table_name,category,object_name,property),'[]'::jsonb) from catalog_differences d) as catalog_differences,
  jsonb_build_object('finance_tax_invoices',(select count(*) from public.finance_tax_invoices),'finance_tax_invoice_items',(select count(*) from public.finance_tax_invoice_items),'finance_tax_invoice_source_coverages',(select count(*) from public.finance_tax_invoice_source_coverages),'finance_tax_point_events',(select count(*) from public.finance_tax_point_events),'finance_tax_invoice_audit_events',(select count(*) from public.finance_tax_invoice_audit_events)) as tax_foundation_rows;
