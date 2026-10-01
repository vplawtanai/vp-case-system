/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');
const { translate } = require('../../lib/i18n/catalog.ts');
const model = require('../../lib/advisory-control.ts');

const labels = workspaceFixture('app/advisory/control/shared.tsx', ['Badge', 'useAdvisoryLabels']);
const shared = { Badge: labels.component('Badge'), useAdvisoryLabels: labels.useAdvisoryLabels, Pagination: () => null };
const editor = workspaceFixture('app/advisory/control/MatterEditor.tsx', [], {
  './shared': shared,
  '../../components/DetailModal': { default: ({ children }) => children },
});
const matter = {
  id: 'legacy-monthly', client_id: 'client', client_name: 'Existing client', matter_no: 'ADV-LEGACY',
  title: 'Existing monthly matter', matter_type: 'monthly_advisory', status: 'active',
  version: 1, stage_key: null, closed_at: null, stage_days: null, age_days: 12, work_state: null,
};
const read = {
  ...shared, usePeople: () => [],
  useControl: () => ({ data: { items: [matter], total: 1, summary: {}, permissions: {} }, loading: false, error: false, reload() {} }),
};
const list = workspaceFixture('app/advisory/control/MatterList.tsx', [], {
  './shared': read, './MatterEditor': { default: () => null },
  '../../clients/workspace/ClientWorkspace': { default: () => null, ClientViewToggle: () => null },
});
const detail = workspaceFixture('app/advisory/control/MatterDetail.tsx', [], {
  './shared': read,
  ...Object.fromEntries(['MatterEditor', 'MatterSections', 'MatterJourney', 'MatterOverview', 'OtherClientMatters', 'MatterTime', 'MatterTeam', 'MatterWorkflowDialog', 'MatterNextAction'].map(name => ['./' + name, { default: () => null }])),
});

for (const locale of ['th', 'en']) {
  test(locale + ': new Matter offers actual work types, without monthly retainer', () => {
    const props = { request: { action: 'create', title: 'Create' }, people: [], onClose() {}, onSaved: async () => {} };
    const html = editor.render(locale, {}, props);
    const options = html.match(/<select name="matter_type"[^>]*>([\s\S]*?)<\/select>/)[1];
    assert.doesNotMatch(options, /monthly_advisory|ที่ปรึกษารายเดือน|Monthly retainer/);
    const values = [...options.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(values, model.types.filter(type => type !== 'monthly_advisory'));
    for (const type of ['general_advisory', 'contract_review', 'legal_opinion', 'employment_hr', 'government_coordination']) {
      assert.ok(values.includes(type));
      assert.ok(options.includes(translate(locale, 'advisory.preset.' + type)));
      const selected = editor.render(locale, { 'MatterEditor.workType': type }, props);
      assert.ok(selected.includes(`value="${type}" selected=""`));
      assert.ok(selected.includes(`name="template" value="${model.defaultTemplate(type)}"`));
    }
  });
  test(locale + ': historical monthly Matter still renders, links, and can be filtered without rewriting it', () => {
    const before = structuredClone(matter);
    const label = translate(locale, 'advisory.enum.monthly_advisory');
    const html = list.render(locale);
    assert.ok(html.includes(`<option value="monthly_advisory">${label}</option>`));
    assert.ok(html.includes(`<td>${label}</td>`));
    assert.ok(html.includes('href="/advisory/legacy-monthly"'));
    const opened = detail.render(locale);
    assert.ok(opened.includes(`<strong>${label}</strong>`));
    assert.ok(opened.includes('Existing monthly matter'));
    assert.deepEqual(matter, before);
    assert.equal(model.defaultTemplate(matter.matter_type), 'general');
    assert.ok(model.workPresets.some(p => p.key === 'monthly_advisory'), 'Existing Journey catalog stays unchanged');
  });
}
