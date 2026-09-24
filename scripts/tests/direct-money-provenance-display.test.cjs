/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
require('./receipt-render-fixture.cjs');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {translate}=require('../../lib/i18n/catalog.ts');
const {prepareDirectSourceEvidence,readDerivedDirectEvidence}=require('../../app/finance/direct-money/source-evidence.ts');
const {newDirectInput,directLineAmounts}=require('../../app/finance/direct-money/shared.ts');
const display=workspaceFixture('app/finance/direct-money/source-evidence-display.tsx',['DirectSourceEvidence']);
const empty=()=>null;
const detail=workspaceFixture('app/finance/direct-money/[id]/page.tsx',['DirectMoneyDetail'],{
 '../../quotations/shared':{QuotationGuard:empty},'../../FinanceSubNav':{default:empty},
 '../../payments/vp-distribution-panel':{VpDistributionPanel:empty},'../form':{DirectAmounts:empty,DirectMoneyForm:empty},
 '../classification':{DirectMoneyClassification:empty},
 '../../document-decision/next-action':{FinanceDocumentNextAction:empty},
});
function sample(){const p=newDirectInput();return prepareDirectSourceEvidence({...p,client_id:'10000000-0000-4000-8000-000000000001',payer_name:'Actual recorded payer',case_id:47,
 lines:[{...p.lines[0],description:'ค่าบังคับคดี',money_nature:'business_revenue',classification:'professional_fee',base:10000,vat_applicable:true,vat_rate:7,wht_applicability:'applies',wht_base:10000,wht_rate:3}]}).input;}
const render=(locale,reason,client)=>display.render(locale,{}, {reason,client},'DirectSourceEvidence');
for(const locale of ['th','en'])test(`${locale}: stored system evidence becomes readable facts, raw bytes only in closed technical disclosure`,()=>{
 const p=sample(),reason=p.lines[0].reason,client={id:p.client_id,name:'Stored Client name'},before=structuredClone({p,client});
 const html=render(locale,reason,client),technical=html.match(/<details[^>]*>[\s\S]*?<\/details>/)[0],normal=html.replace(technical,'');
 assert.doesNotMatch(technical,/<details[^>]*\sopen[\s=>]/);assert.ok(technical.includes(translate(locale,'directMoney.technicalEvidence')));
 assert.ok(technical.includes(renderToStaticMarkup(React.createElement(React.Fragment,null,reason))));
 for(const s of [translate(locale,'directMoney.systemSource'),'Stored Client name',translate(locale,'finance.invoice.classification.professional_fee'),'7%','3%',translate(locale,'directMoney.evidenceCase')])assert.ok(normal.includes(s),s);
 assert.doesNotMatch(normal,/System-derived direct-money provenance|structured_direct_money_input|10000000-0000/);
 assert.match(normal,/href="\/cases\/47"/);assert.doesNotMatch(normal,/<input|<textarea|<button/);
 assert.deepEqual({p,client},before);assert.equal(readDerivedDirectEvidence(reason).client_id,p.client_id);
});
for(const locale of ['th','en'])test(`${locale}: human text remains human, visible, escaped and unmodified`,()=>{
 const reason='Human source explanation\nReviewed <script>not executable</script> & retained.';
 const html=render(locale,reason);assert.ok(html.includes(translate(locale,'directMoney.humanSource')));
 assert.ok(html.includes(renderToStaticMarkup(React.createElement(React.Fragment,null,reason))));
 assert.doesNotMatch(html,/<details|System-derived|<script>/);
});
test('optional matter and rates come only from saved evidence; absent facts are never fabricated',()=>{
 const p=sample();p.case_id=null;let reason=prepareDirectSourceEvidence(p).input.lines[0].reason;
 assert.ok(!render('en',reason).includes('Related matter'));assert.ok(render('en',reason).includes('Client linked; name unavailable'));
 p.advisory_matter_id='10000000-0000-4000-8000-000000000047';reason=prepareDirectSourceEvidence(p).input.lines[0].reason;
 const html=render('en',reason);assert.match(html,/href="\/advisory\/10000000-0000-4000-8000-000000000047"/);
 assert.ok(html.includes('Linked advisory matter'));assert.ok(!html.includes('Linked case'));
 assert.ok(!render('en',reason,{id:'wrong-client',name:'Unrelated Client'}).includes('Unrelated Client'));
 const data=readDerivedDirectEvidence(reason);delete data.wht_rate;delete data.vat_rate;data.classification='unknown';
 const incomplete='System-derived direct-money provenance v1: '+JSON.stringify(data);
 const visible=render('en',incomplete).split('<details')[0];assert.doesNotMatch(visible,/7%|3%|Professional Fee/);assert.ok(visible.includes('Not recorded in this evidence'));
});
for(const locale of ['th','en'])for(const status of ['draft','confirmed','reversed'])test(`${locale}/${status}: detail uses Draft Client or frozen Client without a confirmed live fallback`,()=>{
 const p=sample(),reason=p.lines[0].reason;
 const row={...p,id:'synthetic-direct',status,version:2,received_on:'2026-07-01',input_json:p,lines_json:p.lines.map(l=>({...l,...directLineAmounts(l)})),classification_json:null,
  confirmed_snapshot_json:status==='draft'?null:{client:{id:p.client_id,name:'Frozen Client name'}},cash_amount:10400,wht_amount:300,vat_amount:700,amount_before_vat:10000,gross_amount:10700};
 const state={'DirectMoneyDetail.row':row,'DirectMoneyDetail.loading':false,'DirectMoneyDetail.draftClient':{id:p.client_id,name:'Current Draft Client'}};
 const html=detail.render(locale,state,{id:row.id,canManage:false},'DirectMoneyDetail');
 assert.ok(html.includes(status==='draft'?'Current Draft Client':'Frozen Client name'));assert.doesNotMatch(html,/<input|<textarea/);
 if(status!=='draft'){row.confirmed_snapshot_json.client=null;const missing=detail.render(locale,state,{id:row.id,canManage:false},'DirectMoneyDetail');assert.ok(!missing.includes('Current Draft Client'));assert.ok(missing.includes(translate(locale,'directMoney.evidenceClientUnavailable')));}
 assert.equal(row.lines_json[0].reason,reason);
});
test('display path has no save, lifecycle or direct-write access; stored evidence builder is not used to render',()=>{
 const component=fs.readFileSync('app/finance/direct-money/source-evidence-display.tsx','utf8');
 assert.doesNotMatch(component,/supabase|\.rpc\(|prepareDirectSourceEvidence|\.insert\(|\.update\(|\.delete\(/);
 const page=fs.readFileSync('app/finance/direct-money/[id]/page.tsx','utf8');
 assert.match(page,/r.data.status === "draft" && r.data.client_id/);
 assert.match(page,/row.status === "draft" \? draftClient : row.confirmed_snapshot_json\?\.client/);
});
