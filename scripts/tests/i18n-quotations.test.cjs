/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), cp = require('node:child_process');
const ts = require('typescript'), React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { root } = require('./receipt-render-fixture.cjs');
const provider = require(root + '/lib/i18n/provider.tsx');
const { translate, resolveUiMessage } = require(root + '/lib/i18n/catalog.ts');
const { uiMessage } = require(root + '/lib/i18n/core.ts');
const file = 'app/finance/quotations/shared.tsx', source = fs.readFileSync(root + '/' + file, 'utf8');
const ast = ts.createSourceFile(file, source, 99, true, ts.ScriptKind.TSX);
const context = { React, ...provider, translate, uiMessage, exports: {}, useCallback: React.useCallback, useMemo: React.useMemo, useRef: React.useRef, useEffect: React.useEffect, useState: React.useState, useRouter: () => ({ push() { throw Error('No navigation'); } }), useSearchParams: () => new URLSearchParams(), Link: ({ children, ...props }) => React.createElement('a', props, children), supabase: new Proxy({}, { get() { throw Error('No Supabase access'); } }) };
for (const node of ast.statements.filter(ts.isImportDeclaration)) {
  const specifier = node.moduleSpecifier.text;
  if (!specifier.startsWith('.') || /supabase|auditLog|AuthGuard|AppTopNav/.test(specifier) || node.importClause?.isTypeOnly) continue;
  const imported = require(path.resolve(root, path.dirname(file), specifier));
  if (node.importClause?.name) context[node.importClause.name.text] = imported.default;
  for (const binding of node.importClause?.namedBindings?.elements || []) if (!binding.isTypeOnly) context[binding.name.text] = imported[binding.propertyName?.text || binding.name.text];
}
const names = ['QuotationForm','QuotationFinancialSummary','LineItemVatExplanation','PerItemAllocationMatrix','StatusBadge','emptyForm','emptyItem','normalizeItem','computeTotals','normalizedQuotationDraftSnapshot','normalizedPaymentTermsSnapshot','buildPaymentClientSummary','getPaymentTermsPlanValidationIssue','getPaymentAllocationValidationIssue','getReadonlyMessage','mapAcceptedEngagementError'];
vm.runInNewContext(ts.transpileModule(ast.statements.filter(n => !ts.isImportDeclaration(n)).map(n => n.getText(ast)).join('\n') + '\nexports.fixture = {' + names.join(',') + '};', { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: 9 } }).outputText, context);
const ui = context.exports.fixture, coverage = { finance: true, documentSettings: true, other: false };
context.crypto = { randomUUID: () => 'fixture-item' };
function render(locale, component, props) { return renderToStaticMarkup(React.createElement(provider.UiLocaleProvider, { initialLocale: locale, pathname: '/finance/quotations/new', coverage }, React.createElement(component, props))); }
test('Quotation editor is bilingual while generated customer payment text stays authoritative', () => {
  const en = render('en', ui.QuotationForm, { access: { permissions: { canCreateFinanceQuotation: true } } });
  const th = render('th', ui.QuotationForm, { access: { permissions: { canCreateFinanceQuotation: true } } });
  assert.match(en, /New Quotation/); assert.match(th, /สร้างใบเสนอราคา/);
  assert.doesNotMatch(en, /finance\.quotation\./);
  // These are saved legal/document defaults, not interface labels.
  const visible = en.replace(/value="[^"]*"/g, '').replace(/<textarea[^>]*>[\s\S]*?<\/textarea>/g, '').replace(/<label class="quotation-authorized-signer-field"[\s\S]*?<\/label>/g, '');
  assert.doesNotMatch(visible, /[\u0e00-\u0e7f]/);
});
test('Quotation financial labels translate without changing gross-first totals', () => {
  const item = ui.normalizeItem({ ...ui.emptyItem, description: 'Original Service', quantity: 1, unit: 'service', unit_price: 20000, price_tax_mode: 'vat_inclusive', vat_applicable: true, vat_rate: 7 }, 0);
  const totals = ui.computeTotals([item]), before = JSON.stringify(item);
  for (const locale of ['th','en']) {
    const html = render(locale, ui.QuotationFinancialSummary, totals);
    assert.match(html, /20,000.00/); assert.match(html, /1,308.41/);
    assert.equal(JSON.stringify(item), before);
    const detail = render(locale, ui.LineItemVatExplanation, { item });
    assert.match(detail, /18,691.59/);
    if (locale === 'en') assert.doesNotMatch(html + detail, /[\u0e00-\u0e7f]/);
  }
});
test('Quotation statuses and validation use descriptors, not translated business values', () => {
  for (const status of ['draft','sent','accepted','cancelled']) {
    assert.doesNotMatch(render('en',ui.StatusBadge,{status}), /[\u0e00-\u0e7f]/);
    assert.match(render('th',ui.StatusBadge,{status}), /[\u0e00-\u0e7f]/);
  }
  for (const message of [ui.getPaymentTermsPlanValidationIssue('installments', []).message, ui.getReadonlyMessage('sent'), ui.mapAcceptedEngagementError('future')]) {
    assert.match(resolveUiMessage('th',message), /[\u0e00-\u0e7f]/);
    assert.doesNotMatch(resolveUiMessage('en',message), /[\u0e00-\u0e7f]/);
  }
});
test('Quotation calculation, default text and snapshot functions remain byte-identical to the pre-i18n contract', () => {
  const previous = cp.execFileSync('git',['show','HEAD:' + file],{ cwd: root, encoding:'utf8' });
  const previousAst = ts.createSourceFile(file,previous,99,true,ts.ScriptKind.TSX);
  for (const name of ['computeTotals','normalizeItem','calculatePaymentItemInstallmentTotals','calculatePaymentInstallmentTotals','normalizedQuotationDraftSnapshot','normalizedPaymentTermsSnapshot','buildQuotationSnapshots','buildItemPayload','buildAtomicPaymentInstallments','buildAtomicEditPaymentInstallments','paymentTriggerSummary','buildPaymentClientSummary','automaticInstallmentTitle','normalizePaymentInstallments']) {
    const declaration = tree => tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text===name).getText(tree);
    assert.equal(declaration(ast), declaration(previousAst), name);
  }
  const calls = tree => { const found=[]; function visit(n) { if(ts.isCallExpression(n) && n.expression.getText(tree)==='supabase.rpc') found.push(n.getText(tree)); ts.forEachChild(n,visit); }visit(tree);return found; };
  assert.deepEqual(calls(ast),calls(previousAst));
});
test('Quotation customer document subtree is unaffected by UI localization', () => {
  const preview='app/finance/quotations/[id]/preview/page.tsx';
  const previous=cp.execFileSync('git',['show','HEAD:'+preview],{cwd:root,encoding:'utf8'});
  const current=fs.readFileSync(root+'/'+preview,'utf8');
  const document = value => value.slice(value.indexOf('<article className={`quotation-print-document'), value.indexOf('</article>')+10);
  assert.ok(document(previous).length>1000);
  assert.equal(document(current),document(previous));
});
