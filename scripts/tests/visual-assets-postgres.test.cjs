/* eslint-disable @typescript-eslint/no-require-imports */
// Private Unix socket, disposable PostgreSQL. NO project credentials/TCP/Production.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{spawnSync}=require('node:child_process'),A=require('./visual-assets-artifacts.cjs');
const bin='/Applications/Postgres.app/Contents/Versions/18/bin',id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
let dir,started=false,baseline,pins,contract;
function command(name,args,input){return spawnSync(bin+'/'+name,args,{input,encoding:'utf8',env:{PATH:process.env.PATH,LC_ALL:'C'},maxBuffer:16e6});}
function checked(name,args,input){const r=command(name,args,input);assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
function sql(s,fail=false){const args=['-X','-qAt','-v','ON_ERROR_STOP=1','-h',dir,'-p','58583','-U','postgres','-d','postgres'];return fail?command('psql',args,s):checked('psql',args,s);}
const auth=(n=1,role='authenticated')=>`set local role ${role};set local request.jwt.claim.sub='${id(n)}';set local request.jwt.claim.role='${role}';`;
const as=(s,n=1)=>sql('begin;'+auth(n)+s+';rollback;');
const denied=(s,n=2,pattern=/VISUAL_FORBIDDEN|permission denied/)=>{const r=sql('begin;'+auth(n)+s+';rollback;',true);assert.notEqual(r.status,0);assert.match(r.stderr,pattern);};
const call=(action,n=20,version=null,data={})=>`select public.visual_assets_write(${A.q(action)},'${id(n)}',${version===null?'null':version},${A.q(JSON.stringify(data))})`;
const metadata={artwork_key:'universal-map',name_th:'ภาพตัวอย่าง',name_en:'Example',asset_type:'journey',scope:'both',theme:'landscape',tags:['neutral'],status:'active',overlay_ready:true};
const payload=n=>({...metadata,master_path:`${id(1)}/${id(n)}/${id(90)}/master.webp`,thumbnail_path:`${id(1)}/${id(n)}/${id(90)}/thumbnail.webp`,width:2560,height:1440,byte_size:1000,thumbnail_bytes:200,sha256:'a'.repeat(64)});
const upload=n=>`insert into storage.objects(bucket_id,name) values('vp-visual-assets','${payload(n).master_path}'),('vp-visual-assets','${payload(n).thumbnail_path}');`;
function gate(s){return JSON.parse(sql('begin read only;'+s+'rollback;'));}
before(()=>{
 dir=fs.mkdtempSync('/private/tmp/vp-visual083-');fs.chmodSync(dir,0o700);
 checked('initdb',['-D',dir+'/data','-U','postgres','-A','trust','--encoding=UTF8','--locale=en_US.UTF-8']);
 checked('pg_ctl',['-D',dir+'/data','-l',dir+'/log','-o',`-F -k ${dir} -p 58583 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
 sql(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 create table user_profiles(id uuid primary key,role text,active boolean,must_change_password boolean not null default false);
 create function public.people_is_active_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.user_profiles where id=auth.uid() and active is true and role='admin'); $$;
 create table storage.buckets(id text primary key,name text unique,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
 alter table storage.objects enable row level security;grant all on storage.objects to anon,authenticated,service_role;grant select on storage.buckets to authenticated;
 create policy existing_wide_read on storage.objects for select to public using(true);
 create policy existing_wide_insert on storage.objects for insert to public with check(true);
 insert into storage.buckets values('other','other',false,null,null);insert into storage.objects(bucket_id,name) values('other','existing');
 insert into user_profiles values('${id(1)}','admin',true,false),('${id(2)}','partner',true,false),('${id(3)}','lawyer',true,false),('${id(4)}','staff',true,false),('${id(5)}','admin',false,false),('${id(6)}','admin',true,true);`);
 baseline=JSON.parse(sql(A.snapshot()));
 const pre=gate(A.preflightSql());assert.equal(pre.gate_pass,true,JSON.stringify(pre));pins={candidate_sha256:A.hash(fs.readFileSync(A.candidate)),rows_sha256:pre.rows_sha256,security_sha256:pre.security_sha256};
 const migration=fs.readFileSync(A.candidate,'utf8');sql(migration.replace(/COMMIT;\s*$/,'ROLLBACK;'));assert.deepEqual(JSON.parse(sql(A.snapshot())),baseline);
 sql(migration);contract=JSON.parse(sql(A.snapshot())).contract;
 if(process.env.VISUAL083_CAPTURE==='1'){fs.writeFileSync(A.contractPath,JSON.stringify({candidate_sha256:pins.candidate_sha256,contract},null,2)+'\n');A.generate();}
});
after(()=>{if(started)checked('pg_ctl',['-D',dir+'/data','-m','fast','-w','stop']);console.log('083 local evidence:',dir);});
test('exact new catalog, existing storage/profile preservation, candidate rollback and gate consistency',()=>{
 const current=JSON.parse(sql(A.snapshot()));assert.deepEqual(current.rows,baseline.rows);assert.deepEqual(current.security,baseline.security);
 assert.deepEqual(contract,JSON.parse(fs.readFileSync(A.contractPath)).contract);
 assert.equal(gate(A.verifierSql(pins)).gate_pass,true);assert.equal(gate(A.verifierSql()).gate_pass,false);
 assert.equal(fs.readFileSync(A.preflight,'utf8'),A.preflightSql());assert.equal(fs.readFileSync(A.verifier,'utf8'),A.verifierSql(JSON.parse(fs.readFileSync(A.pinsPath))));
});
// A PG17-shaped read-only catalog projection: table NOT NULL has no
// pg_constraint row, but pg_attribute.attnotnull is unchanged. No catalog edits.
const pg17Catalog=s=>s.replace('WITH funcs AS (',"WITH pg_constraint AS (SELECT * FROM pg_catalog.pg_constraint WHERE contype<>'n'), funcs AS (");
test('PG17/PG18 NOT NULL representation normalizes identically without changing other evidence',()=>{
 const raw18=JSON.parse(sql(A.snapshot())).contract,raw17=JSON.parse(sql(pg17Catalog(A.snapshot()))).contract;
 assert.equal(Object.values(raw18.tables).flatMap(t=>t.constraints).filter(([,d])=>d.startsWith('NOT NULL ')).length,28);
 assert.notDeepEqual(raw18,raw17,'The old verifier would reject the PG17 representation');
 const portable=A.portableTableContract(raw18);
 assert.deepEqual(portable,raw17);
 assert.deepEqual(portable,A.portableTableContract(raw17));
 for(const name of Object.keys(raw18.tables))assert.deepEqual(portable.tables[name].columns,raw18.tables[name].columns);
 assert.deepEqual(A.portableTableContract(portable),portable,'Normalization is idempotent');
 assert.equal(gate(A.verifierSql(pins)).gate_pass,true);
 assert.equal(gate(pg17Catalog(A.verifierSql(pins))).gate_pass,true);
});
test('portable verifier rejects real nullability, constraint and index drift',()=>{
 for(const change of [
  'alter table visual_assets alter column name_th drop not null',
  'alter table visual_assets alter column width drop not null',
  'alter table visual_asset_mappings alter column artwork_key drop not null',
  'alter table visual_assets drop constraint visual_assets_width_check',
  'alter table visual_asset_mappings drop constraint visual_asset_mappings_artwork_key_fkey',
  'alter table visual_assets drop constraint visual_assets_master_path_key',
 ])for(const query of [A.verifierSql(pins),pg17Catalog(A.verifierSql(pins))]){
  const result=JSON.parse(sql('begin;'+change+';'+query+'rollback;'));
  assert.equal(result.gate_pass,false,change);assert.ok(result.failed_checks.includes('applied_state_exact'),change);
 }
 // A PG18 NOT VALID NOT NULL is not merely a redundant catalog entry. Keep
 // it in the comparison even when attnotnull is true; fail closed on drift.
 const change='alter table visual_assets alter column name_th drop not null;alter table visual_assets add constraint visual_assets_name_th_not_null not null name_th not valid;';
 const result=JSON.parse(sql('begin;'+change+A.verifierSql(pins)+'rollback;'));
 assert.equal(result.gate_pass,false);assert.ok(result.failed_checks.includes('applied_state_exact'));
});
test('active Admin only: all other personas and raw registry writes denied',()=>{
 for(const n of [2,3,4,5,6]){denied(call('create',20,null,payload(20)),n);assert.equal(as('select count(*) from visual_assets',n),'0');}
 denied(`insert into visual_asset_mappings values('both','universal','x','${id(1)}',now())`,1);
 assert.notEqual(sql(`begin;set local role anon;${call('create',20,null,payload(20))};rollback;`,true).status,0);
});
test('scoped private Storage ceiling defeats old wide policies without changing another bucket',()=>{
 sql(upload(20));
 for(const n of [2,3,4,5,6])assert.equal(as("select count(*) from storage.objects where bucket_id='vp-visual-assets'",n),'0');
 assert.equal(as("select count(*) from storage.objects where bucket_id='vp-visual-assets'"),'2');
 for(const n of [1,2])denied("insert into storage.objects(bucket_id,name) values('vp-visual-assets','unsafe.svg')",n,/row-level security/);
 assert.equal(sql("begin;set local role anon;select count(*) from storage.objects where bucket_id='other';rollback;"),'1');
 assert.equal(as("select count(*) from storage.objects where bucket_id='other'",2),'1');
 sql("delete from storage.objects where bucket_id='vp-visual-assets'");
});
test('create metadata, immutable artwork key, optimistic edit, family mapping and protected retire/delete',()=>{
 sql(upload(20));sql('begin;'+auth()+call('create',20,null,payload(20))+';commit;');
 const asset=JSON.parse(as(call('edit',20,1,{...metadata,name_en:'Updated',artwork_key:'ignored-change'})));assert.equal(asset.artwork_key,metadata.artwork_key);assert.equal(asset.version,2);
 denied(call('edit',20,0,metadata),1,/VISUAL_CONFLICT/);
 sql('begin;'+auth()+call('map',20,null,{scope:'both',family_key:'universal',artwork_key:metadata.artwork_key,expected_key:null})+';commit;');
 denied(call('delete_begin',20,1),1,/VISUAL_IN_USE/);denied(call('edit',20,1,{...metadata,status:'retired'}),1,/VISUAL_IN_USE/);
 denied(call('map',20,null,{scope:'both',family_key:'universal',artwork_key:metadata.artwork_key,expected_key:null}),1,/VISUAL_CONFLICT/);
 sql('begin;'+auth()+call('unmap',20,null,{scope:'both',family_key:'universal',expected_key:metadata.artwork_key})+';commit;');
});
test('delete retry preserves pending registry until Storage cleanup; no dangling mappings',()=>{
 sql('begin;'+auth()+call('delete_begin',20,1)+';commit;');assert.equal(JSON.parse(as(call('delete_begin',20,2))).version,2);
 denied(call('delete_finish',20,2),1,/VISUAL_CLEANUP_REQUIRED/);
 denied(call('map',20,null,{scope:'both',family_key:'universal',artwork_key:metadata.artwork_key,expected_key:null}),1,/VISUAL_MAPPING_INVALID/);
 sql("delete from storage.objects where bucket_id='vp-visual-assets'");sql('begin;'+auth()+call('delete_finish',20,2)+';commit;');assert.equal(sql('select count(*) from visual_assets'),'0');
});
test('verifier fails closed on rows, permissions, function, table and bucket drift',()=>{
 for(const change of ["update user_profiles set active=false where role='partner'","grant insert on visual_assets to authenticated","alter table visual_assets disable row level security","alter function visual_assets_admin() security invoker","update storage.buckets set public=true where id='vp-visual-assets'","drop policy visual083_insert_ceiling on storage.objects"]){
  assert.equal(JSON.parse(sql('begin;'+change+';'+A.verifierSql(pins)+'rollback;')).gate_pass,false,change);
 }
 assert.equal(gate(A.verifierSql(pins)).gate_pass,true);
});
