/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
require('./receipt-render-fixture.cjs');
const {loadStatementOverview,overviewTotals}=require('../../app/finance/statement/overview-data.ts');
const {activityOrder}=require('../../app/finance/statement/overview-activity.ts');
const {bankIdentity,maskedAccount}=require('../../app/finance/statement/account-identity.tsx');
const accounts=['BAY','KBANK','KTB','Office cash'].map((name,i)=>({kind:i===3?'cash':'bank',account_id:'a'+i,bank_account_id:i===3?null:'a'+i,cash_location_id:i===3?'a3':null,name_th:name,name_en:name,bank_name:name,account_number:'123-456-7890',is_active:i!==2}));
function adapter({transfers=1,unknown=false,fail=false,broken=false}={}){
 const calls=[];
 const read=async(name,args)=>{calls.push({name,args});assert.ok(['get_finance_statement_accounts','get_finance_unified_company_statement','get_finance_account_statement','get_finance_treasury'].includes(name),'read-only RPCs');
  if(fail)return {error:Error('unavailable')};
  if(name==='get_finance_statement_accounts')return {data:{accounts,can_transfer:true,can_manage_openings:true}};
  if(name==='get_finance_treasury')return {data:{accounts:accounts.map((a,i)=>({...a,currency:'THB',opening_id:'o'+i,opening_as_of:'2026-08-31T16:59:59.999Z',system_balance:unknown&&i===0?null:1000*(i+1)}))}};
  if(name==='get_finance_unified_company_statement')return {data:{rows:[],count:1,income:10000,expense:280.37,unclassified_count:2}};
  const index=accounts.findIndex(a=>a.bank_account_id===args.p_bank&&a.cash_location_id===args.p_cash);const source=index===0,target=index===1;
  const rows=source||target?Array.from({length:transfers},(_,n)=>({id:(source?'out':'in')+n,transfer_id:'t'+n,kind:'transfer',cash_amount:100,direction:source?'outflow':'inflow',occurred_at:'2026-09-20T12:00:00Z',balance:1000})):[];
  if(broken&&target)rows.pop();
  const all=[...rows,{id:'external'+index,kind:'payment',cash_amount:10400,direction:'inflow',occurred_at:'2026-09-21T12:00:00Z',balance:3000}];
  const selected=(args.p_type==='transfer'?rows:all).sort(activityOrder);
  return {data:{rows:selected.slice(args.p_offset,args.p_offset+50),count:selected.length,inflow:10400+(target?transfers*100:0),outflow:500+(source?transfers*100:0),closing:unknown&&source?null:1000*(index+1),balance_covered:!(unknown&&source)}};
 };return {read,calls};
}
const options={canCash:true,canCompany:true,from:'2026-09-01',to:'2026-09-24',today:'2026-09-25'};
test('Liquidity excludes company economic income/VAT/WHT; transfer counted once and excluded from external flow',async()=>{
 const {read,calls}=adapter(),data=await loadStatementOverview(read,options),t=overviewTotals(data.accounts);
 assert.deepEqual(t,{total:10000,bank:6000,cash:4000,externalIn:41600,externalOut:2000,internal:100,unknown:0});
 assert.equal(data.company.income,10000);assert.equal(data.company.expense,280.37);assert.ok(data.accounts.some(a=>!a.account.is_active),'inactive balances retained');
 assert.equal(calls.filter(c=>c.name==='get_finance_treasury').length,1,'current balances from one authoritative snapshot');
 assert.ok(calls.some(c=>c.name==='get_finance_unified_company_statement'&&c.args.p_from===options.from));
});
test('Over 50 transfer legs use all pages, never page subtotals',async()=>{
 const {read,calls}=adapter({transfers:57}),data=await loadStatementOverview(read,options);
 assert.equal(overviewTotals(data.accounts).internal,5700);assert.equal(overviewTotals(data.accounts).externalIn,41600);assert.equal(overviewTotals(data.accounts).externalOut,2000);
 assert.equal(calls.filter(c=>c.args?.p_type==='transfer'&&c.args.p_offset===50).length,2);
 assert.equal(data.activity.rows.length,10);
});
test('Unknown opening balance never becomes zero or an understated grand total',async()=>{
 const {read}=adapter({unknown:true}),data=await loadStatementOverview(read,options),t=overviewTotals(data.accounts);
 assert.equal(t.total,null);assert.equal(t.bank,null);assert.equal(t.cash,4000);assert.equal(t.unknown,1);
});
test('Missing, duplicate, changed transfer evidence and failed reads fail closed',async()=>{
 await assert.rejects(loadStatementOverview(adapter({broken:true}).read,options),/Incomplete transfer pair/);
 await assert.rejects(loadStatementOverview(adapter({fail:true}).read,options));
 const data=await loadStatementOverview(adapter().read,options);data.accounts[0].transfers.push(data.accounts[0].transfers[0]);assert.throws(()=>overviewTotals(data.accounts),/Invalid transfer evidence/);
 const changing=adapter({transfers:57});await assert.rejects(loadStatementOverview(async(n,a)=>{const r=await changing.read(n,a);if(a?.p_offset===50)r.data.count++;return r;},options),/changed/);
});
test('View permissions do not fetch hidden company or account data; stale reads stop',async()=>{
 const companyOnly=adapter();const company=await loadStatementOverview(companyOnly.read,{...options,canCash:false});assert.equal(companyOnly.calls.length,1);assert.deepEqual(company.accounts,[]);
 const cashOnly=adapter();await loadStatementOverview(cashOnly.read,{...options,canCompany:false});assert.ok(!cashOnly.calls.some(c=>c.name==='get_finance_unified_company_statement'));
 await assert.rejects(loadStatementOverview(adapter().read,options,()=>false),/Stale/);
});
test('Real bank identity with safe generic fallback, account details masked',()=>{
 assert.deepEqual(accounts.map(bankIdentity),['bay','kbank','ktb',null]);assert.equal(bankIdentity({...accounts[0],name_th:'New bank',name_en:'New bank',bank_name:'New bank'}),null);assert.equal(maskedAccount(accounts[0]),'•••• 7890');
});
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs'),{translate}=require('../../lib/i18n/catalog.ts');
const shared=workspaceFixture('app/finance/statement/shared.ts',['accountHref','accountName','monthRange','bangkokToday']),{monthRange,bangkokToday}=shared;
const view=workspaceFixture('app/finance/statement/overview.tsx',['StatementOverview'],{'./shared':shared});
for(const locale of ['th','en'])test('Overview '+locale+' labels, separate sections, dynamic links, unknown/error state',async()=>{
 const data=await loadStatementOverview(adapter().read,options),range=monthRange(),key=`${range.from}:${range.to}:0:true:true:${bangkokToday()}`;
 const html=view.render(locale,{'StatementOverview.result':{key,data}},{canCash:true,canCompany:true},'StatementOverview');
 assert.ok(html.includes(translate(locale,'statement.overview.title')));assert.match(html,/data-testid="liquidity-metrics"/);assert.match(html,/data-testid="company-economics"/);
 for(const p of ['/finance/statement/company','/finance/statement/transfers',...accounts.map(a=>`/finance/statement/account/${a.kind}/${a.account_id}`)])assert.ok(html.includes(p),p);
 assert.doesNotMatch(html,/NaN|undefined|statement\.overview\./);assert.ok(html.includes('9,719.63'));assert.ok(html.includes('10,000.00'));
 const error=view.render(locale,{'StatementOverview.result':{key,error:true}},{canCash:true,canCompany:true},'StatementOverview');assert.match(error,/role="alert"/);assert.ok(!error.includes('10,000.00'));
 const unknown=await loadStatementOverview(adapter({unknown:true}).read,options);const u=view.render(locale,{'StatementOverview.result':{key,data:unknown}},{canCash:true,canCompany:true},'StatementOverview');assert.ok(u.includes(translate(locale,'statement.overview.unknown')));
});
module.exports={accounts,adapter,options};
