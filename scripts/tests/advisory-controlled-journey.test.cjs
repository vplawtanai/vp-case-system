/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable PostgreSQL only, private Unix socket; never reads .env or Production credentials.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{spawnSync,spawn}=require('node:child_process');
const G=require('./advisory-controlled-journey-artifacts.cjs'),{F,A,B,q}=G,E=F.E,C=E.C,D=E.D;
const bin='/Applications/Postgres.app/Contents/Versions/18/bin',id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');let dir,started=false,baseline,pins,legacy;
function run(name,args,input,fail=false){const r=spawnSync(bin+'/'+name,args,{input,encoding:'utf8',env:{PATH:process.env.PATH,LC_ALL:'C'},maxBuffer:64e6});if(!fail)assert.equal(r.status,0,r.stderr||r.error?.message);return fail?r:r.stdout.trim();}
function args(){return ['-X','-qAt','-v','ON_ERROR_STOP=1','-h',dir,'-p','58487','-U','postgres','-d','postgres'];}
function sql(s,fail=false){return run('psql',args(),s,fail);}
function auth(n=1){return `set role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',false);select set_config('request.jwt.claims',${q(JSON.stringify({sub:id(n),role:'authenticated'}))},false);`;}
function as(s,n=1){return JSON.parse(sql(auth(n)+s).split('\n').at(-1));}
function snapshot(){return JSON.parse(sql(G.snapshot()));}
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
const definition=require('./fixtures/advisory-controlled-journey.json');
let variant,legacyBefore;
function newMatter(){return create('general_advisory',{variant_id:variant.id});}
function complete(m,p={}){const s=current(m);return write(m,'stage_complete',{visit_id:s.visits.find(v=>v.kind==='visit'&&!v.exited_at).id,...p});}
before(()=>{
 dir=fs.mkdtempSync('/private/tmp/vp-fj087-');fs.chmodSync(dir,0o700);run('initdb',['-D',dir+'/data','-U','postgres','-A','trust','--encoding=UTF8','--locale='+(process.env.FJ087_LOCALE||'en_US.UTF-8')]);run('pg_ctl',['-D',dir+'/data','-l',dir+'/server.log','-o',`-F -k ${dir} -p 58487 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
 const s=fs.readFileSync(__dirname+'/non-litigation-postgres.test.cjs','utf8'),fixture=s.slice(s.indexOf('function fixture(){'),s.indexOf('\nbefore(()=>'));
 sql(vm.runInNewContext('('+fixture+')()',{A,id}));sql(A.migration(JSON.parse(sql(A.snapshotSql()))));
 const pre=JSON.parse(sql(B.snapshot()));let m=fs.readFileSync(B.candidate,'utf8');for(const k of ['catalog','functions'])m=m.replaceAll(B.baseline[k],F.jsonHash(pre.old[k]));sql(m);
 for(const file of [C.candidate,D.candidate,E.candidate,F.candidate])sql(fs.readFileSync(file,'utf8'));
 legacy=create('general_advisory');advance(legacy);legacyBefore=stableDetails(legacy);
 baseline=snapshot();pins={rows_sha256:G.jsonHash(baseline.rows),catalog_sha256:G.jsonHash(baseline.catalog)};
 const pf=JSON.parse(sql('begin read only;'+G.preflightSql()+'rollback;'));assert.equal(pf.gate_pass,true,JSON.stringify(pf));
 if(process.env.FJ087_CAPTURE==='1'){sql(G.core());fs.writeFileSync(G.footprintPath,JSON.stringify(JSON.parse(sql(G.footprint())),null,2)+'\n');}
 else {sql(fs.readFileSync(G.candidate,'utf8').replace(/COMMIT;\s*$/,'ROLLBACK;'));assert.deepEqual(snapshot(),baseline);sql(fs.readFileSync(G.candidate,'utf8'));}
});
after(()=>{if(started)run('pg_ctl',['-D',dir+'/data','-m','fast','-w','stop']);console.log('087 disposable evidence:',dir);});
test('exact 087 contract, no rows/backfill/seeds, portable catalog and fail-closed verifier',()=>{
 assert.deepEqual(snapshot().rows,baseline.rows);assert.deepEqual(snapshot().catalog,baseline.catalog);assert.deepEqual(snapshot().contract,G.afterContract);
 // New read field is additive; historical snapshot/stage/visit evidence is exact.
 const currentLegacy=stableDetails(legacy);delete currentLegacy.journey_decisions;delete currentLegacy.journey_path;assert.deepEqual(currentLegacy,legacyBefore);
 let v=JSON.parse(sql('begin read only;'+G.verifierSql(pins)+'rollback;'));assert.equal(v.gate_pass,true,JSON.stringify(v));
 assert.equal(JSON.parse(sql(G.verifierSql())).gate_pass,false);
 for(const change of [
  `update advisory_matters set title='drift' where id=${q(legacy)};`,
  'alter table advisory_journey_versions add column unexpected text;',
  'alter function advisory_workflow_checks(uuid) volatile;',
  'grant execute on function advisory087_valid_version(jsonb) to authenticated;',
  'alter policy advisory086_read on advisory_journey_snapshots using(true);',
  'alter table advisory_journey_versions disable trigger advisory086_version_immutable;'
 ]){v=JSON.parse(sql('begin;'+change+G.verifierSql(pins)+'rollback;'));assert.equal(v.gate_pass,false,change);}
 const altered=structuredClone(pins);altered.catalog_sha256='0'.repeat(64);assert.equal(JSON.parse(sql(G.verifierSql(altered))).gate_pass,false);
});
test('create snapshots the explicit non-default Variant and exact version instead of the family default',()=>{
 const before=stableDetails(legacy),standard=catalog('general_advisory').find(v=>v.is_default);
 const created=manage(null,'create',{family_key:'general_advisory',definition});
 const selected=catalog('general_advisory').find(v=>v.id===created.id);
 assert.equal(selected.is_default,false);assert.notEqual(selected.id,standard.id);assert.notEqual(selected.version_id,standard.version_id);
 // Match the real Create Matter payload, including its family template hint.
 const m=create('general_advisory',{template:'general_advisory',variant_id:selected.id,journey_version_id:selected.version_id}),d=details(m);
 assert.equal(d.journey_snapshot.variant_id,selected.id);assert.equal(d.journey_snapshot.version_id,selected.version_id);
 assert.equal(d.journey_snapshot.version,selected.version);assert.deepEqual(d.journey_snapshot.definition,definition);
 assert.equal(d.stages.find(s=>s.stage_key==='additional').conditional,true);
 assert.equal(d.journey_path.length,1);assert.equal(d.items[0].stage_key,'intake');
 const request=JSON.parse(sql(`select request_body->'payload' from advisory_control_requests where response->>'matter_id'=${q(m)} and request_body->>'action'='create'`));
 assert.equal(request.variant_id,selected.id);assert.equal(request.journey_version_id,selected.version_id);
 const after=stableDetails(legacy);
 for(const key of ['items','stages','journey_snapshot','journey_path','journey_decisions','state_history','team','time'])assert.deepEqual(after[key],before[key],key);
});
test('create without an explicit Variant snapshots the active family default and its current version',()=>{
 const standard=catalog('general_advisory').find(v=>v.is_default),d=details(create('general_advisory'));
 assert.equal(d.journey_snapshot.variant_id,standard.id);assert.equal(d.journey_snapshot.version_id,standard.version_id);
 assert.deepEqual(d.journey_snapshot.definition,standard.definition);assert.equal(d.journey_path.length,1);
 assert.equal(d.items[0].stage_key,standard.definition.stages[0].key);
});
test('Admin publishes FJ-2, default snapshot freezes all outcomes/routes; legacy is not rewritten',()=>{
 variant=manage(null,'create',{family_key:'general_advisory',definition});variant=catalog('general_advisory').find(v=>v.id===variant.id);
 const m=newMatter(),d=details(m);assert.deepEqual(d.journey_snapshot.definition,definition);assert.equal(d.items[0].stage_key,'intake');assert.equal(d.stages.flatMap(s=>s.visits).length,1);assert.equal(d.stages.find(s=>s.stage_key==='additional').visits.length,0);
 const modified=structuredClone(definition);modified.stages[1].outcomes[0].name_en='New outcome';manage(variant,'publish',{definition:modified});assert.deepEqual(details(m).journey_snapshot,d.journey_snapshot);
 variant=catalog('general_advisory').find(v=>v.id===variant.id);manage(variant,'configure',{active:true,is_default:true});variant=catalog('general_advisory').find(v=>v.id===variant.id);
 assert.equal(details(create('general_advisory')).journey_snapshot.variant_id,variant.id);
 assert.deepEqual(stableDetails(legacy).stages,legacyBefore.stages);
 denied(`select advisory_journey_manage(${q(variant.id)},'publish',${q(JSON.stringify({definition}))},gen_random_uuid(),${variant.revision})`,'ADVISORY_FORBIDDEN',2);
 denied('select advisory087_valid_version(null);','permission denied');
});
test('single outcome auto-selects; multiple requires exact snapshot outcome/reason; rejected calls preserve every row',()=>{
 const m=newMatter();let r=complete(m);assert.equal(r.outcome.key,'continue');assert.equal(current(m).stage_key,'review');
 const before=snapshot().rows;for(const p of [{},{outcome_key:'invented'},{outcome_key:'information'},{outcome_key:'rejected',outcome_reason:' '}])denied(call(m,'stage_complete',{visit_id:current(m).visits[0].id,...p}),'ADVISORY_OUTCOME');
 assert.deepEqual(snapshot().rows,before);
 r=complete(m,{outcome_key:'information',outcome_reason:'Need supporting evidence'});assert.equal(r.next_stage_key,'additional');assert.equal(current(m).stage_key,'additional');assert.equal(r.outcome_reason,'Need supporting evidence');
 assert.ok(r.from_visit_id);assert.ok(r.to_visit_id);assert.equal(r.target_stage.conditional,true);
 const audit=details(m).journey_decisions.at(-1);assert.equal(audit.actor_id,id(1));assert.equal(audit.detail.actor_name,sql(`select coalesce(nullif(staff_name,''),full_name) from user_profiles where id=${q(id(1))}`));assert.ok(audit.occurred_at);assert.equal(audit.detail.outcome.key,'information');assert.equal(audit.detail.outcome_reason,'Need supporting evidence');
 const oldReview=details(m).stages.find(s=>s.stage_key==='review').visits[0];complete(m);const reviews=details(m).stages.find(s=>s.stage_key==='review').visits;assert.equal(reviews.length,2);assert.deepEqual(reviews.find(v=>v.id===oldReview.id),oldReview);assert.equal(reviews.filter(v=>!v.exited_at).length,1);
 complete(m,{outcome_key:'approved'});complete(m);assert.equal(current(m),undefined);assert.equal(details(m).items[0].status,'active');assert.equal(as(`select advisory_workflow_checks(${q(m)})`).ready_to_close,true);
 write(m,'close',{outcome:'completed',summary:'Done'});write(m,'reopen',{reason:'Follow-up'});write(m,'stage',{stage_key:'review'});assert.equal(current(m).stage_key,'review');
});
test('unchosen required conditional is not skipped or counted against closing; manual routes cannot bypass decisions',()=>{
 const m=newMatter();complete(m);denied(call(m,'stage',{stage_key:'delivery'}),'ADVISORY_JOURNEY_USE_ADVANCE');
 complete(m,{outcome_key:'rejected',outcome_reason:'Authority refused'});const d=details(m);assert.equal(d.stages.find(s=>s.stage_key==='additional').visits.length,0);assert.equal(d.stages.flatMap(s=>s.visits).filter(v=>v.kind==='skip').length,0);assert.equal(as(`select advisory_workflow_checks(${q(m)})`).stage_ready,true);
 denied(call(m,'stage',{stage_key:'intake'}),'ADVISORY_JOURNEY_USE_ADVANCE');write(m,'close',{outcome:'completed',summary:'Rejected path concluded'});
});
test('Task/Next Action guards apply before transition; optional skip cannot choose branches or activate dormant stages',()=>{
 const m=newMatter();complete(m);const v=current(m).visits[0],task=write(m,'task_save',{title:'Review task',stage_id:current(m).id});
 denied(call(m,'stage_complete',{visit_id:v.id,outcome_key:'approved'}),'ADVISORY_STAGE_TASKS_OPEN');write(m,'task_complete',{id:task.item_id});
 write(m,'next_action',{title:'Next action'});denied(call(m,'stage_complete',{visit_id:v.id,outcome_key:'approved'}),'ADVISORY_NEXT_ACTION_RESOLUTION_REQUIRED');
 denied(call(m,'stage_skip',{stage_key:'additional',reason:'Not chosen'}),'ADVISORY_JOURNEY_REQUIRED_STAGE');
 denied(call(m,'stage_skip',{stage_key:'delivery',reason:'Premature'}),'ADVISORY_BRANCH_COMPLETE_REQUIRED');
 complete(m,{outcome_key:'approved',resolve_next_action:true});const dv=current(m).visits[0];write(m,'stage_skip',{stage_key:'delivery',visit_id:dv.id,reason:'Delivery waived'});assert.equal(current(m),undefined);
 // A waived final linear optional stage also reaches the closing marker.
 assert.equal(as(`select advisory_workflow_checks(${q(m)})`).ready_to_close,true);
});
test('independent sessions/retry cannot duplicate branches and request reuse with different outcome fails',async()=>{
 const m=newMatter();complete(m);const vid=current(m).visits[0].id,statement=call(m,'stage_complete',{visit_id:vid,outcome_key:'information',outcome_reason:'Evidence'});
 const pair=await Promise.all([session(statement),session(statement)]);assert.ok(pair.every(r=>r.code===0),JSON.stringify(pair));const responses=pair.map(r=>JSON.parse(r.out.trim().split('\n').at(-1)));assert.deepEqual(responses[0],responses[1]);assert.equal(current(m).visits.length,1);assert.equal(details(m).journey_decisions.filter(a=>a.detail.from_visit_id===vid).length,1);
 denied(statement.replace('information','approved'),'ADVISORY_RETRY_MISMATCH');complete(m);
 const version=+sql(`select version from advisory_matter_control where matter_id=${q(m)}`),visit=current(m).visits.find(v=>!v.exited_at).id;
 const race=await Promise.all(['approved','rejected'].map(outcome=>session(call(m,'stage_complete',{visit_id:visit,outcome_key:outcome,outcome_reason:'Race'},crypto.randomUUID(),version))));assert.equal(race.filter(r=>r.code===0).length,1);assert.match(race.find(r=>r.code!==0).err,/ADVISORY_CHANGED/);
 const before=snapshot();const tx=call(m,'note',{text:'Rollback'});sql('begin;'+auth()+tx+'rollback;');assert.deepEqual(snapshot(),before);
});
test('validator rejects invalid/dangling/disconnected/trapped rules, preserves FJ-1 and permits legal loop',()=>{
 assert.equal(sql(`select advisory087_valid_version(${q(JSON.stringify(definition))})`),'t');
 for(const mutate of [d=>d.stages[0].conditional=true,d=>d.stages[1].outcomes[0].target='missing',d=>d.stages[1].outcomes[1].key='approved',d=>d.stages[1].outcomes=[],d=>d.stages[1].outcomes[0].requires_reason='yes',d=>d.stages[2].outcomes[0].target='additional',d=>d.stages[1].outcomes.splice(1,1),d=>d.stages[0].condition='rule',d=>d.stages[4].outcomes.push(d.stages[0].outcomes[0])]){const d=structuredClone(definition);mutate(d);assert.equal(sql(`select advisory087_valid_version(${q(JSON.stringify(d))})`),'f',JSON.stringify(d));}
 assert.equal(sql(`select advisory087_valid_version(${q(JSON.stringify(F.seed[0].definition))})`),'t');
});
test('FJ-1 optional skips/linear advance/close/reopen still work after 087; frozen history stays exact',()=>{
 const old=catalog('contract_business_documents')[0],m=create('contract_business_documents',{variant_id:old.id});
 write(m,'stage_skip',{stage_key:'internal_review',reason:'Existing FJ1 waiver'});complete(m);complete(m);complete(m);assert.equal(current(m).stage_key,'delivery_negotiation');
 const stage=current(m),v=stage.visits.find(v=>!v.exited_at);write(m,'stage_skip',{stage_key:stage.stage_key,visit_id:v.id,reason:'FJ1 optional current'});assert.equal(current(m).stage_key,'final');complete(m);assert.equal(as(`select advisory_workflow_checks(${q(m)})`).ready_to_close,true);write(m,'close',{outcome:'completed',summary:'Unchanged FJ1 close'});write(m,'reopen',{reason:'Unchanged FJ1 reopen'});write(m,'stage',{stage_key:'intake'});assert.equal(current(m).stage_key,'intake');
 assert.equal(details(m).journey_snapshot.definition.format,undefined);
});
test('audit insertion failure rolls completion/next visit/control/request back atomically; inactive actor cannot transition',()=>{
 const m=newMatter();complete(m);const s=current(m),statement=call(m,'stage_complete',{visit_id:s.visits[0].id,outcome_key:'information',outcome_reason:'Evidence'}),before=snapshot();
 const failure=sql(`begin;create function pg_temp.fail087() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_AUDIT_FAILURE';end;$$;create trigger synthetic_failure before insert on public.advisory_matter_activities for each row when(new.kind='stage_complete') execute function pg_temp.fail087();`+auth()+statement+'commit;',true);
 assert.notEqual(failure.status,0);assert.match(failure.stderr,/SYNTHETIC_AUDIT_FAILURE/);assert.deepEqual(snapshot(),before);
 for(const change of ['active=false,assignable=false','must_change_password=true']){sql('set session_replication_role=replica;update user_profiles set '+change+` where id='${id(1)}';`);denied(statement,'ADVISORY_FORBIDDEN');sql(`set session_replication_role=replica;update user_profiles set active=true,assignable=true,must_change_password=false where id='${id(1)}';`);}
 assert.deepEqual(snapshot(),before);
});
test('Actual Path and decision audit retain every loop visit beyond the legacy 20-visit per-stage preview',()=>{
 const m=newMatter();complete(m);for(let i=0;i<21;i++){complete(m,{outcome_key:'information',outcome_reason:'Iteration '+i});complete(m);}
 const d=details(m);assert.equal(d.journey_path.filter(v=>v.stage_id===current(m).id).length,22);assert.equal(d.journey_decisions.length,43);assert.equal(d.journey_path.length,44);assert.equal(d.journey_path.filter(v=>!v.exited_at).length,1);
});
test('an optional skip from an earlier loop never removes a route target in a later visit',()=>{
 const d=structuredClone(definition);d.stages=[definition.stages[0],{...definition.stages[3],key:'waive_a',outcomes:[{...definition.stages[0].outcomes[0],target:'waive_b'}]},{...definition.stages[3],key:'waive_b',outcomes:[{...definition.stages[0].outcomes[0],target:'review'}]},{...definition.stages[1],outcomes:[{...definition.stages[0].outcomes[0],key:'repeat',target:'waive_a'},{...definition.stages[0].outcomes[0],key:'finish',target:'close'}]},definition.stages[4]];d.stages[0]={...d.stages[0],outcomes:[{...definition.stages[0].outcomes[0],target:'waive_a'}]};
 const v=manage(null,'create',{family_key:'general_advisory',definition:d}),m=create('general_advisory',{variant_id:v.id});complete(m);complete(m);
 let s=current(m);write(m,'stage_skip',{stage_key:s.stage_key,visit_id:s.visits.find(v=>!v.exited_at).id,reason:'First visit waiver'});complete(m,{outcome_key:'repeat'});
 s=current(m);write(m,'stage_skip',{stage_key:s.stage_key,visit_id:s.visits.find(v=>v.kind==='visit'&&!v.exited_at).id,reason:'Second visit waiver'});assert.equal(current(m).stage_key,'waive_b');assert.equal(details(m).journey_path.filter(v=>v.stage_id===current(m).id).length,2);
});
