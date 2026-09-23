/* eslint-disable @typescript-eslint/no-require-imports */
// Operator entry point: SELECT-only checks. This tool has NO dry-run/apply mode.
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const a=require('./tax-simple-artifacts.cjs');
function validateArtifacts(){
 const expected=a.workflow();
 for(const [file,sql] of Object.entries(expected))assert.equal(fs.readFileSync(file,'utf8'),sql,'Stale gate: '+file);
 return a.sha();
}
function main(args){
 if(args.length===1&&args[0]==='print-preflight'){
  validateArtifacts();
  process.stdout.write('-- Candidate file and gate bytes checked locally before export.\n'+a.workflow()[a.files.pre]);
  return;
 }
 const [mode,flag,file]=args;
 assert.ok(['preflight','verify','print-verify'].includes(mode)&&flag==='--baseline'&&file&&args.length===3,
  'Usage: node scripts/tests/tax-064-gate.cjs preflight|verify|print-verify --baseline /absolute/path/baseline.json');
 assert.ok(path.isAbsolute(file),'Use an absolute baseline path');
 const candidateHash=validateArtifacts();
 let baseline;
 if(mode==='preflight')assert.equal(fs.existsSync(file),false,'Baseline already exists; choose a fresh filename');
 else {
  baseline=JSON.parse(fs.readFileSync(file,'utf8'));
  if(Array.isArray(baseline)){assert.equal(baseline.length,1);baseline=baseline[0];}
  assert.equal(baseline.gate_pass,true,'A passing saved Preflight is required');
  assert.equal(baseline.migration_sha256,candidateHash,'Baseline belongs to a different candidate');
  assert.deepEqual(Object.keys(baseline.historical_hashes||{}).sort(),a.rowTables);
  assert.deepEqual(baseline.failed_checks,[]);
 }
 if(mode==='print-verify'){
  const encoded=Buffer.from(JSON.stringify(baseline.historical_hashes)).toString('base64');
  process.stdout.write(a.workflow()[a.files.verify].replace("nullif(current_setting('vp.tax064_before_b64',true),'')","'"+encoded+"'"));
  return;
 }
 assert.ok(process.env.VP_DATABASE_URL,'Set VP_DATABASE_URL securely before running');
 const options=['-c default_transaction_read_only=on','-c search_path=public',
  ...(baseline?['-c vp.tax064_before_b64='+Buffer.from(JSON.stringify(baseline.historical_hashes)).toString('base64')]:[])].join(' ');
 const output=execFileSync('psql',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-f','-'],
  {input:`select row_to_json(g) from (${a.workflow()[a.files[mode==='preflight'?'pre':'verify']].trim().replace(/;$/,'')}) g;`,encoding:'utf8',maxBuffer:32*1024*1024,env:{...process.env,PGDATABASE:process.env.VP_DATABASE_URL,PGOPTIONS:options}});
 const result=JSON.parse(output.trim());
 assert.equal(result.migration_sha256,candidateHash);
 if(mode==='preflight')fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify(result,null,2));
 assert.equal(result.gate_pass,true,'064 SELECT-only gate failed; STOP. No dry-run/apply authorized.');
}
module.exports={validateArtifacts};
if(require.main===module)main(process.argv.slice(2));
