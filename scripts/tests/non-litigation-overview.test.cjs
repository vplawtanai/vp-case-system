/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');
const { useI18n } = require('../../lib/i18n/provider.tsx');
const { messages, translate } = require('../../lib/i18n/catalog.ts');
const { workStates } = require('../../lib/advisory-control.ts');
const shared = {
  useAdvisoryLabels() { const i = useI18n(); return { ...i, a: (k, p) => i.t('advisory.' + k, p), label: v => messages['advisory.enum.' + v] ? i.t('advisory.enum.' + v) : v || '—' }; },
  Badge({ value }) { const { label } = shared.useAdvisoryLabels(); return React.createElement('span', { 'data-status': value }, label(value)); },
  Pagination({ offset, total }) { return React.createElement('nav', { 'aria-label': 'Pagination', 'data-offset': offset, 'data-total': total }); },
};
const overview = workspaceFixture('app/advisory/control/MatterOverview.tsx', [], { './shared': shared });
const sections = workspaceFixture('app/advisory/control/MatterSections.tsx', [], { './shared': shared });
const time = workspaceFixture('app/advisory/control/MatterTimeSummary.tsx', [], { './shared': shared });
const dialog = { default: ({ children }) => React.createElement('div', { role: 'dialog' }, children) };
const journey = workspaceFixture('app/advisory/control/Journey.tsx', ['Journey'], { './shared': shared });
const compact = workspaceFixture('app/advisory/control/MatterJourney.tsx', [], { './shared': shared, './Journey': { default: journey.component('Journey') }, '../../components/DetailModal': dialog });
const matter = { id: 'test', version: 0, status: 'active', closed_at: null, stage_key: null, stage_days: null, age_days: 96, work_state: null, matter_type: 'general_advisory', next_action: null, next_owner_name: null, next_due: null };
const props = { matter, people: [], section: 'tasks', overview: true, canEdit: true, canDelete: true, onEdit() {}, onAction: async () => {}, busy: false, onFocus() {} };
const loaded = { 'MatterSections.loadedKey': JSON.stringify(['test', 0, 'tasks', 0, undefined, false]) };
const canonicalWorkStates = {
  th: ['กำลังดำเนินการ', 'รอลูกค้า', 'รอภายนอก', 'รอภายใน', 'พักไว้'],
  en: ['Working', 'Waiting for client', 'Waiting externally', 'Waiting internally', 'On hold'],
};

for (const locale of ['th', 'en']) {
  const a = (key, p) => translate(locale, 'advisory.' + key, p);
  test(locale + ': work-state display accepts only work-state values and never substitutes lifecycle', () => {
    assert.deepEqual(workStates.map(value => a('enum.' + value)), canonicalWorkStates[locale]);
    assert.equal(a('enum.active'), locale === 'th' ? 'เปิดงาน' : 'Active');
    for (const work_state of [null, '', 'active', 'closed', 'cancelled', 'unknown']) {
      const html = overview.render(locale, {}, { matter: { ...matter, work_state }, canEdit: true, onEdit() {} });
      assert.ok(html.includes('>' + a('workStateUnset') + '<'));
      assert.doesNotMatch(html, /data-status="(?:active|closed|cancelled)"/);
    }
    for (const work_state of workStates) {
      const html = overview.render(locale, {}, { matter: { ...matter, work_state }, canEdit: false, onEdit() {} });
      assert.ok(html.includes(a('enum.' + work_state)));
      assert.ok(!html.includes('>' + a('workStateUnset') + '<'));
    }
  });
  test(locale + ': legacy current stage and duration remain unset even when lifecycle is closed', () => {
    for (const closed_at of [null, '2026-09-25']) {
      const html = overview.render(locale, {}, { matter: { ...matter, closed_at }, canEdit: true, onEdit() {}, onOpenMap() {} });
      assert.ok(html.includes(a('unset')));
      assert.ok(html.includes('>—<'));
      assert.ok(html.includes(a('days', { n: 96 })));
      assert.ok(!html.includes(a('enum.intake')));
      if (closed_at) assert.ok(!html.includes(a('startStagePlan')));
      else assert.ok(html.includes(a('startStagePlan')));
    }
  });
  test(locale + ': loading and read errors never masquerade as a zero-count empty section', () => {
    const loading = sections.render(locale, {}, props);
    assert.ok(loading.includes(a('loading')));
    assert.ok(!loading.includes(a('empty.tasks')));
    const failed = sections.render(locale, { ...loaded, 'MatterSections.error': true }, props);
    assert.ok(failed.includes('role="alert"'));
    assert.ok(!failed.includes(a('empty.tasks')));
    const empty = sections.render(locale, loaded, props);
    assert.ok(empty.includes(a('empty.tasks')));
    assert.ok(empty.includes(a('emptyHint.tasks')));
    assert.ok(empty.includes(a('viewAll')));
  });
  test(locale + ': focused tasks expose pagination and deleted-task controls; overview stays on active first page', () => {
    const tasks = Array.from({ length: 8 }, (_, i) => ({ id: 't' + i, title: 'Visible task ' + i, status: 'pending', priority: 'normal' }));
    const state = { ...loaded, 'MatterSections.rows': tasks, 'MatterSections.total': 28 };
    const summary = sections.render(locale, { ...state, 'MatterSections.offset': 20, 'MatterSections.deleted': true }, props);
    assert.equal((summary.match(/<strong>Visible task \d<\/strong>/g) || []).length, 5);
    assert.ok(!summary.includes('aria-label="Pagination"'));
    assert.ok(!summary.includes(a('restoreTask')));
    const full = sections.render(locale, state, { ...props, focused: true });
    assert.equal((full.match(/<strong>Visible task \d<\/strong>/g) || []).length, 8);
    assert.ok(full.includes('aria-label="Pagination"'));
    assert.ok(full.includes(a('deletedTasks')));
    assert.ok(!full.includes(a('viewAll')));
  });
  test(locale + ': time summary keeps exact minutes, derived hours and unassigned-stage log count distinct', () => {
    const html = time.render(locale, {}, { matterId: 'test', time: { minutes: 3180, core: 2460, support: 720, unclassified: 18 } });
    for (const n of [3180, 2460, 720]) assert.ok(html.includes(a('minutes', { n })));
    assert.ok(html.includes(a('hoursMinutes', { hours: 53, minutes: 0 })));
    assert.ok(html.includes(a('unclassifiedCount', { n: 18 })));
    assert.ok(!html.includes('/records'), 'Time summary never links back into Legacy');
    const zero = time.render(locale, {}, { matterId: 'test', time: { minutes: 0, core: 0, support: 0, unclassified: 0 } });
    assert.ok(zero.includes('data-empty="true"'));
    assert.doesNotMatch(zero, /NaN|Infinity/);
  });
  test(locale + ': command-center map trigger opens the existing legacy planning dialog without claiming history', () => {
    const html = compact.render(locale, {}, { matter, stages: [], canEdit: true, compact: true, requestedOpen: true, onCloseMap() {}, onEdit() {} });
    assert.ok(html.includes('role="dialog"'));
    assert.equal((html.match(/<option /g) || []).length, 17);
    assert.ok(html.includes(a('previewOnly')));
    assert.doesNotMatch(html, /aria-current="step"|<(?:li|button)[^>]*data-state="(?:visited|current|finished)"/);
    assert.ok(html.includes(a('unset')));
  });
}
