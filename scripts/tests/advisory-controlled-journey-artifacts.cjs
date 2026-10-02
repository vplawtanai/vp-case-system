/* eslint-disable @typescript-eslint/no-require-imports */
// Offline only. Exact prior contracts, no credentials or database connection.
const fs=require('node:fs'),assert=require('node:assert/strict');
const F=require('./advisory-flexible-journey-artifacts.cjs'),{A,B,q,jsonHash}=F,root=A.root;
assert.equal(A.hash(fs.readFileSync(F.candidate)),'71d07c7b59f86f8cc007f40b434d4b09b4980a9e507da23c2d4db3dc7c2f0dc7');
const candidate=root+'/supabase/migrations/202610020087_advisory_controlled_journey.sql',preflight=root+'/scripts/sql/preflight_advisory_controlled_journey_087.sql',verifier=root+'/scripts/sql/verify_advisory_controlled_journey_087.sql';
const footprintPath=__dirname+'/fixtures/advisory-087-footprint.json',pinsPath=__dirname+'/fixtures/advisory-087-verifier-baseline.json';
const digest=s=>`encode(sha256(convert_to((${s})::text,'UTF8')),'hex')`;
function once(s,a,b){assert.equal(s.split(a).length,2,a);return s.replace(a,b);}
let write=F.write;
write=once(write,' fj jsonb; fj_stage jsonb; fj_skip_current boolean:=false;',` fj jsonb; fj_stage jsonb; fj_skip_current boolean:=false;
 fj2 boolean:=false; chosen jsonb; route_reason text; opened_visit uuid;`);
write=once(write,' if fj is not null and p_action=\'stage\'',` fj2:=coalesce(fj->'format'='2'::jsonb,false);
 -- FJ-2 routes are selected only by completion. The established reopen flow
 -- may resume a previously visited stage, but cannot correct a live branch.
 if fj2 and p_action='stage' and not exists(select 1 from public.advisory_matter_activities a where a.matter_id=m.id and a.kind='reopen'
  and a.occurred_at >= coalesce((select max(coalesce(exited_at,entered_at)) from public.advisory_stage_visits where matter_id=m.id and kind='visit'),'-infinity'::timestamptz)) then raise exception 'ADVISORY_JOURNEY_USE_ADVANCE'; end if;
 if fj is not null and p_action='stage'`);
write=once(write,"  if exists(select 1 from public.advisory_issue_tasks where stage_id=stage.id",`  if fj2 then
   -- Optional skip is still a linear waiver, never a branch choice or a way
   -- to activate a dormant conditional stage. Only the current visit may skip.
   if not fj_skip_current or jsonb_array_length(fj_stage->'outcomes')<>1
    or (fj_stage#>>'{outcomes,0,requires_reason}')::boolean
    or fj_stage#>>'{outcomes,0,target}' is distinct from (select s.stage_key from public.advisory_matter_stages s where s.matter_id=m.id and s.position>stage.position order by s.position limit 1)
    or exists(select 1 from jsonb_array_elements(fj->'stages') s where s->>'key'=fj_stage#>>'{outcomes,0,target}' and (s->>'conditional')::boolean)
   then raise exception 'ADVISORY_BRANCH_COMPLETE_REQUIRED'; end if;
  end if;
  if exists(select 1 from public.advisory_issue_tasks where stage_id=stage.id`);
const linear=`  select * into next_stage from public.advisory_matter_stages where matter_id=m.id and position>stage.position
   and not exists(select 1 from public.advisory_stage_visits v where v.stage_id=advisory_matter_stages.id and v.kind='skip')
   order by position limit 1;`;
