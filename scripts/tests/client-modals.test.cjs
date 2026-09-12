/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), cp = require('node:child_process');
require('./receipt-render-fixture.cjs');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { UiLocaleProvider, BilingualUiScope } = require('../../lib/i18n/provider.tsx');
const { default: ClientFormFields, emptyForm, clientTypeOptions, editableStatusOptions } = require('../../app/clients/ClientFormFields.tsx');
const read = file => fs.readFileSync(file, 'utf8');
test('one shared set of ten Client fields preserves create defaults, option values and normal inline creation', () => {
  assert.equal(emptyForm.client_type, 'limited_company'); assert.equal(emptyForm.status, 'active');
  assert.equal(clientTypeOptions.length, 11); assert.deepEqual(editableStatusOptions.map(o => o.value), ['active', 'inactive', 'prospect', 'blacklist']);
  const html = renderToStaticMarkup(React.createElement(ClientFormFields, { value: { ...emptyForm, name: 'Synthetic Client', tax_id: '1234567890123' }, onChange() {} }));
  assert.equal((html.match(/<label/g) || []).length, 10); assert.equal((html.match(/<input/g) || []).length, 8); assert.equal((html.match(/<select/g) || []).length, 2);
  const page = read('app/clients/page.tsx');
  assert.match(page, /<ClientFormFields value=\{form\} onChange=\{setForm\}/);
  assert.match(page, /void saveClient\(form, false\)/); assert.match(page, /void saveClient\(edit.values, true\)/);
  assert.doesNotMatch(page, /scrollIntoView|router\.|location\.|formRef|setIsEditing/);
});
test('modal localization opts in without changing legacy Clients coverage, fields or values', () => {
  for (const locale of ['th', 'en']) {
    const html = renderToStaticMarkup(React.createElement(UiLocaleProvider, { initialLocale: locale, pathname: '/clients' },
      React.createElement(BilingualUiScope, null, React.createElement(ClientFormFields, { value: { ...emptyForm, name: 'Never translate me' }, onChange() {}, localized: true }))));
    assert.ok(html.includes(locale === 'th' ? 'ประเภทลูกความ' : 'Client type'));
    assert.ok(html.includes('Never translate me')); assert.ok(html.includes('value="limited_company"'));
  }
});
test('dialog uses established focus/scroll pattern, guarded close for busy and dirty forms, no persistence in dialog wrapper', () => {
  const modal = read('app/clients/ClientModal.tsx');
  assert.match(modal, /import DetailModal/); assert.match(modal, /if \(busy\) return/); assert.match(modal, /if \(dirty\) setLeaveAction/);
  assert.match(modal, /beforeunload/); assert.doesNotMatch(modal, /supabase|\.rpc\(/);
  const page = read('app/clients/page.tsx');
  assert.match(page, /setClients\(previous => previous.map/);
  assert.match(page, /setEdit\(null\);\s+return;/, 'Edit returns without resetting Create or reloading the list');
  const old = cp.execFileSync('git', ['show', 'HEAD:app/clients/page.tsx'], { encoding: 'utf8' });
  const scope = source => source.slice(source.indexOf('  const softDeleteClient'), source.indexOf('  if (loadingProfile)'));
  assert.equal(scope(page), scope(old), 'Delete/Restore and their permissions remain unchanged');
});
test('Tax modal and deep link reuse one editor and unchanged tax-rule helper / migrations', () => {
  const route = read('app/clients/[id]/tax-identity/page.tsx'), page = read('app/clients/page.tsx'), editor = read('app/clients/CustomerTaxIdentityEditor.tsx');
  for (const text of [route, page]) assert.match(text, /CustomerTaxIdentityEditor/);
  assert.doesNotMatch(route, /supabase|\.rpc\(/);
  assert.equal((editor.match(/supabase\.rpc\("save_finance_customer_tax_profile"/g) || []).length, 1);
  assert.match(editor, /customerTaxPayload\(result, form\)/); assert.match(editor, /customerTaxErrors\(form, result.identity\)/);
  assert.match(editor, /key !== "verified" \? \{ verified: false \}/);
  assert.equal(cp.execFileSync('git', ['diff', '--', 'app/clients/tax-identity.ts', 'supabase/migrations'], { encoding: 'utf8' }), '');
});
