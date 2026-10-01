/* eslint-disable @typescript-eslint/no-require-imports */
// Offline generator. Never connects to a database or reads project credentials.
const fs=require('node:fs'),assert=require('node:assert/strict');
const E=require('./advisory-journey-families-artifacts.cjs'),{A,B,q,jsonHash}=E;
assert.equal(A.hash(fs.readFileSync(E.candidate)),'db0870e52ecafaead843d30a3a5620091f7f5a1fdbfdd54a19330fac87bad0e7');
const root=A.root, candidate=root+'/supabase/migrations/202610010086_advisory_flexible_journey.sql',preflight=root+'/scripts/sql/preflight_advisory_flexible_journey_086.sql',verifier=root+'/scripts/sql/verify_advisory_flexible_journey_086.sql';
const footprintPath=__dirname+'/fixtures/advisory-086-footprint.json',pinsPath=__dirname+'/fixtures/advisory-086-verifier-baseline.json';
const tables=['advisory_journey_variants','advisory_journey_versions','advisory_journey_snapshots','advisory_journey_requests'];
const digest=s=>`encode(sha256(convert_to((${s})::text,'UTF8')),'hex')`;
function once(s,a,b){assert.equal(s.split(a).length,2,a);return s.replace(a,b);}
const familySql=`create function public.advisory086_family(p_type text) returns text language sql immutable set search_path=public as $$ select case p_type ${E.catalog.work_types.map(t=>`when ${q(t.key)} then ${q(t.family)}`).join(' ')} end; $$;
create function public.advisory086_family_valid(p_family text) returns boolean language sql immutable set search_path=public as $$ select coalesce(p_family=any(array[${E.catalog.families.map(f=>q(f.key)).join(',')}]),false); $$;`;
const seed=E.catalog.families.map(f=>({family:f.key,definition:{name_th:'มาตรฐาน',name_en:'Standard',stages:f.stages.map((key,i)=>({key,name_th:f.stage_labels_th[i],name_en:f.stage_labels_en[i],required:!(f.key==='contract_business_documents'&&['internal_review','delivery_negotiation'].includes(key))}))}}));
const seedSql=seed.map(f=>`insert into public.advisory_journey_variants(id,family_key,is_default) values(md5('advisory086-variant:'||${q(f.family)})::uuid,${q(f.family)},true);
insert into public.advisory_journey_versions(id,variant_id,version,definition) values(md5('advisory086-version:'||${q(f.family)})::uuid,md5('advisory086-variant:'||${q(f.family)})::uuid,1,${q(JSON.stringify(f.definition))}::jsonb);`).join('\n');
let write=E.afterContract.functions['advisory_control_write(uuid,text,jsonb,uuid,bigint)'].definition;
write=once(write," checks jsonb; event_detail jsonb:='{}'; remaining bigint; old_role text;"," checks jsonb; event_detail jsonb:='{}'; remaining bigint; old_role text;\n fj jsonb; fj_stage jsonb; fj_skip_current boolean:=false;");
write=once(write,' event_kind:=p_action;',` event_kind:=p_action;
 select definition into fj from public.advisory_journey_snapshots where matter_id=m.id;
 if fj is not null and p_action='stage' and (exists(select 1 from public.advisory_stage_visits where matter_id=m.id and kind='visit' and exited_at is null) or not exists(select 1 from public.advisory_stage_visits v join public.advisory_matter_stages s on s.id=v.stage_id where v.matter_id=m.id and s.stage_key=p_payload->>'stage_key' and v.kind='visit' and v.exited_at is not null)) then raise exception 'ADVISORY_JOURNEY_USE_ADVANCE'; end if;
 if fj is not null and p_action='stage_skip' then
  select value into fj_stage from jsonb_array_elements(fj->'stages') where value->>'key'=p_payload->>'stage_key';
  if fj_stage is null or (fj_stage->>'required')::boolean or fj_stage->>'key'='close' then raise exception 'ADVISORY_JOURNEY_REQUIRED_STAGE'; end if;
  if length(btrim(coalesce(p_payload->>'reason',''))) not between 1 and 4000 then raise exception 'ADVISORY_JOURNEY_REASON_REQUIRED'; end if;
  select * into stage from public.advisory_matter_stages where matter_id=m.id and stage_key=p_payload->>'stage_key';
  select exists(select 1 from public.advisory_stage_visits where stage_id=stage.id and kind='visit' and exited_at is null) into fj_skip_current;
  if exists(select 1 from public.advisory_issue_tasks where stage_id=stage.id and advisory_matter_id=m.id and deleted_at is null and status not in ('completed','cancelled')) then raise exception 'ADVISORY_STAGE_TASKS_OPEN'; end if;
  if not fj_skip_current and exists(select 1 from public.advisory_issue_tasks where id=c.next_task_id and stage_id=stage.id) then raise exception 'ADVISORY_NEXT_ACTION_RESOLUTION_REQUIRED'; end if;
 end if;`);
