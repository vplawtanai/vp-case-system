-- 092 safe Payroll correction candidate. HUMAN MIGRATION GATE; no seed/backfill/business DML.
-- Accepted immutable 089 file SHA-256: d08607902bb1e04ade69c320d7538336168f83fe627aad19985234a9fb71d53b
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
DO $locks$ declare r record; begin
 if current_user<>'postgres' then raise exception 'PAYROLL092_OWNER_REQUIRED';end if;
 for r in select c.oid::regclass rel from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') order by c.oid loop execute format('LOCK TABLE %s IN SHARE MODE',r.rel);end loop;
end;$locks$;
CREATE TEMP TABLE payroll092_before ON COMMIT DROP AS select jsonb_build_object('functions',(select coalesce(jsonb_object_agg(v->>'signature',encode(sha256(convert_to((v)::text,'UTF8')),'hex')),'{}') from (select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'security_definer',p.prosecdef,'config',p.proconfig,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text COLLATE "C"),'[]') value
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname in ('finance078_admin','payout_immutable','payout_integrity','expense_integrity','finance078_active','payout_assert','payroll089_protect','payroll089_read','get_finance_payees','payroll089_link_assert','payroll089_sources','tax_position_immutable','payroll089_payment_guard','payroll089_period_assert','payroll089_require_admin','expense_payout_model_guard','get_finance_treasury','payroll089_payment_assert','payout_assert_before_expense','payroll089_manage','protect_finance_cash_audit_event','expense_payout_choice','treasury_location_active','finance078_require_payout','expense_account_allowed','finance078_execution_account','finance_bangkok_completed_day_end','company_purchase_request_recipient','get_finance_expense_obligations','company_purchase_request_declaration','get_finance_expenses','cancel_finance_payout','enforce_finance_cash_transaction_integrity','enforce_finance_cash_transaction_lifecycle','finance_expense_payout_batch','payroll089_payment_batch','validate_finance_cash_transaction_integrity','confirm_finance_payout','record_finance_cash_transaction_audit_event','confirm_finance_expense_payout','get_finance_account_statement','prepare_finance_expense_payout','payroll091_source','payroll091_month','payroll091_manage','payroll092_line_safe','payroll092_rate_lines','payroll092_state','payroll092_read','payroll092_correct')) f,jsonb_array_elements(f.value) x(v)),'tables',(select coalesce(jsonb_object_agg(v->>'name',encode(sha256(convert_to((v)::text,'UTF8')),'hex')),'{}') from (select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'acl',a.attacl::text,'generated',a.attgenerated,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum),'[]') from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid),'validated',convalidated) order by conname COLLATE "C"),'[]') from pg_constraint where conrelid=c.oid and contype<>'n'),
 'indexes',(select coalesce(jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) order by indexname COLLATE "C"),'[]') from pg_indexes where schemaname='public' and tablename=c.relname),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by policyname COLLATE "C"),'[]') from pg_policies p where schemaname='public' and tablename=c.relname),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) order by tgname COLLATE "C"),'[]') from pg_trigger where tgrelid=c.oid and not tgisinternal),
 'anon_select',has_table_privilege('anon',c.oid,'SELECT'),'authenticated_write',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'),
 'service_select',has_table_privilege('service_role',c.oid,'SELECT')) order by c.relname COLLATE "C"),'[]') value
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v') and c.relname in ('finance_payees','finance_payouts','finance_expenses','finance_payout_audit','finance_expense_audit','finance_payroll_audit','finance_payroll_lines','finance_payroll_rates','finance_payroll_periods','finance_payroll_payments','finance_payroll_requests','finance_cash_transactions','finance_payee_destinations','finance_payout_allocations','finance_expense_obligations','finance_expense_settlements','finance_expense_tax_reviews','finance_payroll_engagements','finance_payroll_obligations','finance_account_opening_balances','finance_outgoing_wht_obligations','finance_expense_obligation_waivers','finance_treasury_account_authorities','finance_cash_transaction_audit_events')) f,jsonb_array_elements(f.value) x(v)),'rows',(select coalesce(jsonb_object_agg(name,jsonb_build_object('count',(xpath('/row/n/text()',x))[1]::text::bigint,'sha256',(xpath('/row/h/text()',x))[1]::text)),'{}') from (
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
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v')) t),
 'functions',(select value from (select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'security_definer',p.prosecdef,'config',p.proconfig,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text COLLATE "C"),'[]') value
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.oid::regprocedure::text not in ('payroll089_protect()','payroll092_line_safe(uuid)','payroll092_rate_lines(uuid)','payroll092_state(uuid)','payroll092_read(date,uuid)','payroll092_correct(text,uuid,uuid,text,text,uuid)')) f),
 'defaults',(select coalesce(jsonb_agg(to_jsonb(d)-'oid' order by defaclrole,defaclnamespace,defaclobjtype),'[]') from pg_default_acl d),
 'views',(select coalesce(jsonb_object_agg(c.relname,pg_get_viewdef(c.oid,true)),'{}') from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v')))) state;
DO $guard$ declare s jsonb;begin
 select state into s from payroll092_before;
 if s->'functions' is distinct from '{"finance078_admin()":"b8e378c9afe8476d59a67fa626abeab1386c78101c94dd242a43ad81918eef8b","payout_immutable()":"e86bcbef710b3e7411740099b976a0835b4d2727967cc38ef69f68fa5807e7a1","payout_integrity()":"c3e998c2ab8c337869846b9c37e50768833ceaf92373abc69bf7878b62d68e32","expense_integrity()":"4129c18337dbadea7e773f0cd31c13b4e2bfb08eaeb6c1bdfe91f2f106426e5e","finance078_active()":"407aac4bc85656987f8b753274e644d0153898ededf69aec7bbd2cc22c967472","payout_assert(uuid)":"c7f8684536896c4433617f55c610ec8bc09b2795521a39040bdf6fb1efad29cd","payroll089_protect()":"28142a2ea33c6e8a31f1c273869710b8843bc2b6699971b36f0003636a7ec527","payroll089_read(uuid)":"0d625c26dfc35f6bba3d180b9fe082d4722a18b40724dae81c1402f9500f62f2","get_finance_payees(text)":"99ab395676e91cde4586be889bb4fe44695aecebb653251a0a509f3c3f63b190","payroll089_link_assert()":"3931af8ae23deb84a4e9924f4b8b27614d9a57c5bfd0467adb0f55b27a5ff1b5","payroll089_sources(date)":"0506dd200dfc4ec6e9cc4119a6484de10a534c80b2b49433c5db5e76611c90ba","tax_position_immutable()":"86e13623d94afef28ee3f3439462e1f77bfb5a39e9b9aa7219fba9f5a44b7cd7","payroll089_payment_guard()":"5b477ef49cc9231db61ed7f96b57f7092624d5c991bb8a9d01ff9a9a5e1b991e","payroll089_period_assert()":"a22a6ed7d7dea305ec24fa412f729fa3154191126632da93a3dd5abd37e6bc51","payroll089_require_admin()":"df83f3fe5b7cf17debd782755feb22c42de8e90e181c91c139819c2516a23cfa","expense_payout_model_guard()":"1cce3a7f3c3ddff7f7af6d6c9e152fbc1d775c745a304173c512bb1fd9a7d6ba","get_finance_treasury(integer)":"c3218f5f9d617d1dbca7ebdcdb7c64eabd775133c0c2381e7eda06f270d9232e","payroll089_payment_assert(uuid)":"7dc42bf46ca2f6f0089e92924dba472eb4f92a983ef52d62631224fd43c08fec","payout_assert_before_expense(uuid)":"a7b74988ac9e62a34bbf8203802215e678969082ecf8f8fadebe8668d16bff81","payroll089_manage(text,jsonb,uuid)":"57f09fd5a393597513873ffbe9e96bcf7af7c10d255a3427ad204b81c3139235","protect_finance_cash_audit_event()":"354e2a156c638e082656682e734b08e159255d5ddb7d78be3315fc2c389c2d72","expense_payout_choice(uuid,boolean)":"824f97735cdb2de19b23a7f6c10fe1e68109b9a8b872ea4106dc9663552ca118","treasury_location_active(uuid,uuid)":"197f319835bbdc4ced7367443852305541fb49bfdee62b6cf27d744d439a9b43","finance078_require_payout(uuid,text)":"fd94022f03ca61f6e11324aa361b19f963fae4f79e57dbfa2adff754aea83482","expense_account_allowed(uuid,uuid,text)":"06a13aee3a8fc43ea1eeecdfc982f0ef9fec81e6d28000d0126d234ee377daf2","finance078_execution_account(uuid,uuid)":"2e12b4f4497748e9c2fed10df84094819c38b861f7746cdfb270e64e68c303d7","finance_bangkok_completed_day_end(date)":"b15561569e408875fcbacb331d621193d6c253500d3d51365151c3daaebf1b83","company_purchase_request_recipient(uuid)":"56cc4992d2b221f85b4dba9aba52bc656e9944ed21a922937f721e078a1bfebf","get_finance_expense_obligations(integer)":"ba01495deb6bc9dd34763db5025b38e21ff6a8ca1c55063320a8ea4183a590a5","company_purchase_request_declaration(uuid)":"52279e560e912ce5b4ced4bff6a6639403baa050a2ece9d6548f8a3378f700b8","get_finance_expenses(uuid,boolean,integer)":"b6edaad770683f3c2cd8f860576086420477ae667d24be8d0653375039fe1446","cancel_finance_payout(uuid,integer,boolean)":"1cfe3ac02b846c2081310e67fae1918101237b4f4887ab2d3502754f2516cd70","enforce_finance_cash_transaction_integrity()":"43118d6a578127049a27a6c8e7d4aa3e7d3d22ec050de90d1a9be009c22b626e","enforce_finance_cash_transaction_lifecycle()":"0a9dd77f19095aac6d42032c76380ded44e16cca505dba80b245d6924c69744d","finance_expense_payout_batch(text,jsonb,boolean)":"aee9ff9bf8b59cc6458cb51a3a9ed81775c13804b2180c75023ae413a977bab4","payroll089_payment_batch(text,jsonb,uuid,boolean)":"088b35740e3bc854ed8d237b280603bbbd49792c1e46e592608e0dd9d1e29720","validate_finance_cash_transaction_integrity(uuid)":"7f1efdafd4ad1a94f4050a90e9646623c3e3c8bc67a4c4a4edcdee27d1421e03","confirm_finance_payout(uuid,integer,integer,uuid,boolean)":"6feef0df974008d2bf241136399bfe1f33faf8236f676a2eb65982541893a8dd","record_finance_cash_transaction_audit_event(uuid,text,jsonb)":"5b71722654f0aec8f29f2218f4bd21ddf8b408ae0d029c98bddf4b853ca7c939","confirm_finance_expense_payout(uuid,integer,integer,uuid,boolean)":"2774122067a7f8a25b88376a51f79bb5dbd214e6cc0c266209a958a959504f07","get_finance_account_statement(uuid,uuid,date,date,text,text,integer)":"e80ee12f8fa546cfb04a864e91597d88363872f6e67ee528f0f7882ed8d208eb","prepare_finance_expense_payout(uuid,uuid,integer,date,uuid,uuid,boolean,text)":"025f58e4faeb384522a66868f7464d4238fc81168f3763a51acd43c2a96dcd08","payroll091_source(date,uuid)":"3b150c03dc27fe336fa5cb042a99bf8196f2ca4ec746bf055b47bc550d85bf7a","payroll091_month(date)":"6ebafee0080c1e6b8767d8af336bd2931597b601a530bc1af1f8d98699ebe0ff","payroll091_manage(text,date,jsonb,uuid,boolean)":"63f24b18334b7b04e0806640b19db402a2919485e376d96e9162961e6d51b351"}'::jsonb or s->'tables' is distinct from '{"finance_payees":"9c2ead6e07c9bd0f144bf583536cda44bfbd64dc2207cd39ea183d2362d588fe","finance_payouts":"efa1afe6a226b3b4436b85f84528542b3c957638d79794a43065ef87aa791b8d","finance_expenses":"917cbb0c57b46f9c7f50c197440432d18571234d88633e2811c24d8c03bf9b9a","finance_payout_audit":"7df609d02f148630fab23a97200ce0ba257a3418220256b233b332ea29142eeb","finance_expense_audit":"45a29cf2419d86fb16b78eee6e03d72444cb059dadf790899cb3b40427526b8c","finance_payroll_audit":"29ecf1051429066b9bd8563083bbf4f3caff5aa762310c900c754c42102439f8","finance_payroll_lines":"519871cc3af963b91f3599577806b8727ae2b9980d433ec7f66cffcbfa947166","finance_payroll_rates":"04c023d16815d2596e6528686aca7f4cd87a0296035049dadb534714d6d099cb","finance_payroll_periods":"e0f164134a308370267ee2fb1adf0e78b7d5f35b8a06fe0b771a080bf72b1324","finance_payroll_payments":"2a25ba8e1115f98f1ade40998097a654d01675d8afdef1133c2e870ddb964c82","finance_payroll_requests":"d33d534baf3aa7c01c6f93c2d0fcc4c9285933e59969d77b112f7e2563ed61e0","finance_cash_transactions":"e2d5121c9ac25c3f0376edb129ea9f8fda37bd76c264951d122f9d74022d9239","finance_payee_destinations":"d6097c55137bf56a9f205e7eb97033313acd3e7ea122d8c0eccd3ffe3d44ccfc","finance_payout_allocations":"35644dbf266236a473a70bbc28469941a7af4092868fdf93809993ec37f00df8","finance_expense_obligations":"98fdf10a58d228cd7d301c52cfc82773e6d98eac973a6b6ef85fd4063003241b","finance_expense_settlements":"37ba9648f89a716172d10421da7fa2a5c4d0f35aa5725f53a1e31d2cc044e111","finance_expense_tax_reviews":"d482a46eacee0b020dd6a27546ce1e516f57a3a75c68567f0ed8cff852feef06","finance_payroll_engagements":"b04ab0bac055c4cec764a49f9590377ef392f1b6462cd20eee3f70bfca7b1e61","finance_payroll_obligations":"da620d735c89e06643535d10bfdf24bfdfdc05e52562f95a45af84fdf2d8e1a4","finance_account_opening_balances":"05a9bc63cd712438b0d99b37921b0efaf887f8bc9b839bc2150f7c72ba340169","finance_outgoing_wht_obligations":"cb4a49517f0968e79a5563acfd6bc9e007f97ff570ceb5ce27794dca609279a9","finance_expense_obligation_waivers":"6b183eda4ff5624b47a8ecb3ddf47f04cee6d59dbbd6510b09186c325ca65f56","finance_treasury_account_authorities":"adf6d6175069b61012c72be98de01173bcb29b01de7904385a8880c43dd65029","finance_cash_transaction_audit_events":"7b69a3ba60802d3ca786f49300e8303b772a2b30cc9df217d63a1330d9f4d089"}'::jsonb then raise exception 'PAYROLL092_ACCEPTED_091_CONTRACT_DRIFT';end if;
end;$guard$;
-- 092: controlled correction only. No new tables, columns, seed or backfill.
-- Private helpers expose no salary data or DELETE privilege to application roles.
create function public.payroll092_line_safe(p_line uuid) returns boolean
language plpgsql stable security definer set search_path=public as $$
begin
 perform public.payroll089_require_admin();
 return exists(select 1 from finance_payroll_lines l join finance_payroll_periods p on p.id=l.period_id
  where l.id=p_line and l.frozen_json is null and p.status in ('draft','open')
  and not exists(select 1 from finance_payroll_obligations o where o.line_id=l.id)
  and not exists(select 1 from finance_payroll_payments x where x.line_id=l.id)
  -- Check the payout source too, including cancelled payouts and orphaned links.
  -- Cash refers to this immutable payout identity; neither may be removed here.
  and not exists(select 1 from finance_payouts x where x.source_model='payroll_v1'
   and x.choices_json @> jsonb_build_array(jsonb_build_object('line_id',l.id))));
end; $$;

create function public.payroll092_rate_lines(p_rate uuid) returns setof uuid
language plpgsql stable security definer set search_path=public as $$
begin
 perform public.payroll089_require_admin();
 -- A mid-month rate may live only in rate_intervals, not the primary rate FK.
 -- Also invalidate unfinished amounts whose effective source would change.
 return query select l.id from finance_payroll_rates r join finance_payroll_lines l on l.payee_id=r.payee_id
 where r.id=p_rate and (l.rate_id=r.id
  or l.source_json @> jsonb_build_object('rate_intervals',jsonb_build_array(jsonb_build_object('rate',jsonb_build_object('id',r.id))))
  or (l.service_to>=r.effective_from and l.service_from<coalesce((select min(n.effective_from) from finance_payroll_rates n where n.payee_id=r.payee_id and n.effective_from>r.effective_from),'infinity'::date)));
end; $$;

create function public.payroll092_state(p_payee uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare s jsonb;
begin
 perform public.payroll089_require_admin();
 select jsonb_build_object(
  'has_payroll_payout',exists(select 1 from finance_payouts where payee_id=p_payee and source_model='payroll_v1'),
  'engagements',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from finance_payroll_engagements e where payee_id=p_payee),
  'rates',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from finance_payroll_rates r where payee_id=p_payee),
  'lines',(select coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]') from finance_payroll_lines l where payee_id=p_payee),
  'periods',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from finance_payroll_periods p where exists(select 1 from finance_payroll_lines l where l.period_id=p.id and l.payee_id=p_payee)),
  'line_safe',(select coalesce(jsonb_object_agg(l.id,public.payroll092_line_safe(l.id)),'{}') from finance_payroll_lines l where payee_id=p_payee),
  'rate_lines',(select coalesce(jsonb_object_agg(r.id,(select coalesce(jsonb_agg(x order by x),'[]') from public.payroll092_rate_lines(r.id) x)),'{}') from finance_payroll_rates r where payee_id=p_payee)
 ) into s;
 return s;
