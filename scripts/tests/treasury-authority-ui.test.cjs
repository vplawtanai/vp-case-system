/* eslint-disable @typescript-eslint/no-require-imports */
// Real component event handlers, isolated React hook state, and the installed Supabase client.
// All transport responses/data are synthetic. No environment or Production connection.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
const {createClient}=require('@supabase/supabase-js');
require('./receipt-render-fixture.cjs');
const {translate}=require('../../lib/i18n/catalog.ts');
const path='app/finance/expenses/admin-tools.tsx',keys=['view_balance','view_movements','record_outflow','confirm_outflow'];
const empty=Object.fromEntries(keys.map(k=>[k,false])),all=Object.fromEntries(keys.map(k=>[k,true]));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const clone=value=>JSON.parse(JSON.stringify(value));
function transport(){
 const t={rows:[],writes:[],reads:0,gate:null,readGate:null,readError:false,writeError:null,unknownResponse:false};
 t.client=createClient('http://synthetic-authority.invalid','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,init)=>{
  const rpc=String(url).split('/').at(-1);let data;
  if(rpc==='get_finance_treasury_authorities'){t.reads++;if(t.readGate)await t.readGate.promise;if(t.readError)return new Response(JSON.stringify({code:'42501',message:'permission denied'}),{status:403});data=clone(t.rows);}
  else {
   assert.equal(rpc,'set_finance_treasury_authority');const args=JSON.parse(init.body);t.writes.push(args);if(t.gate)await t.gate.promise;
   let error=t.writeError;const prior=t.rows.find(r=>r.user_id===args.p_user&&r.bank_account_id===args.p_bank&&r.cash_location_id===args.p_cash);
   if((prior?.version??null)!==args.p_version)error='EXPENSE_STALE';
   if(error)return new Response(JSON.stringify({code:'P0001',message:error}),{status:400});
   const row={id:prior?.id||'00000000-0000-4000-8000-000000000001',user_id:args.p_user,bank_account_id:args.p_bank,cash_location_id:args.p_cash,version:(prior?.version??0)+1,...args.p_rights};
   t.rows=t.rows.filter(r=>r.id!==row.id);t.rows.push(row);data=t.unknownResponse?null:row.id;
  }
  return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 }}});
 // Compile the actual page run prop, rather than replacing its response interpretation.
 const src=fs.readFileSync('app/finance/expenses/accounts/page.tsx','utf8'),ast=ts.createSourceFile('page.tsx',src,99,true,ts.ScriptKind.TSX);let run;
 function find(n){if(ts.isJsxAttribute(n)&&n.name.getText(ast)==='run')run=n.initializer.expression.getText(ast);ts.forEachChild(n,find);}find(ast);
 const c={exports:{},supabase:t.client};vm.runInNewContext(ts.transpileModule('exports.run='+run,{compilerOptions:{target:9,module:1}}).outputText,c);t.run=c.exports.run;
 return t;
}
function harness(t,{locale='th',storage=new Map(),admin=true,actor='admin',eligible=true}={}){
 let cursor=0,tree;const slots=[],effects=[];
 const react={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(fn,deps){const i=cursor++,prior=slots[i];if(!prior||deps.some((v,j)=>v!==prior.deps[j])){prior?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=fn();});}}};
 const imports={react,'lucide-react':{Link2:()=>null,ShieldCheck:()=>null},'../../components/ui/patterns':{Callout:()=>null,FieldGroup:()=>null},'../../../lib/i18n/provider':{useI18n:()=>({locale,t:k=>translate(locale,k)})},'../../../lib/supabase':{supabase:t.client}};
 const context={exports:{},React:react,crypto:{randomUUID:()=> 'synthetic'},sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},require:n=>n.endsWith('.css')?{default:new Proxy({}, {get:(_,k)=>k})}:imports[n]||(()=>{throw Error('Unexpected import '+n);})()};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:9,module:1,jsx:ts.JsxEmit.React}}).outputText,context);
 const props={access:{is_admin:admin,user_id:actor},accounts:['ktb','kbank','bay'].map(id=>({id,name:id.toUpperCase(),bank_account_id:id,cash_location_id:null})),lookups:{people:eligible?[{id:'pam',name:'Pam'}]:[]},run:t.run,busy:false,fixture:false,showBridge:false,onBridge(){}};
 const h={storage,props,render(){cursor=0;tree=context.exports.ExpenseAdminTools(props);return tree;},nodes(){const found=[];function visit(n){if(Array.isArray(n))n.forEach(visit);else if(n&&typeof n==='object'&&n.props){found.push(n);visit(n.props.children);}}visit(tree);return found;},get(predicate){const n=h.nodes().find(predicate);assert.ok(n,'Element not found');return n;},field(id){return h.get(n=>n.props.id===id).props.children;},button(){return h.get(n=>n.type==='button'&&n.props.type==='submit');},form(){return h.get(n=>n.type==='form');},text(){const walk=n=>Array.isArray(n)?n.map(walk).join(' '):n&&typeof n==='object'?walk(n.props?.children):typeof n==='string'?n:'';return walk(tree);},async mount(){h.render();effects.splice(0).forEach(fn=>fn());await flush();h.render();},choose(id,value){h.field(id).props.onChange({target:{value}});h.render();},rights(values){for(const [i,k]of keys.entries()){const node=h.nodes().filter(n=>n.type==='input'&&n.props.type==='checkbox')[i];if(node.props.checked!==values[k]){node.props.onChange({target:{checked:values[k]}});h.render();}}},checked(){return h.nodes().filter(n=>n.type==='input'&&n.props.type==='checkbox').map(n=>n.props.checked);},async submit(){await h.form().props.onSubmit({preventDefault(){}});h.render();},async reload(){await h.get(n=>n.type==='button'&&n.props.type==='button').props.onClick();await flush();h.render();}};
 return h;
}
async function selected(t,options){const h=harness(t,options);await h.mount();h.choose('authority-person','pam');h.choose('authority-account','ktb');return h;}
function edit(h,rights){h.rights(rights);h.choose('authority-reason','Synthetic Admin reason');}
for(const locale of ['th','en'])test(`authority ${locale}: one save/readback, selected rights retained, edit/revoke, unchanged resubmit suppressed`,async()=>{
 const t=transport(),h=await selected(t,{locale});edit(h,all);assert.equal(h.button().props.disabled,false);await h.submit();
 assert.equal(t.writes.length,1);assert.equal(t.reads,2);assert.equal(t.rows[0].version,1);assert.equal(t.writes[0].p_version,null);assert.equal(t.writes[0].p_cash,null);
 assert.deepEqual(h.checked(),[true,true,true,true]);assert.equal(h.field('authority-person').props.value,'pam');assert.equal(h.field('authority-account').props.value,'ktb');assert.ok(h.text().includes(translate(locale,'expenses.authoritySaved')));assert.equal(h.button().props.disabled,true);
 h.choose('authority-reason','Retry without changes');await h.submit();assert.equal(t.writes.length,1);
 edit(h,{...empty,view_balance:true});await h.submit();assert.equal(t.writes.at(-1).p_version,1);assert.deepEqual(h.checked(),[true,false,false,false]);
 edit(h,empty);await h.submit();assert.equal(t.writes.at(-1).p_version,2);assert.equal(t.rows[0].version,3);assert.deepEqual(h.checked(),[false,false,false,false]);
 h.choose('authority-account','kbank');assert.deepEqual(h.checked(),[false,false,false,false]);assert.equal(t.rows.length,1);assert.ok(t.writes.every(w=>w.p_bank==='ktb'));
 if(locale==='en')assert.doesNotMatch(h.text(),/[\u0e00-\u0e7f]/);
});
test('authority: synchronous duplicate submits and clicks during readback cause one setter/one follow-up read',async()=>{
 const t=transport(),h=await selected(t);edit(h,all);t.gate=deferred();t.readGate=deferred();const submit=h.form().props.onSubmit,event={preventDefault(){}};
 const first=submit(event),duplicate=submit(event);h.render();assert.equal(h.button().props.disabled,true);t.gate.resolve();await flush();await submit(event);assert.equal(t.writes.length,1);assert.equal(t.reads,2);t.readGate.resolve();await Promise.all([first,duplicate]);h.render();assert.ok(h.text().includes(translate('th','expenses.authoritySaved')));
});
test('authority: committed save + failed readback is a saved warning; reload retries only the reader',async()=>{
 const t=transport(),h=await selected(t);edit(h,all);t.readError=true;await h.submit();assert.equal(t.rows.length,1);assert.equal(t.writes.length,1);assert.ok(h.text().includes(translate('th','expenses.authoritySavedReadFailed')));assert.equal(h.button().props.disabled,true);await h.submit();assert.equal(t.writes.length,1);
 t.readError=false;await h.reload();assert.equal(t.writes.length,1);assert.deepEqual(h.checked(),[true,true,true,true]);assert.equal(h.button().props.disabled,true);
});
test('authority: HTTP 200 null/unknown result blocks retry until persisted state is read',async()=>{
 const t=transport(),h=await selected(t);edit(h,all);t.unknownResponse=true;await h.submit();assert.equal(t.rows.length,1);assert.ok(h.text().includes(translate('th','expenses.failed')));assert.equal(h.button().props.disabled,true);await h.reload();assert.equal(t.writes.length,1);assert.deepEqual(h.checked(),[true,true,true,true]);
});
test('authority: reload remembers only selection, re-reads rights/version, isolates Admin and rejects ineligible selection',async()=>{
 const t=transport(),h=await selected(t);edit(h,all);await h.submit();assert.deepEqual(JSON.parse([...h.storage.values()][0]),{user:'pam',account:'ktb'});
 t.rows[0].view_balance=false;t.rows[0].version=10;const refreshed=harness(t,{storage:h.storage});await refreshed.mount();assert.equal(refreshed.field('authority-person').props.value,'pam');assert.deepEqual(refreshed.checked(),[false,true,true,true]);edit(refreshed,all);await refreshed.submit();assert.equal(t.writes.at(-1).p_version,10);
 for(const options of [{actor:'another-admin'},{eligible:false}]){const other=harness(t,{storage:h.storage,...options});await other.mount();assert.equal(other.field('authority-person').props.value,'');}
});
test('authority: stale version/permission denial is specific; non-Admin gets no form or reads',async()=>{
 for(const [error,key]of [['EXPENSE_STALE','stale'],['EXPENSE_ADMIN_REQUIRED','denied'],['EXPENSE_AUTHORITY_INVALID','authorityInvalid']]){const t=transport(),h=await selected(t);edit(h,all);t.writeError=error;await h.submit();assert.equal(t.rows.length,0);assert.ok(h.text().includes(translate('th','expenses.'+key)));assert.equal(h.button().props.disabled,true);}
 const t=transport(),nonAdmin=harness(t,{admin:false});await nonAdmin.mount();assert.equal(nonAdmin.render(),null);assert.equal(t.reads,0);assert.equal(t.writes.length,0);
});
test('authority: view rights independent; record does not imply confirm; existing confirm prerequisite retained',async()=>{
 const t=transport(),h=await selected(t);for(const rights of [{...empty,view_balance:true},{...empty,view_movements:true},{...empty,record_outflow:true},all]){edit(h,rights);await h.submit();assert.deepEqual(h.checked(),keys.map(k=>rights[k]));assert.deepEqual(t.writes.at(-1).p_rights,rights);}
 h.rights({...all,record_outflow:false,confirm_outflow:false});assert.deepEqual(h.checked(),[true,true,false,false]);
});
