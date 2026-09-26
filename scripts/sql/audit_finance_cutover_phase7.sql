-- PHASE 7A: manual Production audit ONLY. One SELECT; no application RPCs.
-- Run as the existing postgres SQL Editor role (or an equivalent BYPASSRLS role).
-- A restricted role is reported as incomplete, never as an empty Production dataset.
-- No cutover approval is implied. CUTOVER_DATE_REQUIRED = true.
-- All New Finance transaction data is UAT by user declaration; configuration is not.
-- Missing required relations fail at parse time. Unknown Finance relations are reported.
-- 490 broader baseline differences remain unresolved; this audit does not accept them.
WITH RECURSIVE
inventory(table_name,classification,date_key,amount_key) AS (VALUES
 ('advisory_matters','SHARED_CORE_NO_TOUCH','created_at',NULL),
 ('case_audit_logs','SHARED_CORE_NO_TOUCH','created_at',NULL),
 ('cases','SHARED_CORE_NO_TOUCH','created_at',NULL),
 ('clients','SHARED_CORE_NO_TOUCH','created_at',NULL),
 ('document_clause_libraries','CONFIG_KEEP','created_at',NULL),
 ('document_clause_version_variable_bindings','CONFIG_KEEP','created_at',NULL),
 ('document_clause_versions','CONFIG_KEEP','created_at',NULL),
 ('document_numbering_profiles','CONFIG_KEEP','created_at',NULL),
 ('document_template_alternative_groups','CONFIG_KEEP','created_at',NULL),
 ('document_template_audit_events','CONFIG_KEEP','created_at',NULL),
 ('document_template_clause_slots','CONFIG_KEEP','created_at',NULL),
 ('document_template_sections','CONFIG_KEEP','created_at',NULL),
 ('document_template_variable_bindings','CONFIG_KEEP','created_at',NULL),
 ('document_template_versions','CONFIG_KEEP','created_at',NULL),
 ('document_templates','CONFIG_KEEP','created_at',NULL),
 ('document_variable_definitions','CONFIG_KEEP','created_at',NULL),
 ('finance_account_opening_balance_audit_events','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_account_opening_balances','NEW_FINANCE_UAT_PURGE','as_of','balance_amount'),
 ('finance_authorized_signers','CONFIG_KEEP','created_at',NULL),
 ('finance_bank_account_access','CONFIG_KEEP','created_at',NULL),
 ('finance_bank_accounts','CONFIG_KEEP','created_at',NULL),
 ('finance_billable_charge_audit_events','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_billable_charges','NEW_FINANCE_UAT_PURGE','service_date','total_amount'),
 ('finance_billing_installment_audit_events','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_billing_installment_charge_bridge_audit_events','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_billing_installment_charge_bridges','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_billing_installment_items','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_billing_installments','NEW_FINANCE_UAT_PURGE','due_date','total_amount'),
 ('finance_billing_plans','NEW_FINANCE_UAT_PURGE','created_at',NULL),
 ('finance_cash_locations','CONFIG_KEEP','created_at',NULL),
 ('finance_cash_transaction_audit_events','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_cash_transactions','NEW_FINANCE_UAT_PURGE','occurred_at','cash_amount'),
 ('finance_combined_document_audit_events','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_combined_documents','NEW_FINANCE_UAT_PURGE','issue_date',NULL),
 ('finance_company_ledger','LEGACY_REAL_KEEP','transaction_date','amount'),
 ('finance_company_profiles','CONFIG_KEEP','created_at',NULL),
 ('finance_compensation_allocations','LEGACY_REAL_KEEP','created_at','amount'),
 ('finance_compensation_batches','LEGACY_REAL_KEEP','received_date','received_amount'),
 ('finance_customer_tax_profile_audit_events','CONFIG_KEEP','created_at',NULL),
 ('finance_customer_tax_profiles','CONFIG_KEEP','created_at',NULL),
 ('finance_direct_money_receipt_audit','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_direct_money_receipts','NEW_FINANCE_UAT_PURGE','received_on','cash_amount'),
 ('finance_document_counters','CONFIG_DECISION','created_at',NULL),
 ('finance_expense_audit','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_expense_claims','LEGACY_REAL_KEEP','claim_date','amount'),
 ('finance_expense_economic_decisions','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_expense_obligation_waivers','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_expense_obligations','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_expense_request_audit','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_expense_request_items','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_expense_requests','NEW_FINANCE_UAT_PURGE','created_at',NULL),
 ('finance_expense_settlements','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_expense_tax_reviews','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_expenses','NEW_FINANCE_UAT_PURGE','expense_date','gross_amount'),
 ('finance_external_input_vat','NEW_FINANCE_UAT_PURGE','invoice_date','vat_amount'),
 ('finance_external_input_vat_reviews','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_fee_agreement_clause_overrides','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_fee_agreement_clause_slot_selections','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_fee_agreement_custom_clauses','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_fee_agreement_items','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_fee_agreement_versions','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_fee_agreements','NEW_FINANCE_UAT_PURGE','effective_date','total_amount'),
 ('finance_invoice_audit_events','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_invoice_charge_allocation_audit_events','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_invoice_charge_allocations','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_invoice_installment_allocations','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_invoice_items','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_invoice_v2_composition_requests','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_invoices','NEW_FINANCE_UAT_PURGE','issue_date','total_amount'),
 ('finance_outgoing_wht_obligations','DERIVED_PURGE_WITH_PARENT','withheld_on','withheld_amount'),
 ('finance_payable_entitlement_audit','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_payable_entitlement_sources','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_payable_entitlements','NEW_FINANCE_UAT_PURGE','created_at','gross_amount'),
 ('finance_payee_audit','CONFIG_DECISION','created_at',NULL),
 ('finance_payee_destinations','CONFIG_DECISION','created_at',NULL),
 ('finance_payees','CONFIG_DECISION','created_at',NULL),
 ('finance_payment_allocation_reallocations','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_payment_audit_events','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_payment_evidence','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_payment_invoice_allocations','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_payment_money_allocation_audit','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_payment_money_allocations','NEW_FINANCE_UAT_PURGE','created_at',NULL),
 ('finance_payment_wht_components','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_payments','NEW_FINANCE_UAT_PURGE','received_on','cash_amount'),
 ('finance_payout_allocations','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_payout_audit','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_payouts','NEW_FINANCE_UAT_PURGE','paid_on','net_amount'),
 ('finance_quotation_items','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_quotation_payment_installment_items','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_quotation_payment_installments','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_quotation_payment_terms','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_quotation_service_patterns','CONFIG_KEEP','created_at',NULL),
 ('finance_quotations','NEW_FINANCE_UAT_PURGE','issue_date','grand_total'),
 ('finance_receipt_audit_events','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_receipt_invoice_allocations','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_receipts','NEW_FINANCE_UAT_PURGE','receipt_date','cash_amount'),
 ('finance_tax_correction_audit_events','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_tax_correction_documents','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_tax_correction_lines','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_tax_deadline_rules','CONFIG_KEEP','created_at',NULL),
 ('finance_tax_document_corrections','NEW_FINANCE_UAT_PURGE','created_at',NULL),
 ('finance_tax_filing_allocations','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_tax_filing_audit','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_tax_filings','NEW_FINANCE_UAT_PURGE','period_month','tax_amount'),
 ('finance_tax_invoice_audit_events','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_tax_invoice_items','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_tax_invoice_source_coverages','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_tax_invoices','NEW_FINANCE_UAT_PURGE','issue_date',NULL),
 ('finance_tax_periods','NEW_FINANCE_UAT_PURGE','created_at',NULL),
 ('finance_tax_point_events','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_tax_position_audit','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_tax_position_facts','DERIVED_PURGE_WITH_PARENT','effective_on','tax_amount'),
 ('finance_tax_remittance_audit','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_tax_remittances','NEW_FINANCE_UAT_PURGE','paid_on','amount'),
 ('finance_tax_source_revisions','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_treasury_account_authorities','CONFIG_KEEP','created_at',NULL),
 ('finance_treasury_authority_audit','CONFIG_KEEP','created_at',NULL),
 ('finance_treasury_transfer_legs','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_treasury_transfers','NEW_FINANCE_UAT_PURGE','transferred_on','amount'),
 ('finance_vp_revenue_distribution_audit','DERIVED_PURGE_WITH_PARENT','created_at',NULL),
 ('finance_vp_revenue_distributions','NEW_FINANCE_UAT_PURGE','created_at',NULL),
 ('user_profiles','SHARED_CORE_NO_TOUCH','created_at',NULL)),
