/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {useI18n}=require('../../lib/i18n/provider.tsx');
const field=workspaceFixture('app/advisory/control/JourneyVariantField.tsx',[],{'./shared':{useAdvisoryLabels(){const i=useI18n();return {...i,a:(key)=>i.t('advisory.'+key)};}}});
const definition=structuredClone(require('./fixtures/advisory-admin-journey-preview.json'));
definition.stages[1].outcomes.push({key:'follow',name_th:'ติดตามโดยตรง',name_en:'Follow up directly',target:'follow',requires_reason:false});
const variant={id:'branching',family_key:'general_advisory',active:true,is_default:false,revision:3,version:3,version_id:'version-v3',definition};
const simple={...variant,id:'simple',is_default:true,version:1,version_id:'version-v1',definition:{name_th:'มาตรฐาน',name_en:'Standard',stages:definition.stages.filter(s=>!s.conditional).map(({key,name_th,name_en,required})=>({key,name_th,name_en,required}))}};
function render(locale,selected='branching',variants=[simple,variant]){return field.render(locale,{'JourneyVariantField.variants':variants,'JourneyVariantField.selected':selected,'JourneyVariantField.loading':false},{family:variant.family_key});}
function row(html,key){return html.match(new RegExp('<li data-preview-stage="'+key+'">([\\s\\S]*?)(?=<li data-preview-stage=|</ol>)'))?.[1];}
for(const locale of ['th','en']){
 test(locale+': selected v3 derives exact branch counts and every target from that version',()=>{
  const before=JSON.stringify(variant),html=render(locale);assert.match(html,/data-journey-preview="version-v3"/);assert.match(html,/v3/);
  assert.ok(row(html,'collect').includes(locale==='th'?'2 ทางเลือก':'2 choices'));assert.ok(row(html,'execution').includes(locale==='th'?'3 ทางเลือก':'3 choices'));
  assert.ok(row(html,'additional').includes(locale==='th'?'ขั้นตอนตามเงื่อนไข':'Conditional stage'));assert.ok(row(html,'close').includes(locale==='th'?'ขั้นตอนสุดท้าย':'Final stage'));assert.ok(row(html,'intake').includes(locale==='th'?'เส้นทางปกติ':'Normal route'));
  for(const stage of [definition.stages[1],definition.stages[3]])for(const o of stage.outcomes){assert.ok(row(html,stage.key).includes(o[locale==='th'?'name_th':'name_en']));assert.ok(row(html,stage.key).includes(definition.stages.find(s=>s.key===o.target)[locale==='th'?'name_th':'name_en']));}
  assert.equal((html.match(/<details/g)||[]).length,3);assert.doesNotMatch(html,/<details[^>]* open/);assert.doesNotMatch(html,/<svg/);assert.equal(JSON.stringify(variant),before);
 });
 test(locale+': switching to a simple FJ-1 variant removes branch details and keeps selected form identifier exact',()=>{
  const html=render(locale,'simple');assert.match(html,/data-journey-preview="version-v1"/);assert.doesNotMatch(html,/data-journey-preview="version-v3"/);assert.equal((html.match(/<details/g)||[]).length,1);assert.ok(row(html,'collect').includes(locale==='th'?'เส้นทางปกติ':'Normal route'));assert.match(html,/type="radio"[^>]*checked=""[^>]*value="version-v1"/);
  const sole=render(locale,'simple',[simple]);assert.match(sole,/type="hidden" name="journey_version_id" value="version-v1"/);assert.doesNotMatch(sole,/type="radio"/);
 });
 test(locale+': conditional branching still exposes its count and labels are escaped safely',()=>{
  const d=structuredClone(definition);d.stages[4].outcomes.push({key:'unsafe',name_th:'<script>alert(1)</script>',name_en:'<script>alert(1)</script>',target:'close',requires_reason:false});const html=render(locale,'branching',[{...variant,definition:d}]);const r=row(html,'additional');assert.ok(r.includes(locale==='th'?'2 ทางเลือก':'2 choices'));assert.ok(r.includes(locale==='th'?'ขั้นตอนตามเงื่อนไข':'Conditional stage'));assert.match(r,/&lt;script&gt;/);assert.doesNotMatch(r,/<script>/);
 });
}
