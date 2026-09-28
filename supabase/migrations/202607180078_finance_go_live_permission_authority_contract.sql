-- 078 candidate. LOCAL VALIDATION / HUMAN MIGRATION GATE. No financial DML.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
DO $locks$ DECLARE r record; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'FINANCE078_OWNER_REQUIRED'; END IF;
 FOR r IN SELECT c.oid::regclass rel FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind in ('r','p') ORDER BY c.oid LOOP EXECUTE format('LOCK TABLE %s IN SHARE MODE',r.rel); END LOOP;
END; $locks$;
CREATE TEMP TABLE finance078_before ON COMMIT DROP AS select jsonb_build_object('rows',(select coalesce(jsonb_object_agg(name,jsonb_build_object('count',(xpath('/row/n/text()',x))[1]::text::bigint,'sha256',(xpath('/row/h/text()',x))[1]::text)),'{}') from (
 select c.relname name,query_to_xml(format('select count(*) n,encode(sha256(convert_to(coalesce(string_agg((%s)::text,E''\n'' order by (%s)::text COLLATE "C"),''''),''UTF8'')),''hex'') h from public.%I t',
 case when c.relname='user_profiles' then 'to_jsonb(t)-''finance_operator''' else 'to_jsonb(t)' end,
 case when c.relname='user_profiles' then 'to_jsonb(t)-''finance_operator''' else 'to_jsonb(t)' end,c.relname),true,true,'') x
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') and (c.relname like 'finance\_%' escape '\' or c.relname in ('user_profiles','case_audit_logs','document_numbering_profiles'))) captured),'preserved',(select jsonb_build_object('functions',(select coalesce(jsonb_object_agg(v->>'signature',encode(sha256(convert_to((v)::text,'UTF8')),'hex')),'{}') from (select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'security_definer',p.prosecdef,'config',p.proconfig,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text COLLATE "C"),'[]') value
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname not in ('approve_finance_tax_correction','approve_retired_template_use_for_fee_agreement','bridge_finance_legacy_expense','cancel_finance_accepted_quotation_engagement','cancel_finance_payout','clone_document_template_version','confirm_finance_expense_payout','confirm_finance_vp_received_distribution','create_finance_tax_correction_draft','create_finance_tax_remittance','current_user_can_approve_finance_billable_charges','current_user_can_confirm_finance_cash_transactions','current_user_can_confirm_finance_payments','current_user_can_issue_finance_receipts','current_user_can_issue_finance_tax_invoices','current_user_can_manage_finance_billable_charges','current_user_can_manage_finance_cash_transactions','current_user_can_manage_finance_payments','current_user_can_manage_finance_quotations','current_user_can_manage_finance_receipts','current_user_can_manage_finance_tax_invoices','current_user_can_reallocate_finance_payments','current_user_can_reverse_finance_cash_transactions','current_user_can_reverse_finance_payments','current_user_can_view_finance_billable_charges','current_user_can_view_finance_cash_bank_account','current_user_can_view_finance_cash_transactions','current_user_can_view_finance_payments','current_user_can_view_finance_receipts','current_user_can_view_finance_tax_invoices','current_user_can_void_finance_receipts','delete_finance_authorized_signer','expense_account_allowed','expense_account_balance','expense_can_claim','expense_can_manage','expense_can_tax_review','expense_can_view_all','expense_document','get_finance_account_statement','get_finance_cash_flow_summary','get_finance_company_statement','get_finance_direct_vp_formula_context','get_finance_distribution_payment_context','get_finance_expense_access','get_finance_expense_economics','get_finance_payable_entitlements','get_finance_payout_workspace','get_finance_payout_workspace_before_expense','get_finance_revenue_distribution_detail','get_finance_revenue_distribution_workspace','get_finance_statement_accounts','get_finance_tax_filings','get_finance_treasury','get_finance_treasury_month_flow','get_finance_unified_company_statement','get_finance_unpaid_participants_summary','get_finance_vp_formula_context','get_finance_vp_received_distribution','issue_finance_tax_correction','money_allocation_admin','pay_finance_distribution_participant','payout_can_manage','payout_confirm_distribution_outflow','people_admin_save_profile','prepare_finance_expense_payout','record_finance_paid_expense','replace_document_template_draft_structure','save_document_template_alternative_group_draft','save_document_template_clause_slot_draft','save_document_template_family_draft','save_document_template_section_draft','save_document_template_variable_binding_draft','save_document_template_version_draft','save_finance_direct_money_receipt','save_finance_payout_before_expense','save_finance_quotation_service_pattern','save_finance_vp_received_distribution','set_document_template_version_status','set_finance_authorized_signer_active','set_finance_authorized_signer_default','set_finance_billing_plan_status','set_finance_fee_agreement_status','set_finance_quotation_service_pattern_active','set_finance_quotation_status','set_finance_quotation_status_v2','statement_transfer_allowed','tax_filing_account','tax_filing_can_manage','tax_filing_can_remit','tax_position_can_manage','tax_position_can_view','transition_finance_direct_money_receipt','transition_finance_tax_remittance','transition_finance_vp_distribution','treasury_can_view','void_finance_invoice','finance078_account_projection','finance078_active','finance078_admin','finance078_distribution_allowed','finance078_distribution_id_allowed','finance078_effective_lifecycle_guard','finance078_execution_account','finance078_expense_projection','finance078_operations','finance078_operator','finance078_partner','finance078_profile_guard','finance078_remittance_projection','finance078_require_payout','finance078_self_service','get_finance_compensation_access','get_finance_own_legacy_compensation','get_finance_participant_payments')) f,jsonb_array_elements(f.value) x(v)),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by schemaname COLLATE "C",tablename COLLATE "C",policyname COLLATE "C"),'[]') from pg_policies p where schemaname in ('public','storage') and policyname not like 'finance078\_%' escape '\'),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(t.oid)) order by tgrelid::regclass::text COLLATE "C",tgname COLLATE "C"),'[]') from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace in ('public'::regnamespace,'storage'::regnamespace) and not t.tgisinternal and t.tgname not like 'finance078\_%' escape '\'),
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'acl',a.attacl::text) order by c.relname COLLATE "C",a.attnum),'[]') from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v') and a.attnum>0 and not a.attisdropped and not(c.relname='user_profiles' and a.attname='finance_operator')),
 'relations',(select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,'options',c.reloptions) order by c.relname COLLATE "C"),'[]') from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v')),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid),'validated',c.convalidated) order by c.conrelid::regclass::text COLLATE "C",c.conname COLLATE "C"),'[]') from pg_constraint c where c.connamespace='public'::regnamespace and not(c.conrelid='public.user_profiles'::regclass and c.contype='n' and exists(select 1 from pg_attribute a where a.attrelid='public.user_profiles'::regclass and a.attname='finance_operator' and not a.attisdropped and c.conkey=ARRAY[a.attnum]::smallint[]))),
 'indexes',(select coalesce(jsonb_agg(to_jsonb(i) order by schemaname COLLATE "C",tablename COLLATE "C",indexname COLLATE "C"),'[]') from pg_indexes i where schemaname='public'),
 'views',(select coalesce(jsonb_object_agg(c.relname,pg_get_viewdef(c.oid,true)),'{}') from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v'))),'functions',(select coalesce(jsonb_object_agg(v->>'signature',encode(sha256(convert_to((v)::text,'UTF8')),'hex')),'{}') from (select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'security_definer',p.prosecdef,'config',p.proconfig,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text COLLATE "C"),'[]') value
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname in ('approve_finance_tax_correction','approve_retired_template_use_for_fee_agreement','bridge_finance_legacy_expense','cancel_finance_accepted_quotation_engagement','cancel_finance_payout','clone_document_template_version','confirm_finance_expense_payout','confirm_finance_payout_before_expense','confirm_finance_payout','create_finance_tax_correction_draft','create_finance_tax_filing_review','create_finance_tax_remittance','current_user_can_approve_finance_billable_charges','current_user_can_confirm_finance_cash_transactions','current_user_can_confirm_finance_payments','current_user_can_issue_finance_receipts','current_user_can_issue_finance_tax_invoices','current_user_can_manage_finance_billable_charges','current_user_can_manage_finance_cash_transactions','current_user_can_manage_finance_payments','current_user_can_manage_finance_quotations','current_user_can_manage_finance_receipts','current_user_can_manage_finance_tax_invoices','current_user_can_reallocate_finance_payments','current_user_can_reverse_finance_cash_transactions','current_user_can_reverse_finance_payments','current_user_can_view_finance_billable_charges','current_user_can_view_finance_cash_bank_account','current_user_can_view_finance_cash_transactions','current_user_can_view_finance_payments','current_user_can_view_finance_receipts','current_user_can_view_finance_tax_invoices','current_user_can_void_finance_receipts','decide_finance_expense_settlement','delete_finance_authorized_signer','expense_account_allowed','expense_account_balance_private','expense_account_balance','expense_can_claim','expense_can_manage','expense_can_read','expense_can_tax_review','expense_can_view_all','expense_document','expense_payout_choice','get_finance_direct_vp_formula_context','get_finance_expense_access','get_finance_expense_accounts','get_finance_expenses','get_finance_payable_entitlements','get_finance_payout_workspace_before_expense','get_finance_payout_workspace','get_finance_tax_filings','get_finance_treasury_month_flow','get_finance_treasury','get_finance_vp_formula_context','get_finance_vp_received_distribution','issue_finance_tax_correction','money_allocation_admin','payable_assert_distribution','payout_can_manage','prepare_finance_expense_payout','record_finance_paid_expense','replace_document_template_draft_structure','review_finance_expense_tax','review_finance_expense','save_document_template_alternative_group_draft','save_document_template_clause_slot_draft','save_document_template_family_draft','save_document_template_section_draft','save_document_template_variable_binding_draft','save_document_template_version_draft','save_finance_direct_money_receipt','save_finance_payout_before_expense','save_finance_payout','save_finance_quotation_service_pattern','save_finance_vp_received_distribution','set_document_template_version_status','set_finance_authorized_signer_active','set_finance_authorized_signer_default','set_finance_billing_plan_status','set_finance_fee_agreement_status','set_finance_quotation_service_pattern_active','set_finance_quotation_status_v2','set_finance_quotation_status','set_finance_treasury_authority','tax_filing_account','tax_filing_assert','tax_filing_can_manage','tax_filing_can_remit','tax_position_can_manage','tax_position_can_view','transition_finance_direct_money_receipt','transition_finance_tax_filing','transition_finance_tax_remittance','transition_finance_vp_distribution','treasury_can_view','treasury_location_active','void_finance_invoice','confirm_finance_treasury_transfer','confirm_finance_vp_received_distribution','get_finance_account_statement','get_finance_cash_flow_summary','get_finance_company_statement','get_finance_distribution_payment_context','get_finance_expense_economics','get_finance_general_payables_summary','get_finance_receivables_summary','get_finance_revenue_distribution_detail','get_finance_revenue_distribution_workspace','get_finance_statement_accounts','get_finance_unified_company_statement','get_finance_unpaid_participants_summary','pay_finance_distribution_participant','payout_confirm_distribution_outflow','statement_transfer_allowed','people_admin_save_profile','finance078_account_projection','finance078_active','finance078_admin','finance078_distribution_allowed','finance078_distribution_id_allowed','finance078_effective_lifecycle_guard','finance078_execution_account','finance078_expense_projection','finance078_operations','finance078_operator','finance078_partner','finance078_profile_guard','finance078_remittance_projection','finance078_require_payout','finance078_self_service','get_finance_compensation_access','get_finance_own_legacy_compensation','get_finance_participant_payments')) f,jsonb_array_elements(f.value) x(v)),'security',(select jsonb_object_agg(c.relname,encode(sha256(convert_to((jsonb_build_object('owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by p.policyname COLLATE "C"),'[]') from pg_policies p where p.schemaname='public' and p.tablename=c.relname)))::text,'UTF8')),'hex'))
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('finance_treasury_account_authorities','finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit','finance_payable_entitlements','finance_payable_entitlement_sources','finance_payable_entitlement_audit','finance_cash_transactions','finance_account_opening_balances','finance_cash_transaction_audit_events','finance_account_opening_balance_audit_events','finance_company_profiles','finance_authorized_signers','finance_quotation_service_patterns','document_numbering_profiles','document_templates','document_template_versions','document_template_sections','document_template_clause_slots','document_template_variable_bindings','document_template_alternative_groups','document_clause_libraries','document_clause_versions','document_clause_version_variable_bindings','finance_bank_accounts','finance_bank_account_access','finance_company_ledger','finance_compensation_batches','finance_compensation_allocations')),'authority',(select value->0 from (select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'generated',a.attgenerated,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum),'[]') from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid),'validated',convalidated) order by conname COLLATE "C"),'[]') from pg_constraint where conrelid=c.oid and contype<>'n'),
 'indexes',(select coalesce(jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) order by indexname COLLATE "C"),'[]') from pg_indexes where schemaname='public' and tablename=c.relname),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by policyname COLLATE "C"),'[]') from pg_policies p where schemaname='public' and tablename=c.relname),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) order by tgname COLLATE "C"),'[]') from pg_trigger where tgrelid=c.oid and not tgisinternal),
 'anon_select',has_table_privilege('anon',c.oid,'SELECT'),'authenticated_write',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'),
 'service_select',has_table_privilege('service_role',c.oid,'SELECT')) order by c.relname COLLATE "C"),'[]') value
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v') and c.relname='finance_treasury_account_authorities') catalog),'additions',(select jsonb_build_object(
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by schemaname COLLATE "C",tablename COLLATE "C",policyname COLLATE "C"),'[]') from pg_policies p where schemaname in ('public','storage') and left(policyname,11)='finance078_'),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(t.oid)) order by tgrelid::regclass::text COLLATE "C",tgname COLLATE "C"),'[]') from pg_trigger t where not tgisinternal and left(tgname,11)='finance078_')))) state;
DO $baseline$ DECLARE s jsonb; BEGIN
 SELECT state INTO s FROM finance078_before;
 IF s->'functions' IS DISTINCT FROM '{"approve_finance_tax_correction(uuid,jsonb,boolean,text,boolean)":"1b85a8a08b872ec8a2c44dd7ea396d3cbc3ad9f19369ef4ec3024b5f01529aae","approve_retired_template_use_for_fee_agreement(uuid,text)":"47eadf1102d46f56bd71851c3cbba95d70d296bfccb2554207bf1c748c0c9435","bridge_finance_legacy_expense(text,uuid,text,boolean)":"fa44071aaf89c840efdb3ae58ce41cc3313eea325cac7d23d5b15679e33deb4b","cancel_finance_accepted_quotation_engagement(uuid,text)":"d90debe59337fb87668221792423227d833be3738b983b715b49e0361654d157","cancel_finance_payout(uuid,integer,boolean)":"7477645738f4e22811a06cabe3c28e87300f4927af05428d161b4eb8ba20ce35","clone_document_template_version(uuid)":"014a861e45f21a3ef6383f4caf76684611cfc1982f0b3c4b9d2f0602cd5a4f2f","confirm_finance_expense_payout(uuid,integer,integer,uuid,boolean)":"53c96aaecfe122d6ebc365c8a87f730a3c179985a0aa6763b039e2c7b81f9d64","confirm_finance_payout_before_expense(uuid,integer,integer,uuid,boolean)":"5bbc489fe85775b4a648bf5b322f4f9faed07df76c580ee2febe48c309a07ec4","confirm_finance_payout(uuid,integer,integer,uuid,boolean)":"6feef0df974008d2bf241136399bfe1f33faf8236f676a2eb65982541893a8dd","create_finance_tax_correction_draft(uuid,uuid,uuid,text,text,text,text,date,date,jsonb)":"1cd8f6901b77b112ff7f2c936affb34ba24cd75ff567ba1b3c67a8d19aed718b","create_finance_tax_filing_review(uuid,date,text,text,text,jsonb,jsonb)":"aa3b7b87be001dd3210705df0ece8bc6f65b2ec2963733f41f326e88518644aa","create_finance_tax_remittance(uuid,uuid,uuid,uuid,date,text,text,jsonb)":"64aa802c50b55f2b48616ed3a94094b44f825246ba2e8bd1882b33439ff5778e","current_user_can_approve_finance_billable_charges()":"5ba8d2560d6a58595452fd6507dcd7dd658cd386b774584bf2843d07253502db","current_user_can_confirm_finance_cash_transactions()":"9be1c680a12918fc52d6479e01869dea7a5201d9f998254ace13503de6433cd0","current_user_can_confirm_finance_payments()":"9b9489e9b5c849a0b8193431112622f6a9581ffed5fbd286c17b4afe5b427082","current_user_can_issue_finance_receipts()":"46d1a994cfc8792705bd4c3ce989bc8b30e58658e0bf3416210e24024e41d562","current_user_can_issue_finance_tax_invoices()":"8a2caee6d62f42f53eb65626a8d55ee2ed2452ef0bd0c34bd692984485249c75","current_user_can_manage_finance_billable_charges()":"8f16d9ecdecf44cb9c0341626146857534f2009a45b3e288b1938047fc1362bc","current_user_can_manage_finance_cash_transactions()":"6e0eac1c3b24b45f8ef9f9c4b26198dd5bbb105b968cea37a875d552f738edda","current_user_can_manage_finance_payments()":"2091486ebdefdbecfb944ad9bff41749f17ba52fa77f04e1fb77e4917d9d0fbd","current_user_can_manage_finance_quotations()":"ef3faad1c6cc8446c75614a8a74ae0679bbb1c23fb790ede9cb09e36db855a4b","current_user_can_manage_finance_receipts()":"582b4af3f230c7c7c7359c522563c60d55db8ab9488bd2ad036b8382f7c606f6","current_user_can_manage_finance_tax_invoices()":"c7774d7b4a3becd797e079e99b5282671e56ea2b4645999c9b4cd252286a5685","current_user_can_reallocate_finance_payments()":"68021d012321529bba8610274ac764cdc5db8647f2a8374df0b2283c01d3e0d6","current_user_can_reverse_finance_cash_transactions()":"bd5e207f8a58b3833aebaf1a47b3cdd27988d09d5d5f1f9c5eb2feb1c63fcaaf","current_user_can_reverse_finance_payments()":"951b8c288c0752ac59ec515f41504abc4efda8b91d000dac5187bafa624a6189","current_user_can_view_finance_billable_charges()":"85a27d4521ec2c2bdb6a64a25d59bcd8db256b5aa1f5a0c9cfc839fb1d10f00c","current_user_can_view_finance_cash_bank_account(uuid)":"0cf8c83f932c7a30f1ee18e780deff5722b19056de36a44bdf982a5539923ae5","current_user_can_view_finance_cash_transactions()":"0dab738a6774c9bdb2fb4c5d4278c301e2b394e0e9d1d0a649a9b3093448ec62","current_user_can_view_finance_payments()":"376f72ed891b511901d6885aa49bad60e5d7e06a89c28f73652799f2402407cb","current_user_can_view_finance_receipts()":"d9ce1eb68a6f8c87c62a0b276f9ed29e6c3e8f0719efbe36704101a702ee2206","current_user_can_view_finance_tax_invoices()":"6aae4fc93cc7264df02e5ff2c49c3abf35e8f9a3f485082eae4908bfcb9e2fd5","current_user_can_void_finance_receipts()":"9e8d392402933d40ee6cdb75f4b893a5cd367fc52b518b5e006c247dc2a89d84","decide_finance_expense_settlement(uuid,uuid,text,uuid,numeric,date,text)":"94252d78026f3896dcff51c61b4861b41a2245a6bd9a127db7d09397d0ca5526","delete_finance_authorized_signer(uuid)":"fbeeb5715bcbf2aad7d4484e62526da004e4c72a57df27d6032ea6edfb4e9487","expense_account_allowed(uuid,uuid,text)":"7f3a365d0453355735a20700188778489b60f1c417f614e55a8efadbff4ff264","expense_account_balance_private(uuid,uuid)":"4900274795c6f927ad8ad922c656c0f1ee4d56eda3846cf15ea201c6a6cf59ee","expense_account_balance(uuid,uuid)":"1b05e7df6d0aa896df33c45aa6f32070f4a1ce0bca546ac18d2693f6955e07cb","expense_can_claim()":"c94896ca7f931a1cdc5cb8e6b3bf5602cef5c9fc369c2de69e3fe2246ca48405","expense_can_manage()":"50e5cdc89788d25c6ecb0bbeac03b95ddb16531d213dcfa4c074f9bb35e01346","expense_can_read(uuid)":"b3bad1b54393ab9b8c2efbd1581d0a8fff84e43aa3f286ca6ef4c6284530cb59","expense_can_tax_review()":"346e2d28932e565b4d89f799f8cf74b4f9966ef5bb15840a3d369e660b43864f","expense_can_view_all()":"2adb1e9bb806128ee385dd9f7621c8f960f2d199b637b7801dd4ba397d916b45","expense_document(uuid)":"17cad08faea643f39fc89542ac13f9a11fa218334a4facff31f91a232b38b986","expense_payout_choice(uuid,boolean)":"824f97735cdb2de19b23a7f6c10fe1e68109b9a8b872ea4106dc9663552ca118","get_finance_direct_vp_formula_context(uuid)":"fb9d8ececce523f8e557046a48f6e1895a4141b8e591bb3fdb2c2c5a2edce855","get_finance_expense_access()":"50d3646a9e7cdf9469c0984b68fbdaa840002612f18e6c2b01b61ee883966220","get_finance_expense_accounts()":"1bd8f549a6a12ea8c16cfe5110d799842fe4aa88fd5995cb1099f0ba9fa772e8","get_finance_expenses(uuid,boolean,integer)":"b6edaad770683f3c2cd8f860576086420477ae667d24be8d0653375039fe1446","get_finance_payable_entitlements(text,text,text,text,integer)":"8d86b807a7f551b5dbbcdbd96696b95ce98c5b4395cd85f50205e93b993886d9","get_finance_payout_workspace_before_expense(uuid,uuid)":"3f47d864b2e544323d51f7d9cc0c1dab631fa1a71fb64bcdd6ecbb0f85b42663","get_finance_payout_workspace(uuid,uuid)":"79131baae0bf7991f6fd7ddf2429547173be0888b964ab336a700371a92a9711","get_finance_tax_filings(date)":"a096efd3ce8ba97154b38ce72f0f5eb2d60b83df8ae023c7b9ff41a103914130","get_finance_treasury_month_flow(date)":"f2991eb967c823dd1d4d8ac79e2ce5da86e3ee49ed27ca32f9ea9d24ddc4e6bc","get_finance_treasury(integer)":"8edfd690be606f744b618132c9f4284476931ed1ccd8d34edd2e8a14736ff231","get_finance_vp_formula_context(uuid)":"f1526e319cd87cdcd034c5144836cdc37d15156448b5fe4f69297d3a862c3909","get_finance_vp_received_distribution(uuid,uuid)":"db93ae0338d1fbaa40d56a99628bd3fe993bbde47636fdbc87e28b8dd14b9f17","issue_finance_tax_correction(uuid,jsonb,boolean,boolean)":"d69f363ba01df07617167c60edcb9f4fb05c83f9f7895e97d95e30f2ed8df218","money_allocation_admin()":"83bf6979abc14134eeb6e93ead7891e2ab68729ebda91bdfbed241f9705a5e7b","payable_assert_distribution(uuid)":"dfd7118c017f77de109cddc1e62b3e30d989bf3550fbb890b97ac01546f94ed7","payout_can_manage()":"a32ae7c39d7d8e192098480c9baf089f27543add47b294a0e1dd6ccd04d5e270","prepare_finance_expense_payout(uuid,uuid,integer,date,uuid,uuid,boolean,text)":"c996701f750ac374ef509fa43a34177a2f05540f3888c9f94a4dd24fa93bf7a3","record_finance_paid_expense(uuid,jsonb,uuid,uuid,date,boolean)":"5bd1fea3b7df1015e6428abf049fc1b696edf5e75d77e07e510163eda7e12501","replace_document_template_draft_structure(uuid,jsonb)":"3263221d3775c42500fb1903e436a695a2a6ab3f662b50dfce62395bf8156369","review_finance_expense_tax(uuid,uuid,uuid,jsonb)":"543e2c4d545e90c4d34786095aaa6d01d95a5c126a72bcc877083c2d3dc9ea4f","review_finance_expense(uuid,integer,boolean,text)":"5e21f2bd33d757dbc6d4c503e28d5f80468ca796cc61db715a0a6ced4dbc0c3d","save_document_template_alternative_group_draft(uuid,uuid,text,text,integer,integer,boolean,uuid,jsonb,text,integer,jsonb)":"7bb7951f20dc52a762e9b8e400244924853c42140ffed4b8ca2bbc7863460ac5","save_document_template_clause_slot_draft(uuid,uuid,text,uuid,integer,uuid,text,text,text,integer,text,uuid,jsonb,boolean,boolean,boolean,boolean,text,jsonb)":"16ed58d3432be44e16d55b3d2aa201d8b3df4c3edd12a12335555e5bbb09794a","save_document_template_family_draft(uuid,text,text,text,text,jsonb)":"888e3e6d86be0d492356687c88b0df6fd30a12b9ea0baf6ca797ed32ea0014d3","save_document_template_section_draft(uuid,uuid,text,text,integer,uuid,text,text,text,integer,text,jsonb,boolean,boolean,text,jsonb)":"d11a35a2abddd42883dda1c98832533b39ff58bbff94c208808314b95fd439cd","save_document_template_variable_binding_draft(uuid,uuid,uuid,boolean,jsonb,text,jsonb)":"21dbaa8cd5e178ef4d830c82e2f3832aaafd4db701b49e0dcf14e496738f62fe","save_document_template_version_draft(uuid,uuid,text,jsonb,date,date)":"cea18f98175a1febd00a2b39e038408d02a7e5d9c618dbccc33a2438733c7c9f","save_finance_direct_money_receipt(uuid,integer,jsonb)":"c9d289a7402e3502c68f52e878cd059efa4c4496e72cc2df10da30b755d162c7","save_finance_payout_before_expense(uuid,uuid,date,uuid,uuid,jsonb,text,integer)":"9224c306b191f4c5bd9c72591de550219feab9b12daca306fd111b9247c0a289","save_finance_payout(uuid,uuid,date,uuid,uuid,jsonb,text,integer)":"5cfef211be117fc0e191666fbb02e83bca4aa444d0926a20ec14541273631f56","save_finance_quotation_service_pattern(uuid,text,text,text,text,text,text,text,integer)":"9f8e545b485bc290070bfeedcdff0c43a0e40c80ea2348e1dc5e752b016a8a98","save_finance_vp_received_distribution(uuid,uuid,uuid,integer,jsonb,jsonb,text)":"f7f943951729af00f04ab299e458b4a39f5b9b8f626db4a934daa8fa75a7f9ee","set_document_template_version_status(uuid,text,text,text)":"26da548e997246166f485145465345db0aeac7008295ba1dbeea79ff0fb5b3f2","set_finance_authorized_signer_active(uuid,boolean)":"a0877947504e005fd06424fbb2487d8aecbedf82c4d5a62b064c46f4dbb3cc3e","set_finance_authorized_signer_default(uuid,uuid,text,text)":"5c668e43da07c386db4ece62a1ff37ae17ea6f83bc85302ab515c2941396f402","set_finance_billing_plan_status(uuid,text)":"a434c26daced803b665a112a4af0f24f0693ced5c11012fa5c99c067b89a844f","set_finance_fee_agreement_status(uuid,text)":"a5a7aba2e33480953dfdfb9b3dbeccbc2baccb4afc897142a3409b28fa67369c","set_finance_quotation_service_pattern_active(uuid,boolean)":"4f9ec2a5fd1a8c34ae082d11c3b38e0b3eecd4f77b7aec58d3f3b4172d1f6076","set_finance_quotation_status_v2(uuid,text,text,uuid,text,text)":"8c648c299d8eca826b829ad41db2b30e9edb93a527a973b8ccb3de13ec4ef3f0","set_finance_quotation_status(uuid,text,text,uuid,text,text)":"a32c5c48e5ff20ed8850d1e625d7efddf2648f3041951aca9fc0dba0e425c951","set_finance_treasury_authority(uuid,uuid,uuid,jsonb,integer,text)":"d04d1b16c953536a7533837f3f037cfa446f7aaa4c886304f65279c9f180be6a","tax_filing_account(uuid,uuid)":"11e6d9f87c6816db90a521c39bf0ef5216dce5ec4a6be5e34f27b75e30ac88fa","tax_filing_assert(uuid)":"e20b7d98859c3036530831d17ee4542b00eb38fd08fd54016c94cc61c2979b08","tax_filing_can_manage()":"9398d4fce4b1d632d90fdd871e0ab674df470ecb4c65ecc0b9e5720ce6822e11","tax_filing_can_remit()":"b642766190aaaa12713990ca60496c84a7492e2c223e20611e50eeab5bff68b2","tax_position_can_manage()":"efd01a94230c313528afb8fb558891f1459ee98bb37b0844a5e8ac482119cd4f","tax_position_can_view()":"8d9779516835dba39d2b89f1e9b7a809079e06cb4d748d5d32724ee51a1506e5","transition_finance_direct_money_receipt(uuid,integer,text,boolean,text)":"b1ae3bb4cac2c00287bf0bc3a64d3776ea92733daa1dc10951998263a95e9128","transition_finance_tax_filing(uuid,integer,text,date,text,text,boolean)":"977f0ea257fac336dfa31e09276fdf825de90e28a552e1e948a7b07ef435db94","transition_finance_tax_remittance(uuid,integer,text,boolean)":"3637594404d7ad30fd3bebd370a927d54d784c631b17f18619e96e5a6293e72c","transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)":"8dd56761749d08a2ee7b9813171dd7dcb6d2ab6b68eb9f427594d1e88ffedfed","treasury_can_view(uuid,uuid)":"08bae8a170ea48bc5b8b7534fcd83c35ef5971433cfa3bed84130f18ab9d469c","treasury_location_active(uuid,uuid)":"197f319835bbdc4ced7367443852305541fb49bfdee62b6cf27d744d439a9b43","void_finance_invoice(uuid,text,boolean)":"8005577d090f3b206e16ca232526f1e45e1e01df564a1a2b59d03bc7a2e1d8b7","confirm_finance_treasury_transfer(uuid,uuid,uuid,uuid,uuid,numeric,date,text,boolean)":"6a03fe860d48be111455c707d7160ef5df606b3590be3b652df37e02a2d7b6e1","confirm_finance_vp_received_distribution(uuid,uuid,uuid,integer,jsonb,jsonb,text,boolean)":"c2454b5280b92da92844cae8b0bc4de87fa25068967eaab3bb0cb895432395bf","get_finance_account_statement(uuid,uuid,date,date,text,text,integer)":"c892eb5b70e323f5889e3bad05b47c82265b1578cfcb4905de600329e4bbed6a","get_finance_cash_flow_summary(date,date)":"469f5be85ee2cf5df4a05e8bfea1c09840b5487e4cb00bce9978de02eaae051b","get_finance_company_statement(date,text,text,integer)":"5aea89635406af00b4dcc368fe5cce9ea390141b24697c37321dc2244a2a6057","get_finance_distribution_payment_context(uuid,uuid)":"4e67e1d9aa3e4c9bb467ff855085078361fd46e1bb9179f6dabcf9b67820c396","get_finance_expense_economics(uuid)":"91f8a0f5155c18a2f959503cddae2b01644a2b82ef7ccba2752231dbb16e7955","get_finance_general_payables_summary()":"993109fc913a6c9c59d9cdb97a223dcb881f9b587dd5bb0411368fd64f0e0e62","get_finance_receivables_summary()":"73e67b9f06e6bd3d30a81c37cbac25bdf160e837a30d72f3a65401da34a8de1b","get_finance_revenue_distribution_detail(text,uuid)":"f1553b78da93cd6304f4b4a1666f64f9829e2b1727caad5ca998ccba9b99766f","get_finance_revenue_distribution_workspace(date,text,text,text,integer)":"0fef019e663dabd57a5bb51203fc36e279e47e92e13349b7e121562fc890ce70","get_finance_statement_accounts()":"5ff5e3aca5e958d0a6df75525919b5d46eda01856289d45d739bb2598e761aab","get_finance_unified_company_statement(date,date,text,text,integer)":"b58bbd6e32932accfcb46bd26bd56135d13f06a11bb673e7e0d8fb04978626e6","get_finance_unpaid_participants_summary()":"abcec9e70a4839491429b0e46b3eb08acd0062d0529d7286de598742bb43e33e","pay_finance_distribution_participant(uuid,uuid,uuid,integer,date,uuid,uuid,text,numeric,text,boolean)":"e77a5fe77c4e3bd2c21787f354352c7a4665d6934e6a0fa90e898b9f1de2d87e","payout_confirm_distribution_outflow(uuid,integer,integer,uuid,boolean,boolean)":"8fee7b8a1828a0c16eb834563e4f2392208f31adf6018398215809f06ec2119a","statement_transfer_allowed(uuid,uuid,uuid,uuid)":"87cf4911d8199eb27e39496e64c080ec20ffca3025995452bae00677c8415603","people_admin_save_profile(uuid,jsonb,jsonb,uuid)":"e6e95dc6a7311897d33dded1542b6f79136de47aef6a8e10d0e0f12c83a48fc3"}'::jsonb THEN RAISE EXCEPTION 'FINANCE078_BASELINE_MISMATCH: functions'; END IF;
 IF s->'security' IS DISTINCT FROM '{"finance_treasury_account_authorities":"35fc91bc897e99dc6fc9149588f981eba7770717d6b39450fce20b4fd7119921","finance_vp_revenue_distributions":"9e78c6c7752c69891f1e789f8a278c324f5667da3a98883fd22fc92ad8d82c96","finance_vp_revenue_distribution_audit":"2a394f5ba5feec50b32a144078cad32963677f5da0a6d3a7b7105f8dd8b1daa6","finance_payable_entitlements":"ed8e3de415ce72a5d380deae3d1f11a29330a3fb38b7703401e9ed8948965e7c","finance_payable_entitlement_sources":"f43187a2f3877294388d3bc41862d0ba1bb72239219cff71a90b70626cf2f241","finance_payable_entitlement_audit":"0a9c1dff6fb87486c8c8f28e0bb14c6bc30e8afb7ac98dfac7e554138707f87e","finance_cash_transactions":"51002b8312bcfb3c9165dd0d12da6d06a41c245bb43bf2f6cdfb0508032f7002","finance_account_opening_balances":"3cfe8fa035ee5582eb6866aad5c514f7ed8500416c637607f9d8f972d5881457","finance_cash_transaction_audit_events":"1832bd1acdedb49243147b8f13b01d4e8b3053424f2b337ca7c7282533c25b93","finance_account_opening_balance_audit_events":"8d8cb779ed7dd90d0799e395e04130211ff575524faeaaac4cc7bf9889ec51f8","finance_company_profiles":"29dff6c94b443164c94d89fddf4004e25ef605c54a4a9bf41e728a598f6f927d","finance_authorized_signers":"d86fccb19fc8db65fbbf0b8501fc08e14b23698bf2b50c6505197cd740fadd62","finance_quotation_service_patterns":"9290a08101efd47e13c790fc6e20816abb79730e5910dffd2c0e45b2f28fb9d9","document_numbering_profiles":"9f160bb6da371b1fe4f42a7985f7927a654d5344884e54db9e263582cb20f995","document_templates":"0cafe274c8b23ff5d221812e7799721b1dd27748eeddee81c39613ad4c97bff4","document_template_versions":"2b5f601daf8d4c9ff85f6976742184fd447266c6517c351509bc1855664b4796","document_template_sections":"c4e1cdaf40d01affa99c21ef51a2cf5a3b52821353949ceaab75ea8910943fa7","document_template_clause_slots":"6b8dfadfd4ca8b00f73f01a94b5d6114f89aaace98c93fd3fcf753c787f2ffb7","document_template_variable_bindings":"31e82941d177cb94c65bebb0a504b279aed5c0003e71d1b5d99fe92fa8e05782","document_template_alternative_groups":"6ff1127f2a46c3e55808beef690e741aedc18cdcd8a4392b6a48b070a9afeff5","document_clause_libraries":"ae989a1e79b4e72e8a31eb686f2920dbc7cfd96cf13e315cae1bb3228f8fb797","document_clause_versions":"fb6a8af908666a94dffba785a2f86da20140018deba7d3b9fb36110d342a778d","document_clause_version_variable_bindings":"50c0e47afc978dfe0ffeed505fac7b982e58e5daa3ee811ee6c379909975a7c7","finance_bank_accounts":"27cc4d552a9af914d462547b9e8cf173aff5f5b54946a42bbdf82995e50ec8df","finance_bank_account_access":"ec9afc4ac04f0715f177d0ad996094e7c8d84aa007842fcbaceb8388c016c195","finance_company_ledger":"5cbcc97c2de87d9e5a04a0e1fbd160437fa13618777e5963c50aeba2a3983881","finance_compensation_batches":"ec92dd21956a2545be2eb887a896006eb2022fce146f5a5cbe0a3e44b7d173a4","finance_compensation_allocations":"5b14906235e6d7765facc182f058ff2da78d5eb5dc0ee2bf0331f086de8441e1"}'::jsonb THEN RAISE EXCEPTION 'FINANCE078_BASELINE_MISMATCH: security'; END IF;
 IF s->'authority' IS DISTINCT FROM '{"acl":"{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}","rls":true,"kind":"r","name":"finance_treasury_account_authorities","owner":"postgres","columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","identity":"","not_null":true,"generated":""},{"name":"user_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"bank_account_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"cash_location_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"view_balance","type":"boolean","default":"false","identity":"","not_null":true,"generated":""},{"name":"view_movements","type":"boolean","default":"false","identity":"","not_null":true,"generated":""},{"name":"record_outflow","type":"boolean","default":"false","identity":"","not_null":true,"generated":""},{"name":"confirm_outflow","type":"boolean","default":"false","identity":"","not_null":true,"generated":""},{"name":"version","type":"integer","default":"1","identity":"","not_null":true,"generated":""},{"name":"updated_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""},{"name":"updated_by","type":"uuid","default":null,"identity":"","not_null":true,"generated":""}],"indexes":[{"name":"expense_account_bank_authority","definition":"CREATE UNIQUE INDEX expense_account_bank_authority ON public.finance_treasury_account_authorities USING btree (user_id, bank_account_id) WHERE (bank_account_id IS NOT NULL)"},{"name":"expense_account_cash_authority","definition":"CREATE UNIQUE INDEX expense_account_cash_authority ON public.finance_treasury_account_authorities USING btree (user_id, cash_location_id) WHERE (cash_location_id IS NOT NULL)"},{"name":"finance_treasury_account_authorities_pkey","definition":"CREATE UNIQUE INDEX finance_treasury_account_authorities_pkey ON public.finance_treasury_account_authorities USING btree (id)"}],"policies":[],"triggers":[{"name":"expense_history_immutable","enabled":"O","definition":"CREATE TRIGGER expense_history_immutable BEFORE DELETE OR UPDATE ON public.finance_treasury_account_authorities FOR EACH ROW EXECUTE FUNCTION expense_immutable()"},{"name":"expense_no_truncate","enabled":"O","definition":"CREATE TRIGGER expense_no_truncate BEFORE TRUNCATE ON public.finance_treasury_account_authorities FOR EACH STATEMENT EXECUTE FUNCTION expense_immutable()"}],"force_rls":false,"anon_select":false,"constraints":[{"name":"finance_treasury_account_authorities_bank_account_id_fkey","validated":true,"definition":"FOREIGN KEY (bank_account_id) REFERENCES finance_bank_accounts(id)"},{"name":"finance_treasury_account_authorities_cash_location_id_fkey","validated":true,"definition":"FOREIGN KEY (cash_location_id) REFERENCES finance_cash_locations(id)"},{"name":"finance_treasury_account_authorities_check","validated":true,"definition":"CHECK ((num_nonnulls(bank_account_id, cash_location_id) = 1))"},{"name":"finance_treasury_account_authorities_check1","validated":true,"definition":"CHECK (((NOT confirm_outflow) OR record_outflow))"},{"name":"finance_treasury_account_authorities_pkey","validated":true,"definition":"PRIMARY KEY (id)"},{"name":"finance_treasury_account_authorities_updated_by_fkey","validated":true,"definition":"FOREIGN KEY (updated_by) REFERENCES user_profiles(id)"},{"name":"finance_treasury_account_authorities_user_id_fkey","validated":true,"definition":"FOREIGN KEY (user_id) REFERENCES user_profiles(id)"},{"name":"finance_treasury_account_authorities_version_check","validated":true,"definition":"CHECK ((version > 0))"}],"service_select":true,"authenticated_write":false}'::jsonb THEN RAISE EXCEPTION 'FINANCE078_BASELINE_MISMATCH: account_authority_catalog'; END IF;
 IF s->'additions' IS DISTINCT FROM '{"policies":[],"triggers":[]}'::jsonb THEN RAISE EXCEPTION 'FINANCE078_ALREADY_PRESENT'; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.user_profiles'::regclass AND attname='finance_operator' AND NOT attisdropped) THEN RAISE EXCEPTION 'FINANCE078_ALREADY_PRESENT'; END IF;
