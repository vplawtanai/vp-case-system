/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const React = require('react');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');
const { useI18n } = require('../../lib/i18n/provider.tsx');
const { messages, translate } = require('../../lib/i18n/catalog.ts');
const model = require('../../lib/advisory-control.ts');
const keys = require('../../lib/i18n/messages/advisory-control.ts').advisoryControlMessages;
const shared = {
  useAdvisoryLabels() { const i = useI18n(); return { ...i, a: (key, p) => i.t('advisory.' + key, p), label: v => v ? messages['advisory.enum.' + v] ? i.t('advisory.enum.' + v) : v : '—' }; },
  Badge: ({ value }) => { const { label } = shared.useAdvisoryLabels(); return React.createElement('span', null, label(value)); },
};
const dialog = { default: ({ open, children, title }) => open ? React.createElement('section', { role: 'dialog', 'aria-label': title }, children) : null };
const journey = workspaceFixture('app/advisory/control/Journey.tsx', ['Journey'], { './shared': shared });
const compact = workspaceFixture('app/advisory/control/MatterJourney.tsx', ['MatterJourney'], { './shared': shared, './Journey': { default: journey.component('Journey') }, '../../components/DetailModal': dialog });
const overview = workspaceFixture('app/advisory/control/MatterOverview.tsx', ['MatterOverview'], { './shared': shared });
const editor = workspaceFixture('app/advisory/control/MatterEditor.tsx', ['MatterEditor'], { './shared': shared, '../../components/DetailModal': dialog });
const base = { id: 'main', client_id: 'client', client_name: 'Synthetic client', matter_no: 'ADV-TEST', title: 'Synthetic matter', matter_type: 'general_advisory', status: 'active', stage_key: null, closed_at: null, stage_days: null, age_days: 19, next_action: 'Prepare response', next_owner_name: 'Assigned person', next_due: '2026-10-01', work_state: 'waiting_client', version: 0 };
const plan = model.journeyPlan(base, []);
const live = plan.map((s, i) => ({ ...s, id: 'stage-' + i, minutes: i === 2 ? 95 : null, task_completed: i === 2 ? 1 : 0, task_total: i === 2 ? 3 : 0, elapsed_seconds: 864000, visits: i < 2 ? [{ kind: 'visit', entered_at: '2026-09-10T00:00:00Z', exited_at: '2026-09-12T00:00:00Z' }] : i === 2 ? [{ kind: 'visit', entered_at: '2026-09-24T00:00:00Z', exited_at: null }] : [] }));
const matter = { ...base, stage_key: 'analysis', stage_days: 3 };

