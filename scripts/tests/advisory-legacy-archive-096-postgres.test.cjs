/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable socket-only PostgreSQL. All business facts are synthetic; no .env/network.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),{spawnSync,spawn}=require('node:child_process');
const K=require('./advisory-legacy-archive-096-artifacts.cjs'),{H,A,q}=K,{G}=H,{F,B}=G,E=F.E,C=E.C,D=E.D;
const bin='/Applications/Postgres.app/Contents/Versions/18/bin',id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');let dir,started=false,pins,beforeState;
const oldPins=require('./fixtures/advisory-095-reviewed-baseline.json');
function run(n,args,input,fail=false){const r=spawnSync(bin+'/'+n,args,{input,encoding:'utf8',env:{PATH:process.env.PATH,LC_ALL:'C'},maxBuffer:128e6});if(!fail)assert.equal(r.status,0,r.stderr||r.error?.message);return fail?r:r.stdout.trim();}
const args=()=>['-X','-qAt','-v','ON_ERROR_STOP=1','-h',dir,'-p','58596','-U','postgres','-d','postgres'];
const sql=(s,fail=false)=>run('psql',args(),s,fail);
const auth=(n=1)=>`set local role authenticated;set local request.jwt.claim.sub='${id(n)}';set local request.jwt.claims='{"sub":"${id(n)}","role":"authenticated"}';`;
const as=(s,n=1)=>sql('begin;'+auth(n)+s+';rollback;').split('\n').at(-1);
const gate=s=>JSON.parse(sql('begin read only;'+s+'rollback;'));
const capture=()=>JSON.parse(sql(K.snapshot()));
const call=(p=pins,request=pins.request_id)=>`select advisory096_archive_legacy(${q(request)},'Human-approved Legacy operational archive: ADV-2026-004..012',${q(JSON.stringify(K.baseline(p)))})`;
function denied(s,pattern,n=1){const r=sql('begin;'+auth(n)+s+';rollback;',true);assert.notEqual(r.status,0);assert.match(r.stderr,pattern);}
function session(s){return new Promise(resolve=>{const p=spawn(bin+'/psql',args(),{env:{PATH:process.env.PATH,LC_ALL:'C'}});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('close',code=>resolve({code,out,err}));p.stdin.end(s);});}
before(()=>{
 dir=fs.mkdtempSync('/private/tmp/vp-archive096-');fs.chmodSync(dir,0o700);
 run('initdb',['-D',dir+'/data','-U','postgres','-A','trust','--encoding=UTF8','--locale=en_US.UTF-8']);run('pg_ctl',['-D',dir+'/data','-l',dir+'/server.log','-o',`-F -k ${dir} -p 58596 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
 // Reuse only the accepted base fixture installer, not another test's hooks or mutations.
 const source=fs.readFileSync(__dirname+'/advisory-archive-postgres.test.cjs','utf8');
 const installer=source.slice(source.indexOf('function installBase(){'),source.indexOf('\nbefore(()=>'));
 vm.runInNewContext('('+installer+')()',{fs,vm,__dirname,sql,A,id,H,G,F,B,E,C,D});
 for(let n=4;n<=23;n++){
  const matter=n<13?id(900+n):H.reviewed.targets[n-13].id;
  sql(`insert into advisory_matters(id,client_id,matter_no,title,status) values('${matter}','${id(90)}','ADV-2026-${String(n).padStart(3,'0')}','SYNTHETIC ${n}','active');`);
  sql(`set request.jwt.claim.sub='${id(1)}';set request.jwt.claims='{"sub":"${id(1)}","role":"authenticated"}';insert into advisory_matter_control(matter_id,next_action,next_due) values('${matter}','Preserved next action','2020-01-01');insert into advisory_issue_tasks(id,advisory_matter_id,title,status,due_date) values('${id(2000+n)}','${matter}','Preserved task','pending','2020-01-01');`);
  if(n>=19)sql(`set request.jwt.claim.sub='${id(1)}';select advisory086_snapshot('${matter}','general_advisory',null,null);`);
 }
 sql(`insert into advisory_time_logs(id,advisory_matter_id,work_date,staff_name,minutes,created_by_user_id) values('${id(3030)}','${H.reviewed.targets[10].id}','2026-10-05','Synthetic worker',90,'${id(2)}');
 insert into case_audit_logs(id,table_name,record_id,action,user_name) values('${id(3031)}','advisory_matters','${H.reviewed.targets[1].id}','UPDATE','Synthetic Admin');
 create table public.cases(id bigint primary key,client_id uuid,title text,origin_advisory_matter_id uuid);insert into cases values(1,'${id(90)}','Preserved shared Client Case',null);
 create schema storage;create table storage.objects(id uuid primary key,name text);create table storage.buckets(id text primary key);insert into storage.objects values('${id(6000)}','preserved-artwork.webp');`);
 // A legitimate existing Finance reference is preserved, explicitly disclosed and bound.
 sql(`insert into finance_expenses values('${id(7777)}','${id(904)}',10,'Preserved reference');`);
 sql('alter table auth.users add column raw_app_meta_data jsonb,add column last_sign_in_at timestamptz,add column updated_at timestamptz;');
 sql(`insert into office_work_logs values('${id(8080)}','${id(904)}');
 insert into finance_expenses values('${id(7778)}','${H.reviewed.targets[0].id}',20,'Unrelated reference');`);
 sql(H.migration());
 // Model already-accepted 095 receipts; no Production facts/rows are copied.
 sql(`insert into auth.users(id) values('${oldPins.admin_id}');insert into user_profiles(id,full_name,role,active) values('${oldPins.admin_id}','Synthetic previous Admin','admin',true);
 insert into advisory_matter_archives(matter_id,matter_no,archived_at,archived_by,archive_reason,request_id,reviewed_matter_sha256,reviewed_baseline)
 select m.id,m.matter_no,'2026-10-05T00:00:00Z','${oldPins.admin_id}','Human-approved UAT operational archive: ADV-2026-013..023','${oldPins.request_id}',encode(sha256(convert_to(to_jsonb(m)::text,'UTF8')),'hex'),${q(JSON.stringify(H.baseline(oldPins)))}::jsonb from advisory_matters m join advisory095_targets() t on t.id=m.id;`);
 beforeState=capture();const pre=gate(K.gate(false));assert.equal(pre.gate_pass,true,JSON.stringify(pre.failed_checks));
 pins={candidate_sha256:pre.candidate_sha256,...K.baseline(pre),admin_id:id(1),request_id:crypto.randomUUID()};
 if(process.env.ARCHIVE096_CAPTURE==='1'){
  sql(K.core());fs.writeFileSync(K.contractPath,JSON.stringify(JSON.parse(sql(K.footprint())),null,2)+'\n');K.generate();
 }else{
  assert.equal(beforeState.external_references.length,1);assert.equal(beforeState.external_references[0].n,1);assert.equal(beforeState.external_references[0].table_name,'finance_expenses');assert.match(beforeState.external_references[0].sha256,/^[a-f0-9]{64}$/);
  for(const change of ["alter table advisory_journey_snapshots disable trigger advisory086_snapshot_immutable;","grant delete on advisory_matter_archives to authenticated;"]){const r=JSON.parse(sql('begin;'+change+K.gate(false)+'rollback;'));assert.equal(r.gate_pass,false,change);}
  sql(K.migration().replace(/COMMIT;\s*$/,'ROLLBACK;'));assert.deepEqual(capture(),beforeState);
  const rejected=sql(K.applySql(pins).replace(/COMMIT;\s*$/,'SELECT 1/0; COMMIT;'),true);assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/division by zero/);assert.deepEqual(capture(),beforeState);assert.equal(sql("select count(*) from pg_proc where proname like 'advisory096_%'"),'0');
  sql(K.applySql(pins).replace(/COMMIT;\s*$/,'ROLLBACK;'));assert.deepEqual(capture(),beforeState);assert.equal(sql('select count(*) from advisory_matter_archives'),'11');
  sql(K.migration());
 }
 pins.candidate_sha256=A.hash(K.migration());
});
after(()=>{if(started)run('pg_ctl',['-D',dir+'/data','-m','fast','-w','stop']);console.log('096 stopped disposable PostgreSQL:',dir);});
test('095 contract intact; unbound or installation-only verifier fails closed',()=>{
 assert.deepEqual(capture(),beforeState);assert.equal(gate(K.gate(true)).gate_pass,false);assert.equal(gate(K.gate(true,pins)).gate_pass,false);
 assert.deepEqual(JSON.parse(sql(H.footprint())),JSON.parse(fs.readFileSync(H.contractPath)));
 const r=sql(K.applySql(),true);assert.notEqual(r.status,0);assert.match(r.stderr,/HUMAN_BASELINE_AND_ACTOR_NOT_BOUND/);
});
test('permissions, fixed nine identities, reviewed references and stale rows fail closed',()=>{
 for(const n of [2,5,8])denied(call(),/ADVISORY_FORBIDDEN/,n);
 denied('select advisory096_capture()',/permission denied/);
 denied("insert into advisory_matter_archives(matter_id) values(gen_random_uuid())",/permission denied/);
 const wrong=structuredClone(pins);wrong.targets[0].id=H.reviewed.targets[0].id;denied(call(wrong),/IDENTITY_CHANGED/);
 const missing=structuredClone(pins);missing.targets.pop();denied(call(missing),/IDENTITY_CHANGED/);
 const stale={...pins,rows_sha256:'0'.repeat(64)};denied(call(stale),/REVIEW_STALE/);
 denied(call({...pins,external_references:[]}),/REFERENCES_CHANGED/);
 for(const change of [
  `update advisory_matters set title='changed' where id='${id(904)}';`,
  `update advisory_issue_tasks set title='changed' where advisory_matter_id='${id(904)}';`,
  `delete from office_work_logs where related_advisory_matter_id='${id(904)}';`,
  `insert into case_audit_logs(id,table_name,record_id,action,user_name) values('${id(8880)}','advisory_matters','${id(904)}','UPDATE','Synthetic audit');`,
  `update finance_expenses set note='changed' where id='${id(7777)}';`
 ]){const r=sql('begin;'+auth().replace('set local role authenticated;','')+change+auth()+call()+';rollback;',true);assert.notEqual(r.status,0);assert.match(r.stderr,/IDENTITY_CHANGED|REVIEW_STALE/);}
 assert.equal(sql('select count(*) from advisory_matter_archives'),'11');assert.deepEqual(capture(),beforeState);
});
test('unrelated auth, shared rows and unrelated Finance activity do not stale the nine-target baseline',()=>{
 const change=`update auth.users set updated_at=now(),last_sign_in_at=now(),raw_app_meta_data='{"provider":"email"}';
 update cases set title='Unrelated case update';update storage.objects set name='unrelated.webp';
 update finance_expenses set note='Unrelated payment update' where id='${id(7778)}';
 update user_profiles set full_name='Unrelated person update' where id='${id(2)}';`;
 const state=JSON.parse(sql('begin;'+auth().replace('set local role authenticated;','')+change+K.snapshot()+';rollback;'));assert.deepEqual(state,beforeState);
 const r=JSON.parse(sql('begin;'+auth().replace('set local role authenticated;','')+change+auth()+call()+';rollback;').split('\n').at(-1));assert.equal(r.archived,9);
 assert.equal(sql('select count(*) from advisory_matter_archives'),'11');
 for(const update of ["active=false","role='partner'"]){
  const r=sql(`begin;set local request.jwt.claim.sub='${oldPins.admin_id}';`+`update user_profiles set ${update} where id='${id(1)}';`+auth()+call()+';rollback;',true);
  assert.notEqual(r.status,0);assert.match(r.stderr,/ADVISORY_FORBIDDEN/);
 }
});
test('target-linked request/history and Finance addition/removal stay inside preservation scope',()=>{
 for(const change of [
  `insert into advisory_control_requests(request_id,actor_id,request_body,response) values('${id(8882)}','${id(1)}','{"matter_id":"${id(904)}"}','{}');`,
  `insert into advisory_journey_requests(request_id,actor_id,body,response) values('${id(8883)}','${id(1)}','{"matter_id":"${id(904)}"}','{}');`,
  `insert into finance_expenses values('${id(8884)}','${id(905)}',30,'New related reference');`,
  `delete from finance_expenses where id='${id(7777)}';`
 ]){const r=sql('begin;'+auth().replace('set local role authenticated;','')+change+auth()+call()+';rollback;',true);assert.notEqual(r.status,0);assert.match(r.stderr,/REVIEW_STALE/);}
 assert.deepEqual(capture(),beforeState);
});
test('late transaction failure rolls back all nine and preserves the prior eleven',()=>{
 const r=sql('begin;'+auth()+call()+';select 1/0;commit;',true);assert.notEqual(r.status,0);assert.match(r.stderr,/division by zero/);
 assert.equal(sql('select count(*) from advisory_matter_archives'),'11');assert.deepEqual(capture(),beforeState);
});
test('atomic concurrent archive/replay: nine hidden operationally, base history readable, 095 evidence unchanged',async()=>{
 const a=session('begin;'+auth()+call()+';commit;'),b=session('begin;'+auth()+call()+';commit;');
 const results=await Promise.all([a,b]);for(const r of results)assert.equal(r.code,0,r.err);assert.deepEqual(results.map(r=>JSON.parse(r.out.trim()).replayed).sort(),[false,true]);
 assert.deepEqual(capture(),beforeState);assert.equal(sql('select count(*) from advisory_matter_archives'),'20');
 const verified=gate(K.gate(true,pins));assert.equal(verified.gate_pass,true,JSON.stringify(verified.failed_checks));
 for(const n of [1,2,3]){
  assert.equal(as(`select count(*) from advisory_operational_matters where matter_no=any(${K.numberSql})`,n),'0');
  const legacy=`select count(*) from advisory_matters m where m.id not in (${H.reviewed.targets.map(t=>q(t.id)).join(',')}) and m.matter_no=any(${K.numberSql}) and not exists(select 1 from advisory_matter_activities a where a.matter_id=m.id and a.kind='create')`;
  assert.equal(as(legacy,n),'9');
  for(let m=4;m<=12;m++){
   denied(`select advisory_control_read('${id(900+m)}')`,/MATTER_NOT_FOUND/,n);
   assert.equal(as(`select count(*) from advisory_overdue_work('${id(900+m)}')`,n),'0');
   assert.equal(as(`select count(*) from advisory_issue_tasks where advisory_matter_id='${id(900+m)}'`,n),'1');
  }
 }
 denied(call(pins,crypto.randomUUID()),/RETRY_MISMATCH/);
 denied(`update advisory_matters set title='No' where id='${id(904)}'`,/ARCHIVED/);
 denied(`update advisory_issue_tasks set title='No' where advisory_matter_id='${id(904)}'`,/ARCHIVED/);
 // 095 is the historical operation verifier, not the post-096 state assertion.
 const old=gate(H.gate(true,oldPins));assert.deepEqual(old.failed_checks,['SUPERSEDED_BY_096_USE_CURRENT_VERIFIER']);assert.deepEqual(old.checks,{});assert.equal(old.gate_pass,false);
 assert.equal(verified.checks.accepted095_contract_preserved,true);assert.equal(verified.checks.prior_eleven_receipts_preserved,true);
});
test('096 verifier rejects post-archive row, guard, permission and function drift',()=>{
 for(const change of [
  `update finance_expenses set note='drift' where id='${id(7777)}';`,
  `delete from office_work_logs where related_advisory_matter_id='${id(904)}';`,
  `insert into case_audit_logs(id,table_name,record_id,action,user_name) values('${id(8881)}','advisory_matters','${id(904)}','UPDATE','Synthetic audit');`,
  "alter table advisory_stage_visits disable trigger advisory095_write_guard;",
  "grant execute on function advisory096_capture() to authenticated;",
  "alter function advisory096_archive_legacy(uuid,text,jsonb) security invoker;",
  "alter table advisory_journey_snapshots disable trigger advisory086_snapshot_immutable;"
 ]){const r=JSON.parse(sql('begin;'+change+K.gate(true,pins)+'rollback;'));assert.equal(r.gate_pass,false,change);}
 assert.deepEqual(capture(),beforeState);
});

test('post-archive verifier ignores auth metadata and unrelated Finance rows',()=>{
 const result=JSON.parse(sql(`begin;update auth.users set updated_at=now();update finance_expenses set note='Unrelated' where id='${id(7778)}';`+K.gate(true,pins)+'rollback;'));
 assert.equal(result.gate_pass,true,JSON.stringify(result.failed_checks));assert.deepEqual(capture(),beforeState);
});
