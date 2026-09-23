/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {audit}=require('./tax-064-dependency-audit.cjs');
test('064 exact execution dependency audit excludes three unrelated mutation helpers and preserves unresolved evidence',()=>{
 const result=audit();assert.deepEqual(result,JSON.parse(fs.readFileSync('scripts/tests/tax-064-dependency-audit.json','utf8')));
 assert.deepEqual(result.runtime_existing_functions.map(f=>f.signature),[
 'current_user_can_manage_finance_tax_invoices()','tax_position_can_manage()','tax_position_can_view()',
 'tax_position_immutable()','tax_position_source(text,uuid)','tax_position_source_before_expense(text,uuid)','tax_position_sync(text,uuid,text)']);
 assert.equal(result.runtime_existing_tables.length,17);
 assert.ok(result.runtime_existing_functions.every(f=>f.definition_security_config_match));
 assert.ok(result.special_functions.every(f=>!f.called_by_064&&!f.blocking));
 assert.equal(result.candidate_changed,false);assert.equal(result.targets_absent,true);
 const prior=JSON.parse(fs.readFileSync(result.original_report,'utf8'));assert.equal(prior.summary.B,result.broader_unresolved_differences);
 assert.equal(result.gate_regenerated,false);assert.deepEqual(result.production_actions,[]);
 assert.equal(result.narrow_blocker.objects.length,3);
});
