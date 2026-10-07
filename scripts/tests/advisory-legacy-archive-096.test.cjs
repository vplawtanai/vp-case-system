/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const K=require('./advisory-legacy-archive-096-artifacts.cjs'),{H,A}=K;
test('immutable 095 candidate and accepted guard/read contracts are not regenerated',()=>{
 assert.equal(A.hash(fs.readFileSync(H.candidate,'utf8')),'411182e4bed6f1ca2b4505aa765a1ef7aa0774f22f00e0769e5dffd72cec63c7');
 assert.equal(fs.readFileSync(H.candidate,'utf8'),H.migration());
 const sql=K.migration();assert.doesNotMatch(sql.replace(/^\s*--.*$/gm,'').replace(/'(?:''|[^'])*'/g,"''"),/CREATE TABLE public|ALTER TABLE|DROP (TABLE|FUNCTION)|CREATE OR REPLACE FUNCTION|DISABLE TRIGGER|session_replication_role/i);
 assert.equal((sql.match(/CREATE FUNCTION public\.advisory096_/g)||[]).length,2);
 assert.match(sql,/ADVISORY096_ACCEPTED095_DRIFT/);assert.match(sql,/ADVISORY096_INSTALLED_CONTRACT_DRIFT/);
});
test('fixed 004..012 set only, no arbitrary target RPC parameter or historical updates',()=>{
 assert.deepEqual(K.numbers,Array.from({length:9},(_,i)=>'ADV-2026-'+String(i+4).padStart(3,'0')));
 const core=fs.readFileSync('scripts/sql/advisory_archive_096_contract.sql','utf8');
 assert.match(core,/p_request_id uuid,p_reason text,p_reviewed jsonb/);assert.match(core,/n<>9/);assert.match(core,/state->'targets' IS DISTINCT FROM p_reviewed->'targets'/);
 assert.doesNotMatch(core,/\b(UPDATE|DELETE FROM)\s+public\./i);assert.equal((core.match(/INSERT INTO public\./g)||[]).length,1);
 assert.match(core,/INSERT INTO public\.advisory_matter_archives/);assert.match(core,/advisory086_admin/);
});
test('all generated artifacts exact; gates each contain ONE SELECT with no mutation statements',()=>{
 const p=JSON.parse(fs.readFileSync(K.pinsPath));
 for(const [file,sql]of [[K.candidate,K.migration()],[K.preflight,K.gate(false)],[K.apply,K.applySql(p)],[K.verifier,K.gate(true,p)]])assert.equal(fs.readFileSync(file,'utf8'),sql,file);
 for(const sql of [K.gate(false),K.gate(true,p)]){const clean=sql.replace(/^--.*$/gm,'').replace(/'(?:''|[^'])*'/g,"''");assert.match(clean,/^\s*WITH /);assert.equal(clean.split(';').length,2);assert.doesNotMatch(clean,/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|CALL|DO|COPY|SET)\b/i);}
});
test('unreviewed Apply cannot run; reviewed UUIDs, hashes, actor and fresh request are mandatory',()=>{
 assert.match(K.applySql(),/ADVISORY096_HUMAN_BASELINE_AND_ACTOR_NOT_BOUND/);
 assert.throws(()=>K.validate({targets:H.reviewed.targets}));
 assert.throws(()=>K.validate({request_id:JSON.parse(fs.readFileSync(H.pinsPath)).request_id}));
 const sql=K.applySql();assert.equal((sql.match(/^BEGIN;/gm)||[]).length,1);assert.equal((sql.match(/^COMMIT;/gm)||[]).length,1);
 assert.ok(sql.indexOf('CREATE FUNCTION public.advisory096_archive_legacy')<sql.indexOf('SELECT public.advisory096_archive_legacy'));
 assert.match(sql,/SET LOCAL ROLE authenticated/);assert.doesNotMatch(sql.replace(/^\s*--.*$/gm,'').replace(/'(?:''|[^'])*'/g,"''"),/LIMIT 1|first.admin/i);
});
test('095 verifier explicitly retires its old protected-nine/count assertion after 096; never falsely passes',()=>{
 const old=H.gate(true,JSON.parse(fs.readFileSync(H.pinsPath)));
 assert.match(old,/SUPERSEDED_BY_096_USE_CURRENT_VERIFIER/);
 assert.match(old,/to_regprocedure\('public.advisory096_archive_legacy\(uuid,text,jsonb\)'\) IS NULL/);
 assert.match(K.gate(true),/accepted095_contract_preserved/);assert.match(K.gate(true),/prior_eleven_receipts_preserved/);assert.match(K.gate(true),/exact_twenty_archived/);
});
test('baseline binder refuses an unreviewed or wrong candidate without changing any artifact',()=>{
 const dir=fs.mkdtempSync('/private/tmp/vp096-bind-');const file=dir+'/rejected.json';fs.writeFileSync(file,JSON.stringify({gate_pass:false,failed_checks:['targets_exact']}));
 const before=fs.readFileSync(K.pinsPath,'utf8');
 const r=spawnSync(process.execPath,['scripts/tests/advisory-legacy-archive-096-artifacts.cjs','--bind',file,'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'],{encoding:'utf8'});
 assert.notEqual(r.status,0);assert.equal(fs.readFileSync(K.pinsPath,'utf8'),before);fs.rmSync(dir,{recursive:true});
});

test('096 preservation is scoped: no auth/shared whole-table fingerprints or locks',()=>{
 const snapshot=K.snapshot();
 assert.doesNotMatch(snapshot,/auth\.users|pg_auth_members|rolsuper|rolinherit|rolbypassrls|storage\.(objects|buckets)|n\.nspname='auth'/i);
 assert.doesNotMatch(snapshot,/advisory095_capture\(\)/);
 assert.match(snapshot,/c\.relname LIKE 'finance_%'/);assert.match(snapshot,/targets_and_history/);
 for(const table of K.scopedTables)assert.match(snapshot,new RegExp('public\\.'+table+'\\b'));
 const core=fs.readFileSync('scripts/sql/advisory_archive_096_contract.sql','utf8');
 assert.doesNotMatch(core,/auth\.users|storage\.|FROM pg_class/);
 assert.match(core,/user_profiles WHERE id=actor FOR SHARE/);
 assert.match(core,/advisory086_admin\(\)/);
});
