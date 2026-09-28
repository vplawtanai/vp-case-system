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
