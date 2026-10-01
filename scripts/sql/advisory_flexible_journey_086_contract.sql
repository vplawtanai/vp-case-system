-- FJ-1 definitions only; offline builder embeds this in the transaction-wrapped Human Gate.
create function public.advisory086_admin() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.user_profiles where id=auth.uid() and role='admin' and active and not must_change_password);
$$;
create function public.advisory086_valid_version(p jsonb) returns boolean language plpgsql immutable set search_path=public as $$
declare s jsonb; n integer; keys text[]:='{}';
begin
 if jsonb_typeof(p) is distinct from 'object' or p-'name_th'-'name_en'-'stages'<>'{}' then return false; end if;
 if jsonb_typeof(p->'name_th') is distinct from 'string' or jsonb_typeof(p->'name_en') is distinct from 'string'
 or length(btrim(coalesce(p->>'name_th',''))) not between 1 and 160 or length(btrim(coalesce(p->>'name_en',''))) not between 1 and 160
 or jsonb_typeof(p->'stages') is distinct from 'array' then return false; end if;
 n:=jsonb_array_length(p->'stages'); if n not between 2 and 20 then return false; end if;
 for s in select value from jsonb_array_elements(p->'stages') loop
  if jsonb_typeof(s) is distinct from 'object' or s-'key'-'name_th'-'name_en'-'required'<>'{}'
  or jsonb_typeof(s->'key') is distinct from 'string' or (s->>'key')!~'^[a-z][a-z0-9_]{1,59}$'
  or jsonb_typeof(s->'required') is distinct from 'boolean'
  or jsonb_typeof(s->'name_th') is distinct from 'string' or jsonb_typeof(s->'name_en') is distinct from 'string'
  or length(btrim(coalesce(s->>'name_th',''))) not between 1 and 160 or length(btrim(coalesce(s->>'name_en',''))) not between 1 and 160
  or (s->>'key')=any(keys) then return false; end if;
  keys:=array_append(keys,s->>'key');
 end loop;
 return p#>>'{stages,0,key}'<>'close' and (p#>>'{stages,0,required}')::boolean
 and p#>>array['stages',(n-1)::text,'key']='close' and (p#>>array['stages',(n-1)::text,'required'])::boolean
 and array_position(keys,'close')=n;
end; $$;
create table public.advisory_journey_variants (
 id uuid primary key default gen_random_uuid(), family_key text not null,
 active boolean not null default true, is_default boolean not null default false,
 revision bigint not null default 1 check(revision>0), created_at timestamptz not null default clock_timestamp(),
 check(not is_default or active)
);
create unique index advisory086_one_default on public.advisory_journey_variants(family_key) where is_default;
create table public.advisory_journey_versions (
 id uuid primary key default gen_random_uuid(), variant_id uuid not null references public.advisory_journey_variants(id) on delete restrict,
 version integer not null check(version>0), definition jsonb not null check(public.advisory086_valid_version(definition)),
 created_at timestamptz not null default clock_timestamp(), created_by uuid references public.user_profiles(id),
 unique(variant_id,version)
);
create table public.advisory_journey_snapshots (
 matter_id uuid primary key references public.advisory_matters(id) on delete restrict,
 version_id uuid not null references public.advisory_journey_versions(id) on delete restrict,
 family_key text not null, variant_id uuid not null references public.advisory_journey_variants(id) on delete restrict,
 version integer not null, definition jsonb not null check(public.advisory086_valid_version(definition)),
 captured_at timestamptz not null default clock_timestamp(), captured_by uuid not null references public.user_profiles(id)
);
create table public.advisory_journey_requests (
 request_id uuid primary key, actor_id uuid not null references public.user_profiles(id),
 body jsonb not null, response jsonb not null, previous_state jsonb, resulting_state jsonb,
 recorded_at timestamptz not null default clock_timestamp()
);
create function public.advisory086_immutable() returns trigger language plpgsql set search_path=public as $$
begin raise exception 'ADVISORY_JOURNEY_IMMUTABLE'; end; $$;
create trigger advisory086_version_immutable before update or delete on public.advisory_journey_versions for each row execute function public.advisory086_immutable();
create trigger advisory086_snapshot_immutable before update or delete on public.advisory_journey_snapshots for each row execute function public.advisory086_immutable();
create trigger advisory086_request_immutable before update or delete on public.advisory_journey_requests for each row execute function public.advisory086_immutable();

