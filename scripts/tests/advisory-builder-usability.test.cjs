/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {builderDraft,arrangeDraft,canRemoveStage,addDraftChoice}=require('../../app/admin/journey-templates/draft-routes.ts');
const {journeyIssues}=require('../../lib/advisory-journey-presentation.ts');
const {previewIncoming}=require('../../app/admin/journey-templates/preview-routes.ts');
const {journeyText:t}=require('../../app/admin/journey-templates/labels.ts');
const definition=require('./fixtures/advisory-admin-journey-preview.json');
const linear=()=>builderDraft({...definition,stages:definition.stages.filter(s=>!s.conditional).map(({key,name_th,name_en,required})=>({key,name_th,name_en,required})),format:undefined});
test('new draft prepares every normal route; published source remains unchanged',()=>{
 const before=JSON.stringify(definition),draft=builderDraft(definition);draft.stages[0].name_en='Changed';assert.equal(JSON.stringify(definition),before);
 const d=linear();assert.equal(d.format,2);assert.deepEqual(journeyIssues(d),[]);d.stages.forEach((s,i)=>assert.equal(s.outcomes[0]?.target,d.stages[i+1]?.key));assert.deepEqual(d.stages.at(-1).outcomes,[]);
});
test('insertion, reorder and removal keep ordinary routes connected without manual Continue setup',()=>{
 let d=linear(),stages=[...d.stages];stages.splice(-1,0,{key:'new',name_th:'New',name_en:'New',required:true});d=arrangeDraft(d,stages);
 assert.equal(d.stages.at(-3).outcomes[0].target,'new');assert.equal(d.stages.at(-2).outcomes[0].target,'close');assert.deepEqual(journeyIssues(d),[]);
 stages=[...d.stages];[stages[1],stages[2]]=[stages[2],stages[1]];d=arrangeDraft(d,stages);assert.equal(d.stages[0].outcomes[0].target,'analysis');assert.equal(d.stages[1].outcomes[0].target,'collect');assert.deepEqual(journeyIssues(d),[]);
 assert.equal(canRemoveStage(d,'collect'),true);d=arrangeDraft(d,d.stages.filter(s=>s.key!=='collect'));assert.deepEqual(journeyIssues(d),[]);assert.equal(canRemoveStage(d,d.stages[0].key),false);assert.equal(canRemoveStage(d,'close'),false);
});
test('explicit outcomes, loops and required reasons never get silently rewritten by ordering helpers',()=>{
 const d=structuredClone(definition),before=structuredClone(d.stages[3].outcomes),loop=structuredClone(d.stages[4].outcomes);
 const changed=arrangeDraft(d,[...d.stages.slice(0,-1),{key:'new',name_th:'New',name_en:'New',required:true},d.stages.at(-1)]);
 assert.deepEqual(changed.stages[3].outcomes,before);assert.deepEqual(changed.stages[4].outcomes,loop);assert.equal(canRemoveStage(d,'additional'),false);assert.equal(canRemoveStage(d,'execution'),false);
 const custom=linear();custom.stages[0].outcomes[0].requires_reason=true;const reordered=arrangeDraft(custom,[custom.stages[0],custom.stages[2],custom.stages[1],...custom.stages.slice(3)]);assert.deepEqual(reordered.stages[0].outcomes,custom.stages[0].outcomes);
});
test('conditional stage does not become part of automatic normal route; missing incoming route fails validation',()=>{
 const d=linear(),changed=arrangeDraft(d,d.stages.map(s=>s.key==='analysis'?{...s,conditional:true}:s));assert.equal(changed.stages[1].outcomes[0].target,'execution');assert.ok(journeyIssues(changed).some(i=>i.stage==='analysis'));assert.equal(previewIncoming(changed,'analysis').length,0);
});
test('branching changes only the clicked stage; retains normal choice and leaves errors local until completed',()=>{
 const d=linear(),changed=addDraftChoice(d,'collect','choice-new');assert.equal(changed.stages[1].outcomes.length,2);assert.deepEqual(changed.stages[1].outcomes[0],d.stages[1].outcomes[0]);assert.deepEqual(changed.stages.filter(s=>s.key!=='collect'),d.stages.filter(s=>s.key!=='collect'));assert.ok(journeyIssues(changed).some(i=>i.stage==='collect'));assert.equal(d.stages[1].outcomes.length,1);
 assert.deepEqual(addDraftChoice(d,'close','bad'),d);
});
test('conditional explanation includes every configured incoming route and its source',()=>{
 const d=structuredClone(definition);d.stages[2].outcomes.push({key:'other',name_th:'Other',name_en:'Other',target:'additional',requires_reason:true});assert.deepEqual(previewIncoming(d,'additional').map(x=>[x.stage.key,x.outcome.key]),[['analysis','other'],['execution','information']]);
});
const editor=workspaceFixture('app/admin/journey-templates/JourneyRoutingEditor.tsx');
for(const locale of ['th','en'])test(locale+': every nonterminal stage has its own branch action; statuses and conditional sources are visible',()=>{
 const html=editor.render(locale,{}, {definition,locale,selectedStage:'additional',onBranch(){}});
 assert.equal((html.match(/data-branch-stage=/g)||[]).length,6);assert.ok(html.includes(t(locale,'normalRoute')));assert.ok(html.includes('3 '+t(locale,'choices')));assert.ok(html.includes(t(locale,'lastStage')));assert.ok(html.includes(t(locale,'opensWhen')));assert.ok(html.includes(t(locale,'conditionalExplanation')));assert.match(html,/data-stage-editor="additional"/);assert.doesNotMatch(html,/<input|<select/);
});
