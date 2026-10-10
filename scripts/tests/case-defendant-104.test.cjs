/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const A=require('./case-defendant-104-artifacts.cjs');

test('candidate and SELECT-only artifacts exactly match reviewed generator inputs',()=>{
 assert.equal(A.read(A.candidate),A.migration());
 assert.equal(A.read('scripts/sql/preflight_case_defendant_104.sql'),A.gate());
 assert.equal(A.read('scripts/sql/verify_case_defendant_104.sql'),A.gate(true));
 assert.deepEqual(JSON.parse(A.read('docs/core/evidence/case-defendant-104-object-diff.json')),A.objectDiff());
 for(const post of [false,true]){
  const executable=A.gate(post).replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''");
  assert.match(executable.trim(),/^WITH installed AS/);
  assert.doesNotMatch(executable,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|CALL|DO|PERFORM)\b/i);
  assert.doesNotMatch(executable,/auth\.users|case\d+_save\s*\(/);
 }
 assert.deepEqual(JSON.parse(A.read(A.reviewedPath)),{candidate_sha256:'011cb7ed70adf1fb66d30c1af81bbfe20e5c1a18f2e3e2849393b21f450fb486',accepted_contract_sha256:A.acceptedContractSha});
});

test('installation permits only template seed DML, and rejects legacy business DML injection',()=>{
 const candidate=A.read(A.candidate);assert.equal(A.additiveApplySql(candidate),true);
 for(const dml of ['UPDATE public.cases SET title=title;','DELETE FROM public.case_audit_logs;','INSERT INTO public.case_service_controls DEFAULT VALUES;','TRUNCATE public.case_deadlines;','CALL public.case102_save();'])assert.equal(A.additiveApplySql(candidate+'\n'+dml),false,dml);
 assert.match(candidate,/BEGIN;[\s\S]*COMMIT;\s*$/);
 assert.equal((candidate.match(/CREATE FUNCTION public.case104_/g)||[]).length,12);
 assert.equal((candidate.match(/CREATE TABLE public.case_/g)||[]).length,7);
 assert.doesNotMatch(candidate,/CREATE (?:OR REPLACE )?FUNCTION public.case(?:097|098|099|100|101|102|103)_/);
});

test('exact scope: seven new tables, four guarded existing tables, twelve additive functions, existing audit reused',()=>{
 const delta=A.objectDiff();
 assert.deepEqual(delta.filter(o=>o.kind==='tables'&&o.change==='modified').map(o=>o.name).sort(),['case_deadline_extensions','case_deadlines','case_flow_instances','case_service_controls']);
 assert.deepEqual(delta.filter(o=>o.kind==='tables'&&o.change==='added').map(o=>o.name).sort(),[...A.newTables].sort());
 assert.equal(delta.filter(o=>o.kind==='functions'&&o.change==='added').length,12);
 assert.equal(delta.filter(o=>o.kind==='functions'&&o.change!=='added').length,0);
 assert.equal(A.newTables.includes('case_defendant_events'),false);
 const sql=A.read('scripts/sql/case_defendant_104_contract.sql');
 assert.match(sql,/INSERT INTO public.case_service_events/);assert.match(sql,/INSERT INTO public.case_audit_logs/);
 const after=JSON.parse(A.read(A.afterPath));
 for(const name of ['case_service_events','case_service_attempts','cases','parties','case_audit_logs','case_flow_versions','case_flow_stages','case_flow_transitions','case_work_core','case_team_assignments'])assert.deepEqual(after.tables[name],A.accepted.tables[name],name);
 for(const [name,fn]of Object.entries(A.accepted.functions))assert.deepEqual(after.functions[name],fn,name);
});

test('immutable migrations 097–103 remain at their Human-approved SHA',()=>{
 const pins=[
 ['202610080097_case_security_parity','bddd266cc305bf676b4fe4564181035dee25db830b367c279f6bb79729d57db6'],
 ['202610080098_case_accountability_next_action','c9cf604b4e92eeb2dde685a00816cfc5770e7d02ba45a58ff76b744fee81570c'],
 ['202610080099_case_hearing_proceedings','3756a06a439210310ea6efb84003d5de1d722abadccb4f9e15e72834c03103f1'],
 ['202610080100_case_engagement_review','5680dee06e16a668cbb55784c69055c7f7c8447a30ed5d003be0474d58dda0f1'],
 ['202610090101_case_civil_flow_foundation','7e88a49065a7ebbd0c50c9514ec5608869291a7464218921233c2970a21d311c'],
 ['202610100102_case_civil_service','d88d3b513a9f574d7a03868e583fe0ead2a12056d95e6e621c853dde48df228e'],
 ['202610100103_case_service_result_facts','273a7bda67b81d0c581ebbb5cd6c68757ade0ebb8fe9301aaaa4cccccece7133']];
 for(const [name,sha]of pins)assert.equal(A.hash(A.read('supabase/migrations/'+name+'.sql')),sha,name);
});