END; $baseline$;
-- BEGIN 078 AUTHORITY CONTRACT
-- 078 authority changes only. This source is assembled into the manual candidate.
ALTER TABLE public.user_profiles ADD COLUMN finance_operator boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.user_profiles.finance_operator IS 'Admin-assigned Finance operational responsibility. Does not grant approval, incoming confirmation, Distribution or account custody.';

CREATE FUNCTION public.finance078_active() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND active IS TRUE AND must_change_password IS FALSE);
$$;
CREATE FUNCTION public.finance078_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.finance078_active() AND EXISTS(SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND role='admin');
$$;
CREATE FUNCTION public.finance078_partner() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.finance078_active() AND EXISTS(SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND role='partner');
$$;
CREATE FUNCTION public.finance078_operator() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.finance078_active() AND EXISTS(SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND finance_operator AND role IN ('lawyer','assistant_lawyer','staff'));
$$;
CREATE FUNCTION public.finance078_operations() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.finance078_admin() OR public.finance078_partner() OR public.finance078_operator();
$$;
CREATE FUNCTION public.finance078_self_service() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.finance078_active() AND EXISTS(SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND role IN ('admin','partner','lawyer','assistant_lawyer','staff'));
$$;

-- Explicit custody. No fallback to generic cash flags or legacy bank access.
CREATE OR REPLACE FUNCTION public.expense_account_allowed(p_bank uuid,p_cash uuid,p_right text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT num_nonnulls(p_bank,p_cash)=1 AND p_right IN ('view_balance','view_movements','record_outflow','confirm_outflow')
 AND public.finance078_active() AND (public.finance078_admin()
  OR (public.finance078_partner() AND p_right IN ('view_balance','view_movements'))
  OR (public.finance078_operator() AND EXISTS(SELECT 1 FROM public.finance_treasury_account_authorities a
   WHERE a.user_id=auth.uid() AND a.bank_account_id IS NOT DISTINCT FROM p_bank AND a.cash_location_id IS NOT DISTINCT FROM p_cash
    AND (to_jsonb(a)->>p_right)::boolean IS TRUE)));
$$;
CREATE OR REPLACE FUNCTION public.treasury_can_view(p_bank uuid,p_cash uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.expense_account_allowed(p_bank,p_cash,'view_balance');
$$;

-- A canonical user UUID in frozen referral evidence is required; names are never matched.
CREATE FUNCTION public.finance078_distribution_allowed(p_payment uuid,p_direct uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT num_nonnulls(p_payment,p_direct)=1 AND (public.finance078_admin() OR (public.finance078_partner() AND EXISTS(
  SELECT 1 FROM public.finance_vp_revenue_distributions d JOIN public.finance_payable_entitlements e ON e.distribution_id=d.id
  WHERE d.payment_id IS NOT DISTINCT FROM p_payment AND d.direct_money_receipt_id IS NOT DISTINCT FROM p_direct
   AND d.status IN ('finalized','superseded') AND d.finalized_at IS NOT NULL AND e.bucket='referral' AND e.recipient_type='user' AND e.recipient_id=auth.uid())));
$$;
CREATE FUNCTION public.finance078_distribution_id_allowed(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.finance_vp_revenue_distributions d WHERE d.id=p_id
  AND public.finance078_distribution_allowed(d.payment_id,d.direct_money_receipt_id));
$$;

-- Prevent assignment escalation through direct PostgREST writes, including INSERT.
CREATE FUNCTION public.finance078_profile_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF (TG_OP='INSERT' AND NEW.finance_operator) OR (TG_OP='UPDATE' AND NEW.finance_operator IS DISTINCT FROM OLD.finance_operator) THEN
  IF NOT public.finance078_admin() THEN RAISE EXCEPTION 'FINANCE_ADMIN_REQUIRED'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER finance078_profile_guard BEFORE INSERT OR UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.finance078_profile_guard();

-- Helpers used by public RPCs below. No financial transaction is created by migration.
CREATE FUNCTION public.finance078_require_payout(p_id uuid,p_right text) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.finance_payouts%rowtype;
BEGIN
 SELECT * INTO p FROM public.finance_payouts WHERE id=p_id;
 IF p.id IS NULL OR NOT public.expense_account_allowed(p.bank_account_id,p.cash_location_id,p_right) THEN RAISE EXCEPTION 'EXPENSE_ACCOUNT_DENIED'; END IF;
 IF NOT public.finance078_admin() AND p.source_model='expense_v1' AND NOT EXISTS(
  SELECT 1 FROM public.finance_expenses e WHERE e.id=(p.choices_json#>>'{0,expense_id}')::uuid AND e.status='accepted' AND e.reviewed_by IS NOT NULL)
 THEN RAISE EXCEPTION 'FINANCE_APPROVED_SOURCE_REQUIRED'; END IF;
END;
$$;

CREATE FUNCTION public.finance078_expense_projection(p_id uuid,p_document jsonb) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN NOT public.expense_can_read(p_id) THEN NULL
 WHEN public.finance078_operations() THEN p_document
 ELSE (SELECT jsonb_object_agg(key,value) FROM jsonb_each(p_document)
  WHERE key=ANY(ARRAY['id','reference','origin','status','version','expense_date','description','category','vendor_name','gross_amount','currency',
  'personally_paid','reimbursement_requested','claimant_id','created_by','created_at','updated_at','reviewed_at','review_reason','request_id','request_active',
  'declared_gross_amount','note','vat_awareness','wht_awareness','reimbursement_requested','claimant_name','client_id','case_id','advisory_matter_id','creator_payment_fact','creator_tax']))
  ||jsonb_build_object('payment_status',(SELECT CASE WHEN EXISTS(SELECT 1 FROM public.finance_payout_allocations a JOIN public.finance_payouts p ON p.id=a.payout_id
    WHERE a.expense_id=p_id AND p.status='confirmed') THEN 'paid' WHEN e.status='accepted' THEN 'approved' ELSE e.status END FROM public.finance_expenses e WHERE e.id=p_id),
   'approved_amount',(SELECT s.amount FROM public.finance_expense_settlements s WHERE s.expense_id=p_id ORDER BY s.created_at DESC,s.id LIMIT 1),
   'audit','[]'::jsonb,
   'settlement',CASE WHEN p_document->'settlement'<>'null'::jsonb THEN jsonb_build_object('mode',p_document#>'{settlement,mode}','amount',p_document#>'{settlement,amount}') END,
   'obligation',CASE WHEN p_document->'obligation'<>'null'::jsonb THEN jsonb_build_object('gross_amount',p_document#>'{obligation,gross_amount}','currency',p_document#>'{obligation,currency}','due_on',p_document#>'{obligation,due_on}','settled',p_document#>'{obligation,settled}','waived',p_document#>'{obligation,waived}') END,
   'payout',CASE WHEN p_document->'payout'<>'null'::jsonb THEN (SELECT jsonb_object_agg(key,value) FROM jsonb_each(p_document->'payout') WHERE key=ANY(ARRAY['id','status','paid_on','gross','net','wht']))||jsonb_build_object('can_confirm',false,'can_cancel',false) END) END;
$$;

-- Explicit safe self/payment projection: no formula, allocation evidence or company analysis.
CREATE FUNCTION public.get_finance_compensation_access() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('can_read',public.finance078_self_service(),'can_execute',public.finance078_admin() OR public.finance078_operator(),'global',public.finance078_admin());
$$;
CREATE FUNCTION public.get_finance_participant_payments(p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.finance078_self_service() OR p_offset IS NULL OR p_offset<0 OR p_offset>100000 THEN RAISE EXCEPTION 'PAYOUT_PERMISSION_DENIED'; END IF;
 RETURN jsonb_build_object('access',public.get_finance_compensation_access(),'rows',(
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.finalized_at DESC,r.id),'[]') FROM (
  SELECT e.id,e.distribution_id,e.recipient_id,e.recipient_name,e.gross_amount,e.currency,e.finalized_at,
   CASE WHEN p.status='confirmed' THEN 'paid' ELSE e.status END status,p.id payout_id,p.paid_on,p.net_amount,p.wht_amount
  FROM public.finance_payable_entitlements e LEFT JOIN public.finance_payout_allocations a ON a.entitlement_id=e.id
  LEFT JOIN public.finance_payouts p ON p.id=a.payout_id
  WHERE e.status='open' AND (public.finance078_admin() OR public.finance078_operator() OR (e.recipient_type='user' AND e.recipient_id=auth.uid()))
  ORDER BY e.finalized_at DESC,e.id LIMIT 50 OFFSET p_offset) r));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_finance_distribution_payment_context(p_distribution_id uuid,p_entitlement_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.finance_payable_entitlements%rowtype;
BEGIN
 IF NOT (public.finance078_admin() OR public.finance078_operator()) THEN RAISE EXCEPTION 'PAYOUT_PERMISSION_DENIED'; END IF;
 SELECT * INTO e FROM public.finance_payable_entitlements WHERE id=p_entitlement_id AND distribution_id=p_distribution_id AND status='open';
 IF e.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.finance_vp_revenue_distributions WHERE id=p_distribution_id AND status='finalized')
  OR EXISTS(SELECT 1 FROM public.finance_payout_allocations WHERE entitlement_id=e.id) THEN RAISE EXCEPTION 'PAYOUT_RIGHTS_UNAVAILABLE'; END IF;
 PERFORM public.payable_assert_distribution(p_distribution_id);
 RETURN jsonb_build_object('component',jsonb_build_object('id',e.id,'distribution_id',e.distribution_id,'recipient_id',e.recipient_id,'recipient_name',e.recipient_name,
   'recipient_type',e.recipient_type,'gross_amount',e.gross_amount,'currency',e.currency,'status',e.status),
  'payee',(SELECT p FROM jsonb_array_elements(public.get_finance_payees()) p WHERE p->>'id'=e.recipient_id::text),
  'accounts',(SELECT coalesce(jsonb_agg(jsonb_build_object('account_id',a->'id','kind',a->'kind','name_th',a->'name','name_en',a->'name',
   'is_active',true,'can_confirm',a->'can_confirm','bank_account_id',a->'bank_account_id','cash_location_id',a->'cash_location_id','currency','THB','system_balance',a->'balance','opening_as_of',a->'opening_as_of')),'[]')
   FROM jsonb_array_elements(public.get_finance_expense_accounts()) a WHERE a->>'can_record'='true' AND a->>'can_confirm'='true'),
  'wht_treatment',null,'wht_rate',null);
END;
$$;

-- RLS ceilings constrain existing permissive policies; original policies survive.
CREATE POLICY finance078_distribution_scope ON public.finance_vp_revenue_distributions AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.finance078_distribution_allowed(payment_id,direct_money_receipt_id));
CREATE POLICY finance078_distribution_audit_scope ON public.finance_vp_revenue_distribution_audit AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.finance078_distribution_id_allowed(distribution_id));
CREATE POLICY finance078_entitlement_scope ON public.finance_payable_entitlements AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.finance078_admin());
CREATE POLICY finance078_entitlement_sources_scope ON public.finance_payable_entitlement_sources AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.finance078_admin());
CREATE POLICY finance078_entitlement_audit_scope ON public.finance_payable_entitlement_audit AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.finance078_admin());
CREATE POLICY finance078_cash_movements_scope ON public.finance_cash_transactions AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.expense_account_allowed(bank_account_id,cash_location_id,'view_movements'));
-- A movements-only custodian may read movements; balance views still filter by view_balance.
CREATE POLICY finance078_cash_movements_read ON public.finance_cash_transactions FOR SELECT TO authenticated
 USING(public.expense_account_allowed(bank_account_id,cash_location_id,'view_movements'));
