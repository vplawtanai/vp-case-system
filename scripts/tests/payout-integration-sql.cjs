/* eslint-disable @typescript-eslint/no-require-imports */
// Deterministic extensions of frozen predecessor contracts. Never edits predecessors.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {definition}=require('./tax-invoice-sql-artifacts.cjs');
const path='supabase/migrations/202607180051_add_payee_payout_foundation.sql';
const old=fs.readFileSync('supabase/migrations/202607180048_add_payable_entitlement_foundation.sql','utf8');
const marker='-- BEGIN GENERATED PAYABLE INTEGRATION';
function sql(){
 let components=definition(old,'payable_frozen_components').replace('create function','create or replace function');
 components=components.replace("if r->>'recipient_kind' is distinct from 'user' or r->>'recipient_user_id' is null", "if not ((r->>'recipient_kind'='user' and r->>'recipient_user_id' is not null) or (r->>'recipient_kind'='external' and r->>'recipient_payee_id' is not null))");
 components=components.replace("r->>'recipient_kind',r->>'recipient_user_id',r->>'role_label'","r->>'recipient_kind',coalesce(r->>'recipient_user_id',r->>'recipient_payee_id'),r->>'role_label'");
 components=components.replace("'recipient_type','user','recipient_id',(r->>'recipient_user_id')::uuid", "'recipient_type',case when r->>'recipient_kind'='user' then 'user' else 'payee' end,'recipient_id',coalesce(r->>'recipient_user_id',r->>'recipient_payee_id')::uuid");
 let transition=definition(old,'payable_distribution_transition').replace('create function','create or replace function');
 transition=transition.replace('perform public.payable_assert_unpaid_contract();',`perform public.payable_assert_unpaid_contract();
   if exists(select 1 from public.finance_payout_allocations a join public.finance_payable_entitlements e on e.id=a.entitlement_id where e.distribution_id=new.id)
   then raise exception 'PAYOUT_SETTLED_DISTRIBUTION_LOCKED'; end if;`);
 let read=definition(old,'get_finance_payable_entitlements').replace('create function','create or replace function');
 read=read.replaceAll("'all','open','superseded'","'all','open','superseded','settled'");
 read=read.replace('with filtered as(select e.* from public.finance_payable_entitlements e',`with effective as(select (jsonb_populate_record(null::public.finance_payable_entitlements,to_jsonb(e)||jsonb_build_object('status',
  case when exists(select 1 from public.finance_payout_allocations a where a.entitlement_id=e.id) then 'settled' else e.status end))).* from public.finance_payable_entitlements e),
 filtered as(select e.* from effective e`);
 return marker+'\n'+components+'\n'+transition+'\n'+read+'\n-- END GENERATED PAYABLE INTEGRATION\n';
}
module.exports={sql};
if(require.main===module){const current=fs.readFileSync(path,'utf8'),base=current.split(marker)[0];if(process.argv.includes('--write'))fs.writeFileSync(path,base+sql());else assert.equal(current,base+sql());}
