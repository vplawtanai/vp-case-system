/* eslint-disable @typescript-eslint/no-require-imports */
// Scoped source audit. Explicit document/data boundaries are not UI translations.
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
const roots = ["app/finance", "app/settings/document-clauses", "app/settings/document-templates", "app/settings/document-settings"];
const common = ["app/settings/document-platform-shared.tsx", "app/components/AppTopNav.tsx", "app/components/AuthGuard.tsx", "app/components/DetailModal.tsx", "app/components/FinanceQuotationsSection.tsx", "app/components/LanguageSelector.tsx"];
const documentFiles = /(?:invoice-document|receipt-document|tax-document|combined-documents\/document|tax-corrections\/document|fee-agreements\/(?:preamble|execution|thai-legal-text))\.tsx?$/;
const documentOwners = {
  "app/finance/fee-agreements/[id]/preview/page.tsx": ["FEE_COLUMNS","documentTitle","dueDescription","PreambleRenderer","PaymentTerms","ExecutionRenderer","LegacySignatoryGroup","SectionTitle","FeeTable","CommercialTermsContent","ClauseList","SignatoryList","Signature","legalLabel","partyLabel","feeCellValue"],
  "app/finance/quotations/[id]/preview/page.tsx": ["engagementSections","PaymentTermsPreview","paymentTriggerText","paymentDueText","formatInstallmentTitle","PreviewLineItemVatExplanation","SignatureBlock","getDocumentStatusLabel","thaiMonths","getMatterLabel","LogoMark"],
  "app/finance/quotations/shared.tsx": ["fullPaymentInstallmentTitle","legacyFullPaymentInstallmentTitle","numberedInstallmentTitle","automaticInstallmentTitle","paymentTriggerSummary","buildPaymentClientSummary"],
  "app/finance/billing-plans/draft.ts": ["sourceTrigger","buildBillingPlanDraftFromFeeAgreement"],
  "app/finance/invoices/shared.ts": ["invoiceInstallmentContext"],
  "app/finance/receipts/shared.ts": ["receiptMethodLabels","receiptPresentation","paymentReceiptAction"],
  "app/finance/tax-invoices/shared.ts": ["taxPresentation"],
  "app/finance/document-decision/shared.ts": ["vatTreatmentLabels"],
  "app/finance/payments/tax.ts": ["invoiceTaxFacts"],
};
const dataOwners = {
  "app/finance/ledger/page.tsx": ["emptyForm","incomeCategories","expenseCategories","transferCategories","claimantRequiredCategories","resolveEditCategory"],
  "app/finance/expense-claims/page.tsx": ["expenseCategories","emptyClaimForm"],
  "app/finance/compensation/page.tsx": ["emptyForm","roleLabels","recipientTypes","generateAllocations","normalizeAllocationsForSave","getLedgerCategory","isSourcePoolRow","isSourcePoolOwnerRow","isFixedSourceWorkerRow","getRecipientRoleCategory","normalizeRecipientName","getRecipientDisplayName","addAllocation","updateRecipientType","getRecipientName","normalizeAllocationForState","getRecipientSummaryKey"],
  "app/settings/document-clauses/page.tsx": ["emptyFamily","initialFamily"],
  "app/finance/fee-agreements/[id]/page.tsx": ["defaultTitle"],
  "app/finance/fee-agreements/page.tsx": ["title"],
};
const documentPreviewHelpers = new Set(["Preamble","Execution","signatureSlots","formatVariable","SignatureGroup","signatureName","signatureCapacity","resolveVariables","variableLabel","formatVariableValue","resolveVariableValue","formatValue","interpolateControlledVariables","sectionTitle"]);
const technicalTerms = /^(?:VAT|WHT|THB|VP(?:-[A-Z]+)?|V[123]|EN|TH|A4|PDF|PNG|JPEG|MB|KBANK|LINE|SERVICE-SCOPE|Office OS|English|ไทย)(?:[\s\d%/.,:()+-]*)$/;
function files(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):/\.(?:tsx|ts)$/.test(e.name)&&!e.name.endsWith(".test.ts")?[path.join(dir,e.name)]:[]); }
function ancestry(n) { const list=[];for(let p=n.parent;p;p=p.parent)list.push(p);return list; }
function owners(n) { return ancestry(n).filter(p=>ts.isFunctionDeclaration(p)||ts.isVariableDeclaration(p)).map(p=>p.name?.getText()||"module"); }
function classify(n, file, source) {
  const value=n.text.trim(), parents=ancestry(n), names=owners(n);
  const jsx=parents.find(p=>ts.isJsxElement(p));
  const tag=jsx?.openingElement.tagName.getText(source);
  if (documentFiles.test(file) || parents.some(p=>ts.isJsxElement(p)&&p.openingElement.tagName.getText(source)==="LegalDocumentLayout")
    || (file.includes("/quotations/")&&file.includes("/preview/")&&parents.some(p=>ts.isJsxElement(p)&&p.openingElement.tagName.getText(source)==="article"))
    || (file.includes("/document-templates/")&&file.includes("/preview/")&&names.some(name=>documentPreviewHelpers.has(name)))
    || names.some(name=>documentOwners[file]?.includes(name))) return ["document_content","Document rendering/default contract independent of UI locale"];
  if (names.some(name=>dataOwners[file]?.includes(name))) return ["customer_business_data","Canonical persisted categories, role identifiers or generated business values"];
  if (parents.some(p=>ts.isCallExpression(p)&&/^(?:supabase\.rpc|createAuditLog|auditFinance|auditLedger|updateBatch|updateClaimStatus)$/.test(p.expression.getText(source)))) return ["customer_business_data","Unchanged RPC or audit payload"];
  if (parents.some(p=>ts.isPropertyAssignment(p)&&p.name.getText(source)==="note")) return ["customer_business_data","Persisted audit/internal note"];
  if (parents.some(ts.isImportDeclaration) || parents.some(ts.isExportDeclaration)) return ["intentionally_untranslated_technical_term","Module path"];
  if (parents.some(p=>ts.isJsxAttribute(p) && /^(?:value|key|id|href|src|type|name|className|style|lang|d|viewBox|fill|stroke|accept|aria-labelledby|aria-describedby|aria-controls)$/.test(p.name.getText(source)))) return ["intentionally_untranslated_technical_term","Canonical form value, URL or presentation identifier"];
  if (ts.isPropertyAssignment(n.parent)&&n.parent.name===n || ts.isLiteralTypeNode(n.parent)) return ["intentionally_untranslated_technical_term","Canonical key or type"];
  if (names.some(name=>/Select$|^focusableSelector$|^mappings$|Css$/.test(name))) return ["intentionally_untranslated_technical_term","Query/selector, known error match or CSS definition"];
  if (parents.some(p=>ts.isCallExpression(p)&&/console\.|\.includes$|\.startsWith$|\.endsWith$|\.test$|\.match$|\.replace$|\.replaceAll$|\.split$|\.select$|\.order$|\.eq$|\.in$/.test(p.expression.getText(source))) || parents.some(ts.isNewExpression)) return ["intentionally_untranslated_technical_term","Diagnostic/validation pattern, query or developer exception"];
  if (parents.some(p=>ts.isBinaryExpression(p)&&[ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(p.operatorToken.kind))) return ["customer_business_data","Canonical value comparison"];
  if (tag==="style"||parents.some(p=>ts.isVariableDeclaration(p)&&p.type?.getText(source).includes("CSSProperties"))||names.some(name=>/Style$|Styles$/.test(name))||/^\d.*(?:solid|dashed|rgba|minmax|auto)/.test(value)||/^(?:auto |repeat\(|minmax\(|rgba\(|var\(|linear-gradient)/.test(value)||/^border-|^background-|^overflow-/.test(value)) return ["intentionally_untranslated_technical_term","CSS presentation declaration"];
  if (!/[\u0e00-\u0e7f]/.test(value) && (/^(?:\/?(?:finance|settings|clients|cases|advisory)\/|\.\.?\/|@\/|\?\w+=|\/[\w/-]+|[a-z]+(?:-[a-z]+)+$|[a-z]{2}-[A-Z]{2}$|T\d{2}:|\.\w+$)/.test(value) || parents.some(p=>ts.isCallExpression(p)&&/getElementById|querySelector|toLocaleString|toLocaleDateString|toLocaleTimeString|getContext/.test(p.expression.getText(source))))) return ["intentionally_untranslated_technical_term","Route, selector, locale or format code"];
  if (technicalTerms.test(value)||/^(?:use client|use server|[a-z][\w.]*|[A-Z_0-9-]+|__[a-z]+__|_blank|noopener noreferrer|SHA-256|VP Case System|[\w-]+\/[\w/.%+>-]*|#[\da-f]+|https?:\/\/\S+|\d{4}-\d\d-\d\dT[\d:]+Z|\d+(?:px|fr)(?:\s+\d+(?:px|fr)?)*)$/.test(value)||!/[a-zA-Z\u0e00-\u0e7f]/.test(value)) return ["intentionally_untranslated_technical_term","Technical code, acronym, brand or format identifier"];
  if (["[data-action-menu-root='true']","snapshot-item-","snapshot-installment-","item-","left bottom","0 0 10px","· VAT"].includes(value)||names.includes("receiptSearchFilter")) return ["intentionally_untranslated_technical_term","Reviewed selector, generated key, style or VAT acronym"];
  if (file.endsWith("/fee-agreements/[id]/preview/page.tsx")&&names.includes("legalEntries")) return ["document_content","Customer legal clause headings"];
  if (file.endsWith("/quotations/shared.tsx")&&value==="Cancelled by user") return ["customer_business_data","Existing persisted cancellation reason"];
  return ["missed_ui_translation","Review this literal"];
}
function inventory() {
  const records=[];
  for(const file of [...roots.flatMap(files),...common]){
    const source=ts.createSourceFile(file,fs.readFileSync(file,"utf8"),99,true,file.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    function visit(n){
      if((ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isJsxText(n)||ts.isTemplateHead(n)||ts.isTemplateMiddle(n)||ts.isTemplateTail(n))&&n.text.trim()&&/[a-zA-Z\u0e00-\u0e7f]/.test(n.text)){
        const [classification,reason]=classify(n,file,source);
        records.push({file,line:source.getLineAndCharacterOfPosition(n.getStart(source)).line+1,owner:owners(n)[0]||"module",classification,reason,text:n.text.trim()});
      }ts.forEachChild(n,visit);
    }visit(source);
  }return records;
}
if(require.main===module){const rows=inventory();if(process.argv.includes("--json"))console.log(JSON.stringify(rows,null,2));else if(process.argv.includes("--missed"))for(const r of rows.filter(r=>r.classification==="missed_ui_translation"))console.log(r.file+":"+r.line+" "+r.owner+" | "+r.text);else{const summary={};for(const r of rows){summary[r.classification]=(summary[r.classification]||0)+1;}console.log(summary);}if(process.argv.includes("--check")&&rows.some(r=>r.classification==="missed_ui_translation"))process.exitCode=1;}
module.exports={inventory};