CREATE POLICY finance078_cash_audit_scope ON public.finance_cash_transaction_audit_events AS RESTRICTIVE FOR SELECT TO authenticated USING(public.finance078_admin());
CREATE POLICY finance078_opening_audit_scope ON public.finance_account_opening_balance_audit_events AS RESTRICTIVE FOR SELECT TO authenticated USING(public.finance078_admin());

-- Legacy remains writable by its authorized Admins. This is an authority ceiling,
-- not B6 retirement. No Legacy business row, flag, policy or audit is rewritten.
CREATE POLICY finance078_legacy_compensation_read ON public.finance_compensation_allocations AS RESTRICTIVE FOR SELECT TO authenticated USING(public.finance078_admin());
CREATE POLICY finance078_legacy_compensation_batch_read ON public.finance_compensation_batches AS RESTRICTIVE FOR SELECT TO authenticated USING(public.finance078_admin());
CREATE POLICY finance078_legacy_ledger_read ON public.finance_company_ledger AS RESTRICTIVE FOR SELECT TO authenticated USING(public.finance078_admin() OR public.finance078_partner());

CREATE FUNCTION public.finance078_effective_lifecycle_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF coalesce(to_jsonb(NEW)->>'status',to_jsonb(NEW)->>'document_status') IS DISTINCT FROM coalesce(to_jsonb(OLD)->>'status',to_jsonb(OLD)->>'document_status')
  AND coalesce(to_jsonb(NEW)->>'status',to_jsonb(NEW)->>'document_status') IN ('cancelled','voided','reversed','superseded') AND coalesce(to_jsonb(OLD)->>'status',to_jsonb(OLD)->>'document_status')<>'draft'
  AND NOT public.finance078_admin() THEN RAISE EXCEPTION 'FINANCE_ADMIN_REQUIRED'; END IF;
 RETURN NEW;
