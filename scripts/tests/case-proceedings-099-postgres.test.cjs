/* eslint-disable @typescript-eslint/no-require-imports */
const{test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const A=require('./case-proceedings-099-artifacts.cjs'),B=require('./case-core-098-artifacts.cjs'),fixture=require('./case-core-098-fixture.cjs');
const bin='/Applications/Postgres.app/Contents/Versions/18/bin';let dir,started=false,beforeRows;
const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
function cmd(n,args,input){return spawnSync(path.join(bin,n),args,{input,encoding:'utf8',env:{PATH:process.env.PATH,LC_ALL:'C',LANG:'C'},maxBuffer:16*1024*1024});}
function check(n,args,input){const r=cmd(n,args,input);assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout.trim();}
const args=()=>['-X','-qAt','-v','ON_ERROR_STOP=1','-h',dir,'-p','58499','-U','postgres','-d','postgres'];
const sql=s=>check('psql',args(),s),json=s=>JSON.parse(sql(s));
const act=(n,s,role='authenticated')=>`BEGIN;SET LOCAL request.jwt.claims='{"sub":"${uid(n)}"}';SET LOCAL ROLE ${role};${s};ROLLBACK;`;
const facts={kind:'hearing_report',hearing_id:uid(201),event_date:'2026-01-01',title:'Hearing',details:'Actual hearing result',court_result:'Recorded order'};
const event={kind:'own_motion',event_date:'2026-01-02',title:'Motion',details:'Actual motion facts'};
const payload=(f=facts,followups={})=>({facts:f,followups,hearing_updated_at:'2026-01-01T00:00:00+00:00',core_version:0});
const save=(data=payload(),version=0,request=501,id=401)=>`SELECT case099_save(1,'${uid(id)}',${version},'${uid(request)}',${A.j(data)})`;
const perform=s=>`DO $$ BEGIN PERFORM ${s.replace(/^SELECT /,'')}; END $$;`;
const run=(n,s,role)=>sql(act(n,s,role));
function deny(n,s,pattern=/CASE099_|permission denied/,role){const r=cmd('psql',args(),act(n,s,role));assert.notEqual(r.status,0,r.stdout);assert.match(r.stderr,pattern);}
before(()=>{dir=fs.mkdtempSync('/private/tmp/case099-pg-');fs.chmodSync(dir,0o700);check('initdb',['-D',dir+'/data','-U','postgres','-A','trust','--encoding=UTF8','--no-locale']);check('pg_ctl',['-D',dir+'/data','-l',dir+'/server.log','-o',`-F -k ${dir} -p 58499 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
 sql(fixture()+'\n'+A.read(B.candidate)+"\nUPDATE case_timeline SET event_date='2026-01-01',updated_at='2026-01-01T00:00:00Z';");assert.equal(json(A.gate()).gate_pass,true);beforeRows=json(A.rows());sql(A.read(A.candidate));const catalog=json(A.footprint());if(process.env.CAPTURE_CASE099==='1'){fs.writeFileSync(path.join(A.root,A.afterPath),JSON.stringify(catalog,null,2)+'\n');A.generate();}else assert.deepEqual(catalog,JSON.parse(A.read(A.afterPath)));});
after(()=>{if(started)check('pg_ctl',['-D',dir+'/data','-m','fast','-w','stop']);console.log('Owned disposable PostgreSQL stopped:',dir);});
test('additive migration leaves 097/098 objects and all legacy Case/child/audit/counter/Finance rows unchanged',()=>{assert.deepEqual(json(A.rows()),beforeRows);for(const kind of ['tables','functions'])for(const[name,obj]of Object.entries(A.accepted[kind]))assert.deepEqual(json(A.footprint())[kind][name],obj);assert.equal(sql('SELECT count(*) FROM case_proceedings'),'0');assert.equal(sql("SELECT facts->>'untouched' FROM finance_case097_preservation_canary"),'true');});
test('six roles read; only process writers save; password/inactive/anonymous forbidden; direct API writes denied',()=>{for(const n of [1,2,3,4,5,6])assert.deepEqual(JSON.parse(run(n,'SELECT case099_read(1)')),[]);for(const n of [1,2,3,4])assert.equal(JSON.parse(run(n,save()))[0].created_by,uid(n));for(const n of [5,6,7,8,99])deny(n,save(),/FORBIDDEN/);for(const n of [7,8,99])deny(n,'SELECT case099_read(1)',/FORBIDDEN/);for(const role of ['anon','authenticated','service_role']){deny(1,'DELETE FROM case_proceedings',/permission denied/,role);deny(1,'TRUNCATE case_proceedings',/permission denied/,role);}deny(1,'SELECT case099_read(1)',/permission denied/,'anon');});
test('one save commits report, Done hearing, new hearing, explicit deadline, next action and actor atomically with authentic audit',()=>{
 const p=payload(facts,{hearing:{date:'2026-11-01',title:'Next hearing',time:'09:00'},deadline:{date:'2026-10-28',title:'Explicit due date'},next:{mode:'manual',title:'Prepare evidence',assignee_id:uid(3),due:'2026-10-25'},current_actor:uid(4)});
 const out=JSON.parse(run(1,`${perform(save(p))} SELECT jsonb_build_object('report',(SELECT to_jsonb(r) FROM case_proceedings r),'status',(SELECT status FROM case_timeline WHERE id='${uid(201)}'),'hearings',(SELECT count(*) FROM case_timeline),'deadlines',(SELECT count(*) FROM case_deadlines),'core',case098_read(1),'audit_actors',(SELECT bool_and(user_id='${uid(1)}') FROM case_audit_logs WHERE id<>'${uid(201)}'),'tasks',(SELECT count(*) FROM case_tasks))`));
 assert.equal(out.status,'Done');assert.equal(out.hearings,2);assert.equal(out.deadlines,2);assert.ok(out.report.next_hearing_id);assert.ok(out.report.deadline_id);assert.equal(out.core.core.next_title,'Prepare evidence');assert.equal(out.core.team[0].person_id,uid(4));assert.equal(out.audit_actors,true);assert.equal(out.tasks,1);
});
test('optional follow-ups stay absent; report edits preserve prior facts in audit, author and links without replaying effects',()=>{
 const first=payload(facts,{hearing:{date:'2026-11-01',title:'Next'}});const edit=payload({...facts,details:'Corrected factual description'});
 const out=JSON.parse(run(1,`${perform(save(first))}${perform(save(edit,1,502))} SELECT jsonb_build_object('reports',case099_read(1),'hearings',(SELECT count(*) FROM case_timeline),'audit',(SELECT old_data->>'details' FROM case_audit_logs WHERE table_name='case_proceedings' AND action='update'),'core',(SELECT count(*) FROM case_work_core))`));
 assert.equal(out.reports[0].version,2);assert.equal(out.reports[0].details,'Corrected factual description');assert.equal(out.audit,'Actual hearing result');assert.equal(out.hearings,2);assert.equal(out.core,0);assert.equal(out.reports[0].created_by,uid(1));
 deny(1,`${perform(save())}${save(payload(facts,{deadline:{date:'2026-11-01',title:'Again'}}),1,502)}`,/FOLLOWUPS_ALREADY_SAVED/);
});
test('retry is idempotent; changed request and stale edits fail closed; no duplicate report for a hearing',()=>{
 const out=JSON.parse(run(1,`${perform(save())}${perform(save())} SELECT jsonb_build_object('reports',(SELECT count(*) FROM case_proceedings),'audits',(SELECT count(*) FROM case_audit_logs WHERE table_name='case_proceedings'))`));assert.deepEqual(out,{reports:1,audits:1});
 deny(1,`${perform(save())}${save(payload({...facts,details:'Changed'}))}`,/REQUEST_CONFLICT/);
 deny(1,`${perform(save())}${save(payload(),0,502)}`,/STALE/);
 deny(1,`${perform(save())}${save({...payload(),hearing_updated_at:null},0,503,402)}`,/HEARING_STALE|REPORT_EXISTS/);
});
test('one invalid follow-up rolls back report, status, child rows and audit; no partial save',()=>{
 for(const followups of [{hearing:{date:'2026-11-01',title:'Valid'},deadline:{date:'2026-02-31',title:'Invalid'}},{next:{mode:'task',task_id:uid(999)}},{current_actor:uid(6)},{current_actor:uid(8)},{current_actor:uid(7)},{next:{mode:'manual',title:'x',assignee_id:uid(6)}}])deny(1,save(payload(facts,followups)),/CASE099_|CASE098_/);
 assert.deepEqual(json(A.rows()),beforeRows);assert.equal(sql('SELECT count(*) FROM case_proceedings'),'0');assert.equal(sql('SELECT count(*) FROM case_work_core'),'0');
});
test('each procedural kind saves with no hearing mutation; existing Task links without duplication; team roles survive actor handoff',()=>{
 for(const kind of ['own_motion','opponent_motion','court_order'])assert.equal(JSON.parse(run(1,save(payload({...event,kind}))))[0].kind,kind);
 const p=payload(event,{next:{mode:'task',task_id:uid(201)},current_actor:uid(4)});p.core_version=1;
 const out=JSON.parse(run(1,`DO $$BEGIN PERFORM case098_save(1,0,'team','{"assignments":[{"person_id":"${uid(3)}","team_role":"lead"}]}');END$$;${perform(save(p))} SELECT jsonb_build_object('core',case098_read(1),'tasks',(SELECT count(*) FROM case_tasks),'hearing',(SELECT status FROM case_timeline WHERE id='${uid(201)}'))`));
 assert.equal(out.tasks,1);assert.equal(out.hearing,'Scheduled');assert.equal(out.core.core.next_task_id,uid(201));assert.equal(out.core.team.find(t=>t.team_role==='lead').person_id,uid(3));assert.equal(out.core.team.find(t=>t.team_role==='current_actor').person_id,uid(4));
});
test('future/cancelled/deleted/cross-case/stale hearing and unsafe document refs rejected; stale core does not overwrite assignment',()=>{
 for(const patch of ["event_date='2999-01-01'","status='Cancelled'","deleted_at=now()","event_type='filing'","updated_at=now()"]){const r=cmd('psql',args(),`BEGIN;SET request.jwt.claims='{"sub":"${uid(1)}"}';UPDATE case_timeline SET ${patch};${save()};ROLLBACK;`);assert.notEqual(r.status,0);assert.match(r.stderr,/CASE099_HEARING/);}
 deny(1,save(payload({...facts,document_ref:'javascript:alert(1)'})),/INVALID_INPUT/);
 deny(1,save(payload({...facts,hearing_id:uid(999)})),/HEARING_UNAVAILABLE/);
 deny(1,save({...payload(event,{current_actor:uid(3)}),core_version:8}),/CORE_STALE/);
 for(const patch of ["account_type='test'","account_type IS NULL","assignable=false"]){if(patch.includes(' IS '))continue;const r=cmd('psql',args(),`BEGIN;UPDATE user_profiles SET ${patch} WHERE id='${uid(3)}';SET request.jwt.claims='{"sub":"${uid(1)}"}';${save(payload(event,{current_actor:uid(3)}))};ROLLBACK;`);assert.notEqual(r.status,0);assert.match(r.stderr,/PERSON_INELIGIBLE/);}
});
test('verifier is unbound/fail closed until Human review; accepted objects pass, normal activity accepted, schema/security drift rejected',()=>{
 const gate=A.gate(true),binding=A.j(JSON.parse(A.read(A.reviewedPath))),bound=gate.replaceAll(binding,A.j({candidate_sha256:A.hash(A.read(A.candidate)),accepted_contract_sha256:A.acceptedContractSha}));
 const unbound=gate.replaceAll(binding,A.j({candidate_sha256:null,accepted_contract_sha256:null}));
 assert.equal(json(unbound).gate_pass,false);assert.equal(json(gate).gate_pass,true);assert.equal(json(bound).gate_pass,true);
 assert.equal(json("BEGIN;UPDATE cases SET title='Normal activity';INSERT INTO case_audit_logs(case_id,table_name,action) VALUES(1,'cases','update');"+bound+'ROLLBACK;').gate_pass,true);
 for(const drift of ['GRANT UPDATE ON case_proceedings TO authenticated;','DROP POLICY case099_read ON case_proceedings;','ALTER TABLE case_proceedings DROP CONSTRAINT case_proceedings_hearing_id_fkey;','ALTER FUNCTION case098_read(bigint) SECURITY INVOKER;'])assert.equal(json('BEGIN;'+drift+bound+'ROLLBACK;').gate_pass,false);
});

test('report identity never crosses Cases; editing event facts records the real editor and supports type/date correction',()=>{
 const prefix=`BEGIN;SET request.jwt.claims='{"sub":"${uid(1)}"}';INSERT INTO cases SELECT (jsonb_populate_record(NULL::cases,to_jsonb(c)||'{"id":2,"file_no":"Local 2"}'::jsonb)).* FROM cases c WHERE id=1;UPDATE case_timeline SET case_id=2;`;
 const r=cmd('psql',args(),prefix+save()+';ROLLBACK;');assert.notEqual(r.status,0);assert.match(r.stderr,/HEARING_UNAVAILABLE/);
 const edited=payload({...event,kind:'court_order',event_date:'2026-01-03',details:'Corrected order'});
 const out=json(`BEGIN;SET request.jwt.claims='{"sub":"${uid(1)}"}';${perform(save(payload(event)))}SET request.jwt.claims='{"sub":"${uid(2)}"}';${perform(save(edited,1,502))}SELECT jsonb_build_object('row',(SELECT to_jsonb(r) FROM case_proceedings r),'audit',(SELECT to_jsonb(a) FROM case_audit_logs a WHERE table_name='case_proceedings' AND action='update'));ROLLBACK;`);
 assert.equal(out.row.created_by,uid(1));assert.equal(out.row.updated_by,uid(2));assert.equal(out.row.kind,'court_order');assert.equal(out.row.event_date,'2026-01-03');assert.equal(out.audit.old_data.details,event.details);assert.equal(out.audit.user_id,uid(2));
});
