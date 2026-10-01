/* eslint-disable @typescript-eslint/no-require-imports */
// Run against CLIENT_WORKSPACE_PREVIEW=1 node scripts/tests/non-litigation-preview.cjs.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.argv[2];if(!base||new URL(base).hostname!=='127.0.0.1')throw Error('Only the local synthetic preview is allowed');
async function main(){
 const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[],checks=[];
 try{for(const locale of ['th','en'])for(const width of [390,768,1024,1440]){
  const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.goto(base+'/advisory?locale='+locale);
  const clientView=page.getByRole('tab',{name:locale==='th'?'มุมมองลูกค้า':'Client view',exact:true}),matterView=page.getByRole('tab',{name:locale==='th'?'มุมมองงาน':'Matter view',exact:true});
  assert.equal(await matterView.getAttribute('aria-selected'),'true');
  await clientView.click();await page.getByRole('button',{name:/ABC Trade Demo Contact/}).click();await page.getByRole('heading',{name:'ABC Trade',exact:true}).waitFor();
  const workspace=page.locator('section[aria-busy]');
  assert.equal(await workspace.locator('a[href="/cases/101"]').count()>0,true);assert.equal(await workspace.locator('a[href="/advisory/101"]').count(),0);
  assert.ok(!(await workspace.innerText()).includes('LIT-FOREIGN'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'overflow '+locale+'/'+width);
  const table=workspace.locator('section').filter({has:page.getByRole('heading',{name:locale==='th'?/งานนอกคดีทั้งหมด/:/All Non-Litigation matters/})});
  await table.getByRole('textbox').fill('NO-MATCH');await table.getByText(locale==='th'?'ไม่พบงานที่ตรงกับการค้นหา':'No matching work',{exact:true}).waitFor();await table.getByRole('textbox').fill('');
  if(width===390||width===1440)await page.screenshot({path:'/private/tmp/client-workspace-'+locale+'-'+width+'.png',fullPage:true});
  await matterView.click();await page.locator('#advisory-results').waitFor();assert.equal(await clientView.getAttribute('aria-selected'),'false');
  await clientView.click();await page.getByRole('button',{name:/Empty Client/}).click();await page.getByText(locale==='th'?'ยังไม่มีคดีที่เชื่อมกับลูกค้ารายนี้':'No cases linked to this client',{exact:true}).waitFor();
  await page.getByRole('button',{name:locale==='th'?'ลูกค้าทั้งหมด':'All clients',exact:true}).click();await page.getByRole('button',{name:/ABC Trade Different Contact/}).click();await workspace.locator('a[href="/cases/103"]').first().waitFor();assert.equal(await workspace.locator('a[href="/cases/101"]').count(),0);
  await page.evaluate(()=>{window.clientPreview.fail='case_notes';});await workspace.getByRole('button',{name:locale==='th'?'รีเฟรช':'Refresh',exact:true}).click();await workspace.getByRole('alert').waitFor();assert.equal(await workspace.locator('a[href^="/cases/"]').count(),0);
  assert.ok((await page.evaluate(()=>window.calls)).every(c=>!c.name||['advisory_control_read','advisory_overdue_work','get_finance_expense_access','get_finance_statement_accounts'].includes(c.name)));
  checks.push(locale+'/'+width);await page.close();
 }assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:checks,consoleRuntimeErrors:errors,externalRequestsAllowed:false,productionMutation:false}));}
 finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
