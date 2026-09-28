/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable PostgreSQL only. No environment credentials, network, or Production SQL.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {spawnSync,spawn}=require('node:child_process');
const A=require('./non-litigation-artifacts.cjs'),B=require('./non-litigation-workflow-artifacts.cjs');
const bin='/Applications/Postgres.app/Contents/Versions/18/bin';let dir,started=false,baseline,localCandidate,diagnosticEvidence;
const testLocale=process.env.ADVISORY077_TEST_LOCALE||'en_US.UTF-8';
assert.ok(['C','en_US.UTF-8'].includes(testLocale),'Only explicit disposable test locales are allowed');
const obsoleteCandidateSha='5d2c035cc046b82d6029352435994643bb9525d042164fb293ef047adcb953c7';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const q=A.quote;
function run(name,args,input,fail=false){const r=spawnSync(bin+'/'+name,args,{input,encoding:'utf8',env:{PATH:process.env.PATH,LC_ALL:'C',LANG:'C'},maxBuffer:32e6});if(!fail)assert.equal(r.status,0,r.stderr||r.error?.message);return fail?r:r.stdout.trim();}
function args(){return ['-X','-qAt','-v','ON_ERROR_STOP=1','-h',dir,'-p','58477','-U','postgres','-d','postgres'];}
function sql(s,fail=false){return run('psql',args(),s,fail);}
function auth(n=1){return `set role authenticated;select set_config('request.jwt.claim.sub',${q(id(n))},false);select set_config('request.jwt.claims',${q(JSON.stringify({sub:id(n),email:`person${n}@example.invalid`,role:'authenticated'}))},false);`;}
function as(s,n=1){return JSON.parse(sql(auth(n)+s).split('\n').at(-1));}
function version(m){return +sql(`select coalesce((select version from advisory_matter_control where matter_id='${m}'),0)`);}
function call(m,action,payload={},v=version(m),request=crypto.randomUUID()){return `select advisory_control_write(${m?q(m):'null'},${q(action)},${q(JSON.stringify(payload))},${q(request)},${v});`;}
function write(m,action,payload={},n=1){return as(call(m,action,payload),n);}
function reject(s,re,n=1){const r=sql(auth(n)+s,true);assert.notEqual(r.status,0);assert.match(r.stderr,re);}
function create(){return as(call(null,'create',{client_id:id(90),title:'SYNTHETIC WORKFLOW',lead_id:id(2)},0)).matter_id;}
function checklist(m,n=1){return as(`select advisory_workflow_checks('${m}')`,n);}
function current(m){return sql(`select id from advisory_stage_visits where matter_id='${m}' and kind='visit' and exited_at is null`);}
function stageId(m,key){return sql(`select id from advisory_matter_stages where matter_id='${m}' and stage_key='${key}'`);}
function advance(m,p={}){return write(m,'stage_complete',{visit_id:current(m),...p});}
function session(query,n=1){return new Promise(resolve=>{const p=spawn(bin+'/psql',args(),{env:{PATH:process.env.PATH,LC_ALL:'C'}});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('close',code=>resolve({code,out,err}));p.stdin.end(auth(n)+query);});}
before(()=>{
 dir=fs.mkdtempSync('/private/tmp/vp8c1-workflow-');fs.chmodSync(dir,0o700);
 run('initdb',['-D',dir+'/data','-U','postgres','-A','trust','--encoding=UTF8','--locale='+testLocale]);
 run('pg_ctl',['-D',dir+'/data','-l',dir+'/server.log','-o',`-F -k ${dir} -p 58477 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
 // Reuse the existing tested synthetic 076 fixture verbatim, not Production rows.
 const source=fs.readFileSync(__dirname+'/non-litigation-postgres.test.cjs','utf8');
 const fixtureSource=source.slice(source.indexOf('function fixture(){'),source.indexOf('\nbefore(()=>'));
 assert.ok(fixtureSource.endsWith('return s;}'));
 sql(vm.runInNewContext('('+fixtureSource+')()',{A,id}));
 const old=JSON.parse(sql(A.snapshotSql()+';'));sql(A.migration(old));
 baseline=JSON.parse(sql(B.snapshot()));
 fs.writeFileSync(dir+'/before.json',JSON.stringify(baseline,null,2));
 const diagnostic=fs.readFileSync(A.root+'/scripts/sql/diagnose_non_litigation_076_contract_for_077.sql','utf8');
 diagnosticEvidence=JSON.parse(sql('begin read only;'+diagnostic+'rollback;'));
 fs.writeFileSync(dir+'/076-contract-diagnostic.json',JSON.stringify(diagnosticEvidence,null,2));
 assert.equal(diagnosticEvidence.conclusion,testLocale==='C'?'exact_contract_match':'fingerprint_ordering_only');
 assert.equal(diagnosticEvidence.c_order_fingerprint_matches,true);
 assert.equal(diagnosticEvidence.embedded_evidence_matches_077_guard,true);
 assert.deepEqual(diagnosticEvidence.differences.map(d=>[d.object_name,d.component,d.category]),testLocale==='C'?[]:[
  ['advisory_matter_activities','indexes','fingerprint_ordering_only'],
  ['advisory_matter_team','indexes','fingerprint_ordering_only'],
  ['advisory_stage_visits','indexes','fingerprint_ordering_only'],
  ['advisory_work_state_events','indexes','fingerprint_ordering_only'],
 ]);
 // Catalog-only diagnostic still works when a protected table is absent, and
 // distinguishes real local changes from order-only differences. Roll back each.
 for(const [mutation,category]of [
  ['grant execute on function advisory076_task_guard() to anon;','permissions_grants_mismatch'],
  ['alter function advisory076_task_guard() security invoker;','function_rpc_mismatch'],
  ['alter table advisory_deliverables rename to synthetic_missing_deliverables;','object_missing_or_signature_changed'],
  ['create function advisory076_synthetic_extra() returns int language sql as $$select 1$$;','object_extra_or_signature_changed'],
  ['alter policy advisory076_read on advisory_matter_team using (false);','policy_mismatch'],
  ['alter table advisory_issue_tasks disable trigger advisory076_task_guard;','trigger_mismatch'],
  ['alter index advisory076_one_lead rename to synthetic_extra_index;','object_extra'],
 ]){
  const result=JSON.parse(sql('begin;'+mutation+diagnostic+'rollback;'));
  assert.equal(result.c_order_fingerprint_matches,false,mutation);
  assert.ok(result.differences.some(d=>d.category===category),mutation);
 }
 assert.deepEqual(JSON.parse(sql(B.snapshot())),baseline,'Diagnostic and rolled-back test mutations preserve all fixture state');

 // Production expectations remain the accepted evidence. This synthetic database
 // intentionally has reconstructed ACL/catalog metadata and private canary FKs.
 // Bind ONLY in-memory test copies to its actual pre-state, as the 076 suite does.
 assert.equal(A.hash(A.pgJson(baseline.applied)),B.baseline.applied,'Accepted 076 guard passes without any synthetic rebase in both database locales');
 const pins={catalog:A.hash(A.pgJson(baseline.old.catalog)),functions:A.hash(A.pgJson(baseline.old.functions))};
 function local(s){for(const k of Object.keys(pins))s=s.replaceAll(B.baseline[k],pins[k]);return s;}
 const original=sql(fs.readFileSync(B.candidate,'utf8'),true);assert.notEqual(original.status,0);assert.match(original.stderr,/BASELINE_MISMATCH: legacy_catalog/,'Unmodified candidate passes exact accepted 076 guard, then rejects unrelated synthetic legacy catalog');
 const pre=JSON.parse(sql('begin read only;'+local(fs.readFileSync(B.preflight,'utf8'))+'rollback;'));
 assert.equal(pre.gate_pass,true,JSON.stringify(pre.failed_checks));
 localCandidate=local(fs.readFileSync(B.candidate,'utf8'));
 sql(localCandidate.replace(/COMMIT;\s*$/,'ROLLBACK;'));
 assert.deepEqual(JSON.parse(sql(B.snapshot())),baseline,'Local rollback rehearsal restores exact fresh snapshot');
 sql(localCandidate);
 fs.writeFileSync(dir+'/applied-contract.json',sql(B.contractSql()));
});
after(()=>{if(started)run('pg_ctl',['-D',dir+'/data','-m','fast','-w','stop']);console.log('077 disposable local evidence:',dir,'locale:',testLocale);});
test('accepted 076 diagnostic isolates locale ordering differences without relaxing any definition/security check',()=>{
 assert.equal(diagnosticEvidence.expected_sha256,'86d20bac7582db6955e4b7f644221ee910e7ab41ab6457bbf48cefa1dacd3471');
 assert.equal(diagnosticEvidence.objects.length,23);
 assert.equal(diagnosticEvidence.business_rows_inspected,false);
 const current=fs.readFileSync(A.root+'/scripts/sql/verify_non_litigation_076_attempt_state.sql','utf8');
 const start=current.indexOf('applied AS MATERIALIZED (')+'applied AS MATERIALIZED ('.length;
 const end=current.indexOf(',\nnew_table_names');
 assert.equal(B.appliedSql,current.slice(start,end-1),'Use the exact C-order projection already accepted by the Human 076 verifier');
 assert.equal(sql('select datcollate from pg_database where datname=current_database()'),testLocale);
 assert.equal(diagnosticEvidence.c_order_fingerprint_matches,true);
});
test('077 candidate changes only two guard projections; all gates share accepted ordering and candidate identity',()=>{
 const candidate=fs.readFileSync(B.candidate,'utf8');
 assert.notEqual(A.hash(candidate),obsoleteCandidateSha,'Old candidate identity is obsolete');
 assert.equal(candidate.split(B.appliedSql).length-1,2,'Both before/after guard projections are explicit C order');
 assert.equal(A.hash(candidate.replaceAll(B.appliedSql,B.rawAppliedSql)),obsoleteCandidateSha,'Reversing only ordering restores the entire old candidate byte-for-byte, including business SQL/security/preservation');
 const preflight=fs.readFileSync(B.preflight,'utf8'),verifier=fs.readFileSync(B.verifier,'utf8');
 assert.ok(preflight.includes(B.snapshot()));assert.ok(verifier.includes(B.snapshot()));assert.ok(verifier.includes(B.contractSql()));
 assert.ok(!candidate.includes(B.rawAppliedSql));assert.ok(!preflight.includes(B.rawAppliedSql));assert.ok(!verifier.includes(B.rawAppliedSql));
 const artifact=require('./fixtures/non-litigation-077-applied-functions.json');
 assert.equal(artifact.candidate_sha256,A.hash(candidate));
 for(const gate of [preflight,verifier])assert.ok(gate.includes(A.hash(candidate)));
 assert.equal(B.baseline.applied,'86d20bac7582db6955e4b7f644221ee910e7ab41ab6457bbf48cefa1dacd3471');
});
test('candidate is fail-closed, applied 076 bytes unchanged, all rows/security preserved without backfill',()=>{
 const after=JSON.parse(sql(B.snapshot()));
 assert.deepEqual(after.old,baseline.old);assert.deepEqual(after.rows,baseline.rows);
 assert.deepEqual(after.applied.tables,baseline.applied.tables);assert.deepEqual(after.applied.deltas,baseline.applied.deltas);
 for(const [name,value]of Object.entries(baseline.applied.functions)){
  const actual=after.applied.functions[name];if(B.changed.includes(name)){const {definition:beforeBody,...beforeSecurity}=value;const {definition:afterBody,...afterSecurity}=actual;assert.notEqual(afterBody,beforeBody);assert.deepEqual(afterSecurity,beforeSecurity);}else assert.deepEqual(actual,value);
 }
 assert.equal(A.hash(fs.readFileSync(A.candidate)),'c67ac32ef0572964fcacc31bfc54dbe73544b76a4719436b6afa4a4c67a61afe');
 const r=sql(fs.readFileSync(B.candidate,'utf8'),true);assert.notEqual(r.status,0);assert.match(r.stderr,/BASELINE_MISMATCH/);
 assert.deepEqual(JSON.parse(sql(B.rowSql)),baseline.rows);
});
test('static verifier binds only the exact Human-reviewed Production baseline and rejects local fixture rows',()=>{
 const pins=JSON.parse(fs.readFileSync(B.verifierPins,'utf8'));
 assert.deepEqual(pins,{
  historical_rows_sha256:'83ff1de3a3f242c01fa72018065f107834371424441933891ef62d49d45be046',
  legacy_rows_sha256:'a8f2a479c612201f495bdbea8132656fc50d23a602e0a5f08ae80f2884343295',
  finance_references_sha256:'2a0f0f1ea78103ccfe15f827b10e4163ce9ce14d9685cc6aa8a76cb0cb2c28b8',
 });
 assert.equal(A.hash(fs.readFileSync(B.candidate)),'b612e944cfd9334e3366bc1c74b116fd2e69b731aaee2018e9385bb226c31b0b');
 assert.equal(B.baseline.applied,'86d20bac7582db6955e4b7f644221ee910e7ab41ab6457bbf48cefa1dacd3471');
 const verifier=fs.readFileSync(B.verifier,'utf8');assert.equal(verifier,B.verify(pins));
 const result=JSON.parse(sql('begin read only;'+verifier+'rollback;'));
 assert.equal(result.checks.approved_row_baseline_bound,true);
 assert.equal(result.gate_pass,false,'Binding never substitutes synthetic fixture evidence for Production');
 for(const key of ['historical_rows_unchanged','legacy_rows_unchanged','finance_references_unchanged'])assert.ok(result.failed_checks.includes(key),key);
 assert.ok(fs.readFileSync(B.preflight,'utf8').includes("'broader_finance_differences_accepted',false"));
 assert.deepEqual(JSON.parse(sql(B.rowSql)),baseline.rows);
});
test('SELECT-only verifier fails unbound, passes exact approved local rows, and detects row/security tampering',()=>{
 const artifact=require('./fixtures/non-litigation-077-applied-functions.json');
 const accepted=require('./fixtures/non-litigation-076-applied-contract.json').contract;
 const observed=JSON.parse(sql(B.contractSql()));
 for(const [n,e] of Object.entries(artifact.functions))assert.equal(observed.functions[n].definition,e.definition,'Tested function body '+n);
 const expected={...accepted,functions:{...accepted.functions,...artifact.functions}};
 const localPost={...baseline.applied,functions:{...baseline.applied.functions}};
 for(const n of B.changed)localPost.functions[n]={...baseline.applied.functions[n],definition:artifact.functions[n].definition};
 localPost.functions['advisory_workflow_checks(uuid)']=artifact.functions['advisory_workflow_checks(uuid)'];
 assert.deepEqual(observed,localPost);
 const pins={historical_rows_sha256:A.hash(A.pgJson(baseline.rows)),legacy_rows_sha256:A.hash(A.pgJson(baseline.old.rows)),finance_references_sha256:A.hash(A.pgJson(baseline.old.finance))};
 function localVerifier(p){return B.verify(p).replaceAll(B.baseline.catalog,A.hash(A.pgJson(baseline.old.catalog))).replaceAll(B.baseline.functions,A.hash(A.pgJson(baseline.old.functions))).replaceAll(A.hash(A.pgJson(expected)),A.hash(A.pgJson(localPost)));}
 const unbound=JSON.parse(sql('begin read only;'+localVerifier({})+'rollback;'));assert.equal(unbound.gate_pass,false);assert.ok(unbound.failed_checks.includes('approved_row_baseline_bound'));
 const good=JSON.parse(sql('begin read only;'+localVerifier(pins)+'rollback;'));assert.equal(good.gate_pass,true,JSON.stringify(good));
 const row=JSON.parse(sql(`begin;update advisory_matters set title='SYNTHETIC TAMPER' where id='${id(101)}';`+localVerifier(pins)+'rollback;'));assert.equal(row.historical_rows_unchanged,false);
 const sec=JSON.parse(sql('begin;grant execute on function advisory_workflow_checks(uuid) to anon;'+localVerifier(pins)+'rollback;'));assert.equal(sec.applied_state_exact,false);
 const financeTable=Object.keys(A.approved.finance_matter_references)[0];
 assert.match(financeTable,/^finance_[a-z_]+$/);
 for(const [mutation,failedCheck]of [
  [`delete from advisory_time_logs where id='${id(402)}';`,'legacy_rows_unchanged'],
  ["alter table advisory_matter_control add column synthetic_unexpected_column text;",'applied_state_exact'],
  ["alter policy advisory076_read on advisory_matter_team using (false);",'applied_state_exact'],
  [`update ${financeTable} set amount=amount+1;`,'finance_references_unchanged'],
  [`update ${financeTable} set advisory_matter_id='${id(102)}';`,'finance_references_unchanged'],
  [`update ${financeTable} set advisory_matter_id=null;`,'finance_references_unchanged'],
  [`delete from ${financeTable};`,'finance_references_unchanged'],
  // Deliberately bypass the local synthetic FK ONLY inside this rolled-back test
  // transaction, proving the existing orphan count participates in the hash.
  [`alter table ${financeTable} disable trigger all;update ${financeTable} set advisory_matter_id='${id(999)}';`,'finance_references_unchanged'],
 ]){
  const bad=JSON.parse(sql('begin;'+mutation+localVerifier(pins)+'rollback;'));
  assert.equal(bad.gate_pass,false,mutation);assert.ok(bad.failed_checks.includes(failedCheck),mutation);
 }
 assert.deepEqual(JSON.parse(sql(B.rowSql)),baseline.rows);
 assert.deepEqual(JSON.parse(sql(A.snapshotSql(true))).finance,baseline.old.finance);
 assert.deepEqual(JSON.parse(sql(B.contractSql())),observed,'All negative schema/security tests roll back');
});
test('workflow check ACL and active-role permissions match existing operational access',()=>{
 reject('select advisory_workflow_checks(\''+id(101)+'\')',/FORBIDDEN/,5);
 reject('select advisory_workflow_checks(\''+id(101)+'\')',/FORBIDDEN/,8);
 reject('select advisory_workflow_checks(\''+id(101)+'\')',/FORBIDDEN/,4);
 assert.equal(checklist(id(101),3).legacy_without_plan,true);
 assert.equal(sql("select has_function_privilege('anon','advisory_workflow_checks(uuid)','execute') or has_function_privilege('service_role','advisory_workflow_checks(uuid)','execute')"),'f');
 const m=create();write(m,'stage',{stage_key:'intake'});reject(call(m,'stage_complete',{visit_id:current(m)}),/FORBIDDEN/,3);
});
test('Stage advance is atomic, actual duration preserved, idempotent, activity once, no lifecycle/Work State conflation',()=>{
 const m=create();write(m,'stage',{stage_key:'intake'});const visit=current(m);
 const enter=sql(`select entered_at::text from advisory_stage_visits where id='${visit}'`);
 const request=call(m,'stage_complete',{visit_id:visit});const r=as(request);assert.deepEqual(as(request),r);
 assert.equal(r.next_stage_key,'information');assert.equal(r.ready_for_closing,false);
 assert.equal(sql(`select entered_at::text from advisory_stage_visits where id='${visit}'`),enter);
 assert.equal(sql(`select exit_reason from advisory_stage_visits where id='${visit}'`),'completed');
 assert.equal(sql(`select v.exited_at=n.entered_at from advisory_stage_visits v join advisory_stage_visits n on n.matter_id=v.matter_id and n.exited_at is null where v.id='${visit}'`),'t');
 assert.equal(sql(`select count(*) from advisory_matter_activities where matter_id='${m}' and kind='stage_complete'`),'1');
 const data=as(`select advisory_control_read('${m}')`).items[0];assert.equal(data.status,'active');assert.equal(data.work_state,'working');assert.equal(data.stage_key,'information');assert.equal(data.stage_days,0);
 reject(call(m,'stage_complete',{visit_id:visit}),/CURRENT_STAGE_CHANGED/);
});
test('incomplete Stage Tasks block; no override or manual-stage bypass',()=>{
 const m=create();write(m,'stage',{stage_key:'intake'});const stage=stageId(m,'intake');
 const t=write(m,'task_save',{title:'Blocked',stage_id:stage}).item_id;
 reject(call(m,'stage_complete',{visit_id:current(m),override:true,reason:'Not allowed'}),/STAGE_TASKS_OPEN/);
 reject(call(m,'stage',{stage_key:'information'}),/STAGE_TASKS_OPEN/);
 // Existing completion semantics remain the only way to complete work.
 write(m,'task_complete',{id:t},3);advance(m);
 reject(call(m,'task_save',{title:'Late task into completed Stage',stage_id:stage}),/STAGE_COMPLETED/);
});
test('Next Action Task derives owner/due, reassignment follows Task, completion clears it; standalone needs resolution',()=>{
 const m=create();write(m,'stage',{stage_key:'intake'});
 const t=write(m,'task_save',{title:'Actual next action',assignee_user_id:id(3),due_date:'2026-10-05',stage_id:stageId(m,'intake')}).item_id;
 write(m,'next_action',{task_id:t});let d=as(`select advisory_control_read('${m}')`).items[0];assert.equal(d.next_owner_id,id(3));assert.equal(d.next_due,'2026-10-05');
 write(m,'task_save',{id:t,title:'Actual next action',assignee_user_id:id(2),due_date:'2026-10-06',stage_id:stageId(m,'intake')});
 d=as(`select advisory_control_read('${m}')`).items[0];assert.equal(d.next_owner_id,id(2));assert.equal(d.next_due,'2026-10-06');
 write(m,'task_complete',{id:t});assert.equal(as(`select advisory_control_read('${m}')`).items[0].next_action,null);
 write(m,'next_action',{title:'Standalone known action',owner_id:id(2)});
 reject(call(m,'stage_complete',{visit_id:current(m)}),/NEXT_ACTION_RESOLUTION_REQUIRED/);
 advance(m,{resolve_next_action:true});d=as(`select advisory_control_read('${m}')`).items[0];assert.equal(d.next_action,null);assert.equal(d.next_owner_id,null);
});
test('next-stage linked Task is retained; unscoped Task needs explicit clearing and never becomes completed implicitly',()=>{
 const m=create();write(m,'stage',{stage_key:'intake'});
 const t=write(m,'task_save',{title:'Next Stage work',stage_id:stageId(m,'information'),assignee_user_id:id(3)}).item_id;
 write(m,'next_action',{task_id:t});advance(m);assert.equal(as(`select advisory_control_read('${m}')`).items[0].next_task_id,t);
 write(m,'task_complete',{id:t});const unscoped=write(m,'task_save',{title:'Matter task'}).item_id;write(m,'next_action',{task_id:unscoped});
 reject(call(m,'stage_complete',{visit_id:current(m)}),/NEXT_ACTION_RESOLUTION_REQUIRED/);
 advance(m,{resolve_next_action:true});assert.equal(sql(`select status from advisory_issue_tasks where id='${unscoped}'`),'pending');
});
test('Team add/edit/remove preserves canonical multi-role key and exactly one Lead; no identity guess or Task membership rule',()=>{
 const m=create();write(m,'team',{user_id:id(3),role:'assistant'});write(m,'team',{user_id:id(3),role:'assistant'});
 assert.equal(sql(`select count(*) from advisory_matter_team where matter_id='${m}' and user_id='${id(3)}'`),'1');
 write(m,'team_edit',{user_id:id(3),previous_role:'assistant',role:'qa'});
 assert.equal(sql(`select team_role from advisory_matter_team where matter_id='${m}' and user_id='${id(3)}'`),'qa');
 write(m,'team',{user_id:id(3),role:'co_work'});reject(call(m,'team_edit',{user_id:id(3),previous_role:'qa',role:'co_work'}),/TEAM_ROLE_EXISTS/);
 reject(call(m,'team_edit',{user_id:id(2),previous_role:'qa',role:'assistant'}),/MEMBER_NOT_FOUND/);
 reject(call(m,'team',{user_id:id(6),role:'assistant'}),/NOT_ASSIGNABLE/);
 write(m,'team',{user_id:id(3),role:'qa',remove:true});assert.equal(sql(`select count(*) from advisory_matter_team where matter_id='${m}' and team_role='lead'`),'1');
 write(m,'task_save',{title:'Assignable non-member',assignee_user_id:id(1)});
 assert.equal(sql(`select responsible_lawyer from advisory_matters where id='${id(101)}'`),'Unmatched legacy name');
});
test('Matter-scoped Time uses same ledger, explicit current Stage, own-Time RLS and honest legacy null Stage',()=>{
 const m=create();write(m,'stage',{stage_key:'intake'});const stage=stageId(m,'intake');
 sql(auth(2)+`insert into advisory_time_logs(advisory_matter_id,client_id,work_date,minutes,work_type,note,staff_name,created_by_user_id,stage_id) values('${m}','${id(90)}','2026-09-28',45,'Advisory','Actual work','Person 2','${id(2)}','${stage}')`);
 assert.equal(as(`select advisory_control_read('${m}')`,2).time.minutes,45);assert.equal(as(`select advisory_control_read('${m}')`,3).time.minutes,0);
 assert.equal(sql(`select count(*) from advisory_time_logs where id in ('${id(401)}','${id(402)}') and stage_id is null`),'2');
 reject(`insert into advisory_time_logs(advisory_matter_id,minutes,created_by_user_id) values('${m}',10,'${id(3)}')`,/row-level security/,2);
});
test('last operational Stage ends without closing lifecycle; terminal marker starts no invented visit; checklist blocks pending work',()=>{
 const m=create();write(m,'stage',{stage_key:'intake'});
 for(let i=0;i<5;i++){const r=advance(m);assert.equal(r.ready_for_closing,i===4);}
 assert.equal(current(m),'');assert.equal(sql(`select status from advisory_matters where id='${m}'`),'active');assert.equal(checklist(m).ready_to_close,true);
 const d=write(m,'deliverable',{title:'Deliverable',status:'ready'}).item_id;
 assert.equal(checklist(m).pending_deliverables,1);reject(call(m,'close',{outcome:'completed',summary:'Done'}),/CLOSING_BLOCKED/);
 write(m,'deliverable',{id:d,title:'Deliverable',status:'delivered'});
 write(m,'next_action',{title:'Still current'});reject(call(m,'close',{outcome:'completed',summary:'Done'}),/CLOSING_BLOCKED/);
 write(m,'next_action',{});write(m,'close',{outcome:'completed',summary:'Client accepted'});
 assert.equal(sql(`select status from advisory_matters where id='${m}'`),'completed');
 assert.equal(sql(`select count(*) from advisory_stage_visits v join advisory_matter_stages s on s.id=v.stage_id where s.matter_id='${m}' and s.stage_key='close'`),'0');
 reject(`insert into advisory_issue_tasks(advisory_matter_id,title,status) values('${m}','Cannot write after close','pending')`,/ADVISORY_CLOSED/);
 write(m,'reopen',{reason:'New client instruction'});assert.equal(current(m),'');assert.equal(as(`select advisory_control_read('${m}')`).items[0].next_action,null);
 assert.equal(sql(`select count(*) from advisory_matter_activities where matter_id='${m}' and kind='reopen' and detail#>>'{previous_control,outcome_summary}'='Client accepted'`),'1');
});
test('controlled exceptional closure records unresolved work; legacy closed reopen never invents dates/stages',()=>{
 const m=create();const t=write(m,'task_save',{title:'Unfinished client cancelled'}).item_id;
 reject(call(m,'close',{outcome:'cancelled',summary:'Client stopped'}),/CLOSING_RESOLUTION_REQUIRED/);
 write(m,'close',{outcome:'cancelled',summary:'Client stopped',unresolved_reason:'Work discontinued by client instruction'});
 assert.equal(sql(`select status from advisory_issue_tasks where id='${t}'`),'pending');
 assert.equal(sql(`select detail#>>'{closing_checks,open_tasks}' from advisory_matter_activities where matter_id='${m}' and kind='close'`),'1');
 sql(`update advisory_matters set status='completed' where id='${id(102)}'`);
 write(id(102),'reopen',{reason:'Explicit reopening of legacy completed matter'});
 assert.equal(current(id(102)),'');assert.equal(sql(`select count(*) from advisory_matter_stages where matter_id='${id(102)}'`),'0');
 assert.equal(sql(`select detail->>'previous_lifecycle' from advisory_matter_activities where matter_id='${id(102)}' and kind='reopen'`),'completed');
});
test('independent-session duplicate advance/retry: one committed transition, no duplicate activity or current visit',async()=>{
 const m=create();write(m,'stage',{stage_key:'intake'});const v=version(m),visit=current(m);
 const r=await Promise.all([session(call(m,'stage_complete',{visit_id:visit},v)),session(call(m,'stage_complete',{visit_id:visit},v))]);
 assert.equal(r.filter(x=>x.code===0).length,1);assert.match(r.find(x=>x.code!==0).err,/CHANGED/);
 assert.equal(sql(`select count(*) from advisory_stage_visits where matter_id='${m}' and kind='visit' and exited_at is null`),'1');
 const retry=call(m,'stage_complete',{visit_id:current(m)});const same=await Promise.all([session(retry),session(retry)]);assert.equal(same[0].code,0);assert.equal(same[1].code,0);assert.equal(same[0].out,same[1].out);
 assert.equal(sql(`select count(*) from advisory_matter_activities where matter_id='${m}' and kind='stage_complete'`),'2');
});
test('all operational actions preserve Finance, original names/legacy Time and no waiting conversion',()=>{
 const currentState=JSON.parse(sql(A.snapshotSql(true)));
 assert.deepEqual(currentState.finance,baseline.old.finance);
 assert.equal(sql(`select staff_name from advisory_time_logs where id='${id(401)}'`),'Original time name');
 assert.equal(sql(`select responsible_lawyer from advisory_matters where id='${id(101)}'`),'Unmatched legacy name');
 const m=create();sql(`update advisory_matters set status='waiting' where id='${m}'`);write(m,'work_state',{state:'waiting_external'});
 const d=as(`select advisory_control_read('${m}')`).items[0];assert.equal(d.status,'waiting');assert.equal(d.work_state,'waiting_external');
});
test('Stage completion vs direct Task insert is serialized in both orders by the Matter row lock',async()=>{
 for(const first of ['advance','task']){
  const m=create();write(m,'stage',{stage_key:'intake'});const stage=stageId(m,'intake'),visit=current(m),v=version(m);
  const advanceSql=call(m,'stage_complete',{visit_id:visit},v);
  const taskSql=`insert into advisory_issue_tasks(advisory_matter_id,title,status,stage_id) values('${m}','Concurrent task','pending','${stage}');`;
  // Hold the Matter lock and observe it from pg_locks before starting contender.
  const holder=spawn(bin+'/psql',args(),{env:{PATH:process.env.PATH,LC_ALL:'C'}});let out='',err='';
  holder.stdout.on('data',b=>out+=b);holder.stderr.on('data',b=>err+=b);
  const done=new Promise(resolve=>holder.on('close',code=>resolve({code,out,err})));
  holder.stdin.write(auth(1)+`begin;select * from advisory_matters where id='${m}' for update;select pg_advisory_xact_lock(770077,${first==='advance'?1:2});\n`);
  for(let n=0;n<100;n++){
   if(sql(`select exists(select 1 from pg_locks where locktype='advisory' and classid=770077 and objid=${first==='advance'?1:2} and granted)`)==='t')break;
   if(n===99)throw Error('Holder did not acquire lock');await new Promise(resolve=>setTimeout(resolve,10));
  }
  const competing=session(first==='advance'?taskSql:advanceSql);
  holder.stdin.end((first==='advance'?advanceSql:taskSql)+'commit;');
  const [one,two]=await Promise.all([done,competing]);assert.equal(one.code,0,one.err);assert.notEqual(two.code,0);
  assert.match(two.err,first==='advance'?/STAGE_COMPLETED/:/CHANGED|STAGE_TASKS_OPEN/);
  assert.equal(sql(`select count(*) from advisory_issue_tasks where advisory_matter_id='${m}' and stage_id='${stage}' and status='pending'`),first==='advance'?'0':'1');
 }
});
test('Closing vs Task insert cannot leave new pending work under a concurrently completed Matter',async()=>{
 const m=create();for(const key of ['intake','information','analysis','execution','delivery'])write(m,'stage_skip',{stage_key:key});
 const v=version(m), closeSql=call(m,'close',{outcome:'completed',summary:'Ready'},v);
 const r=await Promise.all([session(closeSql),session(`insert into advisory_issue_tasks(advisory_matter_id,title,status) values('${m}','Concurrent close task','pending')`)]);
 assert.equal(r.filter(x=>x.code===0).length,1,JSON.stringify(r));
 const state=checklist(m);assert.ok(state.closed?state.open_tasks===0:state.open_tasks===1);
});
test('fresh read-only preflight remains fail-closed after contract/security drift',()=>{
 const pre=JSON.parse(sql('begin read only;'+fs.readFileSync(B.preflight,'utf8')+'rollback;'));
 assert.equal(pre.gate_pass,false);assert.ok(pre.failed_checks.includes('candidate_not_applied'));
 const drift=sql('begin;alter function advisory076_allowed(text) security invoker;'+localCandidate.replace(/^--[\s\S]*?BEGIN;/,'').replace(/COMMIT;\s*$/,'')+'rollback;',true);
 assert.notEqual(drift.status,0);assert.match(drift.stderr,/BASELINE_MISMATCH/);
 assert.equal(sql("select prosecdef from pg_proc where oid='advisory076_allowed(text)'::regprocedure"),'t');
});
