-- 089 P1 candidate. HUMAN MIGRATION GATE. No business DML/backfill/seed.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
DO $locks$ declare r record; begin
 if current_user<>'postgres' then raise exception 'PAYROLL_OWNER_REQUIRED';end if;
 for r in select c.oid::regclass rel from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') order by c.oid loop execute format('LOCK TABLE %s IN SHARE MODE',r.rel);end loop;
end;$locks$;
CREATE TEMP TABLE payroll089_before ON COMMIT DROP AS select jsonb_build_object('functions',(select coalesce(jsonb_object_agg(v->>'signature',encode(sha256(convert_to((v)::text,'UTF8')),'hex')),'{}') from (select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'security_definer',p.prosecdef,'config',p.proconfig,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text COLLATE "C"),'[]') value
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname in ('finance078_active','finance078_admin','finance078_require_payout','finance078_execution_account','expense_account_allowed','treasury_location_active','prepare_finance_expense_payout','confirm_finance_expense_payout','confirm_finance_payout','cancel_finance_payout','expense_payout_choice','payout_assert','payout_integrity','get_finance_expenses','get_finance_expense_obligations','get_finance_account_statement','company_purchase_request_recipient','company_purchase_request_declaration','finance_bangkok_completed_day_end','record_finance_cash_transaction_audit_event','expense_payout_model_guard','expense_integrity','validate_finance_cash_transaction_integrity','enforce_finance_cash_transaction_integrity','protect_finance_cash_audit_event','payout_immutable','get_finance_payees','payout_assert_before_expense','enforce_finance_cash_transaction_lifecycle','tax_position_immutable','get_finance_treasury','finance_expense_payout_batch','payroll089_require_admin','payroll089_protect','payroll089_sources','payroll089_manage','payroll089_payment_guard','payroll089_payment_assert','payroll089_payment_batch','payroll089_read','payroll089_period_assert','payroll089_link_assert')) f,jsonb_array_elements(f.value) x(v)),'tables',(select coalesce(jsonb_object_agg(v->>'name',encode(sha256(convert_to((v)::text,'UTF8')),'hex')),'{}') from (select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'acl',a.attacl::text,'generated',a.attgenerated,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum),'[]') from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid),'validated',convalidated) order by conname COLLATE "C"),'[]') from pg_constraint where conrelid=c.oid and contype<>'n'),
 'indexes',(select coalesce(jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) order by indexname COLLATE "C"),'[]') from pg_indexes where schemaname='public' and tablename=c.relname),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by policyname COLLATE "C"),'[]') from pg_policies p where schemaname='public' and tablename=c.relname),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) order by tgname COLLATE "C"),'[]') from pg_trigger where tgrelid=c.oid and not tgisinternal),
 'anon_select',has_table_privilege('anon',c.oid,'SELECT'),'authenticated_write',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'),
 'service_select',has_table_privilege('service_role',c.oid,'SELECT')) order by c.relname COLLATE "C"),'[]') value
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v') and c.relname in ('finance_expenses','finance_expense_settlements','finance_expense_obligations','finance_expense_tax_reviews','finance_expense_audit','finance_expense_obligation_waivers','finance_payouts','finance_payout_allocations','finance_payout_audit','finance_cash_transactions','finance_cash_transaction_audit_events','finance_outgoing_wht_obligations','finance_payees','finance_payee_destinations','finance_account_opening_balances','finance_treasury_account_authorities','finance_payroll_engagements','finance_payroll_rates','finance_payroll_periods','finance_payroll_lines','finance_payroll_obligations','finance_payroll_payments','finance_payroll_requests','finance_payroll_audit')) f,jsonb_array_elements(f.value) x(v)),'rows',(select coalesce(jsonb_object_agg(name,jsonb_build_object('count',(xpath('/row/n/text()',x))[1]::text::bigint,'sha256',(xpath('/row/h/text()',x))[1]::text)),'{}') from (
 select c.relname name,query_to_xml(format('select count(*) n,encode(sha256(convert_to(coalesce(string_agg((%s)::text,E''\n'' order by (%s)::text COLLATE "C"),''''),''UTF8'')),''hex'') h from public.%I t',
 'to_jsonb(t)',
 'to_jsonb(t)',c.relname),true,true,'') x
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') and (c.relname like 'finance\_%' escape '\' or c.relname in ('user_profiles','case_audit_logs','document_numbering_profiles')) and c.relname not in ('finance_payroll_engagements','finance_payroll_rates','finance_payroll_periods','finance_payroll_lines','finance_payroll_obligations','finance_payroll_payments','finance_payroll_requests','finance_payroll_audit')) captured),'preserved',(select jsonb_build_object('tables',(select value from (select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'acl',a.attacl::text,'generated',a.attgenerated,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum),'[]') from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid),'validated',convalidated) order by conname COLLATE "C"),'[]') from pg_constraint where conrelid=c.oid and contype<>'n'),
 'indexes',(select coalesce(jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) order by indexname COLLATE "C"),'[]') from pg_indexes where schemaname='public' and tablename=c.relname),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by policyname COLLATE "C"),'[]') from pg_policies p where schemaname='public' and tablename=c.relname),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) order by tgname COLLATE "C"),'[]') from pg_trigger where tgrelid=c.oid and not tgisinternal),
 'anon_select',has_table_privilege('anon',c.oid,'SELECT'),'authenticated_write',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'),
 'service_select',has_table_privilege('service_role',c.oid,'SELECT')) order by c.relname COLLATE "C"),'[]') value
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v') and c.relname not in ('finance_payroll_engagements','finance_payroll_rates','finance_payroll_periods','finance_payroll_lines','finance_payroll_obligations','finance_payroll_payments','finance_payroll_requests','finance_payroll_audit','finance_payouts')) t),'functions',(select value from (select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'security_definer',p.prosecdef,'config',p.proconfig,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text COLLATE "C"),'[]') value
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname not in ('payroll089_require_admin','payroll089_protect','payroll089_sources','payroll089_manage','payroll089_payment_guard','payroll089_payment_assert','payroll089_payment_batch','payroll089_read','payroll089_period_assert','payroll089_link_assert','payout_assert','get_finance_account_statement')) f),'defaults',(select coalesce(jsonb_agg(to_jsonb(d)-'oid' order by defaclrole,defaclnamespace,defaclobjtype),'[]') from pg_default_acl d),'views',(select coalesce(jsonb_object_agg(c.relname,pg_get_viewdef(c.oid,true)),'{}') from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v'))),'new_row_count',(select coalesce(sum((xpath('/row/n/text()',x))[1]::text::bigint),0) from (select query_to_xml(format('select count(*) n from public.%I',c.relname),true,true,'') x from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('finance_payroll_engagements','finance_payroll_rates','finance_payroll_periods','finance_payroll_lines','finance_payroll_obligations','finance_payroll_payments','finance_payroll_requests','finance_payroll_audit') and c.relkind='r') n)) state;
DO $guard$ declare s jsonb;begin
 select state into s from payroll089_before;
 if s->'functions' is distinct from '{"cancel_finance_payout(uuid,integer,boolean)":"1cfe3ac02b846c2081310e67fae1918101237b4f4887ab2d3502754f2516cd70","company_purchase_request_declaration(uuid)":"52279e560e912ce5b4ced4bff6a6639403baa050a2ece9d6548f8a3378f700b8","company_purchase_request_recipient(uuid)":"56cc4992d2b221f85b4dba9aba52bc656e9944ed21a922937f721e078a1bfebf","confirm_finance_expense_payout(uuid,integer,integer,uuid,boolean)":"2774122067a7f8a25b88376a51f79bb5dbd214e6cc0c266209a958a959504f07","confirm_finance_payout(uuid,integer,integer,uuid,boolean)":"6feef0df974008d2bf241136399bfe1f33faf8236f676a2eb65982541893a8dd","enforce_finance_cash_transaction_integrity()":"43118d6a578127049a27a6c8e7d4aa3e7d3d22ec050de90d1a9be009c22b626e","expense_account_allowed(uuid,uuid,text)":"06a13aee3a8fc43ea1eeecdfc982f0ef9fec81e6d28000d0126d234ee377daf2","expense_integrity()":"4129c18337dbadea7e773f0cd31c13b4e2bfb08eaeb6c1bdfe91f2f106426e5e","expense_payout_choice(uuid,boolean)":"824f97735cdb2de19b23a7f6c10fe1e68109b9a8b872ea4106dc9663552ca118","expense_payout_model_guard()":"1cce3a7f3c3ddff7f7af6d6c9e152fbc1d775c745a304173c512bb1fd9a7d6ba","finance078_active()":"407aac4bc85656987f8b753274e644d0153898ededf69aec7bbd2cc22c967472","finance078_admin()":"b8e378c9afe8476d59a67fa626abeab1386c78101c94dd242a43ad81918eef8b","finance078_execution_account(uuid,uuid)":"2e12b4f4497748e9c2fed10df84094819c38b861f7746cdfb270e64e68c303d7","finance078_require_payout(uuid,text)":"fd94022f03ca61f6e11324aa361b19f963fae4f79e57dbfa2adff754aea83482","finance_bangkok_completed_day_end(date)":"b15561569e408875fcbacb331d621193d6c253500d3d51365151c3daaebf1b83","get_finance_account_statement(uuid,uuid,date,date,text,text,integer)":"1b636e34786028f336ae31682df492718174281ee7e650880e061e238d2cd468","get_finance_expense_obligations(integer)":"ba01495deb6bc9dd34763db5025b38e21ff6a8ca1c55063320a8ea4183a590a5","get_finance_expenses(uuid,boolean,integer)":"b6edaad770683f3c2cd8f860576086420477ae667d24be8d0653375039fe1446","payout_assert(uuid)":"cfe8c3094eb4061ca9f5b36b4c0eae3b35ecc111f947cbf07f4d33965fd4f3c9","payout_integrity()":"c3e998c2ab8c337869846b9c37e50768833ceaf92373abc69bf7878b62d68e32","prepare_finance_expense_payout(uuid,uuid,integer,date,uuid,uuid,boolean,text)":"025f58e4faeb384522a66868f7464d4238fc81168f3763a51acd43c2a96dcd08","protect_finance_cash_audit_event()":"354e2a156c638e082656682e734b08e159255d5ddb7d78be3315fc2c389c2d72","record_finance_cash_transaction_audit_event(uuid,text,jsonb)":"5b71722654f0aec8f29f2218f4bd21ddf8b408ae0d029c98bddf4b853ca7c939","treasury_location_active(uuid,uuid)":"197f319835bbdc4ced7367443852305541fb49bfdee62b6cf27d744d439a9b43","validate_finance_cash_transaction_integrity(uuid)":"7f1efdafd4ad1a94f4050a90e9646623c3e3c8bc67a4c4a4edcdee27d1421e03","finance_expense_payout_batch(text,jsonb,boolean)":"aee9ff9bf8b59cc6458cb51a3a9ed81775c13804b2180c75023ae413a977bab4","enforce_finance_cash_transaction_lifecycle()":"0a9dd77f19095aac6d42032c76380ded44e16cca505dba80b245d6924c69744d","get_finance_payees(text)":"99ab395676e91cde4586be889bb4fe44695aecebb653251a0a509f3c3f63b190","get_finance_treasury(integer)":"c3218f5f9d617d1dbca7ebdcdb7c64eabd775133c0c2381e7eda06f270d9232e","payout_assert_before_expense(uuid)":"a7b74988ac9e62a34bbf8203802215e678969082ecf8f8fadebe8668d16bff81","payout_immutable()":"e86bcbef710b3e7411740099b976a0835b4d2727967cc38ef69f68fa5807e7a1","tax_position_immutable()":"86e13623d94afef28ee3f3439462e1f77bfb5a39e9b9aa7219fba9f5a44b7cd7"}'::jsonb or s->'tables' is distinct from '{"finance_account_opening_balances":"05a9bc63cd712438b0d99b37921b0efaf887f8bc9b839bc2150f7c72ba340169","finance_cash_transaction_audit_events":"7b69a3ba60802d3ca786f49300e8303b772a2b30cc9df217d63a1330d9f4d089","finance_cash_transactions":"e2d5121c9ac25c3f0376edb129ea9f8fda37bd76c264951d122f9d74022d9239","finance_expense_audit":"45a29cf2419d86fb16b78eee6e03d72444cb059dadf790899cb3b40427526b8c","finance_expense_obligation_waivers":"6b183eda4ff5624b47a8ecb3ddf47f04cee6d59dbbd6510b09186c325ca65f56","finance_expense_obligations":"98fdf10a58d228cd7d301c52cfc82773e6d98eac973a6b6ef85fd4063003241b","finance_expense_settlements":"37ba9648f89a716172d10421da7fa2a5c4d0f35aa5725f53a1e31d2cc044e111","finance_expense_tax_reviews":"d482a46eacee0b020dd6a27546ce1e516f57a3a75c68567f0ed8cff852feef06","finance_expenses":"917cbb0c57b46f9c7f50c197440432d18571234d88633e2811c24d8c03bf9b9a","finance_outgoing_wht_obligations":"cb4a49517f0968e79a5563acfd6bc9e007f97ff570ceb5ce27794dca609279a9","finance_payee_destinations":"d6097c55137bf56a9f205e7eb97033313acd3e7ea122d8c0eccd3ffe3d44ccfc","finance_payees":"9c2ead6e07c9bd0f144bf583536cda44bfbd64dc2207cd39ea183d2362d588fe","finance_payout_allocations":"35644dbf266236a473a70bbc28469941a7af4092868fdf93809993ec37f00df8","finance_payout_audit":"7df609d02f148630fab23a97200ce0ba257a3418220256b233b332ea29142eeb","finance_payouts":"8fec676ea427b55fa646ad8e8d8000001a59697b839703b4751c1440b71e4d0c","finance_treasury_account_authorities":"adf6d6175069b61012c72be98de01173bcb29b01de7904385a8880c43dd65029"}'::jsonb then raise exception 'PAYROLL_ACCEPTED_088_CONTRACT_DRIFT';end if;
 if exists(select 1 from pg_class where relnamespace='public'::regnamespace and left(relname,16)='finance_payroll_') or exists(select 1 from pg_proc where pronamespace='public'::regnamespace and left(proname,11)='payroll089_') then raise exception 'PAYROLL_ALREADY_PRESENT';end if;
end;$guard$;
-- 089 P1: private compensation facts; existing Payout/Cash remains the money ledger.
-- No seed, backfill, automatic rate/tax calculation, or historical financial DML.
create table public.finance_payroll_engagements (
 id uuid primary key, payee_id uuid not null references public.finance_payees(id),
 kind text not null check(kind in ('employee','contractor')), active boolean not null,
 effective_from date not null, reason text not null check(length(btrim(reason)) between 1 and 2000),
 created_by uuid not null references public.user_profiles(id), created_at timestamptz not null default now(),
 unique(payee_id,effective_from)
);
create table public.finance_payroll_rates (
 id uuid primary key, payee_id uuid not null references public.finance_payees(id),
 effective_from date not null, monthly_amount numeric(14,2) not null check(monthly_amount>0),
 reason text not null check(length(btrim(reason)) between 1 and 2000),
 created_by uuid not null references public.user_profiles(id), created_at timestamptz not null default now(),
 unique(payee_id,effective_from)
);
-- Effective_to is derived from the next event. Unique start + half-open intervals
-- prevents overlap without updating/shortening any historical event.
create table public.finance_payroll_periods (
 id uuid primary key, month date not null unique check(month=date_trunc('month',month)::date),
 target_payment_date date not null, note text not null default '' check(length(note)<=2000),
 status text not null default 'draft' check(status in ('draft','approved')),
 version integer not null default 1 check(version>0),
 created_by uuid not null references public.user_profiles(id), created_at timestamptz not null default now(),
 approved_by uuid references public.user_profiles(id), approved_at timestamptz,
 check((status='approved')=(approved_by is not null and approved_at is not null))
);
create table public.finance_payroll_lines (
 id uuid primary key, period_id uuid not null references public.finance_payroll_periods(id),
 payee_id uuid not null references public.finance_payees(id),
 engagement_id uuid not null references public.finance_payroll_engagements(id),
 rate_id uuid not null references public.finance_payroll_rates(id),
 kind text not null check(kind in ('employee','contractor')),
 service_from date not null, service_to date not null check(service_to>=service_from),
 base_amount numeric(14,2) not null check(base_amount>=0),
 additions numeric(14,2) not null default 0 check(additions>=0),
 deductions numeric(14,2) not null default 0 check(deductions>=0),
 employee_ss numeric(14,2) not null default 0 check(employee_ss>=0),
 employer_ss numeric(14,2) not null default 0 check(employer_ss>=0),
 wht_treatment text not null default 'none' check(wht_treatment in ('none','withhold')),
 wht_amount numeric(14,2) not null default 0 check(wht_amount>=0),
 gross_amount numeric(14,2) generated always as (base_amount+additions) stored,
 net_amount numeric(14,2) generated always as (base_amount+additions-deductions-employee_ss-wht_amount) stored,
 adjustment_reason text not null default '' check(length(adjustment_reason)<=2000),
 note text not null default '' check(length(note)<=2000),
 requires_base_review boolean not null default false, reviewed boolean not null default false,
 source_json jsonb not null check(jsonb_typeof(source_json)='object'), frozen_json jsonb,
 unique(period_id,engagement_id), unique(period_id,payee_id),
 check(kind='employee' or (employee_ss=0 and employer_ss=0)),
 check((wht_treatment='none' and wht_amount=0) or (wht_treatment='withhold' and wht_amount>0)),
 check(base_amount+additions-deductions-employee_ss-wht_amount>=0)
);
create table public.finance_payroll_obligations (
 id uuid primary key default gen_random_uuid(), period_id uuid not null references public.finance_payroll_periods(id),
 line_id uuid not null references public.finance_payroll_lines(id),
 kind text not null check(kind in ('employee_wht','employee_ss','employer_ss','contractor_wht')),
 amount numeric(14,2) not null check(amount>0), currency text not null default 'THB' check(currency='THB'),
 status text not null default 'pending' check(status='pending'),
 source_json jsonb not null check(jsonb_typeof(source_json)='object'),
 created_at timestamptz not null default now(), unique(line_id,kind)
);
-- P1 obligations are pending only. A later additive, reviewed remittance contract
-- must link actual cash before introducing a remitted status. No manual paid flag.
create table public.finance_payroll_payments (
 payout_id uuid primary key references public.finance_payouts(id),
 line_id uuid not null references public.finance_payroll_lines(id),
 status text not null check(status in ('draft','confirmed','cancelled')),
 prepare_json jsonb not null, confirm_json jsonb,
 created_at timestamptz not null default now()
);
create unique index payroll_one_live_payment on public.finance_payroll_payments(line_id) where status<>'cancelled';
create table public.finance_payroll_requests (
 id uuid primary key, actor_id uuid not null references public.user_profiles(id), action text not null,
 payload jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
create table public.finance_payroll_audit (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique references public.finance_payroll_requests(id),
 actor_id uuid not null references public.user_profiles(id), action text not null,
 evidence_json jsonb not null, created_at timestamptz not null default now()
);

create function public.payroll089_require_admin() returns void language plpgsql stable security definer set search_path=public as $$
begin if not public.finance078_admin() then raise exception 'PAYROLL_ADMIN_REQUIRED'; end if; end; $$;
create function public.payroll089_protect() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform public.payroll089_require_admin();
 if tg_op='TRUNCATE' then raise exception 'PAYROLL_HISTORY_IMMUTABLE'; end if;
 if tg_table_name='finance_payroll_periods' then
  if tg_op='UPDATE' and old.status='draft' and new.version=old.version+1
   and (to_jsonb(old)-array['status','version','approved_by','approved_at','target_payment_date','note'])=(to_jsonb(new)-array['status','version','approved_by','approved_at','target_payment_date','note']) then return new; end if;
 elsif tg_table_name='finance_payroll_lines' then
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

-- Returns deterministic eligible segments and their effective rate, never inferred
-- from login active state. Mid-month changes require explicit reviewed base facts.
create function public.payroll089_sources(p_month date) returns jsonb language sql stable security definer set search_path=public as $$
 with engagements as (
  select e.*,coalesce(lead(effective_from) over(partition by payee_id order by effective_from),'infinity'::date) until_date
  from finance_payroll_engagements e
 ), eligible as (
  select e.*,greatest(p_month,e.effective_from) service_from,least((p_month+interval '1 month')::date,e.until_date)-1 service_to
  from engagements e where e.active and e.effective_from<(p_month+interval '1 month')::date and e.until_date>p_month
 ), sources as (
  select e.id engagement_id,e.payee_id,e.kind,e.service_from,e.service_to,r.id rate_id,r.monthly_amount,
   jsonb_build_object('engagement',to_jsonb(e)-array['until_date','service_from','service_to'],
    'rate',to_jsonb(r),'service_from',e.service_from,'service_to',e.service_to,
    'rate_changes',(select coalesce(jsonb_agg(to_jsonb(x) order by effective_from),'[]') from finance_payroll_rates x where x.payee_id=e.payee_id and x.effective_from>e.service_from and x.effective_from<=e.service_to)) source_json,
   (e.service_from<>p_month or e.service_to<>(p_month+interval '1 month')::date-1
    or exists(select 1 from finance_payroll_rates x where x.payee_id=e.payee_id and x.effective_from>e.service_from and x.effective_from<=e.service_to)) requires_base_review
  from eligible e left join lateral(select * from finance_payroll_rates r where r.payee_id=e.payee_id and r.effective_from<=e.service_from order by effective_from desc limit 1) r on true
 ) select coalesce(jsonb_agg(to_jsonb(s) order by payee_id,service_from),'[]') from sources s;
$$;

create function public.payroll089_manage(p_action text,p_payload jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare req public.finance_payroll_requests%rowtype; p public.finance_payroll_periods%rowtype; l public.finance_payroll_lines%rowtype;
 e public.finance_payroll_engagements%rowtype; payee public.finance_payees%rowtype; source jsonb; sources jsonb; result jsonb;
 item jsonb; new_id uuid; effective date; month_date date; amount numeric; snapshot jsonb;
begin
 perform public.payroll089_require_admin();
 if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>100000 then raise exception 'PAYROLL_INPUT_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll089',0));
 select * into req from finance_payroll_requests where id=p_request_id;
 if req.id is not null then
  if req.actor_id<>auth.uid() or req.action<>p_action or req.payload<>p_payload then raise exception 'PAYROLL_RETRY_CHANGED'; end if;
  return req.result;
 end if;
 if p_action in ('engagement','rate') then
  new_id:=(p_payload->>'id')::uuid;effective:=(p_payload->>'effective_from')::date;
  select * into payee from finance_payees where id=(p_payload->>'payee_id')::uuid for share;
  if new_id is null or effective is null or payee.id is null or payee.entity_type<>'natural_person'
   or length(btrim(coalesce(p_payload->>'reason',''))) not between 1 and 2000 then raise exception 'PAYROLL_PERSON_INVALID'; end if;
  if exists(select 1 from finance_payroll_lines x join finance_payroll_periods z on z.id=x.period_id where x.payee_id=payee.id and z.status='approved' and effective<(z.month+interval '1 month')::date)
   then raise exception 'PAYROLL_APPROVED_HISTORY'; end if;
  if p_action='engagement' then
   if p_payload->>'kind'='employee' and payee.profile_id is null then raise exception 'PAYROLL_EMPLOYEE_IDENTITY_REQUIRED'; end if;
   insert into finance_payroll_engagements(id,payee_id,kind,active,effective_from,reason,created_by)
    values(new_id,payee.id,p_payload->>'kind',(p_payload->>'active')::boolean,effective,p_payload->>'reason',auth.uid());
  else
   if coalesce(p_payload->>'monthly_amount','')!~'^[0-9]{1,12}(\.[0-9]{1,2})?$' then raise exception 'PAYROLL_INPUT_INVALID';end if;
   insert into finance_payroll_rates(id,payee_id,effective_from,monthly_amount,reason,created_by)
    values(new_id,payee.id,effective,(p_payload->>'monthly_amount')::numeric,p_payload->>'reason',auth.uid());
  end if;
  result:=jsonb_build_object('id',new_id);
 elsif p_action='create_period' then
  new_id:=(p_payload->>'id')::uuid;month_date:=(p_payload->>'month')::date;
  if new_id is null or month_date is null or month_date<>date_trunc('month',month_date)::date then raise exception 'PAYROLL_MONTH_INVALID'; end if;
  insert into finance_payroll_periods(id,month,target_payment_date,note,created_by)
   values(new_id,month_date,(p_payload->>'target_payment_date')::date,coalesce(p_payload->>'note',''),auth.uid()) returning * into p;
  sources:=public.payroll089_sources(p.month);
  if jsonb_array_length(sources)=0 then raise exception 'PAYROLL_NO_ELIGIBLE_PEOPLE'; end if;
  if (select count(distinct value->>'payee_id') from jsonb_array_elements(sources))<>jsonb_array_length(sources) then raise exception 'PAYROLL_MIXED_ENGAGEMENT_MONTH';end if;
  for source in select value from jsonb_array_elements(sources) loop
   if source->>'rate_id' is null then raise exception 'PAYROLL_RATE_MISSING: %',source->>'payee_id'; end if;
   insert into finance_payroll_lines(id,period_id,payee_id,engagement_id,rate_id,kind,service_from,service_to,base_amount,source_json,requires_base_review)
    values(gen_random_uuid(),p.id,(source->>'payee_id')::uuid,(source->>'engagement_id')::uuid,(source->>'rate_id')::uuid,source->>'kind',
     (source->>'service_from')::date,(source->>'service_to')::date,(source->>'monthly_amount')::numeric,source->'source_json',(source->>'requires_base_review')::boolean);
  end loop;
  result:=jsonb_build_object('id',p.id,'version',p.version);
 elsif p_action in ('line','approve','period','reload_period') then
  select * into p from finance_payroll_periods where id=(p_payload->>'period_id')::uuid for update;
  if p.id is null or p.status<>'draft' or p.version is distinct from (p_payload->>'version')::integer then raise exception 'PAYROLL_STALE_OR_FROZEN'; end if;
  if p_action='line' then
   select * into l from finance_payroll_lines where id=(p_payload->>'line_id')::uuid and period_id=p.id for update;
   if l.id is null then raise exception 'PAYROLL_LINE_INVALID'; end if;
   for item in select to_jsonb(k) from unnest(array['base_amount','additions','deductions','employee_ss','employer_ss','wht_amount']) k loop
    if coalesce(p_payload->>(item#>>'{}'),'')!~'^[0-9]{1,12}(\.[0-9]{1,2})?$' then raise exception 'PAYROLL_INPUT_INVALID';end if;
   end loop;
   amount:=(p_payload->>'base_amount')::numeric;
   if (l.requires_base_review or amount is distinct from (l.source_json#>>'{rate,monthly_amount}')::numeric)
    and length(btrim(coalesce(p_payload->>'adjustment_reason','')))=0 then raise exception 'PAYROLL_BASE_REASON_REQUIRED'; end if;
   if length(btrim(coalesce(p_payload->>'note','')))=0 then raise exception 'PAYROLL_REVIEW_EVIDENCE_REQUIRED'; end if;
   update finance_payroll_lines set base_amount=amount,additions=(p_payload->>'additions')::numeric,deductions=(p_payload->>'deductions')::numeric,
    employee_ss=(p_payload->>'employee_ss')::numeric,employer_ss=(p_payload->>'employer_ss')::numeric,
    wht_treatment=p_payload->>'wht_treatment',wht_amount=(p_payload->>'wht_amount')::numeric,
    adjustment_reason=coalesce(p_payload->>'adjustment_reason',''),note=p_payload->>'note',reviewed=true where id=l.id;
  elsif p_action='reload_period' then
   if p_payload->>'acknowledged' is distinct from 'true' then raise exception 'PAYROLL_APPROVAL_ACK_REQUIRED'; end if;
   sources:=public.payroll089_sources(p.month);
   if jsonb_array_length(sources)=0 then raise exception 'PAYROLL_NO_ELIGIBLE_PEOPLE';end if;
   if (select count(distinct value->>'payee_id') from jsonb_array_elements(sources))<>jsonb_array_length(sources) then raise exception 'PAYROLL_MIXED_ENGAGEMENT_MONTH';end if;
   delete from finance_payroll_lines where period_id=p.id;
   for source in select value from jsonb_array_elements(sources) loop
    if source->>'rate_id' is null then raise exception 'PAYROLL_RATE_MISSING';end if;
    insert into finance_payroll_lines(id,period_id,payee_id,engagement_id,rate_id,kind,service_from,service_to,base_amount,source_json,requires_base_review)
     values(gen_random_uuid(),p.id,(source->>'payee_id')::uuid,(source->>'engagement_id')::uuid,(source->>'rate_id')::uuid,source->>'kind',
      (source->>'service_from')::date,(source->>'service_to')::date,(source->>'monthly_amount')::numeric,source->'source_json',(source->>'requires_base_review')::boolean);
   end loop;
   update finance_payroll_periods set version=version+1 where id=p.id;
  elsif p_action='period' then
   update finance_payroll_periods set target_payment_date=(p_payload->>'target_payment_date')::date,note=coalesce(p_payload->>'note',''),version=version+1 where id=p.id;
  else
   if p_payload->>'acknowledged' is distinct from 'true' then raise exception 'PAYROLL_APPROVAL_ACK_REQUIRED'; end if;
   sources:=public.payroll089_sources(p.month);
   if jsonb_array_length(sources)<>(select count(*) from finance_payroll_lines where period_id=p.id)
    or exists(select 1 from jsonb_array_elements(sources) s where not exists(select 1 from finance_payroll_lines x where x.period_id=p.id and x.engagement_id=(s->>'engagement_id')::uuid and x.source_json=s->'source_json'))
    then raise exception 'PAYROLL_DRAFT_SOURCES_CHANGED'; end if;
   if exists(select 1 from finance_payroll_lines where period_id=p.id and (not reviewed or net_amount<0 or (requires_base_review and btrim(adjustment_reason)='')))
    then raise exception 'PAYROLL_REVIEW_REQUIRED'; end if;
   for l in select * from finance_payroll_lines where period_id=p.id order by id loop
    select * into payee from finance_payees where id=l.payee_id for share;
    if payee.id is null or not payee.is_active or (l.wht_amount>0 and payee.tax_id is null) then raise exception 'PAYROLL_PAYEE_OR_TAX_ID_REQUIRED'; end if;
    snapshot:=to_jsonb(l)-'frozen_json'||jsonb_build_object('payee',jsonb_build_object('id',payee.id,'profile_id',payee.profile_id,'legal_name',payee.legal_name,'tax_id',payee.tax_id),'month',p.month,'approved_by',auth.uid());
    update finance_payroll_lines set frozen_json=snapshot where id=l.id;
    for item in select jsonb_build_object('kind',kind,'amount',value) from (values
     (case l.kind when 'employee' then 'employee_wht' else 'contractor_wht' end,l.wht_amount),('employee_ss',l.employee_ss),('employer_ss',l.employer_ss)) v(kind,value) where value>0 loop
     insert into finance_payroll_obligations(period_id,line_id,kind,amount,source_json) values(p.id,l.id,item->>'kind',(item->>'amount')::numeric,snapshot);
    end loop;
   end loop;
   update finance_payroll_periods set status='approved',approved_by=auth.uid(),approved_at=clock_timestamp(),version=version+1 where id=p.id;
  end if;
  if p_action='line' then update finance_payroll_periods set version=version+1 where id=p.id; end if;
  result:=jsonb_build_object('id',p.id,'version',p.version+1);
 else raise exception 'PAYROLL_ACTION_INVALID'; end if;
 insert into finance_payroll_requests(id,actor_id,action,payload,result) values(p_request_id,auth.uid(),p_action,p_payload,result);
 insert into finance_payroll_audit(request_id,actor_id,action,evidence_json) values(p_request_id,auth.uid(),p_action,jsonb_build_object('input',p_payload,'result',result));
 return result;
end; $$;

-- Settle the already NET compensation payable, not the private gross payroll.
-- Salary WHT/SS is already withheld in the approved line and lives in dedicated
-- obligations. Generic Payout gross=net payable, WHT=0; no second withholding.
alter table public.finance_payouts drop constraint finance_payouts_source_model_check;
alter table public.finance_payouts add constraint finance_payouts_source_model_check check(source_model in ('revenue_distribution_v1','expense_v1','payroll_v1'));

create function public.payroll089_payment_guard() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.source_model='payroll_v1' then
  perform public.payroll089_require_admin();
  if new.note<>'' or new.wht_amount<>0 or new.gross_amount<>new.net_amount then raise exception 'PAYROLL_PAYMENT_PRIVATE_FACTS'; end if;
 end if;
 return new;
end; $$;
create trigger payroll089_payment_guard before insert or update on public.finance_payouts for each row execute function public.payroll089_payment_guard();

create function public.payroll089_payment_assert(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare p public.finance_payouts%rowtype; link public.finance_payroll_payments%rowtype;l public.finance_payroll_lines%rowtype; c public.finance_cash_transactions%rowtype; expected jsonb;
begin
 select * into p from finance_payouts where id=p_id;
 select * into link from finance_payroll_payments where payout_id=p_id;
 select * into l from finance_payroll_lines where id=link.line_id;
 expected:=jsonb_build_array(jsonb_build_object('line_id',l.id,'payee_id',l.payee_id,'net',l.net_amount));
 if link.payout_id is null or l.frozen_json is null or p.status<>link.status or p.payee_id<>l.payee_id or p.net_amount<>l.net_amount
  or p.gross_amount<>l.net_amount or p.wht_amount<>0 or p.choices_json is distinct from expected or p.note<>''
  or exists(select 1 from finance_payout_allocations where payout_id=p_id)
  or exists(select 1 from finance_outgoing_wht_obligations where payout_source_id=p_id)
  then raise exception 'PAYROLL_PAYMENT_INTEGRITY'; end if;
 if p.status<>'confirmed' then
  if exists(select 1 from finance_cash_transactions where source_payout_id=p_id) or link.confirm_json is not null then raise exception 'PAYROLL_PAYMENT_INTEGRITY'; end if;
  return;
 end if;
 select * into c from finance_cash_transactions where source_payout_id=p_id;
 if c.id is null or c.status<>'confirmed' or c.direction<>'outflow' or c.cash_amount<>l.net_amount or c.currency<>'THB'
  or c.bank_account_id is distinct from p.bank_account_id or c.cash_location_id is distinct from p.cash_location_id
  or c.occurred_at<>public.finance_bangkok_completed_day_end(p.paid_on) or link.confirm_json is null
  or p.confirmed_snapshot_json->'choices' is distinct from expected
  or (p.confirmed_snapshot_json->>'net')::numeric is distinct from p.net_amount
  or p.confirmed_snapshot_json#>>'{payee,id}' is distinct from p.payee_id::text
  or (p.confirmed_snapshot_json->>'bank_account_id')::uuid is distinct from p.bank_account_id
  or (p.confirmed_snapshot_json->>'cash_location_id')::uuid is distinct from p.cash_location_id
  or (p.confirmed_snapshot_json->>'paid_on')::date is distinct from p.paid_on
  or not exists(select 1 from finance_payout_audit where payout_id=p_id and version=p.version and event_type='confirmed' and evidence_json=p.confirmed_snapshot_json)
  or not exists(select 1 from finance_cash_transaction_audit_events where cash_transaction_id=c.id and event_type='confirmed' and event_payload_json->'payout'=p.confirmed_snapshot_json)
  then raise exception 'PAYROLL_CASH_INTEGRITY'; end if;
end; $$;

create function public.payroll089_payment_batch(p_action text,p_items jsonb,p_request_id uuid,p_acknowledged boolean default false) returns jsonb language plpgsql security definer set search_path=public as $$
declare req public.finance_payroll_requests%rowtype; payload jsonb; item jsonb; result jsonb:='[]'; choice jsonb;
 l public.finance_payroll_lines%rowtype; p public.finance_payouts%rowtype; link public.finance_payroll_payments%rowtype;
 payee public.finance_payees%rowtype; dest public.finance_payee_destinations%rowtype; opening public.finance_account_opening_balances%rowtype;
 bank uuid; cash_location uuid; paid date; snapshot jsonb; cash uuid; ts timestamptz; new_id uuid;
begin
 perform public.payroll089_require_admin();
 if p_request_id is null or p_action not in ('prepare','confirm','cancel') or jsonb_typeof(p_items) is distinct from 'array'
  or jsonb_array_length(p_items) not between 1 and 50 or octet_length(p_items::text)>100000 then raise exception 'PAYROLL_BATCH_INVALID'; end if;
 if (select count(distinct value->>'line_id') from jsonb_array_elements(p_items))<>jsonb_array_length(p_items)
  or (select count(distinct value->>'payout_id') from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) then raise exception 'PAYROLL_DUPLICATE_ITEM'; end if;
 if p_action in ('confirm','cancel') and p_acknowledged is distinct from true then raise exception 'PAYROLL_ACTUAL_PAYMENT_ACK_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('payout_lifecycle',0));
 perform pg_advisory_xact_lock(hashtextextended('payroll089',0));
 select jsonb_build_object('items',jsonb_agg(value order by value->>'payout_id' COLLATE "C"),'acknowledged',p_acknowledged) into payload from jsonb_array_elements(p_items);
 select * into req from finance_payroll_requests where id=p_request_id;
 if req.id is not null then
  if req.actor_id<>auth.uid() or req.action<>'payment_'||p_action or req.payload<>payload then raise exception 'PAYROLL_RETRY_CHANGED'; end if;
  return req.result;
 end if;
 for item in select value from jsonb_array_elements(p_items) order by value->>'payout_id' COLLATE "C" loop
  new_id:=(item->>'payout_id')::uuid;
  select * into l from finance_payroll_lines where id=(item->>'line_id')::uuid for update;
  if l.id is null or l.frozen_json is null or l.net_amount<=0 then raise exception 'PAYROLL_NOT_PAYABLE'; end if;
  select * into payee from finance_payees where id=l.payee_id for share;
  select * into dest from finance_payee_destinations where payee_id=l.payee_id and is_active for share;
  if p_action<>'cancel' and (payee.is_active is distinct from true or payee.version is distinct from (item->>'payee_version')::integer) then raise exception 'PAYROLL_PAYEE_CHANGED'; end if;
  select * into p from finance_payouts where id=new_id for update;
  select * into link from finance_payroll_payments where payout_id=new_id for update;
  if p_action='prepare' then
   if p.id is not null or exists(select 1 from finance_payroll_payments where line_id=l.id and status<>'cancelled') then raise exception 'PAYROLL_ALREADY_PREPARED'; end if;
   bank:=(item->>'bank_account_id')::uuid;cash_location:=(item->>'cash_location_id')::uuid;paid:=(item->>'paid_on')::date;
   if not public.expense_account_allowed(bank,cash_location,'record_outflow') or not public.treasury_location_active(bank,cash_location) then raise exception 'PAYROLL_ACCOUNT_DENIED'; end if;
   if paid is null or (bank is not null and (dest.id is null or dest.id is distinct from (item->>'destination_id')::uuid)) then raise exception 'PAYROLL_DESTINATION_REQUIRED'; end if;
   choice:=jsonb_build_array(jsonb_build_object('line_id',l.id,'payee_id',l.payee_id,'net',l.net_amount));
   insert into finance_payouts(id,source_model,payee_id,paid_on,bank_account_id,cash_location_id,choices_json,gross_amount,wht_amount,net_amount,created_by,updated_by)
    values(new_id,'payroll_v1',l.payee_id,paid,bank,cash_location,choice,l.net_amount,0,l.net_amount,auth.uid(),auth.uid());
   insert into finance_payroll_payments(payout_id,line_id,status,prepare_json) values(new_id,l.id,'draft',item);
   insert into finance_payout_audit(payout_id,event_type,version,actor_id,evidence_json) values(new_id,'saved',1,auth.uid(),jsonb_build_object('choices',choice,'net',l.net_amount));
  else
   if p.id is null or link.line_id is distinct from l.id or p.source_model<>'payroll_v1' or p.status<>'draft'
    or p.version is distinct from (item->>'payout_version')::integer then raise exception 'PAYROLL_PAYMENT_STALE'; end if;
   if p_action='cancel' then
    update finance_payroll_payments set status='cancelled' where payout_id=p.id;
    perform public.cancel_finance_payout(p.id,p.version,true);
   else
    if not public.expense_account_allowed(p.bank_account_id,p.cash_location_id,'confirm_outflow') or not public.treasury_location_active(p.bank_account_id,p.cash_location_id) then raise exception 'PAYROLL_ACCOUNT_DENIED'; end if;
    if (link.prepare_json->>'payee_version')::integer<>payee.version or (p.bank_account_id is not null and
      (dest.id is null or dest.id is distinct from (item->>'destination_id')::uuid or dest.id is distinct from (link.prepare_json->>'destination_id')::uuid)) then raise exception 'PAYROLL_DESTINATION_CHANGED'; end if;
    perform pg_advisory_xact_lock(hashtextextended('finance_cash_cutover:THB',0));
    select * into opening from finance_account_opening_balances where bank_account_id is not distinct from p.bank_account_id
     and cash_location_id is not distinct from p.cash_location_id and currency='THB' and status='confirmed' for update;
    if opening.id is null then raise exception 'FINANCE_CASH_OPENING_BALANCE_REQUIRED'; end if;
    if public.finance_bangkok_completed_day_end(p.paid_on)<=opening.as_of then raise exception 'FINANCE_CASH_TRANSACTION_BEFORE_CUTOVER'; end if;
    ts:=clock_timestamp();
    snapshot:=jsonb_build_object('source_model','payroll_v1','choices',p.choices_json,'payee',jsonb_build_object('id',payee.id,'legal_name',payee.legal_name),
     'destination',case when p.bank_account_id is not null then jsonb_build_object('id',dest.id,'bank_name',dest.bank_name,'account_name',dest.account_name,'account_number',dest.account_number) end,
     'bank_account_id',p.bank_account_id,'cash_location_id',p.cash_location_id,'paid_on',p.paid_on,'currency','THB','net',p.net_amount,'opening_id',opening.id,'confirmed_by',auth.uid());
    update finance_payroll_payments set status='confirmed',confirm_json=item where payout_id=p.id;
    update finance_payouts set status='confirmed',version=version+1,confirmed_snapshot_json=snapshot,confirmed_by=auth.uid(),confirmed_at=ts,updated_at=ts,updated_by=auth.uid() where id=p.id;
    insert into finance_cash_transactions(occurred_at,direction,transaction_type,bank_account_id,cash_location_id,cash_amount,currency,status,source_payout_id,reference_no,description,created_by_user_id,updated_by_user_id,confirmed_at,confirmed_by_user_id)
     values(public.finance_bangkok_completed_day_end(p.paid_on),'outflow','other',p.bank_account_id,p.cash_location_id,p.net_amount,'THB','confirmed',p.id,upper(left(p.id::text,8)),
      'Compensation · '||payee.legal_name,auth.uid(),auth.uid(),ts,auth.uid()) returning id into cash;
    perform public.record_finance_cash_transaction_audit_event(cash,'confirmed',jsonb_build_object('payout_id',p.id,'payout',snapshot));
    insert into finance_payout_audit(payout_id,event_type,version,actor_id,evidence_json) values(p.id,'confirmed',p.version+1,auth.uid(),snapshot);
   end if;
  end if;
  perform public.payroll089_payment_assert(new_id);
  result:=result||jsonb_build_array(jsonb_build_object('line_id',l.id,'payout_id',new_id,'net',l.net_amount,'status',case p_action when 'prepare' then 'draft' when 'confirm' then 'confirmed' else 'cancelled' end));
 end loop;
 result:=jsonb_build_object('items',result);
 insert into finance_payroll_requests(id,actor_id,action,payload,result) values(p_request_id,auth.uid(),'payment_'||p_action,payload,result);
 insert into finance_payroll_audit(request_id,actor_id,action,evidence_json) values(p_request_id,auth.uid(),'payment_'||p_action,jsonb_build_object('input',payload,'result',result));
 return result;
end; $$;

create function public.payroll089_read(p_period uuid default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 perform public.payroll089_require_admin();
 return jsonb_build_object(
 'people_options',public.get_finance_payees(''),
 'people',(select coalesce(jsonb_agg(to_jsonb(x) order by x.legal_name COLLATE "C",x.id),'[]') from (
  select p.id,p.profile_id,p.legal_name,p.is_active,p.version,p.tax_id,
   (select to_jsonb(d) from finance_payee_destinations d where payee_id=p.id and is_active) destination,
   (select coalesce(jsonb_agg(to_jsonb(e) order by effective_from desc),'[]') from finance_payroll_engagements e where payee_id=p.id) engagements,
   (select coalesce(jsonb_agg(to_jsonb(r) order by effective_from desc),'[]') from finance_payroll_rates r where payee_id=p.id) rates
   from finance_payees p where p.entity_type='natural_person'
 ) x),
 'periods',(select coalesce(jsonb_agg(to_jsonb(x) order by month desc),'[]') from (
  select p.*,(select count(*) from finance_payroll_lines l where period_id=p.id) line_count,
   (select coalesce(sum(net_amount),0) from finance_payroll_lines l where period_id=p.id) net_total,
   case when p.status='draft' then 'draft'
    when not exists(select 1 from finance_payroll_lines l where period_id=p.id and net_amount>0 and not exists(select 1 from finance_payroll_payments pp where pp.line_id=l.id and pp.status='confirmed')) then 'paid'
    when exists(select 1 from finance_payroll_lines l join finance_payroll_payments pp on pp.line_id=l.id and pp.status='confirmed' where l.period_id=p.id) then 'partially_paid' else 'approved' end payment_status
  from finance_payroll_periods p) x),
 'lines',(select coalesce(jsonb_agg(to_jsonb(x) order by x.kind,x.name COLLATE "C",x.service_from),'[]') from (
  select l.*,coalesce(l.frozen_json#>>'{payee,legal_name}',y.legal_name) name,
   (select jsonb_build_object('id',p.id,'version',p.version,'status',p.status,'paid_on',p.paid_on,'bank_account_id',p.bank_account_id,'cash_location_id',p.cash_location_id,'prepare',pp.prepare_json)
    from finance_payroll_payments pp join finance_payouts p on p.id=pp.payout_id where pp.line_id=l.id and pp.status<>'cancelled') payment
  from finance_payroll_lines l join finance_payees y on y.id=l.payee_id where l.period_id=p_period) x),
 'obligations',(select coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object('month',p.month,'name',l.frozen_json#>>'{payee,legal_name}') order by p.month desc,o.kind,o.id),'[]')
  from finance_payroll_obligations o join finance_payroll_periods p on p.id=o.period_id join finance_payroll_lines l on l.id=o.line_id),
 'accounts',(select coalesce(jsonb_agg(to_jsonb(a) order by a.name_th COLLATE "C"),'[]') from finance_treasury_accounts a where public.treasury_location_active(a.bank_account_id,a.cash_location_id)),
 'today',(current_timestamp at time zone 'Asia/Bangkok')::date);
end; $$;

create function public.payroll089_period_assert() returns trigger language plpgsql security definer set search_path=public as $$
declare pid uuid; p public.finance_payroll_periods%rowtype;l public.finance_payroll_lines%rowtype; expected jsonb;actual jsonb;
begin
 if tg_table_name='finance_payroll_periods' then pid:=new.id;else pid:=coalesce(new.period_id,old.period_id);end if;
 select * into p from finance_payroll_periods where id=pid;
 for l in select * from finance_payroll_lines where period_id=pid loop
  if p.status='draft' then
   if l.frozen_json is not null or exists(select 1 from finance_payroll_obligations where line_id=l.id) then raise exception 'PAYROLL_DRAFT_INTEGRITY';end if;
  else
   if l.frozen_json is null or l.frozen_json-array['payee','month','approved_by'] is distinct from to_jsonb(l)-'frozen_json' then raise exception 'PAYROLL_FROZEN_INTEGRITY';end if;
   select coalesce(jsonb_object_agg(kind,amount),'{}') into expected from (values
    (case l.kind when 'employee' then 'employee_wht' else 'contractor_wht' end,l.wht_amount),('employee_ss',l.employee_ss),('employer_ss',l.employer_ss)) v(kind,amount) where amount>0;
   select coalesce(jsonb_object_agg(kind,amount),'{}') into actual from finance_payroll_obligations where line_id=l.id;
   if actual<>expected or exists(select 1 from finance_payroll_obligations where line_id=l.id and (source_json<>l.frozen_json or period_id<>pid)) then raise exception 'PAYROLL_OBLIGATION_INTEGRITY';end if;
  end if;
 end loop;
 return null;
end; $$;
create constraint trigger payroll089_period_integrity after insert or update on public.finance_payroll_periods deferrable initially deferred for each row execute function public.payroll089_period_assert();
create constraint trigger payroll089_line_integrity after insert or update or delete on public.finance_payroll_lines deferrable initially deferred for each row execute function public.payroll089_period_assert();
create constraint trigger payroll089_obligation_integrity after insert or update or delete on public.finance_payroll_obligations deferrable initially deferred for each row execute function public.payroll089_period_assert();

create function public.payroll089_link_assert() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.payroll089_payment_assert(new.payout_id);return null;end; $$;
create constraint trigger payroll089_link_integrity after insert or update on public.finance_payroll_payments deferrable initially deferred for each row execute function public.payroll089_link_assert();

-- Private tables: no direct app/service-role access. RPCs recheck active Admin.
DO $security$ declare t text; f record; begin
 foreach t in array array['finance_payroll_engagements','finance_payroll_rates','finance_payroll_periods','finance_payroll_lines','finance_payroll_obligations','finance_payroll_payments','finance_payroll_requests','finance_payroll_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('create policy payroll089_admin on public.%I for all to authenticated using(public.finance078_admin()) with check(public.finance078_admin())',t);
  execute format('create trigger payroll089_immutable before update or delete on public.%I for each row execute function public.payroll089_protect()',t);
  execute format('create trigger payroll089_no_truncate before truncate on public.%I for each statement execute function public.payroll089_protect()',t);
 end loop;
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'payroll089_%' loop
  execute format('alter function %s owner to postgres',f.signature);
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname in ('payroll089_read','payroll089_manage','payroll089_payment_batch') then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end; $security$;

DO $patch$ declare definition text; begin
 select pg_get_functiondef(to_regprocedure('payout_assert(uuid)')) into definition;
 if definition is null or (length(definition)-length(replace(definition,'if p.source_model=''revenue_distribution_v1'' then','')))/length('if p.source_model=''revenue_distribution_v1'' then')<>1 then raise exception 'PAYROLL_PATCH_CONTRACT_MISMATCH'; end if;
 execute replace(definition,'if p.source_model=''revenue_distribution_v1'' then','if p.source_model=''payroll_v1'' then perform public.payroll089_payment_assert(p_id);return; end if;
 if p.source_model=''revenue_distribution_v1'' then');
 select pg_get_functiondef(to_regprocedure('get_finance_account_statement(uuid,uuid,date,date,text,text,integer)')) into definition;
 if definition is null or (length(definition)-length(replace(definition,'when h.source_payout_id is not null then ''participant_payout''','')))/length('when h.source_payout_id is not null then ''participant_payout''')<>1 then raise exception 'PAYROLL_PATCH_CONTRACT_MISMATCH'; end if;
 execute replace(definition,'when h.source_payout_id is not null then ''participant_payout''','when p.source_model=''payroll_v1'' then ''other'' when h.source_payout_id is not null then ''participant_payout''');
 select pg_get_functiondef(to_regprocedure('get_finance_account_statement(uuid,uuid,date,date,text,text,integer)')) into definition;
 if definition is null or (length(definition)-length(replace(definition,'when h.source_payout_id is not null and public.current_user_can_view_finance_payments() then','')))/length('when h.source_payout_id is not null and public.current_user_can_view_finance_payments() then')<>1 then raise exception 'PAYROLL_PATCH_CONTRACT_MISMATCH'; end if;
 execute replace(definition,'when h.source_payout_id is not null and public.current_user_can_view_finance_payments() then','when p.source_model=''payroll_v1'' then case when public.finance078_admin() then ''/finance/payroll'' else null end
    when h.source_payout_id is not null and public.current_user_can_view_finance_payments() then');
 select pg_get_functiondef(to_regprocedure('get_finance_account_statement(uuid,uuid,date,date,text,text,integer)')) into definition;
 if definition is null or (length(definition)-length(replace(definition,'coalesce(e.vendor_name,dm.payer_name) party','')))/length('coalesce(e.vendor_name,dm.payer_name) party')<>1 then raise exception 'PAYROLL_PATCH_CONTRACT_MISMATCH'; end if;
 execute replace(definition,'coalesce(e.vendor_name,dm.payer_name) party','coalesce(e.vendor_name,dm.payer_name,case when p.source_model=''payroll_v1'' then p.confirmed_snapshot_json#>>''{payee,legal_name}'' end) party');
end; $patch$;

DO $preserve$ declare b jsonb;a jsonb;begin
 select state into b from payroll089_before;
 select jsonb_build_object('functions',(select coalesce(jsonb_object_agg(v->>'signature',encode(sha256(convert_to((v)::text,'UTF8')),'hex')),'{}') from (select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'security_definer',p.prosecdef,'config',p.proconfig,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text COLLATE "C"),'[]') value
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname in ('finance078_active','finance078_admin','finance078_require_payout','finance078_execution_account','expense_account_allowed','treasury_location_active','prepare_finance_expense_payout','confirm_finance_expense_payout','confirm_finance_payout','cancel_finance_payout','expense_payout_choice','payout_assert','payout_integrity','get_finance_expenses','get_finance_expense_obligations','get_finance_account_statement','company_purchase_request_recipient','company_purchase_request_declaration','finance_bangkok_completed_day_end','record_finance_cash_transaction_audit_event','expense_payout_model_guard','expense_integrity','validate_finance_cash_transaction_integrity','enforce_finance_cash_transaction_integrity','protect_finance_cash_audit_event','payout_immutable','get_finance_payees','payout_assert_before_expense','enforce_finance_cash_transaction_lifecycle','tax_position_immutable','get_finance_treasury','finance_expense_payout_batch','payroll089_require_admin','payroll089_protect','payroll089_sources','payroll089_manage','payroll089_payment_guard','payroll089_payment_assert','payroll089_payment_batch','payroll089_read','payroll089_period_assert','payroll089_link_assert')) f,jsonb_array_elements(f.value) x(v)),'tables',(select coalesce(jsonb_object_agg(v->>'name',encode(sha256(convert_to((v)::text,'UTF8')),'hex')),'{}') from (select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'acl',a.attacl::text,'generated',a.attgenerated,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum),'[]') from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid),'validated',convalidated) order by conname COLLATE "C"),'[]') from pg_constraint where conrelid=c.oid and contype<>'n'),
 'indexes',(select coalesce(jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) order by indexname COLLATE "C"),'[]') from pg_indexes where schemaname='public' and tablename=c.relname),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by policyname COLLATE "C"),'[]') from pg_policies p where schemaname='public' and tablename=c.relname),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) order by tgname COLLATE "C"),'[]') from pg_trigger where tgrelid=c.oid and not tgisinternal),
 'anon_select',has_table_privilege('anon',c.oid,'SELECT'),'authenticated_write',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'),
 'service_select',has_table_privilege('service_role',c.oid,'SELECT')) order by c.relname COLLATE "C"),'[]') value
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v') and c.relname in ('finance_expenses','finance_expense_settlements','finance_expense_obligations','finance_expense_tax_reviews','finance_expense_audit','finance_expense_obligation_waivers','finance_payouts','finance_payout_allocations','finance_payout_audit','finance_cash_transactions','finance_cash_transaction_audit_events','finance_outgoing_wht_obligations','finance_payees','finance_payee_destinations','finance_account_opening_balances','finance_treasury_account_authorities','finance_payroll_engagements','finance_payroll_rates','finance_payroll_periods','finance_payroll_lines','finance_payroll_obligations','finance_payroll_payments','finance_payroll_requests','finance_payroll_audit')) f,jsonb_array_elements(f.value) x(v)),'rows',(select coalesce(jsonb_object_agg(name,jsonb_build_object('count',(xpath('/row/n/text()',x))[1]::text::bigint,'sha256',(xpath('/row/h/text()',x))[1]::text)),'{}') from (
 select c.relname name,query_to_xml(format('select count(*) n,encode(sha256(convert_to(coalesce(string_agg((%s)::text,E''\n'' order by (%s)::text COLLATE "C"),''''),''UTF8'')),''hex'') h from public.%I t',
 'to_jsonb(t)',
 'to_jsonb(t)',c.relname),true,true,'') x
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') and (c.relname like 'finance\_%' escape '\' or c.relname in ('user_profiles','case_audit_logs','document_numbering_profiles')) and c.relname not in ('finance_payroll_engagements','finance_payroll_rates','finance_payroll_periods','finance_payroll_lines','finance_payroll_obligations','finance_payroll_payments','finance_payroll_requests','finance_payroll_audit')) captured),'preserved',(select jsonb_build_object('tables',(select value from (select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'acl',a.attacl::text,'generated',a.attgenerated,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum),'[]') from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid),'validated',convalidated) order by conname COLLATE "C"),'[]') from pg_constraint where conrelid=c.oid and contype<>'n'),
 'indexes',(select coalesce(jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) order by indexname COLLATE "C"),'[]') from pg_indexes where schemaname='public' and tablename=c.relname),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by policyname COLLATE "C"),'[]') from pg_policies p where schemaname='public' and tablename=c.relname),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) order by tgname COLLATE "C"),'[]') from pg_trigger where tgrelid=c.oid and not tgisinternal),
 'anon_select',has_table_privilege('anon',c.oid,'SELECT'),'authenticated_write',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'),
 'service_select',has_table_privilege('service_role',c.oid,'SELECT')) order by c.relname COLLATE "C"),'[]') value
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v') and c.relname not in ('finance_payroll_engagements','finance_payroll_rates','finance_payroll_periods','finance_payroll_lines','finance_payroll_obligations','finance_payroll_payments','finance_payroll_requests','finance_payroll_audit','finance_payouts')) t),'functions',(select value from (select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'security_definer',p.prosecdef,'config',p.proconfig,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text COLLATE "C"),'[]') value
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname not in ('payroll089_require_admin','payroll089_protect','payroll089_sources','payroll089_manage','payroll089_payment_guard','payroll089_payment_assert','payroll089_payment_batch','payroll089_read','payroll089_period_assert','payroll089_link_assert','payout_assert','get_finance_account_statement')) f),'defaults',(select coalesce(jsonb_agg(to_jsonb(d)-'oid' order by defaclrole,defaclnamespace,defaclobjtype),'[]') from pg_default_acl d),'views',(select coalesce(jsonb_object_agg(c.relname,pg_get_viewdef(c.oid,true)),'{}') from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v'))),'new_row_count',(select coalesce(sum((xpath('/row/n/text()',x))[1]::text::bigint),0) from (select query_to_xml(format('select count(*) n from public.%I',c.relname),true,true,'') x from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('finance_payroll_engagements','finance_payroll_rates','finance_payroll_periods','finance_payroll_lines','finance_payroll_obligations','finance_payroll_payments','finance_payroll_requests','finance_payroll_audit') and c.relkind='r') n)) state into a;
 if a->'rows' is distinct from b->'rows' or a->'preserved' is distinct from b->'preserved' or (a->>'new_row_count')::integer<>0 then raise exception 'PAYROLL_PRESERVATION_FAILED';end if;
 if a->'functions' is distinct from '{"finance078_admin()":"b8e378c9afe8476d59a67fa626abeab1386c78101c94dd242a43ad81918eef8b","payout_immutable()":"e86bcbef710b3e7411740099b976a0835b4d2727967cc38ef69f68fa5807e7a1","payout_integrity()":"c3e998c2ab8c337869846b9c37e50768833ceaf92373abc69bf7878b62d68e32","expense_integrity()":"4129c18337dbadea7e773f0cd31c13b4e2bfb08eaeb6c1bdfe91f2f106426e5e","finance078_active()":"407aac4bc85656987f8b753274e644d0153898ededf69aec7bbd2cc22c967472","payout_assert(uuid)":"c7f8684536896c4433617f55c610ec8bc09b2795521a39040bdf6fb1efad29cd","payroll089_protect()":"83bccd84a3a1ba4d1605374ba003a0ff719578c5d1f860aec4f210608cfc7498","payroll089_read(uuid)":"0d625c26dfc35f6bba3d180b9fe082d4722a18b40724dae81c1402f9500f62f2","get_finance_payees(text)":"99ab395676e91cde4586be889bb4fe44695aecebb653251a0a509f3c3f63b190","payroll089_link_assert()":"3931af8ae23deb84a4e9924f4b8b27614d9a57c5bfd0467adb0f55b27a5ff1b5","payroll089_sources(date)":"6c8bfdd096883677ed7d3397ab505f00b8bb2c0846b330ba5d46b674c69970f2","tax_position_immutable()":"86e13623d94afef28ee3f3439462e1f77bfb5a39e9b9aa7219fba9f5a44b7cd7","payroll089_payment_guard()":"5b477ef49cc9231db61ed7f96b57f7092624d5c991bb8a9d01ff9a9a5e1b991e","payroll089_period_assert()":"685a9dc6e921d686f93a17e293ae57b5f611d960d4cbb4e5e50935e9397f9bcd","payroll089_require_admin()":"df83f3fe5b7cf17debd782755feb22c42de8e90e181c91c139819c2516a23cfa","expense_payout_model_guard()":"1cce3a7f3c3ddff7f7af6d6c9e152fbc1d775c745a304173c512bb1fd9a7d6ba","get_finance_treasury(integer)":"c3218f5f9d617d1dbca7ebdcdb7c64eabd775133c0c2381e7eda06f270d9232e","payroll089_payment_assert(uuid)":"7dc42bf46ca2f6f0089e92924dba472eb4f92a983ef52d62631224fd43c08fec","payout_assert_before_expense(uuid)":"a7b74988ac9e62a34bbf8203802215e678969082ecf8f8fadebe8668d16bff81","payroll089_manage(text,jsonb,uuid)":"30b6e80abda8028c5a32349ea75822c0af86da6145770cbe7c93ad7c702f8d16","protect_finance_cash_audit_event()":"354e2a156c638e082656682e734b08e159255d5ddb7d78be3315fc2c389c2d72","expense_payout_choice(uuid,boolean)":"824f97735cdb2de19b23a7f6c10fe1e68109b9a8b872ea4106dc9663552ca118","treasury_location_active(uuid,uuid)":"197f319835bbdc4ced7367443852305541fb49bfdee62b6cf27d744d439a9b43","finance078_require_payout(uuid,text)":"fd94022f03ca61f6e11324aa361b19f963fae4f79e57dbfa2adff754aea83482","expense_account_allowed(uuid,uuid,text)":"06a13aee3a8fc43ea1eeecdfc982f0ef9fec81e6d28000d0126d234ee377daf2","finance078_execution_account(uuid,uuid)":"2e12b4f4497748e9c2fed10df84094819c38b861f7746cdfb270e64e68c303d7","finance_bangkok_completed_day_end(date)":"b15561569e408875fcbacb331d621193d6c253500d3d51365151c3daaebf1b83","company_purchase_request_recipient(uuid)":"56cc4992d2b221f85b4dba9aba52bc656e9944ed21a922937f721e078a1bfebf","get_finance_expense_obligations(integer)":"ba01495deb6bc9dd34763db5025b38e21ff6a8ca1c55063320a8ea4183a590a5","company_purchase_request_declaration(uuid)":"52279e560e912ce5b4ced4bff6a6639403baa050a2ece9d6548f8a3378f700b8","get_finance_expenses(uuid,boolean,integer)":"b6edaad770683f3c2cd8f860576086420477ae667d24be8d0653375039fe1446","cancel_finance_payout(uuid,integer,boolean)":"1cfe3ac02b846c2081310e67fae1918101237b4f4887ab2d3502754f2516cd70","enforce_finance_cash_transaction_integrity()":"43118d6a578127049a27a6c8e7d4aa3e7d3d22ec050de90d1a9be009c22b626e","enforce_finance_cash_transaction_lifecycle()":"0a9dd77f19095aac6d42032c76380ded44e16cca505dba80b245d6924c69744d","finance_expense_payout_batch(text,jsonb,boolean)":"aee9ff9bf8b59cc6458cb51a3a9ed81775c13804b2180c75023ae413a977bab4","payroll089_payment_batch(text,jsonb,uuid,boolean)":"088b35740e3bc854ed8d237b280603bbbd49792c1e46e592608e0dd9d1e29720","validate_finance_cash_transaction_integrity(uuid)":"7f1efdafd4ad1a94f4050a90e9646623c3e3c8bc67a4c4a4edcdee27d1421e03","confirm_finance_payout(uuid,integer,integer,uuid,boolean)":"6feef0df974008d2bf241136399bfe1f33faf8236f676a2eb65982541893a8dd","record_finance_cash_transaction_audit_event(uuid,text,jsonb)":"5b71722654f0aec8f29f2218f4bd21ddf8b408ae0d029c98bddf4b853ca7c939","confirm_finance_expense_payout(uuid,integer,integer,uuid,boolean)":"2774122067a7f8a25b88376a51f79bb5dbd214e6cc0c266209a958a959504f07","get_finance_account_statement(uuid,uuid,date,date,text,text,integer)":"e80ee12f8fa546cfb04a864e91597d88363872f6e67ee528f0f7882ed8d208eb","prepare_finance_expense_payout(uuid,uuid,integer,date,uuid,uuid,boolean,text)":"025f58e4faeb384522a66868f7464d4238fc81168f3763a51acd43c2a96dcd08"}'::jsonb or a->'tables' is distinct from '{"finance_payees":"9c2ead6e07c9bd0f144bf583536cda44bfbd64dc2207cd39ea183d2362d588fe","finance_payouts":"efa1afe6a226b3b4436b85f84528542b3c957638d79794a43065ef87aa791b8d","finance_expenses":"917cbb0c57b46f9c7f50c197440432d18571234d88633e2811c24d8c03bf9b9a","finance_payout_audit":"7df609d02f148630fab23a97200ce0ba257a3418220256b233b332ea29142eeb","finance_expense_audit":"45a29cf2419d86fb16b78eee6e03d72444cb059dadf790899cb3b40427526b8c","finance_payroll_audit":"29ecf1051429066b9bd8563083bbf4f3caff5aa762310c900c754c42102439f8","finance_payroll_lines":"519871cc3af963b91f3599577806b8727ae2b9980d433ec7f66cffcbfa947166","finance_payroll_rates":"04c023d16815d2596e6528686aca7f4cd87a0296035049dadb534714d6d099cb","finance_payroll_periods":"eefb021e076c170c2bf427facf1ce38aaea9e88376dea626056bfd8972ff1121","finance_payroll_payments":"2a25ba8e1115f98f1ade40998097a654d01675d8afdef1133c2e870ddb964c82","finance_payroll_requests":"d33d534baf3aa7c01c6f93c2d0fcc4c9285933e59969d77b112f7e2563ed61e0","finance_cash_transactions":"e2d5121c9ac25c3f0376edb129ea9f8fda37bd76c264951d122f9d74022d9239","finance_payee_destinations":"d6097c55137bf56a9f205e7eb97033313acd3e7ea122d8c0eccd3ffe3d44ccfc","finance_payout_allocations":"35644dbf266236a473a70bbc28469941a7af4092868fdf93809993ec37f00df8","finance_expense_obligations":"98fdf10a58d228cd7d301c52cfc82773e6d98eac973a6b6ef85fd4063003241b","finance_expense_settlements":"37ba9648f89a716172d10421da7fa2a5c4d0f35aa5725f53a1e31d2cc044e111","finance_expense_tax_reviews":"d482a46eacee0b020dd6a27546ce1e516f57a3a75c68567f0ed8cff852feef06","finance_payroll_engagements":"b04ab0bac055c4cec764a49f9590377ef392f1b6462cd20eee3f70bfca7b1e61","finance_payroll_obligations":"da620d735c89e06643535d10bfdf24bfdfdc05e52562f95a45af84fdf2d8e1a4","finance_account_opening_balances":"05a9bc63cd712438b0d99b37921b0efaf887f8bc9b839bc2150f7c72ba340169","finance_outgoing_wht_obligations":"cb4a49517f0968e79a5563acfd6bc9e007f97ff570ceb5ce27794dca609279a9","finance_expense_obligation_waivers":"6b183eda4ff5624b47a8ecb3ddf47f04cee6d59dbbd6510b09186c325ca65f56","finance_treasury_account_authorities":"adf6d6175069b61012c72be98de01173bcb29b01de7904385a8880c43dd65029","finance_cash_transaction_audit_events":"7b69a3ba60802d3ca786f49300e8303b772a2b30cc9df217d63a1330d9f4d089"}'::jsonb then raise exception 'PAYROLL_INSTALLED_CONTRACT_FAILED';end if;
end;$preserve$;
COMMIT;
