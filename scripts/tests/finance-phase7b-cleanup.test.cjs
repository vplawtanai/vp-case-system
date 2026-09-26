const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/finance/PHASE7B_CLEANUP_MANIFEST.json')));
const files=Object.fromEntries(['preflight','dryrun','apply','verify'].map(g=>[g,fs.readFileSync(path.join(root,`scripts/sql/${g}_finance_phase7b_cleanup.sql`),'utf8')]));
const sha=s=>createHash('sha256').update(s).digest('hex');
const strip=s=>s.replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''");
// User-returned PASS Gate 1 evidence. Never replace these with a local fixture baseline.
const productionApproval={
 manifest:'a60f80f6436d0cd7fcad2944f5e859775011648d44d2415f9d980a2def107e1b',
 state:'48cae7e4af2a1144ae2de9c0c6fb3a6851757b87ed7b6a48ff38d570b19e989b',
 keep:'ae1724585c19d6b207476e1cbd3b3b8b6e878c19b219eb052c77211f196a5bd0',
 catalog:'b7185e5e607218112b85a54ea005df2bfb84550c6a809ad626acc27265af2293',
 sequences:'f45149c3e1a98d9301f26907badbaad3d26a84f5d10aa3538dac281bb7834ded',
};

test('approved Production pins reproduce exact static gates without changing Preflight or manifest',()=>{
 assert.equal(manifest.manifest_sha256,productionApproval.manifest);
 const output=fs.mkdtempSync('/private/tmp/phase7b-binding-reproduction-');
 const args=Object.entries(productionApproval).filter(([key])=>key!=='manifest').flatMap(([key,value])=>['--'+key,value]);
 execFileSync('python3',[path.join(__dirname,'finance-phase7b-artifacts.py'),...args],{cwd:root,env:{PATH:process.env.PATH,VP7B_ARTIFACT_OUTPUT:output}});
 for(const g of ['preflight','dryrun','apply','verify']){
  assert.equal(fs.readFileSync(path.join(output,`scripts/sql/${g}_finance_phase7b_cleanup.sql`),'utf8'),files[g]);
  if(g==='preflight')continue;
  assert.doesNotMatch(files[g],/PREFLIGHT_PASS_REQUIRED/);
  for(const hash of Object.values(productionApproval))assert.ok(files[g].includes(hash),g+' missing '+hash);
 }
 assert.deepEqual(fs.readFileSync(path.join(output,'docs/finance/PHASE7B_CLEANUP_MANIFEST.json')),fs.readFileSync(path.join(root,'docs/finance/PHASE7B_CLEANUP_MANIFEST.json')));
});

