/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { html, snapshot, invoiceId } = require('./vat-eligibility-fixture.cjs');
const { invoiceVatLines, vatSummaryUnavailable } = require('../../app/finance/tax-invoices/vat-treatment.ts');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
async function main() {
  const directory = '/private/tmp/vp-vat-summary-qa'; fs.mkdirSync(directory, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage(); await page.route('**/*', route => route.abort());
    const scenarios = { standard: {}, mixed: { lines: invoiceVatLines(snapshot([{}, {
      description: 'ค่าเดินทางและค่าใช้จ่ายจากรายการต้นทาง', vat_applicable: false, vat_rate: 0, amount_before_vat: 2000, vat_amount: 0, line_total: 2000,
    }]), invoiceId) }, unavailable: { lines: null, error: vatSummaryUnavailable } };
    for (const [name, props] of Object.entries(scenarios)) {
      for (const width of [1280, 900, 768, 760, 375, 320]) {
        await page.setViewportSize({ width, height: 1000 }); await page.setContent(html(props));
        const geometry = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          clipped: [...document.querySelectorAll('tbody th,td,button,p')].filter(e => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1).map(e => e.tagName + ':' + e.textContent),
          labels: [...document.querySelectorAll('tbody td')].every(e => e.getAttribute('data-label')),
        }));
        assert.equal(geometry.overflow, false, JSON.stringify({ name, width, geometry }));
        assert.deepEqual(geometry.clipped, []); assert.equal(geometry.labels, true);
        if ([1280, 375].includes(width)) await page.screenshot({ path: `${directory}/${name}-${width}.png`, fullPage: true });
        console.log(`PASS VAT eligibility ${name} ${width}px`);
      }
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
