/* eslint-disable @typescript-eslint/no-require-imports */
// All sources and lifecycle calls below use an isolated in-memory PostgreSQL fixture.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const filing=require('./tax-filing-postgres.test.cjs'),treasury=require('./treasury-postgres.test.cjs'),direct=require('./direct-money-postgres.test.cjs'),payout=require('./payout-postgres.test.cjs');
const combined=require('./combined-document-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
const {summarizeDashboard}=require('../../app/finance/tax-position/dashboard-data.ts');
const month='2026-09-01';
const row=id=>scalar('select to_jsonb(f) from finance_tax_filings f where id=$1',[id]);
async function setup(apply=true){
 await treasury.setup();
 const id=randomUUID(),input=direct.input();input.received_on=month;
 await direct.save(id,input);await direct.transition(id,1,'confirm');await payout.flush();
 const s=await combined.source([{base:8673,vat:0,rate:0,applicable:false}],null,0,false);
 await rpc('save_finance_payment_wht_lines_draft',[s.p.id,month,'bank_transfer',ids.bank,null,null,'Synthetic payer','',
  [{invoice_item_id:s.items[0].id,applicability:'applies',rate_percent:3}]]);
 await rpc('confirm_finance_payment',[s.p.id,true]);await payout.flush();
 await db.exec(migration('50'));await db.exec(migration('51'));await db.exec(migration('52'));
 if(apply)await db.exec(migration('53'));
 return id;
}
async function overview(month='2026-09'){
 const rows=async table=>(await query('select to_jsonb(x) as data from '+table+' x')).map(r=>r.data);
 const money={payments:await rows('finance_payments'),direct:await rows('finance_direct_money_receipts'),components:await rows('finance_payment_wht_components'),certificates:[]};
 const documents=(await query("select to_jsonb(t)||jsonb_build_object('point',to_jsonb(p),'items',(select coalesce(jsonb_agg(i),'[]') from finance_tax_invoice_items i where i.tax_invoice_id=t.id)) as data from finance_tax_invoices t join finance_tax_point_events p on p.tax_invoice_id=t.id")).map(r=>r.data);
 const corrections=(await query("select to_jsonb(c)||jsonb_build_object('lines',(select coalesce(jsonb_agg(l),'[]') from finance_tax_correction_lines l where l.correction_id=c.id)) as data from finance_tax_document_corrections c")).map(r=>r.data);
 return summarizeDashboard({money,taxes:{documents,corrections},treasury:null,payables:null,register:null},month);
}

test('053 September: server monthly VAT 700 / WHT 560.19, zero allocation pool, immutable schema-2 Draft and no materialization',async()=>{
 await setup();const before=await scalar("select jsonb_build_object('cash',(select jsonb_agg(x) from finance_cash_transactions x),'facts',(select jsonb_agg(x) from finance_tax_position_facts x),'payments',(select jsonb_agg(x order by id) from finance_payments x))");
 const pool=await filing.pool('vat'),live=await overview();
 assert.equal(live.outputVat,700);assert.equal(live.wht,560.19);assert.equal(pool.monthly_facts.output_vat,live.outputVat);
 assert.deepEqual(pool.allocation_coverage,{output_vat:0,base_amount:0,source_count:0,sources:[]});
 assert.equal(pool.schema_version,2);assert.equal(pool.monthly_facts.input_vat,null);assert.equal(pool.monthly_facts.input_vat_complete,false);
 assert.equal(pool.monthly_facts.net_vat,null);assert.equal(pool.tax_amount,null);assert.equal(pool.ready,false);
 assert.equal('output_vat' in pool,false);assert.equal('source_count' in pool,false);
 const id=await filing.create('vat');await payout.flush();const stored=await row(id);
 const {summarizeFilings,filingMonthlyFacts}=require('../../app/finance/tax-position/filings/shared.ts');
 assert.equal(summarizeFilings(await filing.state(),{outputVat:live.outputVat,incomingWht:live.wht}).outputVat,700);
 assert.equal(filingMonthlyFacts(stored.source_snapshot_json,{outputVat:999,incomingWht:live.wht}).outputVat,700);
 assert.deepEqual(stored.source_snapshot_json,pool);assert.equal(stored.base_amount,0);assert.equal(stored.tax_amount,null);assert.equal(stored.status,'draft');
 assert.equal(await scalar('select count(*)::int from finance_tax_filing_allocations'),0);
 assert.deepEqual(await scalar('select evidence_json from finance_tax_filing_audit where filing_id=$1',[id]),stored);
 assert.equal(await filing.create('vat',id),id);assert.equal(await scalar('select count(*)::int from finance_tax_filing_audit'),1);
 await rejects("select transition_finance_tax_filing($1,1,'ready_for_review',null,null,null,true)",[id],/NOT_READY/);
 await rejects('update finance_tax_filings set source_snapshot_json=jsonb_set(source_snapshot_json,\'{monthly_facts,output_vat}\',\'0\') where id=$1',[id],/IMMUTABLE/);
 assert.deepEqual(await scalar("select jsonb_build_object('cash',(select jsonb_agg(x) from finance_cash_transactions x),'facts',(select jsonb_agg(x) from finance_tax_position_facts x),'payments',(select jsonb_agg(x order by id) from finance_payments x))"),before);
});

test('053 no browser totals, exact fingerprint retries, stale monthly evidence, no duplicate allocations',async()=>{
 const source=await setup();const pool=await filing.pool('vat'),forged={...pool,monthly_facts:{...pool.monthly_facts,output_vat:999}};
 await rejects('select create_finance_tax_filing($1,$2,\'vat\',md5($3::jsonb::text),null,null)',[randomUUID(),month,forged],/SOURCE_CHANGED/);
 const id=await filing.create('vat'),f=await row(id);
 await rejects('select create_finance_tax_filing($1,$2,\'vat\',\'forged\',null,null)',[id,month],/IDEMPOTENCY_CONFLICT/);
 await rejects('select create_finance_tax_filing($1,$2,\'vat\',$3,null,null)',[randomUUID(),month,f.source_fingerprint],/ALREADY_EXISTS/);
 await direct.transition(source,2,'reverse','Synthetic erroneous receipt');await payout.flush();
 assert.equal((await filing.pool('vat')).monthly_facts.output_vat,0);
 assert.equal((await filing.state()).filings.find(x=>x.id===id).source_changed,true);
 assert.equal((await row(id)).source_snapshot_json.monthly_facts.output_vat,700);
 await rejects("select transition_finance_tax_filing($1,1,'ready_for_review',null,null,null,true)",[id],/SOURCE_CHANGED/);
 assert.equal(await scalar('select count(*)::int from finance_tax_filing_allocations'),0);
});

test('053 allocation materialization is separate/idempotent; v1 history is neither rewritten nor reinterpreted',async()=>{
 const source=await setup(false),id=await filing.create('vat'),before=await row(id);
 await db.exec(migration('53'));assert.deepEqual(await row(id),before);await scalar('select tax_filing_assert($1)',[id]);
 assert.equal((await filing.state()).filings[0].source_changed,true);
 await rpc('transition_finance_tax_filing',[id,1,'cancelled',null,null,'Superseded synthetic v1 Draft',true]);
 await rpc('materialize_finance_tax_source',['direct_money_receipt',source,await scalar('select tax_position_source(\'direct_money_receipt\',$1)',[source]),true,'Synthetic historical evidence']);
 const pool=await filing.pool('vat');assert.equal(pool.monthly_facts.output_vat,700);assert.equal(pool.allocation_coverage.output_vat,700);assert.equal(pool.allocation_coverage.source_count,1);
 const fresh=await filing.create('vat');await payout.flush();assert.equal(await scalar('select count(*)::int from finance_tax_filing_allocations where filing_id=$1',[fresh]),1);
 await rejects('insert into finance_tax_filing_allocations(filing_id,tax_fact_id,economic_key,source_fingerprint,evidence_json) select filing_id,tax_fact_id,economic_key,source_fingerprint,evidence_json from finance_tax_filing_allocations',[],/unique/);
 assert.equal((await row(id)).source_snapshot_json.schema_version,1);
});

test('053 permission/RLS boundary: read-only Partner, denied staff, private helpers and raw writes blocked',async()=>{
 await setup();await query("update user_profiles set role='partner',can_manage_finance_tax_invoices=true where id=$1",[ids.staff]);
 await asActor(ids.staff,async()=>{
  assert.equal((await filing.state()).can_manage,false);assert.equal((await filing.state()).pools[0].monthly_facts.output_vat,700);
  await rejects('select create_finance_tax_filing($1,$2,\'vat\',\'x\',null,null)',[randomUUID(),month],/PERMISSION_DENIED/);
  for(const sql of ["select tax_filing_monthly_facts('2026-09-01')","select tax_filing_allocation_pool_v1('2026-09-01','vat')","select tax_filing_pool('2026-09-01','vat')"])
   await rejects(sql,[],/permission denied/);
  for(const table of ['finance_tax_filings','finance_tax_filing_allocations','finance_tax_filing_audit'])await rejects('insert into '+table+' default values',[],/permission denied/);
 });
 await query('update user_profiles set role=\'staff\',can_manage_finance_tax_invoices=false where id=$1',[ids.staff]);
 await asActor(ids.staff,()=>rejects('select get_finance_tax_filings($1)',[month],/PERMISSION_DENIED/));
 await query('update user_profiles set can_manage_finance_tax_invoices=true where id=$1',[ids.staff]);
 await asActor(ids.staff,async()=>{
  const pool=(await filing.state()).pools[0];const id=randomUUID();
  await scalar('select create_finance_tax_filing($1,$2,\'vat\',$3,null,null)',[id,month,pool.fingerprint]);
  assert.equal((await filing.state()).filings[0].source_snapshot_json.monthly_facts.output_vat,700);
 });
});

test('053 outgoing WHT unchanged: cancelled Draft excluded, confirmed payout filing/remittance still work',async()=>{
 await setup();const rights=await payout.rights();await payout.payee();const cancelled=await payout.save(rights);await rpc('cancel_finance_payout',[cancelled,1,true]);
 assert.equal((await filing.pool('wht_natural')).tax_amount,0);assert.equal((await filing.pool('wht_natural')).source_count,0);
 assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),0);
 await treasury.opening({amount:10000});const p=await payout.save(rights);await payout.confirm(p);await payout.flush();
 const old=await scalar("select tax_filing_allocation_pool_v1($1,'wht_natural')",[month]);assert.deepEqual(await filing.pool('wht_natural'),old);
 const id=await filing.create('wht_natural');await rpc('transition_finance_tax_filing',[id,1,'ready_for_review',null,null,null,true]);
 await rpc('transition_finance_tax_filing',[id,2,'filed','2026-09-10','SYNTHETIC-ONLY','Synthetic evidence',true]);
 const account=(await filing.state()).accounts.find(a=>a.bank_account_id===ids.bank),r=randomUUID();
 await rpc('create_finance_tax_remittance',[r,id,ids.bank,null,'2026-09-11','SYNTHETIC-PAYMENT','Synthetic evidence',account]);
 await rpc('transition_finance_tax_remittance',[r,1,'confirmed',true]);await payout.flush();
 assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_tax_remittance_id=$1',[r]),1);
 assert.equal((await row(id)).source_snapshot_json.schema_version,1);assert.equal((await row(id)).tax_amount,93.12);
});

