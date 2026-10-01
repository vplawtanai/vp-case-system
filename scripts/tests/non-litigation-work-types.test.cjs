/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');
const { translate } = require('../../lib/i18n/catalog.ts');
const model = require('../../lib/advisory-control.ts');
const catalog = require('./fixtures/advisory-085-journey-catalog.json');
const runtimeCatalog = require('../../lib/advisory-journey-catalog.json');
const fs = require('node:fs');

const labels = workspaceFixture('app/advisory/control/shared.tsx', ['Badge', 'useAdvisoryLabels']);
const shared = { Badge: labels.component('Badge'), useAdvisoryLabels: labels.useAdvisoryLabels, Pagination: () => null };
const editor = workspaceFixture('app/advisory/control/MatterEditor.tsx', [], {
  './shared': shared,
  '../../components/DetailModal': { default: ({ children }) => children },
});
const journey = workspaceFixture('app/advisory/control/Journey.tsx', [], { './shared': shared });
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
    assert.equal(values.length, 18);
    assert.deepEqual(values, catalog.work_types.map(type => type.key));
    for (const approved of catalog.work_types) {
      const type = approved.key;
      assert.ok(values.includes(type));
      assert.ok(options.includes(approved[locale].replaceAll('&', '&amp;')));
      assert.equal(model.createJourneyFamily(type), approved.family);
      const selected = editor.render(locale, { 'MatterEditor.workType': type }, props);
      assert.ok(selected.includes(`value="${type}" selected=""`));
      assert.ok(selected.includes(`name="template" value="${approved.family}"`));
      assert.ok(selected.includes(translate(locale, 'advisory.familyHint', { family: catalog.families.find(f => f.key === approved.family)[locale] }).replaceAll('&', '&amp;')));
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
  for (const family of catalog.families) {
    test(locale + ': ' + family.key + ' uses approved family-specific Stage labels and recorded order', () => {
      const current = { ...matter, template_key: family.key, stage_key: family.stages[0] };
      const stages = model.journeyPlan(current, []).map((s, i) => ({ ...s, id: 'stage-' + i }));
      const before = structuredClone(stages);
      const html = journey.render(locale, {}, { matter: current, stages, canEdit: false, onEdit() {} });
      for (const text of family['stage_labels_' + locale]) assert.ok(html.includes(text.replaceAll('&', '&amp;')), text);
      assert.doesNotMatch(html, /advisory\.(enum|stage|family)\.|undefined|NaN/);
      assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
      assert.deepEqual(stages, before);
    });
  }
}

test('application catalog is identical to approved 085 evidence and its ten exact database patterns', () => {
  assert.deepEqual(runtimeCatalog, catalog);
  assert.equal(catalog.work_types.length, 18);
  assert.equal(new Set(catalog.work_types.map(t => t.family)).size, 10);
  const sql = fs.readFileSync('supabase/migrations/202610010085_advisory_journey_families.sql', 'utf8');
  for (const family of catalog.families) {
    const match = sql.match(new RegExp("when '" + family.key + "' then array\\[([^\\]]+)\\]"));
    assert.ok(match, family.key);
    assert.deepEqual([...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]), family.stages);
  }
});

test('stored legacy plans and unset legacy Matters never adopt the new creation mapping', () => {
  for (const [key, steps] of Object.entries(model.templates)) {
    const historical = steps.map((stage_key, position) => ({ id: String(position), stage_key, template_key: key, position, visits: [], minutes: null })).reverse();
    const before = structuredClone(historical);
    // Even a new default/family passed by a caller must not replace recorded facts.
    assert.deepEqual(model.journeyPlan(matter, historical, 'government_regulatory'), [...historical].sort((a, b) => a.position - b.position));
    assert.deepEqual(historical, before);
  }
  const before = structuredClone(matter);
  const unset = model.journeyPlan(matter, []);
  assert.deepEqual(unset.map(s => s.stage_key), model.templates.general);
  assert.ok(unset.every(s => s.visits.length === 0 && !s.id));
  assert.deepEqual(matter, before);
});
