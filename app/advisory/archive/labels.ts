export const archiveLabels = {
  entry: ['ดูข้อมูลระบบเก่า', 'View Legacy Data'],
  title: ['ข้อมูลระบบเก่า — อ่านอย่างเดียว', 'Legacy Data — Read Only'],
  note: ['ข้อมูลส่วนนี้เก็บไว้เพื่อดูประวัติเท่านั้น งานใหม่และการแก้ไขทั้งหมดให้ดำเนินการในระบบงานนอกคดีปัจจุบัน', 'This area is retained for historical reference only. Create new work and make all changes in the current Non-Litigation system.'],
  scope: ['งานที่เริ่มจากระบบเก่า พร้อมข้อมูลที่เกี่ยวข้องทั้งหมด', 'Matters originally created in the legacy workflow, with all related records'],
  current: ['กลับระบบงานนอกคดีปัจจุบัน', 'Back to current Non-Litigation'],
  list: ['รายการงานระบบเก่า', 'Legacy matter list'],
  empty: ['ไม่พบข้อมูล', 'No records found'],
  loading: ['กำลังโหลดข้อมูล…', 'Loading records…'],
  error: ['ไม่สามารถอ่านข้อมูลได้ กรุณาลองใหม่', 'Unable to read records. Please try again.'],
  retry: ['โหลดใหม่', 'Reload'],
  unavailable: ['ไม่พบงานในขอบเขตระบบเก่า งานที่สร้างในระบบปัจจุบันจะไม่แสดงที่นี่', 'This matter is not in the legacy archive. Matters created in the current system are not shown here.'],
  search: ['ค้นหาเลขที่งาน ชื่องาน ลูกค้า หรือทนาย', 'Search matter number, title, client or lawyer'],
  searchRecords: ['ค้นหาข้อมูลในงานนี้', 'Search this matter’s records'],
  all: ['ทั้งหมด', 'All'], status: ['สถานะ', 'Status'], deleted: ['ลบแล้ว (ประวัติ)', 'Deleted (history)'],
  records: ['รายการ', 'records'], details: ['รายละเอียด', 'Details'],
  issues: ['ประเด็น', 'Issues'], tasks: ['งานที่ต้องทำ', 'Tasks'], time: ['บันทึกเวลา', 'Time records'],
  advice: ['บันทึกคำปรึกษา', 'Advice records'], history: ['ประวัติการเปลี่ยนแปลง', 'Change history'],
  historyUnavailable: ['ไม่สามารถอ่านประวัติการเปลี่ยนแปลงด้วยสิทธิ์ปัจจุบัน', 'Change history is unavailable with the current access.'],
  more: ['แสดงเพิ่ม', 'Show more'],
  oldNext: ['งานถัดไปที่บันทึกในประเด็นเดิม', 'Next action recorded on the legacy issue'],
  issueUnavailable: ['ไม่พบประเด็นนี้ในงานระบบเก่า', 'This issue was not found in the legacy matter'],
} as const;
export type ArchiveLabel = keyof typeof archiveLabels;
export const fieldLabels: Record<string, readonly [string, string]> = {
  matter_no:['เลขที่งาน','Matter no.'], title:['ชื่องาน / ประเด็น','Title'], client:['ลูกค้า','Client'],
  matter_type:['ประเภทงาน','Work type'], status:['สถานะ','Status'], responsible_lawyer:['ทนายที่บันทึกไว้','Recorded lawyer'],
  start_date:['วันที่เริ่ม','Start date'], end_date:['วันที่สิ้นสุด','End date'], scope_of_work:['ขอบเขตงาน','Scope of work'],
  note:['หมายเหตุ','Note'], retainer_type:['รูปแบบค่าบริการเดิม','Recorded fee arrangement'], monthly_retainer_amount:['ค่าบริการรายเดือนที่บันทึกไว้','Recorded monthly retainer'],
  issue_no:['เลขที่ประเด็น','Issue no.'], issue_type:['ประเภทประเด็น','Issue type'], priority:['ความสำคัญ','Priority'],
  responsible_person:['ผู้รับผิดชอบ','Responsible person'], opened_at:['วันที่เปิด','Opened'], due_date:['ครบกำหนด','Due date'],
  closed_at:['วันที่ปิด','Closed'], summary:['สรุป','Summary'], legal_position:['ข้อกฎหมาย','Legal position'], next_action:['งานถัดไปที่บันทึกในประเด็นเดิม','Next action recorded on the legacy issue'],
  task_type:['ประเภทงานย่อย','Task type'], assignee_name:['ผู้รับผิดชอบที่บันทึกไว้','Recorded assignee'], completed_at:['เสร็จเมื่อ','Completed'],
  work_date:['วันที่ทำงาน','Work date'], staff_name:['ผู้บันทึก','Recorder'], work_type:['ลักษณะงาน','Work category'],
  work_other:['ลักษณะงานอื่น','Other work'], minutes:['เวลา (นาที)','Time (minutes)'], billable:['งานหลัก','Core work'],
  advice_date:['วันที่ให้คำปรึกษา','Advice date'], channel:['ช่องทาง','Channel'], question:['คำถาม','Question'],
  facts_received:['ข้อเท็จจริงที่ได้รับ','Facts received'], legal_analysis:['วิเคราะห์กฎหมาย','Legal analysis'], advice_given:['คำปรึกษา','Advice given'], caveat:['ข้อจำกัด','Caveat'], follow_up:['ติดตาม','Follow-up'],
  created_at:['สร้างเมื่อ','Created'], updated_at:['แก้ไขล่าสุด','Last updated'], deleted_at:['ลบเมื่อ','Deleted'], deleted_by:['ลบโดย','Deleted by'],
  user_name:['ผู้ดำเนินการ','Actor'], action:['การดำเนินการ','Action'], table_name:['ประเภทข้อมูล','Record type'],
  assignee_user_id:['รหัสผู้รับผิดชอบ','Assignee reference'], stage_id:['รหัสขั้นตอนที่บันทึกไว้','Recorded stage reference'], advisory_issue_id:['รหัสประเด็นที่เกี่ยวข้อง','Related issue reference'], created_by_name:['สร้างโดย','Created by'],
  old_data:['ข้อมูลก่อนเปลี่ยนแปลง','Previous data'], new_data:['ข้อมูลหลังเปลี่ยนแปลง','Resulting data'],
};
export const recordFields = {
  issues: ['issue_no','issue_type','status','priority','responsible_person','opened_at','due_date','closed_at','summary','legal_position','next_action','note'],
  tasks: ['task_type','status','priority','assignee_name','due_date','completed_at','note'],
  time: ['work_date','staff_name','work_type','work_other','minutes','billable','note'],
  advice: ['advice_date','channel','responsible_person','question','facts_received','legal_analysis','advice_given','caveat','follow_up'],
} as const;