test('full Phase7A descendant scope plus decided UAT masters; hard KEEP never a delete selector',()=>{
 const a=JSON.parse(fs.readFileSync(path.join(root,'docs/finance/PHASE7A_DATA_CLASSIFICATION.json')));
 const expected=a.tables.filter(t=>['NEW_FINANCE_UAT_PURGE','DERIVED_PURGE_WITH_PARENT'].includes(t.classification)).map(t=>t.table);
 for(const t of expected)assert.ok(manifest.purge_all_rows.includes(t),t);
 assert.equal(manifest.purge_all_rows.length,91);
 for(const t of [...manifest.legacy_keep,'clients','cases','advisory_matters','user_profiles','finance_bank_accounts','finance_bank_account_access','document_numbering_profiles','finance_cash_locations']){
  assert.ok(!manifest.purge_all_rows.includes(t));assert.ok(!Object.hasOwn(manifest.partial_delete_predicates,t));
 }
 assert.deepEqual(Object.keys(manifest.partial_delete_predicates).sort(),['case_audit_logs','finance_document_counters']);
 assert.equal(manifest.generator_sha256,sha(fs.readFileSync(path.join(__dirname,'finance-phase7b-artifacts.py'))));
});
test('read gates SELECT only; write gates pinned, atomic and never weaken FK/security permanently',()=>{
 for(const g of ['preflight','verify']){
  const s=strip(files[g]);assert.match(s,/^\s*WITH\b/);assert.equal((s.match(/;/g)||[]).length,1);
  assert.doesNotMatch(s,/\b(insert|update|delete|truncate|alter|create|drop|call|execute|nextval|setval|set_config)\b/i);
  assert.doesNotMatch(s,/public\.\w+\s*\(/); // catalog builtin queries only; no app RPCs
 }
 for(const g of ['dryrun','apply']){
  assert.doesNotMatch(files[g],/PREFLIGHT_PASS_REQUIRED/);assert.match(files[g],/APPROVED_PREFLIGHT_STALE_RE_RUN_GATE_1/);
  assert.match(files[g],/KEEP_ROWS_CHANGED/);assert.match(files[g],/SCHEMA_SECURITY_TRIGGER_CHANGE/);assert.match(files[g],/SEQUENCES_CHANGED/);
  assert.doesNotMatch(files[g],/session_replication_role|DISABLE TRIGGER ALL|DROP CONSTRAINT|ALTER CONSTRAINT|TRUNCATE\s+(?:TABLE|public)/i);
  assert.match(files[g],/NOT t.tgisinternal/);assert.match(files[g],/SET CONSTRAINTS ALL IMMEDIATE/);
  assert.match(files[g],/EXCEPTION WHEN OTHERS THEN failure/);
  assert.ok(Buffer.byteLength(files[g])<100000);
 }
 assert.match(files.dryrun,/ROLLBACK;\s*EXECUTE phase7b_dryrun_result;/);
 assert.doesNotMatch(strip(files.dryrun),/\bCOMMIT\s*;/i);
 assert.match(files.apply,/COMMIT;\s*EXECUTE phase7b_apply_result;/);
 for(const t of manifest.legacy_keep)assert.doesNotMatch(files.apply,new RegExp(`(?:DELETE FROM|UPDATE) public\\.${t}\\b`,'i'));
});

// Only a disposable local Unix-socket fixture. No connection URLs, .env, Production calls or credentials.
test('independent local PostgreSQL: full captured FK graph, cycle deletion, rollback, apply, stale/failure guards', {skip:process.env.PHASE7B_LOCAL_FIXTURE!=='1'},()=>{
 const bin='/Applications/Postgres.app/Contents/Versions/18/bin/psql',db=`vp_phase7b_fixture_${process.pid}`;
 const args=['-X','-h','/private/tmp/vp-phase7a-local/socket','-p','58477','-U','postgres','-v','ON_ERROR_STOP=1','-qAt'];
 const run=(sql,database=db)=>execFileSync(bin,[...args,'-d',database],{input:sql,encoding:'utf8',env:{PATH:process.env.PATH},maxBuffer:30*1024*1024}).trim();
 const output=path.join('/private/tmp',db);fs.mkdirSync(output,{recursive:true});
 run(`CREATE DATABASE ${db};`,'postgres');
 const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/finance-phase7b-fk-fixture.json'))).tables;
 const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
 let setup='CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text); CREATE TABLE storage.objects(id text,bucket_id text,name text);';
 // Extra core families outside the Finance manifest must be frozen/preserved too.
 setup+='CREATE TABLE public.parties(id text); CREATE TABLE public.case_work_logs(id text);';
 for(const [t,f] of Object.entries(fx))setup+=`CREATE TABLE public.${t}(${f.columns.map(c=>`"${c}" text`).join(',')});\n`;
 for(const [t,f] of Object.entries(fx))for(const c of f.constraints.filter(c=>!c.definition.startsWith('FOREIGN KEY')))setup+=`ALTER TABLE public.${t} ADD CONSTRAINT "${c.name}" ${c.definition};\n`;
 // Non-null fixture identifiers are synthetic. Preserve-only rows never point into UAT.
 const targets=new Set([...manifest.purge_all_rows,...Object.keys(manifest.partial_delete_predicates)]);
 for(const [t,f] of Object.entries(fx)){
  const row=Object.fromEntries(f.columns.map(c=>[c,'x']));
  if(!targets.has(t))for(const c of f.constraints.filter(c=>c.definition.startsWith('FOREIGN KEY'))){
   const m=/FOREIGN KEY \(([^)]+)\) REFERENCES (?:public\.)?(\w+)/.exec(c.definition);
   if(targets.has(m[2]))for(const k of m[1].split(','))row[k.trim()]=null;
  }
  if(t==='finance_document_counters'){row.doc_type='QT';row.year='2026';row.month='9';row.last_no='9';}
  if(t==='case_audit_logs'){row.table_name='finance_expenses';row.record_id='x';}
  if(manifest.legacy_keep.includes(t))for(const k of ['source_payment_id','payment_id','source_invoice_id','invoice_id','payee_id','supplier_payee_id','destination_id'])if(k in row)row[k]=null;
  setup+=`INSERT INTO public.${t}(${Object.keys(row).map(c=>`"${c}"`).join(',')}) VALUES(${Object.values(row).map(v=>v===null?'NULL':quote(v)).join(',')});\n`;
 }
 for(const [t,f] of Object.entries(fx))for(const c of f.constraints.filter(c=>c.definition.startsWith('FOREIGN KEY')))setup+=`ALTER TABLE public.${t} ADD CONSTRAINT "${c.name}" ${c.definition};\n`;
 setup+="INSERT INTO parties VALUES('real');INSERT INTO case_work_logs VALUES('real');INSERT INTO storage.buckets VALUES('vp-document-assets');INSERT INTO storage.objects VALUES('real','vp-document-assets','logo.png');";
 setup+="INSERT INTO case_audit_logs(id,table_name,record_id) VALUES('keep','finance_expense_claims','x'); INSERT INTO finance_document_counters(doc_type,year,month,prefix,last_no) VALUES('legal_report','2026','9','VP-LR','5');";
 // These guards must not be dropped, globally bypassed or left disabled.
 setup+="CREATE FUNCTION public.fixture_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_FIXTURE'; END $$;";
 for(const t of targets)setup+=`CREATE TRIGGER immutable_fixture BEFORE DELETE ON public.${t} FOR EACH ROW EXECUTE FUNCTION public.fixture_no_delete();\n`;
 setup+='ALTER TABLE finance_payee_audit ENABLE ALWAYS TRIGGER immutable_fixture;ALTER TABLE finance_payees ENABLE REPLICA TRIGGER immutable_fixture;ALTER TABLE finance_payee_destinations DISABLE TRIGGER immutable_fixture;';
 run(setup);
 const read=()=>JSON.parse(run('BEGIN READ ONLY;\n'+files.preflight+'\nROLLBACK;'));
 let pre=read();assert.equal(pre.gate_pass,true,JSON.stringify(pre.failed_checks));assert.equal(pre.purge_counts.length,93);
 const approved=()=>{
  execFileSync('python3',[path.join(__dirname,'finance-phase7b-artifacts.py'),'--state',pre.state_sha256,'--keep',pre.preserved_rows_sha256,'--catalog',pre.catalog_sha256,'--sequences',pre.sequences_sha256],{cwd:root,env:{PATH:process.env.PATH,VP7B_ARTIFACT_OUTPUT:output}});
  return Object.fromEntries(['dryrun','apply','verify'].map(g=>[g,fs.readFileSync(path.join(output,`scripts/sql/${g}_finance_phase7b_cleanup.sql`),'utf8')]));
 };
 let local=approved();
 // Production-pinned files must reject this unrelated local state, without accepting it as Production.
 const productionPinsRejected=JSON.parse(run(files.apply));assert.equal(productionPinsRejected.gate_pass,false);assert.match(productionPinsRejected.failed_checks.join(),/STALE/);
 let unbound=files.apply;
 for(const [key,hash] of Object.entries(productionApproval))if(key!=='manifest')unbound=unbound.replaceAll(hash,'PREFLIGHT_PASS_REQUIRED');
 const blocked=JSON.parse(run(unbound));assert.equal(blocked.gate_pass,false);assert.match(blocked.failed_checks.join(),/PREFLIGHT_PASS_HASHES_REQUIRED/);
 assert.equal(read().state_sha256,pre.state_sha256);
 const dry=JSON.parse(run(local.dryrun));assert.equal(dry.gate_pass,true,JSON.stringify(dry));assert.equal(dry.rollback_verified,true);assert.equal(dry.legacy_unchanged,true);assert.equal(dry.production_changes_committed,false);assert.deepEqual(dry.failed_checks,[]);assert.equal(read().state_sha256,pre.state_sha256);assert.deepEqual(read().legacy_keep,pre.legacy_keep);
 // Inject a failure AFTER real synthetic deletes; every row and original trigger mode must roll back.
 const failAfterDelete=s=>s.replace("IF EXISTS(SELECT 1 FROM jsonb_array_elements(after_state->'purge_counts') x WHERE (x->>'rows')::bigint<>0)", 'IF true');
 const failedApply=JSON.parse(run(failAfterDelete(local.apply)));assert.equal(failedApply.gate_pass,false);assert.match(failedApply.failed_checks.join(),/UAT_ROWS_REMAIN/);assert.equal(read().state_sha256,pre.state_sha256);
 const failedDry=JSON.parse(run(failAfterDelete(local.dryrun)));assert.equal(failedDry.gate_pass,false);assert.equal(failedDry.rollback_verified,true);assert.equal(read().state_sha256,pre.state_sha256);
 // Real Legacy statuses/outstanding values may exist: no obligation-zero gate.
 assert.equal(pre.legacy_outstanding_is_not_a_cleanup_blocker,true);
 // New shared data after approval must stop apply without deleting anything.
 run("INSERT INTO parties VALUES('new real');");
 const staleState=read().state_sha256;
 const staleDry=JSON.parse(run(local.dryrun));assert.equal(staleDry.gate_pass,false);assert.equal(staleDry.rollback_verified,false);assert.match(staleDry.failed_checks.join(),/STALE/);assert.equal(staleDry.production_changes_committed,false);assert.equal(read().state_sha256,staleState);
 const stale=JSON.parse(run(local.apply));assert.equal(stale.gate_pass,false);assert.match(stale.failed_checks.join(),/STALE/);
 const stable=read();assert.equal(stable.purge_counts.find(t=>t.table==='finance_expenses').rows,1);
 // A genuine retained reference to a UAT parent must block all deletion.
 run('ALTER TABLE parties ADD COLUMN invoice_id text REFERENCES finance_invoices(id); UPDATE parties SET invoice_id=\'x\' WHERE id=\'real\';');
 const bad=read();assert.equal(bad.gate_pass,false);assert.ok(bad.failed_checks.includes('retained_fk_dependents_zero'));
 run('ALTER TABLE parties DROP COLUMN invoice_id;');
 pre=read();local=approved();
 // Force an execution error mid-delete using a still-active FK with RESTRICT from outside the locked public scope.
 run("CREATE SCHEMA fixture_other;CREATE TABLE fixture_other.block(id text REFERENCES finance_invoices(id) ON DELETE RESTRICT);INSERT INTO fixture_other.block VALUES('x');");
 assert.equal(read().gate_pass,false,'external-schema retained FK must be discovered');
 run('DROP SCHEMA fixture_other CASCADE;');
 pre=read();local=approved();
 const applied=JSON.parse(run(local.apply));assert.equal(applied.gate_pass,true,JSON.stringify(applied));
 const post=JSON.parse(run('BEGIN READ ONLY;\n'+local.verify+'\nROLLBACK;'));assert.equal(post.gate_pass,true,JSON.stringify(post));assert.equal(post.historical_rows_unchanged,true);
 assert.ok(post.purge_counts.every(t=>t.rows===0));assert.deepEqual(post.legacy_keep,pre.legacy_keep);
 assert.equal(run('SELECT count(*) FROM parties;'),'2');assert.equal(run('SELECT count(*) FROM case_audit_logs;'),'1');assert.equal(run('SELECT doc_type FROM finance_document_counters;'),'legal_report');
 // An unapproved repeat must not allocate a number or accidentally report stale success.
 const repeat=JSON.parse(run(local.apply));assert.equal(repeat.gate_pass,false);assert.match(repeat.failed_checks.join(),/STALE/);
 const tampered=JSON.parse(run("BEGIN; INSERT INTO parties VALUES('tampered');\n"+local.verify+'\nROLLBACK;'));assert.equal(tampered.gate_pass,false);assert.ok(tampered.failed_checks.includes('legacy_shared_config_unchanged'));
 console.log('Fixture FK edges:',Object.values(fx).flatMap(f=>f.constraints).filter(c=>c.definition.startsWith('FOREIGN KEY')).length);
});

