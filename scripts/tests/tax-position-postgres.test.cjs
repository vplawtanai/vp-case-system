/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic, in-memory PostgreSQL only. No credentials or network.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const treasury=require('./treasury-postgres.test.cjs'),direct=require('./direct-money-postgres.test.cjs'),prior=require('./vp-distribution-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
const flush=()=>db.exec('set constraints all immediate;set constraints all deferred');
async function setup(apply=true){await treasury.setup();if(apply)await db.exec(migration('50'));}
const state=()=>scalar('select get_finance_tax_position()');
const source=(type,id)=>scalar('select tax_position_source($1,$2)',[type,id]);
async function importSource(type,id){return rpc('materialize_finance_tax_source',[type,id,await source(type,id),true,'Reviewed historical tax evidence']);}
async function receipt(){const id=randomUUID();const input=direct.input();input.received_on='2026-09-01';await direct.save(id,input);await direct.transition(id,1,'confirm');await flush();return id;}

test('050 atomic Direct VAT 700 / WHT 300; monthly known totals, unknown net, no duplicated cash or documents',async()=>{
 await setup();const before=await prior.financialState();const id=await receipt(),s=await state();
 assert.equal(s.facts.length,2);assert.equal(s.periods[0].period_month,'2026-09-01');assert.equal(s.periods[0].known_output_vat,700);
 assert.equal(s.periods[0].input_vat_amount,null);assert.equal(s.periods[0].net_vat_amount,null);assert.equal(s.periods[0].input_vat_status,'incomplete');
 const wht=s.facts.find(f=>f.tax_kind==='incoming_wht');assert.equal(wht.tax_amount,300);assert.equal(wht.base_amount,10000);assert.equal(wht.rate_percent,3);
 assert.equal(wht.evidence_status,'awaiting_evidence');assert.equal(s.outgoing_workflow_available,false);
 const current=await source('direct_money_receipt',id);assert.equal(current.source_evidence.snapshot.actual_cash,10400);
 assert.deepEqual(await prior.financialState(),before);assert.equal(s.pending_sources.length,0);
});
test('050 historical imports are explicit, stale-safe, idempotent and never mutate current Treasury',async()=>{
 await setup(false);await treasury.opening();const id=await receipt();const p=await prior.source();await flush();const before=await prior.financialState();
 await db.exec(migration('50'));assert.deepEqual((await state()).facts,[]);
 const pending=(await state()).pending_sources;assert.equal(pending.length,2);
 await rejects('select materialize_finance_tax_source($1,$2,$3,false,\'review\')',['direct_money_receipt',id,await source('direct_money_receipt',id)],/ACK_REASON/);
 await rejects('select materialize_finance_tax_source($1,$2,$3,true,\'review\')',['direct_money_receipt',id,{}],/SOURCE_CHANGED/);
 const revision=await importSource('direct_money_receipt',id);assert.equal(await importSource('direct_money_receipt',id),revision);
 await importSource('payment',p.p.id);const s=await state();assert.equal(s.facts.find(f=>f.source_id===p.p.id).tax_amount,120);
 assert.equal(s.facts.find(f=>f.source_id===p.p.id).rate_percent,3);assert.equal(s.facts.filter(f=>f.source_id===p.p.id).length,1);
 assert.ok(s.coverage.invoice_items_without_approved_tax_point>=0);assert.deepEqual(await prior.financialState(),before);
});
test('050 filing is external evidence, not remittance; changed source reopens with immutable history',async()=>{
 await setup();const id=await receipt();let p=(await state()).periods[0];
 await scalar('select transition_finance_tax_period($1,$2,$3,$4,$5,$6)',[p.period_month,p.version,'ready_for_review','Reviewed source evidence',null,true]);p=(await state()).periods[0];
 await scalar('select transition_finance_tax_period($1,$2,$3,$4,$5,$6)',[p.period_month,p.version,'filed','External filing reference','2026-09-10',true]);
 p=(await state()).periods[0];assert.equal(p.status,'filed');assert.equal(p.net_vat_amount,null);assert.equal(p.remittance_status,undefined);
 await rejects('select transition_finance_tax_period($1,1,\'open\',\'Correction\',null,true)',[p.period_month],/SOURCE_CHANGED/);
 const oldFacts=(await state()).facts;await direct.transition(id,2,'reverse','Wrong synthetic receipt');await flush();
 assert.deepEqual((await state()).facts,[]);assert.equal((await state()).periods[0].status,'open');
 assert.equal(await scalar('select count(*)::int from finance_tax_position_facts'),oldFacts.length);
 assert.equal(await scalar('select count(*)::int from finance_tax_source_revisions'),2);
 assert.ok((await state()).history.some(a=>a.evidence_json.previous_period?.status==='filed'));
 await rejects('update finance_tax_position_facts set tax_amount=0',[],/IMMUTABLE/);
 await rejects('delete from finance_tax_source_revisions',[],/IMMUTABLE/);
 await rejects('truncate finance_tax_position_audit',[],/IMMUTABLE/);
});
test('050 WHT evidence is explicit, unclaimed, audited; Partner read-only and browser writes blocked',async()=>{
 await setup();await receipt();const f=(await state()).facts.find(f=>f.tax_kind==='incoming_wht');const before=await prior.financialState();
 await scalar('select record_finance_incoming_wht_evidence($1,$2,$3,$4)',[f.id,'verified','Synthetic certificate 1',true]);
 assert.equal((await state()).facts.find(x=>x.id===f.id).evidence_status,'verified');
 assert.equal((await state()).history.find(a=>a.event_type==='wht_evidence').evidence_json.claimed,false);
 await query("update user_profiles set role='partner' where id=$1",[ids.staff]);
 await asActor(ids.staff,async()=>{assert.equal((await state()).can_manage,false);
  await rejects('select materialize_finance_tax_source(\'payment\',$1,\'{}\',true,\'review\')',[randomUUID()],/ADMIN_REQUIRED/);
  await rejects('select record_finance_incoming_wht_evidence($1,\'received\',\'certificate\',true)',[f.id],/PERMISSION_DENIED/);
  await rejects('insert into finance_tax_position_facts default values',[],/permission denied/);
  await rejects('select tax_position_sync(\'payment\',$1,\'bypass\')',[randomUUID()],/permission denied/);});
 await query("update user_profiles set role='staff' where id=$1",[ids.staff]);
 await asActor(ids.staff,async()=>{await rejects('select get_finance_tax_position()',[],/PERMISSION_DENIED/);assert.equal(await scalar('select count(*)::int from finance_tax_position_facts'),0);});
 await rejects('insert into finance_outgoing_wht_obligations default values',[],/NOT_IMPLEMENTED/);
 assert.deepEqual(await prior.financialState(),before);
});
test('050 atomic hook failure rolls source confirmation back; unknown VAT never becomes a guessed fact',async()=>{
 await setup();const id=randomUUID();await direct.save(id,direct.input());
 await db.exec(`create function tax_test_fail() returns trigger language plpgsql as $$begin raise exception 'synthetic_tax_failure';end$$;
 create trigger tax_test_fail before insert on finance_tax_position_audit for each row execute function tax_test_fail();`);
 await rejects('select transition_finance_direct_money_receipt($1,1,\'confirm\',true,\'\')',[id],/synthetic_tax_failure/);
 assert.equal(await scalar('select status from finance_direct_money_receipts where id=$1',[id]),'draft');
 await db.exec('drop trigger tax_test_fail on finance_tax_position_audit');
 const uid=randomUUID();await direct.save(uid,direct.input([direct.line({money_nature:'unclassified',classification:null,vat_applicable:false,vat_rate:0,vat_treatment_json:null,wht_applicability:'does_not_apply',wht_base:null,wht_rate:null})],10000));
 await direct.transition(uid,1,'confirm');await flush();assert.deepEqual((await state()).facts,[]);assert.equal((await state()).coverage.unresolved_direct_sources,1);
 const l=await scalar('select lines_json->0 from finance_direct_money_receipts where id=$1',[uid]);
 await rpc('classify_finance_direct_money_receipt',[uid,2,[{source_line_id:l.source_line_id,money_nature:'business_revenue',classification:'professional_fee',vat_treatment_json:{treatment:'exempt',reason:'Synthetic classification evidence'}}],true,'Reviewed classification']);
 const s=await state();assert.equal(s.facts.length,1);assert.equal(s.facts[0].treatment,'exempt');assert.equal(s.facts[0].tax_amount,0);assert.equal(s.coverage.unresolved_direct_sources,0);
});
module.exports={setup,state,source,importSource,receipt};

test('050 future Payment WHT 120, approved Combined VAT and signed CN/DN adjustments, no duplicate document VAT',async()=>{
 await setup();const p=await prior.source();await flush();
 assert.equal((await state()).facts.find(f=>f.source_id===p.p.id).tax_amount,120);
 const correction=require('./tax-correction-postgres.test.cjs');const s=await correction.source(true,false);await flush();
 const vat=(await state()).facts.filter(f=>f.source_id===s.tid);assert.equal(vat.length,1);assert.equal(vat[0].tax_amount,700);
 assert.equal(vat[0].rate_percent,7);assert.equal(vat[0].date_basis,'approved_tax_point');
 await importSource('tax_invoice',s.tid);assert.equal((await state()).facts.filter(f=>f.source_id===s.tid).length,1);
 const cn=await correction.create(correction.args(s,'credit_note',1000));await correction.issue(cn);
 const dn=await correction.create(correction.args(s,'debit_note',2000));await correction.issue(dn);await flush();
 assert.equal((await state()).facts.find(f=>f.source_id===cn).tax_amount,-70);
 assert.equal((await state()).facts.find(f=>f.source_id===dn).tax_amount,140);
 const count=(await state()).facts.length;const copy=await correction.create(correction.args(s,'replacement_copy'));await correction.issue(copy);await flush();
 assert.equal((await state()).facts.length,count);
 const reissue=await correction.create(correction.args(s,'cancel_and_reissue'));await correction.issue(reissue);await flush();
 assert.equal((await state()).facts.length,count);
});

test('050 persisted WHT certificate means received, never verified or claimed; authorized finance can review but not import',async()=>{
 await setup();const combined=require('./combined-document-postgres.test.cjs');
 const s=await combined.source([{base:10000,vat:700,rate:7,applicable:true}],null,0,false);
 await rpc('save_finance_payment_wht_lines_draft',[s.p.id,'2026-09-01','bank_transfer',ids.bank,null,null,'Synthetic payer','',
  [{invoice_item_id:s.items[0].id,applicability:'applies',rate_percent:3}]]);
 await query("insert into finance_payment_evidence(payment_id,evidence_type,external_reference) values($1,'wht_certificate','Synthetic certificate reference')",[s.p.id]);
 await rpc('confirm_finance_payment',[s.p.id,true]);const f=(await state()).facts.find(f=>f.source_id===s.p.id);
 assert.equal(f.evidence_status,'received');assert.equal(f.certificate_reference,'Synthetic certificate reference');assert.equal(f.rate_percent,3);
 assert.equal(f.evidence_json.certificates.length,1);
 await query('update user_profiles set can_manage_finance_tax_invoices=true where id=$1',[ids.staff]);
 await asActor(ids.staff,async()=>{
  assert.equal((await state()).can_manage,true);assert.equal((await state()).can_materialize,false);
  await scalar('select record_finance_incoming_wht_evidence($1,$2,$3,true)',[f.id,'verified','Reviewed certificate']);
  await scalar('select record_finance_incoming_wht_evidence($1,$2,$3,true)',[f.id,'awaiting_evidence','Certificate replacement needed']);
  assert.equal((await state()).facts.find(x=>x.id===f.id).evidence_status,'awaiting_evidence');
  await rejects('select materialize_finance_tax_source(\'payment\',$1,\'{}\',true,\'review\')',[s.p.id],/ADMIN_REQUIRED/);
 });
});

// Last: the literal operator ROLLBACK requires committing only synthetic setup.
test('050 operator artifacts: exact schema, permissions, read-only checks and literal rollback with live Treasury',async()=>{
 const fs=require('node:fs'),{workflow,catalogSql,manifestPath,filenames}=require('./tax-position-artifacts.cjs');
 await setup(false);await treasury.opening();await receipt();await prior.source();await flush();const before=await prior.financialState();
 await db.exec('savepoint before_candidate');await db.exec(migration('50'));const catalog=await query(catalogSql);
 if(process.env.TAX_POSITION_CAPTURE==='1')fs.writeFileSync(manifestPath,JSON.stringify(catalog,null,2)+'\n');
 assert.deepEqual(catalog,JSON.parse(fs.readFileSync(manifestPath,'utf8')));const files=workflow();
 if(process.env.TAX_POSITION_CAPTURE==='1')for(const [file,content] of Object.entries(files))fs.writeFileSync(file,content);
 for(const [file,content] of Object.entries(files))assert.equal(fs.readFileSync(file,'utf8'),content);
 const post=(await query(files[filenames.verify]))[0];assert.deepEqual(post.failed_checks,[],JSON.stringify(post));
 await db.exec('alter table finance_tax_position_facts add column unexpected text');
 assert.ok((await query(files[filenames.verify]))[0].catalog_differences.length);
 await db.exec('rollback to savepoint before_candidate');assert.deepEqual((await query(files[filenames.pre]))[0].failed_checks,[]);
 await db.exec('commit');const results=await db.exec(files[filenames.dry]);const verified=results.flatMap(r=>r.rows).find(r=>'tax_position_foundation_verification_pass' in r);
 assert.deepEqual(verified.failed_checks,[],JSON.stringify(verified));assert.equal(verified.tax_position_foundation_verification_pass,true);
 assert.equal(await scalar("select to_regclass('public.finance_tax_position_facts')"),null);assert.deepEqual(await prior.financialState(),before);
});
