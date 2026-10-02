/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable PostgreSQL only, private Unix socket; never reads .env or Production credentials.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{spawnSync,spawn}=require('node:child_process');
const F=require('./advisory-flexible-journey-artifacts.cjs'),{E,A,B,q}=F,C=E.C,D=E.D;
const bin='/Applications/Postgres.app/Contents/Versions/18/bin',id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');let dir,started=false,baseline,pins,legacy;
function run(name,args,input,fail=false){const r=spawnSync(bin+'/'+name,args,{input,encoding:'utf8',env:{PATH:process.env.PATH,LC_ALL:'C'},maxBuffer:64e6});if(!fail)assert.equal(r.status,0,r.stderr||r.error?.message);return fail?r:r.stdout.trim();}
function args(){return ['-X','-qAt','-v','ON_ERROR_STOP=1','-h',dir,'-p','58486','-U','postgres','-d','postgres'];}
function sql(s,fail=false){return run('psql',args(),s,fail);}
function auth(n=1){return `set role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',false);select set_config('request.jwt.claims',${q(JSON.stringify({sub:id(n),role:'authenticated'}))},false);`;}
function as(s,n=1){return JSON.parse(sql(auth(n)+s).split('\n').at(-1));}
function snapshot(){return JSON.parse(sql(F.oldSnapshot));}
function call(m,action,p,request=crypto.randomUUID(),version=m?+sql(`select version from advisory_matter_control where matter_id=${q(m)}`):0){return `select advisory_control_write(${m?q(m):'null'},${q(action)},${q(JSON.stringify(p))},${q(request)},${version});`;}
function write(m,a,p){return as(call(m,a,p));}
function payload(type='contract_business_documents',extra={}){return{client_id:id(90),title:'SYNTHETIC FJ1',lead_id:id(2),matter_type:type,...extra};}
function create(type,extra){return write(null,'create',payload(type,extra)).matter_id;}
function catalog(family='contract_business_documents'){return as(`select advisory_journey_catalog(${q(family)})`).variants;}
function manage(v,action,data,req=crypto.randomUUID()){return as(`select advisory_journey_manage(${v?q(v.id):'null'},${q(action)},${q(JSON.stringify(data))},${q(req)},${v?v.revision:'null'});`);}
function details(m){return as(`select advisory_control_read(${q(m)})`);}
function stableDetails(m){const d=typeof m==='string'?details(m):structuredClone(m);for(const s of d.stages)delete s.elapsed_seconds;return d;}
function current(m){return details(m).stages.find(s=>s.visits.some(v=>v.kind==='visit'&&!v.exited_at));}
function advance(m){return write(m,'stage_complete',{visit_id:current(m).visits.find(v=>!v.exited_at).id});}
function denied(s,code,n=1){const r=sql(auth(n)+s,true);assert.notEqual(r.status,0);assert.match(r.stderr,new RegExp(code));}
function session(s){return new Promise(resolve=>{const p=spawn(bin+'/psql',args(),{env:{PATH:process.env.PATH,LC_ALL:'C'}});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('close',code=>resolve({code,out,err}));p.stdin.end(auth()+s);});}
before(()=>{
 dir=fs.mkdtempSync('/private/tmp/vp-fj086-');fs.chmodSync(dir,0o700);run('initdb',['-D',dir+'/data','-U','postgres','-A','trust','--encoding=UTF8','--locale='+ (process.env.FJ086_LOCALE||'en_US.UTF-8')]);run('pg_ctl',['-D',dir+'/data','-l',dir+'/server.log','-o',`-F -k ${dir} -p 58486 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
 const s=fs.readFileSync(__dirname+'/non-litigation-postgres.test.cjs','utf8'),fixture=s.slice(s.indexOf('function fixture(){'),s.indexOf('\nbefore(()=>'));
 sql(vm.runInNewContext('('+fixture+')()',{A,id}));sql(A.migration(JSON.parse(sql(A.snapshotSql()))));
 const pre=JSON.parse(sql(B.snapshot()));let m=fs.readFileSync(B.candidate,'utf8');for(const k of ['catalog','functions'])m=m.replaceAll(B.baseline[k],F.jsonHash(pre.old[k]));sql(m);
 for(const file of [C.candidate,D.candidate,E.candidate])sql(fs.readFileSync(file,'utf8'));
 legacy=create('monthly_advisory',{template:'general'});baseline=snapshot();
 pins={rows_sha256:F.jsonHash(baseline.rows),catalog_sha256:F.jsonHash(baseline.catalog)};
 const preflight=JSON.parse(sql(F.preflightSql()));assert.equal(preflight.gate_pass,true,JSON.stringify(preflight));
 if(process.env.FJ086_CAPTURE==='1'){
  sql(F.core());fs.writeFileSync(F.footprintPath,JSON.stringify(JSON.parse(sql(F.footprint())),null,2)+'\n');fs.writeFileSync(__dirname+'/fixtures/advisory-086-seed.json',JSON.stringify(JSON.parse(sql(F.newRows())),null,2)+'\n');
 }else{
  sql(fs.readFileSync(F.candidate,'utf8').replace(/COMMIT;\s*$/,'ROLLBACK;'));assert.deepEqual(snapshot(),baseline);
  sql(fs.readFileSync(F.candidate,'utf8'));
 }
});
after(()=>{if(started)run('pg_ctl',['-D',dir+'/data','-m','fast','-w','stop']);console.log('086 disposable evidence:',dir);});
test('exact 086 footprint; reviewed baseline passes, unbound verifier fails and legacy rows preserved',()=>{
 assert.deepEqual(snapshot().rows,baseline.rows);assert.deepEqual(snapshot().catalog,baseline.catalog);assert.deepEqual(snapshot().contract,F.afterContract);
 const good=JSON.parse(sql('begin read only;'+F.verifierSql(pins)+'rollback;'));assert.equal(good.gate_pass,true,JSON.stringify(good));
 assert.equal(JSON.parse(sql(F.verifierSql())).gate_pass,false);
 assert.equal(details(legacy).journey_snapshot,null);
 const drifts=[
  [`update advisory_matters set title='Drift' where id=${q(legacy)};`,'historical_rows_unchanged'],
  ['alter table advisory_journey_versions add column extra text;','new_objects_exact'],
  ['alter function advisory_journey_catalog(text) volatile;','new_objects_exact'],
  ['grant execute on function advisory086_snapshot(uuid,text,uuid,uuid) to authenticated;','new_objects_exact'],
  ['alter policy advisory086_read on advisory_journey_snapshots using(true);','new_objects_exact'],
  ["update advisory_journey_variants set active=false,is_default=false;",'only_template_seeds_no_backfill'],
  ['alter table advisory_matters add column drift text;','old_catalog_preserved']
 ];
 for(const [mutation,check] of drifts){const r=JSON.parse(sql('begin;'+mutation+F.verifierSql(pins)+'rollback;'));assert.equal(r.gate_pass,false);assert.ok(r.failed_checks.includes(check),JSON.stringify(r.failed_checks));}

});
test('new creation snapshots the default version and starts exactly one first Stage with Lead',()=>{
 for(const type of E.catalog.work_types){const m=create(type.key),d=details(m),snap=d.journey_snapshot;assert.equal(snap.family_key,type.family);assert.equal(d.items[0].stage_name_en,snap.definition.stages[0].name_en);assert.equal(d.stages[0].stage_key,d.items[0].stage_key);assert.equal(d.items[0].lead_id,id(2));assert.equal(d.items[0].work_state,'working');assert.equal(d.stages.flatMap(s=>s.visits).length,1);assert.deepEqual(d.stages.map(s=>s.stage_key),snap.definition.stages.map(s=>s.key));}
 denied(call(null,'create',payload('general_advisory',{lead_id:''})),'ADVISORY_REQUIRED_FIELDS');
});
test('only Admin manages; inactive and forced-password Admin denied; direct writes/private helpers denied',()=>{
 const v=catalog()[0];const request=`select advisory_journey_manage(${q(v.id)},'publish',${q(JSON.stringify({definition:v.definition}))},gen_random_uuid(),${v.revision});`;
 denied(request,'ADVISORY_FORBIDDEN',2);denied('update advisory_journey_variants set active=false;','permission denied');denied(`select advisory086_snapshot('${id(101)}','general_advisory',null,null);`,'permission denied');
 for(const change of ['active=false,assignable=false','must_change_password=true']){sql('set session_replication_role=replica;update user_profiles set '+change+` where id='${id(1)}';`);denied(request,'ADVISORY_FORBIDDEN');sql(`set session_replication_role=replica;update user_profiles set active=true,assignable=true,must_change_password=false where id='${id(1)}';`);}
});
test('version publication never changes existing snapshot; selected stale version rejected and retries stable',()=>{
 const v=catalog()[0],m=create('contract_business_documents',{variant_id:v.id,journey_version_id:v.version_id}),before=details(m);
 const definition=structuredClone(v.definition);definition.name_th='มาตรฐานใหม่';definition.name_en='New standard';definition.stages[1].name_en='Updated requirements';
 const r=manage(v,'publish',{definition});const fresh=catalog().find(x=>x.id===r.id);assert.equal(fresh.version,2);
 assert.deepEqual(stableDetails(m),stableDetails(before));assert.equal(details(create('contract_business_documents')).journey_snapshot.version,2);
 denied(call(null,'create',payload('contract_business_documents',{variant_id:v.id,journey_version_id:v.version_id})),'ADVISORY_JOURNEY_CHANGED');
 denied(`update advisory_journey_versions set definition=definition where id=${q(v.version_id)};`,'permission denied');
 const owner=sql(`update advisory_journey_versions set definition=definition where id=${q(v.version_id)};`,true);assert.match(owner.stderr,/ADVISORY_JOURNEY_IMMUTABLE/);
 assert.match(sql(`update advisory_journey_snapshots set version=version+1 where matter_id=${q(m)};`,true).stderr,/ADVISORY_JOURNEY_IMMUTABLE/);
 assert.match(sql(`delete from advisory_journey_requests;`,true).stderr,/ADVISORY_JOURNEY_IMMUTABLE/);
});
test('multiple variants/default switch/inactive rules and cross-family selection remain deterministic',()=>{
 let def=structuredClone(catalog()[0].definition);def.name_en='Alternative';def.name_th='รูปแบบเพิ่มเติม';const created=manage(null,'create',{family_key:'contract_business_documents',definition:def});let v=catalog().find(x=>x.id===created.id);
 assert.equal(catalog().length,2);assert.equal(catalog().filter(x=>x.is_default).length,1);
 v=manage(v,'configure',{active:true,is_default:true});assert.equal(details(create('contract_business_documents')).journey_snapshot.variant_id,v.id);
 const original=catalog().find(x=>x.id!==v.id);manage(original,'configure',{active:false,is_default:false});
 assert.equal(as("select advisory_journey_catalog('contract_business_documents')",2).variants.length,1);
 denied(call(null,'create',payload('contract_business_documents',{variant_id:original.id})),'ADVISORY_JOURNEY_UNAVAILABLE');
 denied(call(null,'create',payload('general_advisory',{variant_id:v.id})),'ADVISORY_JOURNEY_UNAVAILABLE');
 denied(`select advisory_journey_manage(${q(v.id)},'configure','{"active":false,"is_default":false}',gen_random_uuid(),${v.revision});`,'ADVISORY_JOURNEY_DEFAULT_REQUIRED');
});
test('optional future skip requires reason and audit; Required cannot skip or be jumped',()=>{
 const m=create('contract_business_documents');const initial=details(m);
 denied(call(m,'stage_skip',{stage_key:'requirements',reason:'attempt'}),'ADVISORY_JOURNEY_REQUIRED_STAGE');
 denied(call(m,'stage',{stage_key:'final',template:'contract_business_documents'}),'ADVISORY_JOURNEY_USE_ADVANCE');
 denied(call(m,'stage_skip',{stage_key:'internal_review',reason:' '}),'ADVISORY_JOURNEY_REASON_REQUIRED');
 assert.deepEqual(stableDetails(m),stableDetails(initial));
 const req=call(m,'stage_skip',{stage_key:'internal_review',reason:'Client requested direct delivery'}),result=as(req);assert.deepEqual(as(req),result);
 const skipped=details(m).stages.find(s=>s.stage_key==='internal_review');assert.equal(skipped.required,false);assert.equal(skipped.visits.length,1);assert.equal(skipped.visits[0].kind,'skip');
 assert.equal(sql(`select detail#>>'{input,reason}' from advisory_matter_activities where matter_id=${q(m)} and kind='stage_skip'`),'Client requested direct delivery');
 assert.equal(as(`select jsonb_agg(detail) from advisory_matter_activities where matter_id=${q(m)} and kind='stage_skip'`)[0].input.reason,'Client requested direct delivery');
 advance(m);advance(m);advance(m);assert.equal(current(m).stage_key,'delivery_negotiation');
});
test('current optional skip uses existing task/Next Action/optimistic guards then advances, never completes work implicitly',()=>{
 const m=create('contract_business_documents');advance(m);advance(m);advance(m);let stage=current(m);assert.equal(stage.stage_key,'internal_review');
 const task=write(m,'task_save',{title:'Blocked task',status:'pending',priority:'normal',stage_id:stage.id});
 denied(call(m,'stage_skip',{stage_key:stage.stage_key,visit_id:stage.visits[0].id,reason:'Skip review'}),'ADVISORY_STAGE_TASKS_OPEN');
 write(m,'task_complete',{id:task.item_id});write(m,'next_action',{title:'Unresolved next action'});
 denied(call(m,'stage_skip',{stage_key:stage.stage_key,visit_id:stage.visits[0].id,reason:'Skip review'}),'ADVISORY_NEXT_ACTION_RESOLUTION_REQUIRED');
 const r=write(m,'stage_skip',{stage_key:stage.stage_key,visit_id:stage.visits[0].id,reason:'Explicitly waived',resolve_next_action:true});assert.equal(r.next_stage_key,'delivery_negotiation');
 stage=details(m).stages.find(s=>s.id===stage.id);assert.equal(stage.visits.filter(v=>v.kind==='skip').length,1);assert.equal(stage.visits.find(v=>v.kind==='visit').exit_reason,'skipped');assert.equal(r.skipped_stage_key,'internal_review');assert.equal(r.completed_stage_key,undefined);
 assert.equal(as(`select jsonb_agg(detail) from advisory_matter_activities where matter_id=${q(m)} and kind='stage_skip'`)[0].input.reason,'Explicitly waived');
});
test('complete/close/reopen and pre-FJ Matter Stage behavior retain existing guards',()=>{
 const m=create('general_advisory');while(current(m))advance(m);assert.equal(details(m).items[0].status,'active');write(m,'close',{outcome:'completed',summary:'Complete'});write(m,'reopen',{reason:'Follow-up'});assert.equal(details(m).items[0].stage_key,null);write(m,'stage',{stage_key:'intake',template:'general_advisory'});assert.equal(current(m).stage_key,'intake');
 const old=details(legacy);advance(legacy);assert.equal(details(legacy).items[0].stage_key,old.stages[1].stage_key);assert.equal(details(legacy).journey_snapshot,null);
});
test('independent sessions share one create response/snapshot/first visit, and failed calls roll back fully',async()=>{
 const statement=call(null,'create',payload('government_coordination'));const result=await Promise.all([session(statement),session(statement)]);assert.ok(result.every(r=>r.code===0),JSON.stringify(result));const values=result.map(r=>JSON.parse(r.out.trim().split('\n').at(-1)));assert.deepEqual(values[0],values[1]);const m=values[0].matter_id;assert.equal(sql(`select count(*) from advisory_journey_snapshots where matter_id=${q(m)}`),'1');assert.equal(details(m).stages.flatMap(s=>s.visits).length,1);
 const before=snapshot().rows;denied(call(null,'create',payload('unknown_type')),'ADVISORY_JOURNEY_INVALID');assert.deepEqual(snapshot().rows,before);
});
test('malformed versions and concurrent publishes cannot bypass defaults/version locks',async()=>{
 const v=catalog('general_advisory')[0],bad=structuredClone(v.definition);bad.stages[0].required=false;
 denied(`select advisory_journey_manage(${q(v.id)},'publish',${q(JSON.stringify({definition:bad}))},gen_random_uuid(),${v.revision});`,'ADVISORY_JOURNEY_INVALID');
 const req=crypto.randomUUID(),statement=`select advisory_journey_manage(${q(v.id)},'publish',${q(JSON.stringify({definition:v.definition}))},'${req}',${v.revision});`;
 const both=await Promise.all([session(statement),session(statement)]);assert.ok(both.every(r=>r.code===0),JSON.stringify(both));assert.equal(catalog('general_advisory')[0].version,v.version+1);
 denied(`select advisory_journey_manage(${q(v.id)},'publish',${q(JSON.stringify({definition:v.definition}))},gen_random_uuid(),${v.revision});`,'ADVISORY_CHANGED');
 const fresh=catalog('general_advisory')[0],race=await Promise.all([1,2].map(()=>session(`select advisory_journey_manage(${q(fresh.id)},'publish',${q(JSON.stringify({definition:fresh.definition}))},gen_random_uuid(),${fresh.revision});`)));assert.equal(race.filter(r=>r.code===0).length,1);assert.match(race.find(r=>r.code!==0).err,/ADVISORY_CHANGED/);assert.equal(catalog('general_advisory')[0].version,fresh.version+1);
});
