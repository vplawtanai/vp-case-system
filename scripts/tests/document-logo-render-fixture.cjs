/* eslint-disable @typescript-eslint/no-require-imports */
const {fixture} = require('./receipt-render-fixture.cjs');
const logoEvidence={bucket:'vp-document-assets',path:'company/logo/synthetic-version-a.png',object_id:'20000000-0000-4000-8000-000000000009',storage_version:'fixture-a'};
// In-memory synthetic image only. Never stored in document snapshots or Production.
const syntheticLogoUrl='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><rect width="240" height="180" rx="4" fill="#14532d"/><text x="120" y="120" text-anchor="middle" font-family="Arial" font-size="104" fill="white">VP</text></svg>');
function logoFixture(status='draft',count=1){
  const r=fixture(status,count);
  for(const s of [r.draft_snapshot_json,r.issued_snapshot_json].filter(Boolean)){s.schema_version=2;s.seller.logo_asset={...logoEvidence};}
  return r;
}
module.exports={logoFixture,logoEvidence,syntheticLogoUrl};
