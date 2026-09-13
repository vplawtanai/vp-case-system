/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
require('./receipt-render-fixture.cjs');
const shared=require('../../app/finance/compensation/formula-presentation.ts');
const engine=require('../../app/finance/compensation/formula-engine.ts');
const formula=require('../../app/finance/compensation/formula-calculation.ts');
const {lineFormulaChoices}=require('../../app/finance/payments/vp-formula.ts');
const {fixture}=require('./vp-distribution-fixture.cjs');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {translate}=require('../../lib/i18n/catalog.ts');
const editor=workspaceFixture('app/finance/payments/vp-formula-editor.tsx',['VpFormulaEditor','FormulaResultEvidence']);
const people=fixture().formula_people;
function multiWorker(){
 const input=formula.initialFormula('source_worker_qc',10000);
 input.rows[0].recipient_user_id=people[0].id;input.rows[2].recipient_user_id=people[0].id;
 for(const role of ['Co-Lawyer / Co-Worker','Assistant','Quality Controller'])input.rows.push({
  ...engine.createAllocation(shared.workRoleType(role),'',10,false,role),recipient_user_id:people[0].id});
 input.rows=engine.rebalanceOwnerWorkPool(input.rows,10000,input.code);return input;
}
test('contextual applicability uses existing codes; Travel stays in Compensation only; frozen economics unchanged',()=>{
 assert.deepEqual(shared.formulasForContext('compensation'),engine.formulaCodes);
 assert.deepEqual(shared.formulasForContext('vp_revenue_distribution'),engine.formulaCodes.filter(code=>code!=='travel_fee'));
 const before=cp.execFileSync('git',['show','HEAD:app/finance/compensation/formula-definitions.json']);
 assert.equal(fs.readFileSync('app/finance/compensation/formula-definitions.json').equals(before),true);
 for(const locale of ['th','en']){
  assert.equal(shared.contextualFormulaLabel('source_worker_qc','vp_revenue_distribution',locale),translate(locale,'vpFormula.threeBucketFormula'));
  for(const code of engine.formulaCodes)assert.equal(shared.contextualFormulaLabel(code,'compensation',locale),engine.renderFormula(code,locale));
 }
});
test('multiple workers include Lead/Coworker/Assistant/QC; same person distinct roles remain distinct; residual exact',()=>{
 const input=multiWorker(),computed=formula.calculateFormula(10000,input,people);
 assert.deepEqual(shared.distributionRoleIssues(input,people),[]);assert.deepEqual(computed.errors,[]);
 assert.deepEqual(computed.result.recipients.map(row=>row.amount),[2000,4000,1000,1000,1000,1000]);
 assert.deepEqual(computed.result.recipients.slice(2).map(row=>row.role_label),['Lead Lawyer / Case Owner','Co-Lawyer / Co-Worker','Assistant','Quality Controller']);
 assert.equal(new Set(computed.result.recipients.slice(2).map(row=>row.recipient_user_id)).size,1);
 assert.equal(engine.getDisplayPercent(input.rows[3],input.code),'25');assert.equal(input.rows[3].percent,'10');
 input.rows.splice(3,1);input.rows=engine.rebalanceOwnerWorkPool(input.rows,10000,input.code);
 assert.equal(formula.calculateFormula(10000,input,people).result.recipients[2].amount,2000);
 const bad=structuredClone(input);bad.rows.push({...bad.rows[3]});
 assert.ok(formula.calculateFormula(10000,bad,people).errors.includes('duplicateRecipient'));
});
test('required recipients/lead and unsupported historical roles fail closed without invented fallback',()=>{
 const input=multiWorker();input.rows[2].recipient_user_id='';
 assert.ok(shared.distributionRoleIssues(input,people).includes('leadRecipient'));
 input.rows.splice(2,1);assert.ok(shared.distributionRoleIssues(input,people).includes('leadRequired'));
 input.rows[0].recipient_user_id='';assert.ok(shared.distributionRoleIssues(input,people).includes('referralRecipient'));
 input.rows[2].role_label='Other';input.rows[2].custom_role='Historical free text';
 assert.ok(shared.distributionRoleIssues(input,people).includes('controlledRole'));
 assert.equal(input.rows[2].custom_role,'Historical free text');
});
test('editable presets allow multiple staff/external referrals; no residual invented for Pao/Tun/custom',()=>{
 for(const code of ['pao_line','tun_line','custom']){
  const input=formula.initialFormula(code,10000);
  input.rows=[{...engine.createAllocation('company','Company',20,true,'Company Share'),amount:'2000'},
   {...engine.createAllocation('source','',10,false,'Client Source / Broker'),recipient_user_id:people[0].id,amount:'1000'},
   {...engine.createAllocation('source','External referrer',10,false,'Client Source / Broker'),recipient_user_id:'__other__',amount:'1000'},
   {...engine.createAllocation('lead_lawyer','',60,false,'Lead Lawyer / Case Owner'),recipient_user_id:people[0].id,amount:'6000'}];
  assert.deepEqual(engine.rebalanceOwnerWorkPool(input.rows,10000,code),input.rows);
  assert.deepEqual(formula.calculateFormula(10000,input,people).errors,[]);
 }
});
test('TH/EN editor: three buckets, fixed company/type/share are text; roles remain genuine selects; immediate amounts',()=>{
 for(const locale of ['th','en']){
  const html=editor.render(locale,{}, {pool:10000,input:multiWorker(),people,currency:'THB',disabled:false,invalid:false},'VpFormulaEditor');
  assert.doesNotMatch(html,/value="travel_fee"|select[^>]+disabled|type="range"/);
  for(const key of ['referral','company','work','companyName','lead','coworker','assistant','quality','workPercent','percent','remainderOwner'])assert.ok(html.includes(translate(locale,'vpFormula.'+key)),key);
  assert.equal((html.match(/<fieldset/g)||[]).length,6);
  assert.equal((html.match(/<select aria-label="/g)||[]).length,9); // formula, five people, three editable work roles
  assert.ok(html.includes('4,000.00 THB'));assert.ok(html.includes('1,000.00 THB'));
  assert.doesNotMatch(html,new RegExp('<select aria-label="'+translate(locale,'vpFormula.type')));
 }
});
test('live reconciliation never reports completion with missing roles/recipients or stale monetary preview',()=>{
 const c=fixture(),inputs={'synthetic-line-1':multiWorker()};
 let calculated=lineFormulaChoices(c,inputs);assert.equal(calculated.valid,true);
 assert.deepEqual(calculated.progress,{professional_pool:10000,allocated:10000,remaining:0});
 inputs['synthetic-line-1'].rows[2].recipient_user_id='';calculated=lineFormulaChoices(c,inputs);
 assert.equal(calculated.valid,false);assert.equal(calculated.progress.remaining,0);
 inputs['synthetic-line-1'].rows[3].percent='bad';calculated=lineFormulaChoices(c,inputs);
 assert.equal(calculated.valid,false);assert.equal(calculated.progress.allocated,null);assert.equal(calculated.progress.remaining,null);
 inputs['synthetic-line-1']=formula.initialFormula('travel_fee',10000);assert.equal(lineFormulaChoices(c,inputs).valid,false);
});
test('frozen evidence retains all role components/rounding and reads historical Travel without reinterpretation',()=>{
 const result=formula.calculateFormula(10000,multiWorker(),people).result,original=JSON.stringify(result);
 for(const locale of ['th','en']){
  const html=editor.render(locale,{}, {result,currency:'THB'},'FormulaResultEvidence');
  assert.doesNotMatch(html,/<input|<select/);assert.equal(JSON.stringify(result),original);
  for(const role of ['Lead Lawyer / Case Owner','Co-Lawyer / Co-Worker','Assistant','Quality Controller'])assert.ok(html.includes(role));
  const travel=formula.calculateFormula(10000,formula.initialFormula('travel_fee',10000),people).result;
  assert.ok(editor.render(locale,{}, {result:travel,currency:'THB'},'FormulaResultEvidence').includes('10,000.00 THB'));
 }
});
module.exports={multiWorker};
