/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable in-memory PostgreSQL. No network/Production credentials or transactions.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto');
const prior=require('./employee-reimbursement-postgres.test.cjs'),company=require('./company-review-modal-postgres.test.cjs'),requests=require('./expense-request-postgres.test.cjs'),expense=require('./expense-foundation-postgres.test.cjs');
const {db,query,scalar,rpc,migration,rejects,asActor,ids}=require('./receipt-foundation.test.cjs');
const moneyTables=['finance_expenses','finance_expense_requests','finance_expense_request_items','finance_expense_claims','finance_payees','finance_expense_obligations','finance_expense_settlements','finance_payouts','finance_payout_allocations','finance_cash_transactions','finance_outgoing_wht_obligations','finance_tax_remittances'];
const hash=async tables=>Object.fromEntries(await Promise.all(tables.map(async t=>[t,await scalar("select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) from "+t+' t')])));
const setup=async()=>{await prior.setup();for(const n of ['62','63','64'])await db.exec(migration(n));};
const month=()=>scalar("select tax_filing_monthly_facts('2026-09-01')"),queue=()=>scalar("select get_finance_tax_input_evidence('2026-09-01')"),pool=()=>scalar("select tax_filing_pool('2026-09-01','vat')");
const external=(extra={})=>({vendor:'Synthetic external',invoice_date:'2026-09-10',invoice_number:randomUUID(),tax_base:10000,vat_amount:700,note:'Third party paid; no reimbursement',funding_source:'third_party_no_reimbursement',...extra});
async function purchase(extra={}){const choices=company.choices({wht_state:'none',wht_rate:0,...extra});const doc=await requests.save(requests.items([300],{personally_paid:false,reimbursement_requested:0,company_request_version:1,creator_payment_fact:'unpaid',creator_tax:choices,supplier_payee_id:null,vendor_name:'Synthetic Big C'}),'company_expense_batch');await rpc('submit_finance_expense_request',[doc.id,1]);const e=(await requests.read(doc.id)).items[0];await company.approve(e,choices);return e;}
async function claims(extra={}){const doc=await requests.save(requests.items([500,300,500],extra));await rpc('submit_finance_expense_request',[doc.id,1]);const rows=(await requests.read(doc.id)).items;for(const e of rows)await rpc('review_finance_employee_reimbursement',[randomUUID(),e.id,e.version,true,e.gross_amount,'']);return rows;}
async function sync(kind,id){return scalar('select tax_position_sync($1,$2,$3)',[kind,id,'Explicit local reconciliation of authoritative VAT']);}
const funcs=()=>query("select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,pg_get_userbyid(proowner) owner,proacl::text acl from pg_proc p where pronamespace='public'::regnamespace order by 1");

test('065 existing Big C / no-VAT claims / external evidence reconcile on read, history unchanged, ledger reconciliation idempotent',async()=>{
 await setup();const c=await purchase(),rows=await claims(),ex=randomUUID(),input=external();
 await rpc('save_finance_external_input_vat',[ex,input,true]);const review=randomUUID();await rpc('review_finance_external_input_vat',[review,ex,null,'eligible','Existing accepted invoice',true]);
 assert.equal((await queue()).expenses.filter(e=>e.status==='pending').length,4);
 const oldExternal=await scalar("select tax_position_source('external_input_vat',$1)",[ex]);
 const tables=[...moneyTables,'finance_expense_tax_reviews','finance_expense_audit','finance_external_input_vat','finance_external_input_vat_reviews','finance_tax_source_revisions','finance_tax_position_facts','finance_tax_periods','finance_tax_position_audit','finance_tax_filings','finance_tax_filing_audit'];
 const before=await hash(tables),beforeFunctions=await funcs();
 await db.exec(migration('65'));
 assert.deepEqual(await hash(tables),before,'Migration and projection perform no historical writes');
 const q=await queue();assert.equal(q.expenses.length,1);assert.equal(q.expenses[0].id,c.id);assert.equal(q.expenses[0].status,'eligible');assert.equal(q.external[0].status,'eligible');
 const m=await month();assert.deepEqual([m.input_vat,m.input_vat_complete,m.net_vat],[719.63,true,-19.63]);
 assert.equal(m.input_sources.length,2);assert.deepEqual(m.unresolved_input_sources,[]);
 for(const e of rows){assert.deepEqual((await scalar("select tax_position_source('expense',$1)",[e.id])).lines,[]);assert.equal(await sync('expense',e.id),null);}
 assert.deepEqual(await scalar("select tax_position_source('external_input_vat',$1)",[ex]),oldExternal,'Previously eligible source fingerprints remain identical');
 const revBefore=await scalar('select count(*)::int from finance_tax_source_revisions');await sync('external_input_vat',ex);assert.equal(await scalar('select count(*)::int from finance_tax_source_revisions'),revBefore);
 const r=await sync('expense',c.id);assert.equal(await sync('expense',c.id),r);assert.equal(await scalar("select count(*)::int from finance_tax_source_revisions where source_type='expense' and source_id=$1",[c.id]),1);
 assert.deepEqual(await month(),m,'Materializing a source never double-counts its projection');
 assert.deepEqual(await hash(moneyTables),Object.fromEntries(moneyTables.map(t=>[t,before[t]])));
 const afterFunctions=await funcs();const changed=beforeFunctions.filter(f=>afterFunctions.find(n=>n.signature===f.signature).definition!==f.definition).map(f=>f.signature);
 assert.deepEqual(changed.sort(),['get_finance_tax_input_evidence(date)','save_finance_external_input_vat(uuid,jsonb,boolean)','tax_filing_assert(uuid)','tax_filing_monthly_facts(date)','tax_filing_pool(date,text)','tax_position_source(text,uuid)'].sort());
 for(const f of beforeFunctions){const after=afterFunctions.find(n=>n.signature===f.signature);assert.equal(after.owner,f.owner);assert.equal(after.acl,f.acl);}
 assert.equal(createHash('sha256').update(migration('64')).digest('hex'),'6f5e5d1d97d3fbca03f6866038437fe355e5e4e2f4c15051aad029953828a85e');
});

