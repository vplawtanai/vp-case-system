/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), React = require('react');
require('./receipt-render-fixture.cjs');
const { fixture, record } = require('./vp-distribution-fixture.cjs');
const helper = require('../../app/finance/payments/vp-distribution.ts');
const { vpDistributionMessages } = require('../../lib/i18n/messages/vp-distribution.ts');
const { translate } = require('../../lib/i18n/catalog.ts');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');
const component = workspaceFixture('app/finance/payments/vp-distribution-panel.tsx', ['VpDistributionEvidence', 'VpDistributionPanel'], {
  '../../components/DetailModal': { default: ({ open, title, children, footer }) => open ? React.createElement('div', { role: 'dialog' }, title, children, footer) : null },
});
const fields = helper.distributionFields;
test('045 fixed amounts accept 0-2 decimals, reject overprecision/negative/exponents without rounding', () => {
  for (const value of ['100', '100.0', '100.00']) assert.equal(helper.distributionCents(value), 10000);
  assert.equal(helper.distributionCents('0.01'), 1);
  for (const value of ['', '-1', '-0.00', '1.001', '1e2', '1,000', 'NaN', 'Infinity', ' 1 ', '1.', '900719925474099.99']) assert.equal(helper.distributionCents(value), null, value);
});
test('045 expected locator distinguishes first create, current edits, and replacement after supersession', () => {
  const c = fixture();
  assert.deepEqual(helper.distributionExpected(c), { p_expected_id: null, p_expected_version: null });
  c.current = record(c); c.current.version = 3;
  assert.deepEqual(helper.distributionExpected(c), { p_expected_id: c.current.id, p_expected_version: 3 });
  c.current.status = 'superseded'; c.current.version = 4; c.history = [c.current]; c.current = null;
  assert.deepEqual(helper.distributionExpected(c), { p_expected_id: 'synthetic-distribution', p_expected_version: 4 });
});
test('045 partial drafts allowed; exact per-line pool required at review; payload contains JSON numbers only', () => {
  const c = fixture(), choices = helper.initialDistributionChoices(c);
  assert.equal(choices.length, 1);
  assert.equal(helper.distributionDraftValid(c.source, choices), true);
  assert.equal(helper.distributionReviewComplete(c.source, choices), false);
  choices[0].referral_amount = '100.0';
  assert.equal(helper.distributionDraftValid(c.source, choices), true);
  choices[0].company_share_amount = '200'; choices[0].work_compensation_amount = '9700.00';
  assert.equal(helper.distributionReviewComplete(c.source, choices), true);
  const payload = helper.distributionPayload(c.source, choices);
  assert.deepEqual(payload[0], { invoice_item_id: 'synthetic-line-1', referral_amount: 100, company_share_amount: 200, work_compensation_amount: 9700 });
  choices[0].work_compensation_amount = '9700.01';
  assert.equal(helper.distributionDraftValid(c.source, choices), false);
  assert.throws(() => helper.distributionPayload(c.source, choices), /CHOICES_INVALID/);
  choices[0].work_compensation_amount = '9699.99';
  assert.equal(helper.distributionDraftValid(c.source, choices), true);
  assert.equal(helper.distributionReviewComplete(c.source, choices), false);
  assert.equal(helper.distributionDraftValid(c.source, [...choices, choices[0]]), false);
  assert.equal(helper.distributionDraftValid(c.source, [{ ...choices[0], invoice_item_id: 'synthetic-line-0' }]), false);
});
test('045 professional pool is before-VAT less attributable WHT, with/without VAT/WHT', () => {
  for (const [vat, wht] of [[0, 0], [700, 0], [700, 300], [0, 300]]) {
    const c = fixture(), line = c.source.lines[1];
    Object.assign(line, { vat, wht, cash: 10000 + vat - wht, professional_pool: 10000 - wht });
    const choices = helper.initialDistributionChoices(c); choices[0].work_compensation_amount = String(10000 - wht);
    assert.equal(helper.distributionReviewComplete(c.source, choices), true);
    choices[0].work_compensation_amount = String(10000 + vat);
    if (vat || wht) assert.equal(helper.distributionReviewComplete(c.source, choices), false);
    line.professional_pool += 0.01;
    assert.equal(helper.distributionSourceProven(c.source), false);
  }
});
test('045 all supported nonprofessional classifications route directly; unknown never inferred from description', () => {
  for (const classification of helper.directCompanyClassifications) {
    const c = fixture(); c.source.lines[0].classification = classification;
    assert.equal(helper.distributionSourceProven(c.source), true);
    assert.equal(helper.initialDistributionChoices(c).length, 1);
  }
  for (const classification of [null, 'unknown', 'travel_fee', 'client_money']) {
    const c = fixture(); c.source.lines[1].classification = classification;
    assert.equal(helper.distributionSourceProven(c.source), false);
    assert.equal(helper.initialDistributionChoices(c).length, 0);
    const html = component.render('en', {}, { source: { ...c.source, lines: [c.source.lines[1]] }, choices: [], editable: true }, 'VpDistributionEvidence');
    assert.match(html, /Unsupported classification/); assert.doesNotMatch(html, /full economic base to company|<input|<select/);
  }
  const c = fixture(); c.source.lines = c.source.lines.filter(line => line.classification !== 'professional_fee');
  assert.equal(helper.distributionReviewComplete(c.source, []), true);
});
test('045 stale reviewed/finalized/superseded always retain frozen source and amounts', () => {
  for (const status of ['reviewed', 'finalized', 'superseded']) {
    const c = fixture(); c.current = record(c, status); c.history = [c.current]; c.source_current = false;
    c.source.lines[1].description = 'CHANGED LIVE DESCRIPTION'; c.source.lines[1].professional_pool = 1;
    c.source.money_source.payment.status = 'reversed';
    assert.equal(helper.distributionSource(c), c.current.source_snapshot_json);
    assert.equal(helper.initialDistributionChoices(c)[0].work_compensation_amount, '6000.00');
    for (const locale of ['th', 'en']) {
      const html = component.render(locale, { 'VpDistributionPanel.context': c, 'VpDistributionPanel.open': true,
        'VpDistributionPanel.loading': false, 'VpDistributionPanel.choices': helper.initialDistributionChoices(c), 'VpDistributionPanel.note': c.current.note }, { paymentId: 'synthetic-payment' }, 'VpDistributionPanel');
      assert.ok(html.includes('10,000.00')); assert.ok(html.includes('6,000.00'));
      assert.doesNotMatch(html, /CHANGED LIVE DESCRIPTION|<select|inputMode="decimal"/);
      assert.ok(html.includes('Synthetic frozen note'));
    }
  }
});
test('045 source blockers, reversed status and missing source fail closed with safe TH/EN messages', () => {
  const blockers = ['partial_line_evidence_missing', 'classification_unsupported', 'frozen_economic_evidence_invalid', 'money_allocation_conflict', 'money_allocation_stale', 'cash_reconciliation_invalid', 'secret_new_backend_code'];
  for (const blocker of blockers) {
    const c = fixture(); c.source.blockers = [blocker];
    assert.equal(helper.distributionSourceProven(c.source), false);
    for (const locale of ['th', 'en']) {
      assert.doesNotMatch(helper.distributionBlocker(blocker, locale), /secret_new_backend_code|vpDistribution\.|moneyAllocation\./);
      if (locale === 'th') assert.match(helper.distributionBlocker(blocker, locale), /[\u0E00-\u0E7F]/);
    }
  }
  const c = fixture(); c.source.money_source.payment.status = 'reversed'; assert.equal(helper.distributionSourceProven(c.source), false);
  c.source.money_source = null; c.source.lines = []; c.source.blockers = ['money_source_unavailable'];
  assert.equal(helper.distributionSourceProven(c.source), false);
  assert.doesNotThrow(() => component.render('th', {}, { source: c.source, choices: [] }, 'VpDistributionEvidence'));
});
test('045 localized render separates economic base, cash, VAT, WHT and professional splits; partner readonly', () => {
  for (const locale of ['th', 'en']) {
    const c = fixture(), choices = helper.initialDistributionChoices(c);
    const html = component.render(locale, {}, { source: c.source, choices, editable: true }, 'VpDistributionEvidence');
    for (const value of ['19,280.00', '19,160.00', '120.00', '607.10', '18,672.90', '8,672.90', '8,552.90', '10,000.00', '4,160.00', '5,000.00']) assert.ok(html.includes(value), value);
    assert.ok(html.includes(translate(locale, 'vpDistribution.settlement')));
    assert.equal((html.match(/<input/g) || []).length, 0);
    assert.equal((html.match(/<select/g) || []).length, 1); assert.doesNotMatch(html, /type="range"/);
    c.can_manage = false;
    const readonly = component.render(locale, { 'VpDistributionPanel.context': c, 'VpDistributionPanel.open': true, 'VpDistributionPanel.choices': choices }, { paymentId: 'synthetic-payment' }, 'VpDistributionPanel');
    for (const action of ['save', 'review', 'finalize', 'supersede']) assert.ok(!readonly.includes(translate(locale, 'vpDistribution.' + action)));
    assert.doesNotMatch(readonly, /<input/);
    const input = require('../../app/finance/compensation/formula-calculation.ts').initialFormula('pao_line', 10000);
    const preset = component.render(locale, {}, { source: c.source, choices, editable: true,
      formulas: { 'synthetic-line-1': input }, people: [] }, 'VpDistributionEvidence');
    assert.ok(preset.includes(translate(locale, 'vpFormula.companyName')));
    assert.doesNotMatch(preset, /value="Company" selected=""/);
    assert.match(preset, /value="Lawyer" selected=""/);
    assert.ok(!preset.includes(translate(locale, 'vpFormula.customRole')));
    assert.equal(input.rows[0].custom_role, 'Company');
  }
});
test('045 catalog and narrow upstream errors do not leak backend diagnostics', () => {
  for (const [key, value] of Object.entries(vpDistributionMessages)) { assert.ok(value.th, key); assert.ok(value.en, key); }
  for (const locale of ['th', 'en']) {
    const events = ['created', 'saved', 'reviewed', 'finalized', 'superseded'].map(event => helper.distributionAuditEvent(event, locale));
    assert.equal(new Set(events).size, 5);
    assert.equal(helper.distributionAuditEvent('secret_unknown_event', locale), translate(locale, 'vpDistribution.auditEvent'));
  }
  const { moneyAllocationError } = require('../../app/finance/payments/money-allocation.ts');
  const { paymentErrorMessage, paymentReallocationErrorMessage } = require('../../app/finance/payments/shared.ts');
  const { correctionError } = require('../../app/finance/tax-corrections/shared.ts');
  const error = { message: 'VP_DISTRIBUTION_SUPERSEDE_REQUIRED' };
  for (const locale of ['th', 'en']) {
    const expected = translate(locale, 'vpDistribution.error.SUPERSEDE_REQUIRED');
    for (const fn of [helper.distributionError, moneyAllocationError, correctionError]) assert.equal(fn(error, locale), expected);
    for (const code of ['CHOICES_INVALID', 'POOL_EXCEEDED', 'SOURCE_CHANGED', 'STALE']) assert.equal(helper.distributionError({ message: 'VP_DISTRIBUTION_' + code }, locale), translate(locale, 'vpDistribution.error.' + code));
    assert.doesNotMatch(helper.distributionError({ message: 'secret stack token' }, locale), /secret|stack|token/);
  }
  assert.equal(paymentErrorMessage(error, 'fallback').key, 'vpDistribution.error.SUPERSEDE_REQUIRED');
  assert.equal(paymentReallocationErrorMessage(error).key, 'vpDistribution.error.SUPERSEDE_REQUIRED');
  const ui = fs.readFileSync('app/finance/payments/vp-distribution-panel.tsx', 'utf8');
  assert.match(ui, /<DetailModal/);
  assert.deepEqual([...new Set([...ui.matchAll(/"((?:get|save|transition)_finance_[^"]+)"/g)].map(match => match[1]))].sort(),
    ['get_finance_direct_vp_formula_context', 'get_finance_vp_formula_context', 'save_finance_direct_vp_distribution', 'save_finance_vp_distribution', 'transition_finance_vp_distribution']);
  assert.doesNotMatch(ui, /\.from\(|confirm_finance_payment|issue_finance_|post_confirmed|window\.alert/);
  assert.equal(fields.length, 3);
});
