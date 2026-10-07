/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');
const { root } = require('./receipt-render-fixture.cjs');
const { contract } = require('./fixtures/non-litigation-076-applied-contract.json');

// Exercise the real shared desktop/mobile menu against the accepted read roles.
// All network, auth and mutation calls are disabled by the SSR fixture.
const nav = workspaceFixture('app/components/AppTopNav.tsx', [], {
  'next/navigation': { usePathname: () => '/advisory', useRouter: () => ({}) },
  '../finance/FinanceSidebar': { FinanceSidebar: () => null },
  './BrandMark': { default: () => null },
});
const allowed = ['admin', 'partner', 'lawyer', 'assistant_lawyer', 'staff'];
const readContract = contract.functions['advisory076_allowed(text)'].definition;

test('accepted direct-route read contract allows the existing internal roles only', () => {
  const roles = [...readContract.match(/p_action in \('read','task','time'\) then p.role in \(([^)]+)\)/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.deepEqual(roles, allowed);
  assert.match(readContract, /p\.id=auth\.uid\(\) and p\.active and not p\.must_change_password/);
  assert.match(contract.functions['advisory_control_read(uuid,jsonb)'].definition, /advisory076_allowed\('read'\)/);
  assert.match(fs.readFileSync(root + '/app/advisory/control/shared.tsx', 'utf8'), /supabase\.rpc\('advisory_control_read'/);
});

for (const locale of ['th', 'en']) for (const mobile of [false, true]) {
  test(`${locale} ${mobile ? 'mobile drawer' : 'desktop'}: menu/read-role parity and active navigation`, () => {
    for (const role of [...allowed, 'viewer', 'unknown', '']) {
      for (const [active, must_change_password] of [[true, false], [false, false], [true, true], [null, false], [true, null]]) {
        const html = nav.render(locale, {
          'AppTopNav.profile': { role, active, must_change_password },
          'AppTopNav.isMobile': mobile,
          'AppTopNav.drawerOpen': mobile,
        }, { title: 'Non-Litigation', activePage: 'advisory' });
        const shown = allowed.includes(role) && active === true && must_change_password === false;
        const links = html.match(/<a\b[^>]*href="\/advisory"[^>]*>/g) || [];
        assert.equal(links.length, shown ? 1 : 0, JSON.stringify({ role, active, must_change_password }));
        if (shown) {
          assert.match(links[0], /aria-current="page"/);
          assert.ok(links[0].includes(`aria-label="${locale === 'th' ? 'งานนอกคดี' : 'Non-Litigation'}"`));
        }
      }
    }
  });
}