test('065 new source VAT auto-includes, no-VAT ignored, external save is atomic/idempotent, exceptions append audit without money effects',async()=>{
 await setup();await db.exec(migration('65'));const c=await purchase();
 let m=await month();assert.equal(m.input_vat,19.63);assert.equal(m.input_vat_complete,true);
 assert.equal(await scalar("select count(*)::int from finance_tax_position_facts where tax_kind='input_vat'"),1);
 await purchase({vat_mode:'none'});const rows=await claims();assert.equal((await queue()).expenses.length,1);
 // Explicit authoritative claim VAT is consumed; no category/gross inference.
 const vat=expense.tax({vat_state:'exists',vat_base:467.29,vat_rate:7,eligibility:'pending',wht_state:'pending'});
 await rpc('review_finance_expense_tax',[randomUUID(),rows[0].id,null,vat]);assert.equal((await month()).input_vat,52.34);
 const before=await hash(moneyTables),id=randomUUID(),input=external();
 await asActor(ids.staff,()=>rejects('select save_finance_external_input_vat($1,$2,true)',[id,input],/PERMISSION_DENIED/));
 await rejects('select save_finance_external_input_vat($1,$2,false)',[id,input],/INPUT_INVALID/);
 await rpc('save_finance_external_input_vat',[id,input,true]);await rpc('save_finance_external_input_vat',[id,input,true]);
 assert.equal((await queue()).external[0].status,'eligible');assert.equal((await queue()).external[0].review,null);
 assert.equal((await month()).input_vat,752.34);
 assert.equal(await scalar('select count(*)::int from finance_external_input_vat_reviews'),0,'Normal save creates no review/approval');
 assert.equal(await scalar("select count(*)::int from finance_tax_source_revisions where source_id=$1",[id]),1);
 await rejects('select save_finance_external_input_vat($1,$2,true)',[id,{...input,vat_amount:701}],/IDEMPOTENCY/);
 await rejects('select save_finance_external_input_vat($1,$2,true)',[randomUUID(),input],/unique/);
 const revision=randomUUID();await rpc('review_finance_external_input_vat',[revision,id,null,'ineligible','Duplicate/non-creditable evidence',true]);await rpc('review_finance_external_input_vat',[revision,id,null,'ineligible','Duplicate/non-creditable evidence',true]);
 assert.equal((await month()).input_vat,52.34);assert.equal((await month()).input_vat_complete,true);
 await rpc('review_finance_external_input_vat',[randomUUID(),id,revision,'eligible','Correction verified',true]);assert.equal((await month()).input_vat,752.34);
 assert.equal(await scalar('select count(*)::int from finance_external_input_vat_reviews'),2);assert.equal(await scalar('select count(*)::int from finance_tax_source_revisions where source_id=$1',[id]),3);
 const latest=(await scalar('select get_finance_expenses($1)',[c.id])).record.tax_review;
 await rpc('review_finance_expense_tax',[randomUUID(),c.id,latest.id,{...latest.request_json.raw_input,eligibility:'ineligible',reason:'Exclude unusable invoice'}]);assert.equal((await month()).input_vat,732.71);
 assert.deepEqual(await hash(moneyTables),before);
 // Atomic failure after document insert must roll back both evidence and tax fact.
 await db.exec("create function fail065() returns trigger language plpgsql as $$begin raise exception 'FIXTURE_FAILURE';end$$;create trigger fail065 before insert on finance_tax_position_facts for each row execute function fail065();");
 const bad=randomUUID();await rejects('select save_finance_external_input_vat($1,$2,true)',[bad,external()],/FIXTURE_FAILURE/);
 assert.equal(await scalar('select count(*)::int from finance_external_input_vat where id=$1',[bad]),0);
});