write=once(write,linear,`  if fj2 then
   if not fj_skip_current then
   select s into fj_stage from jsonb_array_elements(fj->'stages') s where s->>'key'=stage.stage_key;
   if jsonb_array_length(fj_stage->'outcomes')=1 and nullif(p_payload->>'outcome_key','') is null then chosen:=fj_stage#>'{outcomes,0}';
   else select o into chosen from jsonb_array_elements(fj_stage->'outcomes') o where o->>'key'=p_payload->>'outcome_key'; end if;
   if chosen is null then raise exception 'ADVISORY_OUTCOME_REQUIRED'; end if;
   route_reason:=nullif(btrim(p_payload->>'outcome_reason'),'');
   if length(coalesce(route_reason,''))>4000 or ((chosen->>'requires_reason')::boolean and route_reason is null) then raise exception 'ADVISORY_OUTCOME_REASON_REQUIRED'; end if;
   end if;
   -- A previous visit's skip never alters a later loop's route.
   select * into next_stage from public.advisory_matter_stages where matter_id=m.id and stage_key=coalesce(chosen->>'target',fj_stage#>>'{outcomes,0,target}');
   if next_stage.id is null then raise exception 'ADVISORY_ROUTE_INVALID'; end if;
  else
${linear}
  end if;`);
write=once(write,"values(m.id,next_stage.id,'visit',moment,actor);","values(m.id,next_stage.id,'visit',moment,actor) returning id into opened_visit;");
write=once(write," elsif p_action='work_state' then",`  if fj2 then
   event_detail:=event_detail||jsonb_build_object('journey_format',2,'actor_name',(select coalesce(nullif(staff_name,''),full_name) from public.user_profiles where id=actor),'from_visit_id',current_visit.id,'to_visit_id',opened_visit,
    'outcome',chosen,'outcome_reason',route_reason,
    'from_stage',fj_stage-'outcomes','target_stage',(select s-'outcomes' from jsonb_array_elements(fj->'stages') s where s->>'key'=next_stage.stage_key));
  end if;
 elsif p_action='work_state' then`);
let checks=F.afterContract.functions['advisory_workflow_checks(uuid)'].definition;
checks=once(checks,' has_next boolean; result jsonb;',' has_next boolean; result jsonb; fj jsonb; options jsonb;');
checks=once(checks,' has_next:=c.next_task_id',` select definition into fj from public.advisory_journey_snapshots where matter_id=m.id;
 if fj->'format'='2'::jsonb then
  select s->'outcomes' into options from jsonb_array_elements(fj->'stages') s where s->>'key'=stage.stage_key;
  -- Only the actual chosen route affects closing; unchosen branches are not
  -- incomplete work, and no skip/history is fabricated for them.
  uncompleted_stages:=case when visit.id is null and exists(
   select 1 from public.advisory_matter_activities a where a.matter_id=m.id and a.kind in ('stage_complete','stage_skip')
    and a.detail->>'journey_format'='2' and a.detail->>'next_stage_key'='close'
    and a.detail->>'from_visit_id'=(select v.id::text from public.advisory_stage_visits v where v.matter_id=m.id and v.kind='visit' order by v.entered_at desc,v.recorded_at desc,v.id desc limit 1)
  ) then 0 else 1 end;
 end if;
 has_next:=c.next_task_id`);
checks=once(checks,' return result;',` if fj->'format'='2'::jsonb then result:=result||jsonb_build_object('journey_format',2,'outcomes',coalesce(options,'[]'::jsonb),
  'route_stages',(select jsonb_agg(s-'outcomes' order by n) from jsonb_array_elements(fj->'stages') with ordinality x(s,n))); end if;
 return result;`);
let read=F.read;
read=once(read,"   'journey_snapshot',",`   'journey_path',(select coalesce(jsonb_agg(to_jsonb(v) order by v.entered_at,v.recorded_at,v.id),'[]'::jsonb) from public.advisory_stage_visits v where v.matter_id=p_matter_id and v.kind='visit'),
   'journey_decisions',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'actor_id',a.actor_id,'occurred_at',a.occurred_at,'kind',a.kind,'detail',a.detail) order by a.occurred_at,a.id),'[]'::jsonb) from public.advisory_matter_activities a where a.matter_id=p_matter_id and a.detail->>'journey_format'='2'),
   'journey_snapshot',`);
