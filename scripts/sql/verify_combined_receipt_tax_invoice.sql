-- ONE SELECT-only statement, ONE result row. No lifecycle calls or business writes.
-- Compare protected_evidence_hashes between preflight and verification.
with expected_functions(signature,hash,callable,security_definer,volatility) as (values ('public.finance_vat_treatment(jsonb,boolean,numeric)','d56bba89766a1ee28411a6854f8c573c',false,false,'i'),
('public.inherit_finance_document_vat_treatment()','ace71258dcef487257373cafea7979de',false,true,'v'),
('public.current_user_can_manage_combined_documents()','45458bdb930da5ddfb43446647a76cbd',true,true,'s'),
('public.current_user_can_view_combined_documents()','a0c66c36abe6728e74a62516a8a21846',true,true,'s'),
('public.current_user_can_issue_combined_documents()','4a0335e8ee913bd3a92a04930e99abad',true,true,'s'),
('public.finance_document_invoice_lines(uuid)','5249d7c4e960e43a5ab134152aae2bb9',false,true,'s'),
('public.finance_payment_document_decision(uuid)','6eb4824bcb031dfd72032bf85f51b041',false,true,'s'),
('public.get_finance_document_decision(uuid)','17a217ed95ffb1cd2efb7262921f0f90',true,true,'v'),
('public.generate_finance_document_no(text,date)','e8930fcf469ccd9980785d55355eef47',false,true,'v'),
('public.receipt_create_pre040(uuid,boolean)','e7a845489934cd709a195c597184da7b',false,true,'v'),
('public.receipt_issue_pre040(uuid,boolean,jsonb)','4bba2218365fa335a69c65a563c86f03',false,true,'v'),
('public.receipt_refresh_pre040(uuid)','99c9e30d64fffcb396dff606b527d856',false,true,'v'),
('public.receipt_cancel_pre040(uuid,text)','5322719551e81b50a970e62e100e45f3',false,true,'v'),
('public.tax_save_pre040(uuid,date,jsonb,timestamptz)','982f39ad0345366279a9c49b45a081e3',false,true,'v'),
('public.tax_refresh_pre040(uuid,timestamptz)','dde80410373f2c781a6900b8edc2bbfd',false,true,'v'),
('public.tax_issue_pre040(uuid,jsonb,boolean,boolean)','82817a02817e85f05d992ab05ad3f183',false,true,'v'),
('public.tax_cancel_pre040(uuid,text)','f8b815d6f05e1b217e816a1db65fb4b1',false,true,'v'),
('public.tax_snapshot_pre040(jsonb,jsonb,date)','e49e30e3642346e411eb479c3c172521',false,false,'i'),
('public.tax_blockers_pre040(jsonb)','9956fcd2141247a996e3ac72600eff67',false,false,'i'),
('public.build_finance_tax_invoice_source(uuid)','a9667d254bb892de408b5651e8168efa',false,true,'v'),
('public.create_finance_receipt_draft_from_payment(uuid,boolean)','49563370979fa03e58a77297082b155a',true,true,'v'),
('public.issue_finance_receipt(uuid,boolean,jsonb)','04ecfe81a3c72f36587f2e7ec06f0a35',true,true,'v'),
('public.create_finance_tax_invoice_draft(uuid)','3b54fd34ce0fbae1b4ba86003d38747b',true,true,'v'),
('public.issue_finance_tax_invoice(uuid,jsonb,boolean,boolean)','db1ea3f2895a8eedb121493d8af86955',true,true,'v'),
('public.save_finance_tax_invoice_draft(uuid,date,jsonb,timestamptz)','b4a61bbaa67b962bc47e1a9ff9b0f926',true,true,'v'),
('public.refresh_finance_tax_invoice_draft(uuid,timestamptz)','ee692ff7b88b02b419ad1b5f957a6680',true,true,'v'),
('public.cancel_finance_tax_invoice_draft(uuid,text)','2f2578bd3d11894fb0fa0adc4dc721a1',true,true,'v'),
('public.refresh_finance_receipt_draft(uuid)','3f79a415985f4701ae91ff7b7a21e2e4',true,true,'v'),
('public.cancel_finance_receipt_draft(uuid,text)','4532b3dd1905ba5b5c98e231d5b0e27d',true,true,'v'),
('public.void_finance_receipt(uuid,text,boolean)','1899822f8a5561379cc46ce002a6b202',true,true,'v'),
('public.validate_finance_tax_invoice_integrity()','e2ee57619fbcc3073d5b4ebfb19c2b43',false,true,'v'),
('public.apply_finance_quotation_draft_item_tax_modes(uuid,jsonb)','65b7bae464e694303e8a82b9027ed098',true,true,'v'),
('public.create_finance_quotation_draft_atomic_v3(uuid,bigint,uuid,date,date,text,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,jsonb)','742aa07f3707f2f8b58cdc83e87cd446',true,true,'v'),
('public.freeze_finance_quotation_commercial_terms_v2()','3d5243c061afd3bfb981d4d13ec7e858',false,true,'v'),
('public.save_finance_billable_charge_draft(uuid,uuid,bigint,uuid,text,text,jsonb,text,numeric,text,numeric,text,date,text,text,numeric,text)','3bc2c9a48b6a591223e49040a0bffd0b',true,true,'v'),
('public.mark_finance_billable_charge_ready(uuid,boolean)','a6f3196da29d750aa29ae46df2aca8ec',true,true,'v'),
('public.build_finance_document_tax_source(uuid)','1629c804cf013b519759d672541d7d09',false,true,'v'),
('public.prepare_finance_document_tax_draft(uuid)','0c759724a38ab2b9f4f88b7eacc94779',false,true,'v'),
('public.assert_finance_document_route(uuid,text)','f97fdb3e752c6f1eee151bb8efe5c150',false,true,'v'),
('public.create_finance_combined_document_draft(uuid,boolean,boolean)','52dc25593bb5f7607f944bfc8e6a8487',true,true,'v'),
('public.save_finance_combined_document_draft(uuid,date,jsonb,timestamptz)','2ce8fb00b598f55b61ddd708c19840ba',true,true,'v'),
('public.issue_finance_combined_document(uuid,jsonb,boolean,boolean,boolean,boolean)','2207c2d70f98db33a2f18eabe05ca624',true,true,'v'),
('public.finance_tax_invoice_draft_snapshot(jsonb,jsonb,date)','bef394e77841bd9e6394511f3eebc7bd',false,false,'i'),
('public.finance_tax_invoice_issue_blockers(jsonb)','e7f592f622ab0494cbf15c160b2807bb',false,false,'i'),
('public.validate_finance_document_tax_integrity(uuid)','d2674f68e33dd69ce59cae9bcccc7c7b',false,true,'v'),
('public.protect_finance_combined_document()','8c0ed16cc4c0b5f2c387c8f73c20c2f2',false,true,'v'),
('public.validate_finance_combined_document()','972428305229c19520c4e9b2004aed62',false,true,'v'),
('public.finance_invoice_document_readiness(uuid)','1164e506e5ac5eb8a27d4a61748fb16d',true,true,'v'),
('public.guard_finance_prospective_invoice_vat()','7cf67c41e96c2e0d4cee6b6a73c75dcb',false,true,'v'),
('public.get_finance_tax_invoice_eligibility(uuid)','03b0ffa9cc202ce870ab799a2691a986',true,true,'v'),
('public.refresh_finance_combined_document_draft(uuid,timestamptz)','d89ddafc6bedf1d621950a427b9cffea',true,true,'v'),
('public.cancel_finance_combined_document_draft(uuid,text)','4844510df3eb3f68faefd73e90d1fddc',true,true,'v')),
 function_facts as (select e.*,p.oid,md5(p.prosrc)=e.hash as exact_body,p.proconfig,p.prosecdef,p.provolatile,
   coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) as authenticated_execute,
   coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) as anon_execute
 from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)), protected_payment as (select * from public.finance_payments where id='9e2f601e-13ef-4165-8e2c-1887c3ad8861'),
 protected_invoice as (select * from public.finance_invoices where id='74461042-e3ba-4922-9b64-55aac9ebd8aa'),
 protected_receipt as (select * from public.finance_receipts where id='a76cd43d-fe52-4008-ade1-f1d79a9f27bf'),
 protected_checks(name,passed) as (values
 ('protected_payment',(select count(*)=1 and coalesce(bool_and(status='confirmed' and cash_amount=4859.81 and wht_amount=140.19 and settlement_amount=5000),false) from protected_payment)),
 ('protected_invoice',(select count(*)=1 and coalesce(bool_and(document_status='issued' and invoice_no='VP-IV-202609-000003' and total_amount=5000 and amount_before_vat=4672.90 and vat_amount=327.10),false) from protected_invoice)),
 ('protected_receipt',(select count(*)=1 and coalesce(bool_and(status='issued' and receipt_no='VP-RC-202609-000001' and payment_id='9e2f601e-13ef-4165-8e2c-1887c3ad8861' and issued_snapshot_json->>'schema_version'='2'),false) from protected_receipt)),
 ('no_cash_cutover',not exists(select 1 from public.finance_cash_transactions) and not exists(select 1 from public.finance_account_opening_balances))
 ),
 expected_catalog as (select value from jsonb_array_elements('[
  {
    "name": "finance_billable_charges",
    "columns": [
      {
        "name": "vat_treatment_json",
        "type": "jsonb",
        "default": null,
        "not_null": false
      }
    ],
    "constraints": [
      {
        "name": "document_vat_evidence_object",
        "type": "c",
        "definition": "CHECK (((vat_treatment_json IS NULL) OR ((jsonb_typeof(vat_treatment_json) = ''object''::text) AND ((vat_treatment_json ->> ''schema_version''::text) = ''1''::text))))"
      }
    ],
    "indexes": null
  },
  {
    "name": "finance_billing_installment_items",
    "columns": [
      {
        "name": "vat_treatment_json",
        "type": "jsonb",
        "default": null,
        "not_null": false
      }
    ],
    "constraints": [
      {
        "name": "document_vat_evidence_object",
        "type": "c",
        "definition": "CHECK (((vat_treatment_json IS NULL) OR ((jsonb_typeof(vat_treatment_json) = ''object''::text) AND ((vat_treatment_json ->> ''schema_version''::text) = ''1''::text))))"
      }
    ],
    "indexes": null
  },
  {
    "name": "finance_combined_document_audit_events",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "not_null": true
      },
      {
        "name": "combined_document_id",
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
        "default": "now()",
        "not_null": true
      }
    ],
    "constraints": [
      {
        "name": "combined_integrity",
        "type": "t",
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      },
      {
        "name": "finance_combined_document_audit_event_combined_document_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (combined_document_id) REFERENCES finance_combined_documents(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_combined_document_audit_events_actor_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (actor_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_combined_document_audit_events_event_payload_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(event_payload_json) = ''object''::text))"
      },
      {
        "name": "finance_combined_document_audit_events_event_type_check",
        "type": "c",
        "definition": "CHECK ((event_type = ANY (ARRAY[''draft_created''::text, ''draft_saved''::text, ''draft_refreshed''::text, ''issued''::text, ''cancelled''::text])))"
      },
      {
        "name": "finance_combined_document_audit_events_pkey",
        "type": "p",
        "definition": "PRIMARY KEY (id)"
      }
    ],
    "indexes": [
      {
        "name": "combined_audit_history",
        "definition": "CREATE INDEX combined_audit_history ON public.finance_combined_document_audit_events USING btree (combined_document_id, created_at)"
      },
      {
        "name": "finance_combined_document_audit_events_pkey",
        "definition": "CREATE UNIQUE INDEX finance_combined_document_audit_events_pkey ON public.finance_combined_document_audit_events USING btree (id)"
      }
    ]
  },
  {
    "name": "finance_combined_documents",
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
        "name": "receipt_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "tax_invoice_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "status",
        "type": "text",
        "default": "''draft''::text",
        "not_null": true
      },
      {
        "name": "combined_no",
        "type": "text",
        "default": null,
        "not_null": false
      },
      {
        "name": "issue_date",
        "type": "date",
        "default": null,
        "not_null": true
      },
      {
        "name": "source_snapshot_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      },
      {
        "name": "draft_snapshot_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      },
      {
        "name": "issued_snapshot_json",
        "type": "jsonb",
        "default": null,
        "not_null": false
      },
      {
        "name": "decisions_json",
        "type": "jsonb",
        "default": "''{}''::jsonb",
        "not_null": true
      },
      {
        "name": "external_receipt_checked",
        "type": "boolean",
        "default": null,
        "not_null": true
      },
      {
        "name": "issued_at",
        "type": "timestamp with time zone",
        "default": null,
        "not_null": false
      },
      {
        "name": "issued_by_user_id",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "created_by_user_id",
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
        "name": "updated_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "not_null": true
      },
      {
        "name": "cancel_reason",
        "type": "text",
        "default": null,
        "not_null": false
      }
    ],
    "constraints": [
      {
        "name": "combined_cancel_reason",
        "type": "c",
        "definition": "CHECK (((status = ''cancelled''::text) = (NULLIF(btrim(cancel_reason), ''''::text) IS NOT NULL)))"
      },
      {
        "name": "combined_integrity",
        "type": "t",
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      },
      {
        "name": "combined_lifecycle",
        "type": "c",
        "definition": "CHECK ((((status = ANY (ARRAY[''draft''::text, ''cancelled''::text])) AND (combined_no IS NULL) AND (issued_at IS NULL) AND (issued_by_user_id IS NULL) AND (issued_snapshot_json IS NULL)) OR ((status = ''issued''::text) AND (combined_no IS NOT NULL) AND (combined_no ~ ''^VP-RTI-[0-9]{6}-[0-9]{6}$''::text) AND (issued_at IS NOT NULL) AND (issued_by_user_id IS NOT NULL) AND (issued_snapshot_json IS NOT NULL) AND (jsonb_typeof(issued_snapshot_json) = ''object''::text))))"
      },
      {
        "name": "finance_combined_documents_combined_no_key",
        "type": "u",
        "definition": "UNIQUE (combined_no)"
      },
      {
        "name": "finance_combined_documents_created_by_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (created_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_combined_documents_decisions_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(decisions_json) = ''object''::text))"
      },
      {
        "name": "finance_combined_documents_draft_snapshot_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(draft_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_combined_documents_issued_by_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (issued_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_combined_documents_payment_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (payment_id) REFERENCES finance_payments(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_combined_documents_pkey",
        "type": "p",
        "definition": "PRIMARY KEY (id)"
      },
      {
        "name": "finance_combined_documents_receipt_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (receipt_id) REFERENCES finance_receipts(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED"
      },
      {
        "name": "finance_combined_documents_receipt_id_key",
        "type": "u",
        "definition": "UNIQUE (receipt_id)"
      },
      {
        "name": "finance_combined_documents_source_snapshot_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(source_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_combined_documents_status_check",
        "type": "c",
        "definition": "CHECK ((status = ANY (ARRAY[''draft''::text, ''issued''::text, ''cancelled''::text])))"
      },
      {
        "name": "finance_combined_documents_tax_invoice_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (tax_invoice_id) REFERENCES finance_tax_invoices(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED"
      },
      {
        "name": "finance_combined_documents_tax_invoice_id_key",
        "type": "u",
        "definition": "UNIQUE (tax_invoice_id)"
      }
    ],
    "indexes": [
      {
        "name": "combined_active_payment",
        "definition": "CREATE UNIQUE INDEX combined_active_payment ON public.finance_combined_documents USING btree (payment_id) WHERE (status = ANY (ARRAY[''draft''::text, ''issued''::text]))"
      },
      {
        "name": "finance_combined_documents_combined_no_key",
        "definition": "CREATE UNIQUE INDEX finance_combined_documents_combined_no_key ON public.finance_combined_documents USING btree (combined_no)"
      },
      {
        "name": "finance_combined_documents_pkey",
        "definition": "CREATE UNIQUE INDEX finance_combined_documents_pkey ON public.finance_combined_documents USING btree (id)"
      },
      {
        "name": "finance_combined_documents_receipt_id_key",
        "definition": "CREATE UNIQUE INDEX finance_combined_documents_receipt_id_key ON public.finance_combined_documents USING btree (receipt_id)"
      },
      {
        "name": "finance_combined_documents_tax_invoice_id_key",
        "definition": "CREATE UNIQUE INDEX finance_combined_documents_tax_invoice_id_key ON public.finance_combined_documents USING btree (tax_invoice_id)"
      }
    ]
  },
  {
    "name": "finance_fee_agreement_items",
    "columns": [
      {
        "name": "vat_treatment_json",
        "type": "jsonb",
        "default": null,
        "not_null": false
      }
    ],
    "constraints": [
      {
        "name": "document_vat_evidence_object",
        "type": "c",
        "definition": "CHECK (((vat_treatment_json IS NULL) OR ((jsonb_typeof(vat_treatment_json) = ''object''::text) AND ((vat_treatment_json ->> ''schema_version''::text) = ''1''::text))))"
      }
    ],
    "indexes": null
  },
  {
    "name": "finance_invoice_items",
    "columns": [
      {
        "name": "vat_treatment_json",
        "type": "jsonb",
        "default": null,
        "not_null": false
      }
    ],
    "constraints": [
      {
        "name": "document_vat_evidence_object",
        "type": "c",
        "definition": "CHECK (((vat_treatment_json IS NULL) OR ((jsonb_typeof(vat_treatment_json) = ''object''::text) AND ((vat_treatment_json ->> ''schema_version''::text) = ''1''::text))))"
      }
    ],
    "indexes": null
  },
  {
    "name": "finance_quotation_items",
    "columns": [
      {
        "name": "vat_treatment_json",
        "type": "jsonb",
        "default": null,
        "not_null": false
      }
    ],
    "constraints": [
      {
        "name": "document_vat_evidence_object",
        "type": "c",
        "definition": "CHECK (((vat_treatment_json IS NULL) OR ((jsonb_typeof(vat_treatment_json) = ''object''::text) AND ((vat_treatment_json ->> ''schema_version''::text) = ''1''::text))))"
      }
    ],
    "indexes": null
  },
  {
    "name": "finance_receipts",
    "columns": [
      {
        "name": "combined_document_id",
        "type": "uuid",
        "default": null,
        "not_null": false
      }
    ],
    "constraints": [
      {
        "name": "finance_receipts_combined_document_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (combined_document_id) REFERENCES finance_combined_documents(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED"
      },
      {
        "name": "finance_receipts_combined_document_id_key",
        "type": "u",
        "definition": "UNIQUE (combined_document_id)"
      },
      {
        "name": "finance_receipts_lifecycle_check",
        "type": "c",
        "definition": "CHECK ((((status = ANY (ARRAY[''draft''::text, ''cancelled''::text])) AND (receipt_no IS NULL) AND (issued_at IS NULL) AND (issued_by_user_id IS NULL) AND (issued_snapshot_json IS NULL)) OR ((status = ANY (ARRAY[''issued''::text, ''voided''::text])) AND (receipt_no IS NOT NULL) AND (((combined_document_id IS NULL) AND (receipt_no ~ ''^VP-RC-[0-9]{6}-[0-9]{6}$''::text)) OR ((combined_document_id IS NOT NULL) AND (status = ''issued''::text) AND (receipt_no ~ ''^VP-RTI-[0-9]{6}-[0-9]{6}$''::text))) AND (issued_at IS NOT NULL) AND (issued_by_user_id IS NOT NULL) AND (issued_snapshot_json IS NOT NULL) AND (jsonb_typeof(issued_snapshot_json) = ''object''::text) AND (issued_snapshot_json <> ''{}''::jsonb))))"
      }
    ],
    "indexes": [
      {
        "name": "finance_receipts_combined_document_id_key",
        "definition": "CREATE UNIQUE INDEX finance_receipts_combined_document_id_key ON public.finance_receipts USING btree (combined_document_id)"
      }
    ]
  },
  {
    "name": "finance_tax_invoices",
    "columns": [
      {
        "name": "combined_document_id",
        "type": "uuid",
        "default": null,
        "not_null": false
      }
    ],
    "constraints": [
      {
        "name": "finance_tax_invoices_combined_document_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (combined_document_id) REFERENCES finance_combined_documents(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED"
      },
      {
        "name": "finance_tax_invoices_combined_document_id_key",
        "type": "u",
        "definition": "UNIQUE (combined_document_id)"
      },
      {
        "name": "tax_invoice_lifecycle",
        "type": "c",
        "definition": "CHECK ((((status = ANY (ARRAY[''draft''::text, ''cancelled''::text])) AND (tax_invoice_no IS NULL) AND (issued_at IS NULL) AND (issued_by_user_id IS NULL) AND (issued_snapshot_json IS NULL)) OR ((status = ''issued''::text) AND (tax_invoice_no IS NOT NULL) AND (((combined_document_id IS NULL) AND (tax_invoice_no ~ ''^VP-TI-[0-9]{6}-[0-9]{6}$''::text)) OR ((combined_document_id IS NOT NULL) AND (tax_invoice_no ~ ''^VP-RTI-[0-9]{6}-[0-9]{6}$''::text))) AND (issued_at IS NOT NULL) AND (issued_by_user_id IS NOT NULL) AND (issued_snapshot_json IS NOT NULL) AND (jsonb_typeof(issued_snapshot_json) = ''object''::text))))"
      }
    ],
    "indexes": [
      {
        "name": "finance_tax_invoices_combined_document_id_key",
        "definition": "CREATE UNIQUE INDEX finance_tax_invoices_combined_document_id_key ON public.finance_tax_invoices USING btree (combined_document_id)"
      }
    ]
  }
]
'::jsonb)), actual_catalog as (select c.relname as name,
  (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      and (c.relname in ('finance_combined_documents','finance_combined_document_audit_events') or a.attname in ('combined_document_id','vat_treatment_json'))) as columns,
  (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid)) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n'
    and (c.relname in ('finance_combined_documents','finance_combined_document_audit_events') or con.conname in ('document_vat_evidence_object','finance_receipts_lifecycle_check','tax_invoice_lifecycle') or con.conname like '%combined_document_id%')) as constraints,
  (select jsonb_agg(jsonb_build_object('name',idx.relname,'definition',pg_get_indexdef(ix.indexrelid)) order by idx.relname) from pg_index ix join pg_class idx on idx.oid=ix.indexrelid where ix.indrelid=c.oid
    and (c.relname in ('finance_combined_documents','finance_combined_document_audit_events') or idx.relname like '%combined_document_id%')) as indexes
  from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('finance_combined_documents','finance_combined_document_audit_events','finance_receipts','finance_tax_invoices','finance_quotation_items','finance_fee_agreement_items','finance_billing_installment_items','finance_billable_charges','finance_invoice_items') order by c.relname),
 catalog_differences as (select e.value->>'name' as table_name,e.value as expected,to_jsonb(a) as actual from expected_catalog e
   full join actual_catalog a on a.name=e.value->>'name' where e.value is distinct from to_jsonb(a)),
 checks(name,passed) as (select * from protected_checks union all select * from (values
 ('exact_040_functions',(select count(*)=52 and bool_and(oid is not null and exact_body and prosecdef=security_definer and provolatile::text=volatility and proconfig @> array['search_path=public']) from function_facts)),
 ('private_and_rpc_privileges',(select bool_and(not anon_execute and authenticated_execute=callable) from function_facts)),
 ('exact_new_catalog',not exists(select 1 from catalog_differences)),
 ('new_rls_direct_mutation_blocked',(select count(*)=2 and bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE') and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) from pg_class where oid=any(array['public.finance_combined_documents'::regclass,'public.finance_combined_document_audit_events'::regclass]))),
 ('paired_deferred_guards',(select count(*)=4 and bool_and(tgdeferrable and tginitdeferred and tgenabled='O' and tgfoid='public.validate_finance_combined_document()'::regprocedure and tgrelid in ('public.finance_combined_documents'::regclass,'public.finance_combined_document_audit_events'::regclass,'public.finance_receipts'::regclass,'public.finance_tax_invoices'::regclass)) from pg_trigger where tgname='combined_integrity')),
 ('explicit_read_policies',(select count(*)=2 and bool_and(cmd='SELECT' and roles=array['authenticated']::name[] and qual='current_user_can_view_combined_documents()' and with_check is null) from pg_policies where schemaname='public' and tablename in ('finance_combined_documents','finance_combined_document_audit_events'))),
 ('vat_propagation_triggers',(select count(*)=5 and bool_and(tgenabled='O' and tgtype=23 and tgfoid='public.inherit_finance_document_vat_treatment()'::regprocedure) from pg_trigger where tgname='z_document_vat_inherit')),
 ('invoice_issue_vat_guard',(select count(*)=1 and bool_and(tgenabled='O' and tgtype=19 and tgfoid='public.guard_finance_prospective_invoice_vat()'::regprocedure and tgrelid='public.finance_invoices'::regclass) from pg_trigger where tgname='document_vat_issue_guard')),
 ('new_zero_state',not exists(select 1 from public.finance_combined_documents) and not exists(select 1 from public.finance_combined_document_audit_events)),
 ('no_standalone_reinterpretation',not exists(select 1 from public.finance_receipts where combined_document_id is not null) and not exists(select 1 from public.finance_tax_invoices where combined_document_id is not null)),
 ('rti_profile',(select count(*)=1 and bool_and(display_prefix='VP-RTI' and period_scope='monthly' and sequence_width=6 and is_active) from public.document_numbering_profiles where document_type='receipt_tax_invoice')),
 ('no_rti_number_consumed',not exists(select 1 from public.finance_document_counters where doc_type='receipt_tax_invoice' or prefix like 'VP-RTI-%')),
 ('prospective_columns',(select count(*)=5 from information_schema.columns where table_schema='public' and table_name in ('finance_quotation_items','finance_fee_agreement_items','finance_billing_installment_items','finance_billable_charges','finance_invoice_items') and column_name='vat_treatment_json' and data_type='jsonb' and is_nullable='YES'))
 ) x(name,passed)) select (select jsonb_object_agg(name,passed order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as combined_receipt_tax_invoice_foundation_verification_pass,
 jsonb_build_object('payment',(select md5(to_jsonb(p)::text) from protected_payment p),'invoice',(select md5(to_jsonb(i)::text) from protected_invoice i),
   'receipt',(select md5((to_jsonb(r)-'combined_document_id')::text) from protected_receipt r)) as protected_evidence_hashes,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) as catalog_differences,
 (select coalesce(jsonb_agg(signature),'[]') from function_facts where oid is null or exact_body is distinct from true or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or not coalesce(proconfig @> array['search_path=public'],false)) as function_differences,
 jsonb_build_object('finance_combined_documents',(select count(*) from public.finance_combined_documents),'finance_combined_document_audit_events',(select count(*) from public.finance_combined_document_audit_events)) as combined_rows;
