/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
require('./receipt-render-fixture.cjs');
const React = require('react'), { renderToStaticMarkup: render } = require('react-dom/server');
const ui = require('../../app/components/ui/patterns.tsx');
const element = React.createElement;

test('Status semantics stay caller-owned, distinct and neutral for unknown states', () => {
  for (const status of ['draft','confirmed','reviewed','finalized','issued','cancelled','voided','reversed','unclassified','pending']) {
    const label = `Domain label: ${status}`;
    const html = render(element(ui.StatusBadge, { status, label }));
    assert.ok(html.includes(`data-status="${status}"`)); assert.ok(html.includes(label));
    assert.doesNotMatch(html, /button|role="button"/);
  }
  assert.equal(ui.statusTone('completed'), 'neutral');
  assert.equal(ui.statusTone('reviewed'), 'info');
  assert.equal(ui.statusTone('finalized'), 'success');
  assert.equal(ui.statusTone('pending'), 'warning');
});
for (const locale of ['th', 'en']) test(`${locale}: readonly financial facts preserve separate supplied amounts and missing values`, () => {
  const items = [{ key:'cash',label:locale==='th'?'เงินรับจริง':'Actual money received',amount:4859.81 },{key:'wht',label:'WHT',amount:140.19},{key:'vat',label:'VAT',amount:327.10},{key:'gross',label:'Gross',amount:5000},{key:'pool',label:'Distributable',amount:null}];
  const before=JSON.stringify(items), html=render(element(ui.MoneySummary,{items,locale,currency:'THB'}));
  for(const amount of ['4,859.81 THB','140.19 THB','327.10 THB','5,000.00 THB']) assert.ok(html.includes(amount));
  assert.match(html, /<dd>-<\/dd>/); assert.equal((html.match(/<dt>/g)||[]).length,5);
  assert.doesNotMatch(html, /input|select|disabled|readonly=/); assert.equal(JSON.stringify(items),before);
});
test('FieldGroup keeps input control, label/error/help relationships and existing descriptions', () => {
  const html=render(element(ui.FieldGroup,{id:'test',label:'Actual amount',error:'Required',help:'Bank evidence'},element('input',{'aria-invalid':true,'aria-describedby':'original test-error',defaultValue:'100'})));
  assert.match(html,/for="test"/);assert.match(html,/id="test"/);
  assert.match(html,/aria-describedby="original test-error test-help"/);
  assert.match(html,/aria-invalid="true"/);assert.match(html,/value="100"/);
  for(const id of ['test-help','test-error'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);
});
test('Technical disclosure defaults closed and preserves raw evidence without interpretation', () => {
  const raw='System-derived evidence: {"source":"synthetic-uuid","cash":4859.81}';
  const html=render(element(ui.Disclosure,{title:'Technical evidence'},element('pre',null,raw)));
  assert.match(html,/<details class=/); assert.doesNotMatch(html,/<details[^>]*\bopen/);
  assert.match(html,/synthetic-uuid/); assert.match(html,/&quot;cash&quot;:4859.81/);
});
test('Opt-in tokens and modal sizes do not introduce global/document selectors or business dependencies', () => {
  const source=fs.readFileSync('app/components/ui/patterns.tsx','utf8'), css=fs.readFileSync('app/components/ui/vp-ui.module.css','utf8');
  assert.doesNotMatch(source,/supabase|\.rpc\(|fetch\(|toFixed\(/);
  assert.doesNotMatch(css,/:root|:global|\.document\b|position:\s*(fixed|sticky)|letter-spacing:\s*-/);
  const modal=fs.readFileSync('app/components/DetailModal.tsx','utf8');
  assert.match(modal,/size = "detail"/);assert.match(modal,/"summary",/);assert.match(modal,/modalStack\.at\(-1\)/);
  assert.match(modal,/previousFocusRef\.current\.focus/);
  for(const file of ['app/finance/invoices/invoice-document.tsx','app/finance/receipts/receipt-document.tsx','app/components/DocumentIdentity.tsx','app/components/LegalDocumentLayout.tsx'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/ui\/patterns|vp-ui\.module/);
});
test('Semantic palette meets WCAG AA text contrast without relying on color alone',()=>{
  const css=fs.readFileSync('app/components/ui/vp-ui.module.css','utf8'), colors=Object.fromEntries([...css.matchAll(/--vp-([\w-]+):\s*(#[0-9a-f]{6})/g)].map(m=>[m[1],m[2]]));
  const luminance=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  for(const [fg,bg] of [['text','surface'],['muted','surface'],['success','success-bg'],['warning','warning-bg'],['danger','danger-bg'],['info','info-bg'],['referral','referral-bg'],['company','company-bg'],['work','work-bg'],['surface','primary']]){
    const a=luminance(colors[fg]),b=luminance(colors[bg]); assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${fg}/${bg}`);
  }
});
