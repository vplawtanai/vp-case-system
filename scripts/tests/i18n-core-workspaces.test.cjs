/* eslint-disable @typescript-eslint/no-require-imports */
const test=require("node:test"), assert=require("node:assert/strict"), React=require("react");
const {root,fixture:receiptFixture}=require("./receipt-render-fixture.cjs");
const {fixture:taxFixture}=require("./tax-invoice-render-fixture.cjs");
const {fixture:combinedFixture}=require("./combined-document-render-fixture.cjs");
const {syntheticLogoUrl}=require("./document-logo-render-fixture.cjs");
const {workspaceFixture}=require("./i18n-workspace-fixture.cjs");
const {paymentForm,paymentFingerprint}=require(root+"/app/finance/payments/shared.ts");
const {documentDecisionLabels}=require(root+"/app/finance/document-decision/shared.ts");
const {buildPermissions}=require(root+"/lib/permissions.ts");
const permissions=buildPermissions({role:"admin",financial_access:true});
const blocked=()=>{throw Error("Production access is forbidden in this fixture");};
// English source data makes leftover Thai system copy detectable. Source values
// are fixtures only; the separate document tests cover preserved Thai records.
function source(value){if(typeof value==="string")return /[\u0e00-\u0e7f]/.test(value)?value==="สำนักงานใหญ่"?"Head Office":"Original stored text":value;if(Array.isArray(value))return value.map(source);if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,source(v)]));return value;}
function check(fixture,state,props,component) {
  const before=JSON.stringify({state,props}),en=fixture.render("en",state,props,component),th=fixture.render("th",state,props,component);
  const article=html=>html.match(/<article\b[^>]*lang="th"[^>]*>[\s\S]*?<\/article>/g)||[];
  assert.deepEqual(article(en),article(th), "Customer document markup must not follow UI locale");
  assert.doesNotMatch(en.replace(/<article\b[^>]*lang="th"[^>]*>[\s\S]*?<\/article>/g,""),/[\u0e00-\u0e7f]/);
  assert.match(th,/[\u0e00-\u0e7f]/);
  assert.doesNotMatch(en+th,/\{(?:count|amount|name|number)\}/);
  assert.equal(JSON.stringify({state,props}),before);
  if(process.env.VP_I18N_VISUAL_DIR){
    const fs=require("node:fs"),path=require("node:path"),{css}=require("./receipt-render-fixture.cjs");
    const id=component+"-"+(props.row?.status||props.status||Object.values(state).find(x=>x&&typeof x==="object"&&x.status)?.status||"decision")+(props.combined?"-combined":"");
    fs.writeFileSync(path.join(process.env.VP_I18N_VISUAL_DIR,id+".json"),JSON.stringify({th,en,css:css.join("\n")}));
  }
  return {en,th};
}
const taxEditor=workspaceFixture("app/finance/tax-invoices/editor.tsx",["TaxInvoiceEditor"]);
test("Tax Invoice and Combined editors translate all blockers, required fields and lifecycle panels",()=>{
  for(const status of ["draft","issued","cancelled"])for(const isCombined of [false,true]){
    const f=source(isCombined?combinedFixture(status):{row:taxFixture(status)});
    const state={"TaxInvoiceEditor.cancelOpen":true};
    const rendered=check(taxEditor,state,{...f,permissions,logoUrl:syntheticLogoUrl,blockers:["TAX_INVOICE_CUSTOMER_IDENTITY_REQUIRED","TAX_INVOICE_TAX_POINT_APPROVAL_REQUIRED","TAX_INVOICE_EXTERNAL_COVERAGE_CHECK_REQUIRED"],reload:blocked},"TaxInvoiceEditor");
    assert.match(rendered.en,/5,000.00|7,000.00/);
  }
});
test("Receipt Draft/Issued/Voided internal workspace translates without altering documentary evidence",()=>{
  for(const status of ["draft","issued","voided","cancelled"]){
    const receipt=source(receiptFixture(status));
    const fixture=workspaceFixture("app/finance/receipts/[id]/page.tsx",["ReceiptWorkspace"],{
      "../access":{ReceiptGuard:()=>null},
      "../use-receipt":{useReceipt:()=>({receipt,loading:false,error:"",reload:blocked,logoUrl:syntheticLogoUrl})},
      "../../document-decision/next-action":{FinanceDocumentNextAction:()=>null},
    });
    check(fixture,{"ReceiptWorkspace.mode":status==="draft"?"issue":"void"},{id:receipt.id,status,permissions},"ReceiptWorkspace");
  }
});
test("Payment workspace renders all Draft and confirmed correction controls in one UI language",()=>{
  const fixture=workspaceFixture("app/finance/payments/[id]/page.tsx",["PaymentWorkspace"],{
    "../../quotations/shared":{QuotationGuard:()=>null},
    "../../document-decision/next-action":{FinanceDocumentNextAction:()=>null},
  });
  for(const status of ["draft","confirmed","cancelled","reversed"]){
    const payment={id:"payment",status,client_id:"client",currency:"THB",cash_amount:"4859.81",wht_amount:"140.19",settlement_amount:"5000.00",received_on:"2026-09-05",payment_method:"bank_transfer",receiving_bank_account_id:"bank",wht_calculation_mode:"legacy_manual"};
    const form=paymentForm(payment), invoice={id:"invoice",invoice_no:"VP-IV-FIXTURE",customer_name:"Original customer",client_id:"client",currency:"THB",amount_before_vat:"4672.90",vat_amount:"327.10",total_amount:"5000.00",document_status:"issued"};
    const state={"PaymentWorkspace.loading":false,"PaymentWorkspace.payment":payment,"PaymentWorkspace.form":form,"PaymentWorkspace.baseline":paymentFingerprint(form),
      "PaymentWorkspace.settlementTarget":"5000.00","PaymentWorkspace.whtMode":"legacy","PaymentWorkspace.confirmationOpen":true,"PaymentWorkspace.exceptionMode":status==="draft"?"cancel":"reverse",
      "PaymentWorkspace.reallocationOpen":true,"PaymentWorkspace.allocations":[{id:"allocation",payment_id:"payment",invoice_id:"invoice",cash_allocated:4859.81,wht_credit_allocated:140.19,settlement_total:5000}],
      "PaymentWorkspace.effectiveAllocations":[{payment_id:"payment",invoice_id:"invoice",effective_cash_allocated:4859.81,effective_wht_credit_allocated:140.19,effective_settlement_total:5000}],
      "PaymentWorkspace.invoices":[invoice],"PaymentWorkspace.candidateInvoices":[invoice],"PaymentWorkspace.bankAccounts":[{id:"bank",short_name:"KBANK",bank_name:"Original bank",is_active:true}],
      "PaymentWorkspace.settlements":[{invoice_id:"invoice",invoice_total_amount:5000,confirmed_cash_amount:4859.81,confirmed_wht_credit:140.19,economically_settled_amount:5000,outstanding_amount:0,payment_status:"settled"}]};
    check(fixture,state,{access:{canManage:true,canConfirm:true,canReverse:true,canReallocate:true}},"PaymentWorkspace");
  }
});
test("Every document decision, including completion-only and blocked routes, translates in the actual Next Action",()=>{
  const fixture=workspaceFixture("app/finance/document-decision/next-action.tsx",["NextAction"],{"../tax-invoices/access":{useTaxAccess:()=>({permissions})}});
  for(const decision of Object.keys(documentDecisionLabels)){
    const state={"NextAction.decision":{decision,lines:[],unknown_lines:[],blockers:["TAX_INVOICE_CUSTOMER_IDENTITY_REQUIRED"]},"NextAction.open":true};
    check(fixture,state,{paymentId:"payment"},"NextAction");
  }
});
module.exports={source,permissions,taxEditor,check,React};
