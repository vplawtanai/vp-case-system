/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const fixture=require('./direct-money-documents-postgres.test.cjs');
const {db,query,scalar,migration}=require('./receipt-foundation.test.cjs');
const a=require('./direct-money-documents-artifacts.cjs');
const security=require('./direct-money-documents-security.cjs');
test('066 gate: exact dependency contract, SELECT-only preflight, rollback, verifier and deliberate drift',async()=>{
 await fixture.setup(false);
 const beforeFunctions=await scalar(a.functionsSql),beforeCatalog=await scalar(a.catalogSql);
 const written=[...a.source().matchAll(/create (?:or replace )?function public\.(\w+)\(/g)].map(m=>m[1]);
 const created=written.filter(n=>!beforeFunctions.some(f=>f.name===n)),changed=written.filter(n=>!created.includes(n));
 const dependencyNames=new Set(written);for(const m of a.source().matchAll(/public\.(\w+)\(/g))dependencyNames.add(m[1]);
 // Transitive helpers invoked by the Direct source, tax and document engines.
 let size=0;while(size!==dependencyNames.size){size=dependencyNames.size;for(const f of beforeFunctions.filter(f=>dependencyNames.has(f.name)))for(const m of f.definition.matchAll(/public\.(\w+)\(/g))dependencyNames.add(m[1]);}
 // The allocator's quotation-only branch is unreachable for the three fixed document kinds.
 // Preserve its current Production definition/ACL before/after; never pin a fixture permission stub.
 dependencyNames.delete('current_user_can_manage_finance_quotations');
 const rowTables=(await query("select tablename from pg_tables where schemaname='public' and (tablename like 'finance_%' or tablename in ('clients','user_profiles','document_numbering_profiles')) order by tablename")).map(r=>r.tablename);
 const before={functions:beforeFunctions.filter(f=>dependencyNames.has(f.name)),catalog:beforeCatalog.filter(t=>a.tables.includes(t.name))};
 security.assertPinnedHelper(before.functions);
 await db.exec('savepoint candidate066');await db.exec(migration('66'));
 const after={functions:(await scalar(a.functionsSql)).filter(f=>dependencyNames.has(f.name)),catalog:(await scalar(a.catalogSql)).filter(t=>a.tables.includes(t.name))};
 security.assertPinnedHelper(after.functions);
 await db.exec('rollback to savepoint candidate066;release savepoint candidate066');
 const contract={pinnedFunctionSecurity:[security.signature],securityEvidence:'scripts/tests/direct-money-documents-acl-evidence.json',unreachablePreserved:['current_user_can_manage_finance_quotations: quotation numbering branch; 066 only passes receipt/tax_invoice/receipt_tax_invoice'],candidateSha:a.sha(a.source()),accepted065Sha:a.sha(migration('65')),changed,created,rowTables,before,after};
 assert.equal(contract.accepted065Sha,'eea28bb1470b964547815c90ad4d0be0b22408da1978176b49ac194ad855a54e');
 if(process.env.UPDATE_066_CONTRACT==='1')fs.writeFileSync(a.contractPath,JSON.stringify(contract,null,2)+'\n');
 else assert.deepEqual(JSON.parse(fs.readFileSync(a.contractPath)),contract);
 const history=await scalar(a.rowsSql(rowTables));
 // A READ ONLY transaction proves that preflight neither applies DDL nor writes data.
 await db.exec('commit;begin read only');const pre=(await query(a.preflight(contract)))[0];
 assert.deepEqual(pre.failed_checks,[]);assert.equal(pre.gate_pass,true);assert.deepEqual(await scalar(a.rowsSql(rowTables)),history);
 await db.exec('rollback;begin');
 // The actual hardened helper passes; the old permissive fixture state must fail.
 for(const role of ['public','anon','authenticated']){
 await db.exec(`savepoint helper_drift;grant execute on function public.${security.signature} to ${role}`);
 const bad=(await query(a.preflight(contract)))[0];assert.equal(bad.gate_pass,false);assert.ok(bad.failed_checks.includes('dependency_functions_exact'));
 await db.exec('rollback to savepoint helper_drift;release savepoint helper_drift');
 }
 await db.exec(a.dryRun(contract,JSON.stringify(pre.baseline)).replace(/^BEGIN;/m,'SAVEPOINT rehearsal066;').replace(/^ROLLBACK;/m,'ROLLBACK TO SAVEPOINT rehearsal066; RELEASE SAVEPOINT rehearsal066;'));
 assert.deepEqual(await scalar(a.captureSql(contract)),pre.baseline.state);
 await db.exec(migration('66'));
 const verified=(await query(a.verifier(contract,JSON.stringify(pre.baseline))))[0];assert.deepEqual(verified.failed_checks,[]);assert.equal(verified.historical_rows_unchanged,true);
 await db.exec(`savepoint helper_drift;revoke execute on function public.${security.signature} from service_role`);
 const lostService=(await query(a.verifier(contract,JSON.stringify(pre.baseline))))[0];assert.equal(lostService.gate_pass,false);assert.ok(lostService.failed_checks.includes('dependency_functions_exact'));assert.ok(lostService.failed_checks.includes('preserved_functions'));
 await db.exec('rollback to savepoint helper_drift;release savepoint helper_drift');
 await db.exec('savepoint drift066;grant select on finance_receipts to anon');const bad=(await query(a.verifier(contract,JSON.stringify(pre.baseline))))[0];assert.equal(bad.gate_pass,false);assert.ok(bad.failed_checks.includes('required_security'));await db.exec('rollback to savepoint drift066;release savepoint drift066');
 await db.exec('savepoint drift066;alter table finance_tax_invoices disable row level security');assert.equal((await query(a.verifier(contract,JSON.stringify(pre.baseline))))[0].gate_pass,false);await db.exec('rollback to savepoint drift066;release savepoint drift066');
});