const beforeFootprint=JSON.parse(fs.readFileSync(F.footprintPath));
let manage=Object.entries(beforeFootprint.functions).find(([k])=>k.startsWith('advisory_journey_manage('))[1].definition;
manage=once(manage,"public.advisory086_valid_version(p_payload->'definition')","public.advisory087_valid_version(p_payload->'definition')");
const afterContract=structuredClone(F.afterContract);for(const [signature,definition] of [['advisory_control_write(uuid,text,jsonb,uuid,bigint)',write],['advisory_control_read(uuid,jsonb)',read],['advisory_workflow_checks(uuid)',checks]])afterContract.functions[signature].definition=definition;
const footprint=()=>F.footprint().replace("p.proname like 'advisory086_%'","(p.proname like 'advisory086_%' or p.proname like 'advisory087_%')");
const journeyRows=()=>`WITH rels as (select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (${F.tables.map(q).join(',')}) and c.relkind='r')
 select coalesce(jsonb_object_agg(relname,evidence::jsonb),'{}') from rels cross join lateral XMLTABLE('/table/row' PASSING query_to_xml(format('select jsonb_build_object(''count'',count(*),''sha256'',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text collate "C"),''[]''::jsonb)::text,''UTF8'')),''hex''))::text evidence from public.%I t',relname),false,false,'') COLUMNS evidence text PATH 'evidence') x`;
