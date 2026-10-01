/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {fixture,database}=require('./fixtures/client-workspace.cjs');
const {readClientDirectory,readClientWorkspace}=require('../../lib/client-workspace-read.ts');
const {summarizeClient,bangkokDay}=require('../../lib/client-workspace.ts');
const {cleanNoteText}=require('../../app/clients/workspace/note-text.ts');
const shared=workspaceFixture('app/advisory/control/shared.tsx',['Badge','useAdvisoryLabels']);
const ui=workspaceFixture('app/clients/workspace/ClientWorkspace.tsx',['ClientWorkspaceContent','ClientViewToggle'],{
 '../../advisory/control/shared':{Badge:shared.component('Badge'),useAdvisoryLabels:shared.useAdvisoryLabels},
});
async function loaded(){const f=fixture(),mock=database(f);return {f,...mock,data:await readClientWorkspace(mock.db,'client-a')};}
test('caller-scoped read loads every page and matches shared client_id, never client name',async()=>{
 const {data,calls,db}=await loaded();assert.equal(data.matters.length,4);assert.deepEqual(data.cases.map(c=>c.id),[101,102]);
 assert.ok(!data.tasks.some(t=>['foreign','removed'].includes(t.id)));
 const clients=await readClientDirectory(db);assert.equal(clients.length,3);assert.equal(clients.filter(c=>c.name==='ABC Trade').length,2);
 assert.ok(calls.some(c=>c.name==='advisory_control_read'&&c.args.p_query.offset===3));
 assert.ok(calls.some(c=>c.table==='advisory_issue_tasks'&&c.start===3));
 assert.ok(calls.filter(c=>c.table==='cases').every(c=>c.filters.some(([op,k,v])=>op==='eq'&&k==='client_id'&&v==='client-a')));
 assert.ok(calls.every(c=>!c.table||c.fields!=='*'));assert.ok(calls.every(c=>!c.name||['advisory_control_read','advisory_overdue_work'].includes(c.name)));
});
test('completed, cancelled, closed-matter tasks and stale linked Next Actions cannot reappear; linked open task is counted once',async()=>{
 const {data}=await loaded(),s=summarizeClient(data,'2026-10-01');assert.equal(s.openMatters,3);assert.equal(s.openCases,1);
 assert.deepEqual(s.actions.map(a=>a.key).sort(),['advisory:next_action:three','advisory:task:open','case:task:ct']);
 assert.equal(s.urgent.filter(a=>a.ref.kind==='advisory').length,1);assert.equal(s.urgent[0].overdueDays,2);
 assert.equal(s.actions.filter(a=>a.ref.id==='two').length,0);assert.equal(s.upcoming.length,4);
 assert.ok(s.actions.filter(a=>a.ref.kind==='case').every(a=>a.ref.href==='/cases/101'));
 assert.ok(!s.urgent.some(a=>/filed|enforced|note-event/.test(a.key)));
});
test('projection rejects cross-client rows defensively, preserves null Stage and real latest update',async()=>{
 const {data,f}=await loaded();data.matters.push(f.matters.find(m=>m.id==='foreign'));data.cases.push(f.cases[2]);data.caseNotes.push({id:'wrong',case_id:103,note_text:'PRIVATE',note_date:'2099-01-01'});
 const s=summarizeClient(data,'2026-10-01');assert.equal(s.matters.length,4);assert.equal(s.cases.length,2);assert.equal(s.notes.length,2);assert.equal(s.matters.find(m=>m.id==='two').stage_key,null);assert.equal(s.latest,'2026-09-30T10:00:00Z');
});
test('Bangkok date rolls at business midnight and closed Case/date states never count',async()=>{
 assert.equal(bangkokDay(new Date('2026-09-30T16:59:59Z')),'2026-09-30');assert.equal(bangkokDay(new Date('2026-09-30T17:00:00Z')),'2026-10-01');
 const {data}=await loaded();data.caseDates.push({id:'cancel',case_id:101,kind:'hearing',status:'Cancelled',date:'2026-09-01'},{id:'closed',case_id:102,kind:'deadline',status:'Pending',date:'2026-09-01'});
 assert.equal(summarizeClient(data,'2026-10-01').urgent.filter(a=>a.overdueDays>0).length,1);
});
test('inactive/forced-password/unauthorized profiles are denied before client reads',async()=>{
 for(const patch of [{active:false},{must_change_password:true},{role:'viewer'}]){const f=fixture();Object.assign(f.profile,patch);const {db,calls}=database(f);await assert.rejects(readClientWorkspace(db,'client-a'),/CLIENT_ACCESS_DENIED/);assert.ok(calls.every(c=>c.table==='user_profiles'));}
});
test('existing permitted non-admin can read; unavailable source is not reported as an empty total',async()=>{
 const f=fixture();f.profile.role='lawyer';const {db,state}=database(f);assert.equal((await readClientWorkspace(db,'client-a')).cases.length,2);
 for(const source of ['cases','case_notes','advisory_issue_tasks','advisory_overdue_work','advisory_control_read']){state.fail=source;await assert.rejects(readClientWorkspace(db,'client-a'),/CLIENT_READ_FAILED/);}
 state.fail=null;await assert.rejects(readClientWorkspace(db,'deleted-client'),/CLIENT_READ_FAILED/);
});
test('true empty client shows no fabricated activity/history; distinct same-name client stays isolated',async()=>{
 const {db}=database();const empty=summarizeClient(await readClientWorkspace(db,'client-empty'),'2026-10-01');assert.equal(empty.openMatters,0);assert.equal(empty.openCases,0);assert.equal(empty.latest,null);assert.equal(empty.actions.length,0);
 const other=await readClientWorkspace(db,'client-b');assert.equal(other.client.contact_name,'Different Contact');assert.deepEqual(other.cases.map(c=>c.id),[103]);assert.deepEqual(other.matters.map(m=>m.id),['foreign']);
});
test('note display removes common Markdown while preserving Thai/English content and readable lines',()=>{
 const raw='# **หมายเหตุ**\n\n- **ติดตาม** เอกสาร\n- [x] _Review_ complete\n> ~~Old~~ `new`\n[Reference](https://example.invalid)\n```text\nplain text\n```';
 assert.equal(cleanNoteText(raw),'หมายเหตุ\n\n• ติดตาม เอกสาร\n☑ Review complete\nOld new\nReference (https://example.invalid)\n\nplain text');
 assert.equal(cleanNoteText('Matter ADV-2026-009: account_id, x_y_z, 2 * 3 = 6, 1. Item'),'Matter ADV-2026-009: account_id, x_y_z, 2 * 3 = 6, 1. Item');
 assert.equal(cleanNoteText('\\*literal\\* and ![ภาพ](image.png)'),' *literal* and ภาพ'.trim());
});
for(const locale of ['th','en']){
 test(locale+': all internal note sources are clean React text; original notes and HTML safety preserved',async()=>{
  const {data}=await loaded();data.client.note='**Client note**';data.activities[0].detail.input.text='## Advisory note\n**ติดตาม**';data.caseNotes[0].note_title='__Case note__';data.caseNotes[0].note_text='<img src=x onerror="alert(1)"><script>alert(2)</script>';
  const before=JSON.stringify(data),html=ui.render(locale,{}, {data},'ClientWorkspaceContent');
  assert.ok(html.includes('Client note'));assert.ok(html.includes('Advisory note\nติดตาม'));assert.ok(html.includes('Case note'));
  assert.doesNotMatch(html,/\*\*Client|## Advisory|__Case|<img\b|<script\b|href="javascript:/);assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&lt;script&gt;'));
  assert.equal(JSON.stringify(data),before);
 });
 test(locale+': latest five activities are visible initially, ordered newest first, with show-all/less',async()=>{
  const {data}=await loaded();data.activities=Array.from({length:7},(_,i)=>({id:'activity-'+i,matter_id:'one',kind:'stage',occurred_at:`2026-09-${String(10+i).padStart(2,'0')}T10:00:00Z`,detail:{}}));
  const title=locale==='th'?'กิจกรรมล่าสุด':'Recent activity';
  const section=html=>html.match(new RegExp(`<section[^>]*aria-label="${title}"[\\s\\S]*?</section>`))[0];
  const initial=section(ui.render(locale,{}, {data},'ClientWorkspaceContent'));
  assert.equal((initial.match(/<li\b/g)||[]).length,5);assert.doesNotMatch(initial,/<details|<summary|\shidden(?:=|[ >])/);assert.ok(initial.includes(locale==='th'?'ดูทั้งหมด':'Show all'));
  assert.ok(initial.indexOf(locale==='th'?'16 ก.ย.':'16 Sept')<initial.indexOf(locale==='th'?'12 ก.ย.':'12 Sept'));
  const expanded=section(ui.render(locale,{'ClientWorkspaceContent.activityExpanded':true},{data},'ClientWorkspaceContent'));
  assert.equal((expanded.match(/<li\b/g)||[]).length,7);assert.ok(expanded.includes(locale==='th'?'แสดงน้อยลง':'Show less'));
 });
 test(locale+': activity empty state is immediately visible only when there are no records',async()=>{
  const {data}=await loaded();data.activities=[];const html=ui.render(locale,{}, {data},'ClientWorkspaceContent');
  assert.ok(html.includes(locale==='th'?'ยังไม่มีกิจกรรมบันทึกไว้':'No recorded activity'));assert.doesNotMatch(html,/<details|<summary/);
 });
 test(locale+': workspace renders translated controls, correct source links, honest legacy Stage and no financial surface',async()=>{
  const {data}=await loaded(),html=ui.render(locale,{}, {data},'ClientWorkspaceContent');
  for(const href of ['/advisory/one','/advisory/two','/cases/101','/cases/102'])assert.ok(html.includes('href="'+href+'"'));
  assert.ok(html.includes(locale==='th'?'งานนอกคดีทั้งหมด':'All Non-Litigation matters'));assert.ok(html.includes(locale==='th'?'ยังไม่กำหนดขั้นตอนปัจจุบัน':'Current stage not set'));
  assert.ok(html.includes(locale==='th'?'บริษัทจำกัด':'Limited Company'));assert.ok(html.includes(locale==='th'?'เตรียมเอกสาร':'Prepare documents'));
  assert.doesNotMatch(html,/retainer|profitability|fee_amount|\/finance\/|type="file"|href="\/advisory\/101"/i);
  const toggle=ui.render(locale,{}, {view:'clients',onChange(){}},'ClientViewToggle');assert.match(toggle,/aria-selected="true"/);assert.ok(toggle.includes(locale==='th'?'มุมมองลูกค้า':'Client view'));
 });
 test(locale+': filtered empty and unavailable Cases are explicit',async()=>{
  const {data}=await loaded();data.cases=null;
  const html=ui.render(locale,{'ClientWorkspaceContent.matterSearch':'no-such-matter'},{data},'ClientWorkspaceContent');
  assert.ok(html.includes(locale==='th'?'ไม่พบงานที่ตรงกับการค้นหา':'No matching work'));assert.ok(html.includes(locale==='th'?'คุณไม่มีสิทธิ์ดูข้อมูลคดี':'You do not have access to cases'));
 });
}
