/* eslint-disable @typescript-eslint/no-require-imports */
require('./receipt-render-fixture.cjs');
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{test}=require('node:test'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {UiLocaleProvider}=require('../../lib/i18n/provider.tsx'),{FinanceEvidence}=require('../../app/finance/FinanceEvidence.tsx');
const {revealActiveNavigation}=require('../../app/components/sidebar-reveal.ts'),{treasuryOverview}=require('../../app/finance/treasury/dashboard.ts'),{TreasuryRelationship}=require('../../app/finance/treasury/relationship.tsx'),{fixture}=require('./treasury-dashboard-fixture.cjs');
const {lexical}=require('./receipt-sql-static.test.cjs'),{workflow,filenames,migrationPath}=require('./finance-hardening-artifacts.cjs');
const render=(locale,component)=>renderToStaticMarkup(React.createElement(UiLocaleProvider,{initialLocale:locale,pathname:'/finance/treasury'},component));
test('054 SELECT-only exact artifacts and rollback; no top-level business writes; 001-053 byte-identical',()=>{
 for(const [file,sql] of Object.entries(workflow()))assert.equal(fs.readFileSync(file,'utf8'),sql);
 for(const file of [filenames.pre,filenames.verify]){const s=lexical(fs.readFileSync(file,'utf8'));assert.equal(s.split(';').filter(x=>x.trim()).length,1);assert.doesNotMatch(s,/\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|call|do|copy|execute|into)\b/i);}
 const sql=fs.readFileSync(migrationPath,'utf8'),dry=fs.readFileSync(filenames.dry,'utf8');assert.equal(dry.split('-- BEGIN EMBEDDED MIGRATION 054\n')[1].split('-- END EMBEDDED MIGRATION 054')[0],sql);
 assert.match(lexical(dry).trim(),/^begin;/i);assert.match(lexical(dry).trim(),/rollback;$/i);assert.doesNotMatch(lexical(dry),/\bcommit\b/i);
 for(const s of lexical(sql).split(';'))assert.doesNotMatch(s.trim(),/^(insert|update|delete|merge|truncate|copy|select)\b/i);
 const ref='9281e7bd148a6c0aa30a18973cf79173706efb19',files=cp.execFileSync('git',['ls-tree','-r','--name-only',ref,'supabase/migrations'],{encoding:'utf8'}).trim().split('\n');
 files.push('app/finance/tax-position/dashboard-data.ts','app/finance/finance-navigation.ts','app/finance/FinanceSidebar.tsx');for(const file of files)assert.deepEqual(fs.readFileSync(file),cp.execFileSync('git',['show',ref+':'+file]),file);
});
for(const locale of ['th','en'])test(`054 ${locale}: monthly flow, stock, pre-cutoff and unknown components stay separate; raw evidence Admin-only`,()=>{
 const data=fixture(),before=JSON.stringify(data),flow={period_month:'2026-09-01',currency:'THB',receipt_count:5,cash:46419.81,pre_cutoff:16859.81,represented:29560,pending:0,unresolved:0};
 const html=render(locale,React.createElement(TreasuryRelationship,{data,flow,month:'2026-09',onMonth:()=>{}}));
 for(const amount of ['46,419.81','16,859.81','29,560.00','49,560.00','20,000.00'])assert.ok(html.includes(amount),amount);
 assert.deepEqual(treasuryOverview(data).components,[{currency:'THB',amount:20000,inflow:29560,outflow:0}]);assert.equal(JSON.stringify(data),before);
 assert.deepEqual(treasuryOverview({...data,accounts:[{...data.accounts[0],opening_amount:null}]}).components,[]);
 const payload={id:'private-uuid',source_contract:'unchanged'};
 for(const admin of [false,true]){const evidence=render(locale,React.createElement(FinanceEvidence,{title:'Evidence',isAdmin:admin,raw:payload},'Human summary'));assert.ok(evidence.includes('Human summary'));assert.equal(evidence.includes('private-uuid'),admin);assert.equal((evidence.match(/<details/g)||[]).length,admin?2:1);assert.doesNotMatch(evidence,/<details[^>]*\sopen/);}
 assert.deepEqual(payload,{id:'private-uuid',source_contract:'unchanged'});
});
test('054 sidebar nearest reveal affects nav only, reduced-motion is instant; no continuous scroll hook',()=>{
 const calls=[],active={getClientRects:()=>[{}],getBoundingClientRect:()=>({top:400,bottom:440})},nav={querySelector:()=>active,getBoundingClientRect:()=>({top:100,bottom:300}),scrollTop:50,scrollTo:x=>calls.push(x)};
 revealActiveNavigation(nav,false);assert.deepEqual(calls.pop(),{top:198,behavior:'smooth'});revealActiveNavigation(nav,true);assert.equal(calls.pop().behavior,'instant');
 active.getBoundingClientRect=()=>({top:120,bottom:160});revealActiveNavigation(nav,false);assert.equal(calls.length,0);
 const shell=fs.readFileSync('app/components/AppTopNav.tsx','utf8'),css=fs.readFileSync('app/components/AppSidebar.module.css','utf8');assert.match(shell,/revealActiveNavigation/);assert.doesNotMatch(shell,/onScroll=.*revealActive/);assert.match(css,/220ms/);assert.match(css,/prefers-reduced-motion:reduce/);
 const deadline=fs.readFileSync('app/finance/tax-position/filings/deadline-review.tsx','utf8');assert.doesNotMatch(deadline,/type="file"|textarea|dueEvidence/);assert.match(deadline,/isAdmin \? <Disclosure/);assert.match(deadline,/get_finance_tax_deadline/);
});
