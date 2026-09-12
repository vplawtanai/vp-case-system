/* eslint-disable @typescript-eslint/no-require-imports */
// Real Client page, dialogs and profile editor; synthetic in-memory data only.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..'), out = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-client-modals-'));
const webpack = require('next/dist/compiled/webpack/webpack').webpack;
const adapter = path.join(out, 'adapter.js'), loader = path.join(out, 'loader.cjs'), entry = path.join(out, 'entry.tsx');
const rows = Array.from({ length: 30 }, (_, i) => ({ id: 'local-' + i, client_type: 'individual', name: 'Synthetic Client ' + String(i).padStart(2, '0'), tax_id: String(1000000000000 + i), contact_name: 'Contact ' + i, phone: '0800000000', email: 'test@example.test', line_id: 'test-line', address: 'Synthetic address / ที่อยู่ทดสอบ', note: 'Synthetic note', status: i === 29 ? 'deleted' : 'active' }));
fs.writeFileSync(adapter, `window.rows=${JSON.stringify(rows)};window.calls=[];window.audit=[];window.listLoads=0;window.taxProfiles={};window.deferSave=false;
export const supabase={auth:{async getUser(){return{data:{user:{id:'staff'}}}}},from(table){let op='read',payload,filters=[],single=false,ordered=false;const q={select(){return q},order(){ordered=true;return q},eq(k,v){filters.push(r=>r[k]===v);return q},neq(k,v){filters.push(r=>r[k]!==v);return q},update(p){op='update';payload=p;return q},insert(p){op='insert';payload=p;return q},single(){single=true;return q},maybeSingle(){single=true;return q},then(ok,bad){return run().then(ok,bad)}};async function run(){if(table==='user_profiles')return{data:{role:'admin',financial_access:true},error:null};if(table!=='clients')throw Error('Unexpected table '+table);if(op==='update'){window.calls.push({op,payload});if(window.deferSave)await new Promise(r=>window.releaseSave=r);const row=window.rows.find(r=>filters.every(f=>f(r)));Object.assign(row,payload);return{data:structuredClone(row),error:null}}if(op==='insert'){const row={id:'created',...payload[0]};window.rows.push(row);window.calls.push({op,payload});return{data:structuredClone(row),error:null}}if(ordered)window.listLoads++;const data=window.rows.filter(r=>filters.every(f=>f(r)));return{data:structuredClone(single?data[0]:data),error:null}}return q},async rpc(name,p){const row=window.rows.find(r=>r.id===p.p_client_id),identity={id:row.id,name:row.name,tax_id:row.tax_id,address:row.address,client_type:row.client_type};let profile=window.taxProfiles[row.id]||null;if(name==='save_finance_customer_tax_profile'){window.calls.push({op:name,payload:p});profile={client_id:row.id,vat_registered:p.p_vat_registered,branch_type:p.p_branch_type,branch_code:p.p_branch_code,identity_evidence:p.p_identity_evidence,identity_snapshot_json:identity,verified_at:p.p_verified?'2026-09-01T00:00:00Z':null,updated_at:'2026-09-01T00:00:00Z'};window.taxProfiles[row.id]=profile}else if(name!=='get_finance_customer_tax_profile')throw Error('Unexpected RPC '+name);return{data:{identity,profile,can_manage:true,status:!profile?'missing':profile.verified_at?'verified':'unverified'},error:null}}};`);
const reactPath = JSON.stringify(require.resolve('react'));
const stubs = {
  auth: `import React from ${reactPath};export default function Guard({children}){return children}`,
  nav: `import React from ${reactPath};export default function Nav(){return <h1>Clients</h1>}`,
  audit: 'export async function createAuditLog(p){window.audit.push(p)}',
  navigation: 'export const usePathname=()=>"/clients";export const useParams=()=>({id:"local-20"});',
  link: `import React from ${reactPath};export default function Link({children,...p}){return React.createElement('a',p,children)}`,
};
for (const [name, source] of Object.entries(stubs)) fs.writeFileSync(path.join(out, name + '.tsx'), source);
fs.writeFileSync(loader, `const path=require('path');module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix=path.basename(this.resourcePath,'.module.css')+'__';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(prefix)+'+k})};'}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);
fs.writeFileSync(entry, `import React from'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider';import ClientsPage from'${root}/app/clients/page';createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale="th" pathname="/clients"><ClientsPage/></UiLocaleProvider>);`);

async function main() {
  const alias = { 'next/navigation': path.join(out, 'navigation.tsx'), 'next/link': path.join(out, 'link.tsx'), [path.join(root, 'lib/supabase')]: adapter, [path.join(root, 'lib/auditLog')]: path.join(out, 'audit.tsx'), [path.join(root, 'app/components/AuthGuard')]: path.join(out, 'auth.tsx'), [path.join(root, 'app/components/AppTopNav')]: path.join(out, 'nav.tsx') };
  await new Promise((resolve, reject) => webpack({ mode: 'development', context: root, entry, output: { path: out, filename: 'bundle.js' }, resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules')], alias }, module: { rules: [{ test: /\.(tsx?|css)$/, use: loader }] }, devtool: false }, (e, stats) => e || stats.hasErrors() ? reject(e || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  const css = ['app/components/DetailModal.module.css', 'app/components/LanguageSelector.module.css', 'app/clients/client-form.module.css', 'app/clients/tax-identity.module.css'].map(file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\.([a-zA-Z_][\w-]*)/g, '.' + path.basename(file, '.module.css') + '__$1')).join('\n');
  const server = http.createServer((req, res) => { if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(path.join(out, 'bundle.js'))); } else { res.setHeader('Content-Type', 'text/html'); res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}${css}</style><div id="root"></div><script src="/bundle.js"></script></html>`); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
    browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => { errors.push('Unexpected native dialog: ' + d.message()); void d.dismiss(); });
    await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
    const row = () => page.getByRole('row').filter({ hasText: 'Synthetic Client 20' });
    const modal = () => page.getByRole('dialog').first();
    const position = () => page.evaluate(() => ({ y: window.scrollY, x: document.querySelector('table').parentElement.scrollLeft }));
    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto('http://127.0.0.1:' + server.address().port + '/clients');
      await row().waitFor(); assert.equal(await page.getByRole('dialog').count(), 0);
      await page.locator('main').getByLabel('Name', { exact: true }).fill('Unsaved New Client');
      const search = page.getByPlaceholder('Search name, contact, phone, email, tax id'); await search.fill('Synthetic');
      await row().getByRole('button', { name: 'Edit', exact: true }).scrollIntoViewIfNeeded();
      const before = await position(); await row().getByRole('button', { name: 'Edit', exact: true }).click();
      await modal().waitFor(); assert.equal(await modal().getAttribute('aria-modal'), 'true');
      assert.equal(await modal().getByRole('button', { name: 'Close details', exact: false }).count(), 0);
      await modal().locator('button[lang=en]').click();
      const expected = rows[20];
      for (const [label, key] of [['Name', 'name'], ['Tax ID', 'tax_id'], ['Client type', 'client_type'], ['Contact name', 'contact_name'], ['Phone', 'phone'], ['Email', 'email'], ['Line ID', 'line_id'], ['Status', 'status'], ['Address', 'address'], ['Note', 'note']]) assert.equal(await modal().getByLabel(label, { exact: true }).inputValue(), expected[key]);
      await modal().getByLabel('Contact name', { exact: true }).fill('Unsaved contact');
      for (const locale of ['th', 'en']) {
        await modal().locator('button[lang=' + locale + ']').click();
        assert.equal(await modal().locator('input').nth(2).inputValue(), 'Unsaved contact');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        assert.equal(await modal().evaluate(e => e.scrollWidth > e.clientWidth + 1), false);
        await page.screenshot({ path: path.join(out, 'edit-' + width + '-' + locale + '.png') });
      }
      const close = modal().getByRole('button', { name: /close details/i }); await close.focus(); await page.keyboard.press('Shift+Tab');
      assert.equal(await modal().getByRole('button', { name: 'Save Changes', exact: true }).evaluate(e => e === document.activeElement), true);
      await page.keyboard.press('Tab'); assert.equal(await close.evaluate(e => e === document.activeElement), true);
      await page.keyboard.press('Escape'); await page.getByRole('dialog', { name: 'Discard Unsaved Changes?' }).waitFor();
      assert.equal(await page.evaluate(() => window.calls.length), 0);
      await page.getByRole('button', { name: 'Keep Editing', exact: true }).click();
      assert.equal(await modal().getByLabel('Contact name', { exact: true }).inputValue(), 'Unsaved contact');
      if (width > 600) await page.mouse.click(5, 5); else await modal().getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByRole('button', { name: 'Discard Changes', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
      assert.deepEqual(await position(), before); assert.equal(await search.inputValue(), 'Synthetic');
      assert.equal(await row().getByRole('button', { name: 'Edit', exact: true }).evaluate(e => e === document.activeElement), true);
      assert.equal(await page.locator('main').getByLabel('Name', { exact: true }).inputValue(), 'Unsaved New Client');
      await row().getByRole('button', { name: 'Edit', exact: true }).click();
      await modal().getByLabel('Tax ID', { exact: true }).fill(rows[19].tax_id); await modal().getByRole('button', { name: 'Save Changes', exact: true }).click(); await modal().getByRole('alert').waitFor(); assert.equal(await page.evaluate(() => window.calls.length), 0);
      await modal().getByLabel('Tax ID', { exact: true }).fill(expected.tax_id);
      await modal().getByLabel('Contact name', { exact: true }).fill('Saved contact'); await page.evaluate(() => window.deferSave = true);
      await modal().getByRole('button', { name: 'Save Changes', exact: true }).click(); await page.waitForFunction(() => !!window.releaseSave); await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 1);
      await page.evaluate(() => { window.deferSave = false; window.releaseSave(); }); await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
      assert.equal(await page.evaluate(() => window.calls.filter(c => c.op === 'update').length), 1); assert.equal(await page.evaluate(() => window.listLoads), 1); assert.ok((await row().innerText()).includes('Saved contact')); assert.deepEqual(await position(), before);
      await row().getByRole('button', { name: 'ข้อมูลภาษี', exact: true }).click(); await modal().locator('select').first().waitFor();
      const taxBefore = await page.evaluate(() => window.calls.length);
      await modal().locator('select').first().selectOption('true'); await modal().locator('select').nth(1).selectOption('head_office'); await modal().locator('textarea').fill('Synthetic evidence'); await modal().locator('input[type=checkbox]').check();
      for (const locale of ['th', 'en']) { await modal().locator('button[lang=' + locale + ']').click(); assert.equal(await modal().locator('input[type=checkbox]').isChecked(), true); assert.equal(await modal().locator('textarea').inputValue(), 'Synthetic evidence'); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); await page.screenshot({ path: path.join(out, 'tax-' + width + '-' + locale + '.png') }); }
      await modal().getByRole('button', { name: 'Save Changes', exact: true }).click(); await page.waitForFunction(() => document.querySelector('[role=dialog] button[type=submit]').disabled);
      assert.ok((await modal().getByRole('status').innerText()).includes('Tax Identity Verified')); const saved = await page.evaluate(() => window.calls.at(-1)); assert.equal(saved.payload.p_branch_code, '00000'); assert.equal(saved.payload.p_verified, true);
      await modal().locator('textarea').fill('Updated synthetic evidence'); assert.equal(await modal().locator('input[type=checkbox]').isChecked(), false); await modal().getByRole('button', { name: 'Save Changes', exact: true }).click(); await page.waitForFunction(() => document.querySelector('[role=dialog] button[type=submit]').disabled); assert.ok((await modal().getByRole('status').innerText()).includes('Not Verified'));
      await page.waitForFunction(() => !document.querySelector('[role=dialog] [aria-busy=true]')); await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('[role=dialog]')); await row().getByRole('button', { name: 'ข้อมูลภาษี', exact: true }).click(); await modal().locator('textarea').waitFor(); assert.equal(await modal().locator('textarea').inputValue(), 'Updated synthetic evidence'); assert.equal(await modal().locator('input[type=checkbox]').isChecked(), false);
      await modal().locator('textarea').fill('Discard this'); await modal().getByRole('button', { name: 'Edit Name, Tax ID and Address in Client Information', exact: true }).click(); await page.getByRole('button', { name: 'Discard Changes', exact: true }).click(); await page.getByRole('dialog', { name: 'Edit Client' }).waitFor(); assert.equal(await modal().getByLabel('Contact name', { exact: true }).inputValue(), 'Saved contact'); await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => window.calls.length), taxBefore + 2); assert.equal(await search.inputValue(), 'Synthetic'); assert.equal(await page.evaluate(() => window.listLoads), 1);
      await page.getByRole('button', { name: 'Show deleted clients', exact: true }).click(); await page.getByRole('row').filter({ hasText: 'Synthetic Client 29' }).waitFor(); assert.equal(await page.getByRole('button', { name: 'Edit', exact: true }).count(), 0); await page.getByRole('button', { name: 'Show active clients', exact: true }).click();
      await page.locator('main').getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForFunction(() => window.calls.some(c => c.op === 'insert')); await page.waitForFunction(() => document.querySelector('main input').value === 'Synthetic'); assert.equal(await page.getByRole('dialog').count(), 0); await page.waitForFunction(() => window.listLoads === 2); assert.equal(await page.locator('main').getByLabel('Name', { exact: true }).inputValue(), '');
      assert.equal(await page.evaluate(() => window.audit.filter(c => c.action === 'update').length), 1); assert.equal(await page.evaluate(() => window.audit.filter(c => c.action === 'create').length), 1);
    }
    assert.deepEqual(errors, []); console.log(JSON.stringify({ pass: true, widths: [390, 768, 1024, 1440], locales: ['th', 'en'], artifacts: out }));
  } catch (error) {
    const page = browser?.contexts()[0]?.pages()[0];
    if (page) { fs.writeFileSync(path.join(out, 'failure.txt'), await page.locator('body').ariaSnapshot()); await page.screenshot({ path: path.join(out, 'failure.png') }); }
    throw error;
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(e => { console.error(e); console.error('Artifacts:', out); process.exitCode = 1; });
