/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), cp = require("node:child_process"), ts = require("typescript");
const { root } = require("./receipt-render-fixture.cjs");
const { workspaceFixture } = require("./i18n-workspace-fixture.cjs");
const { legacyCategoryLabel, legacyStatusLabel, compensationRoleLabel, legacyOperationError } = require(root + "/lib/i18n/legacy-finance.ts");
const { resolveUiMessage } = require(root + "/lib/i18n/catalog.ts");
const { uiMessage } = require(root + "/lib/i18n/core.ts");
const workspaces = [
  ["cash-transactions", "FinanceCashTransactionsPage", "Cash Transactions"],
  ["ledger", "FinanceLedgerPage", "Ledger Entries"],
  ["expense-claims", "ExpenseClaimsPage", "Claims"],
  ["compensation", "CompensationPage", "Batches"],
];
for (const [name, owner, heading] of workspaces) test(name + ": full workspace chrome translates without any database access", () => {
  const fixture = workspaceFixture("app/finance/" + name + "/page.tsx");
  const state = { [owner + ".loadingProfile"]: false, [owner + ".loading"]: false, [owner + ".profile"]: { role: "admin", financial_access: true, can_edit_company_ledger: true, can_void_company_ledger: true, can_edit_lawyer_compensation: true, can_void_lawyer_compensation: true } };
  const en = fixture.render("en", state), th = fixture.render("th", state);
  assert.match(en, new RegExp(heading)); assert.match(th, /[\u0e00-\u0e7f]/);
  assert.doesNotMatch(en.replace(/value="[^"]*"/g, ''), /[\u0e00-\u0e7f]/);
  assert.doesNotMatch(en + th, /finance\.(cash|legacy|compensation)\./);
});
test("legacy canonical categories, roles and statuses are display-only translations", () => {
  assert.equal(legacyCategoryLabel("ค่าเดินทาง", "en"), "Travel");
  assert.equal(legacyCategoryLabel("คำอธิบายที่ลูกค้ากรอก", "en"), "คำอธิบายที่ลูกค้ากรอก");
  assert.equal(compensationRoleLabel("Company Share", "th"), "ส่วนของบริษัท");
  assert.equal(compensationRoleLabel("บทบาทที่ระบุเอง", "en"), "บทบาทที่ระบุเอง");
  assert.equal(legacyStatusLabel("paid", "en"), "Paid");
  assert.equal(legacyStatusLabel("paid", "th"), "จ่ายแล้ว");
});
test("populated legacy rows, allocation editors and cash panels use localized display labels", () => {
  const allocation={id:"allocation",batch_id:"batch",recipient_type:"other",recipient_user_id:"",recipient_name:"Stored recipient",role_label:"Assistant",percent:"10",amount:"100",is_company_share:false,payment_status:"pending",note:""};
  const rows={
    compensation:{batches:[{id:"batch",status:"draft",received_date:"2026-09-01",received_amount:1000,formula_code:"custom"}],allocations:[allocation],allAllocations:[allocation],selectedMonth:"2026-09",openActionMenuId:"batch"},
    "expense-claims":{claims:[{id:"claim",claim_date:"2026-09-01",claimant_name:"Stored name",category:"ค่าเดินทาง",amount:100,status:"paid",ledger_entry_id:"fixture-ledger"}],openActionMenuId:"claim"},
    ledger:{rows:[{id:"entry",entry_date:"2026-09-01",entry_type:"expense",category:"ค่าเดินทาง",amount:100,status:"active",description:"Stored description"}]},
    "cash-transactions":{cashPanelOpen:true,balances:[{bank_account_id:"bank",short_name:"KBANK",currency:"THB",is_active:true,is_initialized:false}],transactions:[{id:"cash",bank_account_id:"bank",status:"draft",direction:"inflow",transaction_type:"manual",cash_amount:100,currency:"THB",occurred_at:"2026-09-01T12:00:00+07:00"}]},
  };
  for(const[name,owner]of workspaces){
    const state=Object.fromEntries(Object.entries({loadingProfile:false,loading:false,profile:{role:"admin",financial_access:true},...rows[name]}).map(([key,value])=>[owner+"."+key,value]));
    const fixture=workspaceFixture("app/finance/"+name+"/page.tsx"),before=JSON.stringify(state);
    const en=fixture.render("en",state),th=fixture.render("th",state);
    assert.doesNotMatch(en.replace(/value="[^"]*"/g,""),/[\u0e00-\u0e7f]/,name);
    assert.match(th,/[\u0e00-\u0e7f]/);assert.equal(JSON.stringify(state),before);
    assert.doesNotMatch(th,/Roles:|Posted:|Matter: Manual/);
  }
});
test("legacy unexpected error diagnostics preserve a safe primary message without credentials or SQL context", () => {
  const error = legacyOperationError({ message: "Unexpected failure\nCONTEXT: SELECT private data" }, uiMessage("finance.legacy.error.load"));
  assert.match(resolveUiMessage("en", error), /Unexpected failure/);
  assert.doesNotMatch(resolveUiMessage("en", error), /SELECT|CONTEXT/);
  const secret = legacyOperationError({ message: "token=secret-value failed for 3ecf3321-d5be-4ee8-9849-5fcf3973a57d" }, uiMessage("finance.legacy.error.load"));
  assert.doesNotMatch(resolveUiMessage("en", secret), /secret-value|3ecf3321/);
});
test("Cash timestamps, balances and legacy calculation/category contracts are unchanged", () => {
  const contracts = {
    "cash-transactions": ["emptyCashForm","openingFingerprint","cashFingerprint","isValidMoney","bangkokCompletedDayEnd","bangkokCashTimestamp","bangkokToday","bangkokDateKey"],
    ledger: ["emptyForm","incomeCategories","expenseCategories","transferCategories","claimantRequiredCategories","getBankSignedAmount","normalizeEntryType","getCategoryOptions","resolveEditCategory","getCategoryForSave","isClaimantRequired"],
    "expense-claims": ["emptyClaimForm","expenseCategories","toAmount"],
    compensation: ["emptyForm","roleLabels","recipientTypes","generateAllocations","getWorkPoolRecipientType","normalizeAllocationsForSave","isSourcePoolOwnerRow","getLedgerCategory","isSourcePoolRow","getCompanyShare"],
  };
  const declaration = (tree, name) => { for (const node of tree.statements) {
    if(ts.isFunctionDeclaration(node) && node.name?.text===name) return node.getText(tree);
    if(ts.isVariableStatement(node)) for(const d of node.declarationList.declarations) if(d.name.getText(tree)===name) return d.getText(tree);
  } return null; };
  for (const [name, names] of Object.entries(contracts)) {
    const file = "app/finance/" + name + "/page.tsx";
    const old = ts.createSourceFile(file,cp.execFileSync("git",["show","HEAD:"+file],{cwd:root,encoding:"utf8"}),99,true,ts.ScriptKind.TSX);
    const current = ts.createSourceFile(file,fs.readFileSync(root+"/"+file,"utf8"),99,true,ts.ScriptKind.TSX);
    for(const id of names) { assert.ok(declaration(old,id), name+"."+id); assert.equal(declaration(current,id),declaration(old,id),name+"."+id); }
    const calls=tree=>{const result=[];function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(tree)==="supabase.rpc")result.push(n.getText(tree));ts.forEachChild(n,visit);}visit(tree);return result;};
    assert.deepEqual(calls(current),calls(old),name+" RPCs");
  }
});
