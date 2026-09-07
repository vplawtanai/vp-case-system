/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
const {test}=require('node:test');
const postcss=require('postcss');
const {read,theme,renderers}=require('./document-theme-fixture.cjs');
const sheet=postcss.parse(read('app/components/DocumentTheme.module.css'));
function tokens(type) {
  const values={};sheet.walkRules('.'+type,rule=>rule.walkDecls(d=>{values[d.prop]=d.value;}));return values;
}
function luminance(hex) {
  const rgb=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);
  return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
}
function contrast(a,b) {const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (values[0]+0.05)/(values[1]+0.05);}
for(const [type,accent] of Object.entries({quotation:'#1d4ed8',invoice:'#b45309',receipt:'#15803d'})) {
  test(`${type} has an explicit scoped theme with accessible color/grayscale contrast`,()=>{
    const values=tokens(type);assert.equal(values['--document-accent'],accent);
    for(const key of ['--document-accent','--document-accent-strong']) {
      assert.ok(contrast(values[key],'#ffffff')>=4.5);
      assert.ok(contrast(values[key],values['--document-accent-soft'])>=4.5);
    }
    for(const status of ['draft',...(type==='quotation'?['sent','cancelled']:['issued','voided'])]) {
      const markup=renderers[type](status);assert.ok(markup.includes(theme[type]));assert.match(markup,/<h1/);
      assert.doesNotMatch(markup,/filter:|mix-blend-mode:/);
    }
  });
}
test('only the three approved document themes are active, with no print-specific palette',()=>{
  const selectors=[];sheet.walkRules(rule=>selectors.push(rule.selector));
  assert.deepEqual(selectors,['.quotation','.invoice','.receipt']);
  sheet.walkAtRules(()=>assert.fail('Themes must be identical for screen and print'));
  const identity=read('app/components/DocumentIdentity.module.css');
  assert.match(identity,/var\(--document-accent, #15803d\)/);
});
test('lifecycle warnings stay independent of the document palette',()=>{
  const invoice=postcss.parse(read('app/finance/invoices/invoice-document.module.css'));
  for(const selector of ['.draftBanner','.voidBanner'])invoice.walkRules(selector,rule=>assert.doesNotMatch(rule.toString(),/--document-/));
  const receipt=postcss.parse(read('app/finance/receipts/receipt-document.module.css'));
  receipt.walkRules('.status',rule=>{
    assert.doesNotMatch(rule.toString(),/--document-/);
    if(rule.parent.type==='root')assert.match(rule.toString(),/#991b1b/);
  });
  const quotation=read('app/finance/quotations/[id]/preview/page.tsx');
  const status=quotation.slice(quotation.indexOf('function getPreviewStatusStyle'),quotation.indexOf('function getDocumentStatusLabel'));
  assert.doesNotMatch(status,/--document-/);assert.match(status,/#166534/);assert.match(status,/#991b1b/);
  assert.match(renderers.invoice('voided'),/VOID/);assert.match(renderers.receipt('draft'),/DRAFT/);
});
test('Receipt logo, address and settlement facts remain intact in Draft/Issued/Print renderer',()=>{
  for(const status of ['draft','issued']) {
    const markup=renderers.receipt(status);
    for(const text of ['<img','กรุงเทพมหานคร 10000','5,000.00 THB','140.19 THB','4,859.81 THB','VP-IV-FIXTURE-1'])assert.ok(markup.includes(text),text);
    assert.doesNotMatch(markup,/Tax Invoice|e-Receipt/);
  }
});
test('Invoice installment, address, payment destination and amounts remain intact',()=>{
  for(const status of ['draft','issued']) {
    const markup=renderers.invoice(status);
    for(const text of ['งวดที่ 2 จาก 3 งวด','กรุงเทพมหานคร 10000','KBANK','000-0-00000-0','4,672.90 THB','327.10 THB','5,000.00 THB'])assert.ok(markup.includes(text),text);
  }
});
