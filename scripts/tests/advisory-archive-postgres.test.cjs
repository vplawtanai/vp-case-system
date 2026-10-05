/* eslint-disable @typescript-eslint/no-require-imports */
// Exact 095 candidate in disposable Unix-socket PostgreSQL; never .env or Production.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),{spawnSync,spawn}=require('node:child_process');
const H=require('./advisory-archive-artifacts.cjs'),{G,A,q}=H,{F,B}=G,E=F.E,C=E.C,D=E.D;
const bin='/Applications/Postgres.app/Contents/Versions/18/bin',id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');let dir,started=false,pins,beforeState;
function run(n,args,input,fail=false){const r=spawnSync(bin+'/'+n,args,{input,encoding:'utf8',env:{PATH:process.env.PATH,LC_ALL:'C'},maxBuffer:128e6});if(!fail)assert.equal(r.status,0,r.stderr||r.error?.message);return fail?r:r.stdout.trim();}
function args(){return ['-X','-qAt','-v','ON_ERROR_STOP=1','-h',dir,'-p','58595','-U','postgres','-d','postgres'];}
const sql=(s,fail=false)=>run('psql',args(),s,fail);
const auth=(n=1)=>`set local role authenticated;set local request.jwt.claim.sub='${id(n)}';set local request.jwt.claims='{"sub":"${id(n)}","role":"authenticated"}';`;
const as=(s,n=1)=>sql('begin;'+auth(n)+s+';rollback;').split('\n').at(-1);
const denied=(s,pattern=/ADVISORY_ARCHIVE|ADVISORY095|permission denied|ADVISORY_ARCHIVED/,n=1)=>{const r=sql('begin;'+auth(n)+s+';rollback;',true);assert.notEqual(r.status,0);assert.match(r.stderr,pattern);};
const gate=s=>JSON.parse(sql('begin read only;'+s+'rollback;'));
const target=n=>H.reviewed.targets[n-13].id;
const call=(p=pins,request=pins.request_id)=>`select advisory095_archive_uat(${q(request)},'Human-approved UAT operational archive: ADV-2026-013..023',${q(JSON.stringify(H.baseline(p)))})`;
const capture=()=>JSON.parse(sql(H.snapshot()));
function session(s){let signal;const ready=new Promise(resolve=>{signal=resolve;});const done=new Promise(resolve=>{const p=spawn(bin+'/psql',args(),{env:{PATH:process.env.PATH,LC_ALL:'C'}});let out='',err='';p.stdout.on('data',b=>{out+=b;if(out.includes('WRITER_LOCKED'))signal();});p.stderr.on('data',b=>err+=b);p.on('close',code=>{signal();resolve({code,out,err});});p.stdin.end(s);});return {ready,done};}
function installBase(){const s=fs.readFileSync(__dirname+'/non-litigation-postgres.test.cjs','utf8'),fixture=s.slice(s.indexOf('function fixture(){'),s.indexOf('\nbefore(()=>'));
 sql(vm.runInNewContext('('+fixture+')()',{A,id}));
 // Complete the accepted original ACL/FK projection: the older reusable fixture
 // intentionally models only effective DML grants and simple Finance canaries.
 for(const[name,t]of Object.entries(A.approved.catalog)){
  sql(`revoke all on ${name} from anon,authenticated,service_role;`);
  for(const entry of t.acl.slice(1,-1).split(',')){
   const match=entry.match(/^([^=]*)=([^/]*)\//);if(!match||match[1]==='postgres')continue;
   const privileges={a:'INSERT',r:'SELECT',w:'UPDATE',d:'DELETE',D:'TRUNCATE',x:'REFERENCES',t:'TRIGGER',m:'MAINTAIN'};
   sql(`grant ${[...match[2]].filter(c=>privileges[c]).map(c=>privileges[c]).join(',')} on ${name} to ${match[1]||'PUBLIC'};`);
  }
 }
 for(const table of Object.keys(A.approved.finance_matter_references))if(!A.approved.catalog.advisory_matters.incoming_foreign_keys.some(f=>f.table===table))sql(`alter table ${table} drop constraint if exists ${table}_advisory_matter_id_fkey;`);
 for(const fk of A.approved.catalog.advisory_matters.incoming_foreign_keys){
  if(fk.table==='office_work_logs')sql('create table office_work_logs(id uuid primary key,related_advisory_matter_id uuid);');
  if(!Object.hasOwn(A.approved.catalog,fk.table))sql(`alter table ${fk.table} drop constraint if exists "${fk.name}";alter table ${fk.table} add constraint "${fk.name}" ${fk.definition};`);
 }
 sql(A.migration(JSON.parse(sql(A.snapshotSql()))));
 const pre=JSON.parse(sql(B.snapshot()));let m=fs.readFileSync(B.candidate,'utf8');for(const k of ['catalog','functions'])m=m.replaceAll(B.baseline[k],F.jsonHash(pre.old[k]));sql(m);
 for(const file of [C.candidate,D.candidate,E.candidate,F.candidate,G.candidate])sql(fs.readFileSync(file,'utf8'));
}
before(()=>{
 dir=fs.mkdtempSync('/private/tmp/vp-archive095-');fs.chmodSync(dir,0o700);run('initdb',['-D',dir+'/data','-U','postgres','-A','trust','--encoding=UTF8','--locale=en_US.UTF-8']);run('pg_ctl',['-D',dir+'/data','-l',dir+'/server.log','-o',`-F -k ${dir} -p 58595 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
 installBase();
 // Production UUIDs are identity-only; all payload/history below is synthetic.
 for(let n=4;n<=23;n++)sql(`insert into advisory_matters(id,client_id,matter_no,title,status) values('${n<13?id(900+n):target(n)}','${id(90)}','ADV-2026-${String(n).padStart(3,'0')}','SYNTHETIC ${n}','active');`);
 for(let n=13;n<=23;n++){
  const m=target(n);sql(`set request.jwt.claim.sub='${id(1)}';set request.jwt.claims='{"sub":"${id(1)}","role":"authenticated"}';insert into advisory_matter_control(matter_id,next_action,next_due) values('${m}','Synthetic overdue','2020-01-01');insert into advisory_issue_tasks(id,advisory_matter_id,title,status,due_date) values('${id(2000+n)}','${m}','Synthetic task','pending','2020-01-01');`);
  if(n>=19)sql(`set request.jwt.claim.sub='${id(1)}';set request.jwt.claims='{"sub":"${id(1)}","role":"authenticated"}';select advisory086_snapshot('${m}','general_advisory',null,null);insert into advisory_stage_visits(matter_id,stage_id,kind,entered_at,actor_id) select '${m}',id,'visit',now(),'${id(1)}' from advisory_matter_stages where matter_id='${m}' and position=1;`);
 }
 sql(`insert into advisory_time_logs(id,advisory_matter_id,work_date,staff_name,minutes,created_by_user_id) values('${id(3030)}','${target(23)}','2026-10-05','Synthetic worker',90,'${id(2)}');
 insert into case_audit_logs(id,table_name,record_id,action,user_name) values('${id(3031)}','advisory_matters','${target(14)}','UPDATE','Synthetic Admin');`);
 // Shared Client/Case is allowed; no direct Matter ownership.
 sql(`create table public.cases(id bigint primary key,client_id uuid,title text,origin_advisory_matter_id uuid);insert into cases values(1,'${id(90)}','Shared Client Case',null);

 create schema storage;create table storage.objects(id uuid primary key,name text);create table storage.buckets(id text primary key);insert into storage.objects values('${id(6000)}','shared-artwork.webp');`);
 beforeState=capture();

 const pre=gate(H.gate(false));assert.equal(pre.gate_pass,true,JSON.stringify(pre.failed_checks));
 pins={candidate_sha256:pre.candidate_sha256,rows_sha256:pre.rows_sha256,preserved_sha256:pre.preserved_sha256,targets_sha256:pre.targets_sha256,admin_id:id(1),request_id:crypto.randomUUID()};
 if(process.env.ARCHIVE095_CAPTURE==='1'){
  sql(H.core());fs.writeFileSync(H.contractPath,JSON.stringify(JSON.parse(sql(H.footprint())),null,2)+'\n');H.generate();

 }else{
  for(const change of ["alter table advisory_matters add column unexpected text;","alter table advisory_journey_snapshots disable trigger advisory086_snapshot_immutable;","grant delete on advisory_matter_team to authenticated;"]){const result=JSON.parse(sql('begin;'+change+H.gate(false)+'rollback;'));assert.equal(result.gate_pass,false,change);}
  sql(H.migration().replace(/COMMIT;\s*$/,'ROLLBACK;'));assert.deepEqual(capture(),beforeState);
  // SQL Editor whole-script batch: DDL + archive rollback and a late failure.
  sql(H.applySql(pins).replace(/COMMIT;\s*$/,'ROLLBACK;'));assert.deepEqual(capture(),beforeState);
  assert.equal(sql("select to_regclass('public.advisory_matter_archives') is null"),'t');
  const failed=sql(H.applySql(pins).replace(/COMMIT;\s*$/,'SELECT 1/0; COMMIT;'),true);
  assert.notEqual(failed.status,0);assert.match(failed.stderr,/division by zero/);assert.deepEqual(capture(),beforeState);
  assert.equal(sql("select to_regclass('public.advisory_matter_archives') is null"),'t');
  sql(H.migration());
 }
 pins.candidate_sha256=A.hash(H.migration());
});
after(()=>{if(started)run('pg_ctl',['-D',dir+'/data','-m','fast','-w','stop']);console.log('095 disposable evidence:',dir);});
test('artifact consistency and fail-closed SELECT-only preflight/verifier',()=>{
 assert.equal(fs.readFileSync(H.candidate,'utf8'),H.migration());
 assert.deepEqual(capture(),beforeState,'DDL preserves every pre-existing row and unrelated object');
 assert.equal(gate(H.gate(true)).gate_pass,false,'unbound verifier cannot pass');
 assert.equal(gate(H.gate(true,pins)).gate_pass,false,'installed foundation alone is not archive completion');
 for(const s of [H.gate(false),H.gate(true,pins)]){const clean=s.replace(/^--.*$/gm,'').replace(/'(?:''|[^'])*'/g,"''");assert.match(clean,/^\s*WITH /);assert.equal(clean.split(';').length,2);assert.doesNotMatch(clean,/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|CALL|DO|COPY|SET)\b/i);}
 const unbound=sql(H.applySql(),true);assert.notEqual(unbound.status,0);assert.match(unbound.stderr,/HUMAN_BASELINE_AND_ACTOR_NOT_BOUND/);
});
test('permission, target identity, stale rows and external ownership gates reject without mutation',()=>{
 denied(call(),/ADVISORY_FORBIDDEN/,2);denied(call(),/ADVISORY_FORBIDDEN/,5);denied(call(),/ADVISORY_FORBIDDEN/,8);
 denied("select advisory095_capture()",/permission denied/);denied('select * from advisory095_targets()',/permission denied/);
 denied("insert into advisory_matter_archives(matter_id) values(gen_random_uuid())",/permission denied/);
 for(const [change,error]of [
  [`update advisory_matters set matter_no='OTHER' where id='${target(13)}';`,/IDENTITY_CHANGED/],
  [`update advisory_matters set title='Concurrent change' where id='${target(13)}';`,/REVIEW_STALE/],
  [`update advisory_matters set title='Protected changed' where matter_no='ADV-2026-004';`,/REVIEW_STALE/],
  [`insert into finance_expenses values(gen_random_uuid(),'${target(13)}',10,'Unexpected target ownership');`,/REVIEW_STALE|EXTERNAL_REFERENCE/]
 ]){const r=sql('begin;'+change+auth()+call()+';rollback;',true);assert.notEqual(r.status,0);assert.match(r.stderr,error);}
 assert.deepEqual(capture(),beforeState);assert.equal(sql('select count(*) from advisory_matter_archives'),'0');
});
test('a late marker insert failure leaves zero archived targets',()=>{
 const fault=`create function pg_temp.reject_last() returns trigger language plpgsql as $$begin if new.matter_no='ADV-2026-023' then raise exception 'SYNTHETIC_LATE_FAILURE';end if;return new;end$$;
 create trigger zz_test_failure before insert on advisory_matter_archives for each row execute function pg_temp.reject_last();`;
 const failed=sql('begin;'+fault+auth()+call()+';commit;',true);assert.notEqual(failed.status,0);assert.match(failed.stderr,/SYNTHETIC_LATE_FAILURE/);
 assert.equal(sql('select count(*) from advisory_matter_archives'),'0');assert.deepEqual(capture(),beforeState);
});
test('atomic archive waits for a writer and concurrent retry hides all target signals while preserving history',async()=>{
 const original=JSON.parse(as('select advisory_control_read()'));assert.equal(original.items.filter(m=>H.reviewed.targets.some(t=>t.id===m.id)).length,11);
 const writer=session('begin;'+auth()+`update advisory_matters set title=title where id='${target(13)}';select 'WRITER_LOCKED';select pg_sleep(0.3);rollback;`);
 await writer.ready;
 const first=session('begin;'+auth()+call()+';commit;'),retry=session('begin;'+auth()+call()+';commit;');
 const [w,a,b]=await Promise.all([writer.done,first.done,retry.done]);for(const r of [w,a,b])assert.equal(r.code,0,r.err);
 assert.deepEqual([JSON.parse(a.out.trim()).replayed,JSON.parse(b.out.trim()).replayed].sort(),[false,true]);
 assert.deepEqual(capture(),beforeState);
 const verified=gate(H.gate(true,pins));assert.equal(verified.gate_pass,true,JSON.stringify(verified));
 for(const n of [1,2,3]){
  const all=JSON.parse(as('select advisory_control_read()',n));assert.equal(all.items.filter(m=>H.reviewed.targets.some(t=>t.id===m.id)).length,0);
  for(const t of H.reviewed.targets){assert.equal(as(`select count(*) from advisory_overdue_work('${t.id}')`,n),'0');denied(`select advisory_control_read('${t.id}')`,/MATTER_NOT_FOUND/,n);denied(`select advisory_control_section('${t.id}','tasks')`,/MATTER_NOT_FOUND/,n);denied(`select advisory_workflow_checks('${t.id}')`,/MATTER_NOT_FOUND/,n);}
  for(const[base,view]of Object.entries(H.views)){const col=H.owned[base];assert.equal(as(`select count(*) from ${view} where ${col}=any(array[${H.reviewed.targets.map(t=>q(t.id)+'::uuid').join(',')}])`,n),'0');}
 }
 assert.equal(as("select count(*) from advisory_operational_matters where matter_no between 'ADV-2026-004' and 'ADV-2026-012'"),'9');
 assert.equal(as(`select sum(minutes) from advisory_time_logs where advisory_matter_id='${target(23)}'`),'90','history remains queryable');
 assert.equal(as(`select count(*) from advisory_matters where id='${target(13)}'`),'1','Finance/history canonical references survive');
 assert.equal(JSON.parse(as(call())).replayed,true);assert.equal(sql('select count(*) from advisory_matter_archives'),'11');
 denied(call(pins,crypto.randomUUID()),/RETRY_MISMATCH/);
});
test('archived child/root writes rejected; existing snapshot guard and old receipts/history retained',()=>{
 const m=target(23);
 for(const s of [
  `update advisory_matters set title='No' where id='${m}'`,
  `insert into advisory_time_logs(advisory_matter_id,work_date,staff_name,minutes,created_by_user_id) values('${m}','2026-10-05','No',1,'${id(1)}')`,
  `update advisory_issue_tasks set title='No' where advisory_matter_id='${m}'`,
  `select advisory_control_write('${m}','note','{"text":"No"}',gen_random_uuid(),0)`
 ])denied(s,/ARCHIVED/);
 const immutable=sql(`begin;delete from advisory_journey_snapshots where matter_id='${m}';rollback;`,true);assert.notEqual(immutable.status,0);assert.match(immutable.stderr,/JOURNEY_IMMUTABLE/);
 assert.deepEqual(capture(),beforeState);
 for(const change of [
  `update advisory_time_logs set note='drift' where id='${id(401)}';`,
  `alter table advisory_stage_visits disable trigger advisory095_write_guard;`,
  `grant execute on function advisory095_capture() to authenticated;`,
  `alter table advisory_journey_snapshots disable trigger advisory086_snapshot_immutable;`,
  `update cases set title='Drift' where id=1;`
 ]){const v=JSON.parse(sql('begin;'+change+H.gate(true,pins)+'rollback;'));assert.equal(v.gate_pass,false,change);}
});
