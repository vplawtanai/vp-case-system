/* eslint-disable @typescript-eslint/no-require-imports */
// Test-only adapter for the synthetic fixture. Private Unix socket ONLY; no URLs/credentials.
const {spawn}=require('node:child_process'),{randomUUID}=require('node:crypto'),assert=require('node:assert/strict');
const bin='/Applications/Postgres.app/Contents/Versions/18/bin/psql';
function connection(){const host=process.env.VP068_TEST_SOCKET;assert.match(host||'',/^\/private\/tmp\/vp068-pg-[A-Za-z0-9_-]+$/);return ['-X','-qAt','-v','ON_ERROR_STOP=1','-h',host,'-p','58468','-U','postgres','-d','postgres'];}
class PGlite {
 constructor(){this.queue=Promise.resolve();this.p=spawn(bin,connection(),{stdio:['pipe','pipe','pipe']});this.pending=null;this.output='';this.errors='';this.p.stdout.on('data',b=>{this.output+=b;const p=this.pending;if(p&&this.output.includes(p.marker)){const [out,rest]=this.output.split(p.marker);this.output=rest.replace(/^\r?\n/,'');this.pending=null;p.resolve(out.trim());}});this.p.stderr.on('data',b=>{this.errors+=b;});this.p.on('error',e=>this.pending?.reject(e));this.p.on('exit',code=>{if(this.pending){this.pending.reject(Error('Local psql exited '+code+': '+this.errors));this.pending=null;}});}
 send(sql){const run=()=>new Promise((resolve,reject)=>{const marker='VP068_'+randomUUID().replaceAll('-','');this.pending={resolve,reject,marker};this.p.stdin.write(sql+'\n\\echo '+marker+'\n');});const p=this.queue.then(run);this.queue=p.catch(()=>{});return p;}
 async exec(sql){await this.send(sql+'\n;');return [];}
 async query(sql,params=[]){const quote=v=>v==null?'NULL':typeof v==='number'?String(v):typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";const text=sql.replace(/\$(\d+)\b/g,(_,n)=>quote(params[Number(n)-1])).replace(/;\s*$/,'');if(!/^\s*(select|with)\b/i.test(text)){if(/\breturning\b/i.test(text)){const output=await this.send(`with v as (${text}) select coalesce(json_agg(row_to_json(v)),'[]'::json)::text from v;`);return {rows:JSON.parse(output)};}await this.exec(text+';');return {rows:[]};}const output=await this.send(`select coalesce(json_agg(row_to_json(v)),'[]'::json)::text from (${text}) v;`);return {rows:JSON.parse(output)};}
 async close(){this.p.stdin.end('\\q\n');}
}
module.exports={PGlite,connection,bin};
