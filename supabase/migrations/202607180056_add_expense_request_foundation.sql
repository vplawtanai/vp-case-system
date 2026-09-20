-- Additive request envelopes. No backfill, financial action or Production fixture.
create table public.finance_expense_requests (
 id uuid primary key,
 kind text not null check(kind in ('employee_claim','company_expense_batch')),
 status text not null default 'draft' check(status in ('draft','submitted')),
 version integer not null default 1 check(version>0),
 note text not null default '' check(length(note)<=2000),
 created_by uuid not null references public.user_profiles(id),
 created_at timestamptz not null default now(),
 submitted_by uuid references public.user_profiles(id), submitted_at timestamptz,
 check((status='draft' and submitted_at is null and submitted_by is null)
  or (status='submitted' and submitted_at is not null and submitted_by is not null))
);
create index expense_request_queue on public.finance_expense_requests(kind,submitted_at desc,id);
create table public.finance_expense_request_items (
 request_id uuid not null references public.finance_expense_requests(id),
 expense_id uuid primary key references public.finance_expenses(id),
 item_no integer not null check(item_no between 1 and 100),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create unique index expense_request_active_position on public.finance_expense_request_items(request_id,item_no) where active;
create table public.finance_expense_request_audit (
 id uuid primary key,
 request_id uuid not null references public.finance_expense_requests(id),
 event_type text not null check(event_type in ('saved','submitted')),
 actor_id uuid not null references public.user_profiles(id),
 created_at timestamptz not null default now(),
 input_json jsonb not null check(jsonb_typeof(input_json)='object'),
 version integer not null,
 unique(request_id,version)
);
create unique index expense_request_single_submission on public.finance_expense_request_audit(request_id) where event_type='submitted';

create function public.expense_request_guard()
returns trigger language plpgsql security definer set search_path=public as $fn$
declare r public.finance_expense_requests%rowtype; e public.finance_expenses%rowtype;
begin
 if tg_op in ('DELETE','TRUNCATE') then raise exception 'EXPENSE_REQUEST_IMMUTABLE'; end if;
 if tg_table_name='finance_expense_requests' then
  if old.status<>'draft' or new.id<>old.id or new.kind<>old.kind or new.created_by<>old.created_by
   or new.created_at<>old.created_at or new.version<>old.version+1 then raise exception 'EXPENSE_REQUEST_IMMUTABLE'; end if;
 elsif tg_table_name='finance_expense_request_audit' then raise exception 'EXPENSE_REQUEST_IMMUTABLE';
 elsif tg_table_name='finance_expense_request_items' then
  select * into strict r from public.finance_expense_requests where id=new.request_id for update;
  select * into strict e from public.finance_expenses where id=new.expense_id;
  if r.status<>'draft' or e.status<>'draft' or e.created_by<>r.created_by
   or e.origin<>(case when r.kind='employee_claim' then 'employee_claim' else 'company_purchase' end)
   or (tg_op='UPDATE' and (new.request_id<>old.request_id or new.expense_id<>old.expense_id or new.created_at<>old.created_at))
  then raise exception 'EXPENSE_REQUEST_ITEM_INVALID'; end if;
 else
  select q.* into r from public.finance_expense_request_items i join public.finance_expense_requests q on q.id=i.request_id where i.expense_id=new.id and i.active;
  if r.id is not null and old.status='draft' and new.status='submitted' then
   if r.status<>'submitted' then raise exception 'EXPENSE_REQUEST_SUBMIT_REQUIRED'; end if;
   new.submitted_at:=r.submitted_at;
  end if;
 end if;
 return new;
end;
$fn$;
create trigger expense_request_history before update or delete on public.finance_expense_requests for each row execute function public.expense_request_guard();
create trigger expense_request_item_guard before insert or update or delete on public.finance_expense_request_items for each row execute function public.expense_request_guard();
create trigger expense_request_audit_history before update or delete on public.finance_expense_request_audit for each row execute function public.expense_request_guard();
create trigger expense_request_submission_time before update on public.finance_expenses for each row execute function public.expense_request_guard();

-- Old direct entry paths remain available for standalone records only.
alter function public.save_finance_expense(uuid,integer,jsonb) rename to save_finance_expense_before_requests;
alter function public.submit_finance_expense(uuid,integer) rename to submit_finance_expense_before_requests;
create function public.save_finance_expense(p_id uuid,p_version integer,p_input jsonb)
returns uuid language plpgsql security definer set search_path=public as $fn$
begin
 perform pg_advisory_xact_lock(hashtextextended('expense:'||p_id,0));
 if exists(select 1 from public.finance_expense_request_items where expense_id=p_id) then raise exception 'EXPENSE_REQUEST_EDIT_REQUIRED'; end if;
 return public.save_finance_expense_before_requests(p_id,p_version,p_input);
end;
$fn$;
create function public.submit_finance_expense(p_id uuid,p_version integer)
returns uuid language plpgsql security definer set search_path=public as $fn$
begin
 perform pg_advisory_xact_lock(hashtextextended('expense:'||p_id,0));
 if exists(select 1 from public.finance_expense_request_items where expense_id=p_id) then raise exception 'EXPENSE_REQUEST_SUBMIT_REQUIRED'; end if;
 return public.submit_finance_expense_before_requests(p_id,p_version);
end;
$fn$;

create function public.save_finance_expense_request(p_id uuid,p_operation uuid,p_version integer,p_kind text,p_note text,p_items jsonb)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare r public.finance_expense_requests%rowtype; a public.finance_expense_request_audit%rowtype;
 item jsonb; child uuid; n integer:=0; payload jsonb;
begin
 if p_id is null or p_operation is null or p_kind is null or p_kind not in ('employee_claim','company_expense_batch')
  or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100
  or p_note is null or length(p_note)>2000 then raise exception 'EXPENSE_REQUEST_INPUT_INVALID'; end if;
 if (p_kind='employee_claim' and not public.expense_can_claim())
  or (p_kind='company_expense_batch' and not (public.expense_can_manage() or (public.get_finance_expense_access()->>'can_record')::boolean))
 then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('expense_request:'||p_id,0));
 select * into r from public.finance_expense_requests where id=p_id for update;
 if r.id is not null and (r.created_by<>auth.uid() or r.kind<>p_kind) then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 payload:=jsonb_build_object('kind',p_kind,'note',p_note,'items',p_items,'expected_version',p_version);
 select * into a from public.finance_expense_request_audit where id=p_operation;
 if a.id is not null then
  if a.request_id=p_id and a.actor_id=auth.uid() and a.input_json=payload and a.event_type='saved' then return p_id; end if;
  raise exception 'EXPENSE_REQUEST_IDEMPOTENCY';
 end if;
 if r.version is distinct from p_version or (r.id is not null and r.status<>'draft') then raise exception 'EXPENSE_STALE'; end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) then raise exception 'EXPENSE_REQUEST_DUPLICATE_ITEM'; end if;
 if r.id is null then
  insert into public.finance_expense_requests(id,kind,note,created_by) values(p_id,p_kind,p_note,auth.uid()) returning * into r;
 end if;
 -- Serialize each child against old RPCs; never adopt a pre-existing standalone item.
 for item in select value from jsonb_array_elements(p_items) order by value->>'id' loop
  child:=(item->>'id')::uuid;
  if child is null or jsonb_typeof(item->'input') is distinct from 'object' then raise exception 'EXPENSE_REQUEST_ITEM_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('expense:'||child,0));
  if exists(select 1 from public.finance_expenses where id=child)
   and not exists(select 1 from public.finance_expense_request_items where request_id=p_id and expense_id=child and active)
  then raise exception 'EXPENSE_REQUEST_ITEM_INVALID'; end if;
  perform public.save_finance_expense_before_requests(child,(item->>'version')::integer,
   (item->'input')||jsonb_build_object('origin',case when p_kind='employee_claim' then 'employee_claim' else 'company_purchase' end));
 end loop;
 -- Removed Draft items remain as audit history, never as another standalone submission.
 update public.finance_expense_request_items set active=false where request_id=p_id and active;
 for item in select value from jsonb_array_elements(p_items) loop
  n:=n+1;child:=(item->>'id')::uuid;
  insert into public.finance_expense_request_items(request_id,expense_id,item_no) values(p_id,child,n)
   on conflict(expense_id) do update set active=true,item_no=excluded.item_no;
 end loop;
 if p_version is not null then
  update public.finance_expense_requests set note=p_note,version=version+1 where id=p_id returning * into r;
 end if;
 insert into public.finance_expense_request_audit(id,request_id,event_type,actor_id,input_json,version)
 values(p_operation,p_id,'saved',auth.uid(),payload,r.version);
 return p_id;
