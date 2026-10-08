"use client";
import { useEffect, useState } from "react";
import { CalendarDays, ListTodo, Clock3, BellRing, UserRound } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { buildAlertCandidates, casePreview, type CaseTask, type CaseDeadline, type CaseTimeline, type CaseEnforcement } from "../case-list-model";
import { alertLabel, caseTerm } from "../labels";
import { useCaseDetailText } from "./labels";
import css from "./case-detail.module.css";

export default function CaseSummary({ caseId, revision, onSection, coreSummary }: { caseId: number; revision: number; onSection: (section: string) => void; coreSummary?: {next:string;nextDetail:string;currentActor:string;onNext:()=>void;onActor:()=>void} }) {
  const { tr, date, locale } = useCaseDetailText();
  const [data, setData] = useState<{ tasks: CaseTask[]; deadlines: CaseDeadline[]; timeline: CaseTimeline[]; enforcements: CaseEnforcement[] } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const read = async () => {
      const results = await Promise.all([
        supabase.from("case_tasks").select("case_id,task_type,task_other,due_date,status").eq("case_id",caseId).is("deleted_at",null),
        supabase.from("case_deadlines").select("case_id,deadline_type,deadline_other,current_due_date,status").eq("case_id",caseId).is("deleted_at",null),
        supabase.from("case_timeline").select("case_id,event_type,event_date,event_time,appointment_type,appointment_other,order_no,status").eq("case_id",caseId).is("deleted_at",null),
        supabase.from("case_enforcements").select("case_id,party_label,party_other,final_due_date,writ_request_date,writ_issued_date,status").eq("case_id",caseId).is("deleted_at",null),
      ]);
      if (!active) return;
      setFailed(results.some(result => !!result.error));
      if (!results.some(result => !!result.error)) setData({tasks:results[0].data || [],deadlines:results[1].data || [],timeline:results[2].data || [],enforcements:results[3].data || []});
    };
    void read().catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [caseId, revision]);
  if (failed) return <div role="alert" className={css.notice}>{tr("Could not load case data. Please refresh.")}</div>;
  if (!data) return <div role="status" className={css.notice}>{tr("Loading...")}</div>;
  const { hearing, task, deadline } = casePreview(caseId,data.tasks,data.deadlines,data.timeline);
  const alerts = buildAlertCandidates(data.tasks,data.deadlines,data.timeline,data.enforcements);
  const next = alerts[0];
  const cards = [
    {key:"timeline",title:"Next hearing",icon:CalendarDays,value:hearing ? date(hearing.event_date) : tr("No upcoming hearing"),detail:hearing ? `${hearing.appointment_type === "นัดอื่นๆ" ? hearing.appointment_other || tr("Court Appointments") : caseTerm(hearing.appointment_type,locale)} ${hearing.event_time?.slice(0,5)||""}` : ""},
    {key:"tasks",title:"Next task",icon:ListTodo,value:task ? (task.task_type === "อื่นๆ" ? task.task_other || tr("Task") : caseTerm(task.task_type,locale)) : tr("No pending task"),detail:task ? (task.due_date ? date(task.due_date) : tr("No Due Date")) : ""},
    {key:"deadlines",title:"Nearest deadline",icon:Clock3,value:deadline ? date(deadline.current_due_date) : tr("No pending deadline"),detail:deadline ? (deadline.deadline_type === "other" ? deadline.deadline_other || tr("Deadline") : caseTerm(deadline.deadline_type,locale)) : ""},
    {key:next?.kind === "enforcement" ? "enforcement" : next?.kind === "task" ? "tasks" : next?.kind === "hearing" ? "timeline" : "deadlines",title:"Current alerts",icon:BellRing,value:next ? alertLabel(next,locale) : tr("No current alerts"),detail:next ? date(next.date) : ""},
  ];
  const shown = coreSummary ? [cards[0],cards[2],{key:"primary",title:"Primary next action",icon:ListTodo,value:coreSummary.next,detail:coreSummary.nextDetail},{key:"actor",title:"role.current_actor",icon:UserRound,value:coreSummary.currentActor,detail:""}] : cards;
  return <><div className={css.summary}>{shown.map(({key,title,icon:Icon,value,detail},i)=><button key={title} className={css.summaryCard} data-tone={i} onClick={()=>key==="primary"?coreSummary?.onNext():key==="actor"?coreSummary?.onActor():onSection(key)}><Icon size={21}/><span><small>{tr(title)}</small><strong>{value}</strong>{detail && <span>{detail}</span>}</span></button>)}</div>{coreSummary && next && <button className={css.coreAlert} onClick={()=>onSection(cards[3].key)}><BellRing size={16}/>{tr("Current alerts")}: {alertLabel(next,locale)} · {date(next.date)}</button>}</>;
}
