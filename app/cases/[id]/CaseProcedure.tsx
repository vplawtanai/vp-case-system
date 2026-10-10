'use client';
import {useEffect,useState} from 'react';
import {supabase} from '../../../lib/supabase';
import CaseFlow from './CaseFlow';
import CaseService from './CaseService';
import CaseDefendant from './CaseDefendant';
import {DEFENDANT_TEMPLATE,type DefendantContext,type DefendantData,type DefendantParty} from './defendant-model';
import type {AnswerRequest,ServiceDeadline} from './service-model';
import {useDefendantText} from './defendant-labels';
import base from './case-detail.module.css';

export default function CaseProcedure({caseId,revision,canStart,canTransition,caseRecord,answerRequest,onExtend,onDefendantData}:{caseId:number;revision:number;canStart:boolean;canTransition:boolean;caseRecord:{court_name?:string|null;case_number?:string|null;case_type?:string|null};answerRequest:AnswerRequest|null;onExtend:(partyId:string,deadlineId:string)=>void;onDefendantData:(data:DefendantData|null)=>void}){
 const {t}=useDefendantText();
 const [context,setContext]=useState<DefendantContext|null>(null),[mainTemplate,setMainTemplate]=useState<string|null>(null),[selected,setSelected]=useState(false),[error,setError]=useState(false),[reload,setReload]=useState(0),[refreshing,setRefreshing]=useState(false);
 useEffect(()=>{let live=true;void(async()=>{try{
  const [read,main]=await Promise.all([supabase.rpc('case104_read',{p_case_id:caseId}),supabase.from('case_flow_instances').select('template_id').eq('case_id',caseId).eq('track_key','main').maybeSingle()]);
  if(read.error)throw read.error;if(main.error)throw main.error;
  const data=read.data as DefendantData,template=(main.data?.template_id as string)||null;
  let parties:DefendantParty[]=[],manualDeadlines:ServiceDeadline[]=[],actors:Record<string,string>={};
  if(selected||data.flow||data.represented.length){
   const [p,d,links,people]=await Promise.all([
    supabase.from('parties').select('id,case_id,role,order_no,entity_type,title,first_name,last_name,company_name,deleted_at').eq('case_id',caseId).in('role',['defendant','plaintiff']).order('order_no'),
    supabase.from('case_deadlines').select('id,deadline_type,current_due_date,original_due_date,updated_at,status,deleted_at').eq('case_id',caseId).eq('deadline_type','answer').eq('status','Active').is('deleted_at',null),
    supabase.from('case_service_controls').select('answer_deadline_id,default_deadline_id').eq('case_id',caseId),
    supabase.from('user_profiles').select('id,staff_name,full_name')]);
   if(p.error)throw p.error;if(d.error)throw d.error;if(links.error)throw links.error;
   parties=p.data as DefendantParty[];
   const linked=new Set((links.data||[]).flatMap(c=>[c.answer_deadline_id,c.default_deadline_id]));
   manualDeadlines=(d.data as ServiceDeadline[]).filter(x=>!linked.has(x.id));
   if(!people.error)actors=Object.fromEntries((people.data||[]).map(p=>[p.id,p.staff_name||p.full_name||'']));
  }
  if(live){setContext({data,parties,manualDeadlines,actors});setMainTemplate(template);setError(false);setRefreshing(false);onDefendantData(data.flow||data.represented.length?data:null);}
 }catch{if(live){setError(true);setRefreshing(false);}}})();return()=>{live=false;};},[caseId,revision,reload,selected,onDefendantData]);
 if(error)return <p role="alert" className={base.notice}>{t('loadFailed')} <button type="button" onClick={()=>setReload(n=>n+1)}>{t('reload')}</button></p>;
 if(!context||refreshing)return <p role="status">{t('loading')}</p>;
 const ownsDefendant=!!context.data.flow||context.data.represented.length>0;
 const showDefendant=ownsDefendant||selected;
 const conflict=mainTemplate!==null&&mainTemplate!==DEFENDANT_TEMPLATE;
 const civil=!caseRecord.case_type||['civil','แพ่ง','คดีแพ่ง'].includes(caseRecord.case_type.toLowerCase());
 return <>
 {showDefendant?<>{conflict?<p className={base.notice} role="alert">{t('error.conflict')}</p>:<CaseDefendant caseId={caseId} context={context} canLegal={canStart} canRecord={canTransition} answerRequest={answerRequest} onReload={()=>setReload(n=>n+1)} onSaved={()=>{setRefreshing(true);window.dispatchEvent(new Event('case-detail-updated'));setReload(n=>n+1);}}/>}{!ownsDefendant&&<button type="button" className={base.coreTextButton} onClick={()=>setSelected(false)}>{t('back')}</button>}</>:<>
 <CaseFlow caseId={caseId} revision={revision} canStart={canStart} canTransition={canTransition} caseRecord={caseRecord}/>
 <CaseService caseId={caseId} revision={revision} canRecord={canTransition} canConfirm={canStart} answerRequest={answerRequest} onExtend={onExtend}/>
 {canStart&&civil&&<button type="button" className={base.coreTextButton} onClick={()=>{setRefreshing(true);setSelected(true);}}>{t('selectDefendant')}</button>}
 </>}
 </>;
}
