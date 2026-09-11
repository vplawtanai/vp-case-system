/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {customerTaxForm,customerTaxErrors,customerTaxPayload,customerTaxError}=require('../../app/clients/tax-identity.ts');
const {effectiveUiLocale}=require('../../lib/i18n/core.ts');
const {customerTaxMessages}=require('../../lib/i18n/messages/customer-tax.ts');
const {lexical}=require('./receipt-sql-static.test.cjs');
const root=path.resolve(__dirname,'../..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const initial={identity:{id:'client',name:'Test buyer',address:'Test address',tax_id:'1234567890123',client_type:'individual'},profile:null,can_manage:true,status:'missing'};
test('individual and juristic, nonregistered/unknown have no fabricated branch; manual verification is explicit',()=>{
 for(const client_type of ['individual','limited_company']){
  const row={...initial,identity:{...initial.identity,client_type}},form=customerTaxForm(row);
  assert.equal(form.vat,'');assert.equal(form.branch,'');assert.equal(form.verified,false);
  assert.equal(customerTaxErrors({...form,verified:true},row.identity).vat,'client.tax.error.vat');
  const unregistered={...form,vat:'false',verified:true,branch:'branch',code:'00012'};
  assert.deepEqual(customerTaxErrors(unregistered,row.identity),{});const p=customerTaxPayload(row,unregistered);
  assert.equal(p.p_branch_type,null);assert.equal(p.p_branch_code,null);assert.equal(p.p_vat_registered,false);
 }
});
test('registered identity requires valid explicit establishment and preserves exact reviewed Client values',()=>{
 const form={...customerTaxForm(initial),vat:'true',verified:true};assert.ok(customerTaxErrors(form,initial.identity).branch);
 for(const code of ['00000','123','abcdef','123456'])assert.ok(customerTaxErrors({...form,branch:'branch',code},initial.identity).code);
 const branch={...form,branch:'branch',code:'00012'};assert.deepEqual(customerTaxErrors(branch,initial.identity),{});
 assert.equal(customerTaxPayload(initial,branch).p_branch_code,'00012');assert.deepEqual(customerTaxPayload(initial,branch).p_expected_identity_json,initial.identity);
 assert.equal(customerTaxPayload(initial,{...form,branch:'head_office'}).p_branch_code,'00000');
 assert.ok(customerTaxErrors(form,{...initial.identity,tax_id:'bad'}).identity);
 assert.ok(customerTaxErrors({...form,vat:'false'},{...initial.identity,address:''}).identity);
});
test('stale profile requires explicit review and errors expose no raw database detail',()=>{
 const profile={vat_registered:false,identity_evidence:'Evidence',branch_type:null,branch_code:null,verified_at:'2026-01-01',updated_at:'version'};
 assert.equal(customerTaxForm({...initial,status:'stale',profile}).verified,false);
 assert.equal(customerTaxError({message:'CUSTOMER_TAX_PROFILE_STALE'}),'client.tax.error.stale');
 assert.equal(customerTaxError({message:'SQL secret details'}),'client.tax.error.failed');
});
test('TH/EN coverage is limited to the new tax identity route',()=>{
 for(const key of Object.keys(customerTaxMessages))for(const locale of ['th','en'])assert.ok(customerTaxMessages[key][locale].trim());
 assert.equal(effectiveUiLocale('en','/clients/client/tax-identity'),'en');
 assert.equal(effectiveUiLocale('en','/clients'),'th');
 const source=read('app/clients/[id]/tax-identity/page.tsx');
 for(const m of source.matchAll(/t\("(client\.tax\.[^"]+)"\)/g))assert.ok(customerTaxMessages[m[1]],m[1]);
});
test('ordinary Client mutation logic and Invoice/Receipt renderers remain untouched; profile inputs only in Client profile',()=>{
 const file='app/clients/page.tsx',source=read(file),before=cp.execFileSync('git',['show','HEAD:'+file],{cwd:root,encoding:'utf8'});
 assert.equal(source.slice(source.indexOf('  const loadClients ='),source.indexOf('  return (')),before.slice(before.indexOf('  const loadClients ='),before.indexOf('  return (')));
 assert.match(source,/permissions\.canViewFinanceTaxInvoices && !isClientDeleted\(client\)/);
 const editor=read('app/finance/tax-invoices/editor.tsx');assert.match(editor,/profileControlled \?/);assert.match(editor,/source\.buyer_tax_profile != null/);
 assert.doesNotMatch(editor,/change\("(?:buyer_|customer_|identity_evidence)/,'No competing per-document buyer edit path');
 const diff=cp.execFileSync('git',['diff','--name-only'],{cwd:root,encoding:'utf8'});
 assert.doesNotMatch(diff,/app\/finance\/(invoices|receipts)\//);
});
test('042 operator files are SELECT-only, one statement, exact embedding; no applied migration edits',()=>{
 const {workflow,migrationPath}=require('./customer-tax-profile-artifacts.cjs');
 for(const [file,content] of Object.entries(workflow())){
  assert.equal(read(file),content);
  const clean=lexical(content);
  if(!file.includes('dry_run')){assert.equal(clean.split(';').filter(s=>s.trim()).length,1);assert.match(clean.trim(),/^with\s/i);
   assert.doesNotMatch(clean,/\b(insert|update|delete|alter|create|drop|grant|revoke|call|do|execute|into|set_config)\s*\b/i);
   assert.doesNotMatch(clean,/\b(?:get|save|build|issue|refresh|confirm)_finance_\w+\s*\(/i);
  }else{assert.match(clean.trim(),/^begin;/i);assert.match(clean.trim(),/rollback;$/i);assert.doesNotMatch(clean,/\bcommit\b/i);assert.equal(content.split('-- BEGIN EMBEDDED MIGRATION 042\n')[1].split('-- END EMBEDDED MIGRATION 042')[0],read(migrationPath));}
 }
 const migration=lexical(read(migrationPath));for(const stmt of migration.split(';'))assert.doesNotMatch(stmt.trim(),/^(insert|update|delete|merge|truncate|copy|select)\b/i);
 assert.equal(cp.execFileSync('git',['diff','--','supabase/migrations'],{cwd:root,encoding:'utf8'}),'');
});

test('Tax/Combined editor renders profile and legacy buyer identity read-only in TH/EN',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),Module=require('node:module');
 const {fixture}=require('./tax-invoice-render-fixture.cjs');
 const {UiLocaleProvider}=require('../../lib/i18n/provider.tsx');
 const file=require.resolve('../../lib/supabase.ts'),stub=new Module(file);
 stub.exports={supabase:{rpc(){throw Error('Unexpected RPC in readonly rendering')}}};stub.loaded=true;require.cache[file]=stub;
 try {
  const {TaxInvoiceEditor}=require('../../app/finance/tax-invoices/editor.tsx');
  const {buildPermissions}=require('../../lib/permissions.ts');
  for(const profile of [null,{schema_version:1,status:'missing',profile:null},{schema_version:1,status:'verified',profile:{vat_registered:true,branch_type:'branch',branch_code:'00012',identity_evidence:'Saved profile evidence'}}])for(const locale of ['th','en']){
   const row=fixture();row.source_snapshot_json.customer.id='client';if(profile)row.source_snapshot_json.buyer_tax_profile=profile;
   const markup=renderToStaticMarkup(React.createElement(UiLocaleProvider,{initialLocale:locale,pathname:'/finance/tax-invoices/local'},React.createElement(TaxInvoiceEditor,{row,permissions:buildPermissions({role:'admin'}),logoUrl:'',blockers:[],reload:async()=>{}})));
   assert.match(markup,/href="\/clients\/client\/tax-identity"/);
   assert.equal((markup.match(/<select\b/g)||[]).length,1,'Only unchanged legacy VAT-treatment choice, never buyer identity selects');
   assert.doesNotMatch(markup,/<textarea\b/);
   assert.ok(markup.includes(customerTaxMessages[profile?'client.tax.documentSource':'client.tax.legacySource'][locale]));
   if(profile?.status==='verified')assert.match(markup,/00012/);
  }
 } finally {delete require.cache[file];}
});
