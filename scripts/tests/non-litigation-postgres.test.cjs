/* eslint-disable @typescript-eslint/no-require-imports */
const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {spawnSync,spawn}=require('node:child_process');
const A=require('./non-litigation-artifacts.cjs');const bin='/Applications/Postgres.app/Contents/Versions/18/bin';let dir,started=false,beforeState,appliedContract;
const testLocale=process.env.ADVISORY076_TEST_LOCALE||'C';
assert.ok(['C','en_US.UTF-8'].includes(testLocale),'Only explicit disposable test locales are allowed');
function run(name,args,input,fail=false){const r=spawnSync(bin+'/'+name,args,{input,encoding:'utf8',env:{PATH:process.env.PATH,LC_ALL:'C',LANG:'C'},maxBuffer:16e6});if(!fail)assert.equal(r.status,0,r.stderr||r.error?.message);return fail?r:r.stdout.trim();}
function args(){return ['-X','-qAt','-v','ON_ERROR_STOP=1','-h',dir,'-p','58476','-U','postgres','-d','postgres'];}
function sql(s,fail=false){return run('psql',args(),s,fail);}
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');const q=A.quote;
function auth(n=1){return `set role authenticated;select set_config('request.jwt.claim.sub',${q(id(n))},false);select set_config('request.jwt.claims',${q(JSON.stringify({sub:id(n),email:`person${n}@example.invalid`,role:'authenticated'}))},false);`;}
function call(action,payload={},version=0,matter=id(101),req=crypto.randomUUID()){return `select public.advisory_control_write(${matter?q(matter):'null'},${q(action)},${q(JSON.stringify(payload))},${q(req)},${version});`;}
function as(n,s){const lines=sql(auth(n)+s).split('\n');return JSON.parse(lines.at(-1));}
function version(){return +sql(`select coalesce((select version from advisory_matter_control where matter_id='${id(101)}'),0);`);}
function write(action,payload={},n=1){return as(n,call(action,payload,version()));}
function rejects(s,re){const r=sql(s,true);assert.notEqual(r.status,0);assert.match(r.stderr,re);}
function fixture(){const b=A.approved;let s=`create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;create schema auth;grant usage on schema auth,public to authenticated,anon,service_role;create table auth.users(id uuid primary key);set check_function_bodies=off;`;
 for(const [name,t] of Object.entries(b.catalog)){s+=`create table public.${name} (`+t.columns.map(c=>`"${c.name}" ${c.type}${c.default?' default '+c.default:''}${c.not_null?' not null':''}`).join(',')+');';}
 // Constraints in two passes: primary/unique/check before FKs.
 for(const fk of [false,true])for(const [name,t] of Object.entries(b.catalog))for(const c of t.constraints)if(c.definition.startsWith('FOREIGN KEY')===fk)s+=`alter table public.${name} add constraint "${c.name}" ${c.definition};`;
 for(const t of Object.values(b.catalog))for(const index of t.indexes)if(!t.constraints.some(c=>index.includes('INDEX '+c.name+' ')))s+=index+';';
 for(const f of b.functions)s+=f.definition+';';
 for(const f of b.functions){s+=`alter function ${f.signature} owner to ${f.owner};revoke all on function ${f.signature} from public,anon,authenticated,service_role;`;for(const [role,yes]of Object.entries(f.effective_execute))if(yes)s+=`grant execute on function ${f.signature} to ${role};`;}
 for(const[name,t]of Object.entries(b.catalog)){s+=`alter table public.${name} owner to ${t.owner};`;
 if(t.rls_enabled)s+=`alter table public.${name} enable row level security;`;
 for(const[role,g]of Object.entries(t.effective_grants_before_rls))for(const[priv,yes]of Object.entries(g))if(yes)s+=`grant ${priv} on public.${name} to ${role};`;
 for(const p of t.policies)s+=`create policy "${p.name}" on public.${name} as ${p.permissive?'permissive':'restrictive'} for ${{r:'select',w:'update',a:'insert',d:'delete','*':'all'}[p.command]} to ${p.roles.join(',')} ${p.using?'using ('+p.using+')':''} ${p.check?'with check ('+p.check+')':''};`;
 }
 for(const name of Object.keys(b.finance_matter_references))s+=`create table public.${name}(id uuid primary key,advisory_matter_id uuid references advisory_matters(id),amount numeric,note text);`;
 for(let n=1;n<=8;n++)s+=`insert into auth.users values('${id(n)}');insert into user_profiles(id,full_name,staff_name,email,role,active,account_type,assignable,must_change_password) values('${id(n)}','Person ${n}','Historical ${n}','person${n}@example.invalid','${['admin','lawyer','staff','viewer','lawyer','lawyer','lawyer','admin'][n-1]}',${n!==5},'${n===6?'uat':'operational'}',${![5,6,7].includes(n)},${n===8});`;
 s+=`insert into clients(id,name) values('${id(90)}','SYNTHETIC CLIENT');insert into advisory_matters(id,client_id,title,matter_no,responsible_lawyer,end_date) values('${id(101)}','${id(90)}','Synthetic legacy','ADV-SYNTHETIC','Unmatched legacy name','2020-01-01'),('${id(102)}','${id(90)}','Second','ADV-SECOND',null,null);insert into advisory_matter_counters values(2026,9,now());insert into advisory_issues(id,advisory_matter_id,title,deleted_at) values('${id(201)}','${id(101)}','Legacy deleted',now()),('${id(202)}','${id(101)}','Live issue',null),('${id(203)}','${id(102)}','Other matter',null);insert into advisory_issue_tasks(id,advisory_matter_id,advisory_issue_id,title,assignee_name,status,completed_at) values('${id(301)}','${id(101)}','${id(201)}','Legacy inconsistent','Unmatched task name','in_progress',now());insert into advisory_time_logs(id,advisory_matter_id,advisory_issue_id,work_date,staff_name,minutes,created_by_user_id) values('${id(401)}','${id(101)}','${id(201)}','2026-09-20','Original time name',90,'${id(2)}'),('${id(402)}','${id(101)}',null,'2026-09-20','Other person',30,'${id(3)}');`;
 for(const name of Object.keys(b.finance_matter_references))s+=`insert into ${name} values(gen_random_uuid(),'${id(101)}',123.45,'SYNTHETIC FINANCE CANARY');`;
 for(const t of Object.values(b.catalog))for(const tr of t.triggers)s+=tr.definition+';';return s;}
