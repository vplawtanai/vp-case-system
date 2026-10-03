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
