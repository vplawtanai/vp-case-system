/* eslint-disable @typescript-eslint/no-require-imports */
// Actual client components, local synthetic reads/writes only. All external requests are blocked.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..'), out = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-charge-runtime-'));
const baseline = process.env.VP_BILLABLE_BASELINE === '1';
const clientId = '30000000-0000-4000-8000-000000000001';
const write = (name, text) => { const file = path.join(out, name); fs.writeFileSync(file, text); return file; };
const loader = write('loader.cjs', `module.exports=function(source){
  if(${baseline} && this.resourcePath.startsWith(${JSON.stringify(root + '/')}) && !this.resourcePath.includes('/node_modules/')) source=require('node:child_process').execFileSync('git',['show','HEAD:'+require('node:path').relative(${JSON.stringify(root)},this.resourcePath)],{cwd:${JSON.stringify(root)},encoding:'utf8'});
  if(this.resourcePath.endsWith('.css')){const prefix=require('path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,key)=>'+JSON.stringify(prefix)+'+key})};';}
  return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText;
};`);
const navigation = write('navigation.js', `const params=new URLSearchParams(location.search);export const useSearchParams=()=>params;export const usePathname=()=>location.pathname;export const useRouter=()=>({push:url=>location.assign(url)});`);
const link = write('link.js', `import React from ${JSON.stringify(require.resolve('react'))};export default function Link({children,...props}){return React.createElement('a',props,children);}`);
const auth = write('auth.js', `export default function Auth({children}){return children;}`);
const topNav = write('top-nav.js', `export default function TopNav(){return null;}`);
const guard = write('guard.js', `import{buildPermissions}from ${JSON.stringify(root + '/lib/permissions.ts')};export function QuotationGuard({children}){return children({permissions:buildPermissions({role:'admin'})});}`);
const supabase = write('supabase.js', `
const tables={user_profiles:[{id:'fixture-user',role:'admin'}],clients:[{id:${JSON.stringify(clientId)},name:'Synthetic Client',client_type:'individual'}],cases:[],advisory_matters:[],finance_billable_charges:[],finance_invoice_charge_allocations:[],finance_invoices:[],finance_billing_plans:[],finance_fee_agreements:[],finance_billing_installments:[],finance_billing_installment_items:[],finance_fee_agreement_items:[],finance_billing_installment_charge_bridges:[],finance_bank_accounts:[]};
const calls=[];window.__chargeFixture={calls,tables};
export const supabase={auth:{getUser:async()=>({data:{user:{id:'fixture-user'}}})},from(table){if(!Object.hasOwn(tables,table))throw Error('Unexpected fixture table '+table);let rows=tables[table],single=false;const q={select:()=>q,order:()=>q,eq(k,v){rows=rows.filter(r=>r[k]===v);return q;},neq(k,v){rows=rows.filter(r=>r[k]!==v);return q;},in(k,v){rows=rows.filter(r=>v.includes(r[k]));return q;},not(k,operator,v){if(operator!=='is')throw Error('Unexpected filter');rows=rows.filter(r=>r[k]!==v);return q;},single(){single=true;return q;},maybeSingle(){single=true;return q;},then(resolve,reject){return Promise.resolve({data:structuredClone(single?rows[0]||null:rows),error:null}).then(resolve,reject);}};return q;},async rpc(name,args){calls.push({name,args:structuredClone(args)});const id='40000000-0000-4000-8000-000000000001';if(name==='create_finance_billable_charge_draft'){tables.finance_billable_charges.push({id,status:'draft',client_id:args.p_client_id,case_id:args.p_case_id,advisory_matter_id:args.p_advisory_matter_id,source_type:args.p_source_type,client_cost_funding_mode:args.p_client_cost_funding_mode,total_amount:0});return{data:id,error:null};}if(name==='save_finance_billable_charge_draft'){const row=tables.finance_billable_charges.find(r=>r.id===args.p_charge_id);Object.assign(row,{description:args.p_description,total_amount:5000});return{data:row.id,error:null};}throw Error('Unexpected fixture RPC '+name);}};`);
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider.tsx';import{cookieUiLocale as readLocale}from'${root}/lib/i18n/core.ts';import LanguageSelector from'${root}/app/components/LanguageSelector.tsx';import Charges from'${root}/app/finance/billable-charges/page.tsx';import Composer from'${root}/app/finance/invoices/compose/page.tsx';const h=React.createElement;createRoot(document.getElementById('root')).render(h(React.StrictMode,null,h(UiLocaleProvider,{initialLocale:readLocale(document.cookie)||'th',pathname:location.pathname},h('header',{style:{padding:16,display:'flex',justifyContent:'space-between'}},h('strong',null,'VP Office OS'),h(LanguageSelector)),h(location.pathname.includes('/compose')?Composer:Charges))));`;