END;
$$;

DO $ceilings$ DECLARE t text; op text; BEGIN
 FOR t IN SELECT unnest(ARRAY['finance_company_profiles','finance_authorized_signers','finance_quotation_service_patterns',
  'document_numbering_profiles','document_templates','document_template_versions','document_template_sections','document_template_clause_slots',
  'document_template_variable_bindings','document_template_alternative_groups','document_clause_libraries','document_clause_versions','document_clause_version_variable_bindings',
  'finance_bank_accounts','finance_bank_account_access','finance_company_ledger','finance_compensation_batches','finance_compensation_allocations']) LOOP
  FOREACH op IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
   EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated %s',
    'finance078_admin_'||lower(op),t,op,CASE op WHEN 'INSERT' THEN 'WITH CHECK(public.finance078_admin())'
     WHEN 'UPDATE' THEN 'USING(public.finance078_admin()) WITH CHECK(public.finance078_admin())' ELSE 'USING(public.finance078_admin())' END);
  END LOOP;
 END LOOP;
 FOR t IN SELECT unnest(ARRAY['finance_quotations','finance_fee_agreements','finance_billing_plans','finance_invoices','finance_receipts','finance_tax_invoices',
  'finance_combined_documents','finance_payments','finance_direct_money_receipts','finance_cash_transactions']) LOOP
  EXECUTE format('CREATE TRIGGER finance078_effective_lifecycle_guard BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.finance078_effective_lifecycle_guard()',t);
 END LOOP;
 -- Only this existing private document bucket; unrelated Storage policies untouched.
 CREATE POLICY finance078_document_assets_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'vp-document-assets' OR public.finance078_admin());
 CREATE POLICY finance078_document_assets_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'vp-document-assets' OR public.finance078_admin()) WITH CHECK(bucket_id<>'vp-document-assets' OR public.finance078_admin());
 CREATE POLICY finance078_document_assets_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'vp-document-assets' OR public.finance078_admin());
