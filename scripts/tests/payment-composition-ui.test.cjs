/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),React=require('react');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {fixture}=require('./money-allocation-fixture.cjs');
const {translate}=require('../../lib/i18n/catalog.ts');
const component=workspaceFixture('app/finance/payments/money-allocation-panel.tsx',['MoneyAllocationPanel'],{
 '../../components/DetailModal':{default:({open,title,children})=>open?React.createElement('div',{role:'dialog'},title,children):null},
});
test('044 normal UI is read-only Payment Composition for Admin and Partner in TH/EN',()=>{
 for(const locale of ['th','en'])for(const manage of [true,false]){
  const context=fixture();context.can_manage=manage;
  context.source.invoices=[{invoice_id:'synthetic-invoice',invoice_no:'VP-IV-FIXTURE',gross:19280,settlement:19280}];
  const html=component.render(locale,{'MoneyAllocationPanel.context':context,'MoneyAllocationPanel.open':true,'MoneyAllocationPanel.loading':false},{paymentId:'synthetic-payment'},'MoneyAllocationPanel');
  assert.ok(html.includes(translate(locale,'moneyAllocation.title')));
  assert.ok(html.replaceAll('&#x27;',"'").includes(translate(locale,'moneyAllocation.coverage')));
  assert.doesNotMatch(html,/<input|<select|<textarea/);
  for(const key of ['save','review','finalize','supersede'])assert.ok(!html.includes(translate(locale,'moneyAllocation.'+key)));
  for(const amount of ['19,280.00','19,160.00','607.10','120.00','18,672.90'])assert.ok(html.includes(amount));
 }
 const source=fs.readFileSync('app/finance/payments/money-allocation-panel.tsx','utf8');
 assert.deepEqual([...new Set([...source.matchAll(/supabase\.rpc\("([^"]+)"/g)].map(m=>m[1]))],['get_finance_money_allocation']);
 assert.doesNotMatch(source,/supabase\.from|save_finance_|transition_finance_/);
});
