/* eslint-disable @typescript-eslint/no-require-imports */
const {fixture:payables}=require('./payable-fixture.cjs');
function fixture(){const group=payables().groups[0];return {can_manage:true,payout:null,
 payees:[{id:group.recipient_id,profile_id:group.recipient_id,kind:'internal',legal_name:'แพม / Pam',entity_type:'natural_person',tax_id:'1234567890123',is_active:true,version:1,
 destination:{id:'40000000-0000-4000-8000-000000000001',bank_name:'KBANK',account_name:'Synthetic Pam',account_number:'1234567890'}}],components:group.components,
 accounts:[{kind:'bank',account_id:'40000000-0000-4000-8000-000000000002',bank_account_id:'40000000-0000-4000-8000-000000000002',cash_location_id:null,name_th:'KBANK - บัญชีหลักสำนักงาน',name_en:'KBANK - Office account',account_number:'0000000000',bank_name:'Synthetic Bank',currency:'THB',is_active:true,opening_id:'40000000-0000-4000-8000-000000000003',opening_as_of:'2026-08-31T16:59:59.999999Z',system_balance:29560}],history:[]};}
module.exports={fixture};