raw_rows(table_name,r) AS MATERIALIZED (
 SELECT 'advisory_matters',to_jsonb(t) FROM public.advisory_matters t
 UNION ALL
 SELECT 'case_audit_logs',to_jsonb(t) FROM public.case_audit_logs t
 UNION ALL
 SELECT 'cases',to_jsonb(t) FROM public.cases t
 UNION ALL
 SELECT 'clients',to_jsonb(t) FROM public.clients t
 UNION ALL
 SELECT 'document_clause_libraries',to_jsonb(t) FROM public.document_clause_libraries t
 UNION ALL
 SELECT 'document_clause_version_variable_bindings',to_jsonb(t) FROM public.document_clause_version_variable_bindings t
 UNION ALL
 SELECT 'document_clause_versions',to_jsonb(t) FROM public.document_clause_versions t
 UNION ALL
 SELECT 'document_numbering_profiles',to_jsonb(t) FROM public.document_numbering_profiles t
 UNION ALL
 SELECT 'document_template_alternative_groups',to_jsonb(t) FROM public.document_template_alternative_groups t
 UNION ALL
 SELECT 'document_template_audit_events',to_jsonb(t) FROM public.document_template_audit_events t
 UNION ALL
 SELECT 'document_template_clause_slots',to_jsonb(t) FROM public.document_template_clause_slots t
 UNION ALL
 SELECT 'document_template_sections',to_jsonb(t) FROM public.document_template_sections t
 UNION ALL
 SELECT 'document_template_variable_bindings',to_jsonb(t) FROM public.document_template_variable_bindings t
 UNION ALL
 SELECT 'document_template_versions',to_jsonb(t) FROM public.document_template_versions t
 UNION ALL
 SELECT 'document_templates',to_jsonb(t) FROM public.document_templates t
 UNION ALL
 SELECT 'document_variable_definitions',to_jsonb(t) FROM public.document_variable_definitions t
 UNION ALL
 SELECT 'finance_account_opening_balance_audit_events',to_jsonb(t) FROM public.finance_account_opening_balance_audit_events t
 UNION ALL
 SELECT 'finance_account_opening_balances',to_jsonb(t) FROM public.finance_account_opening_balances t
 UNION ALL
 SELECT 'finance_authorized_signers',to_jsonb(t) FROM public.finance_authorized_signers t
 UNION ALL
 SELECT 'finance_bank_account_access',to_jsonb(t) FROM public.finance_bank_account_access t
 UNION ALL
 SELECT 'finance_bank_accounts',to_jsonb(t) FROM public.finance_bank_accounts t
 UNION ALL
 SELECT 'finance_billable_charge_audit_events',to_jsonb(t) FROM public.finance_billable_charge_audit_events t
 UNION ALL
 SELECT 'finance_billable_charges',to_jsonb(t) FROM public.finance_billable_charges t
 UNION ALL
 SELECT 'finance_billing_installment_audit_events',to_jsonb(t) FROM public.finance_billing_installment_audit_events t
 UNION ALL
 SELECT 'finance_billing_installment_charge_bridge_audit_events',to_jsonb(t) FROM public.finance_billing_installment_charge_bridge_audit_events t
 UNION ALL
 SELECT 'finance_billing_installment_charge_bridges',to_jsonb(t) FROM public.finance_billing_installment_charge_bridges t
 UNION ALL
 SELECT 'finance_billing_installment_items',to_jsonb(t) FROM public.finance_billing_installment_items t
 UNION ALL
 SELECT 'finance_billing_installments',to_jsonb(t) FROM public.finance_billing_installments t
 UNION ALL
 SELECT 'finance_billing_plans',to_jsonb(t) FROM public.finance_billing_plans t
 UNION ALL
 SELECT 'finance_cash_locations',to_jsonb(t) FROM public.finance_cash_locations t
 UNION ALL
 SELECT 'finance_cash_transaction_audit_events',to_jsonb(t) FROM public.finance_cash_transaction_audit_events t
 UNION ALL
 SELECT 'finance_cash_transactions',to_jsonb(t) FROM public.finance_cash_transactions t
 UNION ALL
 SELECT 'finance_combined_document_audit_events',to_jsonb(t) FROM public.finance_combined_document_audit_events t
 UNION ALL
 SELECT 'finance_combined_documents',to_jsonb(t) FROM public.finance_combined_documents t
 UNION ALL
 SELECT 'finance_company_ledger',to_jsonb(t) FROM public.finance_company_ledger t
 UNION ALL
 SELECT 'finance_company_profiles',to_jsonb(t) FROM public.finance_company_profiles t
 UNION ALL
 SELECT 'finance_compensation_allocations',to_jsonb(t) FROM public.finance_compensation_allocations t
 UNION ALL
 SELECT 'finance_compensation_batches',to_jsonb(t) FROM public.finance_compensation_batches t
 UNION ALL
 SELECT 'finance_customer_tax_profile_audit_events',to_jsonb(t) FROM public.finance_customer_tax_profile_audit_events t
 UNION ALL
 SELECT 'finance_customer_tax_profiles',to_jsonb(t) FROM public.finance_customer_tax_profiles t
 UNION ALL
 SELECT 'finance_direct_money_receipt_audit',to_jsonb(t) FROM public.finance_direct_money_receipt_audit t
 UNION ALL
 SELECT 'finance_direct_money_receipts',to_jsonb(t) FROM public.finance_direct_money_receipts t
 UNION ALL
 SELECT 'finance_document_counters',to_jsonb(t) FROM public.finance_document_counters t
 UNION ALL
 SELECT 'finance_expense_audit',to_jsonb(t) FROM public.finance_expense_audit t
 UNION ALL
 SELECT 'finance_expense_claims',to_jsonb(t) FROM public.finance_expense_claims t
 UNION ALL
 SELECT 'finance_expense_economic_decisions',to_jsonb(t) FROM public.finance_expense_economic_decisions t
 UNION ALL
 SELECT 'finance_expense_obligation_waivers',to_jsonb(t) FROM public.finance_expense_obligation_waivers t
 UNION ALL
 SELECT 'finance_expense_obligations',to_jsonb(t) FROM public.finance_expense_obligations t
 UNION ALL
 SELECT 'finance_expense_request_audit',to_jsonb(t) FROM public.finance_expense_request_audit t
 UNION ALL
 SELECT 'finance_expense_request_items',to_jsonb(t) FROM public.finance_expense_request_items t
 UNION ALL
 SELECT 'finance_expense_requests',to_jsonb(t) FROM public.finance_expense_requests t
 UNION ALL
 SELECT 'finance_expense_settlements',to_jsonb(t) FROM public.finance_expense_settlements t
 UNION ALL
 SELECT 'finance_expense_tax_reviews',to_jsonb(t) FROM public.finance_expense_tax_reviews t
 UNION ALL
 SELECT 'finance_expenses',to_jsonb(t) FROM public.finance_expenses t
 UNION ALL
 SELECT 'finance_external_input_vat',to_jsonb(t) FROM public.finance_external_input_vat t
 UNION ALL
 SELECT 'finance_external_input_vat_reviews',to_jsonb(t) FROM public.finance_external_input_vat_reviews t
 UNION ALL
 SELECT 'finance_fee_agreement_clause_overrides',to_jsonb(t) FROM public.finance_fee_agreement_clause_overrides t
 UNION ALL
 SELECT 'finance_fee_agreement_clause_slot_selections',to_jsonb(t) FROM public.finance_fee_agreement_clause_slot_selections t
 UNION ALL
 SELECT 'finance_fee_agreement_custom_clauses',to_jsonb(t) FROM public.finance_fee_agreement_custom_clauses t
 UNION ALL
 SELECT 'finance_fee_agreement_items',to_jsonb(t) FROM public.finance_fee_agreement_items t
 UNION ALL
 SELECT 'finance_fee_agreement_versions',to_jsonb(t) FROM public.finance_fee_agreement_versions t
 UNION ALL
 SELECT 'finance_fee_agreements',to_jsonb(t) FROM public.finance_fee_agreements t
 UNION ALL
 SELECT 'finance_invoice_audit_events',to_jsonb(t) FROM public.finance_invoice_audit_events t
 UNION ALL
 SELECT 'finance_invoice_charge_allocation_audit_events',to_jsonb(t) FROM public.finance_invoice_charge_allocation_audit_events t
 UNION ALL
 SELECT 'finance_invoice_charge_allocations',to_jsonb(t) FROM public.finance_invoice_charge_allocations t
 UNION ALL
 SELECT 'finance_invoice_installment_allocations',to_jsonb(t) FROM public.finance_invoice_installment_allocations t
 UNION ALL
 SELECT 'finance_invoice_items',to_jsonb(t) FROM public.finance_invoice_items t
 UNION ALL
 SELECT 'finance_invoice_v2_composition_requests',to_jsonb(t) FROM public.finance_invoice_v2_composition_requests t
 UNION ALL
 SELECT 'finance_invoices',to_jsonb(t) FROM public.finance_invoices t
 UNION ALL
 SELECT 'finance_outgoing_wht_obligations',to_jsonb(t) FROM public.finance_outgoing_wht_obligations t
 UNION ALL
 SELECT 'finance_payable_entitlement_audit',to_jsonb(t) FROM public.finance_payable_entitlement_audit t
 UNION ALL
 SELECT 'finance_payable_entitlement_sources',to_jsonb(t) FROM public.finance_payable_entitlement_sources t
 UNION ALL
 SELECT 'finance_payable_entitlements',to_jsonb(t) FROM public.finance_payable_entitlements t
 UNION ALL
 SELECT 'finance_payee_audit',to_jsonb(t) FROM public.finance_payee_audit t
 UNION ALL
 SELECT 'finance_payee_destinations',to_jsonb(t) FROM public.finance_payee_destinations t
 UNION ALL
 SELECT 'finance_payees',to_jsonb(t) FROM public.finance_payees t
 UNION ALL
 SELECT 'finance_payment_allocation_reallocations',to_jsonb(t) FROM public.finance_payment_allocation_reallocations t
 UNION ALL
 SELECT 'finance_payment_audit_events',to_jsonb(t) FROM public.finance_payment_audit_events t
 UNION ALL
 SELECT 'finance_payment_evidence',to_jsonb(t) FROM public.finance_payment_evidence t
 UNION ALL
 SELECT 'finance_payment_invoice_allocations',to_jsonb(t) FROM public.finance_payment_invoice_allocations t
 UNION ALL
 SELECT 'finance_payment_money_allocation_audit',to_jsonb(t) FROM public.finance_payment_money_allocation_audit t
 UNION ALL
 SELECT 'finance_payment_money_allocations',to_jsonb(t) FROM public.finance_payment_money_allocations t
 UNION ALL
 SELECT 'finance_payment_wht_components',to_jsonb(t) FROM public.finance_payment_wht_components t
 UNION ALL
 SELECT 'finance_payments',to_jsonb(t) FROM public.finance_payments t
 UNION ALL
 SELECT 'finance_payout_allocations',to_jsonb(t) FROM public.finance_payout_allocations t
 UNION ALL
 SELECT 'finance_payout_audit',to_jsonb(t) FROM public.finance_payout_audit t
 UNION ALL
 SELECT 'finance_payouts',to_jsonb(t) FROM public.finance_payouts t
 UNION ALL
 SELECT 'finance_quotation_items',to_jsonb(t) FROM public.finance_quotation_items t
 UNION ALL
 SELECT 'finance_quotation_payment_installment_items',to_jsonb(t) FROM public.finance_quotation_payment_installment_items t
 UNION ALL
 SELECT 'finance_quotation_payment_installments',to_jsonb(t) FROM public.finance_quotation_payment_installments t
 UNION ALL
 SELECT 'finance_quotation_payment_terms',to_jsonb(t) FROM public.finance_quotation_payment_terms t
 UNION ALL
 SELECT 'finance_quotation_service_patterns',to_jsonb(t) FROM public.finance_quotation_service_patterns t
 UNION ALL
 SELECT 'finance_quotations',to_jsonb(t) FROM public.finance_quotations t
 UNION ALL
 SELECT 'finance_receipt_audit_events',to_jsonb(t) FROM public.finance_receipt_audit_events t
 UNION ALL
 SELECT 'finance_receipt_invoice_allocations',to_jsonb(t) FROM public.finance_receipt_invoice_allocations t
 UNION ALL
 SELECT 'finance_receipts',to_jsonb(t) FROM public.finance_receipts t
 UNION ALL
 SELECT 'finance_tax_correction_audit_events',to_jsonb(t) FROM public.finance_tax_correction_audit_events t
 UNION ALL
 SELECT 'finance_tax_correction_documents',to_jsonb(t) FROM public.finance_tax_correction_documents t
 UNION ALL
 SELECT 'finance_tax_correction_lines',to_jsonb(t) FROM public.finance_tax_correction_lines t
 UNION ALL
 SELECT 'finance_tax_deadline_rules',to_jsonb(t) FROM public.finance_tax_deadline_rules t
 UNION ALL
 SELECT 'finance_tax_document_corrections',to_jsonb(t) FROM public.finance_tax_document_corrections t
 UNION ALL
 SELECT 'finance_tax_filing_allocations',to_jsonb(t) FROM public.finance_tax_filing_allocations t
 UNION ALL
 SELECT 'finance_tax_filing_audit',to_jsonb(t) FROM public.finance_tax_filing_audit t
 UNION ALL
 SELECT 'finance_tax_filings',to_jsonb(t) FROM public.finance_tax_filings t
 UNION ALL
 SELECT 'finance_tax_invoice_audit_events',to_jsonb(t) FROM public.finance_tax_invoice_audit_events t
 UNION ALL
 SELECT 'finance_tax_invoice_items',to_jsonb(t) FROM public.finance_tax_invoice_items t
 UNION ALL
 SELECT 'finance_tax_invoice_source_coverages',to_jsonb(t) FROM public.finance_tax_invoice_source_coverages t
 UNION ALL
 SELECT 'finance_tax_invoices',to_jsonb(t) FROM public.finance_tax_invoices t
 UNION ALL
 SELECT 'finance_tax_periods',to_jsonb(t) FROM public.finance_tax_periods t
 UNION ALL
 SELECT 'finance_tax_point_events',to_jsonb(t) FROM public.finance_tax_point_events t
 UNION ALL
 SELECT 'finance_tax_position_audit',to_jsonb(t) FROM public.finance_tax_position_audit t
 UNION ALL
 SELECT 'finance_tax_position_facts',to_jsonb(t) FROM public.finance_tax_position_facts t
 UNION ALL
 SELECT 'finance_tax_remittance_audit',to_jsonb(t) FROM public.finance_tax_remittance_audit t
 UNION ALL
 SELECT 'finance_tax_remittances',to_jsonb(t) FROM public.finance_tax_remittances t
 UNION ALL
 SELECT 'finance_tax_source_revisions',to_jsonb(t) FROM public.finance_tax_source_revisions t
 UNION ALL
 SELECT 'finance_treasury_account_authorities',to_jsonb(t) FROM public.finance_treasury_account_authorities t
 UNION ALL
 SELECT 'finance_treasury_authority_audit',to_jsonb(t) FROM public.finance_treasury_authority_audit t
 UNION ALL
 SELECT 'finance_treasury_transfer_legs',to_jsonb(t) FROM public.finance_treasury_transfer_legs t
 UNION ALL
 SELECT 'finance_treasury_transfers',to_jsonb(t) FROM public.finance_treasury_transfers t
 UNION ALL
 SELECT 'finance_vp_revenue_distribution_audit',to_jsonb(t) FROM public.finance_vp_revenue_distribution_audit t
 UNION ALL
 SELECT 'finance_vp_revenue_distributions',to_jsonb(t) FROM public.finance_vp_revenue_distributions t
 UNION ALL
 SELECT 'user_profiles',to_jsonb(t) FROM public.user_profiles t
),
rows AS MATERIALIZED (
 SELECT r.*,i.classification,i.date_key,i.amount_key,coalesce(nullif(r->>'currency',''),'UNSPECIFIED') currency,
 coalesce(r->>'status',r->>'document_status',r->>'payment_status','UNSPECIFIED') status,
 CASE WHEN r->>i.amount_key ~ '^-?[0-9]+([.][0-9]+)?$' THEN (r->>i.amount_key)::numeric END amount
 FROM raw_rows r JOIN inventory i USING(table_name)
),
table_stats AS (
 SELECT i.table_name,i.classification,count(r.r) row_count,i.date_key,i.amount_key,
 min(r.r->>i.date_key) min_date,max(r.r->>i.date_key) max_date,max(r.r->>'updated_at') latest_updated_at,
 count(r.r) FILTER(WHERE r.r->>i.date_key IS NULL) rows_without_selected_date,
 (SELECT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.'||i.table_name) AND a.attname=i.date_key AND NOT a.attisdropped)) date_column_present,
 CASE WHEN i.amount_key IS NOT NULL THEN (SELECT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.'||i.table_name) AND a.attname=i.amount_key AND NOT a.attisdropped)) END amount_column_present,
 encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(r.r::text,'UTF8')),'hex'),'|'
 ORDER BY encode(sha256(convert_to(r.r::text,'UTF8')),'hex') COLLATE "C") FILTER(WHERE r.r IS NOT NULL),''),'UTF8')),'hex') rows_sha256
 FROM inventory i LEFT JOIN rows r ON r.table_name=i.table_name
 GROUP BY i.table_name,i.classification,i.date_key,i.amount_key
),
status_stats AS (
 SELECT table_name,status,currency,count(*) row_count,sum(amount) amount_total,
 count(*) FILTER(WHERE amount_key IS NOT NULL AND amount IS NULL) missing_or_invalid_amount_rows
 FROM rows GROUP BY table_name,status,currency
),
claims AS (SELECT * FROM rows WHERE table_name='finance_expense_claims'),
batches AS (SELECT * FROM rows WHERE table_name='finance_compensation_batches'),
allocations AS (SELECT a.*,b.status batch_status,b.r->>'received_date' received_date,
 b.r->>'ledger_entry_id' batch_ledger_entry_id,b.r->>'formula_code' formula_code
 FROM rows a LEFT JOIN batches b ON a.r->>'batch_id'=b.r->>'id' WHERE a.table_name='finance_compensation_allocations'),
