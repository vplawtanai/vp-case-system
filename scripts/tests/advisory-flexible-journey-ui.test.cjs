/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const root=path.resolve(__dirname,'../..');
const {useI18n}=require('../../lib/i18n/provider.tsx'),{messages}=require('../../lib/i18n/catalog.ts');
const F=require('./advisory-flexible-journey-artifacts.cjs'),catalog=F.seed;
const lib=require('../../lib/advisory-flexible-journey.ts'),{stageState}=require('../../lib/advisory-control.ts');
const shared={useAdvisoryLabels(){const i=useI18n();return {...i,a:(k,p)=>i.t('advisory.'+k,p),label:(v,f)=>messages['advisory.stage.'+f+'.'+v]?i.t('advisory.stage.'+f+'.'+v):messages['advisory.enum.'+v]?i.t('advisory.enum.'+v):v||'—'};}};
const variant={id:'v1',family_key:'contract_business_documents',active:true,is_default:true,revision:1,version:1,version_id:'version1',definition:catalog.find(f=>f.family==='contract_business_documents').definition};
const field=workspaceFixture('app/advisory/control/JourneyVariantField.tsx',[],{'./shared':shared});
const admin=workspaceFixture('app/admin/journey-templates/JourneyTemplates.tsx',[],{'../../advisory/control/shared':shared,'./client':{journeyRequest(){throw Error('No network');}}});
const matter={id:'m',matter_no:'ADV-FJ-TEST',title:'Synthetic matter',stage_key:'intake',status:'active',version:1,template_key:variant.family_key};
const stages=variant.definition.stages.map((s,i)=>({...s,stage_key:s.key,template_key:variant.family_key,position:i,id:'s'+i,visits:i?[]:[{id:'v',kind:'visit',entered_at:'2026-10-01',exited_at:null}],minutes:null}));
const journey=workspaceFixture('app/advisory/control/Journey.tsx',[],{'./shared':shared});
const matterJourney=workspaceFixture('app/advisory/control/MatterJourney.tsx',[],{'./shared':shared,'./Journey':{default:()=>null},'../../components/DetailModal':{default:()=>null}});
for(const locale of ['th','en']){
 test(locale+': sole active default auto-selected; multiple choices only; inactive filtered out',()=>{
  assert.equal(lib.defaultVariant(lib.availableVariants([variant,{...variant,id:'off',active:false}],variant.family_key)).id,'v1');
  let html=field.render(locale,{'JourneyVariantField.variants':[variant],'JourneyVariantField.selected':'v1','JourneyVariantField.loading':false},{family:variant.family_key});assert.match(html,/name="variant_id" value="v1"/);assert.doesNotMatch(html,/type="radio"/);
  html=field.render(locale,{'JourneyVariantField.variants':[variant,{...variant,id:'v2',is_default:false}],'JourneyVariantField.selected':'v1','JourneyVariantField.loading':false},{family:variant.family_key});assert.equal((html.match(/type="radio"/g)||[]).length,2);assert.ok(html.includes(lib.journeyName(variant.definition,locale)));
 });
 test(locale+': Required has no Skip/Activate bypass; Optional is skippable; snapshot labels used',()=>{
  for(const index of [0,1,3]){const html=journey.render(locale,{}, {matter,stages,canEdit:true,onEdit(){},initialStage:stages[index].key});assert.ok(html.includes(lib.journeyName(stages[index],locale)));const skip=messages['advisory.skip'][locale];assert.equal(html.includes('>'+skip+'</button>'),index===3);assert.ok(!html.includes('>'+messages['advisory.activate'][locale]));}
  const custom=stages.map(s=>({...s,name_en:'Frozen '+s.name_en,name_th:'ชื่อคงเดิม '+s.name_th}));assert.ok(journey.render(locale,{}, {matter,stages:custom,canEdit:false,onEdit(){}}).includes(lib.journeyName(custom[0],locale)));
 });
 test(locale+': Matter snapshot exposes ordered Required/Optional rows and direct optional Skip controls',()=>{
  const snapshot={...variant,definition:variant.definition,captured_at:'2026-10-01T00:00:00Z'};
  const html=matterJourney.render(locale,{}, {matter,stages,snapshot,canEdit:true,onEdit(){},compact:true});
  assert.ok(html.includes('v1'));assert.equal((html.match(new RegExp('>'+messages['advisory.skip'][locale]+'</button>','g'))||[]).length,2);assert.ok(html.includes(messages['advisory.fjFrozen'][locale]));
 });
 test(locale+': Admin list/immutable publication editor exposes names, order and required flags',()=>{
  const base={'JourneyTemplates.variants':[variant],'JourneyTemplates.family':variant.family_key,'JourneyTemplates.loading':false};
  let html=admin.render(locale,base);assert.ok(html.includes(lib.journeyName(variant.definition,locale)));
  html=admin.render(locale,{...base,'JourneyTemplates.editing':true,'JourneyTemplates.selected':'v1','JourneyTemplates.draft':variant.definition});assert.equal((html.match(/type="checkbox"/g)||[]).length,7);assert.match(html,/type="checkbox"[^>]*disabled/);assert.ok(!html.includes('ADVISORY_'));
 });
}
test('current optional skip renders skipped, not completed; legacy state semantics unchanged',()=>{const visits=[{kind:'visit',exited_at:'2026-10-01',exit_reason:'skipped'},{kind:'skip'}];assert.equal(stageState({stage_key:'review',required:false,visits},null,false),'skipped');assert.equal(stageState({stage_key:'review',visits},null,false),'visited');});
function load(file,overrides={}){
 const full=path.resolve(root,file),box={exports:{},Response,Request,URL,console,process:{env:{}},require:n=>{if(n in overrides)return overrides[n];if(n==='server-only')return {};if(n.startsWith('.')){let p=path.resolve(path.dirname(full),n);if(!fs.existsSync(p))p+=fs.existsSync(p+'.ts')?'.ts':'.tsx';return load(p);}return require(n);}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:1,target:9,jsx:4,esModuleInterop:true}}).outputText,box);return box.exports;
}
const server=load('lib/server/advisory-journey.ts');
function fixture(profile={role:'admin',active:true,must_change_password:false}){const calls=[],caller={auth:{getUser:async()=>({data:{user:{id:'actor'}},error:null})},from:()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:profile})};return q;},rpc:async(n,args)=>{calls.push({n,args});return{data:{variants:[variant]},error:null};}};return{calls,caller,privileged(){throw Error('Privileged access forbidden');}};}
function request(f,b,origin='https://local.invalid'){return server.handleJourneyRequest(new Request('https://local.invalid/api/admin/journey-templates',{method:b?'POST':'GET',headers:{Authorization:'Bearer synthetic.token',Origin:origin},...(b?{body:JSON.stringify(b)}:{})}),f);}
test('Admin-only server API denies every other persona and inactive/password-required before catalog/write',async()=>{
 for(const profile of [{role:'partner',active:true},{role:'lawyer',active:true},{role:'staff',active:true},{role:'admin',active:false},{role:'admin',active:true,must_change_password:true}])for(const action of [undefined,'session','create','publish','configure']){const f=fixture({must_change_password:false,...profile});assert.equal((await request(f,action?{action}:undefined)).status,403);assert.equal(f.calls.length,0);}
 const f=fixture();f.caller.auth.getUser=async()=>({data:{user:null},error:{}});assert.equal((await request(f)).status,401);
});
test('scoped verified session and direct server page refuse unauthorized Admin; no service-role escalation',async()=>{
 const f=fixture(),response=await request(f,{action:'session'});assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Path=\/admin\/journey-templates/);assert.equal((await request(f,{action:'session'},'https://other.invalid')).status,403);
 const page=load('app/admin/journey-templates/page.tsx',{'next/headers':{cookies:async()=>({get:()=>({value:'synthetic'})})},'next/navigation':{notFound(){throw Error('DENIED');},redirect(){throw Error('REDIRECT');}},'../../../lib/server/advisory-journey':{JourneyAdminError:server.JourneyAdminError,journeyPageAllowed:async()=>{throw new server.JourneyAdminError('ADVISORY_FORBIDDEN',403);}},'./JourneyTemplates':{default:()=>null}});await assert.rejects(page.default(),/DENIED/);
});
test('API preserves revision/request identity and returns business rejection without success',async()=>{const f=fixture();await request(f,{action:'publish',id:'v1',revision:3,request_id:'stable',payload:{definition:variant.definition}});assert.equal(f.calls[0].args.p_expected_revision,3);assert.equal(f.calls[0].args.p_request_id,'stable');f.caller.rpc=async()=>({error:{message:'ADVISORY_CHANGED'}});const r=await request(f,{action:'publish'});assert.equal(r.status,409);assert.equal((await r.json()).error,'ADVISORY_CHANGED');});
test('gate artifacts are exact, SELECT-only gates and PG17/18-safe NOT NULL representation',()=>{
 assert.equal(fs.readFileSync(F.candidate,'utf8'),F.migration());assert.equal(fs.readFileSync(F.preflight,'utf8'),F.preflightSql());assert.equal(fs.readFileSync(F.verifier,'utf8'),F.verifierSql(JSON.parse(fs.readFileSync(F.pinsPath))));
 for(const sql of [F.preflightSql(),F.verifierSql()]){assert.match(sql,/^--[^\n]*\nWITH /);assert.match(sql,/a.attnotnull/);assert.match(sql,/contype<>'n'/);assert.match(sql,/collate "C"/i);assert.doesNotMatch(sql,/select public\.advisory_(control_write|journey_manage)\(/i);}
 const nav=fs.readFileSync(root+'/app/components/AppTopNav.tsx','utf8'),line=nav.split('\n').find(s=>s.includes('page: "journeyTemplates"'));assert.match(line,/isActiveAdmin\(profile\).*must_change_password === false/);assert.ok(nav.indexOf('title: t("common.nav.settings")')<nav.indexOf(line));
});
