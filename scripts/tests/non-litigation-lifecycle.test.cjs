/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');
const { workStates } = require('../../lib/advisory-control.ts');

const shared = workspaceFixture('app/advisory/control/shared.tsx', ['Badge', 'useAdvisoryLabels']);
const Badge = shared.component('Badge');
const rows = [
  { id: 'closed', matter_no: 'ADV-2026-007', status: 'completed', work_state: null },
  { id: 'open', matter_no: 'ADV-2026-012', status: 'active', work_state: 'working' },
  { id: 'open-waiting', matter_no: 'ADV-2026-011', status: 'active', work_state: 'waiting_client' },
  { id: 'cancelled', matter_no: 'ADV-TEST-CANCELLED', status: 'cancelled', work_state: null },
  { id: 'waiting', matter_no: 'ADV-TEST-WAITING', status: 'waiting', work_state: null },
].map(row => ({ client_id: 'client', client_name: 'Synthetic client', title: row.matter_no, matter_type: 'general_advisory', age_days: 1, stage_days: null, ...row }));
const list = workspaceFixture('app/advisory/control/MatterList.tsx', [], {
  './shared': { Badge, useAdvisoryLabels: shared.useAdvisoryLabels, Pagination: () => null, usePeople: () => [], useControl: () => ({ data: { items: rows, summary: {}, permissions: { manage: false }, total: rows.length }, loading: false, error: false, reload() {} }) },
  './MatterEditor': { default: () => null },
});

for (const locale of ['th', 'en']) {
  test(locale + ': desktop and mobile list badges use lifecycle even when Work State is populated', () => {
    const html = list.render(locale);
    for (const status of ['completed', 'cancelled', 'waiting']) assert.equal((html.match(new RegExp(`data-status="${status}" data-kind="lifecycle"`, 'g')) || []).length, 2);
    assert.equal((html.match(/data-status="active" data-kind="lifecycle"/g) || []).length, 4);
    assert.doesNotMatch(html, /data-status="(?:working|waiting_client)"/);
    assert.ok(html.includes('ADV-2026-007'));
    assert.ok(html.includes(locale === 'th' ? '>เสร็จสิ้น<' : '>Completed<'));
    assert.ok(html.includes(locale === 'th' ? '>เปิดงาน<' : '>Active<'));
    assert.ok(html.includes(locale === 'th' ? '>ยกเลิก<' : '>Cancelled<'));
    // Work State remains available as its own unchanged filter, not the lifecycle display.
    for (const value of workStates) assert.ok(html.includes(`<option value="${value}">`));
  });
  test(locale + ': lifecycle presentation opts into shared VP tokens without changing ordinary Work State badges', () => {
    for (const value of ['active', 'completed', 'cancelled', 'waiting']) {
      const html = shared.render(locale, {}, { value, kind: 'lifecycle' }, 'Badge');
      assert.ok(html.includes('vp-ui_module_css_scope'));
      assert.ok(html.includes(`data-status="${value}" data-kind="lifecycle"`));
    }
    for (const value of workStates) {
      const html = shared.render(locale, {}, { value }, 'Badge');
      assert.doesNotMatch(html, /data-kind|vp-ui_module_css_scope/);
      assert.ok(html.includes(`data-status="${value}"`));
    }
  });
}

test('lifecycle colors are driven by raw status selectors, with distinct existing semantic tokens', () => {
  const css = fs.readFileSync('app/advisory/control/control.module.css', 'utf8');
  const expected = { active: 'info', completed: 'success', cancelled: 'danger', waiting: 'warning' };
  for (const [status, tone] of Object.entries(expected)) {
    assert.ok(css.includes(`.badge[data-kind="lifecycle"][data-status="${status}"]{color:var(--vp-${tone});background:var(--vp-${tone}-bg)}`));
  }
  assert.ok(css.includes('.badge[data-kind="lifecycle"]{color:var(--vp-muted);background:var(--vp-subtle)}'));
  assert.doesNotMatch(css, /เสร็จสิ้น|เปิดงาน|ยกเลิก|Completed|Active|Cancelled/);
  for (const file of ['MatterList.tsx', 'MatterDetail.tsx', 'OtherClientMatters.tsx']) {
    const source = fs.readFileSync('app/advisory/control/' + file, 'utf8');
    assert.match(source, /<Badge kind="lifecycle" value=\{(?:m|item)\.status\}/);
    assert.doesNotMatch(source, /work_state\|\|.*status/);
  }
});