ledger AS (SELECT *,CASE WHEN status='active' AND r->>'entry_type' IN('income','transfer_in') THEN amount
 WHEN status='active' AND r->>'entry_type' IN('expense','transfer_out') THEN -amount
 WHEN status='voided' THEN 0 END signed_amount FROM rows WHERE table_name='finance_company_ledger'),
ledger_running AS (SELECT *,sum(signed_amount) OVER(PARTITION BY r->>'bank_account_id',currency
 ORDER BY r->>'transaction_date',r->>'created_at',r->>'id' ROWS UNBOUNDED PRECEDING) running_balance FROM ledger),
ledger_accounts AS (
 SELECT l.r->>'bank_account_id' bank_account_id,l.currency,count(*) rows,
 count(*) FILTER(WHERE status='active') active_rows,count(*) FILTER(WHERE status='voided') voided_rows,
 min(l.r->>'transaction_date') first_date,max(l.r->>'transaction_date') latest_transaction_date,
 sum(amount) FILTER(WHERE status='active' AND l.r->>'entry_type'='income') income,
 sum(amount) FILTER(WHERE status='active' AND l.r->>'entry_type'='expense') expense,
 sum(amount) FILTER(WHERE status='active' AND l.r->>'entry_type'='transfer_in') transfer_in,
 sum(amount) FILTER(WHERE status='active' AND l.r->>'entry_type'='transfer_out') transfer_out,
 sum(signed_amount) calculated_ending_position,min(running_balance) minimum_running_position,
 count(*) FILTER(WHERE signed_amount IS NULL OR amount IS NULL) invalid_rows
 FROM ledger_running l GROUP BY l.r->>'bank_account_id',currency
),
legacy_links AS (
 SELECT 'claim' kind,c.r->>'id' id,c.status,c.amount,c.r->>'ledger_entry_id' ledger_id,
 (SELECT count(*) FROM ledger l WHERE l.r->>'source_expense_claim_id'=c.r->>'id') source_link_count,
 (SELECT count(*) FROM ledger l WHERE l.r->>'id'=c.r->>'ledger_entry_id' AND l.status='active'
 AND l.r->>'entry_type'='expense' AND l.r->>'source_expense_claim_id'=c.r->>'id' AND l.amount=c.amount) valid_settlement_links
 FROM claims c
 UNION ALL
 SELECT 'batch',b.r->>'id',b.status,b.amount,b.r->>'ledger_entry_id',
 (SELECT count(*) FROM ledger l WHERE l.r->>'source_compensation_batch_id'=b.r->>'id'),
 (SELECT count(*) FROM ledger l WHERE l.r->>'id'=b.r->>'ledger_entry_id' AND l.status='active'
 AND l.r->>'entry_type'='income' AND l.r->>'source_compensation_batch_id'=b.r->>'id'
 AND l.amount=(SELECT sum(a.amount) FROM allocations a WHERE a.r->>'batch_id'=b.r->>'id' AND a.r->>'is_company_share'='true'))
 FROM batches b
),
legacy_transfer_groups AS (
 SELECT r->>'transfer_group_id' id,currency,count(*) legs,count(*) FILTER(WHERE r->>'entry_type'='transfer_in') in_legs,
 count(*) FILTER(WHERE r->>'entry_type'='transfer_out') out_legs,count(DISTINCT r->>'bank_account_id') accounts,
 sum(signed_amount) net FROM ledger WHERE status='active' AND r->>'entry_type' IN('transfer_in','transfer_out')
 GROUP BY r->>'transfer_group_id',currency
),
accounts AS (
 SELECT 'bank' kind,r->>'id' id,r->>'short_name' name,r->>'bank_name' bank_name,
 right(r->>'account_number',4) account_last4,r->>'is_active' is_active FROM rows WHERE table_name='finance_bank_accounts'
 UNION ALL SELECT 'cash',r->>'id',coalesce(r->>'name_th',r->>'name_en'),NULL,NULL,r->>'is_active' FROM rows WHERE table_name='finance_cash_locations'
),
openings AS (SELECT *,CASE WHEN r->>'bank_account_id' IS NOT NULL THEN 'bank' ELSE 'cash' END kind,
 coalesce(r->>'bank_account_id',r->>'cash_location_id') account_id FROM rows WHERE table_name='finance_account_opening_balances'),