write=once(write," elsif p_action='stage_complete' then"," elsif p_action='stage_complete' or fj_skip_current then");
write=once(write,"  update public.advisory_stage_visits set exited_at=moment,exit_reason='completed' where id=current_visit.id;",`  update public.advisory_stage_visits set exited_at=moment,exit_reason=case when fj_skip_current then 'skipped' else 'completed' end where id=current_visit.id;
  if fj_skip_current then insert into public.advisory_stage_visits(matter_id,stage_id,kind,actor_id) values(m.id,stage.id,'skip',actor); end if;`);
write=once(write," if p_action in ('create','stage','stage_skip') then\n  if not exists",` if p_action='create' then
  perform public.advisory086_snapshot(m.id,m.matter_type,nullif(p_payload->>'variant_id','')::uuid,nullif(p_payload->>'journey_version_id','')::uuid);
 end if;
 if p_action in ('create','stage','stage_skip') and not fj_skip_current then
  if not exists`);
write=once(write,"  event_detail:=jsonb_build_object('completed_stage_id',stage.id,'completed_stage_key',stage.stage_key,", "  event_detail:=jsonb_build_object(case when fj_skip_current then 'skipped_stage_id' else 'completed_stage_id' end,stage.id,case when fj_skip_current then 'skipped_stage_key' else 'completed_stage_key' end,stage.stage_key,");
write=once(write," if p_action='stage_complete' then result:=result||event_detail; end if;"," if p_action='stage_complete' or fj_skip_current then result:=result||event_detail; end if;");
let read=E.afterContract.functions['advisory_control_read(uuid,jsonb)'].definition;
read=once(read,"   'state_history',",`   'journey_snapshot',(select to_jsonb(j) from public.advisory_journey_snapshots j where matter_id=p_matter_id),
   'state_history',`);
read=once(read,"jsonb_agg(to_jsonb(s)||jsonb_build_object('visits'",`jsonb_agg(to_jsonb(s)||coalesce((select element-'key' from public.advisory_journey_snapshots j, lateral jsonb_array_elements(j.definition->'stages') element where j.matter_id=s.matter_id and element->>'key'=s.stage_key),'{}'::jsonb)||jsonb_build_object('visits'`);
read=once(read,' st.stage_key,st.template_key,v.entered_at,',` st.stage_key,st.template_key,v.entered_at,
 (select s->>'name_th' from public.advisory_journey_snapshots j,lateral jsonb_array_elements(j.definition->'stages') s where j.matter_id=m.id and s->>'key'=st.stage_key) stage_name_th,
 (select s->>'name_en' from public.advisory_journey_snapshots j,lateral jsonb_array_elements(j.definition->'stages') s where j.matter_id=m.id and s->>'key'=st.stage_key) stage_name_en,`);
const afterContract=structuredClone(E.afterContract);afterContract.functions['advisory_control_write(uuid,text,jsonb,uuid,bigint)'].definition=write;afterContract.functions['advisory_control_read(uuid,jsonb)'].definition=read;
// Ignore ONLY incoming references owned by our new, separately fingerprinted tables.
// No old relation column, policy, grant, index or function is omitted.
const oldSnapshot=E.snapshot().replace("WHERE c.confrelid=t.oid AND c.contype='f'",`WHERE c.confrelid=t.oid AND c.contype='f' AND c.conrelid NOT IN (select c2.oid from pg_class c2 join pg_namespace n2 on n2.oid=c2.relnamespace where n2.nspname='public' and c2.relname in (${tables.map(q).join(',')}))`);
assert.notEqual(oldSnapshot,E.snapshot());
function footprint(){return `WITH rels as (select c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'advisory_journey_%' and c.relkind in ('r','p')),
 funcs as (select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'advisory086_%' or p.proname in ('advisory_journey_catalog','advisory_journey_manage')))
 select jsonb_build_object('tables',coalesce((select jsonb_object_agg(r.relname,jsonb_build_object('owner',pg_get_userbyid(r.relowner),'rls',r.relrowsecurity,'force_rls',r.relforcerowsecurity,'acl',r.relacl::text,
 'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,'acl',a.attacl::text) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=r.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid,true),'validated',convalidated) order by conname collate "C"),'[]') from pg_constraint where conrelid=r.oid and contype<>'n'),
 'indexes',(select coalesce(jsonb_agg(pg_get_indexdef(indexrelid) order by indexrelid::regclass::text collate "C"),'[]') from pg_index where indrelid=r.oid),
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',polname,'command',polcmd,'roles',(select jsonb_agg(rolname order by rolname collate "C") from pg_roles where oid=any(polroles)),'permissive',polpermissive,'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) order by polname collate "C"),'[]') from pg_policy where polrelid=r.oid),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(oid,true),'enabled',tgenabled) order by tgname collate "C"),'[]') from pg_trigger where tgrelid=r.oid and not tgisinternal))) from rels r),'{}'),
 'functions',coalesce((select jsonb_object_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'acl',p.proacl::text,'execute',(select jsonb_object_agg(role,has_function_privilege(role,p.oid,'EXECUTE')) from unnest(array['anon','authenticated','service_role']) role))) from funcs p),'{}'))`;}