// Known legacy enum display labels only; stored/custom text is never rewritten.
export const legacyValueLabels: Record<string, readonly [string, string]> = {
  open:['เปิดอยู่','Open'], Closed:['ปิดแล้ว','Closed'], general:['ทั่วไป','General'],
  labor:['แรงงาน','Labor'], contract:['สัญญา','Contract'], corporate:['องค์กร','Corporate'],
  compliance:['การปฏิบัติตามกฎหมาย','Compliance'], dispute:['ข้อพิพาท','Dispute'], license:['ใบอนุญาต','License / Permit'], tax:['ภาษี','Tax'], other:['อื่น ๆ','Other'],
  no_retainer:['ไม่มีค่าบริการประจำ','No retainer'], monthly_retainer:['รายเดือน','Monthly retainer'], project_based:['รายโครงการ','Project-based'], hourly:['รายชั่วโมง','Hourly'],
  internal_note:['บันทึกภายใน','Internal note'], phone:['โทรศัพท์','Phone'], line:['LINE','LINE'], email:['อีเมล','Email'], meeting:['ประชุม','Meeting'], document:['ตรวจเอกสาร','Document review'], court_related:['เกี่ยวกับศาล','Court-related'],
  Advisory:['ให้คำปรึกษา','Advisory'], 'Legal Opinion':['ความเห็นกฎหมาย','Legal Opinion'], 'Contract Review':['ตรวจสัญญา','Contract Review'], 'Document Drafting':['ร่างเอกสาร','Document Drafting'], 'Meeting / Consultation':['ประชุม / ให้คำปรึกษา','Meeting / Consultation'], 'Corporate Support':['งานองค์กร','Corporate Support'], Compliance:['การปฏิบัติตามกฎหมาย','Compliance'], 'อื่นๆ':['อื่น ๆ','Other'],
  create:['สร้าง','Created'], update:['แก้ไข','Updated'], delete:['ลบ','Deleted'], soft_delete:['ลบ','Deleted'], restore:['คืนข้อมูล','Restored'],
};
