/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {buildPermissions,financeNavigationLinks,root}=require('./receipt-render-fixture.cjs');
const source=fs.readFileSync(root+'/lib/permissions.ts','utf8');
const flags=[...source.matchAll(/^  ((?:can_\w+|financial_access))\?:/gm)].map(m=>m[1]);
const all=Object.fromEntries(flags.map(f=>[f,true]));
// Frozen result matrix from released 8B.3 9dd39ee. Every role x (none/all/each
// individual flag) x (active/inactive/null). Hashes avoid copying the implementation.
const prior={partner:'3a89a2090772cac721308d18fa9f944cc3e582ae5d2b96e7b82f62178f819ed0',lawyer:'b9c59e4c314c87d9cf9227eb35b7a7778d8e004b8cde26e80691273cc53555f0',assistant_lawyer:'e5cae548b4ef066e03d49bc060c728ae455281beba2b3ae61fe1456bb1819d10',staff:'9cc5e08938c31a1ee9f51de38265766ec1208418a5361e81373dd562928229ae',viewer:'a27a4d9aca64715374df158f57c76b8fb66639c4bd35d2760fc837e5e3e47647','':'dc967745fe41326157d4010de59b06829fd57fedc297f21b1565a93b90483f2c'};
for(const [role,hash] of Object.entries(prior))test(`non-Admin ${role||'unknown'} capability matrix exactly matches 8B.3`,()=>{
 const matrix=[{},all,...flags.map(f=>({[f]:true}))].flatMap(bits=>[true,false,null].map(active=>buildPermissions({role,active,...bits})));
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(matrix)).digest('hex'),hash);
});
test('active Admin needs no explicit capability for any role-authorized surface/action',()=>{
 const input=Object.freeze({role:'admin',active:true,...Object.fromEntries(flags.map(f=>[f,false]))});
 const result=buildPermissions(input);for(const [key,value] of Object.entries(result))if(key.startsWith('can'))assert.equal(value,true,key);
 assert.ok(financeNavigationLinks(result).length>15);
 assert.ok(flags.every(f=>input[f]===false));
});
test('known inactive/null-active Admin receives no capabilities despite every flag being true',()=>{
 for(const active of [false,null]){const p=buildPermissions({role:'admin',active,...all});for(const [key,value]of Object.entries(p))if(key.startsWith('can'))assert.equal(value,false,key);assert.equal(financeNavigationLinks(p).length,0);}
});
test('role transitions preserve explicit Lawyer+ flags without promoting or clearing them',()=>{
 const flags={can_manage_finance_payments:true,can_issue_finance_receipts:true,can_confirm_finance_payments:false};
 const original=Object.freeze({role:'lawyer',active:true,...flags});const admin=Object.freeze({...original,role:'admin'});
 assert.equal(buildPermissions(original).canManageFinancePayments,true);assert.equal(buildPermissions(original).canConfirmFinancePayments,false);
 assert.equal(buildPermissions(admin).canConfirmFinancePayments,true);
 assert.deepEqual(buildPermissions({...admin,role:'lawyer'}),buildPermissions(original));assert.equal(admin.can_confirm_finance_payments,false);
});
test('Legacy bank lists give Admin precedence over partial account grants, preserving non-Admin filtering',()=>{
 for(const page of ['ledger','expense-claims']){const s=fs.readFileSync(root+`/app/finance/${page}/page.tsx`,'utf8');assert.match(s,/permissions\.role === "admin"\s*\? activeBankAccounts\s*: activeBankAccounts\.filter\(\(account\) => allowedBankIds\.has\(account\.id\)\)/);}
});