module.exports={setup,overview};

test('053 monthly parity includes approved tax child once and signed CN/DN, not copies or other months',async()=>{
 await setup();const correction=require('./tax-correction-postgres.test.cjs'),s=await correction.source(true,false);
 const cn=await correction.create(correction.args(s,'credit_note',1000));await correction.issue(cn);
 const dn=await correction.create(correction.args(s,'debit_note',2000));await correction.issue(dn);
 const copy=await correction.create(correction.args(s,'replacement_copy'));await correction.issue(copy);await payout.flush();
 const july=await scalar("select tax_filing_monthly_facts('2026-07-01')");assert.equal(july.output_vat,770);assert.equal(july.output_vat,(await overview('2026-07')).outputVat);
 assert.equal(july.source_evidence.filter(x=>x.source_type==='tax_invoice').length,1);assert.equal(july.source_evidence.filter(x=>x.source_type==='tax_correction').length,2);
 assert.equal((await filing.pool('vat')).monthly_facts.output_vat,700);assert.equal((await filing.pool('vat')).monthly_facts.output_vat,(await overview()).outputVat);
 assert.equal((await scalar("select tax_filing_monthly_facts('2026-08-01')")).output_vat,0);
 // Isolated adversarial evidence: an issued tax child without items is unknown, not zero.
 await db.exec('set local session_replication_role=replica');await query('delete from finance_tax_invoice_items where tax_invoice_id=$1',[s.tid]);
 assert.equal((await scalar("select tax_filing_monthly_facts('2026-07-01')")).output_vat,null);
});

