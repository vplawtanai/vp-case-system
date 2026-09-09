/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const {fixture,render,shared,root} = require('./receipt-render-fixture.cjs');
const {documentLogoEvidence,loadReviewedDocumentLogo,newCompanyLogoPath} = require('../../lib/documentLogo.ts');
const {logoFixture,logoEvidence,syntheticLogoUrl} = require('./document-logo-render-fixture.cjs');
for(const status of ['draft','issued','voided']) test(`${status} schema-2 Receipt uses frozen logo with unchanged financial and address content`,()=>{
  const r=logoFixture(status);const before=JSON.stringify(r);const view=shared.receiptPresentation(r);
  assert.equal(view.ok,true);assert.deepEqual(view.value.logo,logoEvidence);
  const output=render(r,syntheticLogoUrl);
  assert.match(output,/<img/);assert.match(output,/4,859.81 THB/);assert.match(output,/140.19 THB/);
  assert.match(output,/กรุงเทพมหานคร 10000/);assert.equal(JSON.stringify(r),before);
  if(status==='voided')assert.match(output,/VOID/);
});
test('issued and VOID ignore changed Draft/current logo and retain the same evidence',()=>{
  for(const status of ['issued','voided']) {
    const r=logoFixture(status);r.draft_snapshot_json.seller.logo_asset.path='company/logo/current.png';
    assert.equal(shared.receiptPresentation(r).value.logo.path,logoEvidence.path);
  }
});
test('new schema without complete logo or failed image load fails closed',()=>{
  for(const status of ['draft','issued','voided']){
    const r=logoFixture(status);
    assert.doesNotMatch(render(r),/<article|ใบเสร็จรับเงิน<\/h1>/);
    const snapshot=status==='draft'?r.draft_snapshot_json:r.issued_snapshot_json;
    for(const key of ['bucket','path','object_id','storage_version']) {
      const copy=structuredClone(r);delete (status==='draft'?copy.draft_snapshot_json:copy.issued_snapshot_json).seller.logo_asset[key];
      assert.equal(shared.receiptPresentation(copy).ok,false,key);
    }
    delete snapshot.seller.logo_asset;
    assert.equal(shared.receiptPresentation(r).ok,false);
  }
});
test('legacy schema-1 does not invent a logo, even if a current URL is supplied',()=>{
  for(const status of ['draft','issued','voided']){
    const r=fixture(status);assert.equal(shared.receiptPresentation(r).value.logo,null);
    assert.doesNotMatch(render(r,syntheticLogoUrl),/<img/);
  }
});
test('logo evidence rejects wrong bucket, unsafe path, URL and missing object identity',()=>{
  for(const change of [{bucket:'other'},{path:'https://example.invalid/logo.png'},{path:'company/logo/../x'},{object_id:''}])
    assert.throws(()=>documentLogoEvidence({...logoEvidence,...change}));
});
test('new upload version is unique, never overwrites and never cleans up previous logos',()=>{
  const first=newCompanyLogoPath('VP logo.png'), second=newCompanyLogoPath('VP logo.png');
  assert.notEqual(first,second);assert.match(first,/^company\/logo\/[a-f0-9-]{36}-vp-logo\.png$/);
  const settings=fs.readFileSync(`${root}/app/settings/document-settings/page.tsx`,'utf8');
  const upload=settings.slice(settings.indexOf('const path = newCompanyLogoPath'),settings.indexOf('const saveSigner ='));
  assert.match(upload,/upsert: false/);assert.doesNotMatch(upload,/safeRemoveAsset|\.remove\(/);
});
test('asset loader downloads only the snapshot path, decodes before review, and cleans failed URLs',async()=>{
  const originalImage=global.Image, originalCreate=URL.createObjectURL, originalRevoke=URL.revokeObjectURL;
  const calls=[],revoked=[];
  URL.createObjectURL=()=> 'blob:synthetic';URL.revokeObjectURL=url=>revoked.push(url);
  global.Image=class {async decode(){calls.push('decoded');}};
  const client={storage:{from(bucket){calls.push(bucket);return {async download(path){calls.push(path);return {data:new Blob(['synthetic']),error:null};}};}}};
  try{
    assert.equal(await loadReviewedDocumentLogo(client,logoEvidence),'blob:synthetic');
    assert.deepEqual(calls,['vp-document-assets',logoEvidence.path,'decoded']);
    global.Image=class {async decode(){throw new Error('invalid image');}};
    await assert.rejects(()=>loadReviewedDocumentLogo(client,logoEvidence));assert.deepEqual(revoked,['blob:synthetic']);
  }finally{global.Image=originalImage;URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;}
});
test('Draft review requires a loaded schema-2 logo and Print waits for image decode',()=>{
  const detail=fs.readFileSync(`${root}/app/finance/receipts/[id]/page.tsx`,'utf8');
  assert.match(detail,/Boolean\(document\?\.logo\) && logoReady && reviewed === fingerprint/);
  assert.match(detail,/t\("finance\.receipt\.refresh"\)/);
  assert.equal(require(root+'/lib/i18n/catalog.ts').translate('th','finance.receipt.refresh'),'รีเฟรชร่างจากรายการรับชำระ');
  const preview=fs.readFileSync(`${root}/app/finance/receipts/[id]/preview/page.tsx`,'utf8');
  assert.ok(preview.indexOf('image.decode()')<preview.indexOf('window.print()'));
});