END; $ceilings$;

CREATE FUNCTION public.get_finance_own_legacy_compensation() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'recipient_name',a.recipient_name,'amount',a.amount,'payment_status',a.payment_status,'paid_at',a.paid_at) ORDER BY a.created_at DESC,a.id),'[]')
 FROM public.finance_compensation_allocations a JOIN public.finance_compensation_batches b ON b.id=a.batch_id
 WHERE public.finance078_self_service() AND a.recipient_user_id=auth.uid() AND NOT a.is_company_share AND b.status<>'voided';
$$;

CREATE FUNCTION public.finance078_account_projection(p_account jsonb) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN public.expense_account_allowed((p_account->>'bank_account_id')::uuid,(p_account->>'cash_location_id')::uuid,'view_balance') THEN
  CASE WHEN public.expense_account_allowed((p_account->>'bank_account_id')::uuid,(p_account->>'cash_location_id')::uuid,'view_movements') THEN p_account ELSE (p_account-ARRAY['inflow','outflow'])||jsonb_build_object('account_token',encode(sha256(convert_to(p_account::text,'UTF8')),'hex')) END
 ELSE (p_account-ARRAY['opening_amount','system_balance','inflow','outflow'])||jsonb_build_object('system_balance',null,'account_token',encode(sha256(convert_to(p_account::text,'UTF8')),'hex')) END;
$$;
CREATE FUNCTION public.finance078_remittance_projection(p_id uuid,p_document jsonb) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN public.finance078_admin() OR public.finance078_partner() THEN p_document
 ELSE (p_document-ARRAY['draft_snapshot_json','confirmed_snapshot_json','bank_account_id','cash_location_id'])||jsonb_build_object(
 'bank_account_id',CASE WHEN allowed THEN r.bank_account_id END,'cash_location_id',CASE WHEN allowed THEN r.cash_location_id END,
 'draft_snapshot_json',jsonb_build_object('account',CASE WHEN allowed THEN public.finance078_account_projection(r.draft_snapshot_json->'account') END,'amount_due',r.amount),
 'confirmed_snapshot_json',CASE WHEN r.status='confirmed' THEN jsonb_build_object('actual_cash_paid',r.amount,'account',CASE WHEN allowed THEN public.finance078_account_projection(r.confirmed_snapshot_json->'account') END) END)
 END FROM public.finance_tax_remittances r CROSS JOIN LATERAL(SELECT public.expense_account_allowed(r.bank_account_id,r.cash_location_id,'view_movements') OR public.expense_account_allowed(r.bank_account_id,r.cash_location_id,'record_outflow') allowed) rights WHERE r.id=p_id;
$$;

-- Private execution snapshot, independent of public balance-read rights. Keeps
-- the pre-078 account snapshot shape exactly for existing draft revalidation.
CREATE FUNCTION public.finance078_execution_account(p_bank uuid,p_cash uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.expense_account_allowed(p_bank,p_cash,'record_outflow') AND NOT public.expense_account_allowed(p_bank,p_cash,'confirm_outflow') THEN RAISE EXCEPTION 'EXPENSE_ACCOUNT_DENIED'; END IF;
 SELECT to_jsonb(a)||to_jsonb(b) INTO result FROM (
  SELECT 'bank'::text kind,id account_id,id bank_account_id,null::uuid cash_location_id,short_name name_th,short_name name_en,bank_name,account_number,is_active FROM public.finance_bank_accounts WHERE id=p_bank
  UNION ALL SELECT 'cash',id,null,id,name_th,name_en,null,null,is_active FROM public.finance_cash_locations WHERE id=p_cash
 ) a CROSS JOIN LATERAL public.expense_account_balance_private(a.bank_account_id,a.cash_location_id) b;
 RETURN result;
END;
$$;

-- Metadata-only account navigation includes movements-only custodians. It does
-- not broaden the balance view or reveal accounts granted for execution only.
CREATE OR REPLACE FUNCTION public.get_finance_statement_accounts() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.finance078_operations() THEN RAISE EXCEPTION 'TREASURY_PERMISSION_DENIED'; END IF;
 RETURN jsonb_build_object('can_transfer',public.finance078_admin(),'can_manage_openings',public.finance078_admin(),
 'accounts',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY kind,name_th COLLATE "C",account_id),'[]') FROM (
  SELECT 'bank'::text kind,id account_id,id bank_account_id,null::uuid cash_location_id,short_name name_th,short_name name_en,bank_name,account_number,is_active FROM public.finance_bank_accounts
  UNION ALL SELECT 'cash',id,null,id,name_th,name_en,null,null,is_active FROM public.finance_cash_locations
 ) a WHERE public.expense_account_allowed(a.bank_account_id,a.cash_location_id,'view_balance') OR public.expense_account_allowed(a.bank_account_id,a.cash_location_id,'view_movements')));
END;
$$;

CREATE FUNCTION pg_temp.finance078_patch(p_signature text,p_from text,p_to text,p_count integer) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE definition text; BEGIN
 SELECT pg_get_functiondef(to_regprocedure('public.'||p_signature)) INTO definition;
 IF definition IS NULL OR (length(definition)-length(replace(definition,p_from,'')))/length(p_from)<>p_count THEN RAISE EXCEPTION 'FINANCE078_PATCH_CONTRACT_MISMATCH: %',p_signature; END IF;
 EXECUTE replace(definition,p_from,p_to);