test('053 existing classification overlay wins over the original snapshot; source fingerprints catch change before allocations',async()=>{
 await setup();const id=randomUUID(),line=direct.line({money_nature:'unclassified',classification:null,vat_applicable:false,vat_rate:0,vat_treatment_json:null,wht_applicability:'does_not_apply',wht_base:null,wht_rate:null});
 const input=direct.input([line],10000);input.received_on=month;await direct.save(id,input);await direct.transition(id,1,'confirm');await payout.flush();
 const before=await filing.pool('vat'),frozen=await scalar('select confirmed_snapshot_json from finance_direct_money_receipts where id=$1',[id]);
 await rpc('classify_finance_direct_money_receipt',[id,2,[{source_line_id:line.source_line_id,money_nature:'business_revenue',classification:'professional_fee',vat_treatment_json:{treatment:'exempt',reason:'Synthetic reviewed exemption'}}],true,'Synthetic evidence']);
 const after=await filing.pool('vat'),projected=after.monthly_facts.source_evidence.find(s=>s.source_id===id);
 assert.equal(projected.lines[0].treatment,'exempt');assert.equal(after.monthly_facts.output_vat,(await overview()).outputVat);
 assert.notDeepEqual(after.monthly_facts,before.monthly_facts);assert.deepEqual(await scalar('select confirmed_snapshot_json from finance_direct_money_receipts where id=$1',[id]),frozen);
 assert.equal(after.ready,false);assert.equal(after.tax_amount,null);
});

