/* eslint-disable @typescript-eslint/no-require-imports */
require('./receipt-render-fixture.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),fs=require('node:fs');
const {fixture}=require('./payout-fixture.cjs'),{workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {translate}=require('../../lib/i18n/catalog.ts');
const f=fixture(),payee=f.payees[0],bank=f.accounts[0],rows=f.components;
payee.destination={...payee.destination,bank_name:'Synthetic KTB',account_number:'1234566789'};
const rates={[rows[0].id]:'0',[rows[1].id]:'3'};
f.payout={id:'synthetic-draft',status:'draft',payee_id:payee.id,paid_on:'2026-09-18',choices_json:[],note:'',version:1};
const page=workspaceFixture('app/finance/payouts/workspace.tsx',['PayoutWorkspace'],{'./payee-modal':{PayeeModal:()=>null},'../../components/DetailModal':{default:({open,children})=>open?React.createElement('div',{'data-test-modal':true},children):null}});
const controls={'PayoutWorkspace.selected':rows.map(r=>r.id),'PayoutWorkspace.rates':rates,'PayoutWorkspace.accountKey':'bank:'+bank.account_id,'PayoutWorkspace.paidOn':'2026-09-18','PayoutWorkspace.modal':'confirm'};
const render=(locale,extra={},data=f)=>page.render(locale,{...controls,...extra},{id:data.payout.id,payeeId:payee.id,fixture:data},'PayoutWorkspace').split('data-test-modal="true"')[1];
const money=(locale,n)=>n.toLocaleString(locale,{minimumFractionDigits:2,maximumFractionDigits:2})+' THB';
const finalButton=(html,label)=>html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g).find(b=>b.includes(label));

for(const locale of ['th','en']){
 const t=(key,params)=>translate(locale,'payout.'+key,params);
 test(`${locale}: final modal identifies the actual payee/account/date and reuses live Treasury preview`,()=>{
  const html=render(locale);
  for(const value of [payee.legal_name,'Synthetic KTB','••••6789',locale==='th'?bank.name_th:bank.name_en])assert.ok(html.includes(value),value);
  assert.ok(!html.includes('1234566789'));
  const balance=html.split('data-confirmation-balance="true"')[1].split('</dl>')[0];
  for(const key of ['before','outflow','after'])assert.ok(balance.includes(t(key)),key);
  for(const amount of [29560,3069.08,26490.92])assert.ok(balance.includes(money(locale,amount)),amount);
  assert.ok(html.includes(t('balanceHelp')));
  assert.ok(html.includes(t('paidBankAck',{amount:money(locale,3069.08),destination:'••••6789'})));
  assert.ok(html.includes(t('confirmHelp')));
 });
 test(`${locale}: either unchecked acknowledgement blocks confirmation, both required and busy still blocks`,()=>{
  for(const [ack,paidAck] of [[false,false],[true,false],[false,true],[true,true]]){
   const html=render(locale,{'PayoutWorkspace.ack':ack,'PayoutWorkspace.paidAck':paidAck}),button=finalButton(html,t('confirm'));
   assert.equal((html.match(/type="checkbox"/g)||[]).length,2);
   assert.equal(button.includes('disabled=""'),!ack||!paidAck);
   assert.equal(button.includes('aria-describedby="payout-confirm-ack-required"'),!ack||!paidAck);
   assert.equal(html.includes(t('ackRequired')),!ack||!paidAck);
   assert.ok(html.includes(t('ackReviewed')));
  }
  const busy=render(locale,{'PayoutWorkspace.ack':true,'PayoutWorkspace.paidAck':true,'PayoutWorkspace.busy':true});
  assert.ok(finalButton(busy,t('confirm')).includes('disabled=""'));
 });
 test(`${locale}: exact live consequences, not fixture constants or extra financial effects`,()=>{
  const html=render(locale),effects=html.split('data-confirmation-effects="true"')[1].split('</ul>')[0];
  for(const [key,params] of [['effectRights',{count:2,amount:money(locale,3104)}],['effectOutflow',{account:locale==='th'?bank.name_th:bank.name_en,amount:money(locale,3069.08)}],['effectWht',{amount:money(locale,34.92)}],['effectConfirmed'],['effectReadOnly']])assert.ok(effects.includes(t(key,params)),key);
  assert.equal((effects.match(/<li>/g)||[]).length,5);
  const changed=render(locale,{'PayoutWorkspace.selected':[rows[0].id],'PayoutWorkspace.rates':{[rows[0].id]:'5'}},{...f,accounts:[{...bank,system_balance:9000}]});
  for(const n of [1940,97,1843,9000,7157])assert.ok(changed.includes(money(locale,n)),n);
  assert.ok(changed.includes(t('effectRights',{count:1,amount:money(locale,1940)})));
  assert.ok(!changed.includes(money(locale,3069.08)));
 });
 test(`${locale}: Office Cash and zero WHT do not promise a transfer or nonexistent WHT creation`,()=>{
  const cash={...bank,kind:'cash',account_id:'office',bank_account_id:null,cash_location_id:'office',name_th:'เงินสดสำนักงาน',name_en:'Office Cash'};
  const html=render(locale,{'PayoutWorkspace.accountKey':'cash:office','PayoutWorkspace.rates':Object.fromEntries(rows.map(r=>[r.id,'0']))},{...f,accounts:[cash]});
  assert.ok(html.includes(t('paidCashAck',{amount:money(locale,3104),payee:payee.legal_name})));
  assert.ok(!html.includes('••••6789'));assert.ok(!html.includes('Synthetic KTB'));
  const effects=html.split('data-confirmation-effects="true"')[1].split('</ul>')[0];
  assert.equal((effects.match(/<li>/g)||[]).length,4);assert.ok(!effects.includes(t('effectWht',{amount:money(locale,0)})));
 });
 test(`${locale}: cancellation still has its original single acknowledgement`,()=>{
  for(const ack of [false,true]){
   const html=render(locale,{'PayoutWorkspace.modal':'cancel','PayoutWorkspace.ack':ack,'PayoutWorkspace.paidAck':false});
   assert.equal((html.match(/type="checkbox"/g)||[]).length,1);
   assert.equal(finalButton(html,t('cancelConfirm')).includes('disabled=""'),!ack);
   assert.ok(!html.includes('data-confirmation-effects'));assert.ok(!html.includes(t('ackRequired')));
  }
 });
}
test('Existing RPC evidence contract retained; both UI acknowledgements reset on opening and guard dispatch',()=>{
 const source=fs.readFileSync('app/finance/payouts/workspace.tsx','utf8');
 assert.match(source,/if \(action === "confirm" && \(!ack \|\| !paidAck\)\) return;/);
 assert.match(source,/setAck\(false\); setPaidAck\(false\); setModal\("confirm"\)/);
 assert.match(source,/confirm_finance_payout", \{ p_id: p!\.id, p_expected_version: p!\.version, p_expected_payee_version: payee!\.version, p_expected_destination_id: payee!\.destination\?\.id \|\| null, p_acknowledged: ack \}/);
 assert.equal((source.match(/account\.system_balance - values\.net/g)||[]).length,1);
 assert.doesNotMatch(source,/\.from\(|\.insert\(|\.update\(|\.delete\(/);
});
