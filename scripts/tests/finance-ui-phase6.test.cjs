/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),ts=require('typescript');
require('./receipt-render-fixture.cjs');
const React=require('react'),{renderToStaticMarkup:render}=require('react-dom/server');
const {FinanceStatusBadge,FinanceCard}=require('../../app/finance/ui/primitives.tsx');
const {financeStatusTone}=require('../../app/finance/ui/status.ts');
const {financeIcons}=require('../../app/finance/ui/icons.tsx');
const e=React.createElement;
test('Finance semantic status palette preserves caller labels and unknown neutrality',()=>{
 const cases={draft:'neutral',issued:'success',confirmed:'success',paid:'success',partial:'warning',outstanding:'warning',under_review:'warning',cancelled:'danger',voided:'danger',reversed:'danger',overdue:'danger',transfer:'transfer',approved:'info',unknown:'neutral'};
 for(const [status,tone]of Object.entries(cases)){assert.equal(financeStatusTone(status),tone);for(const label of ['สถานะจากต้นทาง','Authoritative status']){const html=render(e(FinanceStatusBadge,{status,label}));assert.match(html,new RegExp(`data-tone="${tone}"`));assert.ok(html.includes(label));assert.doesNotMatch(html,/<button|<input/);}}
});
test('Six card variants retain supplied amounts, currencies and actions without calculations',()=>{
 for(const variant of ['metric','source','action','attention','compact','summary']){const html=render(e(FinanceCard,{variant,icon:'bank',title:'KBANK',action:e('a',{href:'/finance/statement'},'Open')},'4,859.81 THB · WHT 140.19 THB'));assert.match(html,new RegExp(`data-card-variant="${variant}"`));assert.ok(html.includes('4,859.81 THB · WHT 140.19 THB'));assert.match(html,/href="\/finance\/statement"/);}
 for(const icon of ['quotation','agreement','billingPlan','invoice','payment','receipt','taxInvoice','directMoney','distribution','purchase','reimbursement','payable','statement','bank','cash','transfer','tax','vat','wht','alert','history','source','edit','confirm','cancel','reverse'])assert.ok(financeIcons[icon],icon);
});
test('Finance palette text contrast meets WCAG AA',()=>{
 const css=fs.readFileSync('app/finance/ui/finance-ui.module.css','utf8'),colors=Object.fromEntries([...css.matchAll(/--finance-([\w-]+):\s*(#[0-9a-f]{6})/g)].map(m=>[m[1],m[2]]));
 const lum=h=>h.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
 for(const [fg,bg]of [['text','surface'],['muted','surface'],['success','success-bg'],['warning','warning-bg'],['danger','danger-bg'],['info','info-bg']])assert.ok((Math.max(lum(colors[fg]),lum(colors[bg]))+.05)/(Math.min(lum(colors[fg]),lum(colors[bg]))+.05)>=4.5,fg);
 assert.doesNotMatch(css,/:root|:global|\.document\b/);
});
test('UI changes preserve database calls, mutations, handler guards and frozen documents',()=>{
 const baseline='7e631c7465f2750dfc95f45a55c4605dfa5b34db';
 const files=cp.execFileSync('git',['diff','--name-only',baseline],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
 assert.ok(files.every(f=>!f.endsWith('.sql')),'No SQL/migration change');
 const collect=source=>{const tree=ts.createSourceFile('component.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),calls=[],guards=[];function visit(n){if(ts.isCallExpression(n)&&/\.(rpc|from|insert|update|delete|upsert|select|eq|order|range|limit)$/.test(n.expression.getText(tree)))calls.push(n.getText(tree).replace(/\s+/g,' '));if(ts.isIfStatement(n))guards.push(n.expression.getText(tree).replace(/\s+/g,' '));ts.forEachChild(n,visit);}visit(tree);return {calls,guards};};
 for(const file of files.filter(f=>f.startsWith('app/')&&f.endsWith('.tsx'))){const old=cp.execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8'}),now=fs.readFileSync(file,'utf8');assert.deepEqual(collect(now),collect(old),file);}
 for(const file of files)assert.doesNotMatch(file,/(receipt-document|tax-invoice-document|combined-document|DocumentIdentity|LegalDocumentLayout|invoice-document)\.tsx$/);
});
test('Modal family retains existing focus/close lifecycle and mobile containment',()=>{
 const modal=fs.readFileSync('app/components/DetailModal.tsx','utf8'),wrapper=fs.readFileSync('app/finance/ui/FinanceModal.tsx','utf8');
 for(const marker of ['modalStack.at(-1)','previousFocusRef.current.focus','originalBodyStyle','closeOnBackdrop && event.target === event.currentTarget','onCloseRef.current()'])assert.ok(modal.includes(marker),marker);
 assert.match(wrapper,/<DetailModal \{\.\.\.props\}/);assert.doesNotMatch(wrapper,/supabase|\.rpc\(|useState|confirm\(/);
 for(const variant of ['detail','review','payment','destructive','source'])assert.ok(modal.includes(`"${variant}"`));
});
