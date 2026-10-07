/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const H=require('./advisory-archive-artifacts.cjs');
const read=p=>fs.readFileSync(path.join(H.root,p),'utf8');
const paths=['app/dashboard/page.tsx','app/calendar/page.tsx','app/advisory/reports/page.tsx','app/reports/daily-workload/page.tsx','app/reports/workload-summary/page.tsx','app/workload/office-work/page.tsx','app/clients/page.tsx','app/advisory/control/MatterTime.tsx','app/advisory/control/MatterNextAction.tsx','app/advisory/control/MatterEditor.tsx','app/advisory/control/MatterWorkflowDialog.tsx','lib/client-workspace-read.ts'];
test('reviewed allowlist is exact, independent of names/dates/origin and never includes protected Matters',()=>{
 assert.equal(new Set(H.reviewed.targets.map(t=>t.id)).size,11);assert.equal(H.reviewed.targets[0].id,'8f375864-0fb3-4d17-9e07-d4f6d76cf4fe');assert.equal(H.reviewed.targets[10].id,'8cf4af68-18cd-415f-a56e-578e4ccaa2d1');
 for(const t of H.reviewed.targets){assert.match(t.id,/^[0-9a-f-]{36}$/);assert.ok(!H.reviewed.protected_numbers.includes(t.matter_no));}
});
test('all normal direct Advisory reads use the shared DB views, including independently loaded children',()=>{
 for(const p of paths){const s=read(p);assert.match(s,/advisoryOperational/);assert.doesNotMatch(s,/\.from\(['"]advisory_(matters|issues|issue_tasks|time_logs|advice_records)['"]\)\s*\.select\(/,p);}
 for(const key of ['matters','issues','tasks'])assert.match(read('app/calendar/page.tsx'),new RegExp('advisoryOperational\\.'+key));
 for(const key of ['matters','issues','tasks','time'])assert.match(read('app/dashboard/page.tsx'),new RegExp('advisoryOperational\\.'+key));
 assert.match(read('lib/client-workspace-read.ts'),/linkedRows<ClientTask>\(db,advisoryOperational.tasks/);
 assert.match(read('lib/advisory-legacy-archive.ts'),/new_creation.kind/,'Legacy origin semantics remain separate');
});
test('only RPC relation reads change; workflow formulas, permissions and output shapes remain identical',()=>{
 const core=H.core();for(const sig of H.changedFunctions){const original=H.G.afterContract.functions[sig].definition;const updated=original.replaceAll(/(from|join) public\.advisory_matters\b/gi,'$1 public.advisory_operational_matters');assert.ok(core.includes(updated));}
 assert.ok(!H.changedFunctions.some(s=>s.startsWith('advisory_control_write')));
 for(const view of Object.values(H.views))assert.match(core,new RegExp('CREATE VIEW public\\.'+view+' WITH \\(security_invoker=true,security_barrier=true\\)'));
 assert.match(core,/BEFORE INSERT OR UPDATE OR DELETE ON public.advisory_time_logs/);
});
test('Finance/history reads, normal Time insert and FJ writes stay canonical',()=>{
 assert.match(read('app/advisory/control/MatterTime.tsx'),/from\('advisory_time_logs'\)\.insert\(payload\)/);
 for(const p of ['app/finance/treasury/movement-label-data.ts','app/finance/expenses/data.ts','app/api/finance/quotations/[id]/pdf/route.ts']){assert.match(read(p),/advisory_matters/);assert.doesNotMatch(read(p),/advisoryOperational|advisory_operational/);}
 assert.match(read('lib/server/advisory-artwork.ts'),/caller.rpc\('advisory_control_read'/);
 assert.doesNotMatch(H.core(),/disable trigger|session_replication_role|delete from public\.(advisory|case|finance)|update public\.advisory_matters/i);
});
test('Apply stays fail-closed until exact baseline plus explicit Admin is bound; no first-Admin guess',()=>{
 const sql=H.applySql();assert.match(sql,/HUMAN_BASELINE_AND_ACTOR_NOT_BOUND/);assert.match(sql,/SET LOCAL ROLE authenticated/);assert.doesNotMatch(sql,/select.*from user_profiles.*limit 1/i);
 assert.throws(()=>H.applySql({rows_sha256:'bad'}));
 const p={candidate_sha256:H.A.hash(H.migration()),rows_sha256:'1'.repeat(64),preserved_sha256:'2'.repeat(64),targets_sha256:'3'.repeat(64),admin_id:'00000000-0000-4000-8000-000000000001',request_id:'00000000-0000-4000-8000-000000000002'};
 const applied=H.applySql(p);assert.equal((applied.match(/^BEGIN;/gm)||[]).length,1);assert.equal((applied.match(/^COMMIT;/gm)||[]).length,1);
 assert.ok(applied.indexOf('CREATE FUNCTION public.advisory095_archive_uat(')<applied.indexOf('SELECT public.advisory095_archive_uat('));
});