cash AS (SELECT *,CASE WHEN r->>'bank_account_id' IS NOT NULL THEN 'bank' ELSE 'cash' END kind,
 coalesce(r->>'bank_account_id',r->>'cash_location_id') account_id FROM rows WHERE table_name='finance_cash_transactions'),
uat_balances AS (
 SELECT a.kind,a.id,a.name,o.currency,o.r->>'id' opening_id,o.r->>'as_of' opening_as_of,o.amount opening_amount,
 (SELECT count(*) FROM openings x WHERE x.status='confirmed' AND x.kind=a.kind AND x.account_id=a.id AND x.currency=o.currency) confirmed_opening_count,
 coalesce(sum(c.amount) FILTER(WHERE c.r->>'direction'='inflow'),0) inflow_after_opening,
 coalesce(sum(c.amount) FILTER(WHERE c.r->>'direction'='outflow'),0) outflow_after_opening,
 o.amount+coalesce(sum(CASE c.r->>'direction' WHEN 'inflow' THEN c.amount WHEN 'outflow' THEN -c.amount END),0) simulated_balance
 FROM accounts a LEFT JOIN openings o ON o.kind=a.kind AND o.account_id=a.id AND o.status='confirmed'
 LEFT JOIN cash c ON c.kind=a.kind AND c.account_id=a.id AND c.currency=o.currency AND c.status='confirmed'
 AND (c.r->>'occurred_at')::timestamptz>(o.r->>'as_of')::timestamptz
 GROUP BY a.kind,a.id,a.name,o.currency,o.r,o.amount
),
row_references AS MATERIALIZED (
 SELECT r.table_name,r.r->>'id' row_id,r.classification,k.key,k.value
 FROM rows r CROSS JOIN LATERAL jsonb_each_text(r.r) k
 WHERE k.value IS NOT NULL AND (k.key LIKE '%\_id' ESCAPE '\' OR k.key IN('table_name','created_by','updated_by','filed_by','confirmed_by'))
),
fks AS (
 SELECT c.oid,c.conname,ns.nspname child_schema,ch.relname child_table,pns.nspname parent_schema,pa.relname parent_table,
 c.confdeltype,c.convalidated,pg_get_constraintdef(c.oid,true) definition,
 ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.ord) child_columns,
 ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.n ORDER BY k.ord) parent_columns,
 ci.classification child_class,pi.classification parent_class
 FROM pg_constraint c JOIN pg_class ch ON ch.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=ch.relnamespace
 JOIN pg_class pa ON pa.oid=c.confrelid JOIN pg_namespace pns ON pns.oid=pa.relnamespace
 LEFT JOIN inventory ci ON ns.nspname='public' AND ci.table_name=ch.relname
 LEFT JOIN inventory pi ON pns.nspname='public' AND pi.table_name=pa.relname
 WHERE c.contype='f' AND (ci.table_name IS NOT NULL OR pi.table_name IS NOT NULL)
),
fk_checks AS (
 SELECT f.*,CASE WHEN child_class IS NOT NULL AND parent_class IS NOT NULL THEN
 (SELECT count(*) FROM rows cr WHERE cr.table_name=f.child_table
 AND NOT EXISTS(SELECT 1 FROM unnest(f.child_columns) k WHERE cr.r->>k IS NULL)
 AND NOT EXISTS(SELECT 1 FROM rows pr WHERE pr.table_name=f.parent_table AND
 NOT EXISTS(SELECT 1 FROM generate_subscripts(f.child_columns,1) k WHERE cr.r->>f.child_columns[k] IS DISTINCT FROM pr.r->>f.parent_columns[k]))) END orphan_count
 FROM fks f
),
function_defs AS MATERIALIZED (
 SELECT p.oid,p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition,
 pg_get_userbyid(p.proowner) owner,p.prosecdef,p.provolatile,p.proconfig,p.proacl
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN('f','p')
),
legacy_functions(oid) AS (
 SELECT oid FROM function_defs WHERE definition ~ 'finance_(expense_claims|compensation_batches|compensation_allocations|company_ledger)'
 UNION SELECT f.oid FROM function_defs f JOIN function_defs callee ON f.definition ~ ('\m'||callee.proname||'\s*\(')
 JOIN legacy_functions used ON used.oid=callee.oid
),
unknown_relations AS (
 SELECT n.nspname schema,c.relname name,c.relkind kind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','f') AND (c.relname LIKE 'finance\_%' ESCAPE '\' OR c.relname LIKE 'document\_%' ESCAPE '\')
 AND NOT EXISTS(SELECT 1 FROM inventory i WHERE i.table_name=c.relname)
 AND c.relname NOT IN ('finance_cash_account_balance_summary','finance_payment_effective_invoice_allocations','finance_invoice_settlement_summary','finance_treasury_accounts','finance_treasury_balances')
),
tax_revisions AS (SELECT *,row_number() OVER(PARTITION BY r->>'source_type',r->>'source_id' ORDER BY (r->>'revision')::integer DESC) rn
 FROM rows WHERE table_name='finance_tax_source_revisions'),
