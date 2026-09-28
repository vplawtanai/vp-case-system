"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '../../../lib/supabase';
import {errorKey,type Matter} from '../../../lib/advisory-control';
import {controlTicket,type WritePayload,type WriteTicket,type WorkflowChecks} from '../../../lib/advisory-workflow';
import {useAdvisoryLabels} from './shared';
export function useMatterWrite(matter:Matter){const {a}=useAdvisoryLabels();const [busy,setBusy]=useState(false),[error,setError]=useState('');const locked=useRef(false),ticket=useRef<WriteTicket|null>(null);
 async function write(action:string,payload:WritePayload){if(locked.current)return null;locked.current=true;setBusy(true);setError('');ticket.current=controlTicket(ticket.current,matter.id,action,payload,matter.version,()=>crypto.randomUUID());try{const r=await supabase.rpc('advisory_control_write',{p_matter_id:matter.id,p_action:action,p_payload:payload,p_request_id:ticket.current.id,p_expected_version:matter.version});if(r.error)throw r.error;ticket.current=null;return r.data as {ready_for_closing?:boolean;matter_id:string;version:number};}catch(e){setError(a(errorKey(String((e as {message?:string})?.message||e))));return null;}finally{locked.current=false;setBusy(false);}}
 return {write,busy,error};
}
export function useWorkflowChecks(matter:Matter){const [checks,setChecks]=useState<WorkflowChecks|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true);const sequence=useRef(0);
 const reload=useCallback(async()=>{const n=++sequence.current;setLoading(true);setError(false);try{const r=await supabase.rpc('advisory_workflow_checks',{p_matter_id:matter.id});if(n===sequence.current){setChecks(r.error?null:r.data);setError(!!r.error);}}catch{if(n===sequence.current){setError(true);setChecks(null);}}finally{if(n===sequence.current)setLoading(false);}},[matter.id]);
 const cancel=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{void reload();return cancel;},[reload,cancel,matter.version]);return {checks,error,loading,reload};
}
