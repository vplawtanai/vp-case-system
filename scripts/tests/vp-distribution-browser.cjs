/* eslint-disable @typescript-eslint/no-require-imports */
// Real React/DetailModal, closed synthetic RPC adapter, and loopback-only requests.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..'), out = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-distribution-browser-'));
const { fixture, record } = require('./vp-distribution-fixture.cjs');
const webpack = require('next/dist/compiled/webpack/webpack').webpack;
const adapter = path.join(out, 'adapter.js'), navigation = path.join(out, 'navigation.js'), link = path.join(out, 'link.js'), loader = path.join(out, 'loader.cjs'), entry = path.join(out, 'entry.tsx');
fs.writeFileSync(adapter, `
window.calls=[];window.reads=0;window.failure=null;window.failReadAfterWrite=false;
window.context=${JSON.stringify(fixture())};const initialRecord=${JSON.stringify(record(fixture()))};
const mode=new URLSearchParams(location.search).get('mode'),c=window.context;
if(mode==='readonly')c.can_manage=false;
if(mode==='unknown'){c.source.lines[1].classification='unknown';c.source.blockers=['secret_new_backend_code'];}
if(mode==='reversed')c.source.money_source.payment.status='reversed';
if(mode?.startsWith('stale-')||mode?.startsWith('unavailable-')||mode==='superseded'){
 const status=mode==='stale-finalized'?'finalized':mode==='superseded'||mode==='unavailable-history'?'superseded':'reviewed';
 c.current={...structuredClone(initialRecord),status};c.history=[structuredClone(c.current)];c.source_current=false;
 c.audit=[{id:'synthetic-audit',distribution_id:c.current.id,event_type:status,created_at:initialRecord.created_at,actor_id:'synthetic-admin'}];
 c.source.lines[1].description='CHANGED LIVE DESCRIPTION';c.source.lines[1].professional_pool=1;
 if(mode?.startsWith('unavailable-')){c.source.money_source=null;c.source.lines=[];c.source.totals=Object.fromEntries(Object.keys(c.source.totals).map(k=>[k,null]));c.source.blockers=['money_source_unavailable'];}
 if(status==='superseded')c.current=null;
}
export const supabase={async rpc(name,p){
 if(name==='get_finance_vp_distribution'){window.reads++;if(window.readFailure||(mode==='load-failed'&&window.reads===1)){window.readFailure=false;return{error:{message:'synthetic unavailable'}};}return{data:structuredClone(c)};}
 if(!['save_finance_vp_distribution','transition_finance_vp_distribution'].includes(name))throw Error('Unexpected RPC '+name);
 window.calls.push({name,p:structuredClone(p)});await new Promise(r=>setTimeout(r,40));
 if(window.failure){const failure=window.failure;window.failure=null;return{error:{message:failure}};}
 if(!c.can_manage)return{error:{message:'VP_DISTRIBUTION_PERMISSION_DENIED'}};
 if(name==='save_finance_vp_distribution'){
  if(p.p_payment_id!=='synthetic-payment')throw Error('Non-synthetic payment');
  const latest=c.current??c.history[0];
  if(p.p_expected_id!==(latest?.id??null)||p.p_expected_version!==(latest?.version??null))throw Error('Expected version contract');
  for(const choice of p.p_choices)for(const field of ['referral_amount','company_share_amount','work_compensation_amount'])if(typeof choice[field]!=='number')throw Error('JSON numbers required');
  if(JSON.stringify(p.p_source)!==JSON.stringify(c.source))throw Error('Source changed');
  const prior=c.history[0],revision=c.current?.revision??(prior?.revision??0)+1;
  c.current={...structuredClone(initialRecord),id:c.current?.id??'synthetic-distribution-'+revision,revision,previous_id:c.current?.previous_id??prior?.id??null,
    version:(c.current?.version??0)+1,status:'draft',source_snapshot_json:structuredClone(p.p_source),decisions_json:structuredClone(p.p_choices),note:p.p_note};c.source_current=true;
 }else{
  if(p.p_id!==c.current?.id||p.p_expected_version!==c.current?.version||!p.p_acknowledged)throw Error('Transition contract');
  if(p.p_action==='supersede'&&!p.p_reason.trim())throw Error('Reason required');
  c.current.status=({review:'reviewed',finalize:'finalized',supersede:'superseded'})[p.p_action];c.current.version++;
  if(p.p_action==='supersede'){c.current.supersede_reason=p.p_reason;c.current.superseded_at=initialRecord.created_at;}
 }
 const id=c.current.id;c.history=[structuredClone(c.current),...c.history.filter(h=>h.id!==id)];
 c.audit.push({id:'synthetic-audit-'+window.calls.length,distribution_id:id,event_type:name==='save_finance_vp_distribution'?'saved':c.current.status,created_at:initialRecord.created_at,actor_id:'synthetic-admin'});
 if(c.current.status==='superseded'){c.current=null;c.source_current=false;}
 if(window.failReadAfterWrite){window.failReadAfterWrite=false;window.readFailure=true;}
 return{data:id};
}};
`);
fs.writeFileSync(navigation, "export const usePathname=()=>'/finance/payments/local';");
fs.writeFileSync(link, `import React from '${require.resolve('react')}';export default function Link({children,...props}){return React.createElement('a',props,children)}`);
fs.writeFileSync(loader, `module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix=require('node:path').basename(this.resourcePath).replaceAll('.','_')+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(prefix)+'+k})};'}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);
fs.writeFileSync(entry, `import React from'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider.tsx';import LanguageSelector from'${root}/app/components/LanguageSelector.tsx';import{VpDistributionPanel}from'${root}/app/finance/payments/vp-distribution-panel.tsx';createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale="th" pathname="/finance/payments/local"><LanguageSelector/><main><VpDistributionPanel paymentId="synthetic-payment"/></main></UiLocaleProvider>);`);

async function main() {
  await new Promise((resolve, reject) => webpack({ mode: 'development', context: root, entry, output: { path: out, filename: 'bundle.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules')], alias: { 'next/navigation': navigation, 'next/link': link, [path.join(root, 'lib/supabase')]: adapter } },
    module: { rules: [{ test: /\.(tsx?|css)$/, use: loader }] }, devtool: false,
  }, (error, stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  const css = ['app/finance/payments/money-allocation.module.css', 'app/finance/payments/vp-distribution.module.css', 'app/components/DetailModal.module.css', 'app/components/LanguageSelector.module.css'].map(file => {
    const prefix = path.basename(file).replaceAll('.', '_') + '_';
    return fs.readFileSync(path.join(root, file), 'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g, (_, key) => '.' + prefix + key);
  }).join('\n');
  const server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(path.join(out, 'bundle.js'))); return; }
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}main{padding:12px;max-width:1080px;margin:auto}${css}</style><div id="root"></div><script src="/bundle.js"></script></html>`);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser;
  try {
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
    browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const page = await browser.newPage(), errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    const url = 'http://127.0.0.1:' + server.address().port;
    require('./receipt-render-fixture.cjs');
    const { translate } = require('../../lib/i18n/catalog.ts');
    let locale = 'en';
    const text = key => translate(locale, 'vpDistribution.' + key);
    const dialog = page.getByRole('dialog');
    const action = key => dialog.getByRole('button', { name: text(key), exact: true });
    const settled = () => page.waitForFunction(() => !document.querySelector('[role=dialog] [aria-busy=true]'));
    const calls = () => page.evaluate(() => window.calls.length);
    async function open(mode = '') {
      await page.goto(url + (mode ? '?mode=' + mode : ''));
      await page.locator('button[lang=' + locale + ']').click();
      await page.getByRole('button', { name: text('open'), exact: true }).click(); await dialog.waitFor(); await settled();
    }
    async function geometry() {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
      const violations = await dialog.evaluate(el => Array.from(el.querySelectorAll('input[inputmode=decimal], label, button')).filter(node => node.getClientRects().length).filter(node => {
        const box = node.getBoundingClientRect(), parent = node.parentElement.getBoundingClientRect();
        return box.width < 1 || box.left < parent.left - 1 || box.right > parent.right + 1;
      }).map(node => node.outerHTML));
      assert.deepEqual(violations, []);
    }
    for (const width of [390, 768, 1024, 1440]) for (locale of ['th', 'en']) {
      await page.setViewportSize({ width, height: 950 }); await open();
      assert.equal(await dialog.locator('select').count(), 0);
      assert.equal(await dialog.locator('input[inputmode=decimal]').count(), 3);
      assert.equal(await calls(), 0); await geometry();
      await page.screenshot({ path: path.join(out, `vp-top-${width}-${locale}.png`), fullPage: true });
      const referral = dialog.getByLabel(text('referral_amount'), { exact: true });
      const company = dialog.getByLabel(text('company_share_amount'), { exact: true });
      const work = dialog.getByLabel(text('work_compensation_amount'), { exact: true });
      for (const invalid of ['1.001', '-1', '10000.01']) {
        await referral.fill(invalid); await action('save').click(); await dialog.getByRole('alert').waitFor(); assert.equal(await calls(), 0);
      }
      await referral.fill('100.0'); await company.fill('200'); await work.fill('0.00');
      await action('save').dblclick();
      await action('review').waitFor(); await settled(); assert.equal(await calls(), 1);
      assert.equal(await page.evaluate(() => typeof window.calls[0].p.p_choices[0].referral_amount), 'number');
      await action('review').click(); assert.equal(await calls(), 1);
      await dialog.locator('input[type=checkbox]').check(); await action('review').click(); assert.equal(await calls(), 1);
      assert.equal(await dialog.locator('input[inputmode=decimal][aria-invalid=true]').count(), 3);
      await work.fill('9700'); await dialog.getByLabel(text('note'), { exact: true }).fill('Synthetic unsaved note');
      assert.equal(await action('review').isDisabled(), true);
      for (const language of [locale === 'th' ? 'en' : 'th', locale]) {
        await page.locator('button[lang=' + language + ']').evaluate(button => button.click());
        assert.equal(await dialog.isVisible(), true); assert.equal(await dialog.locator('input[inputmode=decimal]').nth(2).inputValue(), '9700');
      }
      for (const language of [locale === 'th' ? 'en' : 'th', locale]) {
        await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
        await page.locator('button[lang=' + language + ']').click();
        await page.getByRole('button', { name: translate(language, 'vpDistribution.open'), exact: true }).click(); await dialog.waitFor();
        assert.equal(await dialog.locator('input[inputmode=decimal]').nth(2).inputValue(), '9700');
        assert.equal(await dialog.locator('textarea').first().inputValue(), 'Synthetic unsaved note');
      }
      assert.equal(await calls(), 1); await action('save').click(); await settled(); assert.equal(await calls(), 2);
      await dialog.locator('input[type=checkbox]').check(); await action('review').click(); await action('finalize').waitFor(); await settled(); assert.equal(await calls(), 3);
      assert.equal(await dialog.locator('input[inputmode=decimal]').count(), 0);
      await dialog.locator('input[type=checkbox]').check(); await action('finalize').click();
      await page.waitForFunction(() => window.context.current.status === 'finalized'); await settled(); assert.equal(await calls(), 4);
      await geometry(); await page.screenshot({ path: path.join(out, `vp-final-${width}-${locale}.png`), fullPage: true });
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      assert.equal(await page.getByRole('button', { name: text('open'), exact: true }).evaluate(button => button === document.activeElement), true);
    }
    for (locale of ['th', 'en']) for (const mode of ['readonly', 'unknown', 'reversed', 'stale-reviewed', 'stale-finalized', 'superseded', 'unavailable-history', 'unavailable-reviewed']) {
      await open(mode); assert.equal(await calls(), 0);
      if (mode === 'readonly') {
        for (const key of ['save', 'review', 'finalize', 'supersede']) assert.equal(await action(key).count(), 0);
        assert.equal(await dialog.locator('input').count(), 0);
      } else if (mode === 'unknown') {
        assert.equal(await dialog.locator('input[inputmode=decimal]').count(), 0); assert.equal(await action('save').isDisabled(), true);
        assert.doesNotMatch(await dialog.innerText(), /secret_new_backend_code/);
      } else if (mode === 'reversed') assert.equal(await action('save').count(), 0);
      else {
        await dialog.locator('summary').filter({ hasText: text('history') }).click();
        await dialog.locator('summary').filter({ hasText: translate(locale, 'vpDistribution.revision', { revision: 1 }) }).click();
        assert.ok((await dialog.innerText()).includes('6,000.00'));
        if (mode !== 'superseded') assert.doesNotMatch(await dialog.innerText(), /CHANGED LIVE DESCRIPTION/);
        const history = dialog.locator('details').filter({ has: page.locator('summary', { hasText: text('history') }) }).first();
        assert.equal(await history.locator('input,textarea,select').count(), 0);
        if (mode === 'stale-reviewed' || mode === 'unavailable-reviewed') assert.equal(await action('finalize').isDisabled(), true);
        if (mode === 'unavailable-history' || mode === 'unavailable-reviewed') {
          assert.ok((await dialog.innerText()).includes(text('block.money_source_unavailable'))); await geometry();
          await page.screenshot({ path: path.join(out, `vp-${mode}-${locale}.png`), fullPage: true });
        }
      }
      assert.equal(await calls(), 0);
    }
    locale = 'en'; await open('stale-reviewed');
    await dialog.locator('summary').filter({ hasText: text('otherActions') }).click();
    await action('supersede').click(); assert.equal(await calls(), 0);
    await dialog.locator('input[type=checkbox]').check(); await action('supersede').click(); assert.equal(await calls(), 0);
    await dialog.getByLabel(text('reason'), { exact: true }).fill('Synthetic explicit supersession');
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: text('open'), exact: true }).click(); await dialog.waitFor(); await settled();
    await dialog.locator('summary').filter({ hasText: text('otherActions') }).click();
    const supersession = dialog.locator('details').filter({ has: page.locator('summary', { hasText: text('otherActions') }) }).first();
    assert.equal(await supersession.locator('textarea').inputValue(), 'Synthetic explicit supersession');
    assert.equal(await dialog.locator('input[type=checkbox]').isChecked(), true); assert.equal(await calls(), 0);
    await action('supersede').click(); await settled(); assert.equal(await calls(), 1);
    assert.equal(await page.evaluate(() => window.context.current), null);
    assert.equal(await page.evaluate(() => window.context.history[0].source_snapshot_json.lines[1].description), 'Professional fee');
    const predecessor = await page.evaluate(() => ({ id: window.context.history[0].id, version: window.context.history[0].version }));
    await page.evaluate(() => { window.context.source = structuredClone(window.context.history[0].source_snapshot_json); });
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: text('open'), exact: true }).click(); await settled();
    await action('save').click(); await settled(); assert.equal(await calls(), 2);
    assert.deepEqual(await page.evaluate(() => ({ id: window.calls[1].p.p_expected_id, version: window.calls[1].p.p_expected_version })), predecessor);
    assert.equal(await page.evaluate(() => window.context.current.previous_id), predecessor.id);
    for (const failure of ['VP_DISTRIBUTION_STALE', 'VP_DISTRIBUTION_SOURCE_CHANGED', 'VP_DISTRIBUTION_CHOICES_INVALID']) {
      await open(); await page.evaluate(code => { window.failure = code; }, failure); await action('save').click(); await settled();
      assert.equal(await action('save').isDisabled(), true); assert.equal(await calls(), 1);
      await action('retry').click(); await settled(); assert.equal(await calls(), 1);
      assert.equal(await action('save').isEnabled(), true);
    }
    await open(); await page.evaluate(() => { window.failReadAfterWrite = true; }); await action('save').click(); await settled();
    assert.equal(await action('save').isDisabled(), true); assert.equal(await calls(), 1);
    await action('retry').click(); await settled(); assert.equal(await calls(), 1);
    assert.equal(await action('review').count(), 1);
    await page.goto(url + '?mode=load-failed'); await page.locator('button[lang=en]').click();
    await page.getByRole('alert').waitFor(); await page.getByRole('button', { name: text('retry'), exact: true }).click();
    await page.getByRole('button', { name: text('open'), exact: true }).waitFor(); assert.equal(await calls(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log(JSON.stringify({ pass: true, widths: [390, 768, 1024, 1440], locales: ['th', 'en'], externalRequests: external.length, artifacts: out }));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); console.error('Artifacts:', out); process.exitCode = 1; });