test('053 exact SELECT artifacts, September acceptance, privilege/catalog drift and literal rollback leave protected rows unchanged',async()=>{
 const fs=require('node:fs'),{workflow,filenames}=require('./tax-filing-snapshot-artifacts.cjs');
 await setup(false);const files=workflow();for(const [file,sql] of Object.entries(files))assert.equal(fs.readFileSync(file,'utf8'),sql);
 const pre=(await query(files[filenames.pre]))[0];assert.deepEqual(pre.failed_checks,[],JSON.stringify(pre));
 await db.exec('savepoint before053');await db.exec(migration('53'));
 const post=(await query(files[filenames.verify]))[0];assert.deepEqual(post.failed_checks,[],JSON.stringify(post));assert.deepEqual(post.upstream_evidence_hashes,pre.upstream_evidence_hashes);
 await db.exec('grant execute on function tax_filing_monthly_facts(date) to authenticated');assert.ok((await query(files[filenames.verify]))[0].failed_checks.includes('private_and_rpc_permissions'));
 await db.exec('alter table finance_tax_filings add column unexpected text');assert.ok((await query(files[filenames.verify]))[0].catalog_differences.length);
 await db.exec('rollback to before053');await db.exec('commit');
 const results=await db.exec(files[filenames.dry]);const verified=results.flatMap(r=>r.rows).find(r=>'tax_filing_snapshot_consistency_verification_pass' in r);
 assert.deepEqual(verified.failed_checks,[],JSON.stringify(verified));assert.deepEqual(verified.upstream_evidence_hashes,pre.upstream_evidence_hashes);
 assert.equal(await scalar("select to_regprocedure('public.tax_filing_monthly_facts(date)')"),null);
 assert.deepEqual((await query(files[filenames.pre]))[0].upstream_evidence_hashes,pre.upstream_evidence_hashes);
});
