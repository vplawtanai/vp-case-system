/* eslint-disable @typescript-eslint/no-require-imports */
// Isolated PostgreSQL only, private Unix socket. No project credentials/network.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const D=require('./non-litigation-overdue-artifacts.cjs'),{A,B,C}=D;
const bin='/Applications/Postgres.app/Contents/Versions/18/bin',locale=process.env.ADVISORY082_TEST_LOCALE||'en_US.UTF-8';
assert.ok(['C','en_US.UTF-8'].includes(locale));
const q=A.quote,id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
let dir,started=false,baseline,pins,financeBefore;
function run(name,args,input,fail=false){const r=spawnSync(bin+'/'+name,args,{input,encoding:'utf8',env:{PATH:process.env.PATH,LC_ALL:'C',LANG:'C'},maxBuffer:32e6});if(!fail)assert.equal(r.status,0,r.stderr||r.error?.message);return fail?r:r.stdout.trim();}
function sql(s,fail=false){return run('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h',dir,'-p','58482','-U','postgres','-d','postgres'],s,fail);}
function auth(n=1){return `set role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',false);select set_config('request.jwt.claims',${q(JSON.stringify({sub:id(n),role:'authenticated'}))},false);`;}
function as(s,n=1){return JSON.parse(sql(auth(n)+s).split('\n').at(-1));}
function gate(s){return JSON.parse(sql('begin read only;'+s+'rollback;'));}
function snapshot(){return JSON.parse(sql(D.snapshot()));}
const read=(m=null,query={})=>as(`select advisory_control_read(${m?q(id(m)):'null'},${q(JSON.stringify(query))})`);
const items=m=>as(`select coalesce(jsonb_agg(to_jsonb(o) order by due_date,source COLLATE "C",source_id),'[]') from advisory_overdue_work('${id(m)}') o`);
const section=m=>as(`select advisory_control_section('${id(m)}','tasks')`);
const today="(current_timestamp at time zone 'Asia/Bangkok')::date";
function seed(){
 let s=auth()+'reset role;';
 for(const n of [801,802,803,804,805,806])s+=`insert into advisory_matters(id,client_id,title,matter_no,status) values('${id(n)}','${id(90)}','SYNTHETIC OVERDUE ${n}','ADV-OVERDUE-${n}','active');`;
 for(const n of [801,802,803,804,805])s+=`insert into advisory_matter_control(matter_id) values('${id(n)}');`;
 const tasks=[
  [901,801,'pending',-3,null,null],[902,801,'in_progress',-2,null,null],[903,801,'waiting',-1,null,null],
  [904,802,'pending',-3,null,null],
  [905,803,'completed',-2,'current_timestamp',null],[906,803,'cancelled',-2,null,null],
  [907,803,'pending',0,null,null],[908,803,'pending',1,null,null],[909,803,'pending',null,null,null],
  [910,803,'pending',-4,null,'current_timestamp'],
  [912,804,'pending',-4,null,null],[913,805,'pending',-4,null,null],[914,806,'pending',-2,null,null],
 ];
 for(const [n,m,status,offset,completed,deleted]of tasks)s+=`insert into advisory_issue_tasks(id,advisory_matter_id,title,status,due_date,completed_at,deleted_at,assignee_user_id) values('${id(n)}','${id(m)}','${n===902?'Same title':n===903?'Same title':'Synthetic task '+n}','${status}',${offset===null?'null':today+'+('+offset+')'},${completed||'null'},${deleted||'null'},'${id(2)}');`;
 // Reuse the grandfathered completion anomaly that predates 076; new invalid
 // completion/status combinations must remain rejected by the existing guard.
 s+=`update advisory_issue_tasks set due_date=${today}-4 where id='${id(301)}';`;
 s+=`update advisory_matter_control set next_task_id='${id(901)}' where matter_id='${id(801)}';`;
 s+=`update advisory_matter_control set next_action='Standalone overdue',next_due=${today}-1,next_owner_id='${id(3)}' where matter_id='${id(802)}';`;
 for(const n of [804,805])s+=`select advisory_control_write('${id(n)}','close',${q(JSON.stringify({outcome:n===804?'client_stopped':'cancelled',summary:'Synthetic historical closure',unresolved_reason:'Fixture preserves unresolved Tasks'}))},gen_random_uuid(),(select version from advisory_matter_control where matter_id='${id(n)}'));`;
 return s;
}
before(()=>{
 dir=fs.mkdtempSync('/private/tmp/vp-advisory082-');fs.chmodSync(dir,0o700);
 run('initdb',['-D',dir+'/data','-U','postgres','-A','trust','--encoding=UTF8','--locale='+locale]);
 run('pg_ctl',['-D',dir+'/data','-l',dir+'/server.log','-o',`-F -k ${dir} -p 58482 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
 const source=fs.readFileSync(__dirname+'/non-litigation-postgres.test.cjs','utf8'),fixture=source.slice(source.indexOf('function fixture(){'),source.indexOf('\nbefore(()=>'));
 sql(vm.runInNewContext('('+fixture+')()',{A,id}));sql(A.migration(JSON.parse(sql(A.snapshotSql()))));
 const pre077=JSON.parse(sql(B.snapshot()));let local077=fs.readFileSync(B.candidate,'utf8');
 for(const k of ['catalog','functions'])local077=local077.replaceAll(B.baseline[k],D.jsonHash(pre077.old[k]));
 sql(local077);sql(fs.readFileSync(C.candidate,'utf8'));sql(seed());
 financeBefore=JSON.parse(sql(A.snapshotSql(true))).finance;
 baseline=snapshot();pins={candidate_sha256:A.hash(D.migration()),rows_sha256:D.jsonHash(baseline.rows),catalog_sha256:D.jsonHash(baseline.catalog)};
 const pre=gate(fs.readFileSync(D.preflight,'utf8'));assert.equal(pre.gate_pass,true,JSON.stringify(pre));assert.deepEqual(pre.object_differences,[]);
 // Validate pg_get_functiondef normalization before applying the exact candidate.
 const actual=JSON.parse(sql('begin;'+D.helperDefinition+`;select to_jsonb(pg_get_functiondef('public.${D.helper}'::regprocedure));rollback;`));
 assert.equal(actual,D.helperDefinition);
 const candidate=fs.readFileSync(D.candidate,'utf8');
 sql(candidate.replace(/COMMIT;\s*$/,'ROLLBACK;'));assert.deepEqual(snapshot(),baseline);
 sql(candidate);fs.writeFileSync(dir+'/preflight.json',JSON.stringify(pre,null,2));
});
after(()=>{if(started)run('pg_ctl',['-D',dir+'/data','-m','fast','-w','stop']);console.log('082 local evidence:',dir,'locale:',locale);});

test('exact 082 applied contract preserves rows/catalog/security and every unrelated write/Stage function',()=>{
 const s=snapshot();assert.deepEqual(s.contract,D.afterContract);assert.deepEqual(s.rows,baseline.rows);assert.deepEqual(s.catalog,baseline.catalog);
 for(const [name,definition] of Object.entries(C.afterContract.functions))if(!D.changed.includes(name))assert.deepEqual(s.contract.functions[name],definition);
 assert.equal(A.hash(fs.readFileSync(C.candidate)),D.sha081);assert.equal(A.hash(fs.readFileSync(A.candidate)),C.sha076);assert.equal(A.hash(fs.readFileSync(B.candidate)),C.sha077);
});
test('one Matter / three overdue Tasks, duplicate titles remain separate, linked Next Action counts once',()=>{
 const list=items(801);assert.equal(list.length,3);assert.equal(new Set(list.map(x=>x.source+':'+x.source_id)).size,3);
 assert.equal(list.filter(x=>x.is_next_action).length,1);assert.equal(list.filter(x=>x.title==='Same title').length,2);
 const m=read(801).items[0];assert.equal(m.overdue_item_count,3);assert.equal(m.oldest_overdue_days,3);assert.equal(m.next_action_overdue_days,3);assert.equal(m.has_overdue_work,true);
 assert.equal(m.overdue_preview.length,3);assert.deepEqual(m.overdue_preview.map(x=>x.source_id),list.map(x=>x.source_id));
 assert.equal(m.overdue_preview[0].assignee_name,'Historical 2');
});
test('standalone Next Action is a separate actionable identity alongside an overdue Task',()=>{
 const list=items(802);assert.equal(list.length,2);assert.deepEqual(list.map(x=>x.source),['task','next_action']);
 assert.equal(list[1].source_id,id(802));assert.equal(list[1].assignee_name,'Historical 3');
 const m=read(802).items[0];assert.equal(m.overdue_item_count,2);assert.equal(m.oldest_overdue_days,3);assert.equal(m.next_action_overdue_days,1);
});
test('a standalone Next Action without any actionable Task still counts exactly once',()=>{
 const r=as(`begin;reset role;update advisory_issue_tasks set status='completed',completed_at=current_timestamp where id='${id(904)}';${auth()}select advisory_control_read('${id(802)}');rollback;`);
 assert.equal(r.items[0].overdue_item_count,1);assert.equal(r.items[0].overdue_preview[0].source,'next_action');assert.equal(r.items[0].next_action_overdue_days,1);
});
test('global summary counts affected Matters and distinct work separately; unified tab total agrees',()=>{
 const r=read(null,{tab:'overdue'});assert.equal(r.summary.overdue,3);assert.equal(r.summary.overdue_items,6);assert.equal(r.total,3);
 assert.deepEqual(new Set(r.items.map(m=>m.id)),new Set([id(801),id(802),id(806)]));assert.ok(r.items.every(m=>m.has_overdue_work));
 const narrow=read(null,{tab:'overdue',search:'no-match'});assert.equal(narrow.total,0);assert.deepEqual(narrow.summary,r.summary);
 // Excluding the legacy fixture demonstrates exactly two Matters / five items.
 const two=r.items.filter(m=>m.id!==id(806));assert.equal(two.length,2);assert.equal(two.reduce((n,m)=>n+m.overdue_item_count,0),5);
});
test('completed/cancelled/deleted/anomalous completed-at Tasks, due today/future/unset are not overdue',()=>{
 assert.deepEqual(items(803),[]);const m=read(803).items[0];assert.equal(m.has_overdue_work,false);assert.equal(m.overdue_item_count,0);assert.equal(m.oldest_overdue_due,null);assert.deepEqual(m.overdue_preview,[]);
 const tasks=section(803).items;assert.ok(tasks.length>=5);assert.ok(tasks.every(t=>t.overdue_days===0));
 assert.deepEqual(items(101),[]);assert.equal(section(101).items.find(t=>t.id===id(301)).overdue_days,0);
 assert.equal(tasks.find(t=>t.id===id(905)).status,'completed');assert.equal(tasks.find(t=>t.id===id(906)).status,'cancelled');
});
test('closed and cancelled Matters cannot appear as active overdue even with unresolved old Tasks',()=>{
 for(const n of [804,805]){assert.deepEqual(items(n),[]);assert.equal(read(n).items[0].has_overdue_work,false);assert.ok(section(n).items.every(t=>t.overdue_days===0));}
});
test('legacy unset Stage remains unset but its valid overdue Task is discoverable',()=>{
 const m=read(806).items[0];assert.equal(m.stage_key,null);assert.equal(m.next_action,null);assert.equal(m.overdue_item_count,1);assert.equal(m.oldest_overdue_days,2);
 assert.equal(sql(`select count(*) from advisory_stage_visits where matter_id='${id(806)}'`),'0');
});
test('Task detail days and Next Action days reuse the same canonical item source',()=>{
 const tasks=section(801).items,canonical=items(801);
 for(const t of tasks)assert.equal(t.overdue_days,canonical.find(o=>o.source_id===t.id).overdue_days);
 assert.equal(read(801).items[0].next_action_overdue_days,tasks.find(t=>t.id===id(901)).overdue_days);
 assert.equal(tasks.find(t=>t.id===id(901)).status,'pending');assert.equal(tasks.find(t=>t.id===id(901)).priority,'normal');
});
test('cleared/invalid linked Next Action never creates a duplicate standalone fallback',()=>{
 const before=snapshot();
 for(const target of [905,906,910]){
  const result=as(`begin;reset role;update advisory_matter_control set next_task_id='${id(target)}' where matter_id='${id(803)}';${auth()}select advisory_control_read('${id(803)}');rollback;`);
  assert.equal(result.items[0].next_action_overdue_days,0);assert.equal(result.items[0].overdue_item_count,0);
 }
 assert.deepEqual(snapshot(),before);
});
test('preview is bounded to oldest three with deterministic ID tie breaks; all items still count',()=>{
 const r=as(`begin;reset role;insert into advisory_issue_tasks(id,advisory_matter_id,title,due_date) values('${id(915)}','${id(801)}','Fourth oldest',${today}-5),('${id(916)}','${id(801)}','Fifth oldest',${today}-5);${auth()}select advisory_control_read('${id(801)}');rollback;`);
 const m=r.items[0];assert.equal(m.overdue_item_count,5);assert.equal(m.overdue_preview.length,3);assert.equal(m.oldest_overdue_days,5);
 assert.deepEqual(m.overdue_preview.map(o=>o.source_id),[id(915),id(916),id(901)]);
});
test('Bangkok midnight boundary, strict before-today comparison, session timezone independence',()=>{
 for(const [instant,expected] of [['2026-09-30 16:59:59+00',0],['2026-09-30 17:00:00+00',1]]){
  for(const zone of ['UTC','America/Los_Angeles','Asia/Bangkok']){
   const def=D.helperDefinition.replace('current_timestamp',q(instant)+'::timestamptz');
   const r=as(`begin;reset role;set local timezone=${q(zone)};${def};update advisory_issue_tasks set due_date='2026-09-30' where id='${id(914)}';${auth()}select coalesce(jsonb_agg(to_jsonb(o)),'[]') from advisory_overdue_work('${id(806)}') o;rollback;`);
   assert.equal(r.length,expected);if(expected)assert.equal(r[0].overdue_days,1);
  }
 }
 assert.deepEqual(snapshot().contract,D.afterContract,'Clock simulation rolled back exact function bytes');
});
test('invoker RLS and inactive/anonymous denial are preserved, including helper direct access',()=>{
 for(const n of [4,5,8]){const r=sql(auth(n)+`select * from advisory_overdue_work();`,true);assert.notEqual(r.status,0);assert.match(r.stderr,/FORBIDDEN/);}
 const anon=sql('set role anon;select * from advisory_overdue_work();',true);assert.notEqual(anon.status,0);assert.match(anon.stderr,/permission denied/);
 const inactive=sql(`begin;update user_profiles set active=false where id='${id(1)}';${auth()}select * from advisory_overdue_work();rollback;`,true);assert.notEqual(inactive.status,0);assert.match(inactive.stderr,/FORBIDDEN/);
 const restricted=as(`begin;reset role;create policy synthetic082_restrict on advisory_matters as restrictive for select to authenticated using(id<>'${id(801)}');${auth()}select advisory_control_read(null,'{"tab":"overdue"}');rollback;`);
 assert.equal(restricted.total,2);assert.equal(restricted.summary.overdue_items,3);assert.ok(restricted.items.every(m=>m.id!==id(801)));
});
test('SELECT-only gates fail closed unbound, accept exact reviewed snapshot, detect row/catalog/function/security drift',()=>{
 const unbound=gate(D.verifierSql({}));assert.equal(unbound.gate_pass,false);assert.ok(unbound.failed_checks.includes('reviewed_baseline_bound'));
 const reviewed=JSON.parse(fs.readFileSync(D.pinsPath)),published=gate(fs.readFileSync(D.verifier,'utf8'));
 assert.equal(published.checks.reviewed_baseline_bound,!!(reviewed.rows_sha256&&reviewed.catalog_sha256));
 assert.equal(published.approved_rows_sha256,reviewed.rows_sha256||null);assert.equal(published.approved_catalog_sha256,reviewed.catalog_sha256||null);
 // Production pins stay intact; disposable rows must not masquerade as that baseline.
 assert.equal(published.checks.historical_rows_unchanged,published.rows_sha256===reviewed.rows_sha256);
 assert.equal(published.checks.catalog_security_unchanged,published.catalog_sha256===reviewed.catalog_sha256);
 const good=gate(D.verifierSql(pins));assert.equal(good.gate_pass,true,JSON.stringify(good));assert.deepEqual(good.object_differences,[]);
 for(const [mutation,check]of [
  [`update advisory_issue_tasks set title='Unexpected' where id='${id(901)}';`,'historical_rows_unchanged'],
  [`delete from advisory_issue_tasks where id='${id(914)}';`,'historical_rows_unchanged'],
  ['alter table advisory_matters add column unexpected text;','catalog_security_unchanged'],
  ['grant execute on function advisory_overdue_work(uuid) to anon;','applied_state_exact'],
  ['alter function advisory_control_read(uuid,jsonb) volatile;','applied_state_exact'],
  ['alter policy advisory076_read on advisory_matter_stages using(false);','catalog_security_unchanged'],
 ]){
  const bad=JSON.parse(sql('begin;'+auth()+'reset role;'+mutation+D.verifierSql(pins)+'rollback;').split('\n').at(-1));assert.equal(bad.gate_pass,false);assert.ok(bad.failed_checks.includes(check));
 }
 assert.deepEqual(snapshot(),baselineWith082());
});
function baselineWith082(){return {...baseline,contract:D.afterContract};}
test('preflight rejects unknown helpers or security drift and candidate baseline guard rolls back',()=>{
 // Return locally to accepted 081 solely within rollback-only test transactions.
 const beforeDDL=`drop function advisory_overdue_work(uuid);${D.beforeContract.functions[D.read].definition};${D.beforeContract.functions[D.section].definition};`;
 const pre=JSON.parse(sql('begin;'+beforeDDL+D.preflightSql()+'rollback;'));assert.equal(pre.gate_pass,true);
 const drift='grant execute on function advisory_control_read(uuid,jsonb) to anon;';
 const bad=JSON.parse(sql('begin;'+beforeDDL+drift+D.preflightSql()+'rollback;'));assert.equal(bad.gate_pass,false);assert.ok(bad.object_differences.some(x=>x.object===D.read));
 const rejected=sql('begin;'+beforeDDL+drift+D.migration().replace(/^BEGIN;$/m,'').replace(/COMMIT;\s*$/,'ROLLBACK;'),true);
 assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/BASELINE_MISMATCH/);assert.deepEqual(snapshot(),baselineWith082());
});
test('only three read definitions change; artifacts and C-ordered fingerprints remain deterministic',()=>{
 assert.equal(fs.readFileSync(D.candidate,'utf8'),D.migration());assert.equal(fs.readFileSync(D.preflight,'utf8'),D.preflightSql());assert.equal(fs.readFileSync(D.verifier,'utf8'),D.verifierSql(JSON.parse(fs.readFileSync(D.pinsPath))));
 assert.deepEqual(Object.keys(D.afterContract.functions).filter(k=>JSON.stringify(D.afterContract.functions[k])!==JSON.stringify(D.beforeContract.functions[k])).sort(),D.changed.toSorted());
 assert.deepEqual(snapshot(),baselineWith082());assert.equal(D.jsonHash(snapshot().rows),pins.rows_sha256);
 assert.deepEqual(JSON.parse(sql(A.snapshotSql(true))).finance,financeBefore);
 assert.doesNotMatch(D.readDefinition+D.sectionDefinition+D.helperDefinition,/\b(?:insert into|update public|delete from)\b/i);
 fs.writeFileSync(dir+'/verifier.json',JSON.stringify(gate(D.verifierSql(pins)),null,2));
});