tax_facts AS (
 SELECT f.*,v.r->>'source_type' source_type,v.r->>'source_id' source_id,v.rn=1 latest_revision
 FROM rows f LEFT JOIN tax_revisions v ON v.r->>'id'=f.r->>'revision_id' WHERE f.table_name='finance_tax_position_facts'
),
tax_source_parents AS (
 SELECT v.r->>'id' revision_id,v.r->>'source_type' source_type,v.r->>'source_id' source_id,m.parent_table,
 CASE WHEN m.parent_table IS NOT NULL THEN EXISTS(SELECT 1 FROM rows p WHERE p.table_name=m.parent_table AND p.r->>'id'=v.r->>'source_id') END parent_exists
 FROM tax_revisions v LEFT JOIN (VALUES ('direct_money_receipt','finance_direct_money_receipts'),('payment','finance_payments'),
 ('tax_invoice','finance_tax_invoices'),('tax_correction','finance_tax_document_corrections'),('expense','finance_expenses'),('external_input_vat','finance_external_input_vat')) m(source_type,parent_table)
 ON m.source_type=v.r->>'source_type'
),
config_candidates AS (
 SELECT table_name,r->>'id' id,coalesce(r->>'short_name',r->>'name',r->>'name_th',r->>'legal_name',r->>'template_code',r->>'clause_code',r->>'document_type') label,
 classification,CASE WHEN classification='CONFIG_DECISION' THEN 'explicit row/state review required'
 ELSE 'test-like label only; NOT proof it is disposable' END reason
 FROM rows WHERE (classification='CONFIG_DECISION' AND table_name<>'finance_payee_audit') OR (classification='CONFIG_KEEP'
 AND concat_ws(' ',r->>'short_name',r->>'name',r->>'name_th',r->>'legal_name',r->>'template_code',r->>'clause_code',r->>'note',r->>'spec') ~* '(uat|test|synthetic|ทดสอบ|จำลอง)')
),
blockers(code,count,meaning) AS (
 SELECT 'CUTOVER_DATE_REQUIRED',1::bigint,'No cutover date selected' UNION ALL
 SELECT 'REAL_OPENING_POSITION_REQUIRED',1,'Current New Finance openings/balances are UAT; confirm real account evidence' UNION ALL
 SELECT 'LEGACY_WRITE_LOCK_NOT_IMPLEMENTED',1,'Phase 7A audits only; later backend/UI lock required' UNION ALL
 SELECT 'NUMBERING_RESET_DECISION_REQUIRED',1,'Keep profiles/schema; approve only Finance counter-state reset later' UNION ALL
 SELECT 'LEGACY_CLAIMS_UNDECIDED',count(*),'Submitted claims need settlement or explicit disposition' FROM claims WHERE status='submitted' UNION ALL
 SELECT 'LEGACY_CLAIMS_APPROVED_UNSETTLED',count(*),'Approved claims need ledger reconciliation before settlement/carry decision' FROM claims WHERE status='approved' UNION ALL
 SELECT 'LEGACY_COMPENSATION_OUTSTANDING',count(*),'Non-company final/posted allocations not marked paid' FROM allocations
 WHERE batch_status IN('finalized','posted') AND r->>'is_company_share'='false' AND r->>'payment_status' IS DISTINCT FROM 'paid' UNION ALL
 SELECT 'LEGACY_COMPENSATION_DRAFTS',count(*),'Draft batches are undecided, not confirmed liabilities' FROM batches WHERE status='draft' UNION ALL
 SELECT 'LEGACY_COMPENSATION_FINALIZED_NOT_POSTED',count(*),'Company posting outstanding; custom zero-share exception is reported separately' FROM batches WHERE status='finalized' UNION ALL
 SELECT 'NEW_EXPENSE_LEGACY_BRIDGE',count(*),'Any bridge to real history requires row-specific reconciliation; no automatic UAT purge' FROM rows WHERE table_name='finance_expenses' AND r->>'legacy_claim_id' IS NOT NULL UNION ALL
 SELECT 'LEGACY_SOURCE_LINK_INCONSISTENCY',count(*),'Paid/posted link missing or duplicate/non-effective settlement; do not pay twice' FROM legacy_links
 WHERE (kind='claim' AND status='paid' AND valid_settlement_links<>1) OR source_link_count>1
 OR (kind='claim' AND status<>'paid' AND source_link_count>0)
 OR (kind='batch' AND ledger_id IS NOT NULL AND valid_settlement_links<>1) UNION ALL
 SELECT 'LEGACY_TRANSFER_ANOMALY',count(*),'Missing/mismatched transfer pair; reconcile before closing' FROM legacy_transfer_groups
 WHERE id IS NULL OR legs<>2 OR in_legs<>1 OR out_legs<>1 OR accounts<>2 OR net<>0 UNION ALL
 SELECT 'LEGACY_MISSING_ACCOUNT_OR_INVALID_AMOUNT',count(*),'Cannot claim exact position from incomplete Legacy rows' FROM ledger
 WHERE r->>'bank_account_id' IS NULL OR signed_amount IS NULL OR amount IS NULL OR amount<0 UNION ALL
 SELECT 'LEGACY_UNKNOWN_STATES',
 (SELECT count(*) FROM claims WHERE status NOT IN('submitted','approved','paid','rejected','voided'))+
 (SELECT count(*) FROM batches WHERE status NOT IN('draft','finalized','posted','voided'))+
 (SELECT count(*) FROM allocations WHERE batch_status IS NULL OR r->>'is_company_share' IS NULL OR coalesce(r->>'payment_status','') NOT IN('paid','unpaid')),
 'Unknown/orphan states need human disposition; not silently excluded from obligations' UNION ALL
 SELECT 'LEGACY_NEW_FINANCE_CROSS_REFERENCE',count(*),'Real Legacy references simulated Payment/Invoice; reconcile before future cleanup'
 FROM row_references WHERE classification='LEGACY_REAL_KEEP' AND key IN('source_payment_id','source_invoice_id','payment_id','invoice_id') UNION ALL
 SELECT 'LEGACY_POSTED_COMPANY_LINK_MISSING',count(*),'Nonzero/unknown company allocation in posted batch has no Ledger backlink'
 FROM batches b WHERE status='posted' AND r->>'ledger_entry_id' IS NULL AND NOT(b.r->>'formula_code'='custom' AND
 coalesce((SELECT sum(a.amount) FROM allocations a WHERE a.r->>'batch_id'=b.r->>'id' AND a.r->>'is_company_share'='true'),0)=0) UNION ALL
 SELECT 'KEEP_OR_UNKNOWN_TABLE_REFERENCES_UAT',count(*),'FK boundary requires review; no automatic deletion across it'
 FROM fks WHERE parent_class IN('NEW_FINANCE_UAT_PURGE','DERIVED_PURGE_WITH_PARENT')
 AND coalesce(child_class,'UNKNOWN') NOT IN('NEW_FINANCE_UAT_PURGE','DERIVED_PURGE_WITH_PARENT') UNION ALL
 SELECT 'LEGACY_INVALID_OBLIGATION_AMOUNT',count(*),'Missing/negative amounts cannot be treated as zero outstanding'
 FROM rows WHERE table_name IN('finance_expense_claims','finance_compensation_allocations','finance_compensation_batches') AND (amount IS NULL OR amount<0) UNION ALL
 SELECT 'MISSING_SELECTED_AMOUNT_COLUMN',count(*),'Schema does not expose an audited amount field; totals are incomplete'
 FROM table_stats WHERE amount_column_present=false UNION ALL
 SELECT 'TAX_REVISION_SOURCE_ANOMALY',count(*),'Unknown or missing polymorphic tax source; investigate before cleanup'
 FROM tax_source_parents WHERE parent_exists IS DISTINCT FROM true UNION ALL
 SELECT 'SCOPED_FK_ORPHANS',coalesce(sum(orphan_count),0)::bigint,'Known-table foreign-key orphan rows' FROM fk_checks UNION ALL
 SELECT 'UNCLASSIFIED_FINANCE_RELATIONS',count(*),'Production family absent from repository manifest; preserve until classified' FROM unknown_relations UNION ALL
 SELECT 'CONFIG_ROW_DECISIONS',count(*),'Keep these until human review; marker matching is only a review hint' FROM config_candidates UNION ALL
 SELECT 'AUDIT_ROLE_INCOMPLETE',count(*),'Re-run as approved postgres/BYPASSRLS role for complete counts' FROM pg_roles WHERE rolname=current_user AND NOT(rolsuper OR rolbypassrls)
)
SELECT jsonb_build_object(
 'audit','VP_FINANCE_PHASE_7A_SELECT_ONLY','captured_at',statement_timestamp(),'repo_commit','81c90a5e8632d3c087284d3a9634a38335032922',
 'database',current_database(),'actor',current_user,'CUTOVER_DATE_REQUIRED',true,'cutover_ready',false,
 'broader_unresolved_differences',490,'production_mutation_performed',false,
 'counts_complete_for_current_role',(SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user),
 'table_manifest_and_counts',(SELECT jsonb_agg(to_jsonb(s) ORDER BY table_name) FROM table_stats s),
 'amount_summary_warning','Amounts are per table/status/currency; never add header, allocation, tax, and cash totals together. UNSPECIFIED means no stored currency, not inferred THB.',
 'status_currency_totals',(SELECT jsonb_agg(to_jsonb(s) ORDER BY table_name,status,currency) FROM status_stats s),
 'legacy',jsonb_build_object(
  'expense_outstanding_items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r->>'id','status',status,'amount',amount,'currency',currency,'claim_date',r->>'claim_date',
    'claimant',r->>'claimant_name','ledger_entry_id',r->>'ledger_entry_id') ORDER BY r->>'claim_date',r->>'id') FROM claims WHERE status IN('submitted','approved')),'[]'),
  'expense_outstanding_summary',(SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT status,currency,count(*) count,sum(amount) amount FROM claims WHERE status IN('submitted','approved') GROUP BY status,currency) s),
  'compensation_outstanding_items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r->>'id','batch_id',r->>'batch_id','batch_status',batch_status,'recipient',r->>'recipient_name',
    'payment_status',r->>'payment_status','amount',amount,'currency',currency,'received_date',received_date) ORDER BY received_date,r->>'id')
    FROM allocations WHERE batch_status IS DISTINCT FROM 'voided' AND r->>'is_company_share'='false' AND r->>'payment_status' IS DISTINCT FROM 'paid'),'[]'),
  'compensation_summary',(SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT batch_status,r->>'is_company_share' company_share,r->>'payment_status' payment_status,currency,count(*) count,sum(amount) amount
    FROM allocations GROUP BY batch_status,r->>'is_company_share',r->>'payment_status',currency) s),
  'ledger_position_by_stored_account',(SELECT jsonb_agg(to_jsonb(l)||jsonb_build_object('name',a.name,'bank_name',a.bank_name,'account_last4',a.account_last4) ORDER BY bank_account_id,currency)
    FROM ledger_accounts l LEFT JOIN accounts a ON a.kind='bank' AND a.id=l.bank_account_id),
  'ledger_position_warning','Calculated active Legacy postings, not verified bank cash. Compensation posts company share to KBANK; participant paid flag alone posts no Ledger cash. Do not infer missing bank attribution or sum currencies.',
  'links',(SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT kind,status,count(*) rows,sum(source_link_count) source_links,count(*) FILTER(WHERE ledger_id IS NULL) without_ledger_id,
    count(*) FILTER(WHERE valid_settlement_links=1) valid_links FROM legacy_links GROUP BY kind,status) s),
  'link_anomalies',coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM legacy_links l WHERE (kind='claim' AND status='paid' AND valid_settlement_links<>1) OR source_link_count>1
    OR (status NOT IN('paid','posted') AND source_link_count>0) OR (ledger_id IS NOT NULL AND valid_settlement_links<>1)),'[]'),
  'zero_company_custom_posted_without_ledger',coalesce((SELECT jsonb_agg(b.r->>'id') FROM batches b WHERE b.status='posted' AND b.r->>'formula_code'='custom' AND b.r->>'ledger_entry_id' IS NULL
    AND coalesce((SELECT sum(a.amount) FROM allocations a WHERE a.r->>'batch_id'=b.r->>'id' AND a.r->>'is_company_share'='true'),0)=0),'[]'),
  'transfer_anomalies',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM legacy_transfer_groups t WHERE id IS NULL OR legs<>2 OR in_legs<>1 OR out_legs<>1 OR accounts<>2 OR net<>0),'[]'),
  'unexpected_claim_statuses',coalesce((SELECT jsonb_agg(r->>'id') FROM claims WHERE status NOT IN('submitted','approved','paid','rejected','voided')),'[]'),
  'unexpected_allocation_states',coalesce((SELECT jsonb_agg(r->>'id') FROM allocations WHERE batch_status IS NULL OR r->>'is_company_share' IS NULL OR r->>'payment_status' IS NULL OR r->>'payment_status' NOT IN('paid','unpaid')),'[]')
 ),
 'legacy_new_finance_cross_references',coalesce((SELECT jsonb_agg(jsonb_build_object('table',table_name,'id',row_id,'field',key,'target',value)) FROM row_references WHERE classification='LEGACY_REAL_KEEP' AND key IN('source_payment_id','source_invoice_id','payment_id','invoice_id')),'[]'),
 'new_finance_uat_position',jsonb_build_object(
  'masters',(SELECT jsonb_agg(to_jsonb(a) ORDER BY kind,name) FROM accounts a),
  'opening_states',(SELECT jsonb_agg(jsonb_build_object('id',r->>'id','kind',kind,'account_id',account_id,'currency',currency,'status',status,'as_of',r->>'as_of','amount',amount,'supersedes',r->>'supersedes_opening_balance_id')) FROM openings),
  'simulated_balances',(SELECT jsonb_agg(to_jsonb(b) ORDER BY kind,id,currency) FROM uat_balances b),
  'cash_by_source',(SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT status,currency,r->>'transaction_type' type,r->>'direction' direction,
    CASE WHEN r->>'source_tax_remittance_id' IS NOT NULL THEN 'tax_remittance' WHEN r->>'source_payout_id' IS NOT NULL THEN 'payout'
    WHEN r->>'source_payment_id' IS NOT NULL THEN 'payment' WHEN r->>'source_direct_money_receipt_id' IS NOT NULL THEN 'direct_money'
    WHEN EXISTS(SELECT 1 FROM rows t WHERE t.table_name='finance_treasury_transfer_legs' AND t.r->>'cash_transaction_id'=cash.r->>'id') THEN 'transfer' ELSE 'manual_or_other' END source,count(*) count,sum(amount) cash_amount FROM cash GROUP BY 1,2,3,4,5) s),
  'cash_without_valid_opening',coalesce((SELECT jsonb_agg(c.r->>'id') FROM cash c WHERE c.status='confirmed' AND NOT EXISTS(SELECT 1 FROM openings o
    WHERE o.status='confirmed' AND o.kind=c.kind AND o.account_id=c.account_id AND o.currency=c.currency AND (c.r->>'occurred_at')::timestamptz>(o.r->>'as_of')::timestamptz)),'[]'),
  'payout_cash_origin',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT e.r->>'origin' expense_origin,c.status,c.currency,count(DISTINCT c.r->>'id') cash_rows,count(*) settlement_links FROM cash c JOIN rows st ON st.table_name='finance_payout_allocations' AND st.r->>'payout_id'=c.r->>'source_payout_id' JOIN rows e ON e.table_name='finance_expenses' AND e.r->>'id'=st.r->>'expense_id' GROUP BY 1,2,3) s),'[]'),
  'new_expense_legacy_links',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r->>'id','legacy_claim_id',r->>'legacy_claim_id','status',status)) FROM rows WHERE table_name='finance_expenses' AND r->>'legacy_claim_id' IS NOT NULL),'[]')
 ),
 'numbering',jsonb_build_object(
  'profiles',coalesce((SELECT jsonb_agg(r ORDER BY r->>'document_type') FROM rows WHERE table_name='document_numbering_profiles'),'[]'),
  'counter_state',coalesce((SELECT jsonb_agg(r ORDER BY r->>'doc_type',r->>'year',r->>'month') FROM rows WHERE table_name='finance_document_counters'),'[]'),
  'issued_number_inventory',(SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT table_name,k.key number_field,count(*) count,min(k.value) min_number,max(k.value) max_number FROM rows
    CROSS JOIN LATERAL jsonb_each_text(r) k WHERE k.key IN('quotation_no','agreement_no','invoice_no','receipt_no','tax_invoice_no','combined_no','document_no','correction_no') AND k.value IS NOT NULL GROUP BY table_name,k.key) s),
  'sequences',(SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT schemaname,sequencename,data_type,start_value,min_value,max_value,increment_by,cycle,last_value FROM pg_sequences
    WHERE schemaname='public' AND (sequencename LIKE 'finance\_%' ESCAPE '\' OR sequencename LIKE 'document\_%' ESCAPE '\')) s),
  'reset_warning','Deleting documents does not reset finance_document_counters. Preserve numbering profiles, non-Finance types and Legacy/shared identity sequences; reset only approved UAT Finance state in a later gated task.'
 ),
 'tax_uat',jsonb_build_object(
  'stored_facts_not_recomputed',(SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT source_type,latest_revision,r->>'tax_kind' tax_kind,r->>'treatment' treatment,r->>'period_month' period,currency,count(*) count,sum(amount) stored_tax_amount
    FROM tax_facts GROUP BY 1,2,3,4,5,6) s),
  'source_anomalies',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM tax_source_parents p WHERE parent_exists IS DISTINCT FROM true),'[]'),
  'revision_sources',(SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT r->>'source_type' source_type,count(*) revisions,count(DISTINCT r->>'source_id') sources FROM tax_revisions GROUP BY 1) s),
  'filings_by_form',(SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT r->>'filing_type' form,r->>'period_month' period,status,currency,count(*) count,sum(amount) stored_tax_amount
    FROM rows WHERE table_name='finance_tax_filings' GROUP BY 1,2,3,4) s),
  'outgoing_wht_by_source',(SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT r->>'period_month' period,currency,r->>'status' status,count(*) count,sum(amount) withheld_amount FROM rows WHERE table_name='finance_outgoing_wht_obligations' GROUP BY 1,2,3) s),
  'warning','Counts include immutable history. Latest-revision sums are stored-evidence diagnostics, not recalculated statutory/net tax or a new filing decision.'
 ),
 'config_decisions',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM config_candidates c),'[]'),
 'shared_core_references',(SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT table_name,key,count(*) reference_count,count(DISTINCT value) distinct_targets FROM row_references
   WHERE classification IN('NEW_FINANCE_UAT_PURGE','DERIVED_PURGE_WITH_PARENT') AND key IN('client_id','case_id','advisory_matter_id','claimant_id','recipient_user_id','created_by','created_by_user_id','actor_id') GROUP BY table_name,key) s),
 'optional_broader_cleanup_candidates',coalesce((SELECT jsonb_agg(jsonb_build_object('table',r.table_name,'id',r.r->>'id','label',coalesce(r.r->>'name',r.r->>'title',r.r->>'full_name'),
   'finance_reference_count',(SELECT count(*) FROM row_references x WHERE x.classification IN('NEW_FINANCE_UAT_PURGE','DERIVED_PURGE_WITH_PARENT') AND x.value=r.r->>'id'),
   'decision','NO_TOUCH; test-like text is not deletion authority')) FROM rows r WHERE table_name IN('clients','cases','advisory_matters','user_profiles')
   AND concat_ws(' ',r->>'name',r->>'title',r->>'full_name',r->>'staff_name') ~* '(uat|test|synthetic|ทดสอบ|จำลอง)'),'[]'),
 'shared_audit_by_parent',(SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT r->>'table_name' parent_table,coalesce(i.classification,'SHARED_CORE_NO_TOUCH') parent_class,count(*) count
   FROM rows a LEFT JOIN inventory i ON i.table_name=a.r->>'table_name' WHERE a.table_name='case_audit_logs' GROUP BY 1,2) s),
 'foreign_key_dependencies',(SELECT jsonb_agg(to_jsonb(f)-'oid' ORDER BY child_table,conname) FROM fk_checks f),
 'unclassified_relations',coalesce((SELECT jsonb_agg(to_jsonb(u)) FROM unknown_relations u),'[]'),
 'legacy_writer_surface',jsonb_build_object(
  'functions_and_transitive_callers',coalesce((SELECT jsonb_agg(jsonb_build_object('signature',f.proname||'('||args||')','owner',owner,'security_definer',prosecdef,'volatility',provolatile,'config',proconfig,'acl',proacl::text,
   'definition_sha256',encode(sha256(convert_to(definition,'UTF8')),'hex'),
   'direct_legacy_reference',definition ~ 'finance_(expense_claims|compensation_batches|compensation_allocations|company_ledger)',
   'write_candidate',definition ~* '(insert\s+into|update|delete\s+from|truncate)\s+(public[.])?finance_(expense_claims|compensation_batches|compensation_allocations|company_ledger)',
   'dynamic_sql_review_required',definition ~* '\mexecute\M',
   'authenticated_execute',has_function_privilege('authenticated',f.oid,'EXECUTE'),'anon_execute',has_function_privilege('anon',f.oid,'EXECUTE'),'service_execute',has_function_privilege('service_role',f.oid,'EXECUTE')) ORDER BY f.proname,args)
   FROM function_defs f JOIN legacy_functions u USING(oid)),'[]'),
  'legacy_table_security',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',c.relacl::text,
   'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]') FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname),
   'grants',(SELECT coalesce(jsonb_agg(to_jsonb(g)),'[]') FROM information_schema.role_table_grants g WHERE g.table_schema='public' AND g.table_name=c.relname)))
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('finance_expense_claims','finance_compensation_batches','finance_compensation_allocations','finance_company_ledger')),
  'triggers',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true)))
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public'
   AND (c.relname IN('finance_expense_claims','finance_compensation_batches','finance_compensation_allocations','finance_company_ledger') OR t.tgfoid IN(SELECT oid FROM legacy_functions))),
  'scope_warning','Text/call-graph discovery is evidence, not a proof excluding external SQL, dynamic SQL or scheduled jobs. Direct REST DML must be locked separately in Phase 7B.'
 ),
 'storage_metadata',jsonb_build_object(
  'buckets',(SELECT jsonb_agg(jsonb_build_object('id',b.id,'public',b.public)) FROM storage.buckets b WHERE b.id IN('fee-agreement-executed-documents','vp-document-assets')),
  'object_counts',(SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT bucket_id,count(*) count,min(created_at) min_created_at,max(created_at) max_created_at FROM storage.objects
    WHERE bucket_id IN('fee-agreement-executed-documents','vp-document-assets') GROUP BY bucket_id) s),
  'agreement_file_links',coalesce((SELECT jsonb_agg(jsonb_build_object('agreement_id',a.r->>'id','path',a.r#>>'{signed_evidence_json,evidence_file,storage_path}',
    'object_exists',EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='fee-agreement-executed-documents' AND o.name=a.r#>>'{signed_evidence_json,evidence_file,storage_path}')))
    FROM rows a WHERE a.table_name='finance_fee_agreements' AND a.r#>>'{signed_evidence_json,evidence_file,storage_path}' IS NOT NULL),'[]'),
  'warning','Object storage is separate from DB rows. Keep master logos/signatures. Future evidence cleanup requires exact path/parent mapping; no object or metadata deletion in 7A.'
 ),
 'cutover_blockers_and_decisions',(SELECT jsonb_agg(to_jsonb(b) ORDER BY code) FROM blockers b WHERE count>0)
) AS audit_result;
