/* eslint-disable @typescript-eslint/no-require-imports */
// Actual PaymentWorkspace + locale provider, bundled locally with a closed mock
// data adapter. No Supabase credentials, Production requests or lifecycle writes.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-wht-lines-browser-'));
const webpack = require('next/dist/compiled/webpack/webpack').webpack;
const invoiceId = '00000000-0000-4000-8000-000000000001', paymentId = '00000000-0000-4000-8000-000000000002';
const items = [{ id: 'line-1', description: 'ค่าแปลเอกสาร', base: 4000, vat: 280 }, { id: 'line-2', description: 'ค่าวิชาชีพทนาย งวดที่ 1', base: 10000, vat: 0 }, { id: 'line-3', description: 'ค่าเดินทางไปศาล', base: 4672.90, vat: 327.10 }];
const snapshot = { schema_version: 2, source_model: 'billable_charge_v2', invoice: { id: invoiceId, currency: 'THB', document_status: 'issued', amount_before_vat: 18672.90, vat_amount: 607.10, total_amount: 19280 },
  items: items.map(i => ({ invoice_item: { id: i.id, description: i.description, invoice_id: invoiceId, source_state: 'active', vat_applicable: i.vat > 0, amount_before_vat: i.base, vat_amount: i.vat, line_total: i.base + i.vat } })) };
