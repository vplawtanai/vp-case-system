/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const a=require('./tax-064-historical-artifacts.cjs'),capture=require('./tax-064-baseline-capture.cjs');
test('historical pre-security 064 capture stays unchanged and SELECT-only',()=>{
 const old=JSON.parse(fs.readFileSync(a.manifestPath,'utf8'));
 assert.equal(a.sha(),old.sha256);
 const sql=capture.captureSql();assert.equal(fs.readFileSync(capture.output,'utf8'),sql);
 // Remove SQL literals and comments before inspecting executable tokens.
 const code=sql.replace(/'(?:[^']|'')*'/g,"''").replace(/--[^\n]*/g,'');
 assert.doesNotMatch(code,/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|do|call|set_config|dblink|query_to_xml)\b/i);
 assert.equal((code.match(/;/g)||[]).length,1);
 for(const key of ['accepted_063_verifier','original_064_preflight','default_privileges','role_membership','all_public_function_definitions','relation_security'])assert.ok(sql.includes(key));
 assert.ok(sql.includes("'apply_or_dry_run_authorized',false"));assert.ok(sql.includes("'classification_required',true"));
});
test('064 synthetic fixture cannot overwrite the Production catalog artifact',()=>{
 const source=fs.readFileSync('scripts/tests/tax-simple-postgres.test.cjs','utf8');
 assert.match(source,/require\('\.\/tax-064-build-contract\.cjs'\)\.build\(before,after\)/);
 const builder=fs.readFileSync('scripts/tests/tax-064-build-contract.cjs','utf8');
 assert.match(builder,/capture\.all_public_function_definitions/);assert.match(builder,/capture\.catalog\.find/);
 assert.doesNotMatch(builder,/before=localBefore/);
 assert.match(source,/Synthetic PGlite state is not a Production baseline/);
});
