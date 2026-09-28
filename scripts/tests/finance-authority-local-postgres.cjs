/* eslint-disable @typescript-eslint/no-require-imports */
// Starts an isolated PostgreSQL 18 cluster. Unix socket only; never loads .env.
const fs=require('node:fs'),{spawnSync}=require('node:child_process'),path=require('node:path');
const bin='/Applications/Postgres.app/Contents/Versions/18/bin';
const root=fs.mkdtempSync('/private/tmp/vp068-pg-078-');fs.chmodSync(root,0o700);
const env={PATH:process.env.PATH,LC_ALL:'C',LANG:'C'};
const run=(name,args)=>{const r=spawnSync(path.join(bin,name),args,{env,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||r.stdout);};
let started=false;
try{
 run('initdb',['-D',root+'/data','-U','postgres','-A','trust','--encoding=UTF8','--no-locale']);
 run('pg_ctl',['-D',root+'/data','-l',root+'/server.log','-o',`-F -k ${root} -p 58468 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
 const r=spawnSync(process.execPath,['--test','--test-name-pattern=078','scripts/tests/finance-authority-postgres.test.cjs'],{
  env:{...env,VP068_TEST_SOCKET:root,PGLITE_MODULE_PATH:path.resolve('scripts/tests/finance-authority-pg-adapter.cjs'),...(process.argv.includes('--capture')?{CAPTURE_078:'1'}:{})},stdio:'inherit'});
 process.exitCode=r.status||0;
}finally{if(started)run('pg_ctl',['-D',root+'/data','-m','fast','-w','stop']);console.log('Disposable PostgreSQL evidence: '+root);}