end;
$fn$;

create function public.submit_finance_expense_request(p_id uuid,p_version integer)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare r public.finance_expense_requests%rowtype; e record;
begin
 perform pg_advisory_xact_lock(hashtextextended('expense_request:'||p_id,0));
 select * into r from public.finance_expense_requests where id=p_id for update;
 if r.id is null or not exists(select 1 from public.user_profiles where id=auth.uid() and active)
  or (r.created_by<>auth.uid() and not public.expense_can_manage())
  or (r.kind='employee_claim' and not public.expense_can_claim() and not public.expense_can_manage())
 then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 if r.status='submitted' then return p_id; end if;
 if r.version is distinct from p_version then raise exception 'EXPENSE_STALE'; end if;
 if not exists(select 1 from public.finance_expense_request_items where request_id=p_id and active) then raise exception 'EXPENSE_REQUEST_EMPTY'; end if;
 update public.finance_expense_requests set status='submitted',submitted_at=clock_timestamp(),submitted_by=auth.uid(),version=version+1 where id=p_id returning * into r;
 for e in select x.id,x.version,x.status from public.finance_expense_request_items i join public.finance_expenses x on x.id=i.expense_id
  where i.request_id=p_id and i.active order by x.id loop
  if e.status<>'draft' then raise exception 'EXPENSE_REQUEST_ITEM_INVALID'; end if;
  perform public.submit_finance_expense_before_requests(e.id,e.version);
 end loop;
 insert into public.finance_expense_request_audit(id,request_id,event_type,actor_id,created_at,input_json,version)
 values(gen_random_uuid(),p_id,'submitted',auth.uid(),r.submitted_at,jsonb_build_object('submitted_at',r.submitted_at),r.version);
 return p_id;
