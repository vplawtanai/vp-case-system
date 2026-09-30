/* eslint-disable @typescript-eslint/no-require-imports */
// Offline 082 builder: no credentials, network, or database execution.
const fs=require('node:fs'),assert=require('node:assert/strict');
const C=require('./non-litigation-initial-stage-artifacts.cjs'),{A,B}=C;
const sha081='96428a6517218f94ca32cca806f4658e4d964bdae20f2ed91d925d226f3e9693';
assert.equal(A.hash(fs.readFileSync(C.candidate)),sha081,'Applied 081 is immutable');
const q=A.quote,jsonHash=C.jsonHash,digest=s=>`encode(sha256(convert_to((${s})::text,'UTF8')),'hex')`;
const read='advisory_control_read(uuid,jsonb)',section='advisory_control_section(uuid,text,integer,uuid)',helper='advisory_overdue_work(uuid)';
const beforeContract=C.afterContract;
const helperDefinition=`CREATE OR REPLACE FUNCTION public.advisory_overdue_work(p_matter_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(matter_id uuid, source text, source_id uuid, title text, assignee_user_id uuid, assignee_name text, due_date date, overdue_days integer, is_next_action boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare today date:=(current_timestamp at time zone 'Asia/Bangkok')::date;
begin
 if not public.advisory076_allowed('read') then raise exception 'ADVISORY_FORBIDDEN' using errcode='42501'; end if;
 -- Invoker/RLS remains authoritative. Identity is (source, source_id), never title.
 return query
 with open_matters as materialized (
  select m.id,c.next_task_id,c.next_action,c.next_owner_id,c.next_due
  from public.advisory_matters m left join public.advisory_matter_control c on c.matter_id=m.id
  where (p_matter_id is null or m.id=p_matter_id)
   and m.status not in ('completed','cancelled') and c.closed_at is null
 )
 select m.id,'task'::text,t.id,t.title,t.assignee_user_id,
  coalesce(nullif(p.staff_name,''),p.full_name,t.assignee_name),t.due_date,today-t.due_date,
  coalesce(m.next_task_id=t.id,false)
 from open_matters m join public.advisory_issue_tasks t on t.advisory_matter_id=m.id
 left join public.user_profiles p on p.id=t.assignee_user_id
 where t.deleted_at is null and t.completed_at is null
  and t.status in ('pending','in_progress','waiting') and t.due_date<today
 union all
 select m.id,'next_action'::text,m.id,m.next_action,m.next_owner_id,
  coalesce(nullif(p.staff_name,''),p.full_name),m.next_due,today-m.next_due,true
 from open_matters m left join public.user_profiles p on p.id=m.next_owner_id
 where m.next_task_id is null and nullif(btrim(m.next_action),'') is not null and m.next_due<today;
end; $function$
`;
function replaceOnce(s,from,to){assert.equal(s.split(from).length,2,'Unique contract anchor: '+from);return s.replace(from,to);}
let readDefinition=beforeContract.functions[read].definition;
readDefinition=replaceOnce(readDefinition,' with items as (',` with overdue_items as materialized (select * from public.advisory_overdue_work()),
 ranked_overdue as (
  select o.*,row_number() over(partition by matter_id order by due_date,source COLLATE "C",source_id) position from overdue_items o
 ), overdue as (
  select matter_id,count(*) overdue_item_count,min(due_date) oldest_overdue_due,max(overdue_days) oldest_overdue_days,
   coalesce(max(overdue_days) filter(where is_next_action),0) next_action_overdue_days,
   jsonb_agg(to_jsonb(o)-'matter_id'-'position' order by due_date,source COLLATE "C",source_id) filter(where position<=3) overdue_preview
  from ranked_overdue o group by matter_id
 ), items as (`);
readDefinition=replaceOnce(readDefinition,' select m.*,cl.name client_name,',` select m.*,coalesce(o.overdue_item_count,0)>0 has_overdue_work,
 coalesce(o.overdue_item_count,0) overdue_item_count,o.oldest_overdue_due,coalesce(o.oldest_overdue_days,0) oldest_overdue_days,
 coalesce(o.next_action_overdue_days,0) next_action_overdue_days,coalesce(o.overdue_preview,'[]'::jsonb) overdue_preview,
 cl.name client_name,`);
readDefinition=replaceOnce(readDefinition,' left join public.advisory_matter_control c on c.matter_id=m.id',
 ' left join overdue o on o.matter_id=m.id\n left join public.advisory_matter_control c on c.matter_id=m.id');
