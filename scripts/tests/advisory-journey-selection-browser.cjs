/* eslint-disable @typescript-eslint/no-require-imports */
// Real browser FormData + real MatterEditor, synthetic localhost RPCs only.
// Start: ADVISORY_FJ_PREVIEW=1 node scripts/tests/non-litigation-preview.cjs
const assert=require('node:assert/strict');
const {chromium}=require('/Users/paolawyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.argv[2];assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
const words={th:{create:'สร้างงานนอกคดี',save:'บันทึก',client:'ลูกค้า',alternative:'มีการเจรจา'},en:{create:'Create matter',save:'Save',client:'Client',alternative:'With negotiation'}};
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[],results=[];
 try{
  // Reproduce the original native serialization hazard independently of React.
  const native=await browser.newPage();await native.setContent('<form><input type="radio" name="journey-choice" checked></form>');
  assert.equal(await native.locator('form').evaluate(f=>new FormData(f).get('journey-choice')),'on');await native.close();
  for(const locale of ['th','en'])for(const mode of ['explicit','default','sole','invalid']){
   const page=await browser.newPage({viewport:{width:locale==='th'?390:1440,height:1000}}),w=words[locale];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
   await page.goto(base+'/advisory?locale='+locale+'&multiple');await page.getByRole('button',{name:w.create,exact:true}).click();
   const dialog=page.getByRole('dialog'),form=dialog.locator('form');
   if(mode!=='sole')await dialog.locator('select[name=matter_type]').selectOption('contract_business_documents');
   if(mode==='sole')await dialog.locator('input[type=hidden][name=journey_version_id][value="version-general_advisory"]').waitFor({state:'attached'});
   else await dialog.getByRole('radio',{name:w.alternative,exact:true}).waitFor();
   if(['explicit','invalid'].includes(mode))await dialog.getByRole('radio',{name:w.alternative,exact:true}).check();
   await dialog.getByRole('combobox',{name:w.client,exact:true}).click();await dialog.getByRole('option',{name:'Synthetic Client',exact:true}).click();
   await dialog.locator('input[name=title]').fill('Synthetic selection '+mode);await dialog.locator('select[name=lead_id]').selectOption('lead');
   const expected=mode==='sole'?['variant-general_advisory','version-general_advisory']:['explicit','invalid'].includes(mode)?['alternative','version-alternative']:['variant-contract_business_documents','version-contract_business_documents'];
   const raw=await form.evaluate(f=>({entries:Object.fromEntries(new FormData(f)),versions:new FormData(f).getAll('journey_version_id'),radio:f.querySelector('input[type=radio]:checked')?.value}));
   assert.deepEqual(raw.versions,[expected[1]]);assert.equal(raw.entries['journey-choice'],undefined);
   if(mode!=='sole')assert.equal(raw.radio,expected[1]);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   if(mode==='invalid'){
    for(const invalid of ['on','missing-version','version-general_advisory']){
     await dialog.locator('input[type=radio]:checked').evaluate((el,value)=>{el.value=value;},invalid);
     assert.equal(await form.evaluate(f=>new FormData(f).get('journey_version_id')),invalid);
     await dialog.getByRole('button',{name:w.save,exact:true}).click();await dialog.getByRole('alert').waitFor();
     assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='advisory_control_write').length),0);
    }
   }else{
    await dialog.getByRole('button',{name:w.save,exact:true}).click();await page.waitForURL(/000000000104/);
    const created=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('previewCreatedMatter')));
    assert.equal(created.variant_id,expected[0]);assert.equal(created.journey_version_id,expected[1]);assert.equal(created.lead_id,'lead');
   }
   results.push({locale,mode,passed:true});await page.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({results,consoleErrors:errors,productionAccess:false}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
