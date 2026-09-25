/* eslint-disable @typescript-eslint/no-require-imports */
// Loopback-only visual fixture. No credentials, real source data, or financial writes.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const root=path.resolve(__dirname,'../..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'vp-statement-overview-'));
const write=(name,body)=>{const p=path.join(out,name);fs.writeFileSync(p,body);return p;};
const adapter=write('adapter.js',`const params=new URLSearchParams(location.search);
const names=['BAY','KBANK','KTB','เงินสดสำนักงาน'],banks=['ธนาคารกรุงศรีอยุธยา','ธนาคารกสิกรไทย','ธนาคารกรุงไทย',null];
const accounts=names.map((name,i)=>({kind:i===3?'cash':'bank',account_id:'fixture-'+i,bank_account_id:i===3?null:'fixture-'+i,cash_location_id:i===3?'fixture-3':null,name_th:name,name_en:i===3?'Office cash':name,bank_name:banks[i],account_number:i===3?null:'123-456-7890',is_active:true}));
const t=(id,direction)=>({id:direction,transfer_id:'t1',kind:'transfer',cash_amount:5000,direction,occurred_at:'2026-09-24T11:00:00+07:00',confirmed_at:'2026-09-24T11:01:00+07:00',balance:id===1?203400:305000,reference:'TRANSFER-FIXTURE',description:'โอนระหว่างบัญชี / Internal transfer'});
export const supabase={auth:{async getUser(){return {data:{user:{id:'fixture'}}}}},from(table){if(table!=='user_profiles')throw Error('Unexpected table');return {select(){return this},eq(){return this},async single(){return {data:{role:'admin'}}}}},async rpc(name,args){
if(name==='get_finance_expense_access')return {data:{can_view_all:true}};
if(params.has('error'))return {error:{message:'Synthetic unavailable'}};
if(name==='get_finance_statement_accounts')return {data:{accounts:params.has('empty')?[]:accounts,can_transfer:true,can_manage_openings:true}};
if(name==='get_finance_treasury')return {data:{accounts:params.has('empty')?[]:accounts.map((a,i)=>({...a,currency:'THB',opening_id:'o'+i,opening_as_of:'2026-08-31T16:59:59.999Z',system_balance:params.has('unknown')&&i===0?null:[111000,203400,305000,19800][i]}))}};
if(name==='get_finance_unified_company_statement')return {data:{rows:[],count:3,income:8814.58,expense:280.37,unclassified_count:2}};
if(name!=='get_finance_account_statement')throw Error('Unexpected RPC '+name);
const i=accounts.findIndex(a=>a.bank_account_id===args.p_bank&&a.cash_location_id===args.p_cash),transfer=i===1?[t(i,'outflow')]:i===2?[t(i,'inflow')]:[];
const kinds=['company_purchase','direct_money_receipt','payment','employee_claim'];
const rows=[{id:'row-'+i,kind:kinds[i],cash_amount:[1000,10400,0,700][i],direction:i===1?'inflow':'outflow',occurred_at:'2026-09-25T08:30:00+07:00',confirmed_at:'2026-09-25T08:31:00+07:00',balance:[111000,203400,305000,19800][i],reference:'FIXTURE-202609-'+i,description:['ค่าวัสดุสำนักงาน / Office supplies','รับเงินค่าที่ปรึกษา / Advisory fee','รายการตัวอย่าง / Sample movement','เบิกค่าเดินทาง / Travel reimbursement'][i]},...transfer].filter(r=>r.cash_amount>0);
const recent=args.p_type==='transfer'?transfer:rows,unknown=params.has('unknown')&&i===0;
return {data:{rows:recent,count:recent.length,inflow:[12000,10400,5000,500][i],outflow:[1000,7000,0,700][i],closing:unknown?null:[111000,203400,305000,19800][i],balance_covered:!unknown}};
}};`);
const navigation=write('navigation.js',`export const usePathname=()=>location.pathname;export const useRouter=()=>({replace(){throw Error('Unexpected redirect')}});`);
const link=write('link.js',`import React from'react';export default function Link({children,...props}){return React.createElement('a',props,children);}`);
const image=write('image.js',`import React from'react';export default function Image(props){return React.createElement('img',props);}`);
const loader=write('loader.cjs',`module.exports=function(source){if(this.resourcePath.endsWith('.css')){const prefix='c'+require('node:crypto').createHash('sha256').update(this.resourcePath).digest('hex').slice(0,8)+'_';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,k)=>'+JSON.stringify(prefix)+'+k})};'}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{module:99,target:9,jsx:4,esModuleInterop:true}}).outputText};`);
const entry=write('entry.tsx',`import React from'react';import{createRoot}from'react-dom/client';import{UiLocaleProvider}from'${root}/lib/i18n/provider';import AppTopNav from'${root}/app/components/AppTopNav';import{StatementOverview}from'${root}/app/finance/statement/overview';const p=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(<UiLocaleProvider initialLocale={p.get('locale')||'th'} pathname='/finance/statement'><AppTopNav title='การเงิน' activePage='finance'/><main><StatementOverview canCash={!p.has('companyOnly')} canCompany={!p.has('cashOnly')}/></main></UiLocaleProvider>);`);
async function main(){
 await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',context:root,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[root+'/node_modules'],alias:{'next/navigation':navigation,'next/link':link,'next/image':image,[root+'/lib/supabase']:adapter}},module:{rules:[{test:/\.(tsx?|css)$/,use:loader}]},devtool:false},(e,s)=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));
 const styles=['app/components/AppSidebar.module.css','app/components/ui/vp-ui.module.css','app/components/LanguageSelector.module.css','app/finance/finance-sidebar.module.css','app/finance/statement/overview.module.css'];
 const css=styles.map(p=>{const prefix='c'+require('node:crypto').createHash('sha256').update(root+'/'+p).digest('hex').slice(0,8)+'_';return fs.readFileSync(root+'/'+p,'utf8').replace(/\.([A-Za-z_][A-Za-z_0-9-]*)/g,(_,k)=>'.'+prefix+k).replace(/:global\(([^)]+)\)/g,'$1');}).join('\n');
 const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');return res.end(fs.readFileSync(out+'/bundle.js'));}if(/^\/banks\/(bay|kbank|ktb)\.svg$/.test(req.url)){res.setHeader('content-type','image/svg+xml');return res.end(fs.readFileSync(root+'/public'+req.url));}res.setHeader('content-type','text/html');res.end(`<!doctype html><html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>*{box-sizing:border-box}body{margin:0;background:#f9fbfe;font:14px Arial,sans-serif}main{padding:18px 24px 32px}button,input,select{font-family:inherit}@media(max-width:540px){main{padding:12px}}${css}</style><div id='root'></div><script src='/bundle.js'></script></html>`);});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 console.log('Synthetic visual fixture: http://127.0.0.1:'+server.address().port+'/finance/statement');console.log('TH/EN: ?locale=th or ?locale=en; edge states: &unknown, &error, &empty, &companyOnly, &cashOnly. Output:',out);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