END; $patch$;
SELECT pg_temp.finance078_patch('current_user_can_manage_finance_quotations()','
 select exists(select 1 from public.user_profiles where id=auth.uid() and role in (''admin'',''partner'') and (role<>''admin'' or active is true));
','
 SELECT public.finance078_operations();
',1);
SELECT pg_temp.finance078_patch('current_user_can_manage_finance_payments()','
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (role = ''admin'' or can_manage_finance_payments)
  );
','
 SELECT public.finance078_operations();
',1);
SELECT pg_temp.finance078_patch('current_user_can_view_finance_payments()','
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (
        role in (''admin'', ''partner'')
        or can_manage_finance_payments
        or can_confirm_finance_payments
        or can_reverse_finance_payments
        or can_reallocate_finance_payments
      )
  );
','
 SELECT public.finance078_operations();
',1);
SELECT pg_temp.finance078_patch('current_user_can_manage_finance_receipts()','
  select exists (select 1 from public.user_profiles where id = auth.uid() and active
    and (role = ''admin'' or can_manage_finance_receipts));
','
 SELECT public.finance078_operations();
',1);
SELECT pg_temp.finance078_patch('current_user_can_view_finance_receipts()','
  select exists (select 1 from public.user_profiles where id = auth.uid() and active
    and (role = ''admin'' or can_view_finance_receipts or can_manage_finance_receipts
      or can_issue_finance_receipts or can_void_finance_receipts));
','
 SELECT public.finance078_operations();
',1);
SELECT pg_temp.finance078_patch('current_user_can_issue_finance_receipts()','
  select exists (select 1 from public.user_profiles where id = auth.uid() and active
    and (role = ''admin'' or can_issue_finance_receipts));
','
 SELECT public.finance078_operations();
',1);
SELECT pg_temp.finance078_patch('current_user_can_manage_finance_tax_invoices()','
  select exists(select 1 from public.user_profiles where id=auth.uid() and active and (role=''admin'' or can_manage_finance_tax_invoices));
','
 SELECT public.finance078_operations();
',1);
SELECT pg_temp.finance078_patch('current_user_can_view_finance_tax_invoices()','
  select exists(select 1 from public.user_profiles where id=auth.uid() and active and
    (role=''admin'' or can_view_finance_tax_invoices or can_manage_finance_tax_invoices or can_issue_finance_tax_invoices));
','
 SELECT public.finance078_operations();
',1);
SELECT pg_temp.finance078_patch('current_user_can_issue_finance_tax_invoices()','
  select exists(select 1 from public.user_profiles where id=auth.uid() and active and (role=''admin'' or can_issue_finance_tax_invoices));
','
 SELECT public.finance078_operations();
',1);
SELECT pg_temp.finance078_patch('current_user_can_manage_finance_billable_charges()','
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (role = ''admin'' or can_manage_finance_billable_charges)
  );
','
 SELECT public.finance078_operations();
',1);
SELECT pg_temp.finance078_patch('current_user_can_view_finance_billable_charges()','
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (
        role in (''admin'', ''partner'')
        or can_view_finance_billable_charges
        or can_manage_finance_billable_charges
        or can_approve_finance_billable_charges
      )
  );
','
 SELECT public.finance078_operations();
',1);
SELECT pg_temp.finance078_patch('current_user_can_approve_finance_billable_charges()','
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (role = ''admin'' or can_approve_finance_billable_charges)
  );
','
 SELECT public.finance078_operations();
',1);
SELECT pg_temp.finance078_patch('current_user_can_confirm_finance_payments()','
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (role = ''admin'' or can_confirm_finance_payments)
  );
','
 SELECT public.finance078_admin();
',1);
SELECT pg_temp.finance078_patch('current_user_can_reverse_finance_payments()','
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (role = ''admin'' or can_reverse_finance_payments)
  );
','
 SELECT public.finance078_admin();
',1);
SELECT pg_temp.finance078_patch('current_user_can_reallocate_finance_payments()','
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (role = ''admin'' or can_reallocate_finance_payments)
  );
','
 SELECT public.finance078_admin();
',1);
SELECT pg_temp.finance078_patch('current_user_can_manage_finance_cash_transactions()','
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (role = ''admin'' or can_manage_finance_cash_transactions)
  );
','
 SELECT public.finance078_admin();
',1);
SELECT pg_temp.finance078_patch('current_user_can_confirm_finance_cash_transactions()','
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (role = ''admin'' or can_confirm_finance_cash_transactions)
  );
','
 SELECT public.finance078_admin();
',1);
SELECT pg_temp.finance078_patch('current_user_can_reverse_finance_cash_transactions()','
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (role = ''admin'' or can_reverse_finance_cash_transactions)
  );
','
 SELECT public.finance078_admin();
',1);
SELECT pg_temp.finance078_patch('current_user_can_void_finance_receipts()','
  select exists (select 1 from public.user_profiles where id = auth.uid() and active
    and (role = ''admin'' or can_void_finance_receipts));
','
 SELECT public.finance078_admin();
',1);
SELECT pg_temp.finance078_patch('current_user_can_view_finance_cash_transactions()','
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (
        role in (''admin'', ''partner'')
        or can_view_finance_cash_transactions
        or can_manage_finance_cash_transactions
        or can_confirm_finance_cash_transactions
        or can_reverse_finance_cash_transactions
      )
  );
','
 SELECT public.finance078_operations();
',1);
SELECT pg_temp.finance078_patch('expense_can_manage()','
 select public.money_allocation_admin() or exists(select 1 from public.user_profiles u where u.id=auth.uid() and u.active
  and u.role not in (''partner'',''viewer'') and coalesce((to_jsonb(u)->>''can_approve_expense_claims'')::boolean,false));
','
 SELECT public.finance078_admin();
',1);
SELECT pg_temp.finance078_patch('expense_can_tax_review()','
 select public.expense_can_manage() and public.tax_position_can_manage();
','
 SELECT public.finance078_admin();
',1);
SELECT pg_temp.finance078_patch('expense_can_view_all()','
 select public.expense_can_manage() or exists(select 1 from public.user_profiles u where u.id=auth.uid() and u.active
  and (u.role=''partner'' or coalesce((to_jsonb(u)->>''can_view_all_expense_claims'')::boolean,false)));
','
 SELECT public.finance078_operations();
',1);
SELECT pg_temp.finance078_patch('expense_can_claim()','
 select public.money_allocation_admin() or exists(select 1 from public.user_profiles u where u.id=auth.uid() and u.active
  and u.role not in (''partner'',''viewer'') and coalesce((to_jsonb(u)->>''can_submit_expense_claim'')::boolean,false));
','
 SELECT public.finance078_self_service();
',1);
SELECT pg_temp.finance078_patch('payout_can_manage()','
 select public.money_allocation_admin() or exists(select 1 from public.user_profiles where id=auth.uid() and active
  and role not in (''partner'',''viewer'') and can_manage_finance_payments and can_confirm_finance_cash_transactions);
','
 SELECT public.finance078_admin() OR public.finance078_operator();
',1);
SELECT pg_temp.finance078_patch('tax_position_can_view()','
 select exists(select 1 from public.user_profiles where id=auth.uid() and active and
   (role in (''admin'',''partner'') or can_view_finance_tax_invoices or can_manage_finance_tax_invoices or can_issue_finance_tax_invoices));
','
 SELECT public.finance078_operations();
',1);
SELECT pg_temp.finance078_patch('tax_position_can_manage()','
 select public.current_user_can_manage_finance_tax_invoices();
','
 SELECT public.finance078_admin() OR public.finance078_operator();
',1);
SELECT pg_temp.finance078_patch('tax_filing_can_manage()','
 select public.tax_position_can_manage() and exists(select 1 from public.user_profiles where id=auth.uid() and active and role not in (''partner'',''viewer''));
','
 SELECT public.finance078_admin() OR public.finance078_operator();
',1);
SELECT pg_temp.finance078_patch('tax_filing_can_remit()','
 select public.tax_filing_can_manage() and public.current_user_can_confirm_finance_cash_transactions();
','
 SELECT public.finance078_admin() OR public.finance078_operator();
',1);
SELECT pg_temp.finance078_patch('statement_transfer_allowed(uuid,uuid,uuid,uuid)','
 select public.current_user_can_manage_finance_cash_transactions() and public.current_user_can_confirm_finance_cash_transactions()
  and public.treasury_can_view(p_from_bank,p_from_cash) and public.treasury_can_view(p_to_bank,p_to_cash);
','
 SELECT public.finance078_admin();
',1);
SELECT pg_temp.finance078_patch('money_allocation_admin()','
 select exists(select 1 from public.user_profiles where id=auth.uid() and active=true and role=''admin'');
','
 SELECT public.finance078_admin();
',1);
SELECT pg_temp.finance078_patch('current_user_can_view_finance_cash_bank_account(uuid)','
  select exists (
    select 1
    from public.user_profiles as profile
    where profile.id = auth.uid()
      and profile.active = true
      and (
        profile.role in (''admin'', ''partner'')
        or (
          (
            profile.can_view_finance_cash_transactions
            or profile.can_manage_finance_cash_transactions
            or profile.can_confirm_finance_cash_transactions
            or profile.can_reverse_finance_cash_transactions
          )
          and exists (
            select 1
            from public.finance_bank_account_access as access
            where access.user_profile_id = profile.id
              and access.bank_account_id = p_bank_account_id
              and access.can_view = true
          )
        )
      )
  );
','
 SELECT public.expense_account_allowed(p_bank_account_id,null,''view_balance'');
',1);
SELECT pg_temp.finance078_patch('void_finance_invoice(uuid,text,boolean)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('record_finance_paid_expense(uuid,jsonb,uuid,uuid,date,boolean)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('bridge_finance_legacy_expense(text,uuid,text,boolean)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('delete_finance_authorized_signer(uuid)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('set_finance_authorized_signer_active(uuid,boolean)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('set_finance_authorized_signer_default(uuid,uuid,text,text)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('save_finance_quotation_service_pattern(uuid,text,text,text,text,text,text,text,integer)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('set_finance_quotation_service_pattern_active(uuid,boolean)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('approve_retired_template_use_for_fee_agreement(uuid,text)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('set_finance_quotation_status(uuid,text,text,uuid,text,text)','
begin
','
begin
 IF p_next_status=''cancelled'' AND NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('set_finance_quotation_status_v2(uuid,text,text,uuid,text,text)','
begin
','
begin
 IF p_next_status=''cancelled'' AND NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('set_finance_fee_agreement_status(uuid,text)','
begin
','
begin
 IF p_next_status=''cancelled'' AND NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('set_finance_billing_plan_status(uuid,text)','
begin
','
begin
 IF p_next_status=''cancelled'' AND NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('cancel_finance_accepted_quotation_engagement(uuid,text)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('create_finance_tax_correction_draft(uuid,uuid,uuid,text,text,text,text,date,date,jsonb)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('approve_finance_tax_correction(uuid,jsonb,boolean,text,boolean)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('issue_finance_tax_correction(uuid,jsonb,boolean,boolean)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('clone_document_template_version(uuid)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('replace_document_template_draft_structure(uuid,jsonb)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('save_document_template_alternative_group_draft(uuid,uuid,text,text,integer,integer,boolean,uuid,jsonb,text,integer,jsonb)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('save_document_template_clause_slot_draft(uuid,uuid,text,uuid,integer,uuid,text,text,text,integer,text,uuid,jsonb,boolean,boolean,boolean,boolean,text,jsonb)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('save_document_template_family_draft(uuid,text,text,text,text,jsonb)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('save_document_template_section_draft(uuid,uuid,text,text,integer,uuid,text,text,text,integer,text,jsonb,boolean,boolean,text,jsonb)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('save_document_template_variable_binding_draft(uuid,uuid,uuid,boolean,jsonb,text,jsonb)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('save_document_template_version_draft(uuid,uuid,text,jsonb,date,date)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('set_document_template_version_status(uuid,text,text,text)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('prepare_finance_expense_payout(uuid,uuid,integer,date,uuid,uuid,boolean,text)','if not public.expense_can_manage() and (e.created_by<>auth.uid() or e.origin<>''company_purchase''
  or exists(select 1 from public.finance_expense_obligations where expense_id=e.id) or p_actual_wht is distinct from false)
 then raise exception ''EXPENSE_FINANCE_PREPARATION_REQUIRED''; end if;','if not public.finance078_admin() and (e.status<>''accepted'' or e.reviewed_by is null) then raise exception ''FINANCE_APPROVED_SOURCE_REQUIRED''; end if;',1);
SELECT pg_temp.finance078_patch('confirm_finance_expense_payout(uuid,integer,integer,uuid,boolean)','
begin
','
begin
 PERFORM public.finance078_require_payout(p_id,''confirm_outflow'');
',1);
SELECT pg_temp.finance078_patch('save_finance_payout_before_expense(uuid,uuid,date,uuid,uuid,jsonb,text,integer)','
begin
','
begin
 IF NOT public.expense_account_allowed(p_bank_account_id,p_cash_location_id,''record_outflow'') THEN RAISE EXCEPTION ''EXPENSE_ACCOUNT_DENIED''; END IF;
',1);
SELECT pg_temp.finance078_patch('payout_confirm_distribution_outflow(uuid,integer,integer,uuid,boolean,boolean)','
begin
','
begin
 PERFORM public.finance078_require_payout(p_id,''confirm_outflow'');
',1);
SELECT pg_temp.finance078_patch('cancel_finance_payout(uuid,integer,boolean)','
begin
','
begin
 PERFORM public.finance078_require_payout(p_id,''record_outflow'');
',1);
SELECT pg_temp.finance078_patch('pay_finance_distribution_participant(uuid,uuid,uuid,integer,date,uuid,uuid,text,numeric,text,boolean)','if not public.money_allocation_admin()','if not (public.finance078_admin() or public.finance078_operator())',1);
SELECT pg_temp.finance078_patch('pay_finance_distribution_participant(uuid,uuid,uuid,integer,date,uuid,uuid,text,numeric,text,boolean)','
begin
','
begin
 IF NOT public.expense_account_allowed(p_bank_account_id,p_cash_location_id,''record_outflow'') OR NOT public.expense_account_allowed(p_bank_account_id,p_cash_location_id,''confirm_outflow'') THEN RAISE EXCEPTION ''EXPENSE_ACCOUNT_DENIED''; END IF;
',1);
SELECT pg_temp.finance078_patch('tax_filing_account(uuid,uuid)','public.treasury_can_view(p_bank,p_cash)','public.expense_account_allowed(p_bank,p_cash,''record_outflow'')',1);
SELECT pg_temp.finance078_patch('transition_finance_tax_remittance(uuid,integer,text,boolean)','select * into strict r from public.finance_tax_remittances where id=p_id for update;','select * into strict r from public.finance_tax_remittances where id=p_id for update;
 if not public.expense_account_allowed(r.bank_account_id,r.cash_location_id,case when p_action=''confirmed'' then ''confirm_outflow'' else ''record_outflow'' end) then raise exception ''EXPENSE_ACCOUNT_DENIED''; end if;',1);
SELECT pg_temp.finance078_patch('save_finance_payout_before_expense(uuid,uuid,date,uuid,uuid,jsonb,text,integer)','public.treasury_can_view(p_bank_account_id,p_cash_location_id)','public.expense_account_allowed(p_bank_account_id,p_cash_location_id,''record_outflow'')',1);
SELECT pg_temp.finance078_patch('payout_confirm_distribution_outflow(uuid,integer,integer,uuid,boolean,boolean)','public.treasury_can_view(p.bank_account_id,p.cash_location_id)','public.expense_account_allowed(p.bank_account_id,p.cash_location_id,''confirm_outflow'')',1);
SELECT pg_temp.finance078_patch('payout_confirm_distribution_outflow(uuid,integer,integer,uuid,boolean,boolean)','select to_jsonb(a) into account from public.finance_treasury_balances a where a.bank_account_id is not distinct from p.bank_account_id and a.cash_location_id is not distinct from p.cash_location_id;','account:=public.finance078_execution_account(p.bank_account_id,p.cash_location_id);',1);
SELECT pg_temp.finance078_patch('tax_filing_account(uuid,uuid)','select to_jsonb(a) into account from public.finance_treasury_balances a where bank_account_id is not distinct from p_bank and cash_location_id is not distinct from p_cash;','account:=public.finance078_execution_account(p_bank,p_cash);',1);
SELECT pg_temp.finance078_patch('transition_finance_direct_money_receipt(uuid,integer,text,boolean,text)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('save_finance_direct_money_receipt(uuid,integer,jsonb)','public.money_allocation_admin()','public.finance078_operations()',1);
SELECT pg_temp.finance078_patch('people_admin_save_profile(uuid,jsonb,jsonb,uuid)','''role'',''active'',''account_type'',''assignable'',''financial_access''','''role'',''active'',''account_type'',''assignable'',''finance_operator'',''financial_access''',1);
SELECT pg_temp.finance078_patch('people_admin_save_profile(uuid,jsonb,jsonb,uuid)','(''active'',''assignable'',''financial_access'')','(''active'',''assignable'',''finance_operator'',''financial_access'')',1);
SELECT pg_temp.finance078_patch('expense_document(uuid)','select public.expense_document_before_purchase_flow(p_id)||jsonb_build_object(''creator_tax'',public.company_purchase_request_declaration(p_id),''reviewed_recipient_name'',public.company_purchase_request_recipient(p_id));','select public.finance078_expense_projection(p_id,public.expense_document_before_purchase_flow(p_id)||jsonb_build_object(''creator_tax'',public.company_purchase_request_declaration(p_id),''reviewed_recipient_name'',public.company_purchase_request_recipient(p_id)));',1);
SELECT pg_temp.finance078_patch('get_finance_expense_economics(uuid)','
begin
','
begin
 IF NOT public.finance078_operations() THEN RAISE EXCEPTION ''EXPENSE_PERMISSION_DENIED''; END IF;
',1);
SELECT pg_temp.finance078_patch('get_finance_expense_access()','''company_purchase_request_supported'',true','''can_create_company'',public.finance078_operations(),''company_purchase_request_supported'',true',1);
SELECT pg_temp.finance078_patch('get_finance_revenue_distribution_detail(text,uuid)','''summary'',public.vp_distribution_workspace_row','''can_pay'',public.finance078_admin(),''summary'',public.vp_distribution_workspace_row',1);
SELECT pg_temp.finance078_patch('get_finance_treasury_month_flow(date)','public.treasury_can_view(r.bank_account_id,r.cash_location_id)','public.expense_account_allowed(r.bank_account_id,r.cash_location_id,''view_movements'')',1);
SELECT pg_temp.finance078_patch('get_finance_tax_filings(date)','to_jsonb(r)','public.finance078_remittance_projection(r.id,to_jsonb(r))',2);
SELECT pg_temp.finance078_patch('get_finance_tax_filings(date)','''audit'',(select jsonb_agg(to_jsonb(a) order by a.version) from public.finance_tax_remittance_audit a where a.remittance_id=r.id)','''audit'',case when public.finance078_admin() then (select jsonb_agg(to_jsonb(a) order by a.version) from public.finance_tax_remittance_audit a where a.remittance_id=r.id) else ''[]''::jsonb end',1);
SELECT pg_temp.finance078_patch('create_finance_tax_remittance(uuid,uuid,uuid,uuid,date,text,text,jsonb)','r.draft_snapshot_json->''account'' is distinct from p_expected_account','public.finance078_account_projection(r.draft_snapshot_json->''account'') is distinct from p_expected_account',1);
SELECT pg_temp.finance078_patch('create_finance_tax_remittance(uuid,uuid,uuid,uuid,date,text,text,jsonb)','account is distinct from p_expected_account','public.finance078_account_projection(account) is distinct from p_expected_account',1);
SELECT pg_temp.finance078_patch('get_finance_tax_filings(date)','select coalesce(jsonb_agg(to_jsonb(a) order by a.kind,a.name_en),''[]'') into accounts from public.finance_treasury_balances a
 where public.treasury_can_view(a.bank_account_id,a.cash_location_id);','select coalesce(jsonb_agg(public.finance078_account_projection(public.finance078_execution_account((a->>''bank_account_id'')::uuid,(a->>''cash_location_id'')::uuid)) order by a->>''kind'',a->>''name''),''[]'') into accounts from jsonb_array_elements(public.get_finance_expense_accounts()) a where a->>''can_record''=''true'';',1);
SELECT pg_temp.finance078_patch('get_finance_revenue_distribution_workspace(date,text,text,text,integer)','public.current_user_can_view_finance_payments()','(public.finance078_admin() OR public.finance078_partner())',1);
SELECT pg_temp.finance078_patch('get_finance_revenue_distribution_workspace(date,text,text,text,integer)','where (p_source_type=''all'' or kind=p_source_type)','where public.finance078_distribution_allowed(case when kind=''payment'' then id end,case when kind=''direct_money_receipt'' then id end) and (p_source_type=''all'' or kind=p_source_type)',1);
SELECT pg_temp.finance078_patch('get_finance_revenue_distribution_detail(text,uuid)','
begin
','
begin
 IF NOT public.finance078_distribution_allowed(case when p_source_type=''payment'' then p_source_id end,case when p_source_type=''direct_money_receipt'' then p_source_id end) THEN RAISE EXCEPTION ''VP_DISTRIBUTION_PERMISSION_DENIED''; END IF;
',1);
SELECT pg_temp.finance078_patch('get_finance_vp_received_distribution(uuid,uuid)','public.current_user_can_view_finance_payments()','public.finance078_distribution_allowed(p_payment_id,p_direct_id)',1);
SELECT pg_temp.finance078_patch('get_finance_vp_received_distribution(uuid,uuid)','''can_manage'',public.money_allocation_admin()','''can_manage'',public.finance078_distribution_allowed(p_payment_id,p_direct_id)',1);
SELECT pg_temp.finance078_patch('save_finance_vp_received_distribution(uuid,uuid,uuid,integer,jsonb,jsonb,text)','public.money_allocation_admin()','public.finance078_distribution_allowed(p_payment_id,p_direct_id)',1);
SELECT pg_temp.finance078_patch('confirm_finance_vp_received_distribution(uuid,uuid,uuid,integer,jsonb,jsonb,text,boolean)','public.money_allocation_admin()','public.finance078_distribution_allowed(p_payment_id,p_direct_id)',1);
SELECT pg_temp.finance078_patch('transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)','if not public.money_allocation_admin() then','if not public.finance078_distribution_id_allowed(p_id) or (p_action=''supersede'' and not public.finance078_admin()) then',1);
SELECT pg_temp.finance078_patch('get_finance_vp_formula_context(uuid)','if public.money_allocation_admin() then','if (context->>''can_manage'')::boolean then',1);
SELECT pg_temp.finance078_patch('get_finance_vp_formula_context(uuid)','''formula_catalog'',public.vp_compensation_formula_catalog()','''formula_catalog'',case when (context->>''can_manage'')::boolean then public.vp_compensation_formula_catalog() else ''[]''::jsonb end',1);
SELECT pg_temp.finance078_patch('get_finance_direct_vp_formula_context(uuid)','if public.money_allocation_admin() then','if (context->>''can_manage'')::boolean then',1);
SELECT pg_temp.finance078_patch('get_finance_direct_vp_formula_context(uuid)','''formula_catalog'',public.vp_compensation_formula_catalog()','''formula_catalog'',case when (context->>''can_manage'')::boolean then public.vp_compensation_formula_catalog() else ''[]''::jsonb end',1);
SELECT pg_temp.finance078_patch('get_finance_unpaid_participants_summary()','
begin
','
begin
 IF NOT (public.finance078_admin() OR public.finance078_partner()) THEN RAISE EXCEPTION ''FINANCE_BUSINESS_READ_DENIED''; END IF;
',1);
SELECT pg_temp.finance078_patch('get_finance_company_statement(date,text,text,integer)','
begin
','
begin
 IF NOT (public.finance078_admin() OR public.finance078_partner()) THEN RAISE EXCEPTION ''FINANCE_BUSINESS_READ_DENIED''; END IF;
',1);
SELECT pg_temp.finance078_patch('get_finance_unified_company_statement(date,date,text,text,integer)','
begin
','
begin
 IF NOT (public.finance078_admin() OR public.finance078_partner()) THEN RAISE EXCEPTION ''FINANCE_BUSINESS_READ_DENIED''; END IF;
',1);
SELECT pg_temp.finance078_patch('get_finance_payable_entitlements(text,text,text,text,integer)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('get_finance_payout_workspace(uuid,uuid)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('get_finance_payout_workspace_before_expense(uuid,uuid)','
begin
','
begin
 IF NOT public.finance078_admin() THEN RAISE EXCEPTION ''FINANCE_ADMIN_REQUIRED''; END IF;
',1);
SELECT pg_temp.finance078_patch('expense_account_balance(uuid,uuid)','return query select * from public.expense_account_balance_private(p_bank,p_cash);','return query select b.currency,b.opening_id,b.opening_as_of,b.opening_amount,b.system_balance,case when public.expense_account_allowed(p_bank,p_cash,''view_movements'') then b.inflow end,case when public.expense_account_allowed(p_bank,p_cash,''view_movements'') then b.outflow end from public.expense_account_balance_private(p_bank,p_cash) b;',1);
SELECT pg_temp.finance078_patch('get_finance_treasury(integer)','public.treasury_can_view(c.bank_account_id,c.cash_location_id)','public.expense_account_allowed(c.bank_account_id,c.cash_location_id,''view_movements'')',2);
SELECT pg_temp.finance078_patch('get_finance_cash_flow_summary(date,date)','public.treasury_can_view(c.bank_account_id,c.cash_location_id)','public.expense_account_allowed(c.bank_account_id,c.cash_location_id,''view_movements'')',1);
SELECT pg_temp.finance078_patch('get_finance_account_statement(uuid,uuid,date,date,text,text,integer)','public.treasury_can_view(p_bank,p_cash)','public.expense_account_allowed(p_bank,p_cash,''view_movements'')',1);
SELECT pg_temp.finance078_patch('get_finance_account_statement(uuid,uuid,date,date,text,text,integer)','return result;','if not public.expense_account_allowed(p_bank,p_cash,''view_balance'') then
 result:=result||jsonb_build_object(''opening'',null,''closing'',null,''opening_start'',null,''balance_covered'',false,''rows'',(select coalesce(jsonb_agg(v-''balance'' order by ord),''[]'') from jsonb_array_elements(result->''rows'') with ordinality x(v,ord))); end if;
 return result;',1);
-- New helpers are private unless required by an explicit RPC/RLS contract.
DO $security$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature,p.proname FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('finance078_account_projection','finance078_active','finance078_admin','finance078_distribution_allowed','finance078_distribution_id_allowed','finance078_effective_lifecycle_guard','finance078_execution_account','finance078_expense_projection','finance078_operations','finance078_operator','finance078_partner','finance078_profile_guard','finance078_remittance_projection','finance078_require_payout','finance078_self_service','get_finance_compensation_access','get_finance_own_legacy_compensation','get_finance_participant_payments') LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f.signature);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public,anon,authenticated,service_role',f.signature);
  IF f.proname IN ('finance078_active','finance078_admin','finance078_distribution_allowed','finance078_distribution_id_allowed','finance078_operations','finance078_operator','finance078_partner','finance078_self_service','get_finance_compensation_access','get_finance_own_legacy_compensation','get_finance_participant_payments') THEN
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
  END IF;
 END LOOP;
END; $security$;
GRANT EXECUTE ON FUNCTION public.expense_account_allowed(uuid,uuid,text) TO authenticated;
-- END 078 AUTHORITY CONTRACT
DO $preservation$ DECLARE b jsonb; a jsonb; BEGIN
 SELECT state INTO b FROM finance078_before;
 select jsonb_build_object('rows',(select coalesce(jsonb_object_agg(name,jsonb_build_object('count',(xpath('/row/n/text()',x))[1]::text::bigint,'sha256',(xpath('/row/h/text()',x))[1]::text)),'{}') from (
 select c.relname name,query_to_xml(format('select count(*) n,encode(sha256(convert_to(coalesce(string_agg((%s)::text,E''\n'' order by (%s)::text COLLATE "C"),''''),''UTF8'')),''hex'') h from public.%I t',
 case when c.relname='user_profiles' then 'to_jsonb(t)-''finance_operator''' else 'to_jsonb(t)' end,
 case when c.relname='user_profiles' then 'to_jsonb(t)-''finance_operator''' else 'to_jsonb(t)' end,c.relname),true,true,'') x
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') and (c.relname like 'finance\_%' escape '\' or c.relname in ('user_profiles','case_audit_logs','document_numbering_profiles'))) captured),'preserved',(select jsonb_build_object('functions',(select coalesce(jsonb_object_agg(v->>'signature',encode(sha256(convert_to((v)::text,'UTF8')),'hex')),'{}') from (select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'security_definer',p.prosecdef,'config',p.proconfig,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text COLLATE "C"),'[]') value
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname not in ('approve_finance_tax_correction','approve_retired_template_use_for_fee_agreement','bridge_finance_legacy_expense','cancel_finance_accepted_quotation_engagement','cancel_finance_payout','clone_document_template_version','confirm_finance_expense_payout','confirm_finance_vp_received_distribution','create_finance_tax_correction_draft','create_finance_tax_remittance','current_user_can_approve_finance_billable_charges','current_user_can_confirm_finance_cash_transactions','current_user_can_confirm_finance_payments','current_user_can_issue_finance_receipts','current_user_can_issue_finance_tax_invoices','current_user_can_manage_finance_billable_charges','current_user_can_manage_finance_cash_transactions','current_user_can_manage_finance_payments','current_user_can_manage_finance_quotations','current_user_can_manage_finance_receipts','current_user_can_manage_finance_tax_invoices','current_user_can_reallocate_finance_payments','current_user_can_reverse_finance_cash_transactions','current_user_can_reverse_finance_payments','current_user_can_view_finance_billable_charges','current_user_can_view_finance_cash_bank_account','current_user_can_view_finance_cash_transactions','current_user_can_view_finance_payments','current_user_can_view_finance_receipts','current_user_can_view_finance_tax_invoices','current_user_can_void_finance_receipts','delete_finance_authorized_signer','expense_account_allowed','expense_account_balance','expense_can_claim','expense_can_manage','expense_can_tax_review','expense_can_view_all','expense_document','get_finance_account_statement','get_finance_cash_flow_summary','get_finance_company_statement','get_finance_direct_vp_formula_context','get_finance_distribution_payment_context','get_finance_expense_access','get_finance_expense_economics','get_finance_payable_entitlements','get_finance_payout_workspace','get_finance_payout_workspace_before_expense','get_finance_revenue_distribution_detail','get_finance_revenue_distribution_workspace','get_finance_statement_accounts','get_finance_tax_filings','get_finance_treasury','get_finance_treasury_month_flow','get_finance_unified_company_statement','get_finance_unpaid_participants_summary','get_finance_vp_formula_context','get_finance_vp_received_distribution','issue_finance_tax_correction','money_allocation_admin','pay_finance_distribution_participant','payout_can_manage','payout_confirm_distribution_outflow','people_admin_save_profile','prepare_finance_expense_payout','record_finance_paid_expense','replace_document_template_draft_structure','save_document_template_alternative_group_draft','save_document_template_clause_slot_draft','save_document_template_family_draft','save_document_template_section_draft','save_document_template_variable_binding_draft','save_document_template_version_draft','save_finance_direct_money_receipt','save_finance_payout_before_expense','save_finance_quotation_service_pattern','save_finance_vp_received_distribution','set_document_template_version_status','set_finance_authorized_signer_active','set_finance_authorized_signer_default','set_finance_billing_plan_status','set_finance_fee_agreement_status','set_finance_quotation_service_pattern_active','set_finance_quotation_status','set_finance_quotation_status_v2','statement_transfer_allowed','tax_filing_account','tax_filing_can_manage','tax_filing_can_remit','tax_position_can_manage','tax_position_can_view','transition_finance_direct_money_receipt','transition_finance_tax_remittance','transition_finance_vp_distribution','treasury_can_view','void_finance_invoice','finance078_account_projection','finance078_active','finance078_admin','finance078_distribution_allowed','finance078_distribution_id_allowed','finance078_effective_lifecycle_guard','finance078_execution_account','finance078_expense_projection','finance078_operations','finance078_operator','finance078_partner','finance078_profile_guard','finance078_remittance_projection','finance078_require_payout','finance078_self_service','get_finance_compensation_access','get_finance_own_legacy_compensation','get_finance_participant_payments')) f,jsonb_array_elements(f.value) x(v)),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by schemaname COLLATE "C",tablename COLLATE "C",policyname COLLATE "C"),'[]') from pg_policies p where schemaname in ('public','storage') and policyname not like 'finance078\_%' escape '\'),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(t.oid)) order by tgrelid::regclass::text COLLATE "C",tgname COLLATE "C"),'[]') from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace in ('public'::regnamespace,'storage'::regnamespace) and not t.tgisinternal and t.tgname not like 'finance078\_%' escape '\'),
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'acl',a.attacl::text) order by c.relname COLLATE "C",a.attnum),'[]') from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v') and a.attnum>0 and not a.attisdropped and not(c.relname='user_profiles' and a.attname='finance_operator')),
 'relations',(select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,'options',c.reloptions) order by c.relname COLLATE "C"),'[]') from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v')),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid),'validated',c.convalidated) order by c.conrelid::regclass::text COLLATE "C",c.conname COLLATE "C"),'[]') from pg_constraint c where c.connamespace='public'::regnamespace and not(c.conrelid='public.user_profiles'::regclass and c.contype='n' and exists(select 1 from pg_attribute a where a.attrelid='public.user_profiles'::regclass and a.attname='finance_operator' and not a.attisdropped and c.conkey=ARRAY[a.attnum]::smallint[]))),
 'indexes',(select coalesce(jsonb_agg(to_jsonb(i) order by schemaname COLLATE "C",tablename COLLATE "C",indexname COLLATE "C"),'[]') from pg_indexes i where schemaname='public'),
 'views',(select coalesce(jsonb_object_agg(c.relname,pg_get_viewdef(c.oid,true)),'{}') from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v'))),'functions',(select coalesce(jsonb_object_agg(v->>'signature',encode(sha256(convert_to((v)::text,'UTF8')),'hex')),'{}') from (select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'security_definer',p.prosecdef,'config',p.proconfig,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text COLLATE "C"),'[]') value
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname in ('approve_finance_tax_correction','approve_retired_template_use_for_fee_agreement','bridge_finance_legacy_expense','cancel_finance_accepted_quotation_engagement','cancel_finance_payout','clone_document_template_version','confirm_finance_expense_payout','confirm_finance_payout_before_expense','confirm_finance_payout','create_finance_tax_correction_draft','create_finance_tax_filing_review','create_finance_tax_remittance','current_user_can_approve_finance_billable_charges','current_user_can_confirm_finance_cash_transactions','current_user_can_confirm_finance_payments','current_user_can_issue_finance_receipts','current_user_can_issue_finance_tax_invoices','current_user_can_manage_finance_billable_charges','current_user_can_manage_finance_cash_transactions','current_user_can_manage_finance_payments','current_user_can_manage_finance_quotations','current_user_can_manage_finance_receipts','current_user_can_manage_finance_tax_invoices','current_user_can_reallocate_finance_payments','current_user_can_reverse_finance_cash_transactions','current_user_can_reverse_finance_payments','current_user_can_view_finance_billable_charges','current_user_can_view_finance_cash_bank_account','current_user_can_view_finance_cash_transactions','current_user_can_view_finance_payments','current_user_can_view_finance_receipts','current_user_can_view_finance_tax_invoices','current_user_can_void_finance_receipts','decide_finance_expense_settlement','delete_finance_authorized_signer','expense_account_allowed','expense_account_balance_private','expense_account_balance','expense_can_claim','expense_can_manage','expense_can_read','expense_can_tax_review','expense_can_view_all','expense_document','expense_payout_choice','get_finance_direct_vp_formula_context','get_finance_expense_access','get_finance_expense_accounts','get_finance_expenses','get_finance_payable_entitlements','get_finance_payout_workspace_before_expense','get_finance_payout_workspace','get_finance_tax_filings','get_finance_treasury_month_flow','get_finance_treasury','get_finance_vp_formula_context','get_finance_vp_received_distribution','issue_finance_tax_correction','money_allocation_admin','payable_assert_distribution','payout_can_manage','prepare_finance_expense_payout','record_finance_paid_expense','replace_document_template_draft_structure','review_finance_expense_tax','review_finance_expense','save_document_template_alternative_group_draft','save_document_template_clause_slot_draft','save_document_template_family_draft','save_document_template_section_draft','save_document_template_variable_binding_draft','save_document_template_version_draft','save_finance_direct_money_receipt','save_finance_payout_before_expense','save_finance_payout','save_finance_quotation_service_pattern','save_finance_vp_received_distribution','set_document_template_version_status','set_finance_authorized_signer_active','set_finance_authorized_signer_default','set_finance_billing_plan_status','set_finance_fee_agreement_status','set_finance_quotation_service_pattern_active','set_finance_quotation_status_v2','set_finance_quotation_status','set_finance_treasury_authority','tax_filing_account','tax_filing_assert','tax_filing_can_manage','tax_filing_can_remit','tax_position_can_manage','tax_position_can_view','transition_finance_direct_money_receipt','transition_finance_tax_filing','transition_finance_tax_remittance','transition_finance_vp_distribution','treasury_can_view','treasury_location_active','void_finance_invoice','confirm_finance_treasury_transfer','confirm_finance_vp_received_distribution','get_finance_account_statement','get_finance_cash_flow_summary','get_finance_company_statement','get_finance_distribution_payment_context','get_finance_expense_economics','get_finance_general_payables_summary','get_finance_receivables_summary','get_finance_revenue_distribution_detail','get_finance_revenue_distribution_workspace','get_finance_statement_accounts','get_finance_unified_company_statement','get_finance_unpaid_participants_summary','pay_finance_distribution_participant','payout_confirm_distribution_outflow','statement_transfer_allowed','people_admin_save_profile','finance078_account_projection','finance078_active','finance078_admin','finance078_distribution_allowed','finance078_distribution_id_allowed','finance078_effective_lifecycle_guard','finance078_execution_account','finance078_expense_projection','finance078_operations','finance078_operator','finance078_partner','finance078_profile_guard','finance078_remittance_projection','finance078_require_payout','finance078_self_service','get_finance_compensation_access','get_finance_own_legacy_compensation','get_finance_participant_payments')) f,jsonb_array_elements(f.value) x(v)),'security',(select jsonb_object_agg(c.relname,encode(sha256(convert_to((jsonb_build_object('owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by p.policyname COLLATE "C"),'[]') from pg_policies p where p.schemaname='public' and p.tablename=c.relname)))::text,'UTF8')),'hex'))
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('finance_treasury_account_authorities','finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit','finance_payable_entitlements','finance_payable_entitlement_sources','finance_payable_entitlement_audit','finance_cash_transactions','finance_account_opening_balances','finance_cash_transaction_audit_events','finance_account_opening_balance_audit_events','finance_company_profiles','finance_authorized_signers','finance_quotation_service_patterns','document_numbering_profiles','document_templates','document_template_versions','document_template_sections','document_template_clause_slots','document_template_variable_bindings','document_template_alternative_groups','document_clause_libraries','document_clause_versions','document_clause_version_variable_bindings','finance_bank_accounts','finance_bank_account_access','finance_company_ledger','finance_compensation_batches','finance_compensation_allocations')),'authority',(select value->0 from (select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'generated',a.attgenerated,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum),'[]') from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid),'validated',convalidated) order by conname COLLATE "C"),'[]') from pg_constraint where conrelid=c.oid and contype<>'n'),
 'indexes',(select coalesce(jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) order by indexname COLLATE "C"),'[]') from pg_indexes where schemaname='public' and tablename=c.relname),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by policyname COLLATE "C"),'[]') from pg_policies p where schemaname='public' and tablename=c.relname),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) order by tgname COLLATE "C"),'[]') from pg_trigger where tgrelid=c.oid and not tgisinternal),
 'anon_select',has_table_privilege('anon',c.oid,'SELECT'),'authenticated_write',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'),
 'service_select',has_table_privilege('service_role',c.oid,'SELECT')) order by c.relname COLLATE "C"),'[]') value
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v') and c.relname='finance_treasury_account_authorities') catalog),'additions',(select jsonb_build_object(
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by schemaname COLLATE "C",tablename COLLATE "C",policyname COLLATE "C"),'[]') from pg_policies p where schemaname in ('public','storage') and left(policyname,11)='finance078_'),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(t.oid)) order by tgrelid::regclass::text COLLATE "C",tgname COLLATE "C"),'[]') from pg_trigger t where not tgisinternal and left(tgname,11)='finance078_')))) state INTO a;
 IF b->'rows' IS DISTINCT FROM a->'rows' OR b->'preserved' IS DISTINCT FROM a->'preserved' THEN RAISE EXCEPTION 'FINANCE078_PRESERVATION_FAILED: rows=%, contracts=%', b->'rows' IS NOT DISTINCT FROM a->'rows',(SELECT jsonb_agg(key ORDER BY key COLLATE "C") FROM jsonb_each(b->'preserved') x WHERE x.value IS DISTINCT FROM a#>ARRAY['preserved',x.key]); END IF;
 IF EXISTS(SELECT 1 FROM public.user_profiles WHERE finance_operator) THEN RAISE EXCEPTION 'FINANCE078_UNEXPECTED_ASSIGNMENT'; END IF;
END; $preservation$;
COMMIT;
