/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable native PostgreSQL, private Unix socket only. No project credentials.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),{spawnSync,spawn}=require('node:child_process');
const C=require('./non-litigation-initial-stage-artifacts.cjs'),{A,B}=C;
const bin='/Applications/Postgres.app/Contents/Versions/18/bin',locale=process.env.ADVISORY081_TEST_LOCALE||'en_US.UTF-8';
assert.ok(['C','en_US.UTF-8'].includes(locale));
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),q=A.quote;
let dir,started=false,baseline,pins,oldMatter,oldRequest,oldResponse;
function run(name,args,input,fail=false){const r=spawnSync(bin+'/'+name,args,{input,encoding:'utf8',env:{PATH:process.env.PATH,LC_ALL:'C',LANG:'C'},maxBuffer:32e6});if(!fail)assert.equal(r.status,0,r.stderr||r.error?.message);return fail?r:r.stdout.trim();}
function args(){return ['-X','-qAt','-v','ON_ERROR_STOP=1','-h',dir,'-p','58481','-U','postgres','-d','postgres'];}
function sql(s,fail=false){return run('psql',args(),s,fail);}
function auth(n=1){return `set role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',false);select set_config('request.jwt.claims',${q(JSON.stringify({sub:id(n),email:`person${n}@example.invalid`,role:'authenticated'}))},false);`;}
function as(s,n=1){return JSON.parse(sql(auth(n)+s).split('\n').at(-1));}
function version(m){return m?+sql(`select coalesce((select version from advisory_matter_control where matter_id='${m}'),0)`):0;}
function call(m,action,payload={},request=crypto.randomUUID(),v=version(m)){return `select advisory_control_write(${m?q(m):'null'},${q(action)},${q(JSON.stringify(payload))},'${request}',${v});`;}
function write(m,action,payload={}){return as(call(m,action,payload));}
function payload(type='general_advisory',template='general'){return {client_id:id(90),title:'SYNTHETIC 081 '+type,lead_id:id(2),matter_type:type,template};}
function create(type,template){return write(null,'create',payload(type,template)).matter_id;}
function snapshot(){return JSON.parse(sql(C.snapshot()));}
function auditFingerprint(){return sql(`select encode(sha256(convert_to(coalesce(string_agg(to_jsonb(a)::text,E'\\n' order by to_jsonb(a)::text COLLATE "C"),''),'UTF8')),'hex') from case_audit_logs a`);}
function gate(s){return JSON.parse(sql('begin read only;'+s+'rollback;'));}
function reject(query,re,n=1){const r=sql(auth(n)+query,true);assert.notEqual(r.status,0);assert.match(r.stderr,re);}
function session(query){return new Promise(resolve=>{const p=spawn(bin+'/psql',args(),{env:{PATH:process.env.PATH,LC_ALL:'C'}});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('close',code=>resolve({code,out,err}));p.stdin.end(auth()+query);});}
function current(m){return sql(`select id from advisory_stage_visits where matter_id='${m}' and kind='visit' and exited_at is null`);}
function checks(m){return as(`select advisory_workflow_checks('${m}')`);}
before(()=>{
 dir=fs.mkdtempSync('/private/tmp/vp-advisory081-');fs.chmodSync(dir,0o700);
 run('initdb',['-D',dir+'/data','-U','postgres','-A','trust','--encoding=UTF8','--locale='+locale]);
 run('pg_ctl',['-D',dir+'/data','-l',dir+'/server.log','-o',`-F -k ${dir} -p 58481 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
 const source=fs.readFileSync(__dirname+'/non-litigation-postgres.test.cjs','utf8');
 const fixture=source.slice(source.indexOf('function fixture(){'),source.indexOf('\nbefore(()=>'));
 sql(vm.runInNewContext('('+fixture+')()',{A,id}));
 const pre076=JSON.parse(sql(A.snapshotSql()));sql(A.migration(pre076));
 const pre077=JSON.parse(sql(B.snapshot()));
 // Reconstruct accepted migrations only in the disposable fixture. 081 itself
 // is applied byte-for-byte, with no baseline substitution or weakened guard.
 let local077=fs.readFileSync(B.candidate,'utf8');
 for(const key of ['catalog','functions'])local077=local077.replaceAll(B.baseline[key],C.jsonHash(pre077.old[key]));
 sql(local077);
 oldRequest=call(null,'create',payload('legacy_unset','general'));
 oldResponse=as(oldRequest);oldMatter=oldResponse.matter_id;
 const history=create('contract_review','contract');write(history,'stage',{stage_key:'intake'});write(history,'stage',{stage_key:'information'});
 baseline=snapshot();pins={rows_sha256:C.jsonHash(baseline.rows),catalog_sha256:C.jsonHash(baseline.catalog),candidate_sha256:A.hash(C.migration())};
 const pre=gate(fs.readFileSync(C.preflight,'utf8'));
 assert.equal(pre.gate_pass,true,JSON.stringify(pre));assert.deepEqual(pre.object_differences,[]);
 assert.equal(pre.rows_sha256,pins.rows_sha256);assert.equal(pre.catalog_sha256,pins.catalog_sha256);
 fs.writeFileSync(dir+'/preflight.json',JSON.stringify(pre,null,2));
 const candidate=fs.readFileSync(C.candidate,'utf8');
 for(const mutation of [
  'grant execute on function advisory_control_write(uuid,text,jsonb,uuid,bigint) to anon;',
  'alter policy advisory076_read on advisory_matter_stages using(false);',
  'alter function advisory076_template(text) volatile;',
 ]){
  const drifted=JSON.parse(sql('begin;'+mutation+C.preflightSql()+'rollback;'));
  assert.equal(drifted.gate_pass,false);assert.ok(drifted.object_differences.length>0);
  const failed=sql('begin;'+mutation+candidate.replace(/^BEGIN;$/m,'').replace(/COMMIT;\s*$/,'ROLLBACK;'),true);
  assert.notEqual(failed.status,0);assert.match(failed.stderr,/BASELINE_MISMATCH: accepted077/);
  assert.deepEqual(snapshot(),baseline);
 }
 sql(candidate.replace(/COMMIT;\s*$/,'ROLLBACK;'));assert.deepEqual(snapshot(),baseline,'Dry local rollback restores exact state');
 sql(candidate);
});
after(()=>{if(started)run('pg_ctl',['-D',dir+'/data','-m','fast','-w','stop']);console.log('081 local evidence:',dir,'locale:',locale);});

test('081 changes only create initialization; applied 076/077 files and security remain exact',()=>{
 assert.equal(C.afterDefinition.replace(C.initialization,C.anchor),C.beforeDefinition);
 assert.equal(sql(`select pg_get_functiondef('${C.signature}'::regprocedure)`),C.afterDefinition.trimEnd());
 assert.equal(A.hash(fs.readFileSync(A.candidate)),C.sha076);assert.equal(A.hash(fs.readFileSync(B.candidate)),C.sha077);
 assert.deepEqual(snapshot().contract,C.afterContract);
 assert.deepEqual(snapshot().catalog,baseline.catalog);assert.deepEqual(snapshot().rows,baseline.rows);
 const code=C.initialization;
 assert.doesNotMatch(code,/intake|brief|รับเรื่อง|general|contract_review/);
 assert.equal(sql(`select pg_get_function_result('${C.signature}'::regprocedure)`),'jsonb');
});
test('SELECT-only verifier requires reviewed Production pins and detects row, column, policy, grant, and function drift',()=>{
 const unbound=gate(C.verifierSql());assert.equal(unbound.gate_pass,false);assert.ok(unbound.failed_checks.includes('reviewed_baseline_bound'));
 const good=gate(C.verifierSql(pins));assert.equal(good.gate_pass,true,JSON.stringify(good));assert.deepEqual(good.object_differences,[]);
 fs.writeFileSync(dir+'/local-verifier.json',JSON.stringify(good,null,2));
 for(const [mutation,failed]of [
  [`update advisory_matters set title='Unexpected' where id='${oldMatter}';`,'historical_rows_unchanged'],
  [`update advisory_stage_visits set entered_at=entered_at-interval '1 day';`,'historical_rows_unchanged'],
  [`delete from advisory_control_requests where request_id=(select request_id from advisory_control_requests limit 1);`,'historical_rows_unchanged'],
  ['alter table advisory_matters add column synthetic_drift text;','no_schema_table_column_changes'],
  ['alter policy advisory076_read on advisory_matter_team using(false);','applied_state_exact'],
  ['grant execute on function advisory_control_write(uuid,text,jsonb,uuid,bigint) to anon;','rpc_security_unchanged'],
  ['alter function advisory_workflow_checks(uuid) security definer;','applied_state_exact'],
 ]){
  const r=JSON.parse(sql('begin;'+mutation+C.verifierSql(pins)+'rollback;'));assert.equal(r.gate_pass,false,mutation);assert.ok(r.failed_checks.includes(failed),JSON.stringify(r));
 }
 assert.deepEqual(snapshot().rows,baseline.rows);
 const wrong=gate(C.verifierSql({...pins,rows_sha256:'0'.repeat(64)}));assert.equal(wrong.historical_rows_unchanged,false);
 const pre=gate(C.preflightSql());assert.equal(pre.gate_pass,false);assert.ok(pre.object_differences.some(d=>d.object===C.signature));
 const again=sql(C.migration(),true);assert.notEqual(again.status,0);assert.match(again.stderr,/BASELINE_MISMATCH/);
});
test('reviewed Production binding is exact; digest-boundary simulations accept matching hashes and reject either mismatch',()=>{
 const reviewed={
  candidate_sha256:'96428a6517218f94ca32cca806f4658e4d964bdae20f2ed91d925d226f3e9693',
  rows_sha256:'b070a6de7383b74902693822ccab7a5fb2b17bb90965f8c5cf542fbcfeef37e8',
  catalog_sha256:'0d9fbb5a5e1c05da206abf934753a5318de35e8cd7ce1463216e4b28a0c70491',
 };
 assert.deepEqual(JSON.parse(fs.readFileSync(C.pinsPath)),reviewed);
 assert.equal(A.hash(fs.readFileSync(C.candidate)),reviewed.candidate_sha256);
 assert.equal(C.jsonHash(C.beforeContract),'f85937506d3fec583f084873c6ef7be13155cd671ad87150401cd7785d20edb8');
 const delivered=fs.readFileSync(C.verifier,'utf8');assert.equal(delivered,C.verifierSql(reviewed));
 const realLocal=gate(delivered);
 assert.equal(realLocal.checks.reviewed_baseline_bound,true);
 assert.equal(realLocal.approved_rows_sha256,reviewed.rows_sha256);
 assert.equal(realLocal.approved_catalog_sha256,reviewed.catalog_sha256);
 assert.equal(realLocal.gate_pass,false,'Production pins must reject synthetic fixture rows');
 assert.ok(realLocal.failed_checks.includes('historical_rows_unchanged'));
 assert.equal(realLocal.applied_state_exact,true);
 assert.equal(realLocal.business_rpc_executed,false);
 assert.equal(realLocal.broader_finance_differences_accepted,false);
 // The Production rows are not available locally and cannot be reconstructed
 // from their digest. Simulate only observed digest outputs at the comparison
 // boundary in memory. Actual row/catalog hashing and drift are tested above.
 // Neither the delivered verifier nor the reviewed baseline is rewritten.
 const simulate=(rows,catalog)=>{
  let query=delivered;
  for(const [key,value]of [['rows',rows],['catalog',catalog]]){
   const expression=`encode(sha256(convert_to((state->'${key}')::text,'UTF8')),'hex')`;
   assert.equal(query.split(expression).length-1,2);
   query=query.replaceAll(expression,q(value)+'::text');
  }
  return gate(query);
 };
 const matched=simulate(reviewed.rows_sha256,reviewed.catalog_sha256);
 assert.equal(matched.gate_pass,true);assert.deepEqual(matched.failed_checks,[]);
 assert.deepEqual(matched.object_differences,[]);
 const rowDrift=simulate('0'.repeat(64),reviewed.catalog_sha256);
 assert.equal(rowDrift.gate_pass,false);assert.deepEqual(rowDrift.failed_checks,['historical_rows_unchanged']);
 const catalogDrift=simulate(reviewed.rows_sha256,'0'.repeat(64));
 assert.equal(catalogDrift.gate_pass,false);assert.deepEqual(catalogDrift.failed_checks,['no_schema_table_column_changes']);
 assert.equal(fs.readFileSync(C.verifier,'utf8'),delivered);
});
test('existing unset Matter, Stage history, and pre-081 saved create retry remain unchanged',()=>{
 assert.equal(current(oldMatter),'');assert.deepEqual(as(oldRequest),oldResponse);
 assert.equal(current(oldMatter),'');assert.deepEqual(snapshot().rows,baseline.rows);
 assert.equal(checks(id(101)).current_stage_id,null);
});
for(const [type,template,first]of [['general_advisory','general','intake'],['legal_opinion','opinion','brief'],['contract_review','contract','intake'],['employment_hr','contract','intake'],['license_regulatory','license','intake'],['negotiation','negotiation','intake']]){
 test(type+': actual plan, exactly one visit, real creation moment, lifecycle/Work State/Lead and one Activity',()=>{
  const lower=sql('select clock_timestamp()'),m=create(type,template);
  const detail=as(`select advisory_control_read('${m}')`),matter=detail.items[0];
  assert.equal(matter.status,'active');assert.equal(matter.work_state,'working');assert.equal(matter.lead_id,id(2));
  assert.equal(matter.stage_key,first);assert.equal(matter.template_key,template);assert.equal(matter.next_action,null);assert.equal(matter.next_owner_id,null);
  const plan=JSON.parse(sql(`select jsonb_agg(stage_key order by position) from advisory_matter_stages where matter_id='${m}'`));
  assert.deepEqual(plan,JSON.parse(sql(`select to_jsonb(advisory076_template('${template}'))`)));
  const count=sql(`select count(*) from advisory_stage_visits where matter_id='${m}' and kind='visit' and exited_at is null`);assert.equal(count,'1');
  assert.equal(sql(`select bool_and(v.entered_at=w.started_at and v.entered_at>='${lower}'::timestamptz and v.entered_at<=clock_timestamp() and v.actor_id='${id(1)}') from advisory_stage_visits v join advisory_work_state_events w using(matter_id) where v.matter_id='${m}'`),'t');
  const activities=as(`select advisory_control_section('${m}','activity',0)`);
  // Check storage too: a single truthful create event, not a second Stage event.
  assert.ok(activities);
  const activity=JSON.parse(sql(`select jsonb_agg(to_jsonb(a)) from advisory_matter_activities a where matter_id='${m}'`));
  assert.equal(activity.length,1);assert.equal(activity[0].kind,'create');assert.equal(activity[0].detail.initial_stage.stage_key,first);
  assert.equal(activity[0].detail.initial_stage.visit_id,current(m));assert.equal(matter.version,1);
 });
}
test('same-request concurrent create and subsequent retry have one Matter/visit/Activity and unchanged response',async()=>{
 const request=crypto.randomUUID(),body=call(null,'create',payload('legal_opinion','opinion'),request,0);
 const responses=await Promise.all([session(body),session(body)]);for(const r of responses)assert.equal(r.code,0,r.err);
 assert.equal(responses[0].out,responses[1].out);
 const result=JSON.parse(responses[0].out.trim().split('\n').at(-1));assert.deepEqual(as(body),result);
 assert.deepEqual(Object.keys(result).sort(),['item_id','matter_id','version']);assert.equal(result.item_id,null);assert.equal(result.version,1);
 for(const table of ['advisory_stage_visits','advisory_matter_activities'])assert.equal(sql(`select count(*) from ${table} where matter_id='${result.matter_id}'`),'1');
 assert.equal(sql(`select count(*) from advisory_control_requests where request_id='${request}'`),'1');
 reject(call(null,'create',{...payload('legal_opinion','opinion'),title:'Changed'},request,0),/RETRY_MISMATCH/);
});
test('independent concurrent create requests preserve unique numbering and one current Stage per Matter',async()=>{
 const responses=await Promise.all([session(call(null,'create',payload())),session(call(null,'create',payload()))]);
 for(const r of responses)assert.equal(r.code,0,r.err);
 const ids=responses.map(r=>JSON.parse(r.out.trim().split('\n').at(-1)).matter_id);assert.notEqual(ids[0],ids[1]);
 assert.equal(sql(`select count(distinct matter_no) from advisory_matters where id in (${ids.map(q)})`),'2');
 assert.equal(sql(`select count(*) from advisory_stage_visits where matter_id in (${ids.map(q)}) and exited_at is null`),'2');
});
test('first eligible Stage comes from actual numeric plan order; terminal close is skipped',()=>{
 const prior=snapshot();
 const result=sql(`begin;create or replace function advisory076_template(p_key text) returns text[] language sql immutable set search_path=public as $$select array['close','arbitrary_first','arbitrary_second']$$;${auth()}create temp table synthetic_result as ${call(null,'create',payload()).replace(/;$/,'')} AS response;select stage_key from advisory_stage_visits v join advisory_matter_stages s on s.id=v.stage_id where v.matter_id=(select (response->>'matter_id')::uuid from synthetic_result);rollback;`);
 assert.equal(result.split('\n').at(-1),'arbitrary_first');
 assert.deepEqual(snapshot(),prior);
});
test('no operational first Stage or visit-insert failure rolls back Matter, numbering, plan, Lead, Work State, audit, request',()=>{
 const prior=snapshot(),auditBefore=auditFingerprint();
 for(const keys of ["array['close']","array[]::text[]"]){
  reject(`begin;reset role;create or replace function advisory076_template(p_key text) returns text[] language sql immutable set search_path=public as $$select ${keys}$$;${auth()}${call(null,'create',payload())}`,/INITIAL_STAGE_NOT_FOUND/);
  assert.deepEqual(snapshot(),prior);
  assert.equal(auditFingerprint(),auditBefore);
 }
 reject(`begin;reset role;create function synthetic_reject_visit() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_VISIT_FAILURE'; end$$;create trigger synthetic_reject before insert on advisory_stage_visits for each row execute function synthetic_reject_visit();${auth()}${call(null,'create',payload())}`,/SYNTHETIC_VISIT_FAILURE/);
 assert.deepEqual(snapshot(),prior);
 reject(call(null,'create',payload('general_advisory','unsupported')),/TEMPLATE_INVALID/);assert.deepEqual(snapshot(),prior);
 assert.equal(auditFingerprint(),auditBefore);
});
test('authorization and Lead validation are not widened by initialization',()=>{
 const prior=snapshot();for(const actor of [3,4,5,8])reject(call(null,'create',payload()),/FORBIDDEN/,actor);
 for(const lead of [3,5,6,7])reject(call(null,'create',{...payload(),lead_id:id(lead)}),/NOT_ASSIGNABLE/);
 assert.deepEqual(snapshot(),prior);
});
test('manual Stage, completion/advance, Next Action/actor, team/time and close/reopen preserve operational contracts',()=>{
 const m=create(),first=checks(m).current_stage_id;
 reject(call(m,'stage',{stage_key:'intake'}),/STAGE_ALREADY_CURRENT/);
 write(m,'stage',{stage_key:'information'});assert.equal(checks(m).current_stage_key,'information');
 assert.equal(sql(`select exit_reason from advisory_stage_visits where matter_id='${m}' and stage_id='${first}'`),'transition');
 const info=checks(m).current_stage_id,t=write(m,'task_save',{title:'Actual work',status:'pending',stage_id:info,assignee_user_id:id(2)}).item_id;
 write(m,'next_action',{task_id:t});let row=as(`select advisory_control_read('${m}')`).items[0];assert.equal(row.next_owner_id,id(2));
 reject(call(m,'stage_complete',{visit_id:current(m)}),/STAGE_TASKS_OPEN/);
 write(m,'task_complete',{id:t});assert.equal(as(`select advisory_control_read('${m}')`).items[0].next_action,null);
 write(m,'stage_complete',{visit_id:current(m)});assert.equal(checks(m).current_stage_key,'analysis');
 write(m,'team',{user_id:id(3),role:'assistant'});write(m,'team_edit',{user_id:id(3),previous_role:'assistant',role:'qa'});
 sql(auth(2)+`insert into advisory_time_logs(advisory_matter_id,client_id,minutes,work_date,work_type,note,staff_name,created_by_user_id,stage_id) values('${m}','${id(90)}',15,current_date,'Advisory','Actual work','Person 2','${id(2)}','${checks(m).current_stage_id}')`);
 write(m,'next_action',{title:'Follow up',owner_id:id(3),due_date:'2026-10-01'});
 reject(call(m,'stage_complete',{visit_id:current(m)}),/NEXT_ACTION_RESOLUTION_REQUIRED/);
 write(m,'stage_complete',{visit_id:current(m),resolve_next_action:true});
 while(checks(m).current_visit_id)write(m,'stage_complete',{visit_id:current(m)});
 row=as(`select advisory_control_read('${m}')`).items[0];assert.equal(row.status,'active');assert.equal(row.work_state,'working');
 assert.equal(sql(`select count(*) from advisory_stage_visits v join advisory_matter_stages s on s.id=v.stage_id where v.matter_id='${m}' and s.stage_key='close'`),'0');
 write(m,'close',{outcome:'completed',summary:'Complete'});assert.equal(checks(m).closed,true);
 write(m,'reopen',{reason:'New instruction'});assert.equal(checks(m).closed,false);assert.equal(current(m),'');
});
test('old catalog/rows/legacy history are preserved and artifact generation is deterministic',()=>{
 // Migration preservation was checked before operational tests. Subsequent tests
 // may create new synthetic rows, but the original legacy identities stay honest.
 assert.equal(current(oldMatter),'');assert.equal(sql(`select assignee_name from advisory_issue_tasks where id='${id(301)}'`),'Unmatched task name');
 assert.equal(fs.readFileSync(C.candidate,'utf8'),C.migration());assert.equal(fs.readFileSync(C.preflight,'utf8'),C.preflightSql());
 assert.equal(fs.readFileSync(C.verifier,'utf8'),C.verifierSql(JSON.parse(fs.readFileSync(C.pinsPath))));
 assert.deepEqual(snapshot().catalog,baseline.catalog);
});
