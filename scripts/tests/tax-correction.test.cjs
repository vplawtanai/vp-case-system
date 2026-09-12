/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture,render}=require('./tax-correction-render-fixture.cjs');
const {correctionModes,correctionBases,validCorrectionInput,correctionError}=require('../../app/finance/tax-corrections/shared.ts');
const {taxCorrectionMessages}=require('../../lib/i18n/messages/tax-corrections.ts');
const {lexical}=require('./receipt-sql-static.test.cjs');
test('043 original correction history retains dates/type and document annotation ignores UI locale',()=>{
 const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
 const history=workspaceFixture('app/finance/tax-corrections/initiation.tsx',['TaxCorrectionHistoryList']);
 const rows=[{id:'correction',mode:'debit_note',status:'issued',number:'VP-DN-202607-000001',source_correction_id:null,created_at:'2026-07-03T00:00:00Z',document_date:'2026-07-03'}];
 for(const locale of ['th','en']){
  const html=history.render(locale,{}, {rows},'TaxCorrectionHistoryList');
  assert.match(html,/VP-DN-202607-000001/);assert.match(html,/dateTime="2026-07-03T00:00:00Z"/i);assert.match(html,/dateTime="2026-07-03"/i);
  assert.ok(html.includes(locale==='th'?'ใบเพิ่มหนี้':'Debit Note'));assert.match(html,/href="\/finance\/tax-corrections\/correction"/);
 }
 const notice=workspaceFixture('app/finance/tax-corrections/history-notice.tsx',['TaxCorrectionHistoryNotice']);
 const state={'TaxCorrectionHistoryNotice.state':{key:'original:null',context:{source:{source_correction_id:'replacement',document_no:'VP-TI-202607-000002'}},error:''}};
 const th=notice.render('th',state,{taxId:'original'},'TaxCorrectionHistoryNotice'),en=notice.render('en',state,{taxId:'original'},'TaxCorrectionHistoryNotice');
 assert.equal(th,en);assert.match(th,/VP-TI-202607-000002/);assert.match(th,/\/finance\/tax-corrections\/replacement/);
});
test('043 correction documents reuse frozen identity/logo in Draft, Issued and Cancelled; no live fallback',()=>{
 for(const mode of correctionModes)for(const paired of [false,true])for(const status of ['draft','issued','cancelled']){
  const f=fixture(mode,paired,status),html=render(f);assert.match(html,/<article/);assert.match(html,/<img /);assert.doesNotMatch(html,/NaN|undefined|Invalid document/);
  assert.match(html,status==='cancelled'?/CANCELLED/:status==='draft'?/DRAFT/:new RegExp(f.document.document_no));
  if(mode==='replacement_copy'){assert.match(html,/REPLACEMENT COPY/);assert.match(html,/ครั้งที่/);if(status==='issued')assert.match(html,/Synthetic Reviewer/);}
  if(mode==='credit_note'||mode==='debit_note'){assert.match(html,/1,000.00/);assert.match(html,/70.00/);assert.match(html,/4,672.90/);}
  if(status==='issued'){f.correction.draft_snapshot_json.tax.seller.company_name_th='MUTABLE WRONG';assert.equal(render(f),html);}
  assert.doesNotMatch(render({...f,logoUrl:''}),/<article/);
 }
});
test('043 explicit modes, qualifying bases, decimal input and Thai/English errors',()=>{
 for(const mode of correctionModes){assert.ok(correctionBases[mode].length);assert.ok(taxCorrectionMessages['taxCorrection.'+mode].th);assert.ok(taxCorrectionMessages['taxCorrection.'+mode].en);}
 for(const [key,entry] of Object.entries(taxCorrectionMessages)){assert.ok(entry.th,key);assert.ok(entry.en,key);}
 const valid=(mode='credit_note',basis='service_overcharge',lines=[{item_id:'test',base_change:'1000.00'}])=>validCorrectionInput(mode,'Reviewed reason','External evidence',basis,'2026-07-03','2026-07-02',lines);
 assert.equal(valid(),true);assert.equal(valid('replacement_copy','lost',[]),true);assert.equal(valid('cancel_and_reissue','documentary_identity_error',[]),true);
 assert.equal(valid('debit_note','service_undercharge',[{item_id:'test',base_change:'25000.00'}]),true);
 for(const value of ['-1','0','NaN','Infinity','1.001'])assert.equal(valid('credit_note','service_overcharge',[{item_id:'test',base_change:value}]),false);
 assert.equal(valid('','service_overcharge'),false);assert.equal(valid('credit_note','lost'),false);assert.equal(valid('replacement_copy','lost'),false);
 assert.match(correctionError({message:'TAX_CORRECTION_SOURCE_COVERAGE_EXCEEDED'},'en'),/coverage/);
 assert.match(correctionError({message:'TAX_CORRECTION_LEGAL_REVIEW_REQUIRED'},'th'),/อนุมัติ/);
 assert.doesNotMatch(correctionError({message:'secret stack password',details:'private'},'en'),/secret|stack|private|password/);
 const {inventory}=require('./i18n-inventory.cjs');assert.deepEqual(inventory().filter(r=>r.file.startsWith('app/finance/tax-corrections/')&&r.classification==='missed_ui_translation'),[]);
});
test('043 candidate has no upstream business writes; original Preview history annotation is shared',()=>{
 const sql=fs.readFileSync('supabase/migrations/202607180043_add_tax_document_correction_foundation.sql','utf8');
 for(const table of ['finance_payments','finance_receipts','finance_tax_invoices','finance_combined_documents','finance_cash_transactions','finance_company_ledger','clients'])assert.doesNotMatch(sql,new RegExp('(?:update|insert into|delete from) public\\.'+table+'\\b','i'));
 for(const file of ['app/finance/tax-invoices/[id]/preview/page.tsx','app/finance/combined-documents/workspace.tsx'])assert.match(fs.readFileSync(file,'utf8'),/TaxCorrectionHistoryNotice/);
 assert.match(fs.readFileSync('app/finance/tax-corrections/initiation.tsx','utf8'),/<DetailModal/);
});
test('043 SELECT-only preflight/verifier and exact rollback-only candidate embedding',()=>{
 const {workflow,filenames,migrationPath}=require('./tax-correction-artifacts.cjs');
 for(const [file,expected] of Object.entries(workflow()))assert.equal(fs.readFileSync(file,'utf8'),expected);
 for(const file of [filenames.pre,filenames.verify]){
  const clean=lexical(fs.readFileSync(file,'utf8'));assert.equal(clean.split(';').filter(s=>s.trim()).length,1);assert.match(clean.trim(),/^with\b/i);
  assert.doesNotMatch(clean,/\b(insert|update|delete|alter|create|drop|grant|revoke|truncate|call|do|execute|into)\b/i);
  assert.doesNotMatch(clean,/\b(?:create|approve|issue|cancel)_finance_tax_correction\w*\s*\(/i);
 }
 const dry=fs.readFileSync(filenames.dry,'utf8'),clean=lexical(dry);
 assert.match(clean.trim(),/^begin;/i);assert.match(clean.trim(),/rollback;$/i);assert.doesNotMatch(clean,/\bcommit\b/i);
 assert.equal(dry.split('-- BEGIN EMBEDDED MIGRATION 043\n')[1].split('-- END EMBEDDED MIGRATION 043')[0],fs.readFileSync(migrationPath,'utf8'));
 assert.match(dry,/tax_document_correction_foundation_verification_pass/);
});
