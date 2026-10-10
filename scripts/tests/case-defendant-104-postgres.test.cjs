/* eslint-disable @typescript-eslint/no-require-imports */
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync,spawn}=require('node:child_process');
const A=require('./case-defendant-104-artifacts.cjs'),fixture=require('./case-core-098-fixture.cjs');
const bin='/Applications/Postgres.app/Contents/Versions/18/bin';let dir,started=false,beforeRows;
const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
function cmd(n,args,input){return spawnSync(path.join(bin,n),args,{input,encoding:'utf8',env:{PATH:process.env.PATH,LC_ALL:'C',LANG:'C'},maxBuffer:64*1024*1024});}
function check(n,args,input){const r=cmd(n,args,input);assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout.trim();}
const args=()=>['-X','-qAt','-v','ON_ERROR_STOP=1','-h',dir,'-p','58504','-U','postgres','-d','postgres'];
const sql=s=>check('psql',args(),s),json=s=>JSON.parse(sql(s));
const act=(n,s,role='authenticated')=>`BEGIN;SET LOCAL request.jwt.claims='{"sub":"${uid(n)}"}';SET LOCAL ROLE ${role};${s};SET CONSTRAINTS ALL IMMEDIATE;ROLLBACK;`;
const run=(n,s,role)=>sql(act(n,s,role));
const perform=s=>`DO $$ BEGIN PERFORM ${s.replace(/^SELECT /,'')}; END $$;`;
const versions=(extra={},cid=1)=>`jsonb_build_object('scope',(SELECT count(*) FROM case_service_events WHERE case_id=${cid} AND action LIKE 'case104_%'),'flow',coalesce((SELECT version FROM case_flow_instances WHERE case_id=${cid} AND track_key='main'),0),'core',coalesce((SELECT version FROM case_work_core WHERE case_id=${cid}),0),'deadlines',(SELECT coalesce(jsonb_object_agg(id,jsonb_build_object('due',current_due_date,'updated_at',updated_at)),'{}') FROM case_deadlines WHERE case_id=${cid}))||${A.j(extra)}`;
const call=(action,data={},extra={},request=601,cid=1)=>`SELECT case104_save(${cid},'${uid(request)}','${action}',${versions(extra,cid)},${A.j(data)})`;
const rep=(parties=[201,202,203],request=501)=>perform(call('representation',{parties:parties.map(uid),active:true},{},request));
const flow=(stage='D-CIV-02',request=502)=>perform(call('flow_start',{id:uid(401),stage,start_kind:'cut_in',acknowledged:true},{},request));
const deadlines=(parties=[201,202,203])=>parties.map((p,n)=>perform(call('deadline',{party_id:uid(p),due:`2026-02-${String(10+n).padStart(2,'0')}`,confirmed:true},{},510+n))).join('');
const filing=(id=701,parties=[201],request=601,date='2026-02-01')=>call('filing_create',{id:uid(id),parties:parties.map(uid),filed_on:date},{entity:0},request);
const prepared=(parties=[201,202,203])=>rep(parties)+flow()+deadlines(parties);
const view=`SELECT case104_read(1)`;
function deny(n,s,pattern=/CASE104_|permission denied/,role){const r=cmd('psql',args(),act(n,s,role));assert.notEqual(r.status,0,r.stdout);assert.match(r.stderr,pattern);}
const snapshot=()=>`SELECT jsonb_build_object('legacy',(${A.rows()}),'service',(SELECT jsonb_agg(to_jsonb(x) ORDER BY party_id) FROM case_service_controls x),'events',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM case_service_events x),'attempts',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM case_service_attempts x),'flow',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM case_flow_instances x),'transitions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM case_flow_transitions x))`;
before(()=>{
 dir=fs.mkdtempSync('/private/tmp/case104-pg-');fs.chmodSync(dir,0o700);
 check('initdb',['-D',dir+'/data','-U','postgres','-A','trust','--encoding=UTF8','--no-locale']);
 check('pg_ctl',['-D',dir+'/data','-l',dir+'/server.log','-o',`-F -k ${dir} -p 58504 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
 sql(fixture());for(const name of ['case-core-098','case-proceedings-099','case-engagement-100','case-flow-101','case-service-102','case-service-103'])sql(A.read(require('./'+name+'-artifacts.cjs').candidate));
 sql(`UPDATE parties SET role='defendant',first_name='Local D1',entity_type='individual';INSERT INTO parties(id,case_id,role,first_name,entity_type) VALUES('${uid(202)}',1,'defendant','Local D2','individual'),('${uid(203)}',1,'defendant','Local D3','individual'),('${uid(211)}',1,'plaintiff','Local P1','individual');`);
 assert.equal(json(A.gate()).gate_pass,true,JSON.stringify(json(A.gate())));beforeRows=json(snapshot());sql(A.read(A.candidate));
 const catalog={...json(A.footprint()),seed:json(A.seed())};
 if(process.env.CAPTURE_CASE104==='1'){fs.writeFileSync(path.join(A.root,A.afterPath),JSON.stringify(catalog,null,2)+'\n');A.generate();}else assert.deepEqual(catalog,JSON.parse(A.read(A.afterPath)));
});
after(()=>{if(started){check('pg_ctl',['-D',dir+'/data','-m','fast','-w','stop']);started=false;assert.equal(cmd('pg_ctl',['-D',dir+'/data','status']).status,3);}console.log('Owned disposable PostgreSQL verified stopped:',dir);});
test('installation is DDL + one immutable 3-stage template only; all legacy rows and accepted functions preserved',()=>{
 assert.deepEqual(json(snapshot()),beforeRows);assert.equal(A.additiveApplySql(A.read(A.candidate)),true);
 const actual=json(A.footprint());for(const[name,fn]of Object.entries(A.accepted.functions))assert.deepEqual(actual.functions[name],fn,name);
 const changed=new Set(['case_flow_instances','case_service_controls','case_deadlines','case_deadline_extensions']);
 for(const[name,t]of Object.entries(A.accepted.tables))if(!changed.has(name))assert.deepEqual(actual.tables[name],t,name);
 for(const t of A.newTables)assert.equal(sql('SELECT count(*) FROM '+t),'0');
 assert.deepEqual(json(A.seed()).stages.filter(s=>s.template_id==='civil_ordinary_plaintiff_v1'),A.accepted.seed.stages);
 assert.deepEqual(json(A.seed()).stages.filter(s=>s.template_id==='civil_ordinary_defendant_v1').map(s=>s.stage_key),['D-CIV-01','D-CIV-02','D-CIV-03']);
 assert.equal(A.newTables.includes('case_defendant_events'),false);
});
test('role/security parity, actual actor, private helpers and API writes denied',()=>{
 for(const n of [1,2,3,4,5,6])assert.equal(JSON.parse(run(n,view)).represented.length,0);
 for(const n of [1,2,3])assert.equal(JSON.parse(run(n,rep([201])+view)).represented[0].recorded_by,uid(n));
 for(const n of [4,5,6,7,8,99])deny(n,rep([201]),/LAWYER_REQUIRED|FORBIDDEN/);
 for(const n of [7,8,99])deny(n,view,/FORBIDDEN/);
 for(const role of ['anon','service_role']){deny(3,view,/permission denied/,role);deny(3,rep([201]),/permission denied/,role);}
 for(const t of A.newTables)for(const op of ['DELETE FROM','TRUNCATE'])deny(3,`${op} ${t}`,/permission denied/);
 deny(3,`SELECT case104_filed_date(1,'${uid(201)}')`,/permission denied/);
 deny(3,call('representation',{parties:[uid(201)],active:true,recorded_by:uid(1)}),/INVALID_INPUT/);
 for(const t of A.newTables)assert.match(cmd('psql',args(),`DELETE FROM ${t}`).stderr,/IMMUTABLE/);
});
test('representation uses exact live Defendant IDs; withdrawal/re-add preserves all existing facts and creates no duplicate obligation',()=>{
 deny(3,rep([211]),/PARTY_UNAVAILABLE/);deny(3,rep([201,201]),/DUPLICATE_PARTY/);deny(3,rep([999]),/PARTY_UNAVAILABLE/);
 const out=run(3,`${prepared([201,202])}${perform(filing())}SELECT case104_read(1);${perform(call('representation',{parties:[uid(202)],active:false,reason:'Scope withdrawn'},{},602))}${view};${perform(call('representation',{parties:[uid(202)],active:true},{},603))}${view}`).split('\n').map(JSON.parse);
 assert.deepEqual(out[1].represented[1].deadline,out[0].represented[1].deadline);assert.deepEqual(out[2].represented[1].deadline,out[0].represented[1].deadline);
 assert.equal(out[1].all_resolved,true);assert.equal(out[2].all_resolved,false);assert.equal(out[2].represented.length,2);assert.equal(out[2].filings.length,1);
 assert.deepEqual(out[1].filings,out[0].filings);assert.equal(out[1].represented[1].active,false);assert.equal(out[2].represented[1].active,true);
});
test('D1 single filing resolves only its linked deadline; projection and true actor are atomic; no task or auto-stage',()=>{
 const r=JSON.parse(run(3,`${prepared()}${perform(filing())}${view}`));
 assert.equal(r.represented[0].deadline.status,'Done');assert.equal(r.represented[0].control.answer_filed_on,'2026-02-01');
 assert.equal(r.represented[1].deadline.status,'Active');assert.equal(r.represented[2].deadline.status,'Active');assert.equal(r.flow.current_stage,'D-CIV-02');assert.equal(r.all_resolved,false);
 assert.equal(r.filings[0].recorded_by,uid(3));assert.equal(r.history[0].action,'case104_filing_create');
});
test('D1+D2 separate filings stay independent; joint filing has one identity and two coverage rows',()=>{
 let r=JSON.parse(run(3,`${prepared([201,202])}${perform(filing())}${perform(filing(702,[202],602))}${view}`));
 assert.equal(r.filings.length,2);assert.equal(r.all_resolved,true);assert.equal(r.suggestion.stage,'D-CIV-03');assert.equal(r.flow.current_stage,'D-CIV-02');
 r=JSON.parse(run(3,`${prepared()}${perform(filing(701,[201,202]))}${view}`));
 assert.equal(r.filings.length,1);assert.equal(r.filings[0].coverage.length,2);assert.equal(r.represented[0].deadline.status,'Done');assert.equal(r.represented[1].deadline.status,'Done');assert.equal(r.represented[2].deadline.status,'Active');
});
test('joint pending/granted/corrected extension reuses distinct core rows and due dates; never resolves filing obligation',()=>{
 const pending={id:uid(801),parties:[uid(201),uid(202)],requested_on:'2026-01-20'};
 const grant={id:uid(801),reason:'Actual court order',confirmed:true,grants:[{party_id:uid(201),due:'2026-03-01'},{party_id:uid(202),due:'2026-03-10'}]};
 const r=run(3,`${prepared()}${perform(call('extension',pending,{entity:0}))}${view};${perform(call('extension',grant,{entity:1},602))}${view};${perform(call('extension',{...grant,reason:'Correct date against order',grants:[{party_id:uid(201),due:'2026-03-02'},{party_id:uid(202),due:'2026-03-11'}]},{entity:2},603))}${view}`).split('\n').map(JSON.parse);
 assert.equal(r[0].extension_groups[0].lifecycle,'pending');assert.equal(r[0].represented[0].deadline.current_due_date,'2026-02-10');assert.equal(r[0].represented[0].extensions.length,0);
 assert.equal(r[1].represented[0].deadline.current_due_date,'2026-03-01');assert.equal(r[1].represented[1].deadline.current_due_date,'2026-03-10');assert.equal(r[1].represented[2].deadline.current_due_date,'2026-02-12');assert.equal(r[1].all_resolved,false);
 assert.equal(r[2].represented[0].extensions.length,1);assert.equal(r[2].represented[1].extensions.length,1);assert.equal(r[2].represented[0].deadline.current_due_date,'2026-03-02');
 deny(3,`${prepared()}${call('extension',{...pending,grants:grant.grants},{entity:0})}`,/CONFIRM_REQUIRED/);
 deny(3,`${prepared()}${call('extension',{...pending,confirmed:true,grants:[grant.grants[0],{party_id:uid(203),due:'2026-03-20'}]},{entity:0})}`,/EXTENSION_COVERAGE/);
});
const cc=(overrides={})=>({id:uid(901),version:0,filing_id:uid(701),filed_on:'2026-02-01',claimants:[uid(201),uid(202)],targets:[uid(211)],...overrides});
test('joint counterclaim structured linkage excludes D3; invalid claimant/target/case rejected',()=>{
 const base=prepared()+perform(filing(701,[201,202]));
 const r=JSON.parse(run(3,`${base}${perform(call('counterclaim_create',cc(),{},602))}${view}`));
 assert.equal(r.counterclaims.length,1);assert.equal(r.counterclaims[0].coverage.length,3);assert.equal(r.counterclaims[0].filing_id,uid(701));assert.equal(r.represented[2].deadline.status,'Active');
 deny(3,`${base}${call('counterclaim_create',cc({claimants:[uid(203)]}),{},602)}`,/COUNTERCLAIM_COVERAGE/);
 deny(3,`${base}${call('counterclaim_create',cc({targets:[uid(203)]}),{},602)}`,/PARTY_UNAVAILABLE/);
});
test('active Counterclaim blocks dependent void/coverage/replacement, permits non-impact correction; preserves originals',()=>{
 const base=prepared()+perform(filing(701,[201,202]))+perform(call('counterclaim_create',cc(),{},602));
 deny(3,`${base}${call('filing_void',{id:uid(701),reason:'Wrong entry'},{entity:1},603)}`,/ACTIVE_COUNTERCLAIM/);
 deny(3,`${base}${call('filing_correct',{id:uid(701),parties:[uid(201)],reason:'Coverage correction'},{entity:1},603)}`,/ACTIVE_COUNTERCLAIM/);
 deny(3,`${base}${call('filing_correct',{id:uid(701),replacement_id:uid(702),reason:'Identity correction'},{entity:1},603)}`,/ACTIVE_COUNTERCLAIM/);
 deny(3,`${base}${call('filing_void',{id:uid(701),reason:'Invalid dependency',dependencies:[{id:uid(901),version:1,reason:'Missing action'}]},{entity:1},603)}`,/INVALID_DEPENDENCY/);
 const r=JSON.parse(run(3,`${base}${perform(call('filing_correct',{id:uid(701),document_ref:'https://example.invalid/correct-reference',reason:'Correct evidence URL'},{entity:1},603))}${view}`));
 assert.equal(r.counterclaims[0].lifecycle,'active');assert.equal(r.filings[0].coverage.length,2);assert.equal(r.filings[0].version,2);assert.equal(r.history[0].before_data.filings[0].document_ref,null);
});
test('filed-date correction syncs projections; withdrawing/re-adding a filed Party preserves Filing, Extension and Deadline facts',()=>{
 const ext={id:uid(801),parties:[uid(201),uid(202)],confirmed:true,grants:[{party_id:uid(201),due:'2026-03-01'},{party_id:uid(202),due:'2026-03-10'}]};
 const base=prepared()+perform(call('extension',ext,{entity:0},610))+perform(filing(701,[201,202]));
 const r=run(3,`${base}${perform(call('filing_correct',{id:uid(701),filed_on:'2026-02-02',reason:'Correct against filed document'},{entity:1},602))}${view};${perform(call('representation',{parties:[uid(202)],active:false,reason:'Engagement withdrawn'},{},603))}${view};${perform(call('representation',{parties:[uid(202)],active:true},{},604))}${view}`).split('\n').map(JSON.parse);
 for(const p of r[0].represented.slice(0,2)){assert.equal(p.control.answer_filed_on,'2026-02-02');assert.equal(p.deadline.status,'Done');}
 assert.equal(r[0].represented[2].control.answer_filed_on,null);
 for(const state of r.slice(1)){
  assert.deepEqual(state.filings,r[0].filings);assert.deepEqual(state.extension_groups,r[0].extension_groups);
  assert.deepEqual(state.represented[1].deadline,r[0].represented[1].deadline);assert.deepEqual(state.represented[1].extensions,r[0].represented[1].extensions);
  assert.equal(state.represented[1].resolved,true);
 }
 assert.equal(r[0].history[0].before_data.filings[0].filed_on,'2026-02-01');
 assert.equal(r[2].filings.length,1);assert.equal(r[2].represented[1].extensions.length,1);
});
test('explicit Counterclaim correction or relink + Filing replacement is atomic; no active orphan or removed original coverage',()=>{
 const base=prepared()+perform(filing(701,[201,202]))+perform(call('counterclaim_create',cc(),{},602));
 const corrected=JSON.parse(run(3,`${base}${perform(call('filing_correct',{id:uid(701),parties:[uid(201)],reason:'Correct coverage',dependencies:[{action:'correct',id:uid(901),version:1,claimants:[uid(201)],reason:'Source identifies only D1'}]},{entity:1},603))}${view}`));
 assert.equal(corrected.filings[0].coverage.length,3);assert.equal(corrected.represented[1].deadline.status,'Active');assert.equal(corrected.counterclaims[0].coverage.length,5);
 const replaced=JSON.parse(run(3,`${base}${perform(call('filing_correct',{id:uid(701),replacement_id:uid(702),reason:'Replace incorrect filing identity',dependencies:[{action:'relink',id:uid(901),version:1,filing_id:uid(702),reason:'Explicit evidence correction'}]},{entity:1},603))}${view}`));
 assert.equal(replaced.filings.find(f=>f.id===uid(701)).lifecycle,'corrected');assert.equal(replaced.counterclaims[0].filing_id,uid(702));assert.equal(replaced.counterclaims[0].lifecycle,'active');
 const voided=JSON.parse(run(3,`${base}${perform(call('filing_void',{id:uid(701),reason:'Duplicate source record',dependencies:[{action:'void',id:uid(901),version:1,reason:'Counterclaim entry itself was erroneous'}]},{entity:1},603))}${view}`));
 assert.equal(voided.counterclaims[0].lifecycle,'void');assert.equal(voided.filings[0].lifecycle,'void');assert.equal(voided.filings[0].coverage.length,2);
});
test('void joint A with active B(D1) recomputes projection and reopens D2 only; earliest active filed date is compatibility projection',()=>{
 const r=JSON.parse(run(3,`${prepared()}${perform(filing(701,[201,202],601,'2026-02-01'))}${perform(filing(702,[201],602,'2026-02-03'))}${perform(call('filing_void',{id:uid(701),reason:'Incorrect first filing'},{entity:1},603))}${view}`));
 assert.equal(r.represented[0].control.answer_filed_on,'2026-02-03');assert.equal(r.represented[0].deadline.status,'Done');assert.equal(r.represented[1].control.answer_filed_on,null);assert.equal(r.represented[1].deadline.status,'Active');assert.equal(r.represented[2].deadline.status,'Active');
 assert.equal(r.filings[0].coverage.length,2);assert.equal(r.flow.current_stage,'D-CIV-02');
});
test('D-CIV-03 void does not auto-rewind; inconsistency yields Human-confirmed RETURN and immutable history',()=>{
 const base=prepared([201,202])+perform(filing(701,[201,202]))+perform(call('flow_transition',{id:uid(401),stage:'D-CIV-03',confirmed:true},{},602))+perform(call('filing_void',{id:uid(701),reason:'Correct false filing report'},{entity:1},603));
 let r=JSON.parse(run(3,`${base}${view}`));assert.equal(r.flow.current_stage,'D-CIV-03');assert.equal(r.flow_inconsistency,true);assert.deepEqual(r.suggestion,{code:'RETURN',stage:'D-CIV-02',human_confirm_required:true});
 deny(3,`${base}${call('flow_transition',{id:uid(401),stage:'D-CIV-02',reason:'Obligation reopened'},{},604)}`,/CONFIRM_REQUIRED/);
 r=JSON.parse(run(4,`SET request.jwt.claims='{"sub":"${uid(3)}"}';${base}SET request.jwt.claims='{"sub":"${uid(4)}"}';${perform(call('flow_transition',{id:uid(401),stage:'D-CIV-02',confirmed:true,reason:'Obligation reopened'},{},604))}${view}`));
 assert.equal(r.flow.current_stage,'D-CIV-02');assert.equal(r.flow_inconsistency,false);assert.equal(r.transitions[0].transition_code,'RETURN');assert.equal(r.transitions.length,3);
});
test('old RPC and direct API cannot bypass active-Filing truth, confirmed stage gate or linked Deadline guard',()=>{
 deny(3,`${prepared()}SELECT case101_save(1,'${uid(401)}',1,'${uid(650)}','advance','{"stage":"D-CIV-03"}')`,/CASE104_UNRESOLVED/);
 deny(3,`${prepared()}SELECT case102_save(1,'${uid(201)}',1,'${uid(650)}','answer','{"date":"2026-02-01"}')`,/CASE102_PILOT_REQUIRED/);
 deny(3,`${prepared()}UPDATE case_deadlines SET status='Done' WHERE id=(SELECT answer_deadline_id FROM case_service_controls WHERE party_id='${uid(201)}')`,/CONTROLLED_DEADLINE_ONLY/);
 deny(3,`${prepared()}INSERT INTO case_deadline_extensions(deadline_id,extension_no,granted_until_date) SELECT answer_deadline_id,1,'2026-03-01' FROM case_service_controls WHERE party_id='${uid(201)}'`,/CONTROLLED_DEADLINE_ONLY/);
 deny(3,`${prepared()}RESET ROLE;UPDATE case_service_controls SET answer_filed_on='2026-02-01' WHERE party_id='${uid(201)}'`,/PROJECTION_ONLY/);
});
test('retry receipt is exact, request/actor conflicts fail; stale and late audit failure roll back all joint effects',()=>{
 const base=prepared();const first=filing(701,[201,202]);
 const facts={id:uid(701),parties:[uid(201),uid(202)],filed_on:'2026-02-01'};
 const r=JSON.parse(run(3,`${base}DO $$DECLARE tokens jsonb:=${versions({entity:0})}; first jsonb;again jsonb;BEGIN
 first:=case104_save(1,'${uid(601)}','filing_create',tokens,${A.j(facts)});again:=case104_save(1,'${uid(601)}','filing_create',tokens,${A.j(facts)});
 IF first IS DISTINCT FROM again THEN RAISE EXCEPTION 'RETRY_RESULT_CHANGED';END IF;END $$;${view}`));assert.equal(r.filings.length,1);assert.equal(r.history.filter(e=>e.action==='case104_filing_create').length,1);
 deny(3,`${base}${perform(first)}${filing(702,[201,202])}`,/REQUEST_CONFLICT/);
 deny(3,`${base}${perform(first)}${call('filing_void',{id:uid(701),reason:'Reason'},{scope:0,entity:1},602)}`,/STALE/);
 sql("CREATE FUNCTION fail104audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.note LIKE 'case104_filing%' THEN RAISE EXCEPTION 'AUDIT_FAILED';END IF;RETURN NEW;END $$;CREATE TRIGGER fail104audit BEFORE INSERT ON case_audit_logs FOR EACH ROW EXECUTE FUNCTION fail104audit();");
 try{deny(3,`${base}${first}`,/AUDIT_FAILED/);assert.deepEqual(json(snapshot()),beforeRows);assert.equal(sql('SELECT count(*) FROM case_answer_filings'),'0');}finally{sql('DROP TRIGGER fail104audit ON case_audit_logs;DROP FUNCTION fail104audit();');}
});
test('joint failures on second defendant never leave first defendant completed or partially extended',()=>{
 const before=prepared();
 deny(3,`${before}${call('filing_create',{id:uid(701),parties:[uid(201),uid(202)],filed_on:'2026-02-01'},{entity:0,deadlines:{[uid(999)]:{due:'2026-01-01'}}})}`,/STALE_DEADLINE/);
 deny(3,`${before}${call('extension',{id:uid(801),parties:[uid(201),uid(202)],confirmed:true,grants:[{party_id:uid(201),due:'2026-03-01'},{party_id:uid(202),due:'not-a-date'}]},{entity:0})}`,/INVALID_INPUT/);
 assert.deepEqual(json(snapshot()),beforeRows);assert.equal(sql('SELECT count(*) FROM case_extension_groups'),'0');
});
test('Core 098 handoff remains one Case-level Next Action / Current Actor, no new Task; Viewer/ineligible assignee denied',()=>{
 const r=JSON.parse(run(3,`${rep()}${perform(call('next',{next:{mode:'manual',title:'Prepare joint Defendant Answer',assignee_id:uid(3),due:'2026-10-20'},assignments:[{person_id:uid(3),team_role:'current_actor'}]},{},601))}SELECT case098_read(1)`));assert.equal(r.core.next_mode,'manual');assert.equal(r.team[0].team_role,'current_actor');
 deny(3,`${rep()}${call('next',{next:{mode:'manual',title:'Test',assignee_id:uid(6)}})}`,/PERSON_INELIGIBLE/);
 assert.deepEqual(json(snapshot()),beforeRows);
});
test('service facts reuse 102/103 tables and guards; no default-motion semantics or fabricated dates',()=>{
 const r=JSON.parse(run(3,`${rep([201])}${perform(call('service',{party_id:uid(201),result:'failed',failure_kind:'other',failure_reason:'Unknown source facts'}))}${perform(call('service',{party_id:uid(201),result:'served',method:'normal',attempted_on:'2026-01-01',confirm_lawful:true},{},602))}${view}`));
 assert.equal(r.represented[0].attempts.length,2);assert.equal(r.represented[0].attempts[0].method,null);assert.ok(r.represented[0].control.lawful_attempt_id);assert.equal(r.represented[0].deadline,null);
 for(const result of ['pending','served'])deny(3,`${rep([201])}${call('service',{party_id:uid(201),result})}`,/INVALID_INPUT/);
 deny(3,`${rep([201])}${call('branch',{confirmed:true})}`,/INVALID_INPUT/);
});
test('Plaintiff 101–103 runtime remains unchanged, and immutable template/history protections survive',()=>{
 const base=`DO $$BEGIN PERFORM case101_save(1,'${uid(401)}',0,'${uid(801)}','start','{"stage":"service","filing_method":"paper","start_kind":"cut_in","acknowledged":true}');PERFORM case102_save(1,'${uid(201)}',0,'${uid(802)}','attempt','{"result":"served","method":"normal","attempted_on":"2026-01-01","confirm_lawful":true}');PERFORM case102_save(1,'${uid(201)}',1,'${uid(803)}','deadline','{"kind":"answer","due":"2026-02-01","confirmed":true}');END $$;`;
 const r=JSON.parse(run(3,`${base}SELECT case102_read(1)`));assert.equal(r.flow.current_stage,'service');assert.equal(r.defendants[0].answer_deadline.status,'Active');
 deny(3,`${base}${rep([201])}`,/CONTEXT_CONFLICT/);
 for(const statement of ["UPDATE case_flow_stages SET title_en='Wrong'","DELETE FROM case_flow_versions","INSERT INTO case_flow_versions VALUES('x','x',1,'civil','ordinary','defendant','x','x')","TRUNCATE case_flow_transitions"]){assert.match(cmd('psql',args(),statement).stderr,/IMMUTABLE/);}
});
test('verifier accepts only approved binding; unbound/other candidate and object drift fail closed',()=>{
 const binding={candidate_sha256:A.hash(A.read(A.candidate)),accepted_contract_sha256:A.acceptedContractSha};
 const bound=A.gate(true).replaceAll(A.j(JSON.parse(A.read(A.reviewedPath))),A.j(binding));
 const unbound=bound.replaceAll(A.j(binding),A.j({candidate_sha256:null,accepted_contract_sha256:null}));
 const wrong=bound.replaceAll(A.j(binding),A.j({...binding,candidate_sha256:'0'.repeat(64)}));
 assert.deepEqual(json(unbound).failed_checks,['reviewed_contract_bound']);assert.deepEqual(json(wrong).failed_checks,['reviewed_contract_bound']);assert.equal(json(A.gate(true)).gate_pass,true);
 assert.equal(JSON.parse(sql(`BEGIN;UPDATE cases SET title=title;${bound}ROLLBACK;`)).gate_pass,true);
 for(const statement of ['GRANT TRUNCATE ON case_answer_filings TO authenticated','ALTER TABLE case_counterclaims DISABLE ROW LEVEL SECURITY','ALTER FUNCTION case104_save(bigint,uuid,text,jsonb,jsonb) SECURITY INVOKER'])assert.equal(JSON.parse(sql('BEGIN;'+statement+';'+bound+'ROLLBACK;')).gate_pass,false);
});
test('two concurrent transactions with the same joint-filing request commit one receipt, one filing, two completions',async()=>{
 sql(act(3,prepared([201,202])).replace('ROLLBACK;','COMMIT;'));
 const frozen=json(`SELECT ${versions({entity:0,scope:4})}`);
 const fixed=filing(701,[201,202]).replace(versions({entity:0}),A.j(frozen));
 const execute=input=>new Promise(resolve=>{const child=spawn(path.join(bin,'psql'),args(),{env:{PATH:process.env.PATH,LC_ALL:'C',LANG:'C'}});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('exit',code=>resolve({code,out:out.trim(),err}));child.stdin.end(input);});
 const results=await Promise.all([execute(act(3,fixed).replace('ROLLBACK;','COMMIT;')),execute(act(3,fixed).replace('ROLLBACK;','COMMIT;'))]);
 for(const r of results)assert.equal(r.code,0,r.err);assert.deepEqual(JSON.parse(results[0].out),JSON.parse(results[1].out));
 assert.equal(sql("SELECT count(*) FROM case_service_events WHERE action='case104_filing_create'"),'1');assert.equal(sql('SELECT count(*) FROM case_answer_filings'),'1');
 assert.equal(sql("SELECT count(*) FROM case_deadlines WHERE id IN(SELECT answer_deadline_id FROM case_service_controls) AND status='Done'"),'2');
});
test('concurrent Counterclaim create versus dependent Filing void serializes and cannot produce an active orphan',async()=>{
 const frozen=json(`SELECT ${versions({entity:1})}`);
 const statements=[call('counterclaim_create',cc(),{entity:1},900),call('filing_void',{id:uid(701),reason:'Incorrect filing'},{entity:1},901)].map(s=>s.replace(versions({entity:1}),A.j(frozen)));
 const execute=input=>new Promise(resolve=>{const child=spawn(path.join(bin,'psql'),args(),{env:{PATH:process.env.PATH,LC_ALL:'C',LANG:'C'}});let err='';child.stderr.on('data',d=>err+=d);child.stdout.resume();child.on('exit',code=>resolve({code,err}));child.stdin.end(input);});
 const results=await Promise.all(statements.map(s=>execute(act(3,s).replace('ROLLBACK;','COMMIT;'))));
 assert.equal(results.filter(r=>r.code===0).length,1,JSON.stringify(results));assert.match(results.find(r=>r.code!==0).err,/CASE104_STALE/);
 assert.equal(sql("SELECT count(*) FROM case_counterclaims c JOIN case_answer_filings f ON f.id=c.filing_id WHERE c.lifecycle='active' AND f.lifecycle<>'active'"),'0');
 const current=JSON.parse(run(3,view));assert.equal(current.history.length,6);assert.equal(current.flow.current_stage,'D-CIV-02');
});
