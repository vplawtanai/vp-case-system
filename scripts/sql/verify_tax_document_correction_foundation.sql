-- ONE SELECT-only statement / ONE result row. No application RPC calls.
-- Compare protected_evidence_and_counters_hash before and after apply. Stop on any failed check.
with expected_functions(signature,hash,security_definer,volatility) as (values ('public.confirm_finance_payment(uuid,boolean)','deae5aa01dc48eb0faa64afa82bca8b7',true,'v'),
('public.reverse_finance_payment(uuid,text)','ef2a35fb3570b503f7447614885b81b2',true,'v'),
('public.issue_finance_receipt(uuid,boolean,jsonb)','04ecfe81a3c72f36587f2e7ec06f0a35',true,'v'),
('public.void_finance_receipt(uuid,text,boolean)','1899822f8a5561379cc46ce002a6b202',true,'v'),
('public.generate_finance_document_no(text,date)','e8930fcf469ccd9980785d55355eef47',true,'v'),
('public.document_logo_evidence(text)','a76bf15714d1c4811e7845033b4afe72',true,'v'),
('public.issue_finance_tax_invoice(uuid,jsonb,boolean,boolean)','db1ea3f2895a8eedb121493d8af86955',true,'v'),
('public.get_finance_document_decision(uuid)','17a217ed95ffb1cd2efb7262921f0f90',true,'v'),
('public.issue_finance_combined_document(uuid,jsonb,boolean,boolean,boolean,boolean)','2207c2d70f98db33a2f18eabe05ca624',true,'v'),
('public.validate_finance_combined_document()','972428305229c19520c4e9b2004aed62',true,'v'),
('public.refresh_finance_combined_document_draft(uuid,timestamptz)','d89ddafc6bedf1d621950a427b9cffea',true,'v'),
('public.finance_customer_tax_identity(uuid)','259e4e1c344e24a112eaecd86bc0f6d6',true,'s'),
('public.get_finance_customer_tax_profile(uuid)','b0f24853759ff637123268398ca5cdba',true,'s'),
('public.tax_correction_authorized(boolean,text)','631685cb02d6f5341a7c3833e6e1c96c',true,'s'),
('public.tax_correction_immutable()','79e399a2ccc65a57c2de196a2b911c4b',false,'v'),
('public.tax_correction_source(uuid,uuid)','da2b8b3f4c32f445d7308d21215f0964',true,'v'),
('public.create_finance_tax_correction_draft(uuid,uuid,uuid,text,text,text,text,date,date,jsonb)','0390f91b1d0de3fab08bb229aa1c4bca',true,'v'),
('public.approve_finance_tax_correction(uuid,jsonb,boolean,text,boolean)','6c4e70d92395d516fc7ce197a5f533f5',true,'v'),
('public.tax_correction_number(text,date)','e5a4d61c92df8799fd184f0934702693',true,'v'),
('public.issue_finance_tax_correction(uuid,jsonb,boolean,boolean)','b411350ebe4282d5523abb0716fb4087',true,'v'),
('public.cancel_finance_tax_correction_draft(uuid,text)','21275a37b590ff3b2c2460ceb5da7cf6',true,'v'),
('public.validate_tax_correction_document()','d723374037458f3a6de08361ad71fd14',true,'v'),
('public.get_finance_tax_correction_context(uuid,uuid)','b374fb20853762140b79eb9e1a79bce8',true,'s')),
 function_facts as (select e.*,p.oid,md5(p.prosrc)=e.hash as exact_body,p.proconfig,p.prosecdef,p.provolatile
 from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)),
 function_differences as (select * from function_facts where oid is null or exact_body is distinct from true or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or not coalesce(proconfig @> array['search_path=public'],false)),protected_evidence as (select jsonb_build_object(
 'combined',(select to_jsonb(c) from public.finance_combined_documents c where id='d903b209-1e29-4a60-a453-032611a7202f'),
 'tax',(select to_jsonb(t) from public.finance_tax_invoices t where id=(select tax_invoice_id from public.finance_combined_documents where id='d903b209-1e29-4a60-a453-032611a7202f')),
 'receipt',(select to_jsonb(r) from public.finance_receipts r where id=(select receipt_id from public.finance_combined_documents where id='d903b209-1e29-4a60-a453-032611a7202f')),
 'invoice',(select to_jsonb(i) from public.finance_invoices i where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6'),
 'payment',(select to_jsonb(p) from public.finance_payments p where id='95e22d0e-1996-4f16-98e4-218db1cbd857'),
 'client',(select to_jsonb(c) from public.clients c where id=(select client_id from public.finance_invoices where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6')),
 'profile',(select to_jsonb(p) from public.finance_customer_tax_profiles p where client_id=(select client_id from public.finance_invoices where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6')),
 'counters',(select coalesce(jsonb_agg(to_jsonb(c) order by c.doc_type,c.year,c.month),'[]') from public.finance_document_counters c)
 ) as evidence),protected_checks(name,passed) as (values
 ('protected_combined_draft',(select count(*)=1 and bool_and(status='draft' and combined_no is null and issued_at is null and payment_id='95e22d0e-1996-4f16-98e4-218db1cbd857') from public.finance_combined_documents where id='d903b209-1e29-4a60-a453-032611a7202f')),
 ('protected_invoice',(select count(*)=1 and bool_and(document_status='issued' and invoice_no='VP-IV-202609-000004' and total_amount=19280 and amount_before_vat=18672.90 and vat_amount=607.10) from public.finance_invoices where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6')),
 ('protected_payment',(select count(*)=1 and bool_and(status='confirmed' and cash_amount=19160 and wht_amount=120 and settlement_amount=19280) from public.finance_payments where id='95e22d0e-1996-4f16-98e4-218db1cbd857')),
 ('no_cash_cutover',not exists(select 1 from public.finance_cash_transactions) and not exists(select 1 from public.finance_account_opening_balances)),
 ('existing_number_profiles_compatible',(select count(*)=2 and bool_and(is_active and period_scope='monthly' and sequence_width=6 and display_prefix=case document_type when 'tax_invoice' then 'VP-TI' else 'VP-RTI' end) from public.document_numbering_profiles where document_type in ('tax_invoice','receipt_tax_invoice')))),
 expected_catalog as (select value from jsonb_array_elements('[
  {
    "name": "finance_tax_correction_audit_events",
    "rls": true,
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "not_null": true
      },
      {
        "name": "correction_id",
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
        "name": "finance_tax_correction_audit_events_actor_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (actor_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_correction_audit_events_correction_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (correction_id) REFERENCES finance_tax_document_corrections(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_correction_audit_events_event_type_check",
        "type": "c",
        "definition": "CHECK ((event_type = ANY (ARRAY[''draft_created''::text, ''approved''::text, ''issued''::text, ''cancelled''::text, ''replacement_linked''::text, ''copy_issued''::text])))"
      },
      {
        "name": "finance_tax_correction_audit_events_pkey",
        "type": "p",
        "definition": "PRIMARY KEY (id)"
      }
    ],
    "indexes": [
      {
        "name": "finance_tax_correction_audit_events_pkey",
        "definition": "CREATE UNIQUE INDEX finance_tax_correction_audit_events_pkey ON public.finance_tax_correction_audit_events USING btree (id)"
      },
      {
        "name": "tax_correction_audit_history",
        "definition": "CREATE INDEX tax_correction_audit_history ON public.finance_tax_correction_audit_events USING btree (correction_id, created_at)"
      }
    ],
    "policies": [
      {
        "name": "tax_correction_audit_read",
        "check": null,
        "roles": [
          "authenticated"
        ],
        "using": "(EXISTS ( SELECT 1\n   FROM finance_tax_document_corrections c\n  WHERE (c.id = finance_tax_correction_audit_events.correction_id)))",
        "command": "SELECT"
      }
    ],
    "triggers": [
      {
        "name": "tax_correction_history",
        "enabled": "O",
        "definition": "CREATE TRIGGER tax_correction_history BEFORE DELETE OR UPDATE ON public.finance_tax_correction_audit_events FOR EACH ROW EXECUTE FUNCTION tax_correction_immutable()"
      }
    ]
  },
  {
    "name": "finance_tax_correction_documents",
    "rls": true,
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "document_type",
        "type": "text",
        "default": null,
        "not_null": true
      },
      {
        "name": "document_no",
        "type": "text",
        "default": null,
        "not_null": true
      },
      {
        "name": "document_date",
        "type": "date",
        "default": null,
        "not_null": true
      },
      {
        "name": "issued_at",
        "type": "timestamp with time zone",
        "default": null,
        "not_null": true
      },
      {
        "name": "issued_by_user_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "copy_sequence",
        "type": "integer",
        "default": null,
        "not_null": false
      },
      {
        "name": "issued_snapshot_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      }
    ],
    "constraints": [
      {
        "name": "finance_tax_correction_documents_check",
        "type": "c",
        "definition": "CHECK (((document_type = ''replacement_copy''::text) = ((copy_sequence IS NOT NULL) AND (copy_sequence > 0))))"
      },
      {
        "name": "finance_tax_correction_documents_document_type_check",
        "type": "c",
        "definition": "CHECK ((document_type = ANY (ARRAY[''credit_note''::text, ''debit_note''::text, ''tax_invoice''::text, ''receipt_tax_invoice''::text, ''replacement_copy''::text])))"
      },
      {
        "name": "finance_tax_correction_documents_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (id) REFERENCES finance_tax_document_corrections(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_correction_documents_issued_by_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (issued_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_correction_documents_issued_snapshot_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(issued_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_tax_correction_documents_pkey",
        "type": "p",
        "definition": "PRIMARY KEY (id)"
      },
      {
        "name": "tax_correction_integrity",
        "type": "t",
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      }
    ],
    "indexes": [
      {
        "name": "finance_tax_correction_documents_pkey",
        "definition": "CREATE UNIQUE INDEX finance_tax_correction_documents_pkey ON public.finance_tax_correction_documents USING btree (id)"
      },
      {
        "name": "tax_correction_copy_sequence",
        "definition": "CREATE UNIQUE INDEX tax_correction_copy_sequence ON public.finance_tax_correction_documents USING btree (document_no, copy_sequence) WHERE (document_type = ''replacement_copy''::text)"
      },
      {
        "name": "tax_correction_permanent_number",
        "definition": "CREATE UNIQUE INDEX tax_correction_permanent_number ON public.finance_tax_correction_documents USING btree (document_no) WHERE (document_type <> ''replacement_copy''::text)"
      }
    ],
    "policies": [
      {
        "name": "tax_correction_document_read",
        "check": null,
        "roles": [
          "authenticated"
        ],
        "using": "(EXISTS ( SELECT 1\n   FROM finance_tax_document_corrections c\n  WHERE (c.id = finance_tax_correction_documents.id)))",
        "command": "SELECT"
      }
    ],
    "triggers": [
      {
        "name": "tax_correction_history",
        "enabled": "O",
        "definition": "CREATE TRIGGER tax_correction_history BEFORE DELETE OR UPDATE ON public.finance_tax_correction_documents FOR EACH ROW EXECUTE FUNCTION tax_correction_immutable()"
      },
      {
        "name": "tax_correction_integrity",
        "enabled": "O",
        "definition": "CREATE CONSTRAINT TRIGGER tax_correction_integrity AFTER INSERT ON public.finance_tax_correction_documents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_tax_correction_document()"
      }
    ]
  },
  {
    "name": "finance_tax_correction_lines",
    "rls": true,
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "not_null": true
      },
      {
        "name": "correction_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "original_tax_invoice_item_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "base_change",
        "type": "numeric(14,2)",
        "default": null,
        "not_null": true
      },
      {
        "name": "vat_change",
        "type": "numeric(14,2)",
        "default": null,
        "not_null": true
      },
      {
        "name": "previous_base",
        "type": "numeric(14,2)",
        "default": null,
        "not_null": true
      },
      {
        "name": "previous_vat",
        "type": "numeric(14,2)",
        "default": null,
        "not_null": true
      },
      {
        "name": "resulting_base",
        "type": "numeric(14,2)",
        "default": null,
        "not_null": true
      },
      {
        "name": "resulting_vat",
        "type": "numeric(14,2)",
        "default": null,
        "not_null": true
      },
      {
        "name": "source_snapshot_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      }
    ],
    "constraints": [
      {
        "name": "finance_tax_correction_lines_base_change_check",
        "type": "c",
        "definition": "CHECK ((base_change > (0)::numeric))"
      },
      {
        "name": "finance_tax_correction_lines_correction_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (correction_id) REFERENCES finance_tax_document_corrections(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_correction_lines_correction_id_original_tax_inv_key",
        "type": "u",
        "definition": "UNIQUE (correction_id, original_tax_invoice_item_id)"
      },
      {
        "name": "finance_tax_correction_lines_original_tax_invoice_item_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (original_tax_invoice_item_id) REFERENCES finance_tax_invoice_items(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_correction_lines_pkey",
        "type": "p",
        "definition": "PRIMARY KEY (id)"
      },
      {
        "name": "finance_tax_correction_lines_previous_base_check",
        "type": "c",
        "definition": "CHECK ((previous_base >= (0)::numeric))"
      },
      {
        "name": "finance_tax_correction_lines_previous_vat_check",
        "type": "c",
        "definition": "CHECK ((previous_vat >= (0)::numeric))"
      },
      {
        "name": "finance_tax_correction_lines_resulting_base_check",
        "type": "c",
        "definition": "CHECK ((resulting_base >= (0)::numeric))"
      },
      {
        "name": "finance_tax_correction_lines_resulting_vat_check",
        "type": "c",
        "definition": "CHECK ((resulting_vat >= (0)::numeric))"
      },
      {
        "name": "finance_tax_correction_lines_vat_change_check",
        "type": "c",
        "definition": "CHECK ((vat_change >= (0)::numeric))"
      },
      {
        "name": "tax_correction_integrity",
        "type": "t",
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      }
    ],
    "indexes": [
      {
        "name": "finance_tax_correction_lines_correction_id_original_tax_inv_key",
        "definition": "CREATE UNIQUE INDEX finance_tax_correction_lines_correction_id_original_tax_inv_key ON public.finance_tax_correction_lines USING btree (correction_id, original_tax_invoice_item_id)"
      },
      {
        "name": "finance_tax_correction_lines_pkey",
        "definition": "CREATE UNIQUE INDEX finance_tax_correction_lines_pkey ON public.finance_tax_correction_lines USING btree (id)"
      }
    ],
    "policies": [
      {
        "name": "tax_correction_line_read",
        "check": null,
        "roles": [
          "authenticated"
        ],
        "using": "(EXISTS ( SELECT 1\n   FROM finance_tax_document_corrections c\n  WHERE (c.id = finance_tax_correction_lines.correction_id)))",
        "command": "SELECT"
      }
    ],
    "triggers": [
      {
        "name": "tax_correction_history",
        "enabled": "O",
        "definition": "CREATE TRIGGER tax_correction_history BEFORE DELETE OR UPDATE ON public.finance_tax_correction_lines FOR EACH ROW EXECUTE FUNCTION tax_correction_immutable()"
      },
      {
        "name": "tax_correction_integrity",
        "enabled": "O",
        "definition": "CREATE CONSTRAINT TRIGGER tax_correction_integrity AFTER INSERT ON public.finance_tax_correction_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_tax_correction_document()"
      }
    ]
  },
  {
    "name": "finance_tax_document_corrections",
    "rls": true,
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "not_null": true
      },
      {
        "name": "request_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "original_tax_invoice_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "original_combined_document_id",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "original_receipt_id",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "invoice_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "payment_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "source_correction_id",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "correction_mode",
        "type": "text",
        "default": null,
        "not_null": true
      },
      {
        "name": "reason",
        "type": "text",
        "default": null,
        "not_null": true
      },
      {
        "name": "legal_basis",
        "type": "text",
        "default": null,
        "not_null": true
      },
      {
        "name": "evidence_reference",
        "type": "text",
        "default": null,
        "not_null": true
      },
      {
        "name": "issue_date",
        "type": "date",
        "default": null,
        "not_null": true
      },
      {
        "name": "adjustment_date",
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
        "name": "request_json",
        "type": "jsonb",
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
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "not_null": true
      },
      {
        "name": "created_by_user_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "approved_at",
        "type": "timestamp with time zone",
        "default": null,
        "not_null": false
      },
      {
        "name": "approved_by_user_id",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "approval_evidence",
        "type": "text",
        "default": null,
        "not_null": false
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
        "name": "cancelled_at",
        "type": "timestamp with time zone",
        "default": null,
        "not_null": false
      },
      {
        "name": "cancelled_by_user_id",
        "type": "uuid",
        "default": null,
        "not_null": false
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
        "name": "finance_tax_document_correcti_original_combined_document_i_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (original_combined_document_id) REFERENCES finance_combined_documents(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_document_corrections_approved_by_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (approved_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_document_corrections_cancelled_by_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (cancelled_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_document_corrections_check",
        "type": "c",
        "definition": "CHECK (((original_combined_document_id IS NULL) = (original_receipt_id IS NULL)))"
      },
      {
        "name": "finance_tax_document_corrections_check1",
        "type": "c",
        "definition": "CHECK (((status = ANY (ARRAY[''approved''::text, ''issued''::text])) = ((approved_at IS NOT NULL) AND (approved_by_user_id IS NOT NULL) AND (NULLIF(btrim(approval_evidence), ''''::text) IS NOT NULL))))"
      },
      {
        "name": "finance_tax_document_corrections_check2",
        "type": "c",
        "definition": "CHECK (((status = ''issued''::text) = ((issued_at IS NOT NULL) AND (issued_by_user_id IS NOT NULL))))"
      },
      {
        "name": "finance_tax_document_corrections_check3",
        "type": "c",
        "definition": "CHECK (((status = ''cancelled''::text) = ((cancelled_at IS NOT NULL) AND (cancelled_by_user_id IS NOT NULL) AND (NULLIF(btrim(cancel_reason), ''''::text) IS NOT NULL))))"
      },
      {
        "name": "finance_tax_document_corrections_correction_mode_check",
        "type": "c",
        "definition": "CHECK ((correction_mode = ANY (ARRAY[''credit_note''::text, ''debit_note''::text, ''cancel_and_reissue''::text, ''replacement_copy''::text])))"
      },
      {
        "name": "finance_tax_document_corrections_created_by_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (created_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_document_corrections_draft_snapshot_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(draft_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_tax_document_corrections_evidence_reference_check",
        "type": "c",
        "definition": "CHECK (((length(btrim(evidence_reference)) >= 5) AND (length(btrim(evidence_reference)) <= 2000)))"
      },
      {
        "name": "finance_tax_document_corrections_invoice_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (invoice_id) REFERENCES finance_invoices(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_document_corrections_issued_by_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (issued_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_document_corrections_original_receipt_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (original_receipt_id) REFERENCES finance_receipts(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_document_corrections_original_tax_invoice_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (original_tax_invoice_id) REFERENCES finance_tax_invoices(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_document_corrections_payment_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (payment_id) REFERENCES finance_payments(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_document_corrections_pkey",
        "type": "p",
        "definition": "PRIMARY KEY (id)"
      },
      {
        "name": "finance_tax_document_corrections_reason_check",
        "type": "c",
        "definition": "CHECK (((length(btrim(reason)) >= 5) AND (length(btrim(reason)) <= 2000)))"
      },
      {
        "name": "finance_tax_document_corrections_request_id_key",
        "type": "u",
        "definition": "UNIQUE (request_id)"
      },
      {
        "name": "finance_tax_document_corrections_source_correction_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (source_correction_id) REFERENCES finance_tax_document_corrections(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_document_corrections_source_snapshot_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(source_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_tax_document_corrections_status_check",
        "type": "c",
        "definition": "CHECK ((status = ANY (ARRAY[''draft''::text, ''approved''::text, ''issued''::text, ''cancelled''::text])))"
      },
      {
        "name": "tax_correction_integrity",
        "type": "t",
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      }
    ],
    "indexes": [
      {
        "name": "finance_tax_document_corrections_pkey",
        "definition": "CREATE UNIQUE INDEX finance_tax_document_corrections_pkey ON public.finance_tax_document_corrections USING btree (id)"
      },
      {
        "name": "finance_tax_document_corrections_request_id_key",
        "definition": "CREATE UNIQUE INDEX finance_tax_document_corrections_request_id_key ON public.finance_tax_document_corrections USING btree (request_id)"
      },
      {
        "name": "tax_correction_evidence_once",
        "definition": "CREATE UNIQUE INDEX tax_correction_evidence_once ON public.finance_tax_document_corrections USING btree (original_tax_invoice_id, lower(btrim(evidence_reference))) WHERE (status <> ''cancelled''::text)"
      },
      {
        "name": "tax_correction_open_case",
        "definition": "CREATE UNIQUE INDEX tax_correction_open_case ON public.finance_tax_document_corrections USING btree (original_tax_invoice_id) WHERE (status = ANY (ARRAY[''draft''::text, ''approved''::text]))"
      },
      {
        "name": "tax_correction_replacement_successor",
        "definition": "CREATE UNIQUE INDEX tax_correction_replacement_successor ON public.finance_tax_document_corrections USING btree (original_tax_invoice_id, COALESCE(source_correction_id, original_tax_invoice_id)) WHERE ((correction_mode = ''cancel_and_reissue''::text) AND (status = ''issued''::text))"
      },
      {
        "name": "tax_correction_source_history",
        "definition": "CREATE INDEX tax_correction_source_history ON public.finance_tax_document_corrections USING btree (original_tax_invoice_id, created_at)"
      }
    ],
    "policies": [
      {
        "name": "tax_correction_read",
        "check": null,
        "roles": [
          "authenticated"
        ],
        "using": "tax_correction_authorized((original_combined_document_id IS NOT NULL), ''view''::text)",
        "command": "SELECT"
      }
    ],
    "triggers": [
      {
        "name": "tax_correction_history",
        "enabled": "O",
        "definition": "CREATE TRIGGER tax_correction_history BEFORE DELETE OR UPDATE ON public.finance_tax_document_corrections FOR EACH ROW EXECUTE FUNCTION tax_correction_immutable()"
      },
      {
        "name": "tax_correction_integrity",
        "enabled": "O",
        "definition": "CREATE CONSTRAINT TRIGGER tax_correction_integrity AFTER INSERT OR UPDATE ON public.finance_tax_document_corrections DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_tax_correction_document()"
      }
    ]
  }
]
'::jsonb)), actual_catalog as (select c.relname as name,c.relrowsecurity as rls,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid)) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n') as constraints,
 (select jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(x.indexrelid)) order by i.relname) from pg_index x join pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid) as indexes,
 (select jsonb_agg(jsonb_build_object('name',p.policyname,'command',p.cmd,'roles',p.roles,'using',p.qual,'check',p.with_check) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
 (select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as triggers
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('finance_tax_document_corrections','finance_tax_correction_lines','finance_tax_correction_documents','finance_tax_correction_audit_events') order by c.relname),
 catalog_differences as (select coalesce(e.value->>'name',a.name) as table_name,e.value as expected,to_jsonb(a) as actual from expected_catalog e full join actual_catalog a on a.name=e.value->>'name' where e.value is distinct from to_jsonb(a)),
 checks(name,passed) as (select * from protected_checks union all select * from (values
 ('exact_043_and_preserved_functions',not exists(select 1 from function_differences)),
 ('exact_tables_policies_triggers',not exists(select 1 from catalog_differences)),
 ('rpc_private_privileges',(has_function_privilege('authenticated','public.tax_correction_authorized(boolean,text)','EXECUTE')=true and not has_function_privilege('anon','public.tax_correction_authorized(boolean,text)','EXECUTE')) and (has_function_privilege('authenticated','public.tax_correction_immutable()','EXECUTE')=false and not has_function_privilege('anon','public.tax_correction_immutable()','EXECUTE')) and (has_function_privilege('authenticated','public.tax_correction_source(uuid,uuid)','EXECUTE')=false and not has_function_privilege('anon','public.tax_correction_source(uuid,uuid)','EXECUTE')) and (has_function_privilege('authenticated','public.create_finance_tax_correction_draft(uuid,uuid,uuid,text,text,text,text,date,date,jsonb)','EXECUTE')=true and not has_function_privilege('anon','public.create_finance_tax_correction_draft(uuid,uuid,uuid,text,text,text,text,date,date,jsonb)','EXECUTE')) and (has_function_privilege('authenticated','public.approve_finance_tax_correction(uuid,jsonb,boolean,text,boolean)','EXECUTE')=true and not has_function_privilege('anon','public.approve_finance_tax_correction(uuid,jsonb,boolean,text,boolean)','EXECUTE')) and (has_function_privilege('authenticated','public.tax_correction_number(text,date)','EXECUTE')=false and not has_function_privilege('anon','public.tax_correction_number(text,date)','EXECUTE')) and (has_function_privilege('authenticated','public.issue_finance_tax_correction(uuid,jsonb,boolean,boolean)','EXECUTE')=true and not has_function_privilege('anon','public.issue_finance_tax_correction(uuid,jsonb,boolean,boolean)','EXECUTE')) and (has_function_privilege('authenticated','public.cancel_finance_tax_correction_draft(uuid,text)','EXECUTE')=true and not has_function_privilege('anon','public.cancel_finance_tax_correction_draft(uuid,text)','EXECUTE')) and (has_function_privilege('authenticated','public.validate_tax_correction_document()','EXECUTE')=false and not has_function_privilege('anon','public.validate_tax_correction_document()','EXECUTE')) and (has_function_privilege('authenticated','public.get_finance_tax_correction_context(uuid,uuid)','EXECUTE')=true and not has_function_privilege('anon','public.get_finance_tax_correction_context(uuid,uuid)','EXECUTE'))),
 ('browser_direct_mutation_blocked',(select count(*)=4 and bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE') and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) from pg_class where oid in ('public.finance_tax_document_corrections'::regclass,'public.finance_tax_correction_lines'::regclass,'public.finance_tax_correction_documents'::regclass,'public.finance_tax_correction_audit_events'::regclass))),
 ('correction_zero_state',not exists(select 1 from public.finance_tax_document_corrections) and not exists(select 1 from public.finance_tax_correction_lines) and not exists(select 1 from public.finance_tax_correction_documents) and not exists(select 1 from public.finance_tax_correction_audit_events)),
 ('cn_dn_profiles',(select count(*)=2 and bool_and(is_active and period_scope='monthly' and sequence_width=6 and display_prefix=case document_type when 'credit_note' then 'VP-CN' else 'VP-DN' end) from public.document_numbering_profiles where document_type in ('credit_note','debit_note'))),
 ('no_cn_dn_numbers_consumed',not exists(select 1 from public.finance_document_counters where doc_type in ('credit_note','debit_note') or prefix ~ '^VP-(CN|DN)-')),
 ('dry_run_protected_evidence_unchanged',nullif(current_setting('vp.tax043_before',true),'') is null or current_setting('vp.tax043_before',true)=(select md5(evidence::text) from protected_evidence))
 ) x(name,passed)) select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as tax_document_correction_foundation_verification_pass,
 (select md5(evidence::text) from protected_evidence) as protected_evidence_and_counters_hash,
 (select coalesce(jsonb_agg(to_jsonb(f)),'[]') from function_differences f) as function_differences,
 current_setting('server_version_num')::integer as catalog_server_version_num,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) as catalog_differences,
 jsonb_build_object('finance_tax_document_corrections',(select count(*) from public.finance_tax_document_corrections),'finance_tax_correction_lines',(select count(*) from public.finance_tax_correction_lines),'finance_tax_correction_documents',(select count(*) from public.finance_tax_correction_documents),'finance_tax_correction_audit_events',(select count(*) from public.finance_tax_correction_audit_events)) as correction_rows;
