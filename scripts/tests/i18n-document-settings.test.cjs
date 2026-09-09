/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), cp = require("node:child_process"), ts = require("typescript"), React = require("react");
const { root } = require("./receipt-render-fixture.cjs");
const { workspaceFixture } = require("./i18n-workspace-fixture.cjs");
const { translate } = require(root + "/lib/i18n/catalog.ts");
const { useI18n } = require(root + "/lib/i18n/provider.tsx");
const shared = {
  useDocumentPlatformAccess: () => ({ allowed: true, loading: false, role: "admin" }),
  canApproveDocumentPlatform: () => true,
  AccessState: () => null,
  DocumentPlatformPage: ({ children }) => children,
  StatusBadge: ({ status }) => { const { locale }=useI18n(); return React.createElement("span", null, translate(locale, "settings.documents.status."+status)); },
  RiskBadge: ({ risk }) => { const { locale }=useI18n(); return React.createElement("span", null, translate(locale,"settings.documents.risk."+(risk||"informational"))); },
  statusLabel: (code, locale="th") => translate(locale,"settings.documents.status."+code),
  riskLabel: (code, locale="th") => translate(locale,"settings.documents.risk."+code),
  languageLabel: (code, locale="th") => translate(locale,"settings.documents.language."+code),
  documentTypeLabel: (code, locale="th") => translate(locale,"settings.documents.document."+code),
  formatDateTime: () => "01 Jan 2026",
};
const make=(file,names=[])=>workspaceFixture(file,names,{"../../document-platform-shared":shared,"../document-platform-shared":shared,"../../../document-platform-shared":shared});
function bilingual(fixture,state) {
  const before=JSON.stringify(state), en=fixture.render("en",state), th=fixture.render("th",state);
  assert.doesNotMatch(en.replace(/value="[^"]*"/g,"").replace(/<textarea[^>]*>[\s\S]*?<\/textarea>/g,""),/[\u0e00-\u0e7f]/);
  assert.match(th,/[\u0e00-\u0e7f]/);
  assert.equal(JSON.stringify(state),before);
  return en;
}
test("document identity, service patterns and signer controls translate; stored identity stays unchanged",()=>{
  const fixture=workspaceFixture("app/settings/document-settings/page.tsx");
  const owner="DocumentSettingsPage.";
  bilingual(fixture,{[owner+"loading"]:false,[owner+"role"]:"admin",[owner+"isServicePatternFormOpen"]:true});
});
test("clause Draft, review and historical versions are bilingual without changing legal wording",()=>{
  const fixture=make("app/settings/document-clauses/[id]/page.tsx");
  const owner="DocumentClauseDetailPage.";
  for(const status of ["draft","under_review","published","retired"]) {
    const version={id:"version",clause_id:"family",version_no:2,language_code:"th",title:"Original legal title",content:"Original legal wording",status,metadata_json:{},content_format:"plain_text"};
    const state={[owner+"loading"]:false,[owner+"family"]:{id:"family",clause_code:"CODE",is_active:true},[owner+"versions"]:[version],[owner+"selectedVersionId"]:"version",[owner+"familyName"]:"Original legal title",[owner+"editingFamily"]:true,[owner+"showPublishReview"]:true};
    bilingual(fixture,state);
  }
});
test("template certification, section/slot editors and renderer-generated empty states are bilingual",()=>{
  const fixture=make("app/settings/document-templates/[id]/page.tsx",["emptySectionForm","emptySlotForm","emptySectionClauseMessage"]);
  const owner="DocumentTemplateDetailPage.";
  for(const status of ["draft","under_review","published","retired"]) {
    const version={id:"version",version_no:2,language_code:"th",status,definition_json:{},renderer_schema_version:3};
    const sections=["preamble","normal","execution"].map((kind,index)=>({...fixture.emptySectionForm(index+1),id:kind,title:"Original section "+index,section_kind:kind,section_code:kind,template_version_id:"version"}));
    const state={[owner+"loading"]:false,[owner+"template"]:{id:"family",name:"Original template",template_code:"CODE",document_type:"fee_agreement",status:"active",language_code:"th",metadata_json:{inactive_shell:false,legal_wording_approved:true}},[owner+"versions"]:[version],[owner+"selectedVersionId"]:"version",[owner+"sections"]:sections,[owner+"sectionForm"]:fixture.emptySectionForm(4),[owner+"slotForm"]:fixture.emptySlotForm("normal",1),[owner+"editingFamily"]:true,[owner+"editingVersion"]:true};
    bilingual(fixture,state);
  }
  for(const kind of ["preamble","execution","normal"])assert.doesNotMatch(fixture.emptySectionClauseMessage(kind,"en"),/[\u0e00-\u0e7f]/);
});
test("Settings translations cannot change RPC arguments, data defaults or template preview legal document",()=>{
  const files=["document-settings/page.tsx","document-clauses/page.tsx","document-clauses/[id]/page.tsx","document-templates/page.tsx","document-templates/[id]/page.tsx"];
  const calls=source=>{const tree=ts.createSourceFile("fixture.tsx",source,99,true,ts.ScriptKind.TSX),result=[];function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(tree)==="supabase.rpc")result.push(n.getText(tree));ts.forEachChild(n,visit);}visit(tree);return result;};
  for(const path of files){const file="app/settings/"+path,old=cp.execFileSync("git",["show","HEAD:"+file],{cwd:root,encoding:"utf8"}),current=fs.readFileSync(root+"/"+file,"utf8");assert.deepEqual(calls(current),calls(old),file);}
  const file="app/settings/document-templates/[id]/preview/page.tsx",old=cp.execFileSync("git",["show","HEAD:"+file],{cwd:root,encoding:"utf8"}),current=fs.readFileSync(root+"/"+file,"utf8");
  const document=s=>s.slice(s.indexOf("<LegalDocumentLayout"),s.indexOf("</LegalDocumentLayout>")+22);
  assert.equal(document(current),document(old));
  const renderers=s=>s.slice(s.indexOf("function Preamble"),s.indexOf("function contextLabel"));
  assert.equal(renderers(current),renderers(old));
});