readDefinition=replaceOnce(readDefinition,"when 'overdue' then i.closed_at is null and i.next_due<today","when 'overdue' then i.has_overdue_work");
readDefinition=replaceOnce(readDefinition,"'overdue',count(*) filter(where closed_at is null and next_due<today)",
 "'overdue',count(*) filter(where has_overdue_work),'overdue_items',coalesce(sum(overdue_item_count),0)");
let sectionDefinition=beforeContract.functions[section].definition;
sectionDefinition=replaceOnce(sectionDefinition,' return jsonb_build_object(\'items\',rows,\'total\',total);',` if p_section='tasks' then
  -- Enrich the existing bounded Task page from the same canonical source once.
  with overdue as materialized (select * from public.advisory_overdue_work(p_matter_id))
  select coalesce(jsonb_agg(t.value||jsonb_build_object('overdue_days',coalesce(o.overdue_days,0)) order by t.position),'[]'::jsonb)
  into rows from jsonb_array_elements(rows) with ordinality t(value,position)
  left join overdue o on o.source='task' and o.source_id=(t.value->>'id')::uuid;
 end if;
 return jsonb_build_object('items',rows,'total',total);`);
const afterContract={...beforeContract,functions:{...beforeContract.functions,
 [read]:{...beforeContract.functions[read],definition:readDefinition},
 [section]:{...beforeContract.functions[section],definition:sectionDefinition},
 [helper]:{...beforeContract.functions[read],definition:helperDefinition},
}};
const changed=[read,section,helper];
const candidate=A.root+'/supabase/migrations/202609300082_advisory_unified_overdue_work.sql';
const preflight=A.root+'/scripts/sql/preflight_advisory_unified_overdue_082.sql';
const verifier=A.root+'/scripts/sql/verify_advisory_unified_overdue_082.sql';
const pinsPath=__dirname+'/fixtures/non-litigation-082-verifier-baseline.json';
function snapshot(){return replaceOnce(C.snapshot(),"'advisory_control_section','advisory_workflow_checks')))","'advisory_control_section','advisory_workflow_checks','advisory_overdue_work')))");}
const beforeHash=jsonHash(beforeContract),afterHash=jsonHash(afterContract);
function migration(){return `-- Advisory 082: unified overdue READ contract. HUMAN APPLY ONLY.
-- One canonical item source; no business-row writes/backfill; table, column and lifecycle definitions unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE ${B.tables.map(n=>'public.'+n).join(',')} IN SHARE MODE;
CREATE TEMP TABLE advisory082_before(state jsonb) ON COMMIT DROP;
INSERT INTO advisory082_before ${snapshot()};
DO $baseline$ DECLARE s jsonb; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'ADVISORY082_OWNER_REQUIRED'; END IF;
 SELECT state INTO s FROM advisory082_before;
 IF ${digest("s->'contract'")} IS DISTINCT FROM '${beforeHash}' THEN
  RAISE EXCEPTION 'ADVISORY082_BASELINE_MISMATCH: accepted081'; END IF;
END; $baseline$;
-- BEGIN 082 CONTRACT: two existing read functions + one invoker-only helper.
${helperDefinition.trimEnd()};
REVOKE ALL ON FUNCTION public.${helper} FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.${helper} TO authenticated;
${readDefinition.trimEnd()};
${sectionDefinition.trimEnd()};
-- END 082 CONTRACT
DO $preservation$ DECLARE b jsonb; a jsonb; BEGIN
 SELECT state INTO b FROM advisory082_before;
 ${snapshot()} INTO a;
 IF a->'rows' IS DISTINCT FROM b->'rows' OR a->'catalog' IS DISTINCT FROM b->'catalog'
  OR ${digest("a->'contract'")} IS DISTINCT FROM '${afterHash}'
  OR EXISTS(SELECT 1 FROM jsonb_each(b#>'{contract,functions}') f
    WHERE (a#>ARRAY['contract','functions',f.key])-'definition' IS DISTINCT FROM f.value-'definition')
 THEN RAISE EXCEPTION 'ADVISORY082_PRESERVATION_FAILED'; END IF;
END; $preservation$;
COMMIT;
`;}
function comparison(contract){
 const expected=Object.fromEntries(['tables','functions','deltas'].map(g=>[g,Object.fromEntries(Object.entries(contract[g]).map(([k,v])=>[k,jsonHash(v)]))]));
 return `expected AS (SELECT ${q(JSON.stringify(expected))}::jsonb value),
 differences AS (SELECT coalesce(jsonb_agg(jsonb_build_object('component',g.name,'object',k.name,
 'expected_sha256',e.value#>>ARRAY[g.name,k.name],'actual_sha256',${digest("s.state#>ARRAY['contract',g.name,k.name]")})
 ORDER BY g.name COLLATE "C",k.name COLLATE "C"),'[]'::jsonb) value
 FROM state s,expected e,LATERAL (SELECT unnest(ARRAY['tables','functions','deltas']) name) g,
 LATERAL (SELECT jsonb_object_keys(coalesce(e.value->g.name,'{}')||coalesce(s.state#>ARRAY['contract',g.name],'{}')) name) k
 WHERE (e.value#>>ARRAY[g.name,k.name]) IS DISTINCT FROM ${digest("s.state#>ARRAY['contract',g.name,k.name]")})`;
}
function gate(post,pins={}){
 for(const k of ['rows_sha256','catalog_sha256'])if(pins[k]&&!/^[a-f0-9]{64}$/.test(pins[k]))throw Error('Invalid reviewed '+k);
 if(pins.candidate_sha256&&pins.candidate_sha256!==A.hash(migration()))throw Error('Reviewed candidate changed');
 const literal=k=>pins[k]?q(pins[k]):'NULL::text';
 return `-- 082 SELECT-only ${post?'Post-Apply Verifier':'Preflight'}; no business/RPC execution.
-- Verifier fails closed until NEW Human-reviewed Production hashes are bound.
-- Earlier UAT row snapshots are not substituted for current Production evidence.
WITH state AS MATERIALIZED (${snapshot()}), ${comparison(post?afterContract:beforeContract)},
 checks AS (SELECT jsonb_build_object('owner',current_user='postgres',
 '${post?'applied_state_exact':'accepted_081_contract_exact'}',${digest("state->'contract'")}='${post?afterHash:beforeHash}'${post?`,
 'reviewed_baseline_bound',${literal('rows_sha256')} IS NOT NULL AND ${literal('catalog_sha256')} IS NOT NULL,
 'historical_rows_unchanged',${digest("state->'rows'")} IS NOT DISTINCT FROM ${literal('rows_sha256')},
 'catalog_security_unchanged',${digest("state->'catalog'")} IS NOT DISTINCT FROM ${literal('catalog_sha256')}`:''}) value FROM state s(state)),
 failures AS (SELECT coalesce(jsonb_agg(key ORDER BY key COLLATE "C"),'[]') value FROM checks,jsonb_each(checks.value) c(key,passed) WHERE passed IS DISTINCT FROM 'true'::jsonb)
SELECT jsonb_build_object('gate_pass',failures.value='[]'::jsonb,'failed_checks',failures.value,
 'candidate_sha256','${A.hash(migration())}','accepted_081_candidate_sha256','${sha081}','accepted_081_contract_sha256','${beforeHash}',
 'checks',checks.value,'object_differences',differences.value,
 'rows_sha256',${digest("state->'rows'")},'catalog_sha256',${digest("state->'catalog'")},'row_fingerprints',state->'rows',
 'approved_rows_sha256',${literal('rows_sha256')},'approved_catalog_sha256',${literal('catalog_sha256')},
 'business_rpc_executed',false,'broader_finance_differences_accepted',false) advisory082_${post?'verification':'preflight'}
FROM state s(state),checks,failures,differences;
`;
}
const preflightSql=()=>gate(false),verifierSql=p=>gate(true,p);
module.exports={A,B,C,sha081,beforeContract,afterContract,beforeHash,afterHash,helper,read,section,changed,helperDefinition,readDefinition,sectionDefinition,candidate,preflight,verifier,pinsPath,snapshot,migration,preflightSql,verifierSql,jsonHash};
if(require.main===module){
 const option=process.argv[2],pins=fs.existsSync(pinsPath)?JSON.parse(fs.readFileSync(pinsPath)):{};
 if(option==='--generate'){
  fs.writeFileSync(candidate,migration());fs.writeFileSync(preflight,preflightSql());fs.writeFileSync(verifier,verifierSql(pins));
 }else if(option==='--check'){
  assert.equal(fs.readFileSync(candidate,'utf8'),migration());assert.equal(fs.readFileSync(preflight,'utf8'),preflightSql());assert.equal(fs.readFileSync(verifier,'utf8'),verifierSql(pins));
 }else if(option==='--bind-verifier'){
  assert.equal(process.argv.length,5,'Pass reviewed rows_sha256 then catalog_sha256');
  const reviewed={candidate_sha256:A.hash(fs.readFileSync(candidate)),rows_sha256:process.argv[3],catalog_sha256:process.argv[4]};
  const sql=verifierSql(reviewed);fs.writeFileSync(pinsPath,JSON.stringify(reviewed,null,2)+'\n');fs.writeFileSync(verifier,sql);
 }else throw Error('Expected --generate, --check, or --bind-verifier');
 console.log('082 offline '+option+'; candidate SHA-256 '+A.hash(migration())+'; NO database execution.');
}
