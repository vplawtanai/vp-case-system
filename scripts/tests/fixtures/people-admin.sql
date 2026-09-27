-- LOCAL SYNTHETIC extension to core-create-verified-baseline.sql. Not a Production snapshot.
create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}',created_at timestamptz default now(),last_sign_in_at timestamptz,banned_until timestamptz);
insert into auth.users(id,email) select id,staff_name||'@example.invalid' from public.user_profiles;
alter table public.user_profiles add column email text,add column full_name text;
update public.user_profiles u set email=a.email,full_name=staff_name from auth.users a where a.id=u.id;
alter table public.user_profiles add constraint profile_auth_fk foreign key(id) references auth.users(id) on delete cascade;
alter table public.user_profiles enable row level security;
create policy profiles_read on public.user_profiles for select to authenticated using(true);
-- Deliberately broad pre-existing write policy; 073 must impose active Admin as a ceiling.
create policy profiles_old_write on public.user_profiles for all to authenticated using(true) with check(true);
grant select,insert,update,delete,truncate on public.user_profiles to authenticated,anon,service_role;
create table public.case_audit_logs(id bigint generated always as identity primary key,case_id bigint,table_name text,record_id text,action text,user_id uuid,user_email text,user_name text,user_role text,old_data jsonb,new_data jsonb,note text,created_at timestamptz);
create table public.case_time_logs(id integer primary key,staff_name text,created_by_user_id uuid);
create table public.advisory_time_logs(id integer primary key,staff_name text,created_by_user_id uuid);
create table public.office_work_logs(id integer primary key,staff_user_id uuid,staff_name text);
create table public.finance_payable_entitlements(id integer primary key,recipient_id uuid references public.user_profiles on delete cascade);
create table public.finance_payout_audit(id integer primary key,actor_id uuid references auth.users on delete set null);
create table public.document_history(id integer primary key,actor_id uuid references public.user_profiles);
create table public.finance_snapshot_history(id integer primary key,snapshot jsonb);
create schema storage;
create table storage.objects(id uuid primary key,owner_id text);
create function public.payout_profile_delete_guard() returns trigger language plpgsql security definer set search_path=public as $$
begin if exists(select 1 from public.finance_payable_entitlements where recipient_id=old.id) then raise exception 'PAYABLE_RECIPIENT_HISTORY_REQUIRED'; end if; return old; end;$$;
create trigger payout_profile_delete_guard before delete on public.user_profiles for each row execute function public.payout_profile_delete_guard();
-- Model the common Auth signup profile trigger. No privilege derived from user metadata.
create function public.fixture_auth_profile() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.user_profiles(id,email,full_name,staff_name,role,active) values(new.id,new.email,'New user','','viewer',false);return new;end;$$;
create trigger fixture_auth_profile after insert on auth.users for each row execute function public.fixture_auth_profile();