end; $$;

create function public.payroll092_read(p_month date default null,p_period uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare person uuid;s jsonb;result jsonb:='{}';rates jsonb; r jsonb; data jsonb;
begin
 perform public.payroll089_require_admin();
 for person in select payee_id from finance_payroll_engagements union select payee_id from finance_payroll_rates union select payee_id from finance_payroll_lines loop
  s:=public.payroll092_state(person);rates:='{}';
  for r in select value from jsonb_array_elements(s->'rates') loop
   rates:=rates||jsonb_build_object(r->>'id',jsonb_build_object('allowed',not exists(select 1 from jsonb_array_elements_text(s#>array['rate_lines',r->>'id']) x where s#>>array['line_safe',x] is distinct from 'true'),
    'affected_lines',jsonb_array_length(s#>array['rate_lines',r->>'id'])));
  end loop;
  result:=result||jsonb_build_object(person,jsonb_build_object('hash',encode(sha256(convert_to(s::text,'UTF8')),'hex'),
   'setup_allowed',s->>'has_payroll_payout'='false' and not exists(select 1 from jsonb_each(s->'line_safe') x where x.value<>'true'::jsonb),
   'line_count',jsonb_array_length(s->'lines'),'rates',rates,'lines',s->'line_safe'));
 end loop;
 -- STABLE callees share this statement's snapshot. The displayed facts and
 -- correction token must never come from separate read transactions.
 data:=public.payroll089_read(p_period);
 return data||jsonb_build_object('corrections',result,'monthly',public.payroll091_month(coalesce(p_month,((data->>'today')::date-date_part('day',(data->>'today')::date)::integer+1))));
end; $$;

create function public.payroll092_correct(p_action text,p_payee uuid,p_target uuid,p_expected_hash text,p_reason text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare req finance_payroll_requests%rowtype; s jsonb; payload jsonb; result jsonb; chosen uuid[]; old_context text;
begin
 perform public.payroll089_require_admin();
 if p_action is null or p_action not in ('setup','rate','line') or p_payee is null or p_request_id is null
  or p_expected_hash is null or p_expected_hash!~'^[0-9a-f]{64}$' or p_reason is null or length(btrim(p_reason)) not between 1 and 2000
  or (p_action='setup' and p_target is not null) or (p_action<>'setup' and p_target is null) then raise exception 'PAYROLL_CORRECTION_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('payout_lifecycle',0));
 perform pg_advisory_xact_lock(hashtextextended('payroll089',0));
 payload:=jsonb_build_object('payee_id',p_payee,'target',p_target,'expected_hash',p_expected_hash,'reason',p_reason);
 select * into req from finance_payroll_requests where id=p_request_id;
 if req.id is not null then
  if req.actor_id<>auth.uid() or req.action<>'correction_'||p_action or req.payload<>payload then raise exception 'PAYROLL_RETRY_CHANGED';end if;
  return req.result;
 end if;
 perform 1 from finance_payees where id=p_payee for update;
 -- Deterministic locks shared with the existing serialized Payroll money paths.
 perform 1 from finance_payroll_periods where id in (select period_id from finance_payroll_lines where payee_id=p_payee) order by id for update;
 perform 1 from finance_payroll_lines where payee_id=p_payee order by id for update;
 perform 1 from finance_payroll_engagements where payee_id=p_payee order by id for update;
 perform 1 from finance_payroll_rates where payee_id=p_payee order by id for update;
 s:=public.payroll092_state(p_payee);
 if encode(sha256(convert_to(s::text,'UTF8')),'hex')<>p_expected_hash then raise exception 'PAYROLL_CORRECTION_STALE';end if;
 if p_action='setup' then
  if s->>'has_payroll_payout' is distinct from 'false' then raise exception 'PAYROLL_CORRECTION_FINALIZED';end if;
  if jsonb_array_length(s->'engagements')+jsonb_array_length(s->'rates')=0 then raise exception 'PAYROLL_CORRECTION_INVALID';end if;
  select array_agg(id order by id) into chosen from finance_payroll_lines where payee_id=p_payee;
 elsif p_action='rate' then
  if not exists(select 1 from finance_payroll_rates where id=p_target and payee_id=p_payee) then raise exception 'PAYROLL_CORRECTION_INVALID';end if;
  select array_agg(x order by x) into chosen from public.payroll092_rate_lines(p_target) x;
 else
  if not exists(select 1 from finance_payroll_lines where id=p_target and payee_id=p_payee) then raise exception 'PAYROLL_CORRECTION_INVALID';end if;
  chosen:=array[p_target];
 end if;
 if exists(select 1 from unnest(chosen) x where not public.payroll092_line_safe(x)) then raise exception 'PAYROLL_CORRECTION_FINALIZED';end if;
 result:=jsonb_build_object('transaction_id',txid_current(),'deleted',jsonb_build_object(
  'finance_payroll_lines',(select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]') from finance_payroll_lines l where id=any(chosen)),
  'finance_payroll_rates',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from finance_payroll_rates r where payee_id=p_payee and (p_action='setup' or (p_action='rate' and id=p_target))),
  'finance_payroll_engagements',case when p_action='setup' then s->'engagements' else '[]'::jsonb end));
 -- The immutable request is a transaction-bound deletion permit. A forged GUC
 -- alone cannot authorize deletion: role has no INSERT/DML on this table.
 insert into finance_payroll_requests(id,actor_id,action,payload,result) values(p_request_id,auth.uid(),'correction_'||p_action,payload,result);
 old_context:=current_setting('vp.payroll092_request',true);
 perform set_config('vp.payroll092_request',p_request_id::text,true);
 delete from finance_payroll_lines where id=any(chosen);
 if p_action='setup' then
  delete from finance_payroll_rates where payee_id=p_payee;
  delete from finance_payroll_engagements where payee_id=p_payee;
 elsif p_action='rate' then delete from finance_payroll_rates where id=p_target;end if;
 perform set_config('vp.payroll092_request',coalesce(old_context,''),true);
 insert into finance_payroll_audit(request_id,actor_id,action,evidence_json)
  values(p_request_id,auth.uid(),'correction_'||p_action,jsonb_build_object('input',payload,'before',s,'result',result));
 return result;
end; $$;

-- The complete 091 protection remains below this narrow, audited DELETE permit.
create or replace function public.payroll089_protect() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform public.payroll089_require_admin();
 if tg_op='DELETE' and tg_table_name in ('finance_payroll_engagements','finance_payroll_rates','finance_payroll_lines')
  and exists(select 1 from finance_payroll_requests q
   where q.id::text=current_setting('vp.payroll092_request',true) and q.actor_id=auth.uid()
    and q.action in ('correction_setup','correction_rate','correction_line')
    and q.result->>'transaction_id'=txid_current()::text
    and q.result#>array['deleted',tg_table_name] @> jsonb_build_array(to_jsonb(old))) then
  if tg_table_name='finance_payroll_lines' and not public.payroll092_line_safe(old.id) then raise exception 'PAYROLL_CORRECTION_FINALIZED';end if;
  return old;
 end if;
 if tg_op='TRUNCATE' then raise exception 'PAYROLL_HISTORY_IMMUTABLE'; end if;
 if tg_table_name='finance_payroll_periods' then
  if tg_op='UPDATE' and old.status in ('draft','open') and (old.status<>'open' or new.status='open') and new.version=old.version+1
   and (to_jsonb(old)-array['status','version','approved_by','approved_at','target_payment_date','note'])=(to_jsonb(new)-array['status','version','approved_by','approved_at','target_payment_date','note']) then return new; end if;
 elsif tg_table_name='finance_payroll_lines' then
  if exists(select 1 from finance_payroll_periods where id=old.period_id and status='open') then
   if old.frozen_json is not null then raise exception 'PAYROLL_LINE_FROZEN';end if;
   if tg_op='UPDATE' and (new.id,new.period_id,new.payee_id) is not distinct from (old.id,old.period_id,old.payee_id) then return new;end if;
   raise exception 'PAYROLL_LINE_IDENTITY_IMMUTABLE';
  end if;
  if exists(select 1 from finance_payroll_periods where id=old.period_id and status='draft') then
   if tg_op='DELETE' then return old; end if;
   if (new.id,new.period_id,new.payee_id,new.engagement_id,new.rate_id,new.kind,new.service_from,new.service_to,new.source_json,new.requires_base_review)
    is not distinct from (old.id,old.period_id,old.payee_id,old.engagement_id,old.rate_id,old.kind,old.service_from,old.service_to,old.source_json,old.requires_base_review) then return new; end if;
  end if;
 elsif tg_table_name='finance_payroll_payments' then
  if tg_op='UPDATE' and old.status='draft' and new.status in ('confirmed','cancelled')
   and to_jsonb(old)-array['status','confirm_json']=to_jsonb(new)-array['status','confirm_json'] then return new; end if;
 end if;
 raise exception 'PAYROLL_HISTORY_IMMUTABLE';
end; $$;

DO $security$ declare f record;begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'payroll092_%' loop
  execute format('alter function %s owner to postgres',f.signature);
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname in ('payroll092_read','payroll092_correct') then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end;$security$;

DO $preserve$ declare b jsonb;a jsonb;begin
 select state into b from payroll092_before;
 select jsonb_build_object('functions',(select coalesce(jsonb_object_agg(v->>'signature',encode(sha256(convert_to((v)::text,'UTF8')),'hex')),'{}') from (select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'security_definer',p.prosecdef,'config',p.proconfig,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text COLLATE "C"),'[]') value
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname in ('finance078_admin','payout_immutable','payout_integrity','expense_integrity','finance078_active','payout_assert','payroll089_protect','payroll089_read','get_finance_payees','payroll089_link_assert','payroll089_sources','tax_position_immutable','payroll089_payment_guard','payroll089_period_assert','payroll089_require_admin','expense_payout_model_guard','get_finance_treasury','payroll089_payment_assert','payout_assert_before_expense','payroll089_manage','protect_finance_cash_audit_event','expense_payout_choice','treasury_location_active','finance078_require_payout','expense_account_allowed','finance078_execution_account','finance_bangkok_completed_day_end','company_purchase_request_recipient','get_finance_expense_obligations','company_purchase_request_declaration','get_finance_expenses','cancel_finance_payout','enforce_finance_cash_transaction_integrity','enforce_finance_cash_transaction_lifecycle','finance_expense_payout_batch','payroll089_payment_batch','validate_finance_cash_transaction_integrity','confirm_finance_payout','record_finance_cash_transaction_audit_event','confirm_finance_expense_payout','get_finance_account_statement','prepare_finance_expense_payout','payroll091_source','payroll091_month','payroll091_manage','payroll092_line_safe','payroll092_rate_lines','payroll092_state','payroll092_read','payroll092_correct')) f,jsonb_array_elements(f.value) x(v)),'tables',(select coalesce(jsonb_object_agg(v->>'name',encode(sha256(convert_to((v)::text,'UTF8')),'hex')),'{}') from (select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'acl',a.attacl::text,'generated',a.attgenerated,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum),'[]') from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid),'validated',convalidated) order by conname COLLATE "C"),'[]') from pg_constraint where conrelid=c.oid and contype<>'n'),
 'indexes',(select coalesce(jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) order by indexname COLLATE "C"),'[]') from pg_indexes where schemaname='public' and tablename=c.relname),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by policyname COLLATE "C"),'[]') from pg_policies p where schemaname='public' and tablename=c.relname),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) order by tgname COLLATE "C"),'[]') from pg_trigger where tgrelid=c.oid and not tgisinternal),
 'anon_select',has_table_privilege('anon',c.oid,'SELECT'),'authenticated_write',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'),
 'service_select',has_table_privilege('service_role',c.oid,'SELECT')) order by c.relname COLLATE "C"),'[]') value
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v') and c.relname in ('finance_payees','finance_payouts','finance_expenses','finance_payout_audit','finance_expense_audit','finance_payroll_audit','finance_payroll_lines','finance_payroll_rates','finance_payroll_periods','finance_payroll_payments','finance_payroll_requests','finance_cash_transactions','finance_payee_destinations','finance_payout_allocations','finance_expense_obligations','finance_expense_settlements','finance_expense_tax_reviews','finance_payroll_engagements','finance_payroll_obligations','finance_account_opening_balances','finance_outgoing_wht_obligations','finance_expense_obligation_waivers','finance_treasury_account_authorities','finance_cash_transaction_audit_events')) f,jsonb_array_elements(f.value) x(v)),'rows',(select coalesce(jsonb_object_agg(name,jsonb_build_object('count',(xpath('/row/n/text()',x))[1]::text::bigint,'sha256',(xpath('/row/h/text()',x))[1]::text)),'{}') from (
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
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v')) t),
 'functions',(select value from (select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'security_definer',p.prosecdef,'config',p.proconfig,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text COLLATE "C"),'[]') value
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.oid::regprocedure::text not in ('payroll089_protect()','payroll092_line_safe(uuid)','payroll092_rate_lines(uuid)','payroll092_state(uuid)','payroll092_read(date,uuid)','payroll092_correct(text,uuid,uuid,text,text,uuid)')) f),
 'defaults',(select coalesce(jsonb_agg(to_jsonb(d)-'oid' order by defaclrole,defaclnamespace,defaclobjtype),'[]') from pg_default_acl d),
 'views',(select coalesce(jsonb_object_agg(c.relname,pg_get_viewdef(c.oid,true)),'{}') from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v')))) state into a;
 if a->'rows' is distinct from b->'rows' or a->'preserved' is distinct from b->'preserved' then raise exception 'PAYROLL092_PRESERVATION_FAILED';end if;
 if a->'functions' is distinct from '{"finance078_admin()":"b8e378c9afe8476d59a67fa626abeab1386c78101c94dd242a43ad81918eef8b","payout_immutable()":"e86bcbef710b3e7411740099b976a0835b4d2727967cc38ef69f68fa5807e7a1","payout_integrity()":"c3e998c2ab8c337869846b9c37e50768833ceaf92373abc69bf7878b62d68e32","expense_integrity()":"4129c18337dbadea7e773f0cd31c13b4e2bfb08eaeb6c1bdfe91f2f106426e5e","finance078_active()":"407aac4bc85656987f8b753274e644d0153898ededf69aec7bbd2cc22c967472","payout_assert(uuid)":"c7f8684536896c4433617f55c610ec8bc09b2795521a39040bdf6fb1efad29cd","payroll089_protect()":"56f297a46776fae83f048d31b2f2d55d5c7015ad21c40a5c5de44061d2b60603","payroll089_read(uuid)":"0d625c26dfc35f6bba3d180b9fe082d4722a18b40724dae81c1402f9500f62f2","get_finance_payees(text)":"99ab395676e91cde4586be889bb4fe44695aecebb653251a0a509f3c3f63b190","payroll089_link_assert()":"3931af8ae23deb84a4e9924f4b8b27614d9a57c5bfd0467adb0f55b27a5ff1b5","payroll089_sources(date)":"0506dd200dfc4ec6e9cc4119a6484de10a534c80b2b49433c5db5e76611c90ba","tax_position_immutable()":"86e13623d94afef28ee3f3439462e1f77bfb5a39e9b9aa7219fba9f5a44b7cd7","payroll089_payment_guard()":"5b477ef49cc9231db61ed7f96b57f7092624d5c991bb8a9d01ff9a9a5e1b991e","payroll089_period_assert()":"a22a6ed7d7dea305ec24fa412f729fa3154191126632da93a3dd5abd37e6bc51","payroll089_require_admin()":"df83f3fe5b7cf17debd782755feb22c42de8e90e181c91c139819c2516a23cfa","expense_payout_model_guard()":"1cce3a7f3c3ddff7f7af6d6c9e152fbc1d775c745a304173c512bb1fd9a7d6ba","get_finance_treasury(integer)":"c3218f5f9d617d1dbca7ebdcdb7c64eabd775133c0c2381e7eda06f270d9232e","payroll089_payment_assert(uuid)":"7dc42bf46ca2f6f0089e92924dba472eb4f92a983ef52d62631224fd43c08fec","payout_assert_before_expense(uuid)":"a7b74988ac9e62a34bbf8203802215e678969082ecf8f8fadebe8668d16bff81","payroll089_manage(text,jsonb,uuid)":"57f09fd5a393597513873ffbe9e96bcf7af7c10d255a3427ad204b81c3139235","protect_finance_cash_audit_event()":"354e2a156c638e082656682e734b08e159255d5ddb7d78be3315fc2c389c2d72","expense_payout_choice(uuid,boolean)":"824f97735cdb2de19b23a7f6c10fe1e68109b9a8b872ea4106dc9663552ca118","treasury_location_active(uuid,uuid)":"197f319835bbdc4ced7367443852305541fb49bfdee62b6cf27d744d439a9b43","finance078_require_payout(uuid,text)":"fd94022f03ca61f6e11324aa361b19f963fae4f79e57dbfa2adff754aea83482","expense_account_allowed(uuid,uuid,text)":"06a13aee3a8fc43ea1eeecdfc982f0ef9fec81e6d28000d0126d234ee377daf2","finance078_execution_account(uuid,uuid)":"2e12b4f4497748e9c2fed10df84094819c38b861f7746cdfb270e64e68c303d7","finance_bangkok_completed_day_end(date)":"b15561569e408875fcbacb331d621193d6c253500d3d51365151c3daaebf1b83","company_purchase_request_recipient(uuid)":"56cc4992d2b221f85b4dba9aba52bc656e9944ed21a922937f721e078a1bfebf","get_finance_expense_obligations(integer)":"ba01495deb6bc9dd34763db5025b38e21ff6a8ca1c55063320a8ea4183a590a5","company_purchase_request_declaration(uuid)":"52279e560e912ce5b4ced4bff6a6639403baa050a2ece9d6548f8a3378f700b8","get_finance_expenses(uuid,boolean,integer)":"b6edaad770683f3c2cd8f860576086420477ae667d24be8d0653375039fe1446","cancel_finance_payout(uuid,integer,boolean)":"1cfe3ac02b846c2081310e67fae1918101237b4f4887ab2d3502754f2516cd70","enforce_finance_cash_transaction_integrity()":"43118d6a578127049a27a6c8e7d4aa3e7d3d22ec050de90d1a9be009c22b626e","enforce_finance_cash_transaction_lifecycle()":"0a9dd77f19095aac6d42032c76380ded44e16cca505dba80b245d6924c69744d","finance_expense_payout_batch(text,jsonb,boolean)":"aee9ff9bf8b59cc6458cb51a3a9ed81775c13804b2180c75023ae413a977bab4","payroll089_payment_batch(text,jsonb,uuid,boolean)":"088b35740e3bc854ed8d237b280603bbbd49792c1e46e592608e0dd9d1e29720","validate_finance_cash_transaction_integrity(uuid)":"7f1efdafd4ad1a94f4050a90e9646623c3e3c8bc67a4c4a4edcdee27d1421e03","confirm_finance_payout(uuid,integer,integer,uuid,boolean)":"6feef0df974008d2bf241136399bfe1f33faf8236f676a2eb65982541893a8dd","record_finance_cash_transaction_audit_event(uuid,text,jsonb)":"5b71722654f0aec8f29f2218f4bd21ddf8b408ae0d029c98bddf4b853ca7c939","confirm_finance_expense_payout(uuid,integer,integer,uuid,boolean)":"2774122067a7f8a25b88376a51f79bb5dbd214e6cc0c266209a958a959504f07","get_finance_account_statement(uuid,uuid,date,date,text,text,integer)":"e80ee12f8fa546cfb04a864e91597d88363872f6e67ee528f0f7882ed8d208eb","prepare_finance_expense_payout(uuid,uuid,integer,date,uuid,uuid,boolean,text)":"025f58e4faeb384522a66868f7464d4238fc81168f3763a51acd43c2a96dcd08","payroll091_source(date,uuid)":"3b150c03dc27fe336fa5cb042a99bf8196f2ca4ec746bf055b47bc550d85bf7a","payroll091_month(date)":"6ebafee0080c1e6b8767d8af336bd2931597b601a530bc1af1f8d98699ebe0ff","payroll091_manage(text,date,jsonb,uuid,boolean)":"63f24b18334b7b04e0806640b19db402a2919485e376d96e9162961e6d51b351","payroll092_line_safe(uuid)":"fe27c0a6cf19d2062db538df23bd2990ba21d8ac05ef33df22bb4d4253373d65","payroll092_rate_lines(uuid)":"17b4842873676f7acc21d9cb0c6376c5c83d78a69c964c9e3a15fc9f0908705c","payroll092_state(uuid)":"b87be443c9e03108d6ba30b515a4f4722fe88ea72b6974ab2016e5a59bfad259","payroll092_read(date,uuid)":"cdd4621b329f47d4f9133adbcc4c19cd3c2b6fb4d80a0788e36ee0e8a3468758","payroll092_correct(text,uuid,uuid,text,text,uuid)":"b475dd2d3e4ba55bff88da3f3d10b7df89e7eb90e1ce3747b88c485addfc62a0"}'::jsonb or a->'tables' is distinct from '{"finance_payees":"9c2ead6e07c9bd0f144bf583536cda44bfbd64dc2207cd39ea183d2362d588fe","finance_payouts":"efa1afe6a226b3b4436b85f84528542b3c957638d79794a43065ef87aa791b8d","finance_expenses":"917cbb0c57b46f9c7f50c197440432d18571234d88633e2811c24d8c03bf9b9a","finance_payout_audit":"7df609d02f148630fab23a97200ce0ba257a3418220256b233b332ea29142eeb","finance_expense_audit":"45a29cf2419d86fb16b78eee6e03d72444cb059dadf790899cb3b40427526b8c","finance_payroll_audit":"29ecf1051429066b9bd8563083bbf4f3caff5aa762310c900c754c42102439f8","finance_payroll_lines":"519871cc3af963b91f3599577806b8727ae2b9980d433ec7f66cffcbfa947166","finance_payroll_rates":"04c023d16815d2596e6528686aca7f4cd87a0296035049dadb534714d6d099cb","finance_payroll_periods":"e0f164134a308370267ee2fb1adf0e78b7d5f35b8a06fe0b771a080bf72b1324","finance_payroll_payments":"2a25ba8e1115f98f1ade40998097a654d01675d8afdef1133c2e870ddb964c82","finance_payroll_requests":"d33d534baf3aa7c01c6f93c2d0fcc4c9285933e59969d77b112f7e2563ed61e0","finance_cash_transactions":"e2d5121c9ac25c3f0376edb129ea9f8fda37bd76c264951d122f9d74022d9239","finance_payee_destinations":"d6097c55137bf56a9f205e7eb97033313acd3e7ea122d8c0eccd3ffe3d44ccfc","finance_payout_allocations":"35644dbf266236a473a70bbc28469941a7af4092868fdf93809993ec37f00df8","finance_expense_obligations":"98fdf10a58d228cd7d301c52cfc82773e6d98eac973a6b6ef85fd4063003241b","finance_expense_settlements":"37ba9648f89a716172d10421da7fa2a5c4d0f35aa5725f53a1e31d2cc044e111","finance_expense_tax_reviews":"d482a46eacee0b020dd6a27546ce1e516f57a3a75c68567f0ed8cff852feef06","finance_payroll_engagements":"b04ab0bac055c4cec764a49f9590377ef392f1b6462cd20eee3f70bfca7b1e61","finance_payroll_obligations":"da620d735c89e06643535d10bfdf24bfdfdc05e52562f95a45af84fdf2d8e1a4","finance_account_opening_balances":"05a9bc63cd712438b0d99b37921b0efaf887f8bc9b839bc2150f7c72ba340169","finance_outgoing_wht_obligations":"cb4a49517f0968e79a5563acfd6bc9e007f97ff570ceb5ce27794dca609279a9","finance_expense_obligation_waivers":"6b183eda4ff5624b47a8ecb3ddf47f04cee6d59dbbd6510b09186c325ca65f56","finance_treasury_account_authorities":"adf6d6175069b61012c72be98de01173bcb29b01de7904385a8880c43dd65029","finance_cash_transaction_audit_events":"7b69a3ba60802d3ca786f49300e8303b772a2b30cc9df217d63a1330d9f4d089"}'::jsonb then raise exception 'PAYROLL092_INSTALLED_CONTRACT_FAILED';end if;
end;$preserve$;
COMMIT;