test('065 only explicit ambiguous VAT blocks completeness; historical filings and WHT remain unchanged; new snapshots freeze signed net',async()=>{
 await setup();const oldPool=await pool(),oldId=randomUUID();await rpc('create_finance_tax_filing',[oldId,'2026-09-01','vat',await scalar("select md5(tax_filing_pool('2026-09-01','vat')::text)"),null,null]);
 const old=await scalar('select to_jsonb(f) from finance_tax_filings f where id=$1',[oldId]);
 const wht=await Promise.all(['wht_natural','wht_juristic'].map(t=>scalar("select tax_filing_pool('2026-09-01',$1)",[t])));
 await db.exec(migration('65'));await scalar('select tax_filing_assert($1)',[oldId]);assert.deepEqual(await scalar('select to_jsonb(f) from finance_tax_filings f where id=$1',[oldId]),old);assert.equal(oldPool.ready,false);
 assert.deepEqual(await Promise.all(['wht_natural','wht_juristic'].map(t=>scalar("select tax_filing_pool('2026-09-01',$1)",[t]))),wht);
 const rows=await claims({vat_awareness:'yes'});assert.equal((await queue()).expenses.filter(e=>e.status==='pending').length,3);assert.equal((await pool()).ready,false);
 for(const e of rows)await rpc('review_finance_expense_tax',[randomUUID(),e.id,null,expense.tax({vat_state:'none',eligibility:'ineligible',wht_state:'pending'})]);
 assert.equal((await month()).input_vat_complete,true);assert.equal((await queue()).expenses.length,0);
 await rpc('transition_finance_tax_filing',[oldId,old.version,'cancelled',null,null,'Replace obsolete candidate draft',true]);
 const id=randomUUID();await rpc('save_finance_external_input_vat',[id,external({vat_amount:800}),true]);const p=await pool();assert.deepEqual([p.monthly_facts.net_vat,p.tax_amount,p.ready],[-100,0,true]);
 const filing=randomUUID();await rpc('create_finance_tax_filing',[filing,'2026-09-01','vat',await scalar("select md5(tax_filing_pool('2026-09-01','vat')::text)"),null,null]);await scalar('select tax_filing_assert($1)',[filing]);
 await rpc('transition_finance_tax_filing',[filing,1,'ready_for_review',null,null,null,true]);
 await rpc('transition_finance_tax_filing',[filing,2,'filed','2026-09-20','LOCAL-065','Local evidence',true]);await scalar('select tax_filing_assert($1)',[filing]);
 const frozen=await scalar('select to_jsonb(f) from finance_tax_filings f where id=$1',[filing]);
 await rpc('review_finance_external_input_vat',[randomUUID(),id,null,'ineligible','Later correction',true]);await scalar('select tax_filing_assert($1)',[filing]);
 assert.deepEqual(await scalar('select to_jsonb(f) from finance_tax_filings f where id=$1',[filing]),frozen,'Corrections do not rewrite filed snapshots');
 assert.equal((await scalar("select get_finance_tax_filings('2026-09-01')")).filings.find(f=>f.id===filing).source_changed,true);
});

test('065 explicit helper security, catalog preservation and complete local rollback; positive/zero/negative net',async()=>{
 await setup();await db.exec('alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated,service_role');
 const catalogSql="select c.oid::regclass::text name,pg_get_userbyid(c.relowner) owner,c.relacl::text acl,c.relrowsecurity rls,(select jsonb_agg(to_jsonb(p) order by p.polname) from pg_policy p where p.polrelid=c.oid) policies from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' order by 1";
 const catalog=await query(catalogSql),definitions=await funcs();await db.exec('savepoint candidate065');await db.exec(migration('65'));
 assert.deepEqual(await query(catalogSql),catalog,'No table owner, ACL, RLS or policy changes');
 for(const signature of ['tax_expense_input_vat_status(uuid)','tax_input_vat_evidence(date)']){
  for(const role of ['anon','authenticated'])assert.equal(await scalar('select has_function_privilege($1,$2,$3)',[role,signature,'EXECUTE']),false);
  assert.equal(await scalar('select has_function_privilege($1,$2,$3)',['service_role',signature,'EXECUTE']),true);
 }
 assert.deepEqual([(await month()).net_vat,(await pool()).tax_amount,(await pool()).ready],[700,700,true]);
 const e=randomUUID();await rpc('save_finance_external_input_vat',[e,external(),true]);assert.deepEqual([(await month()).net_vat,(await pool()).tax_amount],[0,0]);
 await rpc('save_finance_external_input_vat',[randomUUID(),external({vat_amount:19.63,tax_base:280.37}),true]);assert.deepEqual([(await month()).net_vat,(await pool()).tax_amount],[-19.63,0]);
 const facts=await scalar('select count(*)::int from finance_tax_position_facts');await month();await month();await queue();assert.equal(await scalar('select count(*)::int from finance_tax_position_facts'),facts,'Reads never materialize revisions');
 await db.exec('rollback to savepoint candidate065; release savepoint candidate065');assert.deepEqual(await query(catalogSql),catalog);assert.deepEqual(await funcs(),definitions);
 assert.equal(await scalar('select count(*)::int from finance_external_input_vat'),0);
});