const snapshot=()=>`with prior as (${F.oldSnapshot}), journey as (${journeyRows()}) select jsonb_build_object('rows',(prior.state->'rows')||jsonb_build_object('journey',journey.state),'catalog',prior.state->'catalog','contract',prior.state->'contract') state from prior,journey journey(state)`;
const expected=()=>fs.existsSync(footprintPath)?JSON.parse(fs.readFileSync(footprintPath)):{};
const core=()=>fs.readFileSync(root+'/scripts/sql/advisory_controlled_journey_087_contract.sql','utf8')+'\n'+manage+';\n'+write+';\n'+read+';\n'+checks+';\n';
function migration(){return `-- FJ-2 / 087: HUMAN APPLY ONLY. No rows, seeds, backfill or Production RPC execution.
BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
LOCK TABLE ${[...new Set([...B.tables,...F.tables])].map(t=>'public.'+t).join(',')} IN SHARE MODE;
CREATE TEMP TABLE advisory087_before(state jsonb) ON COMMIT DROP;
INSERT INTO advisory087_before ${snapshot()};
DO $guard$ declare b jsonb; f jsonb; begin
 if current_user<>'postgres' then raise exception 'ADVISORY087_OWNER_REQUIRED'; end if;
 select state into b from advisory087_before; ${footprint()} into f;
 if ${digest("b->'contract'")}<>'${jsonHash(F.afterContract)}' or ${digest('f')}<>'${jsonHash(beforeFootprint)}' then raise exception 'ADVISORY087_BASELINE_MISMATCH'; end if;
end; $guard$;
${core()}
DO $preserve$ declare b jsonb; a jsonb; f jsonb; begin
 select state into b from advisory087_before; ${snapshot()} into a; ${footprint()} into f;
 if a->'rows' is distinct from b->'rows' or a->'catalog' is distinct from b->'catalog' or ${digest("a->'contract'")}<>'${jsonHash(afterContract)}' then raise exception 'ADVISORY087_PRESERVATION_FAILED'; end if;
 if ${digest('f')}<>'${jsonHash(expected())}' then raise exception 'ADVISORY087_FOOTPRINT_MISMATCH'; end if;
end; $preserve$;
COMMIT;\n`;}
function gate(post,pins={}){for(const k of ['rows_sha256','catalog_sha256'])if(pins[k])assert.match(pins[k],/^[a-f0-9]{64}$/);if(pins.candidate_sha256)assert.equal(pins.candidate_sha256,A.hash(migration()));const pin=k=>pins[k]?q(pins[k]):'NULL::text',contract=post?afterContract:F.afterContract,fp=post?expected():beforeFootprint;
return `-- 087 STATIC SELECT-ONLY ${post?'Post-Apply Verifier':'Preflight'}. Catalog inspection only; no helper/business RPC execution.
WITH state as (${snapshot()}), footprint as (${footprint()}), expected as (select ${q(JSON.stringify(fp))}::jsonb f,${q(JSON.stringify(contract))}::jsonb c),
checks as (select jsonb_build_object('owner',current_user='postgres','${post?'applied_state_exact':'accepted_086_contract'}',s.state->'contract'=e.c and f.state=e.f${post?`,
'reviewed_baseline_bound',${pin('rows_sha256')} is not null and ${pin('catalog_sha256')} is not null,
'historical_rows_unchanged',${digest("s.state->'rows'")} is not distinct from ${pin('rows_sha256')},
'old_catalog_preserved',${digest("s.state->'catalog'")} is not distinct from ${pin('catalog_sha256')}`:''}) value from state s,footprint f(state),expected e),
failed as (select coalesce(jsonb_agg(key order by key collate "C"),'[]') value from checks,jsonb_each(checks.value) c(key,passed) where passed is distinct from 'true'::jsonb)
select jsonb_build_object('gate_pass',failed.value='[]'::jsonb,'failed_checks',failed.value,'checks',checks.value,
'candidate_sha256','${A.hash(migration())}','accepted_086_sha256','${A.hash(fs.readFileSync(F.candidate))}',
'rows_sha256',${digest("s.state->'rows'")},'catalog_sha256',${digest("s.state->'catalog'")},'row_fingerprints',s.state->'rows',
'object_differences',(select coalesce(jsonb_agg(jsonb_build_object('group',g,'object',k,'expected',e.f#>array[g,k],'actual',f.state#>array[g,k]) order by g collate "C",k collate "C"),'[]') from lateral(select unnest(array['tables','functions']) g) groups,lateral(select jsonb_object_keys(coalesce(e.f->g,'{}')||coalesce(f.state->g,'{}')) k) keys where e.f#>array[g,k] is distinct from f.state#>array[g,k]),
'contract_differences',(select coalesce(jsonb_agg(k order by k collate "C"),'[]') from jsonb_object_keys((s.state->'contract')||e.c) k where s.state#>array['contract',k] is distinct from e.c->k),
'business_rpc_executed',false,'backfill',false,'broader_finance_differences_accepted',false) advisory087_${post?'verification':'preflight'} from state s,footprint f(state),expected e,checks,failed;\n`;}
const preflightSql=()=>gate(false),verifierSql=p=>gate(true,p);
module.exports={F,A,B,q,jsonHash,candidate,preflight,verifier,footprintPath,pinsPath,core,snapshot,footprint,afterContract,migration,preflightSql,verifierSql};
if(require.main===module){const op=process.argv[2],pins=JSON.parse(fs.readFileSync(pinsPath));if(op==='--generate'){fs.writeFileSync(candidate,migration());fs.writeFileSync(preflight,preflightSql());fs.writeFileSync(verifier,verifierSql(pins));}else if(op==='--check'){assert.equal(fs.readFileSync(candidate,'utf8'),migration());assert.equal(fs.readFileSync(preflight,'utf8'),preflightSql());assert.equal(fs.readFileSync(verifier,'utf8'),verifierSql(pins));}else if(op==='--bind-verifier'){assert.equal(process.argv.length,5);assert.equal(fs.readFileSync(candidate,'utf8'),migration());const p={candidate_sha256:A.hash(migration()),rows_sha256:process.argv[3],catalog_sha256:process.argv[4]};fs.writeFileSync(verifier,verifierSql(p));fs.writeFileSync(pinsPath,JSON.stringify(p,null,2)+'\n');}else throw Error('Use --generate, --check or --bind-verifier ROWS_SHA CATALOG_SHA');console.log('087 offline '+op+' SHA-256 '+A.hash(migration()));}
