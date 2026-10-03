-- 088. Additive Admin bulk expense/reimbursement orchestration only. HUMAN APPLY GATE.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
DO $locks$ DECLARE r record; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'FINANCE088_OWNER_REQUIRED'; END IF;
 FOR r IN SELECT c.oid::regclass rel FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p') AND (left(c.relname,8)='finance_' OR c.relname IN ('user_profiles','case_audit_logs','document_numbering_profiles')) ORDER BY c.oid LOOP EXECUTE format('LOCK TABLE %s IN SHARE MODE',r.rel); END LOOP;
END; $locks$;
CREATE TEMP TABLE finance088_before ON COMMIT DROP AS select jsonb_build_object('functions',(select coalesce(jsonb_object_agg(v->>'signature',encode(sha256(convert_to((v)::text,'UTF8')),'hex')),'{}') from (select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'security_definer',p.prosecdef,'config',p.proconfig,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text COLLATE "C"),'[]') value
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname in ('finance078_active','finance078_admin','finance078_require_payout','finance078_execution_account','expense_account_allowed','treasury_location_active','prepare_finance_expense_payout','confirm_finance_expense_payout','confirm_finance_payout','cancel_finance_payout','expense_payout_choice','payout_assert','payout_integrity','get_finance_expenses','get_finance_expense_obligations','get_finance_account_statement','company_purchase_request_recipient','company_purchase_request_declaration','finance_bangkok_completed_day_end','record_finance_cash_transaction_audit_event','expense_payout_model_guard','expense_integrity','validate_finance_cash_transaction_integrity','enforce_finance_cash_transaction_integrity','protect_finance_cash_audit_event')) f,jsonb_array_elements(f.value) x(v)),'tables',(select coalesce(jsonb_object_agg(v->>'name',encode(sha256(convert_to((v)::text,'UTF8')),'hex')),'{}') from (select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'acl',a.attacl::text,'generated',a.attgenerated,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum),'[]') from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid),'validated',convalidated) order by conname COLLATE "C"),'[]') from pg_constraint where conrelid=c.oid and contype<>'n'),
 'indexes',(select coalesce(jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) order by indexname COLLATE "C"),'[]') from pg_indexes where schemaname='public' and tablename=c.relname),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by policyname COLLATE "C"),'[]') from pg_policies p where schemaname='public' and tablename=c.relname),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) order by tgname COLLATE "C"),'[]') from pg_trigger where tgrelid=c.oid and not tgisinternal),
 'anon_select',has_table_privilege('anon',c.oid,'SELECT'),'authenticated_write',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'),
 'service_select',has_table_privilege('service_role',c.oid,'SELECT')) order by c.relname COLLATE "C"),'[]') value
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v') and c.relname in ('finance_expenses','finance_expense_settlements','finance_expense_obligations','finance_expense_tax_reviews','finance_expense_audit','finance_expense_obligation_waivers','finance_payouts','finance_payout_allocations','finance_payout_audit','finance_cash_transactions','finance_cash_transaction_audit_events','finance_outgoing_wht_obligations','finance_payees','finance_payee_destinations','finance_account_opening_balances','finance_treasury_account_authorities')) f,jsonb_array_elements(f.value) x(v)),'batch',(select coalesce(jsonb_object_agg(v->>'signature',encode(sha256(convert_to((v)::text,'UTF8')),'hex')),'{}') from (select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'security_definer',p.prosecdef,'config',p.proconfig,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text COLLATE "C"),'[]') value
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname in ('finance_expense_payout_batch')) f,jsonb_array_elements(f.value) x(v)),'rows',(select coalesce(jsonb_object_agg(name,jsonb_build_object('count',(xpath('/row/n/text()',x))[1]::text::bigint,'sha256',(xpath('/row/h/text()',x))[1]::text)),'{}') from (
 select c.relname name,query_to_xml(format('select count(*) n,encode(sha256(convert_to(coalesce(string_agg((%s)::text,E''\n'' order by (%s)::text COLLATE "C"),''''),''UTF8'')),''hex'') h from public.%I t',
 'to_jsonb(t)',
 'to_jsonb(t)',c.relname),true,true,'') x
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') and (c.relname like 'finance\_%' escape '\' or c.relname in ('user_profiles','case_audit_logs','document_numbering_profiles'))) captured),'preserved',(select jsonb_build_object('tables',(select value from (select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'acl',a.attacl::text,'generated',a.attgenerated,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum),'[]') from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid),'validated',convalidated) order by conname COLLATE "C"),'[]') from pg_constraint where conrelid=c.oid and contype<>'n'),
 'indexes',(select coalesce(jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) order by indexname COLLATE "C"),'[]') from pg_indexes where schemaname='public' and tablename=c.relname),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by policyname COLLATE "C"),'[]') from pg_policies p where schemaname='public' and tablename=c.relname),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) order by tgname COLLATE "C"),'[]') from pg_trigger where tgrelid=c.oid and not tgisinternal),
 'anon_select',has_table_privilege('anon',c.oid,'SELECT'),'authenticated_write',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'),
 'service_select',has_table_privilege('service_role',c.oid,'SELECT')) order by c.relname COLLATE "C"),'[]') value
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v')) t),'functions',(select value from (select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'security_definer',p.prosecdef,'config',p.proconfig,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text COLLATE "C"),'[]') value
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname<>'finance_expense_payout_batch') f),'defaults',(select coalesce(jsonb_agg(to_jsonb(d)-'oid' order by defaclrole,defaclnamespace,defaclobjtype),'[]') from pg_default_acl d),'views',(select coalesce(jsonb_object_agg(c.relname,pg_get_viewdef(c.oid,true)),'{}') from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v')))) state;
DO $guard$ DECLARE s jsonb; BEGIN
 SELECT state INTO s FROM finance088_before;
 IF s->'functions' IS DISTINCT FROM '{"cancel_finance_payout(uuid,integer,boolean)":"1cfe3ac02b846c2081310e67fae1918101237b4f4887ab2d3502754f2516cd70","company_purchase_request_declaration(uuid)":"52279e560e912ce5b4ced4bff6a6639403baa050a2ece9d6548f8a3378f700b8","company_purchase_request_recipient(uuid)":"56cc4992d2b221f85b4dba9aba52bc656e9944ed21a922937f721e078a1bfebf","confirm_finance_expense_payout(uuid,integer,integer,uuid,boolean)":"2774122067a7f8a25b88376a51f79bb5dbd214e6cc0c266209a958a959504f07","confirm_finance_payout(uuid,integer,integer,uuid,boolean)":"6feef0df974008d2bf241136399bfe1f33faf8236f676a2eb65982541893a8dd","enforce_finance_cash_transaction_integrity()":"43118d6a578127049a27a6c8e7d4aa3e7d3d22ec050de90d1a9be009c22b626e","expense_account_allowed(uuid,uuid,text)":"06a13aee3a8fc43ea1eeecdfc982f0ef9fec81e6d28000d0126d234ee377daf2","expense_integrity()":"4129c18337dbadea7e773f0cd31c13b4e2bfb08eaeb6c1bdfe91f2f106426e5e","expense_payout_choice(uuid,boolean)":"824f97735cdb2de19b23a7f6c10fe1e68109b9a8b872ea4106dc9663552ca118","expense_payout_model_guard()":"1cce3a7f3c3ddff7f7af6d6c9e152fbc1d775c745a304173c512bb1fd9a7d6ba","finance078_active()":"407aac4bc85656987f8b753274e644d0153898ededf69aec7bbd2cc22c967472","finance078_admin()":"b8e378c9afe8476d59a67fa626abeab1386c78101c94dd242a43ad81918eef8b","finance078_execution_account(uuid,uuid)":"2e12b4f4497748e9c2fed10df84094819c38b861f7746cdfb270e64e68c303d7","finance078_require_payout(uuid,text)":"fd94022f03ca61f6e11324aa361b19f963fae4f79e57dbfa2adff754aea83482","finance_bangkok_completed_day_end(date)":"b15561569e408875fcbacb331d621193d6c253500d3d51365151c3daaebf1b83","get_finance_account_statement(uuid,uuid,date,date,text,text,integer)":"1b636e34786028f336ae31682df492718174281ee7e650880e061e238d2cd468","get_finance_expense_obligations(integer)":"ba01495deb6bc9dd34763db5025b38e21ff6a8ca1c55063320a8ea4183a590a5","get_finance_expenses(uuid,boolean,integer)":"b6edaad770683f3c2cd8f860576086420477ae667d24be8d0653375039fe1446","payout_assert(uuid)":"cfe8c3094eb4061ca9f5b36b4c0eae3b35ecc111f947cbf07f4d33965fd4f3c9","payout_integrity()":"c3e998c2ab8c337869846b9c37e50768833ceaf92373abc69bf7878b62d68e32","prepare_finance_expense_payout(uuid,uuid,integer,date,uuid,uuid,boolean,text)":"025f58e4faeb384522a66868f7464d4238fc81168f3763a51acd43c2a96dcd08","protect_finance_cash_audit_event()":"354e2a156c638e082656682e734b08e159255d5ddb7d78be3315fc2c389c2d72","record_finance_cash_transaction_audit_event(uuid,text,jsonb)":"5b71722654f0aec8f29f2218f4bd21ddf8b408ae0d029c98bddf4b853ca7c939","treasury_location_active(uuid,uuid)":"197f319835bbdc4ced7367443852305541fb49bfdee62b6cf27d744d439a9b43","validate_finance_cash_transaction_integrity(uuid)":"7f1efdafd4ad1a94f4050a90e9646623c3e3c8bc67a4c4a4edcdee27d1421e03"}'::jsonb OR s->'tables' IS DISTINCT FROM '{"finance_account_opening_balances":"05a9bc63cd712438b0d99b37921b0efaf887f8bc9b839bc2150f7c72ba340169","finance_cash_transaction_audit_events":"7b69a3ba60802d3ca786f49300e8303b772a2b30cc9df217d63a1330d9f4d089","finance_cash_transactions":"e2d5121c9ac25c3f0376edb129ea9f8fda37bd76c264951d122f9d74022d9239","finance_expense_audit":"45a29cf2419d86fb16b78eee6e03d72444cb059dadf790899cb3b40427526b8c","finance_expense_obligation_waivers":"6b183eda4ff5624b47a8ecb3ddf47f04cee6d59dbbd6510b09186c325ca65f56","finance_expense_obligations":"98fdf10a58d228cd7d301c52cfc82773e6d98eac973a6b6ef85fd4063003241b","finance_expense_settlements":"37ba9648f89a716172d10421da7fa2a5c4d0f35aa5725f53a1e31d2cc044e111","finance_expense_tax_reviews":"d482a46eacee0b020dd6a27546ce1e516f57a3a75c68567f0ed8cff852feef06","finance_expenses":"917cbb0c57b46f9c7f50c197440432d18571234d88633e2811c24d8c03bf9b9a","finance_outgoing_wht_obligations":"cb4a49517f0968e79a5563acfd6bc9e007f97ff570ceb5ce27794dca609279a9","finance_payee_destinations":"d6097c55137bf56a9f205e7eb97033313acd3e7ea122d8c0eccd3ffe3d44ccfc","finance_payees":"9c2ead6e07c9bd0f144bf583536cda44bfbd64dc2207cd39ea183d2362d588fe","finance_payout_allocations":"35644dbf266236a473a70bbc28469941a7af4092868fdf93809993ec37f00df8","finance_payout_audit":"7df609d02f148630fab23a97200ce0ba257a3418220256b233b332ea29142eeb","finance_payouts":"8fec676ea427b55fa646ad8e8d8000001a59697b839703b4751c1440b71e4d0c","finance_treasury_account_authorities":"adf6d6175069b61012c72be98de01173bcb29b01de7904385a8880c43dd65029"}'::jsonb THEN RAISE EXCEPTION 'FINANCE088_CONTRACT_DRIFT'; END IF;
 IF s->'batch'<>'{}'::jsonb THEN RAISE EXCEPTION 'FINANCE088_ALREADY_PRESENT'; END IF;
END; $guard$;
-- New Admin-only orchestration. Individual expense payout functions remain unchanged.
CREATE FUNCTION public.finance_expense_payout_batch(p_action text, p_items jsonb, p_acknowledged boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
 item jsonb; obligation public.finance_expense_obligations%ROWTYPE;
 payout public.finance_payouts%ROWTYPE; expense public.finance_expenses%ROWTYPE;
 choice jsonb; result jsonb := '[]'::jsonb; replay boolean;
 confirmed_count integer := 0; target uuid; expected_version integer;
 failure text; detail text;
BEGIN
 IF NOT coalesce(public.finance078_admin(),false) THEN RAISE EXCEPTION 'FINANCE088_ADMIN_REQUIRED'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('prepare','confirm') OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'FINANCE088_INVALID_BATCH'; END IF;
 IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'FINANCE088_BATCH_SIZE'; END IF;
 IF p_action='confirm' AND p_acknowledged IS DISTINCT FROM true THEN RAISE EXCEPTION 'FINANCE088_ACK_REQUIRED'; END IF;
 -- Validate before locks/writes. UUID casts also reject malformed/blank identifiers.
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item->>'obligation_id' IS NULL OR item->>'payout_id' IS NULL
   OR (item->>'obligation_id')::uuid IS NULL OR (item->>'payout_id')::uuid IS NULL
   OR NOT (item ? 'payout_version') OR jsonb_typeof(item->'payout_version') NOT IN ('number','null')
  THEN RAISE EXCEPTION 'FINANCE088_INVALID_ITEM'; END IF;
  IF p_action='prepare' THEN
   IF NOT (item ?& ARRAY['expense_version','paid_on','bank_account_id','cash_location_id','actual_wht','note'])
    OR jsonb_typeof(item->'expense_version') IS DISTINCT FROM 'number' OR (item->>'expense_version')::integer<1
    OR jsonb_typeof(item->'actual_wht') IS DISTINCT FROM 'boolean' OR jsonb_typeof(item->'note') IS DISTINCT FROM 'string'
    OR item->>'paid_on' IS NULL OR num_nonnulls(item->>'bank_account_id',item->>'cash_location_id')<>1
    OR item - ARRAY['obligation_id','payout_id','payout_version','expense_version','paid_on','bank_account_id','cash_location_id','actual_wht','note'] <> '{}'::jsonb
   THEN RAISE EXCEPTION 'FINANCE088_INVALID_PREPARE'; END IF;
  ELSE
   IF NOT (item ?& ARRAY['payee_version','destination_id']) OR (item->>'payout_version')::integer IS NULL OR (item->>'payout_version')::integer<1
    OR item - ARRAY['obligation_id','payout_id','payout_version','payee_version','destination_id'] <> '{}'::jsonb
   THEN RAISE EXCEPTION 'FINANCE088_INVALID_CONFIRM'; END IF;
  END IF;
 END LOOP;
 IF (SELECT count(DISTINCT (v->>'obligation_id')::uuid)<>count(*) OR count(DISTINCT (v->>'payout_id')::uuid)<>count(*) FROM jsonb_array_elements(p_items) v)
 THEN RAISE EXCEPTION 'FINANCE088_DUPLICATE_ITEM'; END IF;
 -- Same lifecycle lock as cancel; then ALL expense locks before the first cash
 -- cutover/account lock. This prevents expense-A -> cash -> expense-B deadlocks.
 PERFORM pg_advisory_xact_lock(hashtextextended('payout_lifecycle',0));
 FOR target IN SELECT DISTINCT o.expense_id FROM public.finance_expense_obligations o
  JOIN jsonb_array_elements(p_items) v ON o.id=(v->>'obligation_id')::uuid ORDER BY 1 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('expense:'||target,0));
 END LOOP;
 -- Lock and classify every selected payout before processing any item.
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY (value->>'payout_id')::uuid LOOP
  SELECT * INTO obligation FROM public.finance_expense_obligations WHERE id=(item->>'obligation_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCE088_OBLIGATION_MISSING'; END IF;
  SELECT * INTO expense FROM public.finance_expenses WHERE id=obligation.expense_id FOR UPDATE;
  SELECT * INTO payout FROM public.finance_payouts WHERE id=(item->>'payout_id')::uuid FOR UPDATE;
  IF FOUND AND (payout.source_model<>'expense_v1' OR payout.choices_json#>>'{0,expense_id}' IS DISTINCT FROM expense.id::text)
   THEN RAISE EXCEPTION 'FINANCE088_PAYOUT_SOURCE_MISMATCH'; END IF;
  IF p_action='confirm' THEN
   IF payout.id IS NULL OR payout.status NOT IN ('draft','confirmed') THEN RAISE EXCEPTION 'FINANCE088_NOT_CONFIRMABLE'; END IF;
   IF payout.status='confirmed' THEN confirmed_count:=confirmed_count+1; END IF;
  END IF;
 END LOOP;
 IF confirmed_count NOT IN (0,jsonb_array_length(p_items)) THEN RAISE EXCEPTION 'FINANCE088_MIXED_CONFIRMED_BATCH'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY (value->>'payout_id')::uuid LOOP
  SELECT * INTO obligation FROM public.finance_expense_obligations WHERE id=(item->>'obligation_id')::uuid;
  SELECT * INTO expense FROM public.finance_expenses WHERE id=obligation.expense_id;
  SELECT * INTO payout FROM public.finance_payouts WHERE id=(item->>'payout_id')::uuid;
  expected_version := (item->>'payout_version')::integer;
  IF p_action='prepare' THEN
   IF expense.version IS DISTINCT FROM (item->>'expense_version')::integer THEN RAISE EXCEPTION 'FINANCE088_SOURCE_CHANGED'; END IF;
   IF payout.id IS NOT NULL AND payout.status<>'draft' THEN RAISE EXCEPTION 'FINANCE088_NOT_PREPARABLE'; END IF;
   choice:=public.expense_payout_choice(expense.id,(item->>'actual_wht')::boolean);
   IF choice->>'obligation_id' IS DISTINCT FROM obligation.id::text THEN RAISE EXCEPTION 'FINANCE088_OBLIGATION_CHANGED'; END IF;
   replay := payout.id IS NOT NULL AND payout.version=coalesce(expected_version,0)+1;
   IF replay THEN
    IF payout.choices_json IS DISTINCT FROM jsonb_build_array(choice)
     OR payout.paid_on IS DISTINCT FROM (item->>'paid_on')::date
     OR payout.bank_account_id IS DISTINCT FROM (item->>'bank_account_id')::uuid
     OR payout.cash_location_id IS DISTINCT FROM (item->>'cash_location_id')::uuid
     OR (expected_version IS NULL AND payout.note IS DISTINCT FROM (item->>'note'))
     OR NOT public.expense_account_allowed(payout.bank_account_id,payout.cash_location_id,'record_outflow')
     OR NOT public.treasury_location_active(payout.bank_account_id,payout.cash_location_id)
     OR payout.paid_on<expense.expense_date OR payout.paid_on>(now() AT TIME ZONE 'Asia/Bangkok')::date
    THEN RAISE EXCEPTION 'FINANCE088_RETRY_CHANGED'; END IF;
   ELSE
    PERFORM public.prepare_finance_expense_payout((item->>'payout_id')::uuid,expense.id,expected_version,
     (item->>'paid_on')::date,(item->>'bank_account_id')::uuid,(item->>'cash_location_id')::uuid,(item->>'actual_wht')::boolean,CASE WHEN expected_version IS NOT NULL THEN payout.note ELSE item->>'note' END);
   END IF;
  ELSE
   IF (payout.bank_account_id IS NULL AND item->>'destination_id' IS NOT NULL) OR (payout.payee_id IS NULL AND (item->>'payee_version' IS NOT NULL OR item->>'destination_id' IS NOT NULL)) THEN RAISE EXCEPTION 'FINANCE088_INVALID_CONFIRM'; END IF;
   IF payout.choices_json->0->>'obligation_id' IS DISTINCT FROM obligation.id::text THEN RAISE EXCEPTION 'FINANCE088_OBLIGATION_CHANGED'; END IF;
   IF confirmed_count>0 THEN
    -- Replay must match the exact confirmed evidence; never silently accept a
    -- stale/different request just because the individual dispatcher is idempotent.
    IF payout.version IS DISTINCT FROM expected_version+1
     OR (payout.confirmed_snapshot_json->'payee'->>'version')::integer IS DISTINCT FROM (item->>'payee_version')::integer
     OR (payout.confirmed_snapshot_json->'destination'->>'id')::uuid IS DISTINCT FROM (item->>'destination_id')::uuid
    THEN RAISE EXCEPTION 'FINANCE088_RETRY_CHANGED'; END IF;
   END IF;
   PERFORM public.confirm_finance_expense_payout(payout.id,expected_version,(item->>'payee_version')::integer,(item->>'destination_id')::uuid,true);
  END IF;
  SELECT * INTO payout FROM public.finance_payouts WHERE id=(item->>'payout_id')::uuid;
  result:=result||jsonb_build_array(jsonb_build_object('obligation_id',obligation.id,'payout_id',payout.id,'version',payout.version,'status',payout.status,'gross',payout.gross_amount,'wht',payout.wht_amount,'net',payout.net_amount));
 END LOOP;
 RETURN jsonb_build_object('action',p_action,'items',result);
EXCEPTION WHEN OTHERS THEN
 -- Rethrow, never continue: the enclosing subtransaction rolls back ALL items.
 GET STACKED DIAGNOSTICS failure=MESSAGE_TEXT;
 detail:=jsonb_build_object('obligation_id',item->>'obligation_id','payout_id',item->>'payout_id','code',failure)::text;
 RAISE EXCEPTION USING MESSAGE=failure,DETAIL=detail;
END;
$function$;
ALTER FUNCTION public.finance_expense_payout_batch(text,jsonb,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finance_expense_payout_batch(text,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finance_expense_payout_batch(text,jsonb,boolean) TO authenticated;

DO $preserve$ DECLARE before_state jsonb; after_state jsonb; BEGIN
 SELECT state INTO before_state FROM finance088_before;
 select jsonb_build_object('functions',(select coalesce(jsonb_object_agg(v->>'signature',encode(sha256(convert_to((v)::text,'UTF8')),'hex')),'{}') from (select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'security_definer',p.prosecdef,'config',p.proconfig,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text COLLATE "C"),'[]') value
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname in ('finance078_active','finance078_admin','finance078_require_payout','finance078_execution_account','expense_account_allowed','treasury_location_active','prepare_finance_expense_payout','confirm_finance_expense_payout','confirm_finance_payout','cancel_finance_payout','expense_payout_choice','payout_assert','payout_integrity','get_finance_expenses','get_finance_expense_obligations','get_finance_account_statement','company_purchase_request_recipient','company_purchase_request_declaration','finance_bangkok_completed_day_end','record_finance_cash_transaction_audit_event','expense_payout_model_guard','expense_integrity','validate_finance_cash_transaction_integrity','enforce_finance_cash_transaction_integrity','protect_finance_cash_audit_event')) f,jsonb_array_elements(f.value) x(v)),'tables',(select coalesce(jsonb_object_agg(v->>'name',encode(sha256(convert_to((v)::text,'UTF8')),'hex')),'{}') from (select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'acl',a.attacl::text,'generated',a.attgenerated,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum),'[]') from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid),'validated',convalidated) order by conname COLLATE "C"),'[]') from pg_constraint where conrelid=c.oid and contype<>'n'),
 'indexes',(select coalesce(jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) order by indexname COLLATE "C"),'[]') from pg_indexes where schemaname='public' and tablename=c.relname),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by policyname COLLATE "C"),'[]') from pg_policies p where schemaname='public' and tablename=c.relname),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) order by tgname COLLATE "C"),'[]') from pg_trigger where tgrelid=c.oid and not tgisinternal),
 'anon_select',has_table_privilege('anon',c.oid,'SELECT'),'authenticated_write',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'),
 'service_select',has_table_privilege('service_role',c.oid,'SELECT')) order by c.relname COLLATE "C"),'[]') value
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v') and c.relname in ('finance_expenses','finance_expense_settlements','finance_expense_obligations','finance_expense_tax_reviews','finance_expense_audit','finance_expense_obligation_waivers','finance_payouts','finance_payout_allocations','finance_payout_audit','finance_cash_transactions','finance_cash_transaction_audit_events','finance_outgoing_wht_obligations','finance_payees','finance_payee_destinations','finance_account_opening_balances','finance_treasury_account_authorities')) f,jsonb_array_elements(f.value) x(v)),'batch',(select coalesce(jsonb_object_agg(v->>'signature',encode(sha256(convert_to((v)::text,'UTF8')),'hex')),'{}') from (select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'security_definer',p.prosecdef,'config',p.proconfig,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text COLLATE "C"),'[]') value
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname in ('finance_expense_payout_batch')) f,jsonb_array_elements(f.value) x(v)),'rows',(select coalesce(jsonb_object_agg(name,jsonb_build_object('count',(xpath('/row/n/text()',x))[1]::text::bigint,'sha256',(xpath('/row/h/text()',x))[1]::text)),'{}') from (
 select c.relname name,query_to_xml(format('select count(*) n,encode(sha256(convert_to(coalesce(string_agg((%s)::text,E''\n'' order by (%s)::text COLLATE "C"),''''),''UTF8'')),''hex'') h from public.%I t',
 'to_jsonb(t)',
 'to_jsonb(t)',c.relname),true,true,'') x
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') and (c.relname like 'finance\_%' escape '\' or c.relname in ('user_profiles','case_audit_logs','document_numbering_profiles'))) captured),'preserved',(select jsonb_build_object('tables',(select value from (select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'acl',a.attacl::text,'generated',a.attgenerated,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum),'[]') from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid),'validated',convalidated) order by conname COLLATE "C"),'[]') from pg_constraint where conrelid=c.oid and contype<>'n'),
 'indexes',(select coalesce(jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) order by indexname COLLATE "C"),'[]') from pg_indexes where schemaname='public' and tablename=c.relname),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by policyname COLLATE "C"),'[]') from pg_policies p where schemaname='public' and tablename=c.relname),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) order by tgname COLLATE "C"),'[]') from pg_trigger where tgrelid=c.oid and not tgisinternal),
 'anon_select',has_table_privilege('anon',c.oid,'SELECT'),'authenticated_write',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'),
 'service_select',has_table_privilege('service_role',c.oid,'SELECT')) order by c.relname COLLATE "C"),'[]') value
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v')) t),'functions',(select value from (select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'security_definer',p.prosecdef,'config',p.proconfig,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text COLLATE "C"),'[]') value
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname<>'finance_expense_payout_batch') f),'defaults',(select coalesce(jsonb_agg(to_jsonb(d)-'oid' order by defaclrole,defaclnamespace,defaclobjtype),'[]') from pg_default_acl d),'views',(select coalesce(jsonb_object_agg(c.relname,pg_get_viewdef(c.oid,true)),'{}') from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v')))) state INTO after_state;
 IF before_state-'batch' IS DISTINCT FROM after_state-'batch' OR after_state->'batch' IS DISTINCT FROM '{"finance_expense_payout_batch(text,jsonb,boolean)":"aee9ff9bf8b59cc6458cb51a3a9ed81775c13804b2180c75023ae413a977bab4"}'::jsonb THEN RAISE EXCEPTION 'FINANCE088_PRESERVATION_FAILED'; END IF;
END; $preserve$;
COMMIT;
