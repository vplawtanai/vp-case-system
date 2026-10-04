import {effective,hasPayrollHistory,payrollSetupPeople,type Person} from './model';
import type {MonthlyRow,WorkspaceData} from './monthly';
export const singleText={
 intro:['ดูค่าตอบแทนรายเดือน แก้ไขข้อมูล และจ่ายเงินให้บุคลากรในหน้าเดียว','Review monthly compensation, edit details and pay your people on one page'],
 recurring:['ค่าตอบแทนประจำ','Recurring compensation'],extras:['ค่าตอบแทนเพิ่มเติม','Additional compensation'],deductions:['หักอื่น','Other deductions'],status:['สถานะ','Status'],edit:['แก้ไขยอด','Edit amount'],editMonth:['แก้ไขรายการเดือนนี้','Edit this month'],editRate:['แก้ไขค่าตอบแทนประจำ','Edit recurring compensation'],manage:['จัดการข้อมูล','Manage details'],reset:['ลบ / เริ่มใหม่','Remove / start again'],deleteSetup:['ลบการตั้งค่าบุคลากร','Delete Payroll setup'],deleteRate:['ลบอัตราค่าตอบแทนที่สร้างผิด','Delete an incorrect compensation rate'],
 deleteHint:['ลบเฉพาะข้อมูล Payroll ที่ยังไม่ยืนยัน พร้อมบันทึกเหตุผล ผู้รับเงินและบัญชีธนาคารใน Finance ยังคงเดิม','Remove only unfinished Payroll data and record the reason. The shared Finance payee and bank details remain.'],
 resetHint:['ล้างยอดและการตรวจทานของเดือนนี้ จากนั้นเริ่มใหม่จากค่าตอบแทนประจำได้ ไม่กระทบเดือนที่จ่ายแล้ว','Clear this month’s amounts and review, then start again from recurring compensation. Paid months are unchanged.'],
 affected:['จะล้างรายการรายเดือนที่ยังไม่ยืนยัน {n} รายการด้วย','This also clears {n} affected unfinished monthly lines'],
 locked:['มีรายการยืนยันแล้วหรือประวัติการจ่ายอ้างอิง จึงลบย้อนหลังไม่ได้','Finalized facts or payment references exist. Historical deletion is unavailable.'],
 confirmDelete:['ยืนยันลบ / เริ่มใหม่','Confirm removal / restart'],cancel:['ยกเลิก','Cancel'],bank:['บัญชีรับเงิน','Recipient account'],bankName:['ธนาคาร','Bank'],accountName:['ชื่อบัญชี','Account name'],accountNumber:['เลขบัญชี','Account number'],taxId:['เลขประจำตัวผู้เสียภาษี (ถ้ามี)','Tax ID (if available)'],bankHint:['บัญชีรับเงินใช้ข้อมูลร่วมกับ Finance กรอกเมื่อรับเงินผ่านธนาคาร','Bank destinations are shared with Finance. Complete these for bank transfers.'],
 allPeople:['รวมบุคลากรที่ยังไม่เริ่มหรือสิ้นสุดการจ้าง','Include people whose engagement has not started or has ended'],
 recordOnly:['บันทึกยอดเท่านั้น ยังไม่จ่ายเงิน','Saving amounts does not pay money'],monthOnly:['ยอดเพิ่มและหักอื่นใช้เฉพาะเดือนนี้ ไม่ยกไปเดือนถัดไป','Additions and deductions apply only to this month and do not carry forward'],
 payHint:['ข้อมูลที่ยังขาดให้ระบุในหน้าต่างแก้ไขยอดก่อนจ่าย','Complete missing facts in Edit amount before payment'],
 missing:['ยังไม่ระบุ','Not entered'],taxHint:['ระบุภาษีของเดือนนี้ หากไม่มีให้เลือกไม่หักภาษีอย่างชัดเจน','Enter this month’s tax. Explicitly select no withholding when none applies'],
} as const;
export type SingleLabel=keyof typeof singleText;
export const st=(locale:string,key:SingleLabel)=>singleText[key][locale==='en'?1:0];
// Include unfinished setup and effective history without claiming it belongs to
// the selected month's payroll. The authoritative monthly rows remain untouched.
export function workspacePeople(data:WorkspaceData,includeInactive=false){
 const people=payrollSetupPeople(data).filter(hasPayrollHistory);
 const rows=data.monthly.rows.map(row=>({person:people.find(p=>p.id===row.payee_id),row}));
 for(const person of people){if(rows.some(x=>x.row.payee_id===person.id))continue;
  const engagement=effective(person.engagements,data.monthly.month.slice(0,7)+'-31');
  if(!includeInactive&&engagement?.active===false)continue;
  rows.push({person,row:{payee_id:person.id,profile_id:person.profile_id,name:person.legal_name,kind:engagement?.kind||person.engagements[0]?.kind||null,recurring_amount:null,source:null,source_hash:null,line:null,line_hash:null,payee_version:person.version,tax_id_present:!!person.tax_id,destination:person.destination?.bank_name&&person.destination?.account_number?{id:person.destination.id,summary:person.destination.bank_name+' ••••'+person.destination.account_number.replace(/\D/g,'').slice(-4)}:null,payment:null,state:'setup_incomplete',issues:['no_engagement'],source_fresh:false}});
 }
 return rows;
}
export function recurringRate(person:Person|undefined,month:string){return person?effective(person.rates,month.slice(0,7)+'-31'):undefined;}
export const readyForConfirmation=(row:MonthlyRow)=>row.profile_id===row.payee_id&&!!row.line?.reviewed&&row.source_fresh&&!['paid','settled_zero','amount_required'].includes(row.state)&&row.issues.every(i=>i==='destination_missing');
