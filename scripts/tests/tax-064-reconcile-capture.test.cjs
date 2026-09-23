/* eslint-disable @typescript-eslint/no-require-imports */
// Offline; uses the explicitly supplied capture. Never connects to Production or executes SQL.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {reconcile}=require('./tax-064-reconcile-capture.cjs');
const source=process.env.TAX064_CAPTURE_PATH||'/private/tmp/post063-baseline-for-064.json';
test('064 reconciliation exhaustively accounts for every captured difference without accepting uncovered ACLs',()=>{
 const result=reconcile(source);
 assert.deepEqual(result,JSON.parse(fs.readFileSync('scripts/tests/tax-064-reconciliation.json','utf8')));
 assert.equal(result.summary.function_differences,390);assert.equal(result.summary.catalog_differences,100);
 assert.equal(result.summary.A,0);assert.equal(result.summary.B,490);
 assert.equal(result.accepted_063_evidence.verified_function_count,40);
 assert.equal(result.accepted_063_evidence.table_count,10);
 assert.equal(new Set(result.differences.map(d=>d.kind+':'+d.name)).size,490);
 assert.ok(result.differences.every(d=>d.classification==='B'&&d.reasons.length>0));
 assert.equal(result.candidate_changed,false);
});
test('064 capture hashes, accepted body evidence and difference completeness fail closed',()=>{
 const original=JSON.parse(fs.readFileSync(source,'utf8'));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tax064-reconcile-'));
 const file=path.join(dir,'capture.json');
 const reject=change=>{const data=structuredClone(original);change(data);fs.writeFileSync(file,JSON.stringify(data));assert.throws(()=>reconcile(file));};
 reject(d=>{d.migration_063_sha256='wrong';});reject(d=>{d.migration_064_sha256='wrong';});
 reject(d=>{d.accepted_063_verifier.reimbursement_bank_verification_pass=false;});
 reject(d=>{d.original_064_preflight.function_differences.pop();});
 reject(d=>{d.all_public_function_definitions.find(f=>f.signature==='tax_position_source(text,uuid)').definition+='\n-- changed';});
});
