/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict');
require('./receipt-render-fixture.cjs');
const { newDirectInput, newDirectLine, directLineAmounts, directTotals, validateDirectInput } = require('../../app/finance/direct-money/shared.ts');
const { deriveCashLine, initialCashAllocations, allocateActualMoney, prepareCashEntry } = require('../../app/finance/direct-money/cash-entry.ts');
const { distributionSourceProven, initialDistributionChoices } = require('../../app/finance/payments/vp-distribution.ts');
function line(vat = 7, wht = 3) {
  return { ...newDirectLine(), description: 'Synthetic service', reason: 'Reviewed source', money_nature: 'business_revenue', classification: 'professional_fee',
    vat_applicable: vat > 0, vat_rate: vat, vat_treatment_json: { schema_version: 1, treatment: vat > 0 ? 'standard_rate' : 'exempt', reason: 'Explicit evidence' },
    wht_applicability: wht ? 'applies' : 'does_not_apply', wht_rate: wht || null };
}
test('single-line actual money alone derives all four standard VAT/WHT cases', () => {
  for (const [cash,v,w,vat,wht,gross] of [[10400,7,3,700,300,10700],[10000,0,0,0,0,10000],[10700,7,0,700,0,10700],[9700,0,3,0,300,10000]]) {
    const input = { ...newDirectInput(), cash_amount: cash, payer_name: 'Synthetic payer', received_on: '2026-01-01', receiving_bank_account_id: 'synthetic', lines: [line(v,w)] };
    const prepared = prepareCashEntry(input, {}, {}, {});
    assert.equal(prepared.valid,true);assert.deepEqual(directTotals(prepared.input.lines),{base:10000,vat,wht,gross,cash});
    assert.deepEqual(validateDirectInput(prepared.input,'2026-09-14'),{});assert.equal(input.lines[0].base,0,'no mutation of input evidence');
  }
});
test('exact decimal inverse verifies shared rounding, including nearby-cent solutions and custom rates', () => {
  for (const [v,w] of [[7,0],[7,1],[7,2],[7,3],[7,5],[0,3],[10,1.25],[0,99.9999],[0.0001,0]]) {
    for (let cents=17;cents<100000;cents+=137) {
      const source={...line(v,w),base:cents/100,wht_base:w?cents/100:null},amounts=directLineAmounts(source);
      if(amounts.cash===null||amounts.cash<=0)continue;
      const numericVat=Number((BigInt(cents)*BigInt(Math.round(v*10000))+BigInt(500000))/BigInt(1000000))/100;
      if(amounts.vat!==numericVat)continue; // A legacy floating-point midpoint is not authoritative numeric evidence.
      const result=deriveCashLine({...source,base:0,wht_base:null},amounts.cash);
      assert.equal(result.error,null,JSON.stringify({v,w,cents,cash:amounts.cash}));
      assert.equal(directLineAmounts(result.line).cash,amounts.cash);
    }
  }
  const custom=deriveCashLine(line(10,1.25),10875);assert.equal(custom.line.base,10000);assert.equal(custom.error,null);
});
test('unrepresentable satang, excessive precision, unresolved treatment and impossible rates fail closed', () => {
  assert.equal(deriveCashLine(line(7,0),.08).error,'reverseUnresolved');
  assert.equal(deriveCashLine(line(10,1.25),110.44).error,'reverseUnresolved','shared-calculator/numeric disagreement cannot silently alter received money');
  assert.equal(deriveCashLine(line(0,100),100).error,'reverseUnresolved');
  for(const cash of [null,0,-1,NaN,Infinity,10400.001])assert.equal(deriveCashLine(line(),cash).error,'amountInvalid');
  assert.equal(deriveCashLine({...line(),vat_treatment_json:null,vat_applicable:false,vat_rate:0},10400).error,'vatRequired');
  assert.equal(deriveCashLine({...line(),wht_applicability:'unknown'},10400).error,'whtRequired');
  assert.equal(deriveCashLine(line(7,3.00001),10400).error,'whtInvalid');
});
test('saved and custom-base evidence is preserved; exceptional manual evidence cannot override actual money', () => {
  const stored={...line(),base:10000,wht_base:10000};assert.strictEqual(deriveCashLine(stored,10400).line,stored);
  const custom={...stored,wht_base:5000};assert.strictEqual(deriveCashLine(custom,10550,true).line,custom);
  const changed=deriveCashLine(custom,12690,true);assert.equal(changed.error,null);assert.equal(changed.line.base,12000);assert.equal(changed.line.wht_base,5000);
  assert.equal(deriveCashLine({...custom,wht_base:50000},10400,true).error,'reverseUnresolved');
  assert.equal(deriveCashLine(stored,10500,false,true).error,'reverseUnresolved');
  const plateau={...line(0,3),base:.17,wht_base:.17};assert.strictEqual(deriveCashLine(plateau,.16).line,plateau);
});
test('multi-line actual allocation uses the exact last-line remainder and rejects over/missing allocations', () => {
  const a=line(),b={...line(0,0),money_nature:'client_money',classification:null};
  const input={...newDirectInput(),cash_amount:12400,lines:[a,b]};
  const choices={[a.source_line_id]:10400};const prepared=prepareCashEntry(input,choices,{},{});
  assert.equal(prepared.valid,true);assert.deepEqual(prepared.allocation.amounts,[10400,2000]);assert.equal(prepared.input.lines[0].base,10000);assert.equal(prepared.input.lines[1].base,2000);
  assert.deepEqual(directTotals(prepared.input.lines),{base:12000,vat:700,wht:300,gross:12700,cash:12400});
  const restored=initialCashAllocations(prepared.input);assert.deepEqual(prepareCashEntry(prepared.input,restored,{},{}).input,prepared.input);
  assert.equal(allocateActualMoney(input,{}).valid,false);assert.equal(allocateActualMoney(input,{[a.source_line_id]:12400}).valid,false);
  assert.equal(allocateActualMoney(input,{[a.source_line_id]:13000}).remainder,null);
  const c=line(0,0),three={...input,lines:[a,b,c]};assert.deepEqual(allocateActualMoney(three,{[a.source_line_id]:10400,[b.source_line_id]:1000}).amounts,[10400,1000,1000]);
  assert.deepEqual(allocateActualMoney({...input,cash_amount:.3},{[a.source_line_id]:.1}).amounts,[.1,.2]);
});
test('derived professional evidence still supplies the unchanged VP pool; nature is never inferred', () => {
  const result=deriveCashLine(line(),10400),amounts=directLineAmounts(result.line);
  const source={schema_version:1,policy_version:'vp_distribution_v1',money_source:null,money_allocation:null,
    received_money_source:{status:'confirmed',currency:'THB'},lines:[{...result.line,...amounts,professional_pool:9700}],totals:{},blockers:[]};
  assert.equal(amounts.base-amounts.wht,9700);assert.equal(distributionSourceProven(source),true);
  assert.equal(initialDistributionChoices({source,source_current:true,current:null})[0].source_line_id,result.line.source_line_id);
  for(const nature of ['client_money','owner_or_partner_funding','loan_or_deposit','reimbursement_or_pass_through','other_non_revenue','unclassified']) {
    const raw={...line(0,0),money_nature:nature,classification:null},derived=deriveCashLine(raw,10000);
    assert.equal(derived.line.money_nature,nature);assert.equal(derived.line.classification,null);
    assert.equal(distributionSourceProven({...source,blockers:['direct_'+nature]}),false);
  }
});
