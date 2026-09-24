/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const render=require('./combined-document-render-fixture.cjs');
const {combinedTaxRow}=require('../../app/finance/combined-documents/shared.ts');
const {taxPresentation}=require('../../app/finance/tax-invoices/shared.ts');
const {receiptPresentation}=require('../../app/finance/receipts/shared.ts');
const {documentSource}=require('../../app/finance/document-decision/source.ts');
const {documentError}=require('../../app/finance/document-decision/shared.ts');
// Synthetic fixture emitted by the real 066 PostgreSQL issue path, never Production data.
const fixture=()=>structuredClone(require('./direct-money-documents-fixture.json'));
test('066 existing Combined renderer accepts typed PostgreSQL source, truthful reference and frozen amounts',()=>{
 const f=fixture(),row=combinedTaxRow(f.combined,f.tax);assert.ok(row);const d=taxPresentation(row).value;
 assert.deepEqual([d.beforeVat,d.vat,d.gross,d.wht,d.cash],[1000000,70000,1070000,30000,1040000]);
 const html=render.render({combined:f.combined,row});assert.match(html,/อ้างอิงรายการรับเงิน/);assert.doesNotMatch(html,/ใบแจ้งหนี้อ้างอิง/);assert.match(html,/10,400.00/);assert.equal((html.match(/<img /g)||[]).length,1);
 f.tax.draft_snapshot_json.customer.name='Mutable master must not render';assert.equal(render.render({combined:f.combined,row:f.tax}),html);
 assert.equal(documentSource(row).href,`/finance/direct-money/${row.direct_money_receipt_id}`);
});
test('066 malformed or mixed identity, duplicate lines and amount mismatch fail closed',()=>{
 assert.match(documentError('RECEIPT_CUSTOMER_IDENTITY_REQUIRED','en'),/source lacks the customer identity/);
 assert.doesNotMatch(documentError('RECEIPT_CUSTOMER_IDENTITY_REQUIRED','th'),/ใบแจ้งหนี้/);
 for(const mutate of [f=>{f.tax.payment_id=f.tax.direct_money_receipt_id;},f=>{f.tax.issued_snapshot_json.source.id='wrong';},f=>{f.tax.issued_snapshot_json.money.cash_amount=10700;},f=>{f.tax.issued_snapshot_json.document_lines.push(f.tax.issued_snapshot_json.document_lines[0]);},f=>{f.tax.issued_snapshot_json.invoice={id:'fake'};}]){
 const f=fixture();mutate(f);assert.equal(taxPresentation(f.tax).ok,false);
 }
});
test('066 Direct Receipt uses the same presentation and cash/WHT totals',()=>{
 const f=fixture(),r=f.receipt;r.combined_document_id=null;r.receipt_no='VP-RC-202609-000001';r.issued_snapshot_json.receipt.receipt_no=r.receipt_no;
 const view=receiptPresentation(r);assert.ok(view.ok);assert.equal(view.value.sourceType,'direct_money_receipt');assert.equal(view.value.payment.cash,1040000);
});
test('066 existing source flows and document appearance are reused; no new template/styles',()=>{
 const paths=['app/components/DocumentIdentity.tsx','app/components/LegalDocumentLayout.tsx','app/finance/receipts/receipt-document.module.css','app/finance/tax-invoices/tax-invoices.module.css','app/finance/combined-documents/document.module.css'];
 for(const p of paths)assert.equal(fs.readFileSync(p,'utf8'),cp.execFileSync('git',['show','478b9571ae75924f24ba6ba7e0c9e5d8e3f17806:'+p],{encoding:'utf8'}),p);
 const sql=fs.readFileSync('supabase/migrations/202607180066_add_direct_money_document_source.sql','utf8');
 assert.doesNotMatch(sql,/create\s+table/i);assert.doesNotMatch(sql,/insert into public\.finance_(payments|invoices|cash_transactions|payouts|vp_revenue_distributions)\b/i);
 assert.match(sql,/vp_received_lock\(null,sid\)/);assert.match(sql,/create unique index tax_direct_coverage_once_066/);
});
test('066 dashboard and monthly facts count Direct VAT/WHT/cash once with documentary coverage present',async()=>{
 const {fixture:dashboardFixture,adapter}=require('./tax-dashboard-fixture.cjs');
 const {readDashboard,summarizeDashboard,summarizeMonthlyTaxFacts}=require('../../app/finance/tax-position/dashboard-data.ts');
 const {buildPermissions}=require('../../lib/permissions.ts');
 const f=dashboardFixture(),data=await readDashboard(adapter(f).client,buildPermissions({role:'admin'}),'2026-09');
 const before=summarizeDashboard(data,'2026-09'),monthly=summarizeMonthlyTaxFacts(data,'2026-09');
 const d=data.money.direct[0];data.taxes.documents.push({id:'documentary-only',payment_id:null,direct_money_receipt_id:d.id,status:'issued',tax_invoice_no:'VP-RTI-202609-000099',point:{occurred_on:d.received_on,approved_at:'2026-09-15'},items:[{id:'line',amount_before_vat:10000,vat_amount:700,total_amount:10700}]});
 assert.deepEqual(summarizeDashboard(data,'2026-09'),before);assert.deepEqual(summarizeMonthlyTaxFacts(data,'2026-09'),monthly);
});
