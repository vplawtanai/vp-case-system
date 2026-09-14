/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const prior=require('./vp-distribution-postgres.test.cjs');
const {db,scalar,rpc,rejects,query,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
const {resolved,people}=require('./vp-formula.test.cjs');
const {calculateFormula}=require('../../app/finance/compensation/formula-calculation.ts');
const {definition}=require('./tax-invoice-sql-artifacts.cjs');
async function prerequisites(){
 await db.exec('create table cases(id bigint primary key,client_id uuid references clients(id));create table advisory_matters(id uuid primary key,client_id uuid references clients(id));');
 await db.exec(definition(migration('30'),'assert_finance_billable_charge_context')+'\n'+definition(migration('30'),'calculate_finance_billable_charge_amounts'));
}
async function setup(){await prior.setup();await prerequisites();await db.exec(migration('46'));await db.exec(migration('47'));}
function line(extra={}){return {source_line_id:randomUUID(),description:'Direct legal work',reason:'Agreed work already paid',money_nature:'business_revenue',classification:'professional_fee',base:10000,vat_applicable:true,vat_rate:7,vat_treatment_json:null,wht_applicability:'applies',wht_base:10000,wht_rate:3,...extra};}
function input(lines=[line()],cash=10400){return {client_id:ids.client,payer_name:'Synthetic payer',case_id:null,advisory_matter_id:null,received_on:'2026-07-01',method:'bank_transfer',receiving_bank_account_id:ids.bank,cash_location:null,currency:'THB',cash_amount:cash,reference_no:null,evidence_reference:null,note:'Synthetic only',lines};}
const save=(id,payload,version=0)=>rpc('save_finance_direct_money_receipt',[id,version,payload]);
const transition=(id,version,action,reason='')=>rpc('transition_finance_direct_money_receipt',[id,version,action,true,reason]);
const context=id=>scalar('select get_finance_direct_vp_formula_context($1)',[id]);
test('047 candidate creates no financial rows; direct professional receipt has no fake Payment/Invoice and uses shared formula',async()=>{
 await setup();const before=await prior.financialState(),id=randomUUID(),payload=input();
 await save(id,payload);assert.equal(await save(id,payload),id);await transition(id,1,'confirm');assert.equal(await transition(id,1,'confirm'),id);
 const c=await context(id);assert.deepEqual(c.source.blockers,[]);assert.equal(c.source.money_source,null);
 assert.deepEqual(c.source.totals,{cash:10400,wht:300,vat:700,base:10000,professional_pool:9700,company_economic:0,company_cash:0});
 const l=c.source.lines[0];assert.equal(l.invoice_item_id,undefined);assert.equal(l.source_line_id,payload.lines[0].source_line_id);
 const f=calculateFormula(9700,resolved('source_worker_qc',9700),people);assert.deepEqual(f.errors,[]);
 const choices=[{source_line_id:l.source_line_id,formula_result:f.result,referral_amount:f.result.referral_amount,company_share_amount:f.result.company_share_amount,work_compensation_amount:f.result.work_compensation_amount}];
 const d=await rpc('save_finance_direct_vp_distribution',[id,null,null,c.source,choices,'Direct shared workflow']);
 assert.equal(await rpc('save_finance_direct_vp_distribution',[id,null,null,c.source,choices,'Direct shared workflow']),d);
 for(const action of ['review','finalize']){const now=await context(id);await rpc('transition_finance_vp_distribution',[d,now.current.version,now.source,action,true,'']);}
 assert.equal((await context(id)).current.status,'finalized');
 await rejects('select transition_finance_direct_money_receipt($1,2,\'reverse\',true,\'Erroneous receipt\')',[id],/SUPERSEDE_REQUIRED/);
 const final=await context(id);await rpc('transition_finance_vp_distribution',[d,final.current.version,final.source,'supersede',true,'Retire before correction']);
 const frozen=await scalar('select confirmed_snapshot_json from finance_direct_money_receipts where id=$1',[id]);
 await transition(id,2,'reverse','Erroneous receipt');assert.deepEqual(await scalar('select confirmed_snapshot_json from finance_direct_money_receipts where id=$1',[id]),frozen);
 assert.equal(await scalar('select count(*)::int from finance_direct_money_receipt_audit where receipt_id=$1',[id]),3);
 assert.deepEqual(await prior.financialState(),before);
});
test('047 non-revenue and unclassified money confirms but fails closed downstream',async()=>{
 await setup();const before=await prior.financialState();
 for(const nature of ['client_money','owner_or_partner_funding','loan_or_deposit','reimbursement_or_pass_through','other_non_revenue','unclassified']){
  const id=randomUUID(),l=line({money_nature:nature,classification:null,vat_applicable:false,vat_rate:0,vat_treatment_json:nature==='unclassified'?null:{treatment:'outside_scope',reason:'Explicit synthetic nature'},wht_applicability:'does_not_apply',wht_base:null,wht_rate:null});
  await save(id,input([l],10000));await transition(id,1,'confirm');const c=await context(id);
  assert.ok(c.source.blockers.includes('direct_'+nature));
  await rejects('select save_finance_direct_vp_distribution($1,null,null,$2,\'[]\',\'\')',[id,c.source],/SOURCE_UNPROVEN/);
 }
 assert.deepEqual(await prior.financialState(),before);
});
test('047 multi-line direct company and explicit non-VAT professional evidence reconcile',async()=>{
 await setup();const id=randomUUID(),lines=[line({classification:'additional_service'}),line({base:1000,vat_applicable:false,vat_rate:0,vat_treatment_json:{treatment:'exempt',reason:'Explicit synthetic exemption'},wht_applicability:'does_not_apply',wht_base:null,wht_rate:null})];
 await save(id,input(lines,11400));await transition(id,1,'confirm');const c=await context(id);
 assert.equal(c.source.totals.company_economic,10000);assert.equal(c.source.totals.company_cash,9700);assert.equal(c.source.totals.professional_pool,1000);
});
test('047 reconciliation, classification, VAT/WHT, duplicate evidence and stale guards',async()=>{
 await setup();const id=randomUUID(),p=input();
 for(const change of [p=>p.cash_amount+=0.01,p=>p.lines[0].base=-1,p=>p.lines[0].classification=null,p=>p.lines[0].wht_rate=101,p=>p.lines[0].wht_base=20000,p=>p.lines[0].vat_rate=-1,p=>p.lines[0].reason='',p=>p.lines.push(p.lines[0])]){
  const bad=structuredClone(p);change(bad);await rejects('select save_finance_direct_money_receipt($1,0,$2)',[randomUUID(),bad],/.+/);
 }
 p.reference_no='SYNTHETIC-ONLY';await save(id,p);
 await rejects('select save_finance_direct_money_receipt($1,0,$2)',[randomUUID(),p],/unique|duplicate/);
 const edited={...p,note:'Changed'};await save(id,edited,1);await rejects('select save_finance_direct_money_receipt($1,1,$2)',[id,p],/STALE/);
 await transition(id,2,'confirm');await rejects('select save_finance_direct_money_receipt($1,3,$2)',[id,p],/IMMUTABLE/);
 await rejects('update finance_direct_money_receipts set cash_amount=1 where id=$1',[id],/IMMUTABLE/);
 await rejects('delete from finance_direct_money_receipts where id=$1',[id],/IMMUTABLE/);
});
test('047 Admin-only RPCs, Partner read-only and browser direct writes blocked',async()=>{
 await setup();const id=randomUUID();await save(id,input());
 await query("update user_profiles set role='partner' where id=$1",[ids.staff]);
 await asActor(ids.staff,async()=>{
  assert.equal((await context(id)).can_manage,false);
  await rejects('select save_finance_direct_money_receipt($1,0,$2)',[randomUUID(),input()],/PERMISSION_DENIED/);
  await rejects('select transition_finance_direct_money_receipt($1,1,\'confirm\',true,\'\')',[id],/PERMISSION_DENIED/);
 });
 for(const role of ['anon','authenticated']){
  assert.equal(await scalar('select has_table_privilege($1,\'finance_direct_money_receipts\',\'INSERT\')',[role]),false);
  assert.equal(await scalar('select has_table_privilege($1,\'finance_direct_money_receipt_audit\',\'UPDATE\')',[role]),false);
 }
 await query('set role authenticated');
 await rejects('update finance_direct_money_receipts set note=\'Bypass\' where id=$1',[id],/permission denied/);
 await query('reset role');
});
test('047 preserves Payment projection and legacy finalized history byte-for-byte without backfill',async()=>{
 await prior.setup();const p=await prior.source();await prior.finalize(p.p.id);
 const old=await prior.context(p.p.id),before=await prior.financialState(),audit=old.audit;
 await prerequisites();await db.exec(migration('46'));await db.exec(migration('47'));
 const current=await prior.context(p.p.id);assert.deepEqual(current.source,old.source);assert.deepEqual(current.audit,audit);
 assert.deepEqual(current.current.source_snapshot_json,old.current.source_snapshot_json);
 await prior.transition(p.p.id,'supersede','Historical aggregate preserved');assert.deepEqual(await prior.financialState(),before);
});
module.exports={setup,input,line,save,transition,context};
test('047 exact catalog manifest capture (local fixture only)',async()=>{
 await setup();const fs=require('node:fs'),{catalogSql,manifestPath}=require('./direct-money-artifacts.cjs');const actual=await query(catalogSql);
 if(process.env.DIRECT_MONEY_CAPTURE==='1')fs.writeFileSync(manifestPath,JSON.stringify(actual,null,2)+'\n');
 else assert.deepEqual(actual,JSON.parse(fs.readFileSync(manifestPath,'utf8')));
});
test('047 explicit classification resolves unknown money without rewriting the original confirmed cash evidence',async()=>{
 await setup();const id=randomUUID(),l=line({money_nature:'unclassified',classification:null,vat_applicable:false,vat_rate:0,vat_treatment_json:null,wht_applicability:'does_not_apply',wht_base:null,wht_rate:null});
 await save(id,input([l],10000));await transition(id,1,'confirm');
 const frozen=await scalar('select confirmed_snapshot_json from finance_direct_money_receipts where id=$1',[id]),before=await prior.financialState();
 const choices=[{source_line_id:l.source_line_id,money_nature:'business_revenue',classification:'professional_fee',vat_treatment_json:{treatment:'exempt',reason:'Explicit local fixture evidence'}}];
 await rpc('classify_finance_direct_money_receipt',[id,2,choices,true,'New evidence received']);
 assert.equal(await rpc('classify_finance_direct_money_receipt',[id,2,choices,true,'New evidence received']),id);
 assert.deepEqual(await scalar('select confirmed_snapshot_json from finance_direct_money_receipts where id=$1',[id]),frozen);
 const c=await context(id);assert.deepEqual(c.source.blockers,[]);assert.equal(c.source.totals.professional_pool,10000);
 assert.equal(await scalar('select unclassified from finance_direct_money_receipts where id=$1',[id]),false);
 await rejects('select classify_finance_direct_money_receipt($1,3,$2,true,\'Bad amount\')',[id,[{...choices[0],base:20000}]],/IMMUTABLE/);
 await transition(id,3,'reverse','Record corrected');assert.deepEqual(await prior.financialState(),before);
});
test('047 cash/other without Client supported; single-matter Client guard and required receiving evidence preserved',async()=>{
 await setup();
 for(const method of ['cash','other']){
  const id=randomUUID(),p={...input(),client_id:null,method,receiving_bank_account_id:null,cash_location:'Synthetic safe'};
  await save(id,p);await transition(id,1,'confirm');assert.equal((await context(id)).source.received_money_source.facts.client_id,null);
 }
 const bad={...input(),client_id:null,case_id:1};await rejects('select save_finance_direct_money_receipt($1,0,$2)',[randomUUID(),bad],/CONTEXT_INVALID/);
 await query("update finance_bank_accounts set is_active=false where id=$1",[ids.bank]);
 await rejects('select save_finance_direct_money_receipt($1,0,$2)',[randomUUID(),input()],/ACCOUNT_REQUIRED/);
});
test('047 operator artifacts compile read-only, report catalog drift and rollback without any financial mutation',async()=>{
 await prior.setup();await prerequisites();await db.exec(migration('46'));
 const {workflow,filenames}=require('./direct-money-artifacts.cjs'),files=workflow(),before=await prior.financialState();
 const pre=(await query(files[filenames.pre]))[0];assert.deepEqual(pre.failed_checks,[],JSON.stringify(pre.function_differences));
 await db.exec('savepoint migration047');await db.exec(migration('47'));
 const verify=(await query(files[filenames.verify]))[0];assert.deepEqual(verify.failed_checks,[],JSON.stringify(verify));
 await db.exec('alter table finance_direct_money_receipts add column unexpected text');
 const drift=(await query(files[filenames.verify]))[0];assert.equal(drift.checks.exact_catalog,false);assert.equal(drift.catalog_differences[0].actual_name,'finance_direct_money_receipts');
 await db.exec('rollback to savepoint migration047');
 const result=await db.exec(files[filenames.dry].replace(/^BEGIN;/,'SAVEPOINT operator047;').replace(/ROLLBACK;\n$/,'ROLLBACK TO SAVEPOINT operator047;'));
 const rehearsal=result.flatMap(r=>r.rows||[]).find(r=>Object.hasOwn(r,'direct_money_receipt_foundation_verification_pass'));
 assert.ok(rehearsal);assert.deepEqual(rehearsal.failed_checks,[],JSON.stringify(rehearsal));
 assert.equal(await scalar("select to_regclass('finance_direct_money_receipts')"),null);assert.deepEqual(await prior.financialState(),before);
});
test('047 deferred integrity rejects forged classification and lifecycle audit evidence',async()=>{
 await setup();const id=randomUUID(),p=input();await save(id,p);await transition(id,1,'confirm');
 const choices=p.lines.map(l=>({source_line_id:l.source_line_id,money_nature:l.money_nature,classification:l.classification,vat_treatment_json:l.vat_treatment_json}));
 await db.exec('savepoint forged_revision');
 try {
  const row=await scalar('select to_jsonb(r) from finance_direct_money_receipts r where id=$1',[id]);
  const evidence={schema_version:1,lines:row.lines_json.map(l=>({...l,base:20000})),choices,actor_id:ids.admin,reason:'Forged',created_at:row.updated_at};
  await query('update finance_direct_money_receipts set version=version+1,classification_json=$2 where id=$1',[id,evidence]);
  await query("insert into finance_direct_money_receipt_audit(receipt_id,event_type,version,actor_id,created_at,evidence_json) select id,'classified',version,$2,updated_at,to_jsonb(r) from finance_direct_money_receipts r where id=$1",[id,ids.admin]);
  await assert.rejects(()=>db.exec('set constraints all immediate'),/CLASSIFICATION_INVALID/);
 }finally{await db.exec('rollback to savepoint forged_revision');}
 await rpc('classify_finance_direct_money_receipt',[id,2,choices,true,'Explicit evidence reviewed']);
 await db.exec('savepoint forged_actor');
 try {
  await query("update finance_direct_money_receipts set status='reversed',version=version+1,reversed_at=updated_at,reversed_by=$2,reversal_reason='Test' where id=$1",[id,ids.admin]);
  await query("insert into finance_direct_money_receipt_audit(receipt_id,event_type,version,actor_id,created_at,evidence_json) select id,'reversed',version,$2,updated_at,to_jsonb(r) from finance_direct_money_receipts r where id=$1",[id,ids.staff]);
  await assert.rejects(()=>db.exec('set constraints all immediate'),/AUDIT_INVALID/);
 }finally{await db.exec('rollback to savepoint forged_actor');}
});
test('047 shared Payment formula path remains operational and Direct multi-role components remain distinct',async()=>{
 await setup();const before=await prior.financialState(),s=await prior.source();
 const payment=await prior.context(s.p.id),d=payment.source.lines.filter(l=>l.classification==='professional_fee').map(l=>{
  const f=calculateFormula(l.professional_pool,resolved('source_worker_qc',l.professional_pool),people).result;
  return {invoice_item_id:l.invoice_item_id,formula_result:f,referral_amount:f.referral_amount,company_share_amount:f.company_share_amount,work_compensation_amount:f.work_compensation_amount};
 });
 await prior.save(s.p.id,payment,d);await prior.transition(s.p.id,'review');await prior.transition(s.p.id,'finalize');
 assert.deepEqual((await prior.context(s.p.id)).current.decisions_json,d);
 const existing=await prior.financialState(),id=randomUUID();await save(id,input());await transition(id,1,'confirm');const c=await context(id);
 const engine=require('../../app/finance/compensation/formula-engine.ts'),finput=resolved('source_worker_qc',9700);
 for(const [role,type] of [['Co-Lawyer / Co-Worker','worker'],['Assistant','assistant'],['Quality Controller','qc']])
  finput.rows.push({...engine.createAllocation(type,'',10,false,role),recipient_user_id:people[0].id});
 finput.rows=engine.rebalanceOwnerWorkPool(finput.rows,9700,finput.code);
 const calculated=calculateFormula(9700,finput,people);assert.deepEqual(calculated.errors,[]);const f=calculated.result;
 const direct=await rpc('save_finance_direct_vp_distribution',[id,null,null,c.source,[{source_line_id:c.source.lines[0].source_line_id,formula_result:f,referral_amount:f.referral_amount,company_share_amount:f.company_share_amount,work_compensation_amount:f.work_compensation_amount}],'Multiple roles']);
 for(const action of ['review','finalize']){const current=await context(id);await rpc('transition_finance_vp_distribution',[direct,current.current.version,current.source,action,true,'']);}
 assert.deepEqual((await context(id)).current.decisions_json[0].formula_result.recipients.slice(2).map(r=>r.component_no),[3,4,5,6]);
 await rejects('select classify_finance_direct_money_receipt($1,2,$2,true,\'New nature\')',[id,[]],/SUPERSEDE_REQUIRED/);
 assert.deepEqual(await prior.financialState(),existing);assert.ok(before);
});
