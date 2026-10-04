import {effective,type Person,type Engagement,type Rate} from './model';

export type SetupKind='engagement'|'rate';
export type SetupIntent='correct'|'future';
export function setupTarget(person:Person|null,kind:SetupKind,month:string):Engagement|Rate|undefined{
 const events:(Engagement|Rate)[]=person?(kind==='rate'?person.rates:person.engagements):[];
 return effective(events,month.slice(0,7)+'-31')||[...events].sort((a,b)=>a.effective_from.localeCompare(b.effective_from))[0];
}
export function setupChange({kind,intent,person,target,values,hash,id}:{kind:SetupKind;intent:SetupIntent;person:Person;target:Engagement|Rate|undefined;values:{effective_from:string;reason:string;kind?:string;monthly_amount?:number};hash?:string;id:string}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(values.effective_from)||!values.reason.trim())throw Error('PAYROLL_SETUP_INVALID');
 if(intent==='correct'&&target){
  if(!hash)throw Error('PAYROLL_CORRECTION_STALE');
  return{action:'setup_correct',payload:{kind,payee_id:person.id,target:target.id,expected_hash:hash,values}};
 }
 if(target&&values.effective_from<=target.effective_from)throw Error('PAYROLL_FUTURE_DATE_REQUIRED');
 return{action:kind,payload:{id,payee_id:person.id,...values,...(kind==='engagement'?{active:true}:{})}};
}

export const setupText={
 correct:['แก้ข้อมูลเดิมที่กรอกผิด','Correct an entry mistake'],
 future:['เปลี่ยนตั้งแต่วันที่ใหม่','Change from a new effective date'],
 correctionHint:['แก้ประวัติรายการนี้ได้เมื่อยังไม่ถูกใช้ในรายการที่ยืนยันหรือจ่ายแล้ว รายการรายเดือนที่เกี่ยวข้องและยังไม่ยืนยันต้องตรวจยอด ภาษี และประกันสังคมใหม่','Correct only unused, unfinalized history. Related unfinished monthly lines will need a new review of amounts, tax and social security.'],
 futureHint:['เพิ่มประวัติใหม่และเก็บข้อมูลเดิม การเปลี่ยนลูกจ้าง ↔ ผู้รับจ้างที่ต่อเนื่องกันต้องเริ่มวันที่ 1 ของเดือน','Add new history and retain the old entry. A continuing Employee ↔ Contractor change must start on the first of a month.'],
 finalized:['ข้อมูลนี้ถูกใช้ในรายการที่ยืนยันหรือจ่ายแล้ว ไม่สามารถแก้ย้อนหลังได้ กรุณาสร้างการเปลี่ยนแปลงใหม่โดยกำหนดวันที่มีผล','This entry is used by finalized or paid Payroll. It cannot be corrected retroactively. Add a new effective-dated change.'],
 collision:['วันที่มีผลนี้มีประวัติอยู่แล้ว กรุณาแก้รายการเดิมหรือเลือกวันที่ใหม่ที่ไม่ซ้ำ','An entry already uses this effective date. Correct that entry or choose a different date.'],
 boundary:['P1 ไม่รองรับลูกจ้างและผู้รับจ้างในเดือนเดียวกัน กรุณากำหนดการเปลี่ยนประเภทเป็นวันที่ 1 ของเดือน','P1 does not support Employee and Contractor treatment within one month. Set the type change to the first of a month.'],
 stale:['ข้อมูลถูกแก้ไขจากอีกหน้าหนึ่ง กรุณาปิดหน้าต่างและโหลดใหม่ก่อนแก้ไข','The data changed in another session. Close this dialog and reload before editing.'],
 invalid:['กรุณาระบุวันที่มีผลที่ถูกต้อง เหตุผล และค่าตอบแทนมากกว่าศูนย์เมื่อแก้อัตรา','Enter a valid effective date and reason, and a positive amount when changing a rate.'],
 futureDate:['การเปลี่ยนแปลงใหม่ต้องมีผลหลังวันที่เดิม หากกรอกวันผิดให้เลือกแก้ข้อมูลเดิม','A new change must start after the existing effective date. To fix an incorrect date, choose to correct the existing entry.'],
} as const;
export const setupLabel=(locale:string,key:keyof typeof setupText)=>setupText[key][locale==='en'?1:0];
export function setupError(locale:string,code:string){
 const key:Record<string,keyof typeof setupText>={PAYROLL_SETUP_FINALIZED:'finalized',PAYROLL_EFFECTIVE_DATE_COLLISION:'collision',PAYROLL_TYPE_MONTH_BOUNDARY_REQUIRED:'boundary',PAYROLL_CORRECTION_STALE:'stale',PAYROLL_SETUP_INVALID:'invalid',PAYROLL_FUTURE_DATE_REQUIRED:'futureDate'};
 return key[code]?setupLabel(locale,key[code]):null;
}
