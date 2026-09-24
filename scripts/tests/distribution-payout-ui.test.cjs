/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs'),{translate}=require('../../lib/i18n/catalog.ts');
const fixture=require('./distribution-payout-fixture.json');
const detail=workspaceFixture('app/finance/revenue-distribution/detail.tsx',['RevenueDetail'],{'./participant-payment':{ParticipantPayment:()=>null}});
for(const locale of ['th','en'])test('068 '+locale+' participant actions/status, company excluded and readonly',()=>{
 const c=structuredClone(fixture.detail),w=k=>translate(locale,'revenueDistribution.'+k),render=data=>detail.render(locale,{'RevenueDetail.data':data},{sourceType:'direct_money_receipt',sourceId:c.summary.source_id},'RevenueDetail');
 let html=render(c);assert.equal((html.match(new RegExp('>'+w('pay')+'</button>','g'))||[]).length,2);assert.ok(html.includes(w('company')));
 c.participants[0]={...c.participants[0],payout_id:'synthetic',paid_on:'2026-09-24',account:'Dynamic Company Bank',net_amount:1940,wht_amount:60};c.summary.state='partial';html=render(c);assert.ok(html.includes(w('participantPaid')));assert.ok(html.includes('Dynamic Company Bank'));assert.ok(html.includes('1,940.00'));assert.equal((html.match(new RegExp('>'+w('pay')+'</button>','g'))||[]).length,1);
 c.can_manage=false;assert.ok(!render(c).includes('>'+w('pay')+'</button>'));
});
test('068 modal uses existing payout arithmetic and explicit WHT, no incoming tax reuse or direct table writes',()=>{
 const ui=fs.readFileSync('app/finance/revenue-distribution/participant-payment.tsx','utf8');assert.match(ui,/payoutMath/);assert.match(ui,/\[rate, setRate\] = useState\(""\)/);assert.match(ui,/p_acknowledged: true/);assert.match(ui,/p_request_id: requestId/);assert.match(ui,/if \(lock.current/);assert.doesNotMatch(ui,/\.from\(|\.insert\(|\.update\(|summary\.wht|source\.wht/);
 const queue=fs.readFileSync('app/finance/payables/multi-source.tsx','utf8');assert.doesNotMatch(queue,/get_finance_payable_entitlements|<PayableGroups/);assert.match(queue,/get_finance_expense_obligations/);
});
test('068 private engine is extracted exactly; only explicit outflow destination/trace changes, old entry delegates strict mode',()=>{
 const candidate=fs.readFileSync('supabase/migrations/202607180068_add_distribution_participant_payout.sql','utf8'),old=fs.readFileSync('supabase/migrations/202607180051_add_payee_payout_foundation.sql','utf8');
 const original=old.slice(old.indexOf('create function public.confirm_finance_payout('),old.indexOf('create function public.cancel_finance_payout('));
 const engine=candidate.slice(candidate.indexOf('create function public.payout_confirm_distribution_outflow('),candidate.indexOf('create or replace function public.confirm_finance_payout_before_expense('));
 let restored=engine.replace('public.payout_confirm_distribution_outflow(','public.confirm_finance_payout(').replace(',p_actual_outflow_only boolean)',')').replace("p.id is null or p.source_model<>'revenue_distribution_v1'","p.id is null").replace('not p_actual_outflow_only and p.bank_account_id','p.bank_account_id').replace('p.bank_account_id is not null and dest.id is not null then to_jsonb(dest)','p.bank_account_id is not null then to_jsonb(dest)').replace(" if p_actual_outflow_only then snapshot:=snapshot||jsonb_build_object('entry_point','distribution_participant','actual_company_cash_moved',true); end if;\n",'');
 assert.equal(restored,original);assert.match(candidate,/p_expected_destination_id,p_acknowledged,false/);assert.doesNotMatch(candidate,/\b(create table|alter table|delete from)\b/i);
});