test('unchanged repository numbering functions restart approved Finance types at 1; non-Finance counters remain', {skip:process.env.PHASE7B_LOCAL_FIXTURE!=='1'},()=>{
 const bin='/Applications/Postgres.app/Contents/Versions/18/bin/psql',db=`vp_phase7b_numbers_${process.pid}`;
 const args=['-X','-h','/private/tmp/vp-phase7a-local/socket','-p','58477','-U','postgres','-v','ON_ERROR_STOP=1','-qAt'];
 const run=(sql,database=db)=>execFileSync(bin,[...args,'-d',database],{input:sql,encoding:'utf8',env:{PATH:process.env.PATH},maxBuffer:1024*1024}).trim();
 run(`CREATE DATABASE ${db};`,'postgres');
 const sql040=fs.readFileSync(path.join(root,'supabase/migrations/202607180040_add_combined_receipt_tax_invoice.sql'),'utf8');
 const sql043=fs.readFileSync(path.join(root,'supabase/migrations/202607180043_add_tax_document_correction_foundation.sql'),'utf8');
 const general=sql040.match(/create or replace function public\.generate_finance_document_no\([\s\S]*?\$\$;/)[0];
 const correction=sql043.match(/create function public\.tax_correction_number\([\s\S]*?\$number\$;/)[0];
 let setup=`CREATE TABLE finance_document_counters(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,doc_type text,year integer,month integer,prefix text,last_no integer,updated_at timestamptz);
 CREATE UNIQUE INDEX counter_key ON finance_document_counters(doc_type,year,(coalesce(month,0)));
 CREATE TABLE document_numbering_profiles(document_type text PRIMARY KEY,display_prefix text,period_scope text,sequence_width integer,is_active boolean);
 CREATE TABLE finance_company_profiles(id text PRIMARY KEY,quotation_prefix text);
 INSERT INTO finance_company_profiles VALUES('default','VP-QT');`;
 for(const fn of ['current_user_can_issue_combined_documents','current_user_can_issue_finance_tax_invoices','current_user_can_issue_finance_receipts','current_user_can_manage_finance_quotations'])setup+=`CREATE FUNCTION ${fn}() RETURNS boolean LANGUAGE sql AS $$ SELECT true; $$;`;
 for(const [type,prefix,scope] of [['fee_agreement','VP-AG','annual'],['invoice','VP-IV','monthly'],['receipt','VP-RC','monthly'],['tax_invoice','VP-TI','monthly'],['receipt_tax_invoice','VP-RTI','monthly'],['credit_note','VP-CN','monthly'],['debit_note','VP-DN','monthly']])setup+=`INSERT INTO document_numbering_profiles VALUES('${type}','${prefix}','${scope}',6,true);`;
 run(setup+general+correction);
 for(const type of manifest.finance_counter_types){
  const fn=['credit_note','debit_note'].includes(type)?'tax_correction_number':'generate_finance_document_no';
  assert.match(run(`SELECT ${fn}('${type}','2026-09-26');`),/0001$/);
  assert.match(run(`SELECT ${fn}('${type}','2026-09-26');`),/0002$/);
 }
 run("INSERT INTO finance_document_counters(doc_type,year,month,prefix,last_no) VALUES('legal_report',2026,null,'VP-LR',77);");
 run('DELETE FROM finance_document_counters WHERE doc_type IN('+manifest.finance_counter_types.map(t=>`'${t}'`).join(',')+');');
 for(const type of manifest.finance_counter_types){
  const fn=['credit_note','debit_note'].includes(type)?'tax_correction_number':'generate_finance_document_no';
  assert.match(run(`SELECT ${fn}('${type}','2026-09-26');`),/0001$/);
 }
 assert.equal(run("SELECT last_no FROM finance_document_counters WHERE doc_type='legal_report';"),'77');
 assert.equal(run("SELECT month IS NULL FROM finance_document_counters WHERE doc_type='fee_agreement';"),'t');
});
