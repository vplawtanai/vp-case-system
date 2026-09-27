"use client";
// One canonical Task UI/write path shared with Matter Control; no client-side audit duplicate.
import {useState,useRef} from 'react';
import {supabase} from '../../../../../../lib/supabase';
import {errorKey} from '../../../../../../lib/advisory-control';
import {useAdvisoryLabels,useControl,usePeople} from '../../../../control/shared';
import MatterSections from '../../../../control/MatterSections';
import MatterEditor,{type EditRequest} from '../../../../control/MatterEditor';
import css from '../../../../control/control.module.css';
type Props={advisoryMatterId:string;advisoryIssueId:string;clientId:string|null;canEdit:boolean;canDelete:boolean;actorName:string};
export default function AdvisoryIssueTasksSection({advisoryMatterId,advisoryIssueId,canEdit,canDelete}:Props){const {data,error,reload}=useControl(advisoryMatterId),people=usePeople(),{a}=useAdvisoryLabels();const [edit,setEdit]=useState<EditRequest|null>(null),[busy,setBusy]=useState(false),[failure,setFailure]=useState('');const retry=useRef<{body:string;id:string}|null>(null);const matter=data?.items[0];
 async function action(name:string,payload:Record<string,string>){if(!matter||busy)return;setBusy(true);setFailure('');const body=JSON.stringify({name,payload,version:matter.version});if(retry.current?.body!==body)retry.current={body,id:crypto.randomUUID()};const r=await supabase.rpc('advisory_control_write',{p_matter_id:matter.id,p_action:name,p_payload:payload,p_request_id:retry.current.id,p_expected_version:matter.version});if(r.error)setFailure(a(errorKey(r.error.message)));else{retry.current=null;await reload();}setBusy(false);}
 return <div className={css.page} style={{padding:0,minHeight:0}}>{(error||failure)&&<p role="alert" className={css.error}>{failure||a('loadError')}</p>}{matter&&<><MatterSections matter={matter} section="tasks" issueId={advisoryIssueId} people={people} canEdit={canEdit&&data.permissions.task} canSetNext={data.permissions.manage} canDelete={canDelete&&data.permissions.delete} busy={busy} onEdit={setEdit} onAction={action}/>{edit&&<MatterEditor key={JSON.stringify(edit)} request={edit} matter={matter} people={people} stages={data.stages} onClose={()=>setEdit(null)} onSaved={reload}/>}</>}</div>;
}
