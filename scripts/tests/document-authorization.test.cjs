/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const {test} = require('node:test');
const postcss = require('postcss');
const {read,renderers} = require('./document-theme-fixture.cjs');
const {fixture,render,shared} = require('./receipt-render-fixture.cjs');

function signingBlock(markup) {
  return markup.match(/<section[^>]*data-document-authorization="[^"]+"[^>]*>([\s\S]*?)<\/section>/)?.[1];
}

for(const type of ['invoice','receipt'])for(const status of ['draft','issued','voided']) {
  test(`${type} ${status}: formal document completeness and manual authorization`,()=>{
    const markup=renderers[type](status);
    const required=type==='invoice'
      ? ['ใบแจ้งหนี้','Invoice','วันที่ออกเอกสาร','5,000.00 THB','KBANK','งวดที่ 2 จาก 3 งวด']
      : ['ใบเสร็จรับเงิน','Receipt','วันที่รับชำระ','5,000.00 THB','140.19 THB','4,859.81 THB','VP-IV-FIXTURE-1'];
    for(const text of [...required,type==='invoice'?'ลูกค้าทดสอบ':'ลูกค้าตัวอย่างสำหรับทดสอบในเครื่อง','บริษัท ตัวอย่างทดสอบ จำกัด','กรุงเทพมหานคร 10000','<header','<h1','<img','<footer'])assert.ok(markup.includes(text),text);
    if(status==='draft')assert.match(markup,type==='invoice'?/ร่าง - ยังไม่มีเลขที่เอกสาร/:/ร่าง \/ DRAFT/);
    else assert.match(markup,type==='invoice'?/LOCAL-IV-TEST/:/VP-RC-202607-000001/);
    if(status==='voided')assert.match(markup,/VOID/);
    if(type==='receipt')assert.equal(markup.includes('วันที่ออกใบเสร็จรับเงิน'),status!=='draft');
    const block=signingBlock(markup);
    assert.ok(block);assert.match(block,/ลงชื่อ/);assert.match(block,/\(ชื่อผู้ลงนาม\)/);
    assert.ok(block.includes(type==='invoice'?'ผู้จัดทำ / ผู้มีอำนาจลงนาม':'ผู้รับเงิน / ผู้มีอำนาจลงนาม'));
    assert.doesNotMatch(block,/<img|<input|<button/);
    assert.equal((markup.match(/data-document-authorization=/g)||[]).length,1);
    assert.ok(markup.indexOf('data-document-authorization')>markup.lastIndexOf('</table>'));
    assert.ok(markup.indexOf('data-document-authorization')<markup.indexOf('<footer'));
  });
}

test('English Invoice retains its language without borrowing an issuer as signer',()=>{
  const block=signingBlock(renderers.invoice('issued',{languageCode:'en'}));
  assert.match(block,/Signed/);assert.match(block,/Signatory name/);assert.match(block,/Prepared by \/ Authorized signatory/);
  assert.doesNotMatch(block,/ลงชื่อ/);
});

for(const status of ['issued','voided'])test(`${status} Receipt dates use frozen received date and issue timestamp, never mutable Draft`,()=>{
  const row=fixture(status);
  row.receipt_date='2026-09-05';row.issued_at='2026-09-06T17:10:00Z';
  row.issued_snapshot_json.payment.received_on='2026-09-05';
  Object.assign(row.issued_snapshot_json.receipt,{receipt_date:'2026-09-05',issued_at:row.issued_at,issued_by_name:'NOT AN AUTHORIZED SIGNER'});
  row.draft_snapshot_json.payment.received_on='2040-01-01';
  row.updated_at='2040-01-01T00:00:00Z';
  const before=JSON.stringify(row),markup=render(row);
  assert.match(markup,/<dt>วันที่ออกใบเสร็จรับเงิน<\/dt><dd>7 กันยายน 2569<\/dd>/);
  assert.match(markup,/<dt>วันที่รับชำระ<\/dt><dd>5 กันยายน 2569<\/dd>/);
  assert.doesNotMatch(markup,/NOT AN AUTHORIZED SIGNER|2040|2583/);
  assert.equal(JSON.stringify(row),before);
});

test('Draft never fabricates an issue date; missing issued timestamp fails closed',()=>{
  const draft=fixture();draft.created_at='2026-09-07T00:00:00Z';draft.updated_at=draft.created_at;
  assert.doesNotMatch(render(draft),/วันที่ออกใบเสร็จรับเงิน/);
  const issued=fixture('issued');delete issued.issued_snapshot_json.receipt.issued_at;
  assert.equal(shared.receiptPresentation(issued).ok,false);
  assert.match(render(issued),/role="alert"/);
  assert.doesNotMatch(render(issued),/data-document-authorization/);
});

test('issue date is explicitly Bangkok-local across UTC day boundaries',()=>{
  assert.equal(shared.receiptIssueDate('2026-09-06T16:59:59Z'),'6 กันยายน 2569');
  assert.equal(shared.receiptIssueDate('2026-09-06T17:00:00Z'),'7 กันยายน 2569');
  assert.equal(shared.receiptIssueDate('2026-09-07T00:00:00+07:00'),'7 กันยายน 2569');
});

test('Quotation keeps its existing signer fields, optional image and blank-signature fallback',()=>{
  for(const status of ['draft','sent'])for(const signature of [false,true]){
    const markup=renderers.quotation(status,{signature});
    for(const text of ['ใบเสนอราคา','Quotation','LOCAL-QT-TEST','ลูกค้าทดสอบ','5,000.00','ชื่อ: ผู้ทดสอบ','ตำแหน่ง: กรรมการ','วันที่:'])assert.ok(markup.includes(text),text);
    assert.equal(markup.includes('alt="Authorized signer signature"'),signature);
    assert.ok(markup.includes('quotation-signature-blank'));
    assert.doesNotMatch(markup,/data-document-authorization/);
  }
});

test('manual block has physical space, responsive bounds, neutral ink and print break protection',()=>{
  const css=postcss.parse(read('app/components/DocumentAuthorization.module.css'));
  const declarations=selector=>{
    const result={};css.walkRules(selector,rule=>rule.walkDecls(d=>result[d.prop]=d.value));return result;
  };
  const block=declarations('.authorization');
  assert.equal(block['max-width'],'100%');assert.equal(block['break-inside'],'avoid');assert.equal(block['break-after'],'avoid');
  assert.equal(block.color,'#374151');assert.equal(declarations('.handwritingSpace').height,'18mm');
  assert.match(declarations('.line')['border-bottom'],/1px solid/);
  const source=read('app/components/DocumentAuthorization.tsx');
  assert.doesNotMatch(source,/supabase|fetch\(|signatureUrl|issuedBy|issued_by|<img/);
});
