/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'../..');
function load(file){const full=path.resolve(root,file);if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full));const box={exports:{},Response,Request,URL,Date,performance,console,process:{env:{}},require:n=>{if(n==='server-only')return {};if(n.startsWith('.')){const p=path.resolve(path.dirname(full),n);return load(fs.existsSync(p)?p:p+'.ts');}return require(n);}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:1,target:9,esModuleInterop:true}}).outputText,box);return box.exports;}
const app=load('lib/server/advisory-artwork.ts'),map=load('lib/advisory-journey-artwork.ts'),config=require('../../lib/advisory-journey-artwork-config.json'),catalog=require('../../lib/advisory-journey-catalog.json');
const id='00000000-0000-4000-8000-000000000001',key=config.families.general_advisory,master=`${id}/${id}/${id}/master.webp`;
function fixture(options={}){
 const calls=[],snapshot={family_key:options.family||'general_advisory',definition:{stages:Array.from({length:options.count||7},(_,i)=>({key:'s'+i}))}};
 const result=options.noSnapshot?null:snapshot;
 return {calls,caller:{auth:{getUser:async()=>({data:{user:options.noUser?null:{id}},error:null})},rpc:async(n,p)=>{calls.push(['caller',n,p]);return options.denied?{error:{message:'ADVISORY_FORBIDDEN'}}:{data:{items:options.missing?[]:[{id}],journey_snapshot:result},error:null};}},privileged:()=>{calls.push(['privileged']);return {rpc:async(n,p)=>{calls.push(['server',n,p]);return options.rpcError?{error:{message:'sensitive'}}:{data:{artwork_key:map.journeyArtworkKey(snapshot.family_key),master_path:master,width:1600,height:1000,admin_notes:'secret',...options.asset},error:null};},storage:{from:b=>({createSignedUrl:async(p,seconds)=>{calls.push(['signed',b,p,seconds]);return options.signError?{error:{message:'secret storage'}}:{data:{signedUrl:'https://storage.invalid/exact-master?token=synthetic'},error:null};}})}};}};
}
async function request(f,query='matter_id='+id,token=true){const r=await app.handleJourneyArtwork(new Request('https://example.invalid/api/advisory/journey-artwork?'+query,{headers:token?{Authorization:'Bearer test'}:{}}),f);return {status:r.status,body:await r.json(),headers:r.headers};}
test('Matter authorization precedes all privileged work; no-user, inaccessible and missing Matter denied',async()=>{
 for(const opts of [{noUser:true},{denied:true},{missing:true}]){const f=fixture(opts),r=await request(f);assert.ok([401,403].includes(r.status));assert.equal(r.body.artwork,null);assert.ok(!f.calls.some(c=>c[0]==='privileged'));}
 assert.equal((await request(fixture(),undefined,false)).status,401);
});
test('browser cannot choose artwork or enumerate IDs/extra parameters',async()=>{
 for(const query of ['asset_code='+key,'matter_id='+id+'&asset_code='+key,'matter_id='+id+'&matter_id='+id,'matter_id=bad']){const f=fixture(),r=await request(f,query);assert.equal(r.status,400);assert.deepEqual(f.calls,[]);}
});
test('all families use the frozen family identity; narrow output, no metadata leak, 180s signature, no caching',async()=>{
 for(const family of catalog.families.map(f=>f.key).concat('unknown_family')){
  const f=fixture({family,count:6}),r=await request(f);assert.equal(r.status,200);assert.equal(r.body.artwork.code,map.journeyArtworkKey(family));assert.deepEqual(Object.keys(r.body.artwork).sort(),['code','expires_at','height','url','width']);assert.ok(r.body.artwork.expires_at>Date.now()+175000&&r.body.artwork.expires_at<=Date.now()+180000);assert.match(r.headers.get('cache-control'),/no-store/);assert.match(r.headers.get('server-timing'),/^auth;dur=[0-9.]+, matter;dur=[0-9.]+, family;dur=[0-9.]+, artwork;dur=[0-9.]+, sign;dur=[0-9.]+$/);
  assert.equal(f.calls[0][1],'advisory_control_read');assert.equal(f.calls[2][1],'journey_artwork094_read');assert.equal(f.calls[2][2].p_artwork_key,r.body.artwork.code);assert.deepEqual(f.calls[3],['signed','vp-visual-assets',master,180]);
 }
 for(const type of catalog.work_types)assert.ok(config.families[type.family],type.key);
});
test('missing/unavailable/wrong metadata/expired storage capability never leaks admin failures or wrong universal fallback',async()=>{
 for(const opts of [{rpcError:true},{signError:true},{noSnapshot:true},{count:9},{asset:{artwork_key:config.families.universal}},{asset:{master_path:'../secret'}},{asset:{width:0}}]){
  const f=fixture(opts),r=await request(f);assert.equal(r.status,200);assert.deepEqual(r.body,{artwork:null});assert.ok(!JSON.stringify(r).includes('secret'));assert.ok(f.calls.filter(c=>c[0]==='server').length<=1);
 }
});
test('all coordinates exact; shorter routes retain first/last, never invent capacity',()=>{
 for(const [code,points] of Object.entries(config.assets)){
  assert.deepEqual(JSON.parse(JSON.stringify(map.journeyArtworkAnchors(code,points.length))),points);
  for(const n of [2,3,points.length]){const result=map.journeyArtworkAnchors(code,n);assert.equal(result.length,n);assert.deepEqual(JSON.parse(JSON.stringify(result[0])),points[0]);assert.deepEqual(JSON.parse(JSON.stringify(result.at(-1))),points.at(-1));}
  assert.equal(map.journeyArtworkAnchors(code,points.length+1),null);
 }
 assert.equal(map.journeyArtworkAnchors(config.families.universal,9),null);
});
test('actual edges only from real visits; loops retained; unchosen optional/conditional routes are not skips',()=>{
 const definition=require('./fixtures/advisory-controlled-journey.json'),stages=Object.fromEntries(definition.stages.map((s,i)=>['id'+i,s.key]));
 const visits=[0,1,2,1].map((n,i)=>({id:'v'+i,stage_id:'id'+n})),before=JSON.stringify({definition,visits});
 const actual=map.artworkEdges(definition,visits,stages,'actual'),possible=map.artworkEdges(definition,visits,stages,'possible');
 assert.equal(actual.length,3);assert.equal(actual.at(-1).to,stages.id1);assert.equal(possible.length,definition.stages.reduce((n,s)=>n+(s.outcomes||[]).length,0));
 assert.equal(map.artworkEdges({...definition,format:undefined},visits,stages,'possible').length,0);assert.equal(map.artworkEdges(definition,[],stages,'actual').length,0);assert.equal(JSON.stringify({definition,visits}),before);
});
test('copy confirmation labels and timer; mutation contracts remain outside presentation component',()=>{
 const source=fs.readFileSync(root+'/app/admin/visual-assets/VisualAssetLibrary.tsx','utf8'),labels=fs.readFileSync(root+'/app/admin/visual-assets/labels.ts','utf8');assert.match(source,/navigator.clipboard.writeText/);assert.match(source,/1800/);assert.match(source,/done\?<Check/);assert.match(source,/timers.forEach\(clearTimeout\)/);assert.match(labels,/คัดลอกรหัสแล้ว','Code copied/);
 const component=fs.readFileSync(root+'/app/advisory/control/StrategicJourneyMap.tsx','utf8');assert.doesNotMatch(component,/advisory_control_write|service_role|\.upload\(/);const hook=fs.readFileSync(root+'/app/advisory/control/useJourneyArtwork.ts','utf8');assert.match(hook,/min-width:768px/);assert.match(hook,/!media.matches\)\{setState\(\{identity,asset:null,pending:false\}\)/);assert.match(hook,/cache:'no-store'/);
});