for (const locale of ['th', 'en']) {
  const a = key => translate(locale, 'advisory.' + key);
  test(locale + ': everyday detail has stage, next action, owner, due, age and duration without a mounted map', () => {
    const html = overview.render(locale, {}, { matter, canEdit: false, onEdit() {} });
    for (const key of ['stage', 'next', 'actor', 'due', 'stageDays', 'age', 'state']) assert.ok(html.includes(a(key)), key);
    assert.ok(html.includes('Prepare response')); assert.ok(html.includes('Assigned person'));
    assert.ok(!html.includes('>' + a('edit') + '<'));
    const closedMap = compact.render(locale, {}, { matter, stages: live, canEdit: true, onEdit() {} });
    assert.ok(closedMap.includes(a('openMap'))); assert.ok(!closedMap.includes('role="dialog"')); assert.ok(!closedMap.includes(a('routeOverview')));
    assert.equal((closedMap.match(/aria-current="step"/g) || []).length, 1);
    assert.equal((closedMap.match(/<li /g) || []).length, 6);
  });
  test(locale + ': opening map retains real stage evidence and keeps matter next action distinct', () => {
    const html = compact.render(locale, { 'MatterJourney.open': true }, { matter, stages: live, canEdit: true, onEdit() {} });
    assert.ok(html.includes('role="dialog"')); assert.ok(html.includes(a('mapLegend')));
    for (const key of ['entered', 'stageDays', 'taskCompletion', 'actual', 'matterNextAction', 'actor', 'due']) assert.ok(html.includes(a(key)), key);
    assert.ok(html.includes(translate(locale, 'advisory.days', { n: 3 })));
    assert.ok(html.includes('1 / 3')); assert.ok(html.includes('95')); assert.ok(html.includes(a('progressHint')));
    assert.doesNotMatch(html, /undefined|NaN/);
  });
  test(locale + ': legacy plans remain unstarted; existing plans cannot be replaced by catalog selection', () => {
    const summary = compact.render(locale, {}, { matter: base, stages: [], canEdit: true, onEdit() {} });
    assert.ok(!summary.includes('<select'));
    const html = compact.render(locale, { 'MatterJourney.open': true }, { matter: base, stages: [], canEdit: true, onEdit() {} });
    assert.ok(html.includes(a('unset'))); assert.ok(html.includes(a('previewOnly')));
    assert.equal((html.match(/<option /g) || []).length, 17);
    assert.ok(!html.includes('aria-current="step"'));
    const recorded = compact.render(locale, {}, { matter, stages: live, canEdit: true, onEdit() {} });
    assert.ok(!recorded.includes('<select')); assert.ok(recorded.includes(a('recordedSequence')));
  });
  test(locale + ': richer client-matter panel uses one bounded existing read with real derived fields', () => {
    let query;
    const sibling = { ...matter, id: 'other', matter_no: 'ADV-OTHER', title: 'Other matter', lead_name: 'Another lawyer', age_days: 27 };
    const component = workspaceFixture('app/advisory/control/OtherClientMatters.tsx', ['OtherClientMatters'], { './shared': { ...shared, useControl(id, q) { assert.equal(id, undefined); query = JSON.parse(q); return { data: { items: [base, sibling], total: 2 }, error: false, loading: false, reload() {} }; } } });
    const html = component.render(locale, {}, { matter: base });
    assert.deepEqual(query, { client_id: 'client', limit: 6 });
    assert.ok(html.includes('ADV-OTHER')); assert.ok(!html.includes('ADV-TEST'));
    assert.ok(html.includes('Another lawyer')); assert.ok(html.includes(translate(locale, 'advisory.days', { n: 27 })));
    assert.ok(html.includes('href="/advisory/other"')); assert.ok(html.includes('/advisory?client_id=client'));
  });
  test(locale + ': client sibling empty and failed reads are distinct', () => {
    for (const error of [false, true]) {
      const component = workspaceFixture('app/advisory/control/OtherClientMatters.tsx', ['OtherClientMatters'], { './shared': { ...shared, useControl() { return { data: error ? null : { items: [base], total: 1 }, error, loading: false, reload() {} }; } } });
      const html = component.render(locale, {}, { matter: base });
      assert.ok(html.includes(a(error ? 'loadError' : 'noOtherMatters')));
      if (error) assert.ok(!html.includes(a('noOtherMatters')));
    }
  });
}

test('17 work starters only submit canonical sequences already supported by applied 076', () => {
  assert.equal(model.workPresets.length, 17);
  assert.equal(new Set(model.workPresets.map(p => p.key)).size, 17);
  const sql = fs.readFileSync('supabase/migrations/202607180076_non_litigation_matter_control_core.sql', 'utf8');
  for (const [key, steps] of Object.entries(model.templates)) {
    const array = sql.match(new RegExp("when '" + key + "' then array\\[([^\\]]+)\\]"));
    assert.ok(array, key); assert.deepEqual(array[1].match(/'[^']+'/g).map(x => x.slice(1, -1)), steps);
  }
  for (const preset of model.workPresets) {
    assert.ok(model.templates[preset.template]); assert.equal(model.defaultTemplate(preset.key), preset.template);
    for (const locale of ['th', 'en']) {
      assert.ok(keys['advisory.preset.' + preset.key][locale]);
      const html = editor.render(locale, { 'MatterEditor.workType': preset.key }, { request: { action: 'create', title: 'Create' }, people: [], stages: [], onClose() {}, onSaved: async () => {} });
      assert.ok(html.includes(`name="template" value="${preset.template}"`));
      assert.ok(html.includes(translate(locale, 'advisory.presetHint', { template: translate(locale, 'advisory.enum.' + preset.template) })));
    }
  }
  for (const key of ['document_drafting', 'meeting_consultation', 'corporate_support', 'compliance', 'other', 'unrecognized historical type']) assert.equal(model.defaultTemplate(key), 'general');
});
test('stage planning does not mutate history; recorded skips are separate from stages visited', () => {
  const historical = structuredClone(live).reverse(); const before = JSON.stringify(historical);
  assert.equal(model.journeyPlan(matter, historical, 'license')[0].stage_key, 'intake');
  assert.equal(JSON.stringify(historical), before);
  const skipped = structuredClone(live); skipped[3].visits = [{ kind: 'skip' }];
  assert.deepEqual(model.journeyProgress(skipped, 'analysis', false), { visited: 2, skipped: 1, total: 6 });
  assert.deepEqual(model.journeyProgress(plan, null, false), { visited: 0, skipped: 0, total: 6 });
});
