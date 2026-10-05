/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable Unix-socket PG only; no project credentials or Production.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const A=require('./advisory-artwork-artifacts.cjs'),base=require('./visual-assets-artifacts.cjs'),general=require('./visual-assets-general-artifacts.cjs');
const bin='/Applications/Postgres.app/Contents/Versions/18/bin',id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');let dir,started=false,pins;
function cmd(n,args,input){const r=spawnSync(bin+'/'+n,args,{input,encoding:'utf8',env:{PATH:process.env.PATH,LC_ALL:'C'},maxBuffer:32e6});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
function sql(s,fail=false){const args=['-X','-qAt','-v','ON_ERROR_STOP=1','-h',dir,'-p','58594','-U','postgres','-d','postgres'];return fail?spawnSync(bin+'/psql',args,{input:s,encoding:'utf8'}):cmd('psql',args,s);}
const role=(r,n=1)=>`set local role ${r};set local request.jwt.claim.sub='${id(n)}';set local request.jwt.claim.role='${r}';`;
const read=(key=A.keys[0])=>`select public.journey_artwork094_read(${A.q(key)})`;
const denied=(s,pattern=/permission denied|ARTWORK094_/,r='authenticated',n=2)=>{const x=sql('begin;'+role(r,n)+s+';rollback;',true);assert.notEqual(x.status,0);assert.match(x.stderr,pattern);};
const gate=s=>JSON.parse(sql('begin read only;'+s+'rollback;'));
function batch(s,fail=false){const args=['-X','-qAt','-v','ON_ERROR_STOP=1','-h',dir,'-p','58594','-U','postgres','-d','postgres','-c',s];return fail?spawnSync(bin+'/psql',args,{encoding:'utf8',env:{PATH:process.env.PATH,LC_ALL:'C'}}):cmd('psql',args);}
before(()=>{
 dir=fs.mkdtempSync('/private/tmp/vp-artwork094-');fs.chmodSync(dir,0o700);cmd('initdb',['-D',dir+'/data','-U','postgres','-A','trust','--encoding=UTF8','--locale=en_US.UTF-8']);
 cmd('pg_ctl',['-D',dir+'/data','-l',dir+'/log','-o',`-F -k ${dir} -p 58594 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
 sql(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 create table user_profiles(id uuid primary key,role text,active boolean,must_change_password boolean not null default false);
 create function public.people_is_active_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.user_profiles where id=auth.uid() and active is true and role='admin'); $$;
 create function public.advisory_control_read(uuid,jsonb) returns jsonb language sql stable as $$select '{}'::jsonb$$;
 create table storage.buckets(id text primary key,name text unique,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
 alter table storage.objects enable row level security;grant all on storage.objects to anon,authenticated,service_role;grant select on storage.buckets to authenticated;
 create policy existing_wide_read on storage.objects for select to public using(true);
 insert into user_profiles values('${id(1)}','admin',true,false),('${id(2)}','lawyer',true,false);`);
 sql(fs.readFileSync(base.candidate,'utf8'));sql(fs.readFileSync(general.candidate,'utf8'));
 for(const [i,key] of A.keys.entries()){
  const n=20+i,prefix=`${id(1)}/${id(n)}/${id(90)}`;
  sql(`insert into storage.objects(bucket_id,name) values('vp-visual-assets','${prefix}/master.webp'),('vp-visual-assets','${prefix}/thumbnail.webp');begin;${role('authenticated')}
  select public.visual_assets_write('create','${id(n)}',null,${A.q(JSON.stringify({artwork_key:key,name_th:'ภาพตัวอย่าง',name_en:'Fixture',asset_type:i%2?'illustration':'journey',scope:'both',status:'active',overlay_ready:false,master_path:prefix+'/master.webp',thumbnail_path:prefix+'/thumbnail.webp',width:1600,height:1000,byte_size:1000,thumbnail_bytes:100,sha256:'a'.repeat(64)}))});commit;`);
 }
 const pre=gate(A.preflightSql());assert.equal(pre.gate_pass,true,JSON.stringify(pre));pins={candidate_sha256:pre.candidate_sha256,rows_sha256:pre.rows_sha256,preserved_sha256:pre.preserved_sha256};
 // The Human-reported quoted 42883 is reproduced by the old text-signature
 // privilege check before installation. Missing RPC must now yield JSON false.
 const old=sql("select has_function_privilege('service_role','public.journey_artwork094_read(text)','EXECUTE');",true);
 assert.notEqual(old.status,0);assert.match(old.stderr,/function "public\.journey_artwork094_read\(text\)" does not exist/);
 const absent=gate(A.verifierSql(pins));assert.equal(absent.gate_pass,false);assert.deepEqual(absent.failed_checks,['rpc_exact','service_only_execute']);
 assert.equal(gate(A.applyDiagnosticSql(pins)).production_state,'CLEAN_PRE_094');
 const before=JSON.parse(sql(A.snapshot())),migration=fs.readFileSync(A.candidate,'utf8');sql(migration.replace(/COMMIT;\s*$/,'ROLLBACK;'));assert.deepEqual(JSON.parse(sql(A.snapshot())),before);
 // SQL Editor-style whole-script simple-query batch, including failure after
 // CREATE/ALTER/REVOKE/GRANT. Nothing may persist without successful COMMIT.
 const failed=batch(migration.replace(/COMMIT;\s*$/,'SELECT 1/0; COMMIT;'),true);
 assert.notEqual(failed.status,0);assert.match(failed.stderr,/division by zero/);assert.deepEqual(JSON.parse(sql(A.snapshot())),before);
 assert.equal(gate(A.applyDiagnosticSql(pins)).production_state,'CLEAN_PRE_094');
 batch(migration);
 const rpc=JSON.parse(sql(A.rpcEvidence()));
 if(process.env.ARTWORK094_CAPTURE==='1'){fs.writeFileSync(A.contractPath,JSON.stringify({candidate_sha256:pre.candidate_sha256,rpc},null,2)+'\n');A.generate();}
});
after(()=>{if(started)cmd('pg_ctl',['-D',dir+'/data','-m','fast','-w','stop']);console.log('094 local evidence:',dir);});
test('exact migration and SELECT-only verifier: reviewed baseline, rollback, PG17/18 representation',()=>{
 assert.equal(gate(A.verifierSql(pins)).gate_pass,true);assert.equal(gate(A.verifierSql()).gate_pass,false);
 const pg17=A.verifierSql(pins).replace('WITH funcs AS (',"WITH pg_constraint AS (SELECT * FROM pg_catalog.pg_constraint WHERE contype<>'n'), funcs AS (");assert.equal(gate(pg17).gate_pass,true);
 assert.equal(fs.readFileSync(A.candidate,'utf8'),A.migrationSql());assert.equal(fs.readFileSync(A.preflight,'utf8'),A.preflightSql());assert.equal(fs.readFileSync(A.verifier,'utf8'),A.verifierSql(JSON.parse(fs.readFileSync(A.pinsPath))));
 assert.equal(fs.readFileSync(A.applyDiagnostic,'utf8'),A.applyDiagnosticSql(JSON.parse(fs.readFileSync(A.pinsPath))));
});
test('unchanged candidate creates before all signature references; whole-batch apply and late-error rollback',()=>{
 const migration=fs.readFileSync(A.candidate,'utf8'),create=migration.indexOf('CREATE FUNCTION public.journey_artwork094_read(');
 assert.ok(create>migration.indexOf('BEGIN;'));
 assert.ok(migration.indexOf('ALTER FUNCTION public.journey_artwork094_read(text)')>create);
 assert.ok(migration.indexOf('REVOKE ALL ON FUNCTION public.journey_artwork094_read(text)')>create);
 assert.ok(migration.indexOf('GRANT EXECUTE ON FUNCTION public.journey_artwork094_read(text)')>create);
 assert.equal(migration.slice(0,create).includes('public.journey_artwork094_read(text)'),false);
 assert.doesNotMatch(migration,/DROP FUNCTION|EXCEPTION WHEN/);assert.match(migration,/COMMIT;\s*$/);
 assert.equal(gate(A.applyDiagnosticSql(pins)).production_state,'EXACT_APPLIED_094');
 const retry=batch(migration,true);assert.notEqual(retry.status,0);assert.match(retry.stderr,/ARTWORK094_ALREADY_PRESENT/);
 assert.equal(gate(A.verifierSql(pins)).gate_pass,true,'retry guard cannot alter the accepted applied contract');
});
test('missing RPC verifier fails closed as JSON; apply diagnostic distinguishes absent, exact and partial/drifted states',()=>{
 const diagnostic=A.applyDiagnosticSql(pins),before=JSON.parse(sql(A.snapshot()));
 for(const source of [diagnostic,A.verifierSql(pins)]){
  const text=source.replace(/^--.*$/gm,'').replace(/'(?:''|[^'])*'/g,"''");
  assert.match(text,/^\s*WITH /);assert.equal(text.split(';').length,2);
  assert.doesNotMatch(text,/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|CALL|DO|COPY|SET)\b/i);
  assert.doesNotMatch(text,/\b(?:public\.)?journey_artwork094_read\s*\(/i,'diagnostics must not call the business RPC');
 }
 const drop='drop function public.journey_artwork094_read(text);';
 const missing=JSON.parse(sql('begin;'+drop+A.verifierSql(pins)+'rollback;'));
 assert.equal(missing.gate_pass,false);assert.deepEqual(missing.failed_checks,['rpc_exact','service_only_execute']);
 const clean=JSON.parse(sql('begin;'+drop+diagnostic+'rollback;'));
 assert.equal(clean.production_state,'CLEAN_PRE_094');assert.equal(clean.expected_function_exists,false);assert.deepEqual(clean.functions_found,[]);
 for(const k of ['accepted_083_084_contract_unchanged','reviewed_rows_unchanged','reviewed_preserved_contracts_unchanged'])assert.equal(clean[k],true);
 const applied=gate(diagnostic);assert.equal(applied.production_state,'EXACT_APPLIED_094');assert.equal(applied.functions_found.length,1);
 assert.equal(applied.functions_found[0].owner,'postgres');assert.equal(applied.functions_found[0].security_definer,true);
 assert.deepEqual(applied.functions_found[0].acl.map(x=>x[0]).sort(),['postgres','service_role']);
 assert.equal(applied.business_rpc_executed,false);assert.equal(applied.production_mutation,false);
 const drift=[
  drop+"create function public.journey_artwork094_read(integer) returns jsonb language sql as $$select '{}'::jsonb$$;",
  'alter function public.journey_artwork094_read(text) rename to journey_artwork094_renamed;',
  'create schema artwork094_test;alter function public.journey_artwork094_read(text) set schema artwork094_test;',
  'grant execute on function public.journey_artwork094_read(text) to public;',
  'grant execute on function public.journey_artwork094_read(text) to authenticated;',
  'revoke execute on function public.journey_artwork094_read(text) from service_role;',
  drop+'grant select on public.visual_assets to service_role;',
  drop+'drop policy visual083_read_ceiling on storage.objects;',
  drop+"update public.visual_assets set name_en='unexpected';",
  drop+'create table public.unexpected094(id integer);'
 ];
 for(const change of drift)assert.equal(JSON.parse(sql('begin;'+change+diagnostic+'rollback;')).production_state,'UNEXPECTED_OR_PARTIAL_STATE',change);
 for(const k of ['rows_sha256','preserved_sha256'])assert.equal(gate(A.applyDiagnosticSql({...pins,[k]:'0'.repeat(64)})).production_state,'UNEXPECTED_OR_PARTIAL_STATE');
 assert.equal(gate(A.applyDiagnosticSql()).production_state,'UNEXPECTED_OR_PARTIAL_STATE');
 assert.deepEqual(JSON.parse(sql(A.snapshot())),before);
});
test('only service role can call for eight approved assets; minimal metadata; no direct registry grants',()=>{
 for(const r of ['anon','authenticated'])denied(read(),/permission denied/,r);
 denied('select * from visual_assets',/permission denied/,'service_role');denied('select * from visual_asset_mappings',/permission denied/,'service_role');
 assert.equal(sql('begin;'+role('authenticated',2)+'select count(*) from visual_assets;rollback;'),'0');
 assert.equal(sql('begin;'+role('authenticated')+'select count(*) from visual_assets;rollback;'),'8');
 for(const k of A.keys){const value=JSON.parse(sql('begin read only;'+role('service_role')+read(k)+';rollback;'));assert.deepEqual(Object.keys(value).sort(),['artwork_key','height','master_path','width']);assert.equal(value.artwork_key,k);}
 for(const k of ['vp-img-111111111111',A.keys[0].toUpperCase(),'',"x' OR true --"])denied(read(k),/ARTWORK094_NOT_ALLOWED/,'service_role');
 denied('select public.journey_artwork094_read(null)',/ARTWORK094_NOT_ALLOWED/,'service_role');
});
test('reject missing, retired, draft, delete-pending, wrong type/scope, absent file, path belonging to another asset',()=>{
 for(const change of ["update visual_assets set status='retired'","update visual_assets set status='draft'","update visual_assets set status='retired',delete_pending=true","update visual_assets set asset_type='banner'","update visual_assets set scope='case'","delete from storage.objects","delete from visual_assets","update visual_assets set master_path='00000000-0000-4000-8000-000000000099/00000000-0000-4000-8000-000000000098/00000000-0000-4000-8000-000000000090/master.webp' where id='00000000-0000-4000-8000-000000000020'"]){
  const x=sql('begin;'+change+';'+role('service_role')+read()+';rollback;',true);assert.notEqual(x.status,0,change);assert.match(x.stderr,/ARTWORK094_UNAVAILABLE/);
 }
});
test('fail closed for rows, ACL/column ACL, RLS, Storage, unrelated function/table drift and wrong pins',()=>{
 for(const change of ["update visual_assets set name_en='changed'",'grant select on visual_assets to service_role','grant select(artwork_key) on visual_assets to service_role','grant execute on function journey_artwork094_read(text) to authenticated','alter table visual_assets disable row level security','drop policy visual083_read_ceiling on storage.objects',"create table public.unrelated094(id integer)","alter function public.advisory_control_read(uuid,jsonb) volatile"]){
  assert.equal(JSON.parse(sql('begin;'+change+';'+A.verifierSql(pins)+'rollback;')).gate_pass,false,change);
 }
 for(const k of ['rows_sha256','preserved_sha256'])assert.equal(gate(A.verifierSql({...pins,[k]:'0'.repeat(64)})).gate_pass,false);
 assert.equal(gate(A.verifierSql(pins)).gate_pass,true);
});
test('eight-code diagnostic uses the actual UI algorithm, separates identity/status/Storage, and is read-only',()=>{
 const diagnostic=fs.readFileSync(A.root+'/scripts/sql/diagnose_advisory_journey_artwork_identity_094.sql','utf8');
 const text=diagnostic.replace(/^--.*$/gm,'').replace(/'(?:''|[^'])*'/g,"''");
 assert.match(text,/^\s*WITH /);
 assert.doesNotMatch(text,/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|CALL|DO|COPY|SET)\b/i);
 assert.equal(text.split(';').length,2,'one SELECT statement only');
 const ts=require('typescript'),vm=require('node:vm'),box={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(A.root+'/lib/visual-assets.ts','utf8'),{compilerOptions:{module:1,target:9}}).outputText,box);
 const before=JSON.parse(sql(A.snapshot())),result=gate(diagnostic);
 assert.equal(result.owner_context,true);assert.equal(result.business_rpc_executed,false);assert.equal(result.production_mutation,false);
 assert.equal(result.assets.length,8);assert.equal(result.overlay_ready_required_by_094,false);
 for(const [i,row] of result.assets.entries()){
  assert.equal(row.artwork_key,A.keys[i]);assert.equal(row.displayed_code,box.exports.visualAssetCode(A.keys[i]));
  assert.equal(row.identity_matches_094,true);assert.equal(row.usable,true);assert.deepEqual(row.usability_reasons,[]);
  // Fixture UUIDs intentionally differ from codes: reads must use the persisted key.
  assert.notEqual(box.exports.automaticVisualMetadata(id(20+i)).artwork_key,row.artwork_key);
 }
 const failures=[
  ["update visual_assets set status='draft'",'STATUS_NOT_ACTIVE:draft'],
  ["update visual_assets set status='retired'",'STATUS_NOT_ACTIVE:retired'],
  ["update visual_assets set status='retired',delete_pending=true",'DELETE_PENDING'],
  ["update visual_assets set asset_type='banner'",'ASSET_TYPE_NOT_JOURNEY_COMPATIBLE'],
  ["update visual_assets set scope='case'",'SCOPE_NOT_ADVISORY_COMPATIBLE'],
  ['delete from storage.objects','MASTER_OBJECT_METADATA_MISSING'],
  ["update storage.buckets set public=true",'PRIVATE_BUCKET_MISSING_OR_PUBLIC'],
  ['delete from visual_assets','ASSET_NOT_FOUND_BY_UI_CODE']
 ];
 for(const [change,reason] of failures){
  const rows=JSON.parse(sql('begin;'+change+';'+diagnostic+'rollback;')).assets;
  assert.equal(rows.length,8);assert.ok(rows.every(r=>!r.usable&&r.usability_reasons.includes(reason)),reason);
 }
 // Same UUID with a different persisted key cannot be accidentally matched by UUID prefix.
 const changed=JSON.parse(sql("begin;update visual_assets set artwork_key='unrelated-key' where artwork_key="+A.q(A.keys[0])+';'+diagnostic+'rollback;'));
 assert.equal(changed.assets[0].artwork_key,null);assert.deepEqual(changed.assets[0].usability_reasons,['ASSET_NOT_FOUND_BY_UI_CODE']);
 assert.deepEqual(JSON.parse(sql(A.snapshot())),before);
});
