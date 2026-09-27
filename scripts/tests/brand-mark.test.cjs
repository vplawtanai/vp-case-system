/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');

const brand = workspaceFixture('app/components/BrandMark.tsx');
const BrandMark = brand.component();
const login = workspaceFixture('app/login/page.tsx', [], {
  '../components/BrandMark': { default: BrandMark },
});
const shell = workspaceFixture('app/components/AppTopNav.tsx', [], {
  './BrandMark': { default: BrandMark },
  '../finance/FinanceSidebar': { FinanceSidebar: () => null },
});

test('static brand asset is the byte-identical official Storage PNG, not a recreated mark', () => {
  const bytes = fs.readFileSync('public/branding/vp-partners-logo.png');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '07eaefe33858041a51dd60a524d231251d64bfc76fc6b2099d74557ea8d95ab9');
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(bytes.readUInt32BE(16), 2000);
  assert.equal(bytes.readUInt32BE(20), 2000);
});

test('Login renders the accessible official mark with unchanged product and sign-in controls', () => {
  const html = login.render('th');
  assert.match(html, /alt="VP Partners"/);
  assert.match(html, /width="52" height="52"/);
  assert.match(html, /branding%2Fvp-partners-logo\.png/);
  assert.match(html, /VP Case System/);
  assert.match(html, /เข้าสู่ระบบจัดการแฟ้มคดี/);
  assert.match(html, /type="email"/);
  assert.match(html, /type="password"/);
  assert.doesNotMatch(html, />VP<|storage\/v1|token=/);
});

for (const locale of ['th', 'en']) {
  for (const mode of ['expanded', 'collapsed', 'drawer']) {
    test(`${locale}: ${mode} shell preserves product name and uses the same fitted official mark`, () => {
      const html = shell.render(locale, {
        'AppTopNav.profile': { role: 'admin', active: true },
        'AppTopNav.sidebarExpanded': mode === 'expanded',
        'AppTopNav.isMobile': mode === 'drawer',
        'AppTopNav.drawerOpen': mode === 'drawer',
      }, { title: 'Test shell', activePage: 'users' });
      assert.equal((html.match(/alt="VP Partners"/g) || []).length, 1);
      assert.match(html, /width="38" height="38"/);
      assert.match(html, /object-fit:contain/);
      assert.match(html, /flex-shrink:0/);
      assert.match(html, /VP Case System/);
      assert.match(html, /Office OS/);
      assert.match(html, /href="\/admin\/users"/);
      assert.match(html, /href="\/account\/security"/);
      assert.doesNotMatch(html, />VP<|storage\/v1|token=/);
      if (mode === 'drawer') assert.match(html, /role="dialog" aria-modal="true"/);
      else assert.match(html, new RegExp(`data-expanded="${mode === 'expanded'}"`));
    });
  }
}
