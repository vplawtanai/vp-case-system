/* eslint-disable @typescript-eslint/no-require-imports */
// Only synthetic local identifiers. Never loads a backend or production data.
const { fixture: moneyFixture } = require('./money-allocation-fixture.cjs');
function fixture() {
  const money = moneyFixture();
  const lines = money.source.lines.map((line, index) => ({ ...line,
    classification: index === 1 ? 'professional_fee' : 'additional_service',
    professional_pool: index === 1 ? line.base - line.wht : 0,
    company_economic: index === 1 ? 0 : line.base,
    company_cash: index === 1 ? 0 : Number((line.base - line.wht).toFixed(2)),
  }));
  return { formula_schema_version:1, formula_catalog:require('../../app/finance/compensation/formula-definitions.json'),
    formula_people:[{id:'10000000-0000-4000-8000-000000000001',name:'Fixture Admin'},{id:'10000000-0000-4000-8000-000000000002',name:'Fixture Staff'}],
    can_manage: true, current: null, source_current: false, posting_enabled: false, history: [], audit: [],
    source: { schema_version: 1, policy_version: 'vp_distribution_v1', money_source: money.source, money_allocation: null, lines,
      totals: { cash: 19160, wht: 120, vat: 607.10, base: 18672.90, professional_pool: 10000, company_economic: 8672.90, company_cash: 8552.90 }, blockers: [] },
  };
}
function record(context, status = 'draft') {
  return { id: 'synthetic-distribution', payment_id: 'synthetic-payment', money_allocation_id: null,
    revision: 1, previous_id: null, version: 1, status, source_snapshot_json: structuredClone(context.source),
    decisions_json: [{ invoice_item_id: 'synthetic-line-1', referral_amount: 1000, company_share_amount: 3000, work_compensation_amount: 6000 }],
    note: 'Synthetic frozen note', created_at: '2026-09-01T00:00:00Z', created_by: 'synthetic-admin',
    reviewed_at: status === 'draft' ? null : '2026-09-01T01:00:00Z', reviewed_by: status === 'draft' ? null : 'synthetic-admin',
    finalized_at: ['finalized', 'superseded'].includes(status) ? '2026-09-01T02:00:00Z' : null,
    superseded_at: status === 'superseded' ? '2026-09-01T03:00:00Z' : null,
    supersede_reason: status === 'superseded' ? 'Synthetic supersession reason' : null };
}
module.exports = { fixture, record };
