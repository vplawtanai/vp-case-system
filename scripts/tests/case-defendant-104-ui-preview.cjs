/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable PostgreSQL + the actual 104 RPC and actual UI. Loopback only; no Production credentials.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const A=require('./case-defendant-104-artifacts.cjs'),fixture=require('./case-core-098-fixture.cjs'),{id}=require('./case-defendant-104-ui-fixture.cjs');
const root=A.root,out=fs.mkdtempSync('/private/tmp/case104-ui-'),bin='/Applications/Postgres.app/Contents/Versions/18/bin';let started=false,server;
const write=(name,s)=>{const p=path.join(out,name);fs.writeFileSync(p,s);return p;};
const command=(name,args,input)=>spawnSync(path.join(bin,name),args,{input,encoding:'utf8',maxBuffer:64*1024*1024});
function check(name,args,input){const r=command(name,args,input);if(r.status)throw Error(r.stderr);return r.stdout.trim();}
const sql=s=>check('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h',out,'-p','58514','-U','postgres','-d','postgres'],s);
const auth=(role,s)=>`BEGIN;SET LOCAL request.jwt.claims='{"sub":"${id(role==='viewer'?6:role==='assistant'?4:3)}"}';SET LOCAL ROLE authenticated;${s};COMMIT;`;
const versions=()=>`jsonb_build_object('scope',(SELECT count(*) FROM case_service_events WHERE case_id=1 AND action LIKE 'case104_%'),'flow',coalesce((SELECT version FROM case_flow_instances WHERE case_id=1),0),'deadlines','{}'::jsonb)`;
function seed(action,data){sql(auth('lawyer',`SELECT case104_save(1,'${crypto.randomUUID()}','${action}',${versions()},${A.j(data)})`));}
function cleanup(){if(server)server.close();if(started){check('pg_ctl',['-D',out+'/pg','-m','fast','-w','stop']);started=false;console.log('Owned PostgreSQL stopped:',command('pg_ctl',['-D',out+'/pg','status']).status===3);} }
process.on('SIGINT',()=>{cleanup();process.exit(0)});process.on('SIGTERM',()=>{cleanup();process.exit(0)});
const adapter=write('adapter.js',`const params=new URLSearchParams(location.search),role=params.get('role')||'lawyer';
async function post(path,body){return fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,role,failOnce:params.has('retry')})}).then(r=>r.json());}
function query(table){const filters=[];let single=false;const q={select(){return q},eq(k,v){filters.push([k,'eq',v]);return q},is(k,v){filters.push([k,'is',v]);return q},in(k,v){filters.push([k,'in',v]);return q},order(){return q},maybeSingle(){single=true;return q},then(ok,fail){return post('/query',{table,filters,single}).then(ok,fail)}};return q;}
export const supabase={from:query,rpc:(name,args)=>post('/rpc',{name,args})};`);
const loader=write('loader.cjs',`module.exports=function(s){if(this.resourcePath.endsWith('.css')){const pre='c'+require('node:crypto').createHash('sha256').update(this.resourcePath).digest('hex').slice(0,8)+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(pre)+'+k})}';}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(s,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText}`);
const entry=write('entry.tsx',`import React,{useEffect,useState} from 'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider';import CaseProcedure from'${root}/app/cases/[id]/CaseProcedure';import DeadlinesSection from'${root}/app/cases/[id]/components/DeadlinesSection';const p=new URLSearchParams(location.search),lang=p.get('locale')||'th',role=p.get('role')||'lawyer';function App(){const[revision,setRevision]=useState(0),[data,setData]=useState(null),[request,setRequest]=useState(null);useEffect(()=>{const f=()=>setRevision(n=>n+1);window.addEventListener('case-detail-updated',f);return()=>window.removeEventListener('case-detail-updated',f)},[]);return <main style={{maxWidth:1160,margin:'auto',padding:16}}><h1 style={{fontSize:22}}>VP-LOCAL-104</h1><CaseProcedure caseId={1} revision={revision} canStart={role==='lawyer'} canTransition={role!=='viewer'} caseRecord={{case_type:'Civil'}} answerRequest={request} onExtend={()=>{throw Error('Unexpected Plaintiff extension')}} onDefendantData={setData}/><DeadlinesSection caseId="1" revision={revision} canEdit={role!=='viewer'} canDelete={false} defendantData={data} onAnswer={partyId=>setRequest({partyId,key:Date.now()})}/></main>}createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale={lang} pathname="/cases/1"><App/></UiLocaleProvider>);`);
async function main(){
 fs.chmodSync(out,0o700);check('initdb',['-D',out+'/pg','-U','postgres','-A','trust','--encoding=UTF8','--no-locale']);check('pg_ctl',['-D',out+'/pg','-l',out+'/pg.log','-o',`-F -k ${out} -p 58514 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
 sql(fixture());for(const prefix of ['case-core-098','case-proceedings-099','case-engagement-100','case-flow-101','case-service-102','case-service-103','case-defendant-104'])sql(A.read(require('./'+prefix+'-artifacts.cjs').candidate));
 sql(`UPDATE parties SET role='defendant',first_name='Local defendant A',entity_type='individual',order_no=1;INSERT INTO parties(id,case_id,role,first_name,entity_type,order_no) VALUES('${id(202)}',1,'defendant','Local defendant B','individual',2),('${id(203)}',1,'defendant','Local defendant C','individual',3),('${id(211)}',1,'plaintiff','Local plaintiff','individual',1);UPDATE case_deadlines SET deadline_type='other',deadline_other='Local manual deadline',status='Active';`);
 seed('representation',{parties:[id(201),id(202),id(203)],active:true});seed('flow_start',{id:id(701),stage:'D-CIV-02',start_kind:'cut_in',acknowledged:true});
 for(let i=1;i<=3;i++){seed('service',{party_id:id(200+i),method:'posting',attempted_on:'2026-09-01',result:'served',confirm_lawful:true});seed('deadline',{party_id:id(200+i),due:`2026-10-${15+i}`,confirmed:true});}
 await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',context:root,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[root+'/node_modules'],alias:{[root+'/lib/supabase']:adapter}},module:{rules:[{test:/\.(tsx?|css)$/,use:loader}]},devtool:false},(e,s)=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));
 const files=['app/cases/[id]/case-detail.module.css','app/cases/[id]/case-defendant.module.css','app/cases/[id]/case-flow.module.css','app/cases/[id]/case-service.module.css','app/finance/expenses/claim-category-combobox.module.css','app/components/DetailModal.module.css','app/components/ui/vp-ui.module.css'];
 const css=files.map(f=>{const full=path.join(root,f),prefix='c'+crypto.createHash('sha256').update(full).digest('hex').slice(0,8)+'_';return fs.readFileSync(full,'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,k)=>'.'+prefix+k).replace(/:global\(([^)]+)\)/g,'$1')}).join('\n');
 let failedOnce=false;
 server=http.createServer(async(req,res)=>{res.setHeader('cache-control','no-store');if(req.method==='POST'){
  res.setHeader('content-type','application/json');try{let body='';for await(const part of req){body+=part;if(body.length>250000)throw Error('Too large');}const b=JSON.parse(body);let data;
   if(req.url==='/rpc'){
    if(!['case104_read','case104_save','case101_read','case102_read'].includes(b.name))throw Error('Unexpected RPC');
    if(b.name==='case104_save'){const a=b.args;data=JSON.parse(sql(auth(b.role,`SELECT case104_save(1,${A.q(a.p_request_id)}::uuid,${A.q(a.p_action)},${A.j(a.p_versions)},${A.j(a.p_data)})`)));if(b.failOnce&&!failedOnce){failedOnce=true;res.end(JSON.stringify({error:{message:'Simulated lost response after local commit'}}));return;}}
    else data=JSON.parse(sql(auth(b.role,`SELECT ${b.name}(1)`)));
   }else if(req.url==='/query'){
    if(!['parties','case_deadlines','case_deadline_extensions','case_service_controls','case_flow_instances','user_profiles'].includes(b.table))throw Error('Unexpected table');
    let rows=JSON.parse(sql(auth(b.role,`SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM ${b.table} x`)));
    rows=rows.filter(r=>(b.filters||[]).every(([key,op,v])=>op==='in'?v.includes(r[key]):op==='is'&&v===null?r[key]==null:r[key]===v));
    if(b.table==='case_service_controls'){const details=JSON.parse(sql(auth(b.role,'SELECT case104_read(1)')));rows=rows.map(r=>{const p=details.represented.find(p=>p.party_id===r.party_id);return {...r,party:p?.party,attempt:p?.attempts.find(a=>a.id===r.lawful_attempt_id)};});}
    data=b.single?rows[0]||null:rows;
   }else throw Error('Unexpected endpoint');res.end(JSON.stringify({data,error:null}));
  }catch(e){res.end(JSON.stringify({data:null,error:{message:e.message}}));}return;
 }
 if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');return res.end(fs.readFileSync(out+'/bundle.js'));}res.setHeader('content-type','text/html');res.end(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#f6f9fd;color:#17304f;font:14px Arial,sans-serif}${css}</style><div id="root"></div><script src="/bundle.js"></script></html>`);
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));console.log(JSON.stringify({url:'http://127.0.0.1:'+server.address().port,artifacts:out,pid:process.pid}));
}
main().catch(e=>{console.error(e);cleanup();process.exitCode=1});