async function main() {
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  await new Promise((resolve, reject) => webpack({ mode: 'development', context: root, entry: 'data:text/javascript,' + encodeURIComponent(entry), output: { path: out, filename: 'bundle.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules')], alias: { 'next/navigation': navigation, 'next/link': link,
      [root + '/lib/supabase']: supabase, [root + '/app/components/AuthGuard']: auth, [root + '/app/components/AppTopNav']: topNav, [root + '/app/finance/quotations/shared']: guard } },
    module: { rules: [{ test: /\.(tsx?|css)$/, use: loader }] }, plugins: [new webpack.DefinePlugin({ 'process.env.NODE_ENV': JSON.stringify('development') })], devtool: false,
  }, (error, stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  const styles = ['app/finance/billable-charges/billable-charges.module.css', 'app/finance/invoices/invoice-workspace.module.css', 'app/finance/invoices/invoice-workspace-nav.module.css', 'app/finance/finance-sub-nav.module.css', 'app/components/LanguageSelector.module.css'].map(file => {
    const prefix = path.basename(file).replaceAll('.', '_') + '_';
    return fs.readFileSync(path.join(root, file), 'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g, (_, key) => '.' + prefix + key);
  }).join('\n');
  const server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(fs.readFileSync(path.join(out, 'bundle.js'))); }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#f8fafc}' + styles + '</style><div id="root"></div><script src="/bundle.js"></script></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const page = await browser.newPage(), failures = [], external = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.route('**/*', route => { if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue(); external.push(route.request().url()); return route.abort(); });
    const base = 'http://127.0.0.1:' + server.address().port;
    await page.goto(base + '/finance/billable-charges');
    if (baseline) {
      await page.waitForFunction(() => document.querySelector('main') === null);
      await page.waitForTimeout(500);
      assert.ok(failures.some(message => message === 'Missing UI translation: finance.invoice.ui.workspace'), JSON.stringify(failures));
      console.log(JSON.stringify({ baselineCrashReproduced: true, errors: failures, externalRequests: external }));
      return;
    }
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      for (const locale of ['th', 'en']) {
        await page.goto(base + '/finance/billable-charges');
        await page.locator('button[lang="' + locale + '"]').click();
        const create = page.getByRole('button', { name: locale === 'th' ? 'สร้างรายการเรียกเก็บเพิ่มเติม' : 'Create Billable Charge', exact: true });
        await create.waitFor(); await create.click();
        await page.locator('textarea').first().fill('Original unsaved description');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await page.screenshot({ path: path.join(out, 'charges-' + locale + '-' + width + '.png'), fullPage: true });
        await page.locator('button[lang="' + (locale === 'th' ? 'en' : 'th') + '"]').click();
        assert.equal(await page.locator('textarea').first().inputValue(), 'Original unsaved description');
        await page.locator('button[lang="en"]').click();
        await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
        await page.waitForFunction(() => document.activeElement?.closest('label')?.id === 'billable-charge-field-Client');
        const customer = page.locator('label').filter({ has: page.locator('span', { hasText: /^Client$/ }) }).locator('select');
        assert.equal(await customer.evaluate(element => element === document.activeElement), true);
        assert.equal(await page.evaluate(() => window.__chargeFixture.calls.length), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      }
    }
    await page.goto(base + '/finance/invoices/compose?client=' + clientId);
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      for (const locale of ['th', 'en']) {
        await page.locator('button[lang="' + locale + '"]').click();
        await page.getByRole('link', { name: locale === 'th' ? 'สร้างรายการเรียกเก็บเพิ่มเติม' : 'Create Billable Charge', exact: true }).waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await page.screenshot({ path: path.join(out, 'composer-' + locale + '-' + width + '.png'), fullPage: true });
      }
    }
    await page.locator('button[lang="en"]').click();
    const createLink = page.getByRole('link', { name: 'Create Billable Charge', exact: true });
    await createLink.waitFor(); assert.equal(await createLink.getAttribute('href'), '/finance/billable-charges?new=1&client=' + clientId);
    await createLink.click();
    await page.getByRole('button', { name: 'Save Draft', exact: true }).waitFor();
    const field = label => page.locator('label').filter({ has: page.locator('span', { hasText: new RegExp('^' + label + '$') }) });
    assert.equal(await field('Client').locator('select').inputValue(), clientId);
    await field('Item').locator('textarea').fill('Synthetic professional service');
    await field('unit').locator('input').fill('service');
    await field('Unit Price').locator('input').fill('5000');
    await field('Economic Classification').locator('select').selectOption('professional_fee');
    await field('VAT Calculation').locator('select').selectOption('vat_inclusive');
    await page.locator('button[lang="th"]').click(); await page.locator('button[lang="en"]').click();
    assert.equal(await field('Client').locator('select').inputValue(), clientId);
    assert.equal(await field('VAT Calculation').locator('select').inputValue(), 'vat_inclusive');
    await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
    await page.getByText('Charge Draft saved.', { exact: true }).waitFor();
    const calls = await page.evaluate(() => window.__chargeFixture.calls);
    assert.deepEqual(calls.map(call => call.name), ['create_finance_billable_charge_draft', 'save_finance_billable_charge_draft']);
    assert.equal(calls[0].args.p_client_id, clientId); assert.equal(calls[0].args.p_case_id, null);
    assert.equal(calls[1].args.p_price_tax_mode, 'vat_inclusive'); assert.equal(calls[1].args.p_vat_rate, 7); assert.equal(calls[1].args.p_unit_rate, 5000);
    assert.equal(calls[1].args.p_economic_classification, 'professional_fee'); assert.equal(calls[1].args.p_currency, 'THB');
    assert.deepEqual(failures, []); assert.deepEqual(external, []);
    console.log(JSON.stringify({ pass: true, widths: [1440, 768, 390], locales: ['th', 'en'], formRetained: true, validatedClientPrefilled: true, unchangedCanonicalSave: true, productionAccess: false, artifacts: out }));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
