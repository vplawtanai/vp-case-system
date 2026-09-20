/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),React=require('react'),ts=require('typescript');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs'),{fixture}=require('./expense-foundation-fixture.cjs');
const {translate}=require('../../lib/i18n/catalog.ts');
const forms=workspaceFixture('app/finance/expenses/forms.tsx',['ExpenseFactsForm']);
const modal=workspaceFixture('app/finance/expenses/create-modal.tsx',['ExpenseCreateModal'],{'./forms':{ExpenseFactsForm:forms.ExpenseFactsForm},'../../components/DetailModal':{default:({title,children,footer})=>React.createElement('section',{role:'dialog'},title,children,footer)}});
const workspace=workspaceFixture('app/finance/expenses/workspace.tsx',['ExpenseWorkspace'],{'./data':{},'./forms':{ExpenseFactsForm:forms.ExpenseFactsForm},'./create-modal':{ExpenseCreateModal:modal.ExpenseCreateModal}});
test('Canonical categories retain Legacy stored values, with translated labels and custom historical values',()=>{
 const {expenseCategories,expenseCategoryChoice}=require('../../app/finance/expenses/categories.ts');
 const ast=ts.createSourceFile('legacy.tsx',fs.readFileSync('app/finance/expense-claims/page.tsx','utf8'),99,true,ts.ScriptKind.TSX);let legacy;
 function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='expenseCategories')legacy=n.initializer.elements.map(n=>n.text);ts.forEachChild(n,visit);}visit(ast);
 assert.ok(legacy.every(value=>expenseCategories.some(category=>category.value===value)));assert.equal(expenseCategoryChoice('ค่าเดินทาง'),'ค่าเดินทาง');assert.equal(expenseCategoryChoice('Historic custom category'),'Other');assert.equal(expenseCategoryChoice(''),'');
 const f=fixture('list');
 for(const locale of ['th','en']){
  for(const claim of [false,true]){
   const props={claim,access:f.data.access,accounts:f.data.accounts,lookups:f.lookups,run:()=>null,busy:false};
   const html=forms.render(locale,{},props,'ExpenseFactsForm');assert.match(html,/<select[^>]*id="expense-category"/);assert.doesNotMatch(html,/id="expense-custom-category"|id="expense-client_id"|id="expense-claimant_id"|id="expense-payment-account"/);
   assert.doesNotMatch(html,/<details[^>]*\bopen/);assert.ok(html.includes(translate(locale,'expenses.taxIfKnown')));
   const custom=forms.render(locale,{'ExpenseFactsForm.categoryChoice':'Other'},props,'ExpenseFactsForm');assert.match(custom,/id="expense-custom-category"/);
   if(claim){assert.doesNotMatch(html,/id="expense-handling"|id="expense-claimant"/);assert.ok(html.includes(translate(locale,'expenses.claimRequestHelp')));assert.ok(!html.includes(translate(locale,'expenses.personallyPaid')));}
   else {const personal=forms.render(locale,{}, {...props,row:{...f.data.rows[0],personally_paid:true,claimant_id:f.data.access.user_id,reimbursement_requested:0}},'ExpenseFactsForm');assert.match(personal,/id="expense-claimant_id"/);assert.ok(personal.includes(translate(locale,'expenses.draftZeroRequest')));assert.doesNotMatch(personal,/value="no_reimbursement"|id="expense-settlement-mode"/);}
  }
 }
});
for(const locale of ['th','en'])for(const claim of [false,true]){
 test(`${locale} ${claim?'Claim':'Company'}: lists launch a shared modal, denied users do not; fallback retains same form`,()=>{
  const f=fixture(claim?'claims-empty':'list'),t=k=>translate(locale,'expenses.'+k),props={claims:claim,fixture:f.data,fixtureLookups:f.lookups};
  const list=workspace.render(locale,{},props,'ExpenseWorkspace');assert.match(list,/aria-haspopup="dialog"/);assert.doesNotMatch(list,/href="\/finance\/expenses\/(?:claims\/)?new"/);
  const denied=workspace.render(locale,{}, {...props,fixture:{...f.data,access:{...f.data.access,can_claim:false,can_manage:false,can_record:false}}},'ExpenseWorkspace');assert.doesNotMatch(denied,/aria-haspopup="dialog"/);
  const opened=workspace.render(locale,{'ExpenseWorkspace.createOpen':true},props,'ExpenseWorkspace');assert.match(opened,/role="dialog"/);assert.match(opened,/id="expense-description"/);assert.ok(opened.includes(t(claim?'newClaim':'new')));
  const deep=workspace.render(locale,{}, {...props,id:'new'},'ExpenseWorkspace');assert.match(deep,/id="expense-description"/);assert.doesNotMatch(deep,/role="dialog"/);
 });
 test(`${locale} ${claim?'Claim':'Company'}: errors, busy state and unsaved confirmation stay inside the modal; no Admin/tax decision tools`,()=>{
  const f=fixture(claim?'claims-empty':'list'),t=k=>translate(locale,'expenses.'+k),props={claim,access:f.data.access,accounts:f.data.accounts,lookups:f.lookups,run:()=>{throw Error('No writes');},busy:false,error:'denied',onClose:()=>{},onSaved:()=>{}};
  const html=modal.render(locale,{},props,'ExpenseCreateModal');assert.match(html,/role="alert"/);assert.ok(html.includes(t('denied')));
  for(const key of ['bridge','authorities','vatRate','whtRate','eligibility','saveReview'])assert.ok(!html.includes(t(key)),key);
  const busy=modal.render(locale,{}, {...props,busy:true},'ExpenseCreateModal');assert.match(busy,/<fieldset disabled/);assert.ok(busy.includes(t('working')));
  const dirty=modal.render(locale,{'ExpenseCreateModal.confirmClose':true},props,'ExpenseCreateModal');assert.equal((dirty.match(/role="dialog"/g)||[]).length,2);assert.ok(dirty.includes(t('keepEditing')));assert.ok(dirty.includes(t('discardCreate')));
 });
}
test('Existing RPC calls/payloads, input contract, permissions, routes and shared modal remain unchanged',()=>{
 const file='app/finance/expenses/forms.tsx',source=fs.readFileSync(file,'utf8'),old=cp.execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'});
 function contract(text){const ast=ts.createSourceFile(file,text,99,true,ts.ScriptKind.TSX),found=[];function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='run')found.push(n.getText(ast));if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='input')found.push(n.getText(ast));ts.forEachChild(n,visit);}visit(ast);return found;}
 assert.deepEqual(contract(source),contract(old));assert.match(source,/if \(onSaved\) onSaved\(result\); else router.push/);assert.match(source,/form=\{formId\}/);
 for(const name of ['AccountSelect','ExpenseTaxForm','ExpenseSettlementForm','ExpensePaymentPanel']){
  const declaration=text=>ts.createSourceFile(file,text,99,true,ts.ScriptKind.TSX).statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText();
  assert.equal(declaration(source),declaration(old),name+' remains byte-identical');
 }
 for(const file of ['app/components/DetailModal.tsx','app/components/DetailModal.module.css','app/finance/expenses/data.ts','app/finance/expenses/shared.ts','app/finance/expenses/new/page.tsx','app/finance/expenses/claims/[id]/page.tsx'])assert.equal(fs.readFileSync(file,'utf8'),cp.execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'}),file);
 const wrapper=fs.readFileSync('app/finance/expenses/create-modal.tsx','utf8');assert.doesNotMatch(wrapper,/supabase|\.rpc\(|router\./);assert.match(wrapper,/if \(form.busy\) return/);assert.match(wrapper,/if \(dirty\) setConfirmClose/);
 const workspace=fs.readFileSync('app/finance/expenses/workspace.tsx','utf8');assert.match(workspace,/if \(lock.current \|\| fixture\) return null/);assert.match(workspace,/await load\(!id\)/);assert.match(workspace,/if \(!preserveContext\) setData\(null\)/);
});
