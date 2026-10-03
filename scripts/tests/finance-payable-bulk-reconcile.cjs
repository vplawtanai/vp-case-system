/* eslint-disable @typescript-eslint/no-require-imports */
// Offline reconciliation only. No connections, environment credentials or SQL execution.
// Local definitions are witnesses, not authority: each is checked against an
// accepted full-object pin or independently reconstructed immutable migration SQL.
const fs=require('node:fs'),assert=require('node:assert/strict');
const A=require('./finance-authority-artifacts.cjs');
const H=require('./fixtures/finance-authority-after.json');
const E=require('./executive-finance-contract.json');
const U=require('./unified-statement-contract.json');
const {fingerprint}=require('./direct-money-documents-dry-run.cjs');
const evidencePath='scripts/tests/fixtures/finance-payable-bulk-accepted-evidence.json';
const contractPath='scripts/tests/fixtures/finance-payable-bulk-contract.json';
const privateAcl=A.B.functions.find(f=>f.name==='expense_payout_choice').acl;
const publicRpcAcl=A.B.functions.find(f=>f.name==='get_finance_expenses').acl;
const privateTableAcl=A.B.security.finance_treasury_account_authorities.acl;
const readableTableAcl=A.B.security.finance_cash_transactions.acl;
const sort=(xs,key)=>xs.sort((a,b)=>Buffer.compare(Buffer.from(a[key]),Buffer.from(b[key])));
const withoutColumnAcl=c=>{const result={...c};delete result.acl;return result;};
const migration=n=>fs.readFileSync(`supabase/migrations/${n}`,'utf8');
const m055='202607180055_add_expense_purchase_settlement_foundation.sql';
const m060='202607180060_add_company_purchase_request_flow.sql';
function acceptedIntegrity(){
 for(const manifest of [E,U]){const {manifestSha,...body}=manifest;assert.equal(fingerprint(body),manifestSha,'Accepted manifest integrity');}
 assert.equal(privateAcl,'{postgres=X/postgres,service_role=X/postgres}');
 assert.equal(publicRpcAcl,'{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}');
 assert.match(migration(m055),/revoke all on function %s from public,anon,authenticated/);
 // 055 grants this RPC to authenticated, but leaves trigger helpers private.
 const grantList=migration(m055).split("if f.proname in (").at(-1).split("then execute format('grant execute")[0];
 assert.ok(grantList.includes("'get_finance_expense_obligations'"));assert.ok(!grantList.includes("'expense_integrity'"));
}
function sourceFunction(name){
 const src=migration(m060),start=src.indexOf(`create or replace function public.${name}(`);assert.ok(start>=0);
 const block=src.slice(start),from=block.indexOf('as $fn$')+'as $fn$'.length,to=block.indexOf('$fn$;',from);assert.ok(from>7&&to>from);
 const body=block.slice(from,to),rpc=name==='get_finance_expense_obligations';
 const signature=rpc?'get_finance_expense_obligations(integer)':'expense_integrity()';
 const definition=`CREATE OR REPLACE FUNCTION public.${name}(${rpc?'p_offset integer DEFAULT 0':''})\n RETURNS ${rpc?'jsonb':'trigger'}\n LANGUAGE plpgsql\n ${rpc?'STABLE ':''}SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$${body}$function$\n`;
 return {signature,name,definition,owner:'postgres',acl:rpc?publicRpcAcl:privateAcl,security_definer:true,config:['search_path=public'],anon_execute:false,authenticated_execute:rpc,service_execute:true};
}
function project071(t){
 return {...t,columns:t.columns.map(withoutColumnAcl),
  policies:t.policies.filter(p=>!H.additions.policies.some(e=>e.schemaname==='public'&&e.tablename===t.name&&e.policyname===p.policyname)),
  triggers:t.triggers.filter(p=>!H.additions.triggers.some(e=>e.table===t.name&&e.name===p.name))};
}
function validateEvidence(e,c){
 acceptedIntegrity();
 assert.deepEqual(e.functions.map(f=>f.signature).sort(),Object.keys(c.functions).sort());
 assert.deepEqual(e.tables.map(t=>t.name).sort(),Object.keys(c.tables).sort());
 for(const f of e.functions){
  const pin=H.functions[f.signature]||E.after.functions[f.signature];
  if(pin)assert.equal(fingerprint(f),pin,'Independent accepted function: '+f.signature);
  else {assert.ok(['expense_integrity','get_finance_expense_obligations'].includes(f.name));assert.deepEqual(f,sourceFunction(f.name),'Exact 055 grants + 060 body');}
  assert.equal(fingerprint(f),c.functions[f.signature],'088 full function pin');
 }
 for(const t of e.tables){
  assert.ok(t.columns.every(c=>c.acl===null),'Unexpected column-level ACL: '+t.name);
  assert.equal(fingerprint(project071(t)),E.after.catalog[t.name],'Accepted 071 full table including ACL/grants: '+t.name);
  const policies=sort(t.policies.filter(p=>p.policyname.startsWith('finance078_')),'policyname');
  assert.deepEqual(policies,sort(H.additions.policies.filter(p=>p.schemaname==='public'&&p.tablename===t.name),'policyname'));
  const triggers=sort(t.triggers.filter(p=>p.name.startsWith('finance078_')).map(p=>({...p,table:t.name})),'name');
  assert.deepEqual(triggers,sort(H.additions.triggers.filter(p=>p.table===t.name),'name'));
  if(H.security[t.name]){const {owner,acl,rls,force_rls,policies}=t;assert.equal(fingerprint({owner,acl,rls,force_rls,policies}),H.security[t.name],'Accepted 078 security');}
  if(A.B.columns[t.name])assert.deepEqual(t.columns.map(withoutColumnAcl),A.B.columns[t.name],'Preserved accepted column evidence');
  assert.equal(fingerprint(t),c.tables[t.name],'088 full table pin');
 }
 assert.equal(A.sha(fs.readFileSync('scripts/tests/finance-payable-bulk-body.sql')),c.bulkBodySha256,'Bulk business SQL must remain unchanged');
 return true;
}
function reconcile(local,c){
 acceptedIntegrity();
 const functions=Object.keys(c.functions).sort().map(signature=>{
  const f=structuredClone(local.functions.find(f=>f.signature===signature));assert.ok(f,'Local definition witness missing');
  if(H.functions[signature]){assert.equal(fingerprint(f),H.functions[signature]);return f;}
  // ACLs come from accepted 078 pre-state evidence for the same 055 security
  // block. 027 explicitly revokes PUBLIC/anon/authenticated on its day helper.
  const rpc=f.name==='get_finance_expense_obligations';
  Object.assign(f,{acl:rpc?publicRpcAcl:privateAcl,anon_execute:false,authenticated_execute:rpc,service_execute:true});
  if(E.after.functions[signature])assert.equal(fingerprint(f),E.after.functions[signature],'Accepted 071 witness must match in FULL');
  else assert.deepEqual(f,sourceFunction(f.name),'Witness is not an independent definition source');
  return f;
 });
 const tables=Object.keys(c.tables).sort().map(name=>{
  const t=structuredClone(local.tables.find(t=>t.name===name));assert.ok(t);
  t.acl=A.B.security[name]?.acl||(name==='finance_outgoing_wht_obligations'?readableTableAcl:privateTableAcl);
  t.service_select=true;
  // Matching the accepted full-object SHA below proves every ACL entry/order,
  // privilege result, column, index, constraint, policy and trigger together.
  assert.equal(fingerprint(project071(t)),E.after.catalog[name],'071 exact catalog witness: '+name);
  return t;
 });
 const evidence={source:'Reconciled against accepted 070/071 full-object pins and exact 078 additions/security. Two new dependency pins derive from immutable 055 security + 060 bodies. No Production hashes copied.',functions,tables};
 const contract={...c,source:evidence.source,functions:Object.fromEntries(functions.map(f=>[f.signature,fingerprint(f)])),tables:Object.fromEntries(tables.map(t=>[t.name,fingerprint(t)])),bulkBodySha256:A.sha(fs.readFileSync('scripts/tests/finance-payable-bulk-body.sql')),
  provenance:{accepted070Manifest:U.manifestSha,accepted071Manifest:E.manifestSha,accepted078Candidate:A.reviewedPreflight.candidate_sha256,
   functionPinsFrom078:13,functionPinsFrom071:10,sourceDerivedFunctions:{'expense_integrity()':{body:m060,security:m055},'get_finance_expense_obligations(integer)':{body:m060,security:m055}},
   columnAclPolicy:'No explicit column grants; each attacl must be NULL. Full table ACL remains pinned.',productionStatus:'Fresh Human Preflight required; source-derived pins are not yet Production-verified.'}};
 validateEvidence(evidence,contract);return {evidence,contract};
}
function validate(){return validateEvidence(JSON.parse(fs.readFileSync(evidencePath)),JSON.parse(fs.readFileSync(contractPath)));}
if(require.main===module){
 assert.equal(process.argv[2],'--reconcile-local-witness');assert.ok(process.argv[3]);
 const result=reconcile(JSON.parse(fs.readFileSync(process.argv[3])),JSON.parse(fs.readFileSync(contractPath)));
 fs.writeFileSync(evidencePath,JSON.stringify(result.evidence,null,2)+'\n');fs.writeFileSync(contractPath,JSON.stringify(result.contract,null,2)+'\n');
 console.log('Reconciled accepted contract; Production verification still required.');
}
module.exports={evidencePath,sourceFunction,project071,validateEvidence,reconcile,validate};
