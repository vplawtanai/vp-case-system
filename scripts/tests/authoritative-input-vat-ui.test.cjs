/* eslint-disable @typescript-eslint/no-require-imports */
require('./receipt-render-fixture.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {snapshotFixture,monthlyFixture}=require('./tax-filing-fixture.cjs'),{adapter}=require('./tax-dashboard-fixture.cjs'),{workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {readMonthlyTaxSources}=require('../../app/finance/tax-position/dashboard-data.ts'),{buildPermissions}=require('../../lib/permissions.ts');
const {taxMonthSummary,externalVatStatus}=require('../../app/finance/tax-position/period-data.ts');
const React=require('react'),modals={'../../components/DetailModal':{default:({children})=>React.createElement('div',{role:'dialog'},children)}};
const permissions=buildPermissions({role:'admin'}),home=workspaceFixture('app/finance/tax-position/tax-home.tsx',[],modals);
async function data(){const filing=snapshotFixture(true),p=filing.pools[0];Object.assign(p,{ready:true,issues:[],tax_amount:0});Object.assign(p.monthly_facts,{input_contract:'authoritative_input_v1',input_vat:719.63,reviewed_input_vat:719.63,net_vat:-19.63,input_vat_complete:true});return{month:'2026-09',filing,deadlines:{},inputs:{can_manage:true,expenses:[{id:'company',origin:'company_purchase',vendor:'Synthetic Big C',invoice_date:'2026-09-22',tax_base:280.37,vat_amount:19.63,status:'eligible'}],external:[{id:'external',vendor:'Synthetic supplier',invoice_date:'2026-09-23',invoice_number:'TEST-065',tax_base:10000,vat_amount:700,status:'eligible',review:null,note:'Third party paid',funding_source:'third_party_no_reimbursement'}]},sources:await readMonthlyTaxSources(adapter(monthlyFixture()).client,permissions,'2026-09')};}
test('065 summaries use authoritative input, no review gate, signed net, unchanged WHT and frozen historical snapshots',async()=>{
 const d=await data(),s=taxMonthSummary(d);assert.deepEqual([s.input,s.net,s.pendingCount,s.incomplete,s.outgoing,s.incoming],[719.63,-19.63,0,false,186.24,560.19]);
 assert.equal(externalVatStatus(d.inputs.external[0]),'eligible');assert.equal(externalVatStatus({review:null}),'pending','064 response remains conservative before backend upgrade');
 const frozen=structuredClone(d.filing.pools[0]);d.filing.filings=[{filing_type:'vat',status:'filed',tax_amount:0,source_snapshot_json:frozen}];d.filing.pools[0].monthly_facts.net_vat=700;assert.equal(taxMonthSummary(d).net,-19.63);
 d.filing.filings[0]={filing_type:'vat',status:'filed',tax_amount:630,source_snapshot_json:snapshotFixture().pools[0]};assert.equal(taxMonthSummary(d).net,630);
});
for(const locale of ['th','en'])test(`065 ${locale} normal evidence has correction access; pending section hidden unless explicitly ambiguous`,async()=>{
 const d=await data(),state={'TaxHome.month':'2026-10','TaxHome.months':[d],'TaxHome.loading':false};
 let html=home.render(locale,state,{permissions});assert.doesNotMatch(html,/VAT ซื้อรอตรวจ|Input VAT pending review/);assert.match(html,/719\.63/);assert.match(html,/-19\.63/);
 html=home.render(locale,{...state,'TaxHome.source':'input'},{permissions});assert.match(html,/Synthetic Big C/);assert.match(html,/TEST-065/);assert.match(html,locale==='th'?/แก้ไข \/ ไม่ใช้เครดิต/:/Correct \/ exclude credit/);assert.doesNotMatch(html,/Pending review|รอตรวจ/);
 d.inputs.expenses.push({id:'ambiguous',status:'pending',vat_amount:null});d.filing.pools[0].monthly_facts.input_vat_complete=false;d.filing.pools[0].monthly_facts.net_vat=null;
 assert.equal(taxMonthSummary(d).pendingCount,1);assert.equal(taxMonthSummary(d).pendingVat,null);html=home.render(locale,state,{permissions});assert.match(html,locale==='th'?/VAT ซื้อรอตรวจ/:/Input VAT pending review/);
});
for(const locale of ['th','en'])test(`065 ${locale} external save is one step, existing document exposes correction with audit reason`,async()=>{
 const form=workspaceFixture('app/finance/tax-position/external-input.tsx',['ExternalInputForm'],modals);const props={onClose(){},onSaved(){}};
 const create=form.render(locale,{},props,'ExternalInputForm');assert.match(create,locale==='th'?/เมื่อบันทึก VAT จะรวมในภาษีซื้อทันที/:/Saving immediately includes this VAT/);assert.doesNotMatch(create,/external-status|external-reason/);
 const d=await data(),edit=form.render(locale,{},{...props,row:d.inputs.external[0]},'ExternalInputForm');assert.match(edit,/value="eligible" selected/);assert.match(edit,/external-reason/);assert.match(edit,locale==='th'?/บันทึกการแก้ไข/:/Save correction/);
});
