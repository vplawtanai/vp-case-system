import {translate} from '../../../lib/i18n/catalog';
export const clientLabels={
 matterView:['มุมมองงาน','Matter view'],clientView:['มุมมองลูกค้า','Client view'],view:['รูปแบบการแสดงผล','View'],
 choose:['เลือกลูกค้าเพื่อดูภาพรวมงาน','Choose a client to view their work'],search:['ค้นหาลูกค้าหรือผู้ติดต่อ','Search clients or contacts'],back:['ลูกค้าทั้งหมด','All clients'],refresh:['รีเฟรช','Refresh'],
 scopeHint:['แสดงเฉพาะงานที่เชื่อมกับลูกค้ารายนี้และคุณมีสิทธิ์ดู','Only work linked to this client and visible to you is included.'],
 overview:['ภาพรวมลูกค้า','Client workspace'],contact:['ผู้ติดต่อหลัก','Primary contact'],noContact:['ยังไม่ระบุผู้ติดต่อหลัก','No primary contact recorded'],address:['ที่อยู่','Address'],type:['ประเภทลูกค้า','Client type'],
 openMatters:['งานนอกคดีเปิดอยู่','Open Non-Litigation matters'],openCases:['คดีเปิดอยู่','Open cases'],urgent:['งานด่วน','Urgent work'],latest:['อัปเดตล่าสุด','Latest update'],
 matters:['งานนอกคดีทั้งหมด','All Non-Litigation matters'],cases:['คดีทั้งหมด','All cases'],readOnly:['อ่านจากระบบคดีเดิม','Read from the existing Case system'],
 actions:['สิ่งที่ต้องทำ / งานถัดไป','Tasks / Next actions'],upcoming:['กำหนดการใกล้ถึง','Upcoming dates'],upcomingHint:['วันนี้ถึง 30 วันข้างหน้า','Today through the next 30 days'],notes:['หมายเหตุภายใน','Internal notes'],activity:['กิจกรรมล่าสุด','Recent activity'],
 noMatches:['ไม่พบงานที่ตรงกับการค้นหา','No matching work'],emptyClients:['ไม่พบลูกค้าที่ตรงกับการค้นหา','No matching clients'],emptyMatters:['ยังไม่มีงานนอกคดีที่เชื่อมกับลูกค้ารายนี้','No Non-Litigation matters linked to this client'],emptyCases:['ยังไม่มีคดีที่เชื่อมกับลูกค้ารายนี้','No cases linked to this client'],emptyUrgent:['ไม่มีงานด่วนที่ต้องติดตาม','No urgent work to follow up'],emptyActions:['ยังไม่มีงานหรือการดำเนินการถัดไป','No open tasks or next actions'],emptyUpcoming:['ไม่มีกำหนดการใน 30 วันข้างหน้า','No dates in the next 30 days'],emptyNotes:['ยังไม่มีหมายเหตุภายใน','No internal notes'],emptyActivity:['ยังไม่มีกิจกรรมบันทึกไว้','No recorded activity'],
 unavailable:['ไม่สามารถอ่านข้อมูลได้ กรุณาลองใหม่ ข้อมูลที่โหลดไม่สำเร็จจะไม่ถูกนับเป็นศูนย์','Could not read the workspace. Retry; unavailable data is not counted as zero.'],denied:['คุณไม่มีสิทธิ์ดูข้อมูลลูกค้า','You do not have access to client information'],caseDenied:['คุณไม่มีสิทธิ์ดูข้อมูลคดี','You do not have access to cases'],loading:['กำลังโหลดข้อมูลลูกค้า…','Loading client workspace…'],
 number:['เลขที่งาน','Work number'],title:['เรื่อง','Title'],lead:['ผู้รับผิดชอบ','Lead'],stage:['ขั้นตอนปัจจุบัน','Current stage'],next:['งานถัดไป','Next action'],due:['ครบกำหนด','Due'],status:['สถานะ','Status'],court:['ศาล','Court'],unset:['ยังไม่กำหนด','Not set'],
 overdue:['เลยกำหนด','Overdue'],days:['วัน','days'],priority:['สำคัญ','High priority'],task:['งานที่ต้องทำ','Task'],next_action:['งานถัดไป','Next action'],deadline:['กำหนดเวลา','Deadline'],hearing:['นัดศาล','Hearing'],enforcement:['ขอออกหมายบังคับคดี','Writ request'],
 showAll:['ดูทั้งหมด','Show all'],showLess:['แสดงน้อยลง','Show less'],clientNote:['หมายเหตุลูกค้า','Client note'],open:['เปิดงาน','Open'],waiting:['รอดำเนินการ','Waiting'],done:['เสร็จสิ้น','Completed'],cancelled:['ยกเลิก','Cancelled'],
} as const;
export type ClientLabel=keyof typeof clientLabels;
export const clientText=(locale:string,key:ClientLabel)=>clientLabels[key][locale==='en'?1:0];
const enums:Record<string,readonly [string,string]>={active:['ปัจจุบัน','Active'],prospect:['ลูกค้าใหม่','Prospect'],inactive:['ไม่เคลื่อนไหว','Inactive'],individual:['บุคคลธรรมดา','Individual'],company:['นิติบุคคล','Company'],corporate:['นิติบุคคล','Company'],organization:['องค์กร','Organization'],other:['อื่น ๆ','Other'],waiting:['รอดำเนินการ','Waiting'],done:['เสร็จสิ้น','Completed'],completed:['เสร็จสิ้น','Completed'],closed:['ปิดงาน','Closed'],cancelled:['ยกเลิก','Cancelled'],answer:['ยื่นคำให้การจำเลย','File defendant’s answer'],appeal:['อุทธรณ์','Appeal'],appeal_answer:['แก้อุทธรณ์','Answer appeal'],supreme:['ฎีกา','Supreme Court appeal'],supreme_answer:['แก้ฎีกา','Answer Supreme Court appeal']};
const clientOptions=['limited_company','partnership','limited_partnership','individual','group_of_persons','government_agency','association','foreign_company','joint_venture','consortium','blacklist'];
const caseTitles:Record<string,string>={
 'สอบข้อเท็จจริง':'Fact finding','เตรียมเอกสาร':'Prepare documents','ทำหนังสือบอกกล่าว':'Prepare notice','ร่างคำฟ้อง':'Draft complaint','เตรียมพยาน':'Prepare witnesses','เตรียมเอกสารวันนัดที่จะถึง':'Prepare hearing documents',
 'นัดไกล่เกลี่ย':'Mediation','นัดไกล่เกลี่ย/ให้การ/สืบพยานโจทก์':'Mediation / Plea / Plaintiff evidence','นัดพร้อม':'Case management hearing','นัดชี้สองสถาน/สืบพยานโจทก์':'Settlement of issues / Plaintiff evidence','นัดชี้สองสถาน':'Settlement of issues','นัดไต่สวนมูลฟ้อง':'Preliminary examination','นัดฟังคำสั่ง':'Order hearing','นัดสอบคำให้การจำเลย':'Defendant plea hearing','นัดสอบคำให้การจำเลย/ตรวจพยาน':'Defendant plea / Evidence examination','นัดสืบพยานโจทก์':'Plaintiff evidence','นัดสืบพยานจำเลย':'Defendant evidence','นัดฟังคำพิพากษา/คำสั่ง':'Judgment / Order hearing',
};
export function clientEnum(locale:string,value:string|null|undefined){
 if(!value)return '—';const key=value.toLowerCase().replaceAll(' ','_');
 if(clientOptions.includes(key))return translate(locale==='en'?'en':'th','client.edit.option.'+key);
 if(locale==='en'&&caseTitles[value])return caseTitles[value];
 return enums[value.toLowerCase()]?.[locale==='en'?1:0]||value;
}