const payment = { id: paymentId, draft_origin_invoice_id: invoiceId, client_id: 'client', status: 'draft', currency: 'THB', cash_amount: '19280.00', wht_amount: '0.00', settlement_amount: '19280.00', wht_calculation_mode: 'none', received_on: '2026-07-01', payment_method: 'bank_transfer', receiving_bank_account_id: 'bank', note: '', updated_at: '2026-07-01T00:00:00Z' };
const initial = {
  finance_payments: [payment], finance_payment_wht_components: [], finance_payment_allocation_reallocations: [],
  finance_payment_invoice_allocations: [{ id: 'allocation', payment_id: paymentId, invoice_id: invoiceId, cash_allocated: '19280.00', wht_credit_allocated: '0.00', settlement_total: '19280.00' }],
  finance_payment_effective_invoice_allocations: [{ payment_id: paymentId, invoice_id: invoiceId, effective_cash_allocated: '19280.00', effective_wht_credit_allocated: '0.00', effective_settlement_total: '19280.00' }],
  finance_invoices: [{ id: invoiceId, invoice_no: 'VP-IV-LOCAL-ONLY', client_id: 'client', customer_name: 'Synthetic customer', currency: 'THB', document_status: 'issued', amount_before_vat: 18672.90, vat_amount: 607.10, total_amount: 19280, issued_snapshot_json: snapshot }],
  finance_bank_accounts: [{ id: 'bank', short_name: 'KBANK', bank_name: 'Synthetic bank', is_active: true }],
  finance_invoice_settlement_summary: [{ invoice_id: invoiceId, invoice_total_amount: 19280, confirmed_cash_amount: 0, confirmed_wht_credit: 0, economically_settled_amount: 0, outstanding_amount: 19280, payment_status: 'unpaid' }],
};
const adapter = `import {invoiceTaxFacts} from '${root}/app/finance/payments/tax.ts';
import {evaluateWhtLines} from '${root}/app/finance/payments/wht-line-review.ts';
window.fixtureCalls=[];window.fixtureDb=JSON.parse(localStorage.getItem('wht-lines-fixture')||'null')||window.initialFixture;
export const supabase={from(table){if(!Object.hasOwn(window.fixtureDb,table))throw Error('Unexpected table '+table);let filters=[],single=false;
const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,vs){filters.push(r=>vs.includes(r[k]));return q},order(){return q},maybeSingle(){single=true;return q},then(resolve,reject){const data=window.fixtureDb[table].filter(r=>filters.every(f=>f(r)));return Promise.resolve({data:structuredClone(single?data[0]:data),error:null}).then(resolve,reject)}};return q;},
async rpc(name,p){window.fixtureCalls.push({name,payload:p});if(name!=='save_finance_payment_wht_lines_draft')throw Error('Unexpected RPC '+name);
const facts=invoiceTaxFacts(window.fixtureDb.finance_invoices[0].issued_snapshot_json), choices=p.p_line_choices_json.map(c=>({invoiceItemId:c.invoice_item_id,applicability:c.applicability,rate:c.rate_percent===null?'':String(c.rate_percent),customRate:false}));
const result=evaluateWhtLines(facts,choices);if(!result.totals)throw Error('Incomplete choices reached RPC');
const db=window.fixtureDb,row=db.finance_payments[0];Object.assign(row,{cash_amount:result.totals.cashAmount,wht_amount:result.totals.whtAmount,wht_calculation_mode:'line_review',updated_at:'2026-07-02T00:00:00Z'});
Object.assign(db.finance_payment_invoice_allocations[0],{cash_allocated:row.cash_amount,wht_credit_allocated:row.wht_amount});
db.finance_payment_wht_components=choices.map(c=>{const line=facts.lines.find(l=>l.id===c.invoiceItemId);return {id:'component-'+line.id,payment_id:row.id,invoice_id:facts.invoiceId,invoice_item_id:line.id,calculation_rule:'line_review_full_invoice_v2',base_amount:line.beforeVat,rate_percent:c.applicability==='applies'?c.rate:null,calculated_wht_amount:result.amounts[line.id],basis_snapshot_json:{applicability:c.applicability,basis:{invoice_id:facts.invoiceId,invoice_item_id:line.id,currency:facts.currency,amount_before_vat:line.beforeVat,vat_amount:line.vat,total_amount:line.gross,vat_applicable:line.vatApplicable,calculation_rule:'line_review_full_invoice_v2'}}}});
localStorage.setItem('wht-lines-fixture',JSON.stringify(db));return {data:row.id,error:null};}};`;
const adapterFile = path.join(out, 'supabase.js'), loader = path.join(out, 'loader.cjs'), navigation = path.join(out, 'navigation.js'), link = path.join(out, 'link.js');
fs.writeFileSync(adapterFile, adapter);
fs.writeFileSync(navigation, `export const usePathname=()=>location.pathname;export const useParams=()=>({id:'${paymentId}'});`);
fs.writeFileSync(link, `import React from '${require.resolve('react')}';export default function Link({children,...props}){return React.createElement('a',props,children);}`);
fs.writeFileSync(loader, `module.exports=function(source){
if(this.resourcePath.endsWith('.css')){const prefix=require('path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,key)=>'+JSON.stringify(prefix)+'+key})};'}
if(this.resourcePath===${JSON.stringify(path.join(root, 'app/finance/payments/[id]/page.tsx'))}){source=source.replace(/import \\{ QuotationGuard \\} from [^;]+;/,'const QuotationGuard=()=>null;').replace(/import \\{ FinanceDocumentNextAction \\} from [^;]+;/,'const FinanceDocumentNextAction=()=>null;');source+='\\nexport { PaymentWorkspace };';}
return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText;};`);
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider.tsx';import LanguageSelector from'${root}/app/components/LanguageSelector.tsx';import{PaymentWorkspace}from'${root}/app/finance/payments/[id]/page.tsx';
createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale="th" pathname="/finance/payments/local" coverage={{finance:true,documentSettings:true,other:false}}><header style={{display:'flex',justifyContent:'space-between',padding:16}}><strong>VP Office OS</strong><LanguageSelector/></header><PaymentWorkspace access={{canManage:true,canConfirm:true,canReverse:true,canReallocate:true}}/></UiLocaleProvider>);`;
const entryFile = path.join(out, 'entry.tsx'); fs.writeFileSync(entryFile, entry);
function compile() { return new Promise((resolve, reject) => webpack({ mode: 'development', context: root, entry: entryFile, output: { path: out, filename: 'bundle.js' },
  resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules')], alias: { 'next/navigation': navigation, 'next/link': link, [path.join(root, 'lib/supabase')]: adapterFile } },
  module: { rules: [{ test: /\.(tsx?|css)$/, use: loader }] }, devtool: false,
  plugins: [new webpack.DefinePlugin({ 'process.env.NODE_ENV': JSON.stringify('development') })],
}, (error, stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve())); }
async function main() {
  await compile();
  const css = ['app/finance/payments/wht-line-review.module.css', 'app/components/LanguageSelector.module.css'].map(file => {
    const prefix = path.basename(file).replaceAll('.', '_') + '_';
    return fs.readFileSync(path.join(root, file), 'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g, (_, key) => '.' + prefix + key);
  }).join('\n');
  const server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(fs.readFileSync(path.join(out, 'bundle.js'))); }
    res.setHeader('Content-Type', 'text/html');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#111827;font-family:Arial,sans-serif}${css}</style><div id="root"></div><script>if(location.search.includes('reset')){localStorage.removeItem('wht-lines-fixture');history.replaceState(null,'',location.pathname)}window.initialFixture=${JSON.stringify(initial).replaceAll('<', '\\u003c')};</script><script src="/bundle.js"></script></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const page = await browser.newPage(), failures = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    const url = 'http://127.0.0.1:' + server.address().port + '/finance/payments/local';
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto(url + '?reset=1');
      await page.getByRole('button', { name: 'มีหัก ณ ที่จ่าย', exact: true }).click();
      const editor = page.locator('[data-wht-editor]');
      assert.equal(await editor.locator('[data-wht-line]').count(), 3);
      assert.equal(await editor.locator('input:checked').count(), 0);
      await page.getByRole('button', { name: 'บันทึกการเปลี่ยนแปลง', exact: true }).click();
      for (const item of items) assert.ok((await editor.innerText()).includes(item.description + ':'));
      assert.equal(await page.evaluate(() => window.fixtureCalls.length), 0);
      await editor.locator('[data-wht-line="line-1"] input').first().check();
      await editor.locator('[data-wht-line="line-1"] select').selectOption('3');
      await editor.locator('[data-wht-line="line-2"] input').last().check();
      await editor.locator('[data-wht-line="line-3"] input').first().check();
      await editor.locator('[data-wht-line="line-3"] select').selectOption('3');
      const before = await editor.locator('select').evaluateAll(nodes => nodes.map(n => n.value));
      for (const locale of ['en', 'th']) {
        await page.locator('button[lang="' + locale + '"]').click();
        assert.deepEqual(await editor.locator('select').evaluateAll(nodes => nodes.map(n => n.value)), before);
        assert.equal(await editor.locator('input:checked').count(), 3);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${width} ${locale} overflow`);
        await page.screenshot({ path: path.join(out, `wht-lines-${width}-${locale}.png`), fullPage: true });
      }
      await page.getByRole('button', { name: 'บันทึกการเปลี่ยนแปลง', exact: true }).click();
      await page.getByRole('button', { name: 'บันทึกแล้ว', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'บันทึกแล้ว', exact: true }).isDisabled(), true);
      const saved = await page.evaluate(() => ({ calls: window.fixtureCalls, db: window.fixtureDb }));
      assert.equal(saved.calls.length, 1); assert.equal(saved.calls[0].name, 'save_finance_payment_wht_lines_draft');
      assert.equal(saved.db.finance_payments[0].wht_amount, '260.19'); assert.equal(saved.db.finance_payments[0].cash_amount, '19019.81');
      assert.equal(saved.db.finance_invoices[0].vat_amount, 607.10);
      assert.equal(saved.db.finance_payment_wht_components.length, 3);
      assert.ok(!('p_cash_amount' in saved.calls[0].payload));
      await page.reload(); await page.getByRole('button', { name: 'บันทึกแล้ว', exact: true }).waitFor();
      assert.equal(await editor.locator('[data-wht-line="line-2"] input').last().isChecked(), true);
      assert.deepEqual(await editor.locator('select').evaluateAll(nodes => nodes.map(n => n.value)), ['3', '3']);
      assert.equal(await page.getByRole('button', { name: 'บันทึกแล้ว', exact: true }).isDisabled(), true);
      await editor.locator('[data-wht-line="line-1"] select').selectOption('custom');
      await editor.locator('[data-wht-line="line-1"] input[type="number"]').fill('2.1234');
      await page.locator('button[lang="en"]').click();
      assert.equal(await editor.locator('input[type="number"]').inputValue(), '2.1234');
      assert.equal(await page.getByRole('button', { name: 'Confirm Payment', exact: true }).isDisabled(), true);
      assert.equal(await page.evaluate(() => window.fixtureCalls.length), 0, 'Reload/edit never confirms or saves automatically');
    }
    assert.deepEqual(failures, []); console.log(JSON.stringify({ pass: true, widths: [390, 768, 1440], locales: ['th', 'en'], artifacts: out }));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); console.error('Artifacts:', out); process.exitCode = 1; });
