/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
require('./receipt-render-fixture.cjs');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');
const { translate } = require('../../lib/i18n/catalog.ts');
const { newDirectInput, newDirectLine, directTotals, validateDirectInput } = require('../../app/finance/direct-money/shared.ts');
const { directVatSelection, directVatPatch, directVatChoiceIncomplete, directVatTreatments, reconciliationResult, directVatMode, directVatQuickPatch, directWhtMode, directWhtQuickPatch, directAmountPatch, hasCustomWhtBase } = require('../../app/finance/direct-money/form-presentation.ts');
const { resolveVatEvidence } = require('../../app/finance/document-decision/shared.ts');
const form = workspaceFixture('app/finance/direct-money/form.tsx', ['DirectMoneyForm', 'DirectAmounts', 'DirectReconciliation', 'DirectLineCalculation']);
function sample() {
  const input = newDirectInput();
  return { ...input, payer_name: 'Synthetic Payer', received_on: '2026-01-01', receiving_bank_account_id: 'synthetic-bank', cash_amount: 10400,
    lines: [{ ...input.lines[0], description: 'Legal fee', reason: 'Directly contracted work', money_nature: 'business_revenue', classification: 'professional_fee', base: 10000,
      vat_applicable: true, vat_rate: 7, wht_applicability: 'applies', wht_base: 10000, wht_rate: 3 }] };
}
test('VAT control covers only deployed treatments; no rate, nature or classification is inferred', () => {
  assert.deepEqual(directVatTreatments, ['unknown', 'standard_rate', 'zero_rated', 'exempt', 'outside_scope', 'disbursement', 'pass_through']);
  const original = newDirectLine(), frozen = structuredClone(original);
  assert.equal(original.money_nature, 'unclassified'); assert.equal(directVatSelection(original), 'unknown');
  for (const treatment of directVatTreatments) {
    const patch = directVatPatch(original, treatment), line = { ...original, ...patch };
    assert.deepEqual(Object.keys(patch).sort(), ['vat_applicable', 'vat_rate', 'vat_treatment_json']);
    assert.equal(line.vat_rate, 0); assert.equal(line.money_nature, 'unclassified'); assert.equal(line.classification, null);
    assert.equal(directVatSelection(line), treatment);
    assert.equal(line.vat_applicable, ['standard_rate', 'zero_rated'].includes(treatment));
    assert.equal(directVatChoiceIncomplete(line), treatment !== 'unknown');
    if (!['standard_rate', 'unknown'].includes(treatment)) {
      line.vat_treatment_json.reason = 'Explicit synthetic evidence';
      assert.equal(resolveVatEvidence(line.vat_treatment_json, line.vat_applicable, line.vat_rate), treatment);
      assert.equal(directVatChoiceIncomplete(line), false);
    }
  }
  assert.deepEqual(original, frozen);
});
test('existing standard-rate and evidence-bearing Drafts are read without normalization or edits', () => {
  const line = sample().lines[0], before = structuredClone(line);
  assert.equal(directVatSelection(line), 'standard_rate'); assert.equal(directVatChoiceIncomplete(line), false);
  assert.deepEqual({ ...line, ...directVatPatch(line, 'standard_rate') }, before);
  for (const treatment of ['zero_rated', 'exempt', 'outside_scope', 'disbursement', 'pass_through']) {
    const stored = { ...line, ...directVatPatch(line, treatment) }; stored.vat_treatment_json.reason = 'Existing evidence';
    assert.equal(directVatSelection(stored), treatment);
    assert.deepEqual({ ...stored, ...directVatPatch(stored, treatment) }, stored);
    const switched = { ...stored, ...directVatPatch(stored, 'standard_rate') };
    assert.equal(switched.vat_rate, 0); assert.equal(switched.vat_treatment_json.reason, '');
    assert.equal(directVatChoiceIncomplete(switched), true);
    switched.vat_rate = 7; assert.equal(directVatChoiceIncomplete(switched), false);
  }
});
test('explicit VAT switching clears incompatible evidence and preserves existing WHT/amount calculations', () => {
  const input = sample(), line = input.lines[0];
  assert.deepEqual(directTotals(input.lines), { base: 10000, vat: 700, gross: 10700, wht: 300, cash: 10400 });
  assert.deepEqual(validateDirectInput(input, '2026-09-14'), {});
  const switched = { ...line, ...directVatPatch(line, 'exempt') };
  assert.equal(switched.vat_applicable, false); assert.equal(switched.vat_rate, 0);
  assert.deepEqual([switched.wht_base, switched.wht_rate, switched.money_nature, switched.classification], [10000, 3, 'business_revenue', 'professional_fee']);
  assert.ok(validateDirectInput({ ...input, lines: [switched] }, '2026-09-14')['line.0.vat']);
  switched.vat_treatment_json.reason = 'Explicit exemption';
  assert.deepEqual(directTotals([switched]), { base: 10000, vat: 0, gross: 10000, wht: 300, cash: 9700 });
  assert.ok(validateDirectInput({ ...input, lines: [switched] }, '2026-09-14').reconcile);
  assert.deepEqual(validateDirectInput({ ...input, cash_amount: 9700, lines: [switched] }, '2026-09-14'), {});
});
test('reconciliation reports absolute cent differences; missing inputs and empty zero totals cannot pass', () => {
  for (const [parts, gross] of [[[10400, 300], 10700], [[10000, 700], 10700], [[4859.81, 140.19], 5000], [[.1, .2], .3]]) assert.deepEqual(reconciliationResult(parts, gross), { matches: true, difference: 0 });
  assert.deepEqual(reconciliationResult([10399.99, 300], 10700), { matches: false, difference: .01 });
  assert.deepEqual(reconciliationResult([10400.01, 300], 10700), { matches: false, difference: .01 });
  assert.deepEqual(reconciliationResult([10000, 650], 10700), { matches: false, difference: 50 });
  for (const [parts, gross] of [[[0, 0], 0], [[10400, null], 10700], [[NaN, 0], 1], [[1, 0], null], [[-1, 0], 1]]) assert.deepEqual(reconciliationResult(parts, gross), { matches: false, difference: null });
});
for (const locale of ['th', 'en']) test(`${locale}: one amount, tax quick choices, read-only calculation and expanded evidence`, () => {
  const input = sample(); const html = form.render(locale, { 'DirectMoneyForm.form': input, 'DirectMoneyForm.loading': false }, {}, 'DirectMoneyForm');
  assert.ok(html.includes(translate(locale, 'directMoney.actualCash')));
  assert.doesNotMatch(html, /<dt>(?:Cash|เงินสด)<\/dt>|Actual cash|อยู่ในระบบ VAT|before issuing a document|ก่อนออกเอกสาร/);
  assert.match(html, /<details class="[^"]*optional">/);
  const optional = html.match(/<details[^>]*>([\s\S]*?)<\/details>/)[1];
  for (const key of ['optional', 'matter', 'reference', 'evidence', 'note']) assert.ok(optional.includes(translate(locale, 'directMoney.' + key)), key);
  for (const key of ['date', 'method', 'account', 'actualCash', 'client', 'payer']) assert.ok(html.split('<details')[0].includes(translate(locale, 'directMoney.' + key)), key);
  assert.ok(html.includes(translate(locale, 'directMoney.lineReasonRequired')));
  assert.ok(html.includes(translate(locale, 'directMoney.vatQuick')));
  assert.ok(html.includes(translate(locale, 'directMoney.whtQuick')));
  assert.ok(!html.includes(translate(locale, 'directMoney.vatRate')));
  assert.ok(!html.includes(translate(locale, 'directMoney.whtRate')));
  assert.ok(!html.includes(translate(locale, 'directMoney.vatReason')));
  assert.equal((html.match(/type="number"/g)||[]).length,1,'actual received is the only editable money amount in the common single-line path');
  assert.doesNotMatch(html,new RegExp(`<label[^>]*>${translate(locale,'directMoney.amountBeforeTax')}</label>`));
  assert.equal((html.match(/role="radiogroup"/g)||[]).length,2);
  assert.equal((html.match(new RegExp(translate(locale, 'directMoney.matched'), 'g')) || []).length, 3);
  assert.match(html, /title="[^"]+" aria-label="[^"]+ 1" disabled=""/);
  const failed = form.render(locale, {}, { label: 'Before VAT + VAT', parts: [10000, 650], gross: 10700 }, 'DirectReconciliation');
  assert.ok(failed.includes(translate(locale, 'directMoney.notMatched'))); assert.ok(failed.includes('50.00 THB'));
});
test('common explicit VAT/WHT choices derive all four UAT combinations without manual tax amounts', () => {
  for (const [vat,wht,expected] of [['7','3',{base:10000,vat:700,gross:10700,wht:300,cash:10400}],['non_vat','none',{base:10000,vat:0,gross:10000,wht:0,cash:10000}],['7','none',{base:10000,vat:700,gross:10700,wht:0,cash:10700}],['non_vat','3',{base:10000,vat:0,gross:10000,wht:300,cash:9700}]]) {
    let line={...newDirectLine(),base:10000};line={...line,...directVatQuickPatch(line,vat)};line={...line,...directWhtQuickPatch(line,wht)};
    assert.equal(line.money_nature,'unclassified');assert.equal(line.classification,null);
    if(vat==='non_vat'){assert.equal(directVatSelection(line),'unknown');line={...line,...directVatPatch(line,'exempt')};line.vat_treatment_json.reason='Explicit exemption';}
    assert.deepEqual(directTotals([line]),expected);assert.equal(reconciliationResult([expected.cash],directTotals([line]).cash).matches,true);
    assert.equal(directWhtMode(line),wht);assert.equal(directVatMode(line),vat);
  }
});
test('amount edits follow the full-line WHT basis; stored or explicitly custom bases are never overwritten', () => {
  let line={...newDirectLine(),...directWhtQuickPatch(newDirectLine(),'3')};
  line={...line,...directAmountPatch(line,10000)};assert.equal(line.wht_base,10000);assert.equal(line.wht_rate,3);
  line={...line,...directAmountPatch(line,20000)};assert.equal(line.wht_base,20000);
  const custom={...line,wht_base:5000};assert.equal(hasCustomWhtBase(custom),true);
  assert.equal(directAmountPatch(custom,30000).wht_base,undefined);
  assert.equal(directWhtQuickPatch(custom,'5').wht_base,5000);
  assert.equal(directAmountPatch(line,30000,true).wht_base,undefined);
  assert.deepEqual(directWhtQuickPatch(custom,'none'),{wht_applicability:'does_not_apply',wht_base:null,wht_rate:null});
});
test('zero-rated and custom treatments require existing evidence; custom WHT keeps controlled rate precision', () => {
  let line={...sample().lines[0],...directVatQuickPatch(sample().lines[0],'0')};
  assert.equal(directVatChoiceIncomplete(line),true);line.vat_treatment_json.reason='Explicit zero-rate evidence';assert.equal(directVatChoiceIncomplete(line),false);
  assert.deepEqual(directVatQuickPatch(line,'other'),{});
  line={...line,...directVatPatch(line,'standard_rate'),vat_rate:10,...directWhtQuickPatch(line,'other'),wht_rate:1.25};
  assert.equal(directWhtMode(line),'other');assert.equal(directVatMode(line),'other');
  assert.deepEqual(directTotals([line]),{base:10000,vat:1000,gross:11000,wht:125,cash:10875});
  assert.deepEqual(validateDirectInput({...sample(),cash_amount:10875,lines:[line]},'2026-09-14'),{});
});
test('multi-line receipts sum expected money once and keep non-revenue classification independent', () => {
  let a=sample().lines[0],b={...newDirectLine(),description:'Client money',reason:'Held for client',money_nature:'client_money',base:2000};
  b={...b,...directWhtQuickPatch(b,'none'),...directVatPatch(b,'outside_scope')};b.vat_treatment_json.reason='Explicit scope evidence';
  const totals=directTotals([a,b]);assert.deepEqual(totals,{base:12000,vat:700,gross:12700,wht:300,cash:12400});assert.equal(b.classification,null);
  assert.equal(reconciliationResult([12400],totals.cash).matches,true);assert.equal(reconciliationResult([10400],totals.cash).difference,2000);
  const before=JSON.stringify([a,b]);directVatMode(a);directWhtMode(a);directTotals([a,b]);assert.equal(JSON.stringify([a,b]),before);
});
test('existing save RPC/version/idempotency and validator remain authoritative; no new lifecycle entry', () => {
  const source = fs.readFileSync('app/finance/direct-money/form.tsx', 'utf8');
  assert.match(source, /validateDirectInput\(input, today\)/);
  assert.match(source, /save_finance_direct_money_receipt", \{ p_id: id.current, p_expected_version: version, p_input: input \}/);
  assert.match(source, /const input = prepared.input/);
  assert.match(source, /lock.current \|\| loading \|\| lookupFailed/);
  assert.doesNotMatch(source, /\.from\([^)]*\)\.(insert|update|delete)|transition_finance|issue_finance/);
});
