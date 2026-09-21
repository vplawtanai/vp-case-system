/* eslint-disable @typescript-eslint/no-require-imports */
// In-memory PostgreSQL only. No credentials or network.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const requests=require('./expense-request-postgres.test.cjs'),expense=require('./expense-foundation-postgres.test.cjs'),treasury=require('./treasury-postgres.test.cjs'),payout=require('./payout-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
const {people}=require('./vp-formula.test.cjs');
async function setup(apply=true){await requests.setup();await db.exec(migration('57'));await db.exec(migration('58'));if(apply)await db.exec(migration('59'));}
const input=(extra={})=>({schema_version:2,vat_mode:'exclusive',vat_rate:7,eligibility:'pending',wht_state:'withhold',wht_rate:3,reason:'',...extra});
const review=(id,i=input(),previous=null,op=randomUUID())=>rpc('review_finance_expense_tax',[op,id,previous,i]);
async function submitted(extra={}){const id=randomUUID();await rpc('save_finance_expense',[id,null,expense.input({gross_amount:300,creator_payment_fact:'unpaid',...extra})]);await rpc('submit_finance_expense',[id,await scalar('select version from finance_expenses where id=$1',[id])]);return id;}
test('059 normal note optional; reject/Claim/override reasons mandatory; preview permission unchanged',async()=>{
 await setup();const id=await submitted();await rpc('review_finance_expense',[id,await scalar('select version from finance_expenses where id=$1',[id]),true,'']);
 assert.equal(await scalar('select review_reason from finance_expenses where id=$1',[id]),'');
 const reject=await submitted();await rejects('select review_finance_expense($1,2,false,\'\')',[reject],/REASON_REQUIRED/);await rpc('review_finance_expense',[reject,await scalar('select version from finance_expenses where id=$1',[reject]),false,'Not accepted']);
 const claim=await submitted({origin:'employee_claim',creator_payment_fact:null,personally_paid:true,reimbursement_requested:300});await rejects('select review_finance_expense($1,2,true,\'\')',[claim],/REASON_REQUIRED/);
 await asActor(ids.staff,()=>rejects('select preview_finance_company_expense_tax($1,$2)',[id,input()],/PERMISSION_DENIED/));
 const op=await review(id);await rejects('select review_finance_expense_tax($1,$2,$3,$4)',[randomUUID(),id,op,input()],/companyNeedReason/);
 await payout.flush();
});
test('059 authoritative 300 none/inclusive/exclusive; eligibility disclosure and exact retry',async()=>{
 await setup();for(const [mode,expected] of [['none',[300,0,300]],['inclusive',[280.37,19.63,300]],['exclusive',[300,21,321]]]){
  const id=await submitted();const i=input({vat_mode:mode,wht_state:'none'}),c=await scalar('select preview_finance_company_expense_tax($1,$2)',[id,i]);
  assert.deepEqual([c.vat_base,c.vat_amount,c.gross],expected);assert.equal(c.ready,true);
  await rpc('review_finance_expense',[id,await scalar('select version from finance_expenses where id=$1',[id]),true,'']);const op=await review(id,i);await review(id,i,null,op);
  const doc=(await scalar('select get_finance_expenses($1)',[id])).record;
  assert.equal(doc.gross_amount,expected[2]);assert.equal(doc.declared_gross_amount,300);assert.equal(doc.tax_review.eligibility,mode==='none'?'ineligible':'pending');
  assert.equal(await scalar('select gross_amount::text from finance_expenses where id=$1',[id]),'300.00');
 }
 const id=await submitted();assert.equal((await scalar('select preview_finance_company_expense_tax($1,$2)',[id,input({eligibility:'eligible'})])).ready,false);
 await payout.flush();
});
test('059 one authoritative total reaches Payable/Cashbook/WHT; incomplete VAT metadata does not block cash',async()=>{
 await setup();await payout.payee();await treasury.opening({amount:10000});const id=await submitted({supplier_payee_id:people[0].id});
 await rpc('review_finance_expense',[id,await scalar('select version from finance_expenses where id=$1',[id]),true,'']);await review(id);
 await rpc('decide_finance_expense_settlement',[randomUUID(),id,'supplier_unpaid',people[0].id,321,null,'']);
 assert.equal(await scalar('select gross_amount::text from finance_expense_obligations where expense_id=$1',[id]),'321.00');
 await rejects('select prepare_finance_expense_payout($1,$2,null,\'2026-09-10\',$3,null,false,\'\')',[randomUUID(),id,ids.bank],/WHT_ACTUAL/);
 const p=await expense.prepare(id,{wht:true});await expense.confirm(p);await expense.confirm(p);await payout.flush();
 assert.equal(await scalar('select cash_amount::text from finance_cash_transactions where source_payout_id=$1',[p]),'312.00');
 assert.equal(await scalar('select withheld_amount::text from finance_outgoing_wht_obligations where payout_source_id=$1',[p]),'9.00');
 assert.equal(await scalar("select count(*)::int from finance_tax_position_facts where tax_kind='input_vat'"),0);
});
test('059 unresolved WHT blocked; paid-without-WHT cannot become retrospective withholding',async()=>{
 await setup();await treasury.opening({amount:10000});const id=await submitted({creator_payment_fact:'company_paid'});await rpc('review_finance_expense',[id,await scalar('select version from finance_expenses where id=$1',[id]),true,'']);
 await rpc('decide_finance_expense_settlement',[randomUUID(),id,'company_bank',null,300,null,'']);
 await rejects('select prepare_finance_expense_payout($1,$2,null,\'2026-09-10\',$3,null,false,\'\')',[randomUUID(),id,ids.bank],/WHT_DECISION_REQUIRED/);
 assert.equal((await scalar('select preview_finance_company_expense_tax($1,$2)',[id,input()])).ready,false);
 const op=await review(id,input({vat_mode:'none',wht_state:'none'}));const p=await expense.prepare(id);await expense.confirm(p);await payout.flush();
 await rejects('select review_finance_expense_tax($1,$2,$3,$4)',[randomUUID(),id,op,input({vat_mode:'none',paid_withholding_ack:true,reason:'Explicit review'})],/companyWhtExceptionBlock/);
 assert.equal(await scalar('select wht_amount::text from finance_payouts where id=$1',[p]),'0.00');
});
module.exports={setup,input,submitted,review};
test('059 multi-item direct submission preserves request facts, categories, Supplier and separate item totals',async()=>{
 await setup();await payout.payee();const r=await requests.save(requests.items([300,120],{creator_payment_fact:'unpaid',personally_paid:false,reimbursement_requested:0,supplier_payee_id:people[0].id}),'company_expense_batch');
 await rpc('submit_finance_expense_request',[r.id,1]);const doc=await requests.read(r.id);
 for(const [index,item] of doc.items.entries()){
  await rpc('review_finance_expense',[item.id,item.version,true,'']);await review(item.id,input({vat_mode:index===0?'exclusive':'none',wht_state:'none'}));
  await rpc('decide_finance_expense_settlement',[randomUUID(),item.id,'supplier_unpaid',people[0].id,index===0?321:120,null,'']);
 }
 await payout.flush();const after=await requests.read(r.id);assert.deepEqual(after.items.map(i=>i.gross_amount),[321,120]);assert.deepEqual(after.items.map(i=>i.declared_gross_amount),[300,120]);
 assert.deepEqual(after.items.map(i=>i.category),doc.items.map(i=>i.category));assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),0);
});
test('059 Claim manual review/reimbursement and immediate custodian cash paths remain unchanged',async()=>{
 await setup();await treasury.opening({amount:30000});await payout.payee();
 const id=await expense.accepted({origin:'employee_claim',creator_payment_fact:null,personally_paid:true,claimant_id:ids.admin,reimbursement_requested:10700});
 await expense.review(id);await expense.settlement(id,'reimburse',ids.admin);const p=await expense.prepare(id);await expense.confirm(p);await payout.flush();
 assert.equal(await scalar('select cash_amount::text from finance_cash_transactions where source_payout_id=$1',[p]),'10700.00');
 await rpc('record_finance_paid_expense',[randomUUID(),expense.input(),ids.bank,null,'2026-09-10',true]);await payout.flush();
 assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),2);
});
test('059 caller-supplied calculations cannot inflate totals; inclusive cent rounding preserves declared total',async()=>{
 await setup();const id=await submitted({gross_amount:0.08});await rpc('review_finance_expense',[id,await scalar('select version from finance_expenses where id=$1',[id]),true,'']);
 await review(id,input({vat_mode:'inclusive',wht_state:'none',calculation:{gross:9999}}));await payout.flush();
 assert.equal((await scalar('select get_finance_expenses($1)',[id])).record.gross_amount,0.08);
 const other=await submitted();await rpc('review_finance_expense',[other,await scalar('select version from finance_expenses where id=$1',[other]),true,'']);
 await rejects('select review_finance_expense_tax($1,$2,null,$3)',[randomUUID(),other,expense.tax({calculation:{gross:9999}})],/STRUCTURED_REVIEW_REQUIRED/);
});
test('059 eligible evidence synchronizes exact VAT once with optional note; monetary changes after settlement rejected',async()=>{
 await setup();const id=await submitted();await rpc('review_finance_expense',[id,await scalar('select version from finance_expenses where id=$1',[id]),true,'']);
 const i=input({wht_state:'none',eligibility:'eligible',supplier_tax_id:'1234567890123',tax_document_reference:'TEST-059',tax_document_date:'2026-09-10',company_name_status:'yes'});
 const op=await review(id,i);await review(id,i,null,op);await payout.flush();
 assert.equal(await scalar("select tax_amount::text from finance_tax_position_facts where tax_kind='input_vat'"),'21.00');
 await rpc('decide_finance_expense_settlement',[randomUUID(),id,'company_bank',null,321,null,'']);
 await rejects('select review_finance_expense_tax($1,$2,$3,$4)',[randomUUID(),id,op,input({vat_mode:'none',wht_state:'none',reason:'Correction'})],/companyTaxMoneyFrozen/);
 const next=await review(id,{...i,reason:'Verified document metadata'},op);assert.ok(next);await payout.flush();
});
test('059 paid with actual WHT evidence uses known payee, explicit acknowledgement and exception reason',async()=>{
 await setup();await payout.payee();await treasury.opening({amount:10000});const id=await submitted({creator_payment_fact:'company_paid',supplier_payee_id:people[0].id});
 await rpc('review_finance_expense',[id,await scalar('select version from finance_expenses where id=$1',[id]),true,'']);
 await review(id,input({paid_withholding_ack:true,reason:'Actual supplier withholding documented'}));
 await rpc('decide_finance_expense_settlement',[randomUUID(),id,'company_bank',people[0].id,321,null,'']);
 const p=await expense.prepare(id,{wht:true});await expense.confirm(p);await payout.flush();
 assert.equal(await scalar('select cash_amount::text from finance_cash_transactions where source_payout_id=$1',[p]),'312.00');
});
test('059 exact artifact and rollback-only rehearsal preserves all upstream rows/functions',async()=>{
 const fs=require('node:fs'),a=require('./company-tax-review-artifacts.cjs');await setup(false);
 const prior=await query(a.functionSql()),priorCatalog=await query(a.catalogSql);
 await db.exec('savepoint before059');await db.exec(migration('59'));
 const manifest={sha256:a.sha(),prior,functions:await query(a.functionSql()),priorCatalog,catalog:await query(a.catalogSql)};
 for(const f of manifest.functions.filter(f=>!a.changed.includes(f.name)))assert.deepEqual(f,prior.find(p=>p.signature===f.signature));
 if(process.env.WRITE_059_MANIFEST==='1'){fs.writeFileSync(a.manifestPath,JSON.stringify(manifest,null,2)+'\n');return;}
 assert.deepEqual(manifest,JSON.parse(fs.readFileSync(a.manifestPath,'utf8')));
 const files=a.workflow();for(const [file,sql]of Object.entries(files))assert.equal(fs.readFileSync(file,'utf8'),sql);
 const post=(await query(files[a.filenames.verify]))[0];assert.deepEqual(post.failed_checks,[],JSON.stringify(post));
 await db.exec('rollback to before059');const pre=(await query(files[a.filenames.pre]))[0];assert.deepEqual(pre.failed_checks,[],JSON.stringify(pre));assert.deepEqual(pre.upstream_evidence_hashes,post.upstream_evidence_hashes);
 await db.exec('commit');const result=(await db.exec(files[a.filenames.dry])).flatMap(r=>r.rows).find(r=>'company_expense_tax_review_verification_pass'in r);
 assert.deepEqual(result.failed_checks,[],JSON.stringify(result));assert.equal(result.rehearsal_baseline_available,true);
 assert.deepEqual(await query(a.functionSql()),prior);assert.deepEqual((await query(files[a.filenames.pre]))[0].upstream_evidence_hashes,pre.upstream_evidence_hashes);
});