end;
$fn$;

create function public.expense_request_can_read(p_id uuid)
returns boolean language sql stable security definer set search_path=public as $fn$
 select exists(select 1 from public.finance_expense_requests r join public.user_profiles u on u.id=auth.uid() and u.active
  where r.id=p_id and (r.created_by=u.id or public.expense_can_view_all()));
$fn$;
alter function public.expense_document(uuid) rename to expense_document_before_requests;
create function public.expense_document(p_id uuid)
returns jsonb language sql stable security definer set search_path=public as $fn$
 select public.expense_document_before_requests(p_id)||jsonb_build_object('request_id',i.request_id,'request_active',i.active,
  -- Entry authority context only, never a payment instruction or settlement decision.
  'request_entry_account',(select jsonb_build_object('bank_account_id',v->'input'->'bank_account_id','cash_location_id',v->'input'->'cash_location_id')
   from public.finance_expense_request_audit a cross join lateral jsonb_array_elements(a.input_json->'items') v
   join public.finance_expense_requests r on r.id=a.request_id
   where a.request_id=i.request_id and a.event_type='saved' and v->>'id'=p_id::text
    and r.status='draft' and r.created_by=auth.uid() order by a.version desc limit 1))
 from (select 1) seed left join public.finance_expense_request_items i on i.expense_id=p_id;
