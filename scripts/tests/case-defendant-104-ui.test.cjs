/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
require('./receipt-render-fixture.cjs');const React=require('react'),{workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const M=require('../../app/cases/[id]/defendant-model.ts'),{defendantText:T}=require('../../app/cases/[id]/defendant-labels.ts'),{fixture,filing,id}=require('./case-defendant-104-ui-fixture.cjs');
const modal={default:({children})=>React.createElement('section',{role:'dialog'},children)},clock={useCaseBusinessDate:()=> '2026-10-10'};
const component=workspaceFixture('app/cases/[id]/CaseDefendant.tsx',['DefendantDeadline'],{'./CaseEditModal':modal,'./DefendantEditor':{default:()=>null},'./use-case-business-date':clock});
const editor=workspaceFixture('app/cases/[id]/DefendantEditor.tsx',[],{'./CaseEditModal':modal,'./use-case-business-date':clock});
const props=context=>({caseId:1,context,canLegal:true,canRecord:true,onSaved(){},onReload(){}});
const noop=()=>{};
test('single and separate filings derive coverage, never the compatibility projection',()=>{
 const {data}=fixture();data.represented=data.represented.slice(0,1);data.represented[0].control.answer_filed_on='2026-09-01';assert.equal(M.flowReadiness(data).allFiled,false);
 data.filings=[filing(801,[1])];assert.equal(M.flowReadiness(data).readyForHearing,true);
 const many=fixture().data;many.filings=[filing(801,[1]),filing(802,[2])];assert.equal(M.filingsFor(many,id(201)).length,1);assert.equal(M.filingsFor(many,id(202)).length,1);assert.equal(M.filingsFor(many,id(203)).length,0);
});
test('joint filing has one identity; D1+D2 resolve without changing D3 facts or current stage',()=>{
 const {data}=fixture(),before=JSON.stringify(data.represented[2]);data.filings=[filing(801,[1,2])];
 assert.deepEqual(data.represented.map(r=>M.defendantObligation(data,r,'2026-10-10').filed),[true,true,false]);assert.equal(data.filings.length,1);assert.equal(JSON.stringify(data.represented[2]),before);assert.equal(data.flow.current_stage,'D-CIV-02');
});
test('three Party IDs keep deadline/extension independently; unconfirmed legacy never overdue',()=>{
 const {data}=fixture();data.represented[2].control.answer_deadline_id=null;
 assert.deepEqual(data.represented.map(r=>M.defendantObligation(data,r,'2026-10-10').days),[-11,22,null]);
 data.extension_groups=[{id:id(901),lifecycle:'granted',coverage:[{party_id:id(201),deadline_id:id(401)},{party_id:id(202),deadline_id:id(402)}]}];
 data.represented[0].deadline.current_due_date='2026-11-02';data.represented[1].deadline.current_due_date='2026-11-09';
 assert.deepEqual(data.represented.map(r=>M.defendantObligation(data,r,'2026-10-10').due),['2026-11-02','2026-11-09',null]);
});
test('void joint filing respects overlapping active filing, withdraw/re-add uses existing facts',()=>{
 const {data}=fixture();data.filings=[{...filing(801,[1,2]),lifecycle:'void'},filing(802,[1])];
 assert.deepEqual(data.represented.map(r=>M.filingsFor(data,r.party_id).length),[1,0,0]);data.represented[0].active=false;assert.equal(M.liveRepresentations(data).length,2);data.represented[0].active=true;assert.equal(M.filingsFor(data,id(201))[0].id,id(802));
 data.filings[1].coverage.push({party_id:id(202),coverage_version:0});assert.equal(M.filingsFor(data,id(202)).length,0);
});
test('D03 inconsistency depends on active filing coverage, not pending extensions',()=>{
 const {data}=fixture();data.flow.current_stage='D-CIV-03';data.filings=[filing(801,[1,2])];assert.equal(M.flowReadiness(data).inconsistent,true);assert.equal(data.flow.current_stage,'D-CIV-03');
 data.filings.push(filing(802,[3]));data.extension_groups=[{lifecycle:'pending',coverage:[{party_id:id(203)}]}];assert.equal(M.flowReadiness(data).readyForHearing,true);assert.equal(M.flowReadiness(data).inconsistent,false);
});
test('pending and granted extensions do not resolve unfiled obligations or block active filings',()=>{
 for(const lifecycle of ['pending','granted']){
  const {data}=fixture();data.extension_groups=[{id:id(901),lifecycle,coverage:[1,2,3].map(n=>({party_id:id(200+n)}))}];
  assert.equal(M.flowReadiness(data).readyForHearing,false);
  data.filings=[filing(801,[1,2,3])];const before=structuredClone(data);
  assert.equal(M.flowReadiness(data).allFiled,true);assert.equal(M.flowReadiness(data).readyForHearing,true);assert.equal(M.flowReadiness(data).pending.length,0);
  assert.deepEqual(data.represented.map(r=>M.defendantObligation(data,r,'2026-10-10').state),['filed','filed','filed']);assert.deepEqual(data,before);
 }
});
test('joint extension tracks D1 filed, D2 open and D3 filed independently without rewriting any facts',()=>{
 const {data}=fixture();data.filings=[filing(801,[1]),filing(802,[3])];data.extension_groups=[{id:id(901),lifecycle:'pending',coverage:[{party_id:id(201)},{party_id:id(202)}]}];
 const before=structuredClone(data),r=M.flowReadiness(data);
 assert.deepEqual(data.represented.map(p=>M.defendantObligation(data,p,'2026-10-10').state),['filed','open','filed']);assert.equal(r.readyForHearing,false);assert.equal(r.pending.length,1);assert.deepEqual(data,before);
 data.filings.push(filing(803,[2]));assert.equal(M.flowReadiness(data).readyForHearing,true);assert.equal(M.flowReadiness(data).pending.length,0);assert.deepEqual(data.extension_groups,before.extension_groups);
});
test('void or coverage correction reopens only uncovered parties, preserves extension facts and never rewinds D03',()=>{
 const {data}=fixture();data.flow.current_stage='D-CIV-03';data.filings=[filing(801,[1,2]),filing(802,[1]),filing(803,[3])];
 data.extension_groups=[{id:id(901),lifecycle:'pending',coverage:[{party_id:id(201)},{party_id:id(202)}]}];const extensionBefore=structuredClone(data.extension_groups);
 data.filings[0].lifecycle='void';assert.deepEqual(data.represented.map(r=>M.filingsFor(data,r.party_id).length),[1,0,1]);assert.equal(M.flowReadiness(data).inconsistent,true);
 data.filings[0].lifecycle='active';data.filings[0].coverage_version=2;data.filings[0].coverage.push({party_id:id(201),coverage_version:2});
 assert.equal(M.filingsFor(data,id(202)).length,0);assert.equal(M.flowReadiness(data).inconsistent,true);
 data.filings.push(filing(804,[2]));assert.equal(M.flowReadiness(data).inconsistent,false);assert.equal(M.flowReadiness(data).readyForHearing,true);
 assert.equal(data.flow.current_stage,'D-CIV-03');assert.deepEqual(data.extension_groups,extensionBefore);assert.equal(data.filings[0].coverage.length,3);
});
test('withdraw/re-add recomputes completion from existing coverage while retaining pending requests',()=>{
 const {data}=fixture();data.filings=[filing(801,[1,3])];data.extension_groups=[{id:id(901),lifecycle:'pending',coverage:[{party_id:id(202)}]}];const extensionBefore=structuredClone(data.extension_groups);
 data.represented[1].active=false;assert.equal(M.flowReadiness(data).readyForHearing,true);assert.equal(M.flowReadiness(data).pending.length,0);
 data.represented[1].active=true;assert.equal(M.flowReadiness(data).readyForHearing,false);assert.equal(M.flowReadiness(data).pending.length,1);
 data.filings.push(filing(802,[2]));data.represented[1].active=false;data.represented[1].active=true;assert.equal(M.flowReadiness(data).readyForHearing,true);assert.deepEqual(data.extension_groups,extensionBefore);assert.equal(data.filings.length,2);
});
test('TH/EN pending notices are per-party; D03 proposal is available after all file and Viewer stays read-only',()=>{
 const context=fixture();context.data.filings=[filing(801,[1,3])];context.data.extension_groups=[{id:id(901),lifecycle:'pending',requested_on:'2026-10-01',coverage:[{party_id:id(201)},{party_id:id(202)}]}];
 for(const lang of ['th','en']){
  const before=structuredClone(context),options={'CaseDefendant.localView':'answer'},html=component.render(lang,options,props(context));
  const portion=n=>html.match(new RegExp('data-extension-party="'+id(200+n)+'">([\\s\\S]*?)</div>'))?.[1];
  assert.ok(portion(1).includes(T('pendingFiled',lang)));assert.ok(!portion(2).includes(T('pendingFiled',lang)));assert.ok(html.includes(T('pendingExtension',lang)));assert.ok(html.includes(T('pendingReview',lang)));assert.ok(html.includes(T('pendingBlocked',lang)));assert.deepEqual(context,before);
  const complete=structuredClone(context);complete.data.filings.push(filing(802,[2]));
  const done=component.render(lang,options,props(complete));assert.ok(done.includes(T('awaitHearing',lang)));assert.ok(!done.includes(T('pendingReview',lang)));assert.ok(!done.includes(T('pendingBlocked',lang)));assert.ok(done.includes(T('pendingExtension',lang)));
  const viewer=component.render(lang,options,{...props(complete),canLegal:false,canRecord:false});assert.ok(viewer.includes(T('pendingFiled',lang)));for(const key of ['awaitHearing','grant','fileAnswer','manage','extension'])assert.ok(!viewer.includes(T(key,lang)+'<'),key);
  const form=editor.render(lang,{}, {...props(complete),edit:{kind:'flow_transition',targetStage:'D-CIV-03'},onClose:noop});assert.match(form,/<option value="D-CIV-03" selected="">/);assert.ok(form.includes(T('humanConfirm',lang)));
 }
});
test('transport retry freezes UUID, full data and concurrency tokens even if latest read changes',()=>{
 const context=fixture(),payload={id:id(801),parties:[id(201),id(202)],filed_on:'2026-10-01'};
 const a=M.prepareDefendantRequest(null,1,'filing_create',payload,context.data,0,[],()=>id(999));context.data.version++;context.data.represented[0].deadline.current_due_date='2026-12-01';
 const b=M.prepareDefendantRequest(a,1,'filing_create',payload,context.data,0,[],()=>{throw Error('Duplicate request');});assert.equal(a,b);assert.equal(b.p_versions.scope,1);assert.equal(b.p_versions.deadlines[id(401)].due,'2026-09-29');
 const c=M.prepareDefendantRequest(a,1,'filing_create',{...payload,note:'new'},context.data,0,[],()=>id(1000));assert.notEqual(c.p_request_id,a.p_request_id);
});
test('TH/EN summary, linked deadline and joint-filing form render names and one filing; Viewer has no mutation actions',()=>{
 const context=fixture();context.data.filings=[filing(801,[1,2])];
 for(const lang of ['th','en']){
  const html=component.render(lang,{},props(context));assert.match(html,/Local defendant 3/);assert.equal((html.match(/Local defendant 1/g)||[]).length>=2,true);assert.ok(html.includes(T('filings',lang)));assert.ok(!html.includes('>00000000-'));
  const viewer=component.render(lang,{}, {...props(context),canLegal:false,canRecord:false});for(const k of ['fileAnswer','manage','extension','start'])assert.ok(!viewer.includes(T(k,lang)+'<'),k);
  const deadline=component.render(lang,{}, {data:context.data,person:context.data.represented[0],onAnswer:noop},'DefendantDeadline');assert.ok(deadline.includes(T('filed',lang)));assert.equal((deadline.match(/<button/g)||[]).length,1);assert.ok(deadline.includes(T('goAnswer',lang)));
  const form=editor.render(lang,{'DefendantEditor.mode':'joint','DefendantEditor.parties':[id(201),id(202)]},{...props(context),edit:{kind:'filing'},onClose:noop});assert.ok(form.includes(T('joint',lang)));assert.ok(form.includes(T('counterclaimSeparate',lang)));assert.equal((form.match(/type="checkbox"[^>]*checked=""/g)||[]).length,2);
 }
});
test('Counterclaim-dependent void is visibly blocked; extension UI has individual resulting dates',()=>{
 const context=fixture();context.data.filings=[filing(801,[1,2])];context.data.counterclaims=[{...filing(901,[1,2]),filing_id:id(801)}];
 const blocked=editor.render('th',{}, {...props(context),edit:{kind:'filing_void',id:id(801)},onClose:noop});assert.ok(blocked.includes(T('error.dependency','th')));assert.match(blocked,/disabled="" type="submit"/);
 const ex=editor.render('en',{'DefendantEditor.parties':[id(201),id(202)],'DefendantEditor.granted':true},{...props(context),edit:{kind:'extension'},onClose:noop});assert.equal((ex.match(/New due date from the actual order/g)||[]).length,2);
});
test('only controlled 104 save performs writes; source regressions remain outside patch',()=>{
 const source=fs.readFileSync('app/cases/[id]/DefendantEditor.tsx','utf8');assert.equal((source.match(/supabase\.rpc\('case104_save'/g)||[]).length,1);assert.doesNotMatch(source,/\.insert\(|\.update\(|\.delete\(|case(?:101|102|103)_save/);assert.match(source,/lock\.current/);assert.match(source,/if\(!uncertain\)/);assert.match(source,/setUncertain\(key==='uncertain'\)/);
 const view=fs.readFileSync('app/cases/[id]/CaseProcedure.tsx','utf8');assert.match(view,/mainTemplate!==DEFENDANT_TEMPLATE/);assert.match(view,/<CaseFlow/);assert.match(view,/<CaseService/);
});