function newRows(){return `WITH rels as (select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (${tables.map(q).join(',')}) and c.relkind='r')
 select coalesce(jsonb_object_agg(relname,evidence::jsonb),'{}') from rels cross join lateral XMLTABLE('/table/row' PASSING query_to_xml(format('select coalesce(jsonb_agg(to_jsonb(t)-''created_at''-''captured_at''-''recorded_at'' order by (to_jsonb(t)-''created_at''-''captured_at''-''recorded_at'')::text collate "C"),''[]''::jsonb)::text evidence from public.%I t',relname),false,false,'') COLUMNS evidence text PATH 'evidence') x`;}
const footprintExpected=()=>fs.existsSync(footprintPath)?JSON.parse(fs.readFileSync(footprintPath)):{};
function core(){return familySql+'\n'+fs.readFileSync(root+'/scripts/sql/advisory_flexible_journey_086_contract.sql','utf8')+'\n'+write+';\n'+read+';\n'+seedSql+`\nDO $permissions$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'advisory086_%' or p.proname in ('advisory_journey_catalog','advisory_journey_manage')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f); end loop; end; $permissions$;
grant execute on function public.advisory086_admin(),public.advisory_journey_catalog(text),public.advisory_journey_manage(uuid,text,jsonb,uuid,bigint) to authenticated;\n`;}
function migration(){return `-- FJ-1 / 086: HUMAN APPLY ONLY. No existing Matter/Stage row mutation or backfill.
BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
LOCK TABLE ${B.tables.map(t=>'public.'+t).join(',')} IN SHARE MODE;
CREATE TEMP TABLE advisory086_before(state jsonb) ON COMMIT DROP;
INSERT INTO advisory086_before ${oldSnapshot};
DO $guard$ declare b jsonb; f jsonb; begin
 if current_user<>'postgres' then raise exception 'ADVISORY086_OWNER_REQUIRED'; end if;
 select state into b from advisory086_before; ${footprint()} into f;
 if ${digest("b->'contract'")}<>'${jsonHash(E.afterContract)}' or f<>'{"tables":{},"functions":{}}'::jsonb then raise exception 'ADVISORY086_BASELINE_MISMATCH'; end if;
end; $guard$;
${core()}
DO $preserve$ declare b jsonb; a jsonb; f jsonb; begin
 select state into b from advisory086_before; ${oldSnapshot} into a; ${footprint()} into f;
 if a->'rows' is distinct from b->'rows' or a->'catalog' is distinct from b->'catalog' or ${digest("a->'contract'")}<>'${jsonHash(afterContract)}' then raise exception 'ADVISORY086_PRESERVATION_FAILED'; end if;
 if ${digest('f')}<>'${jsonHash(footprintExpected())}' then raise exception 'ADVISORY086_FOOTPRINT_MISMATCH'; end if;
end; $preserve$;
COMMIT;\n`;}
function gate(post,pins={}){
 for(const k of ['rows_sha256','catalog_sha256'])if(pins[k])assert.match(pins[k],/^[a-f0-9]{64}$/);
 if(pins.candidate_sha256)assert.equal(pins.candidate_sha256,A.hash(migration()));
 const pin=k=>pins[k]?q(pins[k]):'NULL::text';
 const expectedSeed=Object.fromEntries(tables.map(t=>[t,[]]));
 // Seed data is captured from exact local DDL, not used as a Production historical-row baseline.
 const seedsPath=__dirname+'/fixtures/advisory-086-seed.json';const expectedRows=fs.existsSync(seedsPath)?JSON.parse(fs.readFileSync(seedsPath)):expectedSeed;
 return `-- 086 STATIC SELECT-ONLY ${post?'Post-Apply Verifier':'Preflight'}. No business/helper RPC execution.
WITH old_state as (${oldSnapshot}), footprint as (${footprint()}), seeded as (${newRows()}),
 checks as (select jsonb_build_object('owner',current_user='postgres','${post?'applied_state_exact':'accepted_085_contract'}',${digest("s.state->'contract'")}='${jsonHash(post?afterContract:E.afterContract)}',
 'new_objects_exact',f.state=${q(JSON.stringify(post?footprintExpected():{tables:{},functions:{}}))}::jsonb${post?`,
 'reviewed_baseline_bound',${pin('rows_sha256')} is not null and ${pin('catalog_sha256')} is not null,
 'historical_rows_unchanged',${digest("s.state->'rows'")} is not distinct from ${pin('rows_sha256')},
 'old_catalog_preserved',${digest("s.state->'catalog'")} is not distinct from ${pin('catalog_sha256')},
 'only_template_seeds_no_backfill',r.state=${q(JSON.stringify(expectedRows))}::jsonb`:''}) value from old_state s,footprint f(state),seeded r(state)),
 failed as (select coalesce(jsonb_agg(key order by key collate "C"),'[]') value from checks,jsonb_each(checks.value) c(key,passed) where c.passed is distinct from 'true'::jsonb)
 select jsonb_build_object('gate_pass',failed.value='[]'::jsonb,'failed_checks',failed.value,'checks',checks.value,
 'candidate_sha256','${A.hash(migration())}','accepted_085_sha256','${A.hash(fs.readFileSync(E.candidate))}',
 'rows_sha256',${digest("s.state->'rows'")},'catalog_sha256',${digest("s.state->'catalog'")},'row_fingerprints',s.state->'rows',
 'object_differences',(select coalesce(jsonb_agg(jsonb_build_object('group',g,'object',k,'actual',f.state#>array[g,k],'expected',e#>array[g,k]) order by g collate "C",k collate "C"),'[]') from (select ${q(JSON.stringify(post?footprintExpected():{tables:{},functions:{}}))}::jsonb e) expected,cross_dummy lateral_dummy, lateral(select unnest(array['tables','functions']) g) groups,lateral(select jsonb_object_keys(coalesce(e->g,'{}')||coalesce(f.state->g,'{}')) k) keys where e#>array[g,k] is distinct from f.state#>array[g,k]),
 'business_rpc_executed',false,'backfill',false,'broader_finance_differences_accepted',false) advisory086_${post?'verification':'preflight'} from old_state s,footprint f(state),checks,failed;\n`.replace(',cross_dummy lateral_dummy','');
}
const preflightSql=()=>gate(false),verifierSql=p=>gate(true,p);
module.exports={E,A,B,q,jsonHash,tables,seed,core,oldSnapshot,footprint,newRows,afterContract,write,read,candidate,preflight,verifier,pinsPath,footprintPath,migration,preflightSql,verifierSql};
if(require.main===module){const op=process.argv[2],pins=JSON.parse(fs.readFileSync(pinsPath));
 if(op==='--generate'){fs.writeFileSync(candidate,migration());fs.writeFileSync(preflight,preflightSql());fs.writeFileSync(verifier,verifierSql(pins));}
 else if(op==='--check'){assert.equal(fs.readFileSync(candidate,'utf8'),migration());assert.equal(fs.readFileSync(preflight,'utf8'),preflightSql());assert.equal(fs.readFileSync(verifier,'utf8'),verifierSql(pins));}
 else if(op==='--bind-verifier'){assert.equal(process.argv.length,5);assert.equal(fs.readFileSync(candidate,'utf8'),migration());const p={candidate_sha256:A.hash(migration()),rows_sha256:process.argv[3],catalog_sha256:process.argv[4]};fs.writeFileSync(verifier,verifierSql(p));fs.writeFileSync(pinsPath,JSON.stringify(p,null,2)+'\n');}
 else throw Error('Use --generate, --check or --bind-verifier ROWS_SHA CATALOG_SHA');
 console.log('086 offline '+op+' SHA-256 '+A.hash(migration()));}
