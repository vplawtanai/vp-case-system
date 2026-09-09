/* eslint-disable @typescript-eslint/no-require-imports */
// Real navigation and locale components. Local fixture only; no auth or database access.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..'), out = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-finance-nav-'));
const write = (name, body) => { const file = path.join(out, name); fs.writeFileSync(file, body); return file; };
const loader = write('loader.cjs', `module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix=require('path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,key)=>'+JSON.stringify(prefix)+'+key})};';}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText;};`);
const navigation = write('navigation.js', 'export const usePathname=()=>location.pathname;');
const link = write('link.js', `import React from ${JSON.stringify(require.resolve('react'))};export default function Link({children,...props}){return React.createElement('a',props,children);}`);
const { fixture: combinedFixture } = require('./combined-document-render-fixture.cjs');
const synthetic = {
  clients: [{ id: 'synthetic-client', name: 'ลูกค้าตัวอย่าง / Synthetic Client' }],
  finance_payments: ['confirmed', 'draft', 'cancelled', 'reversed'].map((status, i) => ({ id: `9000000${i}-0000-4000-8000-000000000001`, client_id: 'synthetic-client', internal_reference: null, received_on: '2026-09-05', cash_amount: '4859.81', wht_amount: '140.19', settlement_amount: '5000.00', currency: 'THB', status })),
  finance_combined_documents: ['issued', 'draft', 'cancelled'].map((status, i) => ({ ...combinedFixture(status).combined, id: `8000000${i}-0000-4000-8000-000000000001` })),
};
const supabase = write('supabase.js', `const tables=${JSON.stringify(synthetic)};window.__listFixture={tables,reads:[],failNext:false};export const supabase={from(table){if(!Object.hasOwn(tables,table))throw Error('Unexpected table '+table);const record={table,filters:[]};window.__listFixture.reads.push(record);let rows=tables[table];const q={select(columns){record.columns=columns;return q;},order(){return q;},eq(key,value){record.filters.push([key,value]);rows=rows.filter(row=>row[key]===value);return q;},in(key,values){rows=rows.filter(row=>values.includes(row[key]));return q;},range(start,end){record.range=[start,end];rows=rows.slice(start,end+1);return q;},then(resolve,reject){const fail=window.__listFixture.failNext;window.__listFixture.failNext=false;return Promise.resolve(fail?{data:null,error:{message:'Private fixture database detail'}}:{data:structuredClone(rows),error:null}).then(resolve,reject);}};return q;}};`);
const quotationGuard = write('quotation-guard.js', `import React from ${JSON.stringify(require.resolve('react'))};import{buildPermissions}from'${root}/lib/permissions.ts';export function QuotationGuard({canAccess,children}){const access={permissions:buildPermissions({role:'admin'})};return React.createElement('main',null,canAccess(access)?children(access):'Denied');}`);
const taxGuard = write('tax-guard.js', `import React from ${JSON.stringify(require.resolve('react'))};import{buildPermissions}from'${root}/lib/permissions.ts';import FinanceSubNav from'${root}/app/finance/FinanceSubNav.tsx';export function TaxInvoiceGuard({children}){const permissions=buildPermissions({role:'admin'});return React.createElement('main',null,React.createElement(FinanceSubNav,{activePage:'tax-invoices',permissions}),children(permissions));}`);
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider.tsx';import LanguageSelector from'${root}/app/components/LanguageSelector.tsx';import FinanceSubNav from'${root}/app/finance/FinanceSubNav.tsx';import{buildPermissions}from'${root}/lib/permissions.ts';
import Payments from'${root}/app/finance/payments/page.tsx';import Combined from'${root}/app/finance/combined-documents/page.tsx';
const h=React.createElement;function Screen(){const[value,setValue]=React.useState('Unsaved customer description');return h(React.Fragment,null,h('header',null,h('strong',null,'VP Office OS'),h(LanguageSelector)),location.pathname==='/finance/payments'?h(Payments):location.pathname==='/finance/combined-documents'?h(Combined):h('main',null,h(FinanceSubNav,{activePage:'invoices',permissions:buildPermissions({role:'admin'})}),h('input',{'aria-label':'Fixture local edit',value,onChange:e=>setValue(e.target.value)})));}createRoot(document.getElementById('root')).render(h(React.StrictMode,null,h(UiLocaleProvider,{initialLocale:'th',pathname:location.pathname},h(Screen))));`;

async function main() {
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  await new Promise((resolve, reject) => webpack({ mode: 'development', context: root, entry: 'data:text/javascript,' + encodeURIComponent(entry), output: { path: out, filename: 'bundle.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules')], alias: { 'next/navigation': navigation, 'next/link': link, [root + '/lib/supabase']: supabase, [root + '/app/finance/quotations/shared']: quotationGuard, [root + '/app/finance/tax-invoices/access']: taxGuard } },
    module: { rules: [{ test: /\.(tsx?|css)$/, use: loader }] }, plugins: [new webpack.DefinePlugin({ 'process.env.NODE_ENV': JSON.stringify('development') })], devtool: false,
  }, (error, stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  const styles = ['app/finance/finance-sub-nav.module.css', 'app/components/LanguageSelector.module.css', 'app/finance/finance-record-list.module.css'].map(file => {
    const prefix = path.basename(file).replaceAll('.', '_') + '_';
    return fs.readFileSync(path.join(root, file), 'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g, (_, key) => '.' + prefix + key);
  }).join('\n');
  const server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(fs.readFileSync(path.join(out, 'bundle.js'))); }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#111827;background:#f8fafc}header{display:flex;align-items:center;justify-content:space-between;padding:16px}main{padding:16px;max-width:1180px;margin:auto}input{max-width:100%;padding:12px;border:1px solid #ddd;margin-top:24px}' + styles + '</style><div id="root"></div><script src="/bundle.js"></script></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const page = await browser.newPage(), errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => { if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue(); external.push(route.request().url()); return route.abort(); });
    const base = 'http://127.0.0.1:' + server.address().port;
    const expected = {
      th: ['ใบเสนอราคา', 'ข้อตกลงค่าบริการ', 'รายการเรียกเก็บนอกใบเสนอราคา', 'ใบแจ้งหนี้', 'เงินรับ', 'เอกสารรับเงิน', 'เบิกค่าใช้จ่าย', 'ค่าตอบแทนทนาย', 'เดิม'],
      en: ['Quotations', 'Fee Agreements', 'Non-Quotation Charges', 'Invoices', 'Payments', 'Payment Documents', 'Expense Claims', 'Lawyer Compensation', 'Legacy'],
    };
    for (const width of [390, 768, 1024, 1440]) for (const locale of ['th', 'en']) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + '/finance/invoices/compose');
      await page.locator(`button[lang="${locale}"]`).click();
      const nav = page.getByRole('navigation');
      const top = nav.locator(':scope > a, :scope > div > button');
      assert.deepEqual((await top.allTextContents()).map(text => text.trim()), expected[locale]);
      assert.equal(await nav.locator('a[aria-current="page"]').getAttribute('href'), '/finance/invoices');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      for (const box of await top.evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { x: r.x, right: r.right, height: r.height, textFits: node.scrollWidth <= node.clientWidth + 1 }; }))) {
        assert.ok(box.x >= 0 && box.right <= width && box.height >= 44 && box.textFits, JSON.stringify(box));
      }
      const documents = nav.getByRole('button', { name: expected[locale][5] });
      await documents.focus(); await page.keyboard.press('ArrowDown');
      await page.waitForFunction(() => document.activeElement?.getAttribute('href') === '/finance/receipts');
      assert.equal(await documents.getAttribute('aria-expanded'), 'true');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), '/finance/combined-documents');
      await page.keyboard.press('End');
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), '/finance/tax-invoices');
      await page.keyboard.press('Home');
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), '/finance/receipts');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(out, `payment-documents-${locale}-${width}.png`) });
      await page.keyboard.press('Escape');
      assert.equal(await documents.getAttribute('aria-expanded'), 'false');
      assert.equal(await documents.evaluate(node => node === document.activeElement), true);
      await documents.click();
      await page.locator('header strong').click();
      assert.equal(await documents.getAttribute('aria-expanded'), 'false');
      await documents.focus(); await page.keyboard.press('Enter');
      await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
      assert.equal(await documents.getAttribute('aria-expanded'), 'false', 'Tab leaves disclosure without trapping focus');
      const legacy = nav.getByRole('button', { name: expected[locale][8], exact: true });
      await legacy.click();
      const legacyLink = nav.locator('a[href="/finance/ledger"]');
      assert.equal(await legacyLink.isVisible(), true);
      const box = await legacyLink.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width);
      await page.screenshot({ path: path.join(out, `legacy-${locale}-${width}.png`) });
      await page.keyboard.press('Escape');
      await page.getByRole('textbox').fill('Retained local edit');
      await page.locator(`button[lang="${locale === 'en' ? 'th' : 'en'}"]`).click();
      assert.equal(await page.getByRole('textbox').inputValue(), 'Retained local edit');
      assert.equal(page.url(), base + '/finance/invoices/compose');
    }
    for (const [route, groupName] of [['receipts', 'Payment Documents'], ['combined-documents', 'Payment Documents'], ['tax-invoices', 'Payment Documents'], ['ledger', 'Legacy']]) {
      await page.goto(base + `/finance/${route}/synthetic-id`);
      await page.locator('button[lang="en"]').click();
      const group = page.getByRole('button', { name: groupName, exact: true });
      assert.match(await group.getAttribute('class'), /activeLink/);
      await group.click();
      assert.equal(await page.getByRole('navigation').locator('a[aria-current="page"]').getAttribute('href'), `/finance/${route}`);
      await page.getByRole('navigation').locator('a[aria-current="page"]').click();
      assert.equal(page.url(), base + `/finance/${route}`);
    }
    for (const width of [390, 768, 1024, 1440]) for (const route of ['payments', 'combined-documents']) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(base + `/finance/${route}`);
      await page.locator('tbody tr').first().waitFor();
      for (const locale of ['th', 'en']) {
        await page.locator(`button[lang="${locale}"]`).click();
        const list = page.locator('main > section');
        assert.equal(await list.getByRole('heading').textContent(), route === 'payments' ? locale === 'th' ? 'เงินรับ' : 'Payments' : locale === 'th' ? 'ใบเสร็จรับเงิน/ใบกำกับภาษี' : 'Receipt / Tax Invoice');
        assert.equal(await page.getByRole('navigation').locator(route === 'payments' ? 'a[aria-current="page"]' : 'button[class*="activeLink"]').count(), 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        const first = list.locator('tbody tr').first();
        assert.equal(await first.locator('td').count(), route === 'payments' ? 8 : 7);
        const rowText = await first.textContent();
        for (const value of route === 'payments' ? ['4,859.81', '140.19', '5,000.00'] : ['VP-RTI-', '7,000.00']) assert.ok(rowText.includes(value), rowText);
        for (const box of await first.locator('td').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, fits: node.scrollWidth <= node.clientWidth + 1 }; }))) assert.ok(box.left >= 0 && box.right <= width && box.fits, JSON.stringify(box));
        assert.equal(await list.getByRole('button', { name: /Create|Issue|Confirm|Reverse|สร้าง|ยืนยัน|ออกเอกสาร/ }).count(), 0);
        await page.screenshot({ path: path.join(out, `${route}-${locale}-${width}.png`) });
      }
      const filter = page.getByRole('combobox');
      await filter.selectOption('draft');
      await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
      const chosen = await page.locator('tbody').textContent();
      await page.locator('button[lang="th"]').click();
      assert.equal(await filter.inputValue(), 'draft');
      assert.ok(chosen.includes('Draft'));
      await page.locator('button[lang="en"]').click();
      await page.locator('tbody a').first().click();
      assert.match(page.url(), new RegExp(`/finance/${route}/[a-f0-9-]+$`));
    }
    for (const route of ['payments', 'combined-documents']) {
      await page.goto(base + `/finance/${route}`);
      await page.locator('tbody tr').first().waitFor();
      await page.locator('button[lang="en"]').click();
      const filter = page.getByRole('combobox');
      await page.evaluate(() => { window.__listFixture.failNext = true; });
      await filter.selectOption('draft');
      await page.getByRole('alert').waitFor();
      assert.doesNotMatch(await page.locator('body').textContent(), /Private fixture database detail/);
      await page.getByRole('button', { name: 'Try Again' }).click();
      await page.locator('tbody tr').first().waitFor();
      await page.evaluate(table => { window.__listFixture.tables[table] = []; }, route === 'payments' ? 'finance_payments' : 'finance_combined_documents');
      await filter.selectOption('');
      await page.locator('main > section').getByText(/appear here when created/).waitFor();
      assert.ok((await page.evaluate(() => window.__listFixture.reads)).every(read => ['clients', 'finance_payments', 'finance_combined_documents'].includes(read.table)));
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log(JSON.stringify({ pass: true, widths: [390, 768, 1024, 1440], locales: ['th', 'en'], artifacts: out }));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
