-- FJ-2 validates new immutable definitions; existing FJ-1 definitions remain valid.
create function public.advisory087_valid_version(p jsonb) returns boolean language plpgsql immutable set search_path=public as $$
declare s jsonb; o jsonb; keys text[]:='{}'; outcome_keys text[]; reachable text[]; closing text[]; changed boolean; n integer;
begin
 if public.advisory086_valid_version(p) then return true; end if;
 if jsonb_typeof(p) is distinct from 'object' or p-'format'-'name_th'-'name_en'-'stages'<>'{}' or p->'format' is distinct from '2'::jsonb
 or jsonb_typeof(p->'stages') is distinct from 'array' then return false; end if;
 if jsonb_typeof(p->'name_th') is distinct from 'string' or jsonb_typeof(p->'name_en') is distinct from 'string'
 or length(btrim(coalesce(p->>'name_th',''))) not between 1 and 160 or length(btrim(coalesce(p->>'name_en',''))) not between 1 and 160 then return false; end if;
 n:=jsonb_array_length(p->'stages'); if n not between 2 and 20 then return false; end if;
 for s in select value from jsonb_array_elements(p->'stages') loop
  if jsonb_typeof(s) is distinct from 'object' or s-'key'-'name_th'-'name_en'-'required'-'conditional'-'outcomes'<>'{}'
  or jsonb_typeof(s->'key') is distinct from 'string' or s->>'key'!~'^[a-z][a-z0-9_]{1,59}$' or (s->>'key')=any(keys)
  or jsonb_typeof(s->'required') is distinct from 'boolean' or jsonb_typeof(s->'conditional') is distinct from 'boolean'
  or jsonb_typeof(s->'name_th') is distinct from 'string' or jsonb_typeof(s->'name_en') is distinct from 'string'
  or length(btrim(coalesce(s->>'name_th',''))) not between 1 and 160 or length(btrim(coalesce(s->>'name_en',''))) not between 1 and 160
  or jsonb_typeof(s->'outcomes') is distinct from 'array' then return false; end if;
  if (s->>'key'='close' and s->'outcomes'<>'[]') or (s->>'key'<>'close' and jsonb_array_length(s->'outcomes') not between 1 and 8) then return false; end if;
  keys:=array_append(keys,s->>'key'); outcome_keys:='{}';
  for o in select value from jsonb_array_elements(s->'outcomes') loop
   if jsonb_typeof(o) is distinct from 'object' or o-'key'-'name_th'-'name_en'-'target'-'requires_reason'<>'{}'
   or jsonb_typeof(o->'key') is distinct from 'string' or o->>'key'!~'^[a-z][a-z0-9_]{1,59}$' or (o->>'key')=any(outcome_keys)
   or jsonb_typeof(o->'target') is distinct from 'string' or jsonb_typeof(o->'requires_reason') is distinct from 'boolean'
   or jsonb_typeof(o->'name_th') is distinct from 'string' or jsonb_typeof(o->'name_en') is distinct from 'string'
   or length(btrim(coalesce(o->>'name_th',''))) not between 1 and 160 or length(btrim(coalesce(o->>'name_en',''))) not between 1 and 160 then return false; end if;
   outcome_keys:=array_append(outcome_keys,o->>'key');
  end loop;
 end loop;
 if p#>>'{stages,0,key}'='close' or not (p#>>'{stages,0,required}')::boolean or (p#>>'{stages,0,conditional}')::boolean
 or p#>>array['stages',(n-1)::text,'key']<>'close' or not (p#>>array['stages',(n-1)::text,'required'])::boolean
 or (p#>>array['stages',(n-1)::text,'conditional'])::boolean or array_position(keys,'close')<>n then return false; end if;
 if exists(select 1 from jsonb_array_elements(p->'stages') st,lateral jsonb_array_elements(st->'outcomes') ot where not (ot->>'target')=any(keys)) then return false; end if;
 -- Every stage is reachable from intake and has a possible route to close.
 -- Loops are legal; a disconnected stage or a trapped cycle is not publishable.
 reachable:=array[p#>>'{stages,0,key}']; closing:=array['close'];
 loop
  changed:=false;
  for s in select value from jsonb_array_elements(p->'stages') loop
   for o in select value from jsonb_array_elements(s->'outcomes') loop
    if (s->>'key')=any(reachable) and not (o->>'target')=any(reachable) then reachable:=array_append(reachable,o->>'target'); changed:=true; end if;
    if (o->>'target')=any(closing) and not (s->>'key')=any(closing) then closing:=array_append(closing,s->>'key'); changed:=true; end if;
   end loop;
  end loop;
  exit when not changed;
 end loop;
 return keys<@reachable and keys<@closing;
end; $$;
revoke all on function public.advisory087_valid_version(jsonb) from public,anon,authenticated,service_role;
alter table public.advisory_journey_versions drop constraint advisory_journey_versions_definition_check;
alter table public.advisory_journey_versions add constraint advisory_journey_versions_definition_check check(public.advisory087_valid_version(definition));
alter table public.advisory_journey_snapshots drop constraint advisory_journey_snapshots_definition_check;
alter table public.advisory_journey_snapshots add constraint advisory_journey_snapshots_definition_check check(public.advisory087_valid_version(definition));