$fn$;
create function public.expense_request_document(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
begin
 if not public.expense_request_can_read(p_id) then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 return (select to_jsonb(r)||jsonb_build_object('requester_name',coalesce(u.staff_name,u.full_name,u.email),
  'items',(select coalesce(jsonb_agg(public.expense_document(i.expense_id) order by i.item_no),'[]') from public.finance_expense_request_items i where i.request_id=r.id and i.active),
  'audit',(select coalesce(jsonb_agg(jsonb_build_object('event_type',a.event_type,'created_at',a.created_at,'version',a.version) order by a.version),'[]') from public.finance_expense_request_audit a where a.request_id=r.id))
  from public.finance_expense_requests r join public.user_profiles u on u.id=r.created_by where r.id=p_id);
end;
$fn$;
create function public.get_finance_expense_requests(p_id uuid default null,p_claims boolean default false,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
begin
 if auth.uid() is null or not exists(select 1 from public.user_profiles where id=auth.uid() and active) then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'EXPENSE_INPUT_INVALID'; end if;
 if p_id is not null then return public.expense_request_document(p_id); end if;
 return jsonb_build_object('rows',(select coalesce(jsonb_agg(public.expense_request_document(x.id) order by x.created_at desc,x.id),'[]') from
  (select r.id,r.created_at from public.finance_expense_requests r where public.expense_request_can_read(r.id) and (not p_claims or r.kind='employee_claim') order by r.created_at desc,r.id limit 50 offset p_offset) x),
  'has_next',(select count(*)>p_offset+50 from public.finance_expense_requests r where public.expense_request_can_read(r.id) and (not p_claims or r.kind='employee_claim')));
end;
$fn$;

alter function public.get_finance_expenses(uuid,boolean,integer) rename to get_finance_expenses_before_requests;
create function public.get_finance_expenses(p_id uuid default null,p_claims boolean default false,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
begin
 if auth.uid() is null or not exists(select 1 from public.user_profiles where id=auth.uid() and active) then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'EXPENSE_INPUT_INVALID'; end if;
 if p_id is not null then return public.get_finance_expenses_before_requests(p_id,p_claims,p_offset); end if;
 return jsonb_build_object('access',public.get_finance_expense_access(),'accounts',public.get_finance_expense_accounts(),
  'rows',(select coalesce(jsonb_agg(public.expense_document(x.id) order by x.created_at desc,x.id),'[]') from
   (select e.id,e.created_at from public.finance_expenses e where public.expense_can_read(e.id) and (not p_claims or e.origin in ('employee_claim','legacy_claim'))
    and not exists(select 1 from public.finance_expense_request_items i where i.expense_id=e.id and (not i.active or public.expense_request_can_read(i.request_id))) order by e.created_at desc,e.id limit 50 offset p_offset) x),
  'has_next',(select count(*)>p_offset+50 from public.finance_expenses e where public.expense_can_read(e.id) and (not p_claims or e.origin in ('employee_claim','legacy_claim'))
    and not exists(select 1 from public.finance_expense_request_items i where i.expense_id=e.id and (not i.active or public.expense_request_can_read(i.request_id)))));
end;
$fn$;

do $security$
declare t text; f record;
begin
 foreach t in array array['finance_expense_requests','finance_expense_request_items','finance_expense_request_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('create trigger expense_request_no_truncate before truncate on public.%I for each statement execute function public.expense_request_guard()',t);
 end loop;
 for f in select p.proname,p.oid::regprocedure signature from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in
  ('expense_request_guard','expense_request_can_read','expense_request_document','expense_document','expense_document_before_requests',
   'save_finance_expense','save_finance_expense_before_requests','submit_finance_expense','submit_finance_expense_before_requests',
   'get_finance_expenses','get_finance_expenses_before_requests','save_finance_expense_request','submit_finance_expense_request','get_finance_expense_requests') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname in ('save_finance_expense','submit_finance_expense','get_finance_expenses','save_finance_expense_request','submit_finance_expense_request','get_finance_expense_requests') then
   execute format('grant execute on function %s to authenticated',f.signature);
  end if;
 end loop;
end;
$security$;
