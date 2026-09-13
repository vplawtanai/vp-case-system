/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),ts=require('typescript'),vm=require('node:vm');
require('./receipt-render-fixture.cjs');
const engine=require('../../app/finance/compensation/formula-engine.ts');
const formula=require('../../app/finance/compensation/formula-calculation.ts');
const {lineFormulaChoices,formulaCatalogCurrent}=require('../../app/finance/payments/vp-formula.ts');
const {fixture}=require('./vp-distribution-fixture.cjs');
const people=[{id:'10000000-0000-4000-8000-000000000001',name:'Fixture Admin'},{id:'10000000-0000-4000-8000-000000000002',name:'Fixture Staff'}];
function resolved(code,pool){
 const input=formula.initialFormula(code,pool);let n=0;
 for(const row of input.rows)if(!row.is_company_share){row.recipient_user_id=people[n++%people.length].id;}
 if(code==='custom')input.rows[0].amount=String(pool);
 return input;
}
test('shared extraction preserves legacy presets/calculations/recipient normalization and keeps batch/ledger side effects in the page',()=>{
 const old=cp.execFileSync('git',['show','a5a56f63617791a5f03f6cb18af8d6756bb2ff58:app/finance/compensation/page.tsx'],{encoding:'utf8'});
 const tree=ts.createSourceFile('old.tsx',old,99,true,ts.ScriptKind.TSX);
 const functions=tree.statements.filter(node=>ts.isFunctionDeclaration(node)&&Object.hasOwn(engine,node.name?.text));
 const names=['generateAllocations','createAllocation','rebalanceOwnerWorkPool','normalizeAllocationsForSave','normalizeAllocationForState','prepareAllocationForEdit','getDisplayPercent','getRecipientName'];
 const source=functions.map(node=>node.getText(tree)).join('\n')+'\nmodule.exports={'+names.join(',')+'};';
 const sandbox={module:{exports:{}},roleLabels:engine.roleLabels,recipientTypes:engine.recipientTypes,otherValue:'__other__'};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:9,module:1}}).outputText,sandbox);
 const previous=sandbox.module.exports;
 for(const code of engine.formulaCodes)for(const amount of [0,0.01,100,9999.99,10000]){
  const rows=engine.generateAllocations(code,amount),before=previous.generateAllocations(code,amount);
  assert.equal(JSON.stringify(rows),JSON.stringify(before),code);
  assert.equal(JSON.stringify(engine.rebalanceOwnerWorkPool(rows,amount,code)),JSON.stringify(previous.rebalanceOwnerWorkPool(before,amount,code)));
  for(const row of rows)assert.equal(JSON.stringify(engine.normalizeAllocationForState(row)),JSON.stringify(previous.normalizeAllocationForState(row)));
 }
 const shared=fs.readFileSync('app/finance/compensation/formula-engine.ts','utf8');
 assert.doesNotMatch(shared,/supabase|finance_compensation_batches|finance_company_ledger/);
 const page=fs.readFileSync('app/finance/compensation/page.tsx','utf8');
 assert.match(page,/formulasForContext\("compensation"\).map/);assert.match(page,/finance_compensation_batches/);assert.match(page,/finance_company_ledger/);
});
test('existing five formulas resolve identities and reconcile exact amounts including multiple work recipients',()=>{
 for(const code of engine.formulaCodes){
  const input=resolved(code,10000);
  const calc=formula.calculateFormula(10000,input,people);
  assert.deepEqual(calc.errors,[],code);
  assert.equal(calc.result.recipients.reduce((n,r)=>n+Math.round(r.amount*100),0),1000000);
 }
 const input=resolved('source_worker_qc',10000);
 input.rows.push({...engine.createAllocation('assistant','Outside assistant',10,false,'Assistant'),recipient_user_id:'__other__'});
 input.rows=engine.rebalanceOwnerWorkPool(input.rows,10000,input.code);
 const calc=formula.calculateFormula(10000,input,people);
 assert.deepEqual(calc.errors,[]);assert.deepEqual(calc.result.recipients.map(r=>r.amount),[2000,4000,3000,1000]);
 assert.deepEqual([calc.result.referral_amount,calc.result.company_share_amount,calc.result.work_compensation_amount],[2000,4000,4000]);
});
test('largest remainder has deterministic index ties; fixed amounts remain exact; no inferred identity or mixed parameter ambiguity',()=>{
 const input=resolved('pao_line',0.03);input.rows.forEach((r,i)=>r.percent=['33.3334','33.3333','33.3333'][i]);
 const result=formula.calculateFormula(0.03,input,people);assert.deepEqual(result.errors,[]);assert.deepEqual(result.result.recipients.map(r=>r.amount),[0.01,0.01,0.01]);
 assert.equal(result.result.recipients.reduce((n,r)=>n+r.rounding_adjustment_cents,0),2);
 assert.ok(formula.calculateFormula(10000,formula.initialFormula('pao_line',10000),people).errors.includes('recipientRequired'));
 const fixed=resolved('custom',10000);fixed.rows[0].percent='ignored by fixed mode';
 assert.deepEqual(formula.calculateFormula(10000,fixed,people).errors,[]);
 assert.equal(formula.calculateFormula(10000,fixed,people).result.recipients[0].percent,null);
 for(const value of ['9999.99','10000.01','-1','0.001','1e4']){fixed.rows[0].amount=value;assert.ok(formula.calculateFormula(10000,fixed,people).errors.length);}
});
test('multiple professional lines use independent formulas and pools excluding each line VAT/WHT; nonprofessional routing unchanged',()=>{
 const c=fixture();c.formula_catalog=engine.compensationFormulaDefinitions;c.formula_schema_version=1;c.formula_people=people;
 c.source.lines[1].wht=300;c.source.lines[1].vat=700;c.source.lines[1].professional_pool=9700;
 c.source.lines.push({...c.source.lines[1],invoice_item_id:'second',base:1000,wht:0,vat:70,professional_pool:1000});
 const inputs={'synthetic-line-1':resolved('pao_line',9700),second:resolved('source_worker_qc',1000)};
 const calc=lineFormulaChoices(c,inputs);assert.equal(calc.valid,true);assert.equal(calc.choices.length,2);
 assert.deepEqual(calc.choices.map(r=>r.formula_result.pool),[9700,1000]);
 assert.deepEqual(calc.choices.map(r=>r.formula_result.formula_code),['pao_line','source_worker_qc']);
 assert.equal(c.source.totals.company_economic,8672.9);
 c.formula_catalog={...c.formula_catalog,version:2};assert.equal(formulaCatalogCurrent(c),false);
});
test('frozen result restores without consulting a later live formula; malformed roles, duplicates and stale identities fail closed',()=>{
 const input=resolved('pao_line',10000),first=formula.calculateFormula(10000,input,people).result;
 assert.deepEqual(formula.calculateFormula(first.pool,formula.restoreFormula(first),people,first.formula_snapshot).result,first);
 const snapshot=JSON.stringify(first),catalog=engine.compensationFormulaDefinitions;
 catalog.version=2;catalog.formulas[0].defaults[0].percent=21;
 try{assert.equal(formula.calculateFormula(10000,input,people).result,null);assert.deepEqual(formula.calculateFormula(10000,input,people,first.formula_snapshot).result,first);}
 finally{catalog.version=1;catalog.formulas[0].defaults[0].percent=20;}
 assert.equal(JSON.stringify(first),snapshot);
 input.rows[2]={...input.rows[1],percent:input.rows[2].percent};
 assert.ok(formula.calculateFormula(10000,input,people).errors.includes('duplicateRecipient'));
 input.rows[1].recipient_type='unknown';assert.ok(formula.calculateFormula(10000,input,people).errors.includes('roleRequired'));
 input.rows[1].recipient_user_id='missing';assert.ok(formula.calculateFormula(10000,input,people).errors.includes('recipientRequired'));
});
module.exports={resolved,people};