before(()=>{dir=fs.mkdtempSync('/private/tmp/vp8c-db-');fs.chmodSync(dir,0o700);run('initdb',['-D',dir+'/data','-U','postgres','-A','trust','--encoding=UTF8','--locale='+testLocale]);run('pg_ctl',['-D',dir+'/data','-l',dir+'/server.log','-o',`-F -k ${dir} -p 58476 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;sql(fixture());beforeState=JSON.parse(sql(A.snapshotSql()+';'));
 assert.equal(sql(`select ${q(A.pgJson(beforeState))}::jsonb::text`),A.pgJson(beforeState),'jsonb canonical hashing matches PostgreSQL');
 rejects(fs.readFileSync(A.candidate,'utf8'),/BASELINE_MISMATCH/);
 sql(A.migration(beforeState));
 const applied=JSON.parse(sql(A.appliedSql()+';'));appliedContract=applied;
 fs.writeFileSync(dir+'/applied-contract.json',JSON.stringify({candidate_sha256:A.hash(fs.readFileSync(A.candidate)),contract:applied},null,2)+'\n');
 const verify=JSON.parse(sql('begin read only;'+A.verifier(applied,beforeState)+'rollback;'));
 assert.equal(verify.gate_pass,true,JSON.stringify(verify));


});
after(()=>{if(started)run('pg_ctl',['-D',dir+'/data','-m','fast','-w','stop']);console.log('Disposable PostgreSQL evidence:',dir,'locale:',testLocale);});

test('function preservation hashes use explicit C order and retain the approved 18-function baseline',()=>{
 const candidate=fs.readFileSync(A.candidate,'utf8');
 const stableAggregate=`jsonb_agg(evidence order by (evidence->>'signature') COLLATE "C")`;
 assert.equal(candidate.split(stableAggregate).length-1,2,'Both candidate preservation checks use C order');
 for(const post of [false,true])assert.ok(A.snapshotSql(post).includes(stableAggregate));
 assert.ok(A.verifier(appliedContract,beforeState).includes(stableAggregate));
 assert.equal(candidate,A.migration(),'Candidate exactly matches its offline generator');
 const accepted=A.approvedState().functions;
 assert.equal(accepted.length,18);
 const expectedHash='dffbc07fcd28887910eebe96323cc1b21e756aa71fad061f28b8d454dbdf4372';
 assert.equal(A.hash(A.pgJson(accepted)),expectedHash,'Never rebase to locale-dependent ordering');
 assert.equal(sql('select datcollate from pg_database where datname=current_database()'),testLocale);
 for(const input of [accepted,accepted.toReversed()]){
  const hash=sql(`with functions as (select value evidence from jsonb_array_elements(${q(JSON.stringify(input))}::jsonb)) select encode(sha256(convert_to((${stableAggregate})::text,'UTF8')),'hex') from functions;`);
  assert.equal(hash,expectedHash,'Hash is independent of input order and database locale');
 }
});
test('function security drift still fails preservation and rolls back',()=>{
 for(const mutation of [
  'grant execute on function can_create_advisory_matter() to anon;',
  'alter function can_create_advisory_matter() security invoker;',
 ]){
  const result=JSON.parse(sql('begin;'+mutation+A.verifier(appliedContract,beforeState)+'rollback;'));
  assert.equal(result.gate_pass,false);
  assert.equal(result.checks.existing_functions_preserved,false);
  assert.ok(result.failed_checks.includes('existing_functions_preserved'));
  assert.equal(result.historical_rows_unchanged,true);
  assert.deepEqual(JSON.parse(sql(A.snapshotSql(true)+';')),beforeState,'Rollback restores complete preservation baseline');
 }
});

test('migration preserves every historical field, ACL/policy/helper, counter and Finance canary; no invented journey',()=>{assert.deepEqual(JSON.parse(sql(A.snapshotSql(true)+';')),beforeState);assert.equal(sql('select count(*) from advisory_stage_visits'),'0');assert.equal(sql('select count(*) from advisory_matter_team'),'0');assert.equal(sql('select assignee_user_id is null and stage_id is null from advisory_issue_tasks'),'t');});
test('permission isolation, inactive/UAT/unassignable pool, no direct write or anon RPC',()=>{for(const n of [4,5,8])rejects(auth(n)+call('note',{text:'x'}),/FORBIDDEN/);rejects(auth(3)+call('stage',{stage_key:'intake'}),/FORBIDDEN/);rejects(auth(1)+`insert into advisory_matter_team values('${id(101)}','${id(2)}','lead')`,/permission denied/);rejects('set role anon;select advisory_control_read();',/permission denied/);for(const n of [5,6,7])rejects(auth(1)+call('team',{user_id:id(n),role:'lead'},version()),/NOT_ASSIGNABLE/);rejects(auth(1)+call('team',{user_id:id(3),role:'lead'},version()),/NOT_ASSIGNABLE/);write('team',{user_id:id(2),role:'lead'});write('team',{user_id:id(3),role:'assistant'});});
test('new matter uses existing atomic numbering; no assignment to legacy text; no initial historical stage',()=>{const r=as(1,call('create',{client_id:id(90),title:'New controlled matter',lead_id:id(2),matter_type:'contract_review'},0,null));assert.equal(sql(`select responsible_lawyer is null from advisory_matters where id='${r.matter_id}'`),'t');assert.equal(sql(`select count(*) from advisory_matter_stages where matter_id='${r.matter_id}'`),'9');assert.equal(sql(`select count(*) from advisory_stage_visits where matter_id='${r.matter_id}'`),'0');});
test('stage switch, skip, elapsed and work-state intervals record truth exactly once; retry idempotent',()=>{const req=crypto.randomUUID(),v=version(),c=call('stage',{stage_key:'intake',template:'general'},v,id(101),req);const first=as(1,c);assert.deepEqual(as(1,c),first);assert.equal(sql(`select count(*) from advisory_stage_visits where matter_id='${id(101)}'`),'1');write('stage_skip',{stage_key:'information'});write('stage',{stage_key:'analysis'});assert.equal(sql(`select count(*) from advisory_stage_visits where matter_id='${id(101)}' and kind='visit' and exited_at is null`),'1');write('work_state',{state:'waiting_client',reason:'Await instructions'});write('work_state',{state:'working'});assert.equal(sql(`select count(*) from advisory_work_state_events where matter_id='${id(101)}' and ended_at is null`),'1');rejects(auth(1)+call('stage',{stage_key:'execution'},0),/CHANGED/);});
test('Matter-level and Issue Tasks; no cross-parent link; legacy inconsistent rows survive metadata edit',()=>{const r=write('task_save',{title:'Direct Matter Task',assignee_user_id:id(3),status:'pending',due_date:'2026-09-30'},3);assert.equal(sql(`select advisory_issue_id is null from advisory_issue_tasks where id='${r.item_id}'`),'t');write('next_action',{task_id:r.item_id});let d=as(1,`select advisory_control_read('${id(101)}');`);assert.equal(d.items[0].next_action,'Direct Matter Task');write('task_complete',{id:r.item_id},3);d=as(1,`select advisory_control_read('${id(101)}');`);assert.equal(d.items[0].next_action,null);rejects(auth(1)+call('task_save',{title:'Bad',issue_id:id(203)},version()),/ISSUE_NOT_AVAILABLE/);write('task_save',{id:id(301),title:'Explicit title edit',status:'in_progress'});assert.equal(sql(`select completed_at is not null and assignee_name='Unmatched task name' from advisory_issue_tasks where id='${id(301)}'`),'t');write('task_save',{title:'Linked live issue',issue_id:id(202)});});
test('invoker aggregate respects original own-Time RLS, no inferred historical Stage',()=>{const admin=as(1,`select advisory_control_read('${id(101)}');`),lawyer=as(2,`select advisory_control_read('${id(101)}');`);assert.equal(admin.time.minutes,120);assert.equal(lawyer.time.minutes,90);assert.equal(lawyer.time.unclassified,1);assert.ok(lawyer.stages.every(s=>s.minutes===null));});
test('close/outcome and reopen retain original end_date and all Time/Tasks; current journey closes safely',()=>{write('close',{outcome:'completed',summary:'Client accepted',follow_up:'Check next year'});assert.equal(sql(`select count(*) from advisory_stage_visits where matter_id='${id(101)}' and kind='visit' and exited_at is null`),'0');assert.equal(sql(`select end_date::text from advisory_matters where id='${id(101)}'`),'2020-01-01');rejects(auth(1)+call('note',{text:'Closed'},version()),/CLOSED/);write('reopen',{reason:'New instructions'});assert.equal(sql('select count(*) from advisory_time_logs'),'2');});
test('independent PostgreSQL sessions racing from one version yield one transition, no dual stage',async()=>{const v=version();function independent(stage){return new Promise(resolve=>{const p=spawn(bin+'/psql',args(),{env:{PATH:process.env.PATH,LC_ALL:'C'}});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('close',code=>resolve({code,out,err}));p.stdin.end(auth(1)+call('stage',{stage_key:stage},v));});}const r=await Promise.all([independent('execution'),independent('delivery')]);assert.equal(r.filter(x=>x.code===0).length,1);assert.match(r.find(x=>x.code!==0).err,/CHANGED/);assert.equal(sql(`select count(*) from advisory_stage_visits where matter_id='${id(101)}' and kind='visit' and exited_at is null`),'1');});


test('deleted Task restore and Issue deletion cannot create new inconsistent live children',()=>{
 const r=write('task_save',{title:'Restore me'});write('task_delete',{id:r.item_id});
 const deleted=as(1,`select advisory_control_section('${id(101)}','deleted_tasks')`);assert.ok(deleted.items.some(t=>t.id===r.item_id));
 write('task_restore',{id:r.item_id});assert.equal(sql(`select deleted_at is null from advisory_issue_tasks where id='${r.item_id}'`),'t');
 rejects(auth(1)+`update advisory_issues set deleted_at=now() where id='${id(202)}'`,/ISSUE_HAS_LIVE_RECORDS/);
 write('task_delete',{id:id(301)});rejects(auth(1)+call('task_restore',{id:id(301)},version()),/ISSUE_NOT_AVAILABLE/);
 assert.equal(sql(`select assignee_name from advisory_issue_tasks where id='${id(301)}'`),'Unmatched task name');
});
test('Stage-linked Time remains actual effort with own-row visibility; new invalid links and restore rejected',()=>{
 const stage=sql(`select id from advisory_matter_stages where matter_id='${id(101)}' and stage_key='analysis'`);
 sql(auth(2)+`insert into advisory_time_logs(id,advisory_matter_id,work_date,staff_name,minutes,created_by_user_id,stage_id) values('${id(403)}','${id(101)}','2026-09-27','Explicit time identity',25,'${id(2)}','${stage}')`);
 const lawyer=as(2,`select advisory_control_read('${id(101)}')`);assert.equal(lawyer.time.minutes,115);assert.equal(lawyer.stages.find(s=>s.stage_key==='analysis').minutes,25);assert.equal(lawyer.time.unclassified,1);
 rejects(auth(2)+`insert into advisory_time_logs(advisory_matter_id,advisory_issue_id,work_date,staff_name,minutes,created_by_user_id) values('${id(101)}','${id(201)}','2026-09-27','x',5,'${id(2)}')`,/ISSUE_NOT_AVAILABLE/);
 sql(auth(1)+`update advisory_time_logs set deleted_at=now() where id='${id(401)}'`);rejects(auth(1)+`update advisory_time_logs set deleted_at=null where id='${id(401)}'`,/ISSUE_NOT_AVAILABLE/);
});
test('deliverables accept only Drive links, preserve versions in Activity; lifecycle cannot bypass closing',()=>{
 rejects(auth(1)+call('deliverable',{title:'Bad URL',drive_url:'https://drive.google.com.evil.invalid/a'},version()),/check constraint/);
 const r=write('deliverable',{title:'Opinion',status:'draft',version_label:'1',drive_url:'https://docs.google.com/document/d/synthetic'});
 write('deliverable',{id:r.item_id,title:'Opinion',status:'ready',version_label:'2'});
 const events=JSON.parse(sql(`select detail from advisory_matter_activities where kind='deliverable' order by occurred_at desc limit 1`));assert.equal(events.previous_deliverable.version_label,'1');
 rejects(auth(1)+`update advisory_matters set status='completed' where id='${id(101)}'`,/USE_CONTROL_LIFECYCLE/);
 write('close',{outcome:'cancelled',summary:'Explicit cancellation'});assert.equal(sql(`select status from advisory_matters where id='${id(101)}'`),'cancelled');
 rejects(auth(1)+`update advisory_matters set status='active' where id='${id(101)}'`,/USE_CONTROL_LIFECYCLE/);
 write('reopen',{reason:'Resume'});
});
test('all operational writes preserve Finance values and old names; verifier detects changed rows and ACL',()=>{
 assert.deepEqual(JSON.parse(sql(A.snapshotSql(true)+';')).finance,beforeState.finance);
 assert.equal(sql(`select responsible_lawyer from advisory_matters where id='${id(101)}'`),'Unmatched legacy name');
 const result=JSON.parse(sql('begin read only;'+A.verifier(appliedContract,beforeState)+'rollback;'));assert.equal(result.gate_pass,false);assert.equal(result.historical_rows_unchanged,false);
 const drift=JSON.parse(sql('begin;grant execute on function advisory_control_write(uuid,text,jsonb,uuid,bigint) to anon;'+A.verifier(appliedContract,beforeState)+'rollback;'));assert.equal(drift.applied_state_exact,false);
});

test('list filters, pagination and DB summary use stored facts; inactive Admin is denied',()=>{
 const all=as(1,'select advisory_control_read();');assert.ok(all.total>=3);assert.ok(all.summary.open>=2);
 const filtered=as(1,`select advisory_control_read(null,'{"search":"ADV-SECOND"}')`);assert.equal(filtered.total,1);assert.equal(filtered.items[0].id,id(102));assert.equal(filtered.items[0].stage_key,null);
 const empty=as(1,`select advisory_control_read(null,'{"search":"no-such-matter"}')`);assert.equal(empty.total,0);assert.equal(empty.items.length,0);
 const page=as(1,`select advisory_control_read(null,'{"limit":1,"offset":1}')`);assert.equal(page.items.length,1);assert.equal(page.total,all.total);
 rejects(`begin;update user_profiles set active=false where id='${id(1)}';`+auth(1)+'select advisory_control_read();rollback;',/FORBIDDEN/);
});
test('independent create sessions preserve atomic numbering and identical retry creates one Matter only',async()=>{
 function session(query){return new Promise(resolve=>{const p=spawn(bin+'/psql',args(),{env:{PATH:process.env.PATH,LC_ALL:'C'}});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('close',code=>resolve({code,out,err}));p.stdin.end(auth(1)+query);});}
 const payload={client_id:id(90),title:'Concurrent create',lead_id:id(2),matter_type:'license_regulatory'};
 const r=await Promise.all([session(call('create',payload,0,null)),session(call('create',payload,0,null))]);for(const x of r)assert.equal(x.code,0,x.err);
 assert.equal(sql("select count(*)=count(distinct matter_no) from advisory_matters"),'t');
 const body=call('create',{...payload,title:'Idempotent create'},0,null,crypto.randomUUID());
 const retried=await Promise.all([session(body),session(body)]);for(const x of retried)assert.equal(x.code,0,x.err);assert.equal(retried[0].out,retried[1].out);assert.equal(sql("select count(*) from advisory_matters where title='Idempotent create'"),'1');
 assert.deepEqual(JSON.parse(sql(A.snapshotSql(true)+';')).finance,beforeState.finance);
});