create function public.advisory_journey_catalog(p_family text default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not public.advisory076_allowed('read') then raise exception 'ADVISORY_FORBIDDEN' using errcode='42501'; end if;
 return jsonb_build_object('manage',public.advisory086_admin(),'variants',coalesce((
  select jsonb_agg(to_jsonb(v)||jsonb_build_object('version_id',d.id,'version',d.version,'definition',d.definition) order by v.family_key collate "C",v.is_default desc,v.id)
  from public.advisory_journey_variants v cross join lateral(select * from public.advisory_journey_versions where variant_id=v.id order by version desc limit 1) d
  where (p_family is null or v.family_key=p_family) and (v.active or public.advisory086_admin())
 ),'[]'::jsonb));
end; $$;

create function public.advisory_journey_manage(p_id uuid,p_action text,p_payload jsonb,p_request_id uuid,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); body jsonb; saved public.advisory_journey_requests%rowtype;
 v public.advisory_journey_variants%rowtype; family text; before_state jsonb; result jsonb; ver integer;
begin
 if not public.advisory086_admin() then raise exception 'ADVISORY_FORBIDDEN' using errcode='42501'; end if;
 if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>32000 then raise exception 'ADVISORY_INVALID_INPUT'; end if;
 body:=jsonb_build_object('id',p_id,'action',p_action,'payload',p_payload,'revision',p_expected_revision);
 perform pg_advisory_xact_lock(hashtextextended('advisory086-request:'||p_request_id,0));
 select * into saved from public.advisory_journey_requests where request_id=p_request_id;
 if found then if saved.actor_id<>actor or saved.body<>body then raise exception 'ADVISORY_RETRY_MISMATCH'; end if; return saved.response; end if;
 if p_action='create' then
  if p_id is not null or p_payload-'family_key'-'definition'<>'{}' then raise exception 'ADVISORY_INVALID_INPUT'; end if;
  family:=p_payload->>'family_key';
 else select family_key into family from public.advisory_journey_variants where id=p_id; end if;
 if family is null or not public.advisory086_family_valid(family) then raise exception 'ADVISORY_JOURNEY_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('advisory086-family:'||family,0));
 if p_action='create' then
  insert into public.advisory_journey_variants(family_key,is_default) values(family,not exists(select 1 from public.advisory_journey_variants where family_key=family and active)) returning * into v;
 else
  select * into v from public.advisory_journey_variants where id=p_id for update;
  if p_expected_revision is distinct from v.revision then raise exception 'ADVISORY_CHANGED'; end if;
  before_state:=to_jsonb(v);
 end if;
 if p_action in ('create','publish') then
  if (p_action='publish' and p_payload-'definition'<>'{}') or not public.advisory086_valid_version(p_payload->'definition') then raise exception 'ADVISORY_JOURNEY_INVALID'; end if;
  select coalesce(max(version),0)+1 into ver from public.advisory_journey_versions where variant_id=v.id;
  insert into public.advisory_journey_versions(variant_id,version,definition,created_by) values(v.id,ver,p_payload->'definition',actor);
 elsif p_action='configure' then
  if p_payload-'active'-'is_default'<>'{}' or jsonb_typeof(p_payload->'active') is distinct from 'boolean' or jsonb_typeof(p_payload->'is_default') is distinct from 'boolean'
  or ((p_payload->>'is_default')::boolean and not (p_payload->>'active')::boolean) then raise exception 'ADVISORY_JOURNEY_INVALID'; end if;
  if (p_payload->>'is_default')::boolean then
   update public.advisory_journey_variants set is_default=false,revision=revision+1 where family_key=family and is_default and id<>v.id;
  end if;
  update public.advisory_journey_variants set active=(p_payload->>'active')::boolean,is_default=(p_payload->>'is_default')::boolean where id=v.id;
 else raise exception 'ADVISORY_ACTION_INVALID'; end if;
 if not exists(select 1 from public.advisory_journey_variants where family_key=family and active and is_default) then raise exception 'ADVISORY_JOURNEY_DEFAULT_REQUIRED'; end if;
 if p_action<>'create' then update public.advisory_journey_variants set revision=revision+1 where id=v.id; end if;
 select to_jsonb(x) into result from public.advisory_journey_variants x where id=v.id;
 insert into public.advisory_journey_requests(request_id,actor_id,body,response,previous_state,resulting_state) values(p_request_id,actor,body,result,before_state,result||jsonb_build_object('published_version',ver));
 return result;
end; $$;

-- Private create helper: called within the original create transaction and retry ledger.
create function public.advisory086_snapshot(p_matter uuid,p_type text,p_variant uuid,p_version uuid) returns void
language plpgsql security definer set search_path=public as $$
declare family text:=public.advisory086_family(p_type); v public.advisory_journey_variants%rowtype; d public.advisory_journey_versions%rowtype;
begin
 if family is null then raise exception 'ADVISORY_JOURNEY_INVALID'; end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('advisory086-family:'||family,0));
 select * into v from public.advisory_journey_variants where family_key=family and active and (case when p_variant is null then is_default else id=p_variant end);
 if not found then raise exception 'ADVISORY_JOURNEY_UNAVAILABLE'; end if;
 select * into d from public.advisory_journey_versions where variant_id=v.id order by version desc limit 1;
 if not found or (p_version is not null and p_version<>d.id) then raise exception 'ADVISORY_JOURNEY_CHANGED'; end if;
 insert into public.advisory_journey_snapshots(matter_id,version_id,family_key,variant_id,version,definition,captured_by) values(p_matter,d.id,family,v.id,d.version,d.definition,auth.uid());
 insert into public.advisory_matter_stages(matter_id,template_key,stage_key,position)
 select p_matter,family,s->>'key',n-1 from jsonb_array_elements(d.definition->'stages') with ordinality x(s,n);
end; $$;

alter table public.advisory_journey_variants enable row level security;
alter table public.advisory_journey_versions enable row level security;
alter table public.advisory_journey_snapshots enable row level security;
alter table public.advisory_journey_requests enable row level security;
create policy advisory086_read on public.advisory_journey_variants for select to authenticated using(public.advisory076_allowed('read') and (active or public.advisory086_admin()));
create policy advisory086_read on public.advisory_journey_versions for select to authenticated using(public.advisory086_admin());
create policy advisory086_read on public.advisory_journey_snapshots for select to authenticated using(public.advisory076_allowed('read'));
create policy advisory086_read on public.advisory_journey_requests for select to authenticated using(public.advisory086_admin());
revoke all on public.advisory_journey_variants,public.advisory_journey_versions,public.advisory_journey_snapshots,public.advisory_journey_requests from public,anon,authenticated,service_role;
grant select on public.advisory_journey_variants,public.advisory_journey_versions,public.advisory_journey_snapshots,public.advisory_journey_requests to authenticated;
