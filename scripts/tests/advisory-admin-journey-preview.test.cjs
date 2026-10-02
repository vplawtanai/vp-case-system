/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {previewContinuation,previewClosingPath}=require('../../app/admin/journey-templates/preview-routes.ts');
const {journeyText:t}=require('../../app/admin/journey-templates/labels.ts');
const definition=require('./fixtures/advisory-admin-journey-preview.json');
const preview=workspaceFixture('app/admin/journey-templates/JourneyPreview.tsx');
const execution=definition.stages[3];
test('focused preview follows actual sole outcomes and stops at the next user choice',()=>{
 const result=previewContinuation(definition,definition.stages[0],'collect');
 assert.deepEqual(result.steps.map(x=>x.stage.key),['analysis','execution']);assert.equal(result.end,'choice');
 const close=previewContinuation(definition,execution,'follow');assert.deepEqual(close.steps.map(x=>x.stage.key),['close']);assert.equal(close.end,'close');
});
test('return routes are explicit, finite and do not reopen or mutate visits or definitions',()=>{
 const before=JSON.stringify(definition),loop=previewContinuation(definition,execution,'additional');assert.equal(loop.end,'return');assert.deepEqual(loop.steps.map(s=>s.stage.key),['execution']);assert.equal(JSON.stringify(definition),before);
 const self=structuredClone(definition);self.stages[4].outcomes[0].target='additional';assert.equal(previewContinuation(self,self.stages[4],'additional').end,'return');
});
test('closing path uses only configured outcomes; missing targets and trapped loops stay unresolved',()=>{
 const route=previewClosingPath(definition,'execution');assert.equal(route.at(-1).stage.key,'close');for(const hop of route)assert.equal(hop.stage.key,hop.outcome.target);
 const invalid=structuredClone(definition);invalid.stages[3].outcomes=[{...execution.outcomes[0],target:'execution'}];assert.equal(previewClosingPath(invalid,'execution'),null);
 assert.equal(previewContinuation(definition,execution,'missing').end,'missing');
});
for(const locale of ['th','en']){
 test(locale+': focused branches place every outcome beside its target/reason and label the conditional return',()=>{
  const html=preview.render(locale,{}, {definition,locale,selected:'execution',onSelect(){}});
  assert.equal((html.match(/data-route=/g)||[]).length,3);assert.ok(html.includes(t(locale,'choiceRoutes')));assert.ok(!html.includes(t(locale,'soleRoute')));
  assert.ok(html.includes(t(locale,'opensOnChoice')));assert.ok(html.includes(t(locale,'returnTo')+' 4'));assert.ok(html.includes(t(locale,'newVisit')));assert.ok(html.includes(t(locale,'reasonRequired')));assert.ok(html.includes(t(locale,'reasonOptional')));assert.ok(html.includes(t(locale,'reachesClose')));assert.ok(html.includes(t(locale,'exampleOnly')));assert.doesNotMatch(html,/stroke-dasharray|markerEnd=/);
 });
 test(locale+': changing selected stage shows the single continuous route and honest close behavior',()=>{
  const html=preview.render(locale,{}, {definition,locale,selected:'follow',onSelect(){}});assert.equal((html.match(/data-route=/g)||[]).length,1);assert.ok(html.includes(t(locale,'soleRoute')));assert.ok(!html.includes(t(locale,'choiceRoutes')));
  const close=preview.render(locale,{}, {definition,locale,selected:'close',onSelect(){}});assert.ok(close.includes(t(locale,'closingSeparate')));assert.doesNotMatch(close,/data-route=/);
 });
}
