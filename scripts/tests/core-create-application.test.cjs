/* eslint-disable @typescript-eslint/no-require-imports */
// Current create handlers, transpiled in a VM with no network or database access.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function source(path){return ts.createSourceFile(path,fs.readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);}
function declaration(path,name){let found;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText()===name)found=n.initializer.getText();ts.forEachChild(n,visit);}visit(source(path));assert.ok(found,name);return found;}
function compile(text,context){const sandbox={exports:{},console,...context};vm.runInNewContext(ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);return sandbox.exports;}
const permissions=compile(fs.readFileSync('lib/permissions.ts','utf8'),{});
function handler(path,name,context){return compile('exports.handler = '+declaration(path,name),context).handler;}
const client={id:'10000000-0000-0000-0000-000000000001',name:'Fixture client'};
function caseContext({allow=true,error=null,confirm=true}={}){const calls=[],alerts=[],routes=[];return {calls,alerts,routes,context:{permissions:{canCreateCase:allow},clients:[client],selectedCreateClientId:client.id,window:{confirm:()=>{calls.push('confirm');return confirm;}},alert:m=>alerts.push(m),setSaving:()=>{},setSelectedCreateClientId:()=>{},setShowAddCaseForm:()=>{},fetchCases:async()=>{},router:{push:p=>routes.push(p)},supabase:{rpc:async(n,a)=>{calls.push({n,a});return {data:error?null:{id:52,file_no:'VP-2026-052'},error};},from:()=>{throw Error('Create must not use a separate table write');}}}};}
const form={client_id:client.id,title:'  Fixture advisory  ',matter_type:'general_advisory',matter_type_other:'',retainer_type:'no_retainer',status:'active',responsible_lawyer:' Fixture lawyer ',start_date:'2026-09-26',end_date:'',monthly_retainer_amount:'12000',scope_of_work:' Fixture scope ',note:' Fixture note '};
function advisoryContext({role='lawyer',financial=false,error=null,override={}}={}){const calls=[],alerts=[],audits=[];const editable=compile('exports.roles = '+declaration('app/advisory/page.tsx','editableRoles'),{}).roles;return {calls,alerts,audits,context:{canEditAdvisory:editable.includes(role),canViewAdvisoryFinancials:financial,isEditing:false,form:{...form,...override},alert:m=>alerts.push(m),setSaving:()=>{},setErrorText:()=>{},resetForm:()=>{},loadData:async()=>{},createAuditLog:async a=>audits.push(a),supabase:{rpc:async(n,a)=>{calls.push({n,a});return {data:error?null:{id:'matter-id',matter_no:'ADV-2026-012',title:'Fixture advisory'},error};},from:()=>{throw Error('Create must not use a separate table write');}}}};}
test('Case UI creator rules remain admin/partner/lawyer, while Assistant Lawyer edit and Staff task access remain',()=>{
 for(const role of ['admin','partner','lawyer'])assert.equal(permissions.buildPermissions({role}).canCreateCase,true);
 for(const role of ['assistant_lawyer','staff','viewer',''])assert.equal(permissions.buildPermissions({role,financial_access:true}).canCreateCase,false);
 assert.equal(permissions.buildPermissions({role:'assistant_lawyer'}).canEditCaseInfo,true);
 assert.equal(permissions.buildPermissions({role:'staff'}).canEditTasks,true);
});
test('Case confirmation calls one atomic create; uses committed identity and existing redirect',async()=>{
 const s=caseContext();await handler('app/cases/page.tsx','createCase',s.context)();
 assert.equal(s.calls.length,2);assert.equal(s.calls[0],'confirm');assert.deepEqual(JSON.parse(JSON.stringify(s.calls[1])),{n:'create_case_with_number',a:{p_client_id:client.id}});
 assert.deepEqual(s.routes,['/cases/52']);assert.match(s.alerts[0],/VP-2026-052/);
});
test('Case denied/cancelled create never reaches RPC; failure does not display an allocated number',async()=>{
 for(const options of [{allow:false},{confirm:false}]){const s=caseContext(options);await handler('app/cases/page.tsx','createCase',s.context)();assert(!s.calls.some(c=>typeof c==='object'));}
 const s=caseContext({error:{message:'Denied'}});await handler('app/cases/page.tsx','createCase',s.context)();assert.equal(s.routes.length,0);assert.match(s.alerts[0],/Create case failed/);assert(!s.alerts.join().includes('VP-2026-'));
});
test('Advisory existing creator roles, validated payload/defaults and Finance field decision are preserved',async()=>{
 for(const role of ['admin','partner','lawyer','assistant_lawyer']){
  const s=advisoryContext({role});await handler('app/advisory/page.tsx','saveMatter',s.context)();assert.equal(s.calls.length,1);const {n,a}=s.calls[0];assert.equal(n,'create_advisory_matter_with_number');
  assert.deepEqual(JSON.parse(JSON.stringify(a)),{p_client_id:client.id,p_title:'Fixture advisory',p_matter_type:'general_advisory',p_retainer_type:'no_retainer',p_status:'active',p_responsible_lawyer:'Fixture lawyer',p_start_date:'2026-09-26',p_end_date:null,p_monthly_retainer_amount:null,p_scope_of_work:'Fixture scope',p_note:'Fixture note'});
  assert.equal(s.audits.length,1);assert.equal(s.audits[0].newData.matter_no,'ADV-2026-012');
 }
 const privileged=advisoryContext({financial:true});await handler('app/advisory/page.tsx','saveMatter',privileged.context)();assert.equal(privileged.calls[0].a.p_monthly_retainer_amount,12000);
 for(const role of ['staff','viewer','']){const s=advisoryContext({role,financial:true});await handler('app/advisory/page.tsx','saveMatter',s.context)();assert.equal(s.calls.length,0);}
});
test('Advisory rejects invalid business fields before RPC; failed create never writes success audit',async()=>{
 for(const override of [{title:' '},{client_id:''},{matter_type:'other',matter_type_other:''},{monthly_retainer_amount:'bad'}]){const s=advisoryContext({override});await handler('app/advisory/page.tsx','saveMatter',s.context)();assert.equal(s.calls.length,0);assert.equal(s.alerts.length,1);}
 const s=advisoryContext({error:{message:'Denied'}});await handler('app/advisory/page.tsx','saveMatter',s.context)();assert.equal(s.audits.length,0);assert.match(s.alerts[0],/สร้างงานนอกคดีไม่สำเร็จ/);
});

test('Advisory edit retains direct UPDATE and preserves the existing hidden Finance field',async()=>{
 const s=advisoryContext();s.context.isEditing=true;s.context.form.id='existing-matter';s.context.matters=[{id:'existing-matter',monthly_retainer_amount:12000}];
 let saved;const chain={update:p=>{saved=p;return chain;},eq:()=>chain,select:()=>chain,maybeSingle:async()=>({data:{id:'existing-matter',...saved},error:null})};
 s.context.supabase.from=t=>{assert.equal(t,'advisory_matters');return chain;};
 await handler('app/advisory/page.tsx','saveMatter',s.context)();assert.equal(s.calls.length,0);assert.equal(Object.hasOwn(saved,'monthly_retainer_amount'),false);assert.equal(s.audits[0].action,'update');
});
