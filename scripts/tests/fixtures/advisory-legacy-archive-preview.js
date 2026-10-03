// Synthetic localhost data only. Reuse current New workflows, replace archive reads.
import {supabase as base} from './advisory-flexible-journey-preview';
const old='10000000-0000-4000-8000-000000000001', newer='10000000-0000-4000-8000-000000000002';
const tables={
 advisory_matters:[{id:old,matter_no:'ADV-LEGACY-001',title:'Historical advisory matter',client:{name:'Historical Client'},client_id:'client',matter_type:'general_advisory',status:'active',responsible_lawyer:'Recorded lawyer',note:'Original history',new_creation:null},{id:newer,matter_no:'ADV-NEW-001',title:'New-origin matter canary',new_creation:[{kind:'create'}]}],
 advisory_issues:[{id:'issue',advisory_matter_id:old,issue_no:'ISSUE-1',title:'Historical issue',status:'open',next_action:'Historical issue next action',summary:'Original issue summary'}],
 advisory_issue_tasks:[{id:'task',advisory_matter_id:old,advisory_issue_id:'issue',title:'Shared task history',status:'completed',assignee_name:'Recorded assignee'}],
 advisory_time_logs:[{id:'time',advisory_matter_id:old,advisory_issue_id:'issue',minutes:90,staff_name:'Recorded staff',note:'Historical time entry',deleted_at:'2026-01-02T00:00:00Z'}],
 advisory_advice_records:[{id:'advice',advisory_matter_id:old,advisory_issue_id:'issue',question:'Historical question',advice_given:'Historical legal advice'}],
 case_audit_logs:[{id:'audit',record_id:'issue',table_name:'advisory_issues',created_at:'2026-01-01T00:00:00Z',action:'create',user_name:'Recorded actor',new_data:{title:'Historical issue'}}],
};
const isArchive=location.pathname.endsWith('/records')||location.pathname.includes('/issues/');
export const supabase={...base,async rpc(name,args){
 if(name==='advisory076_allowed'){window.calls.push({name,args});return{data:true};}
 if(!isArchive&&name==='advisory_control_write'&&args.p_action==='task_save'){
  window.calls.push({name,args});window.fixture.tasks.unshift({id:'new-task',...args.p_payload});window.fixture.matter.version++;return{data:{matter_id:window.fixture.matter.id,version:window.fixture.matter.version}};
 }
 return base.rpc(name,args);
},from(table){
 if(!isArchive||!tables[table])return base.from(table);
 let rows=tables[table],start=0,end=999;
 const q={select(){return q;},eq(k,v){if(k!=='new_creation.kind')rows=rows.filter(r=>r[k]===v);return q;},is(k,v){rows=rows.filter(r=>(r[k]??null)===v);return q;},in(k,vs){rows=rows.filter(r=>vs.includes(r[k]));return q;},order(){return q;},range(a,b){start=a;end=b;return q;},async maybeSingle(){const r=await q;return{data:r.data[0]||null};},then(resolve,reject){window.calls.push({table,archiveRead:true});return Promise.resolve({data:rows.slice(start,end+1)}).then(resolve,reject);}};
 return q;
}};
