/* eslint-disable @typescript-eslint/no-require-imports */
// Actual TypeScript server/image code with isolated Auth/Storage/RPC doubles.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),sharp=require('sharp');
const root=path.resolve(__dirname,'../..'),cache=new Map();
function load(file,overrides={}){
 const full=path.resolve(root,file);if(!Object.keys(overrides).length&&cache.has(full))return cache.get(full);
 const box={exports:{},Buffer,Response,Request,URL,Blob,File,console,process:{env:{}},setTimeout,clearTimeout,require:n=>{
  if(n in overrides)return overrides[n];if(n==='server-only')return {};
  if(n.startsWith('.')){let p=path.resolve(path.dirname(full),n);if(!fs.existsSync(p))p+=fs.existsSync(p+'.ts')?'.ts':'.tsx';return load(p);}
  return require(n);
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,box);
 if(!Object.keys(overrides).length)cache.set(full,box.exports);return box.exports;
}
const images=load('lib/server/visual-image.ts'),library=load('lib/visual-assets.ts'),server=load('lib/server/visual-assets.ts');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const metadata={artwork_key:'universal-map',name_th:'ภาพตัวอย่าง',name_en:'Example',asset_type:'journey',scope:'both',theme:'landscape',tags:['neutral'],status:'active',overlay_ready:true};
function fixture(profile={role:'admin',active:true,must_change_password:false}){
 const calls=[],files=new Map(),rows=[],mappings=[],bucket={
  createSignedUploadUrl:async p=>{calls.push(['sign',p]);return {data:{token:'synthetic'},error:null};},
  download:async p=>({data:files.has(p)?new Blob([files.get(p)]):null,error:files.has(p)?null:{message:'missing'}}),
  upload:async(p,b)=>{calls.push(['upload',p]);files.set(p,b);return {data:{path:p},error:null};},
  remove:async paths=>{calls.push(['remove',paths]);paths.forEach(p=>files.delete(p));return {data:[],error:null};},
  createSignedUrls:async paths=>({data:paths.map(p=>({signedUrl:'https://example.invalid/'+p})),error:null}),
 };
 const caller={auth:{getUser:async()=>({data:{user:{id:id(1)}},error:null})},storage:{from:()=>bucket},from:table=>{
  let target;const query={select(){return query;},eq(k,v){target=v;return query;},order(){return Promise.resolve({data:rows,error:null});},single:async()=>({data:profile,error:null}),maybeSingle:async()=>({data:rows.find(a=>a.id===target)||null,error:null}),then(resolve){return Promise.resolve({data:table==='visual_asset_mappings'?mappings:rows,error:null}).then(resolve);}};return query;
 },rpc:async(name,args)=>{calls.push(['rpc',name,args]);if(args.p_action==='create'){const row={...args.p_data,id:args.p_id,version:1};rows.push(row);return {data:row,error:null};}return {data:{saved:true},error:null};}};
 return {calls,files,rows,caller,privileged:()=>{calls.push(['privileged']);return {storage:{from:()=>bucket}};}};
}
async function request(f,body,origin='https://local.invalid'){
 const r=await server.handleVisualRequest(new Request('https://local.invalid/api/admin/visual-assets',{method:body?'POST':'GET',headers:{Authorization:'Bearer synthetic.token',Origin:origin},...(body?{body:JSON.stringify(body)}:{})}),f);
 return {status:r.status,headers:r.headers,body:await r.json()};
}
test('real decoder preserves aspect, bounds long edge, creates WebP thumbnail and strips metadata',async()=>{
 const original=await sharp({create:{width:3200,height:1800,channels:4,background:'#80aacc88'}}).png().withMetadata().toBuffer();
 const result=await images.optimizeVisualImage(original),master=await sharp(result.master).metadata(),thumb=await sharp(result.thumbnail).metadata();
 assert.equal(result.width,2560);assert.equal(result.height,1440);assert.equal(master.format,'webp');assert.ok(master.hasAlpha);assert.ok(!master.exif&&!master.xmp&&!master.icc);assert.equal(thumb.width,512);assert.equal(thumb.height,288);assert.match(result.sha256,/^[a-f0-9]{64}$/);
 const small=await images.optimizeVisualImage(await sharp({create:{width:80,height:160,channels:3,background:'red'}}).jpeg().toBuffer());assert.equal(small.width,80);assert.equal(small.height,160);
});
test('reject non-image, SVG, truncated/corrupt and oversized uploads',async()=>{
 for(const bytes of [Buffer.from('<svg width="40" height="40"></svg>'),Buffer.from('not an image'),Buffer.from([255,216,255,224,0])])await assert.rejects(images.optimizeVisualImage(bytes),/VISUAL_IMAGE_INVALID/);
 await assert.rejects(images.optimizeVisualImage(Buffer.alloc(20*1024*1024+1)),/VISUAL_FILE_SIZE/);
 const animated=await sharp({create:{width:4,height:8,channels:3,background:'blue',pageHeight:4}}).gif().toBuffer();await assert.rejects(images.optimizeVisualImage(animated),/VISUAL_IMAGE_INVALID/);
});
test('every endpoint denies non-Admin, inactive Admin and forced-password session before privilege access',async()=>{
 for(const profile of [{role:'partner',active:true},{role:'lawyer',active:true},{role:'staff',active:true},{role:'admin',active:false},{role:'admin',active:true,must_change_password:true}])for(const action of [undefined,'session','upload-start','upload-finish','edit','delete','map','unmap']){
  const f=fixture({must_change_password:false,...profile}),r=await request(f,action?{action}:undefined);assert.equal(r.status,403);assert.equal(f.calls.length,0);
 }
 const f=fixture();f.caller.auth.getUser=async()=>({data:{user:null},error:{}});assert.equal((await request(f)).status,401);
});
test('scoped HttpOnly server-page session requires verified Admin and same origin',async()=>{
 const r=await request(fixture(),{action:'session'});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Path=\/admin\/visual-assets; Max-Age=1800; Secure/);
 assert.equal((await request(fixture(),{action:'session'},'https://hostile.invalid')).status,403);
 const cleared=await server.handleVisualRequest(new Request('https://local.invalid/api/admin/visual-assets',{method:'DELETE',headers:{Origin:'https://local.invalid'}}));
 assert.equal(cleared.status,200);assert.match(cleared.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await server.handleVisualRequest(new Request('https://local.invalid/api/admin/visual-assets',{method:'DELETE',headers:{Origin:'https://hostile.invalid'}}))).status,403);
 const redirects=[];
 for(const allowed of [true,false]){
  const page=load('app/admin/visual-assets/page.tsx',{'next/headers':{cookies:async()=>({get:()=>({value:'synthetic'})})},'next/navigation':{notFound(){throw Error('SERVER_DENIED');},redirect:u=>redirects.push(u)},'../../../lib/server/visual-assets':{VisualError:server.VisualError,visualPageAllowed:async()=>{if(!allowed)throw new server.VisualError('VISUAL_FORBIDDEN',403);}},'./VisualAssetLibrary':{default:()=>null}});
  if(allowed)assert.ok(await page.default());else await assert.rejects(page.default(),/SERVER_DENIED/);
 }
});
test('upload pipeline decodes exact input, persists measured metadata once and retries without rewriting',async()=>{
 const f=fixture(),start=await request(f,{action:'upload-start',type:'image/png',size:100});assert.equal(start.status,200);assert.match(start.body.path,new RegExp('^'+id(1)+'/'));
 f.files.set(start.body.path,await sharp({create:{width:800,height:450,channels:3,background:'#123456'}}).png().toBuffer());
 const finish=await request(f,{action:'upload-finish',id:start.body.id,metadata});assert.equal(finish.status,201);assert.equal(finish.body.asset.width,800);assert.equal(finish.body.asset.height,450);assert.equal(finish.body.asset.version,1);assert.ok(!f.files.has(start.body.path));assert.equal(f.files.size,2);
 const retry=await request(f,{action:'upload-finish',id:start.body.id,metadata});assert.equal(retry.status,200);assert.equal(f.calls.filter(c=>c[0]==='rpc').length,1);
 const read=await request(f);assert.equal(read.body.assets.length,1);assert.ok(read.body.assets[0].master_url);
});
test('family mapping resolves active scope then Universal; no Work Type binding or retired fallback',()=>{
 const assets=[{...metadata,id:id(10),delete_pending:false},{...metadata,artwork_key:'specific-map',scope:'case',id:id(11),delete_pending:false}],maps=[{scope:'both',family_key:'universal',artwork_key:'universal-map'},{scope:'case',family_key:'dispute',artwork_key:'specific-map'}];
 assert.equal(library.resolveVisualAsset(assets,maps,'case','dispute').id,id(11));assert.equal(library.resolveVisualAsset(assets,maps,'non_litigation','dispute').id,id(10));assets[0].status='retired';assert.equal(library.resolveVisualAsset(assets,maps,'non_litigation','dispute'),null);
 assert.throws(()=>library.visualMetadata({...metadata,overlay_ready:false}),/VISUAL_INVALID/);assert.throws(()=>library.visualMetadata({...metadata,artwork_key:'../unsafe'}),/VISUAL_INVALID/);
});
test('navigation is in existing Settings group, active Admin only; page labels and safe overlays are localized',()=>{
 const nav=fs.readFileSync(root+'/app/components/AppTopNav.tsx','utf8'),entry=nav.slice(nav.indexOf('page: "visualAssets"'),nav.indexOf('page: "documentClauses"'));
 assert.match(entry,/isActiveAdmin\(profile\)/);assert.match(entry,/must_change_password === false/);assert.ok(nav.indexOf('title: t("common.nav.settings")')<nav.indexOf('page: "visualAssets"'));
 const {labels}=load('app/admin/visual-assets/labels.ts');for(const pair of Object.values(labels)){assert.equal(pair.length,2);assert.ok(pair.every(s=>s.length>0));assert.ok(!/[ก-๛]/.test(pair[1]));}
 const ui=fs.readFileSync(root+'/app/admin/visual-assets/VisualAssetLibrary.tsx','utf8');assert.match(ui,/\[0,5,7,9\]/);assert.match(ui,/if\(lock.current\)return/);assert.match(ui,/<img src=\{asset.master_url\}/);
});
