/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
require('./receipt-render-fixture.cjs');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {translate}=require('../../lib/i18n/catalog.ts');
const {newDirectInput,validateDirectInput,directTotals,moneyNatures}=require('../../app/finance/direct-money/shared.ts');
const {prepareDirectSourceEvidence,isDerivedDirectEvidence}=require('../../app/finance/direct-money/source-evidence.ts');
const form=workspaceFixture('app/finance/direct-money/form.tsx',['DirectMoneyForm']);
function normal(){const p=newDirectInput();return {...p,client_id:'10000000-0000-4000-8000-000000000001',payer_name:'Synthetic payer',received_on:'2026-01-01',receiving_bank_account_id:'10000000-0000-4000-8000-000000000002',cash_amount:10400,
 lines:[{...p.lines[0],description:'ค่าบังคับคดี',money_nature:'business_revenue',classification:'professional_fee',base:10000,vat_applicable:true,vat_rate:7,wht_applicability:'applies',wht_base:10000,wht_rate:3}]};}
test('normal professional-fee path derives labelled provenance without human reason or data/calculation changes',()=>{
 const p=normal(),before=structuredClone(p),result=prepareDirectSourceEvidence(p);
 assert.equal(result.evidence[0].requirement,null);assert.equal(result.evidence[0].manualReason,'');assert.equal(result.evidence[0].derived,true);
 assert.deepEqual(validateDirectInput(result.input,'2026-09-15'),{});
 assert.deepEqual({...result.input,lines:result.input.lines.map(l=>({...l,reason:''}))},before);assert.deepEqual(p,before);
 assert.deepEqual(directTotals(result.input.lines),{base:10000,vat:700,gross:10700,wht:300,cash:10400});
 assert.deepEqual(prepareDirectSourceEvidence(result.input).input,result.input,'reload/no-op is deterministic');
 const evidence=JSON.parse(result.input.lines[0].reason.split(': ').slice(1).join(': '));
 assert.equal(evidence.origin,'structured_direct_money_input');assert.equal(evidence.source_line_id,p.lines[0].source_line_id);
 assert.equal(evidence.client_id,p.client_id);assert.equal(evidence.description_source,'same_line.description');assert.equal(evidence.payer_source,'facts.payer_name');
 assert.equal(evidence.classification,'professional_fee');assert.equal(evidence.vat_rate,7);assert.equal(evidence.wht_rate,3);assert.equal(evidence.wht_base,10000);
 assert.equal(evidence.case_id,null);assert.equal(evidence.advisory_matter_id,null);
 p.case_id=47;assert.match(prepareDirectSourceEvidence(p).input.lines[0].reason,/"case_id":47/);
 p.lines[0].description='"\\\n'.repeat(300);p.lines[0].description+='work';p.payer_name='X'.repeat(500);
 assert.ok(prepareDirectSourceEvidence(p).input.lines[0].reason.length<2000,'references avoid truncating or duplicating long frozen facts');
});
test('missing linkage/description, unknown/exceptional classification and non-revenue require actual human evidence',()=>{
 const examples=[['evidenceContext',p=>p.client_id=null],['evidenceContext',p=>p.lines[0].description='  '],['evidenceContext',p=>p.lines[0].description='???'],
  ...['',null,'other','reimbursable_expense','government_or_court_fee'].map(c=>['evidenceClassification',p=>p.lines[0].classification=c]),
  ...moneyNatures.filter(n=>n!=='business_revenue').map(n=>[n==='unclassified'?'evidenceClassification':'evidenceNonRevenue',p=>p.lines[0].money_nature=n])];
 for(const [required,change] of examples){const p=normal();change(p);const r=prepareDirectSourceEvidence(p);assert.equal(r.evidence[0].requirement,required);assert.equal(r.input.lines[0].reason,'');assert.equal(r.evidence[0].derived,false);assert.equal(validateDirectInput(r.input,'2026-09-15')['line.0.reason'],'required');
  p.lines[0].reason='Explicit human source evidence';assert.equal(prepareDirectSourceEvidence(p).input.lines[0].reason,p.lines[0].reason);}
});
test('exceptional VAT, WHT, manual before-VAT and custom WHT bases retain manual requirements',()=>{
 for(const change of [l=>l.vat_rate=10,l=>l.wht_rate=1.25,l=>l.wht_applicability='unknown',l=>l.wht_base=5000,l=>{l.vat_applicable=false;l.vat_rate=0;l.vat_treatment_json={schema_version:1,treatment:'outside_scope',reason:'VAT-specific evidence'};}]){
  const p=normal();change(p.lines[0]);assert.equal(prepareDirectSourceEvidence(p).evidence[0].requirement,'evidenceTax');}
 const p=normal(),key=p.lines[0].source_line_id;
 assert.equal(prepareDirectSourceEvidence(p,{[key]:true}).evidence[0].requirement,'evidenceTax');
 assert.equal(prepareDirectSourceEvidence(p,{}, {[key]:true}).evidence[0].requirement,'evidenceTax');
 for(const rate of [1,2,3,5]){p.lines[0].wht_rate=rate;assert.equal(prepareDirectSourceEvidence(p).evidence[0].requirement,null);}
 p.lines[0].wht_applicability='does_not_apply';p.lines[0].wht_rate=null;p.lines[0].wht_base=null;assert.equal(prepareDirectSourceEvidence(p).evidence[0].requirement,null);
});
test('derived evidence never becomes a human statement when a reopened Draft changes context',()=>{
 const p=prepareDirectSourceEvidence(normal()).input,original=p.lines[0].reason;
 p.client_id=null;assert.equal(prepareDirectSourceEvidence(p).input.lines[0].reason,'');
 p.client_id='another-client';assert.notEqual(prepareDirectSourceEvidence(p).input.lines[0].reason,original);
 p.lines[0].money_nature='client_money';assert.equal(prepareDirectSourceEvidence(p).input.lines[0].reason,'');
 p.lines[0].reason='  Original human explanation  ';assert.equal(prepareDirectSourceEvidence(p).input.lines[0].reason,'  Original human explanation  ');
 assert.equal(isDerivedDirectEvidence('System-derived direct-money provenance v1: not JSON'),false);
 const originalHuman=normal();originalHuman.lines[0].reason='Existing normal-path human evidence';assert.deepEqual(prepareDirectSourceEvidence(originalHuman).input,originalHuman);
});
for(const locale of ['th','en'])test(`${locale}: progressive evidence, no normal-path free text, no empty-form burden`,()=>{
 const render=p=>form.render(locale,{'DirectMoneyForm.form':p,'DirectMoneyForm.loading':false},{},'DirectMoneyForm');
 const p=normal(),html=render(p);assert.ok(html.includes(translate(locale,'directMoney.derivedSource')));assert.ok(!html.includes(translate(locale,'directMoney.additionalSource')));
 assert.ok(!render(newDirectInput()).includes(translate(locale,'directMoney.additionalSource')));
 p.client_id=null;const missing=render(p);assert.ok(missing.includes(translate(locale,'directMoney.additionalSource')));assert.ok(missing.includes(translate(locale,'directMoney.evidenceContext')));
 p.lines[0].money_nature='client_money';assert.ok(render(p).includes(translate(locale,'directMoney.evidenceNonRevenue')));
 assert.doesNotMatch(html,/Business source of money \(required\)|ที่มาทางธุรกิจของเงิน \(จำเป็น\)/);
});
