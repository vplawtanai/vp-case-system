/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),ts=require('typescript'),React=require('react');
const {buildPermissions,financeNavigationLinks}=require('./receipt-render-fixture.cjs');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const A=require('./finance-authority-artifacts.cjs');
const flags=Object.fromEntries([...fs.readFileSync('lib/permissions.ts','utf8').matchAll(/^  ((?:can_\w+|financial_access))\?:/gm)].map(m=>[m[1],true]));
for(const role of ['admin','partner','lawyer','assistant_lawyer','staff','viewer'])for(const operator of [false,true])test(`078 ${role} operator=${operator}: bundle, ceilings and navigation`,()=>{
 const p=buildPermissions({role,active:true,finance_operator:operator,...flags});
 const admin=role==='admin',op=operator&&['lawyer','assistant_lawyer','staff'].includes(role),operational=admin||role==='partner'||op;
 for(const k of ['canConfirmFinancePayments','canReverseFinancePayments','canManageFinanceCashTransactions','canConfirmFinanceCashTransactions','canReverseFinanceCashTransactions','canVoidFinanceReceipts'])assert.equal(p[k],admin,k);
 assert.equal(p.canViewFinanceQuotations,operational);assert.equal(p.canFileFinanceTax,admin||op);assert.equal(p.canViewFinanceDistribution,admin||role==='partner');
 for(const locale of ['th','en']){const links=financeNavigationLinks(p,locale);assert.equal(links.some(x=>x.page==='revenue-distribution'),admin||role==='partner');assert.equal(links.some(x=>x.page==='tax-position'),operational);assert.equal(links.some(x=>x.page==='participant-payments'),role!=='viewer');assert.equal(links.some(x=>x.page==='overview'),admin||role==='partner');}
});
for(const role of ['admin','partner','lawyer','staff'])test(`078 ${role}: inactive and forced-change sessions receive no Finance capability`,()=>{
 for(const patch of [{active:false},{active:null},{active:true,must_change_password:true}]){const p=buildPermissions({role,finance_operator:true,...flags,...patch});assert.equal(financeNavigationLinks(p).length,0);assert.equal(p.canExecuteParticipantPayments,false);}
});
test('078 active Case/Office role behavior unchanged; Finance assignment never rewrites old flags',()=>{
 const old={};new Function('exports',ts.transpileModule(cp.execFileSync('git',['show','HEAD:lib/permissions.ts'],{encoding:'utf8'}),{compilerOptions:{module:1,target:9}}).outputText)(old);
 const keys=['canViewCases','canCreateCase','canEditCaseInfo','canEditParties','canEditTimeline','canEditJudgments','canEditEnforcement','canEditDeadlines','canEditTasks','canEditNotes','canEditTimeLogs','canSubmitOfficeWorkLog','canEditOfficeWorkLogs'];
 for(const role of ['admin','partner','lawyer','assistant_lawyer','staff','viewer']){const profile=Object.freeze({role,active:true,...flags}),prior=old.buildPermissions(profile);for(const op of [false,true]){const p=buildPermissions({...profile,finance_operator:op});for(const k of keys)assert.equal(p[k],prior[k],role+' '+k);}assert.equal(profile.can_confirm_finance_payments,true);}
});
const users=workspaceFixture('app/admin/users/page.tsx',[],{'../../components/DetailModal':{default:({open,children})=>open?React.createElement('section',{role:'dialog'},children):null}});
const payments=workspaceFixture('app/finance/participant-payments/page.tsx',['Payments'],{'../quotations/shared':{},'../FinanceSubNav':{default:()=>null},'../revenue-distribution/participant-payment':{ParticipantPayment:()=>null}});
for(const locale of ['th','en'])test(`078 ${locale}: own compensation read-only vs minimal operator payment action`,()=>{
 const rows=[{id:'e',distribution_id:'d',recipient_name:'Synthetic Recipient',gross_amount:1000,currency:'THB',status:'open',paid_on:null}];
 const render=can_execute=>payments.render(locale,{'Payments.data':{access:{can_read:true,can_execute},rows},'Payments.legacy':[]},{},'Payments');
 const self=render(false),operator=render(true),pay=locale==='th'?'จ่ายส่วนแบ่ง':'Pay participant';
 assert.ok(self.includes(locale==='th'?'ส่วนแบ่งของฉัน':'My compensation'));assert.ok(!self.includes('>'+pay+'</button>'));assert.ok(operator.includes('>'+pay+'</button>'));assert.doesNotMatch(operator,/formula|Formula|สูตร/);
});
for(const locale of ['th','en'])test(`078 ${locale} Admin assignment is one checkbox plus existing account-authority link`,()=>{
 const person={id:'synthetic-user',email:'fixture@example.invalid',full_name:'Synthetic User',role:'lawyer',active:true,account_type:'operational',assignable:false,finance_operator:true};
 const html=users.render(locale,{'UsersPage.actor':'synthetic-admin','UsersPage.loading':false,'UsersPage.users':[person],'UsersPage.original':person,'UsersPage.form':person});
 assert.ok(html.includes(locale==='th'?'ผู้ปฏิบัติงานการเงิน':'Finance Operator'));assert.match(html,/href="\/finance\/expenses\/accounts"/);assert.match(html,/<details[^>]*><summary>สิทธิ์เพิ่มเติม/);
 const admin=users.render(locale,{'UsersPage.actor':'synthetic-admin','UsersPage.loading':false,'UsersPage.original':{...person,role:'admin'},'UsersPage.form':{...person,role:'admin'}});assert.doesNotMatch(admin,/href="\/finance\/expenses\/accounts"/);
});
test('078 route guards and safe payment path use derived bundles',()=>{
 for(const p of ['app/finance/revenue-distribution/page.tsx','app/finance/revenue-distribution/[sourceType]/[id]/page.tsx'])assert.match(fs.readFileSync(p,'utf8'),/canViewFinanceDistribution/);
 assert.match(fs.readFileSync('app/finance/participant-payments/page.tsx','utf8'),/canViewOwnCompensation/);
 assert.doesNotMatch(fs.readFileSync('app/finance/participant-payments/page.tsx','utf8'),/get_finance_revenue_distribution|formula_catalog/);
 assert.match(fs.readFileSync('app/finance/direct-money/[id]/page.tsx','utf8'),/canConfirm && row.status === "draft"/);
 for(const p of ['app/finance/direct-money/[id]/page.tsx','app/finance/payments/[id]/page.tsx'])assert.match(fs.readFileSync(p,'utf8'),/canViewDistribution &&/);
 assert.match(fs.readFileSync('app/finance/expenses/forms.tsx','utf8'),/access\.can_record && row\.status === "accepted"/);
});
test('078 artifacts immutable predecessors, deterministic definitions and reviewed Production binding',()=>{
 assert.equal(A.validate(),A.sha(fs.readFileSync(A.candidate)));assert.equal(A.candidateSql(),A.candidateSql());
 for(const p of [A.preflight,A.verifier]){const s=fs.readFileSync(p,'utf8').replace(/^--.*$/gm,'');assert.match(s,/^\s*WITH captured/);assert.doesNotMatch(s,/\b(?:INSERT INTO|UPDATE public|DELETE FROM|ALTER TABLE|CREATE FUNCTION|DO \$|CALL )/i);assert.ok(Buffer.byteLength(s)<180000);assert.match(s,/COLLATE "C"/);}
 assert.deepEqual(A.reviewedPreflight,{
  candidate_sha256:'b54d1eb36bba029289eaaea226fa5ab57a5e42710114893ed38d80867e00bc7c',
  rows_sha256:'751daa38ea6138c64943910d142cfd6955cf6fb62caa1f515ea3e3d219d3ecc1',
  preserved_sha256:'86815007700473fe68ed04d66bb3d0d44730a56c87995fa0a3bb26ed215c6d1f',
 });
 const verifier=fs.readFileSync(A.verifier,'utf8');
 assert.equal(A.sha(fs.readFileSync(A.candidate)),A.reviewedPreflight.candidate_sha256);
 assert.equal(verifier,A.readGate(true));
 assert.ok(verifier.includes("'reviewed_baseline_bound','"+A.reviewedPreflight.rows_sha256+"' IS NOT NULL AND '"+A.reviewedPreflight.preserved_sha256+"' IS NOT NULL"));
 assert.match(verifier,/false broader_finance_differences_accepted/);
 // Removing a pin still produces a fail-closed gate, never fixture substitution.
 assert.match(A.readGate(true,{}),/'reviewed_baseline_bound',NULL::text IS NOT NULL/);
 assert.throws(()=>A.readGate(true,{rows_sha256:'not-a-sha'}),/Invalid rows_sha256/);
});
