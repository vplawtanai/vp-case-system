import type { MessageCatalog } from "../core";
export const advisoryControlMessages: MessageCatalog = {
 "advisory.exited":{"th":"วันที่ออกจากขั้นตอน","en":"Exited stage"},
 "advisory.taskCompletion":{"th":"งานในขั้นตอนที่เสร็จแล้ว","en":"Completed stage tasks"},
 "advisory.deletedTasks":{"th":"งานที่ลบแล้ว","en":"Deleted tasks"},
 "advisory.restoreTask":{"th":"กู้คืนงาน","en":"Restore task"},
 "advisory.stateHistory":{"th":"ประวัติสถานะการทำงาน (10 รายการล่าสุด)","en":"Work state history (latest 10)"},
 "advisory.enum.waiting":{"th":"รอดำเนินการต่อ","en":"Waiting"},
 "advisory.deleteTask": {"th":"ลบงาน (เก็บประวัติ)","en":"Delete task (retain history)"},
 "advisory.deleteHint": {"th":"รายการจะย้ายไปยังรายการที่ลบ ผู้มีสิทธิ์สามารถกู้คืนได้","en":"The task moves to deleted records and can be restored by an authorized user."},
  "advisory.title": {
    "th": "งานนอกคดี",
    "en": "Non-Litigation"
  },
  "advisory.subtitle": {
    "th": "ติดตามงานของลูกค้านอกกระบวนการคดีและงานรายเดือน",
    "en": "Control client matters and ongoing advisory work"
  },
  "advisory.create": {
    "th": "สร้างงานนอกคดี",
    "en": "Create matter"
  },
  "advisory.search": {
    "th": "ค้นหาเลขที่งาน ชื่องาน ลูกค้า หรือทนาย",
    "en": "Search matter, title, client or lawyer"
  },
  "advisory.open": {
    "th": "งานที่เปิดอยู่",
    "en": "Open matters"
  },
  "advisory.overdue": {
    "th": "งานเลยกำหนด",
    "en": "Overdue actions"
  },
  "advisory.waiting": {
    "th": "รอข้อมูลลูกค้า",
    "en": "Waiting for client"
  },
  "advisory.closed_week": {
    "th": "ปิดในสัปดาห์นี้",
    "en": "Closed this week"
  },
  "advisory.all": {
    "th": "ทั้งหมด",
    "en": "All"
  },
  "advisory.mine": {
    "th": "งานของฉัน",
    "en": "My work"
  },
  "advisory.missing": {
    "th": "ยังไม่มีงานถัดไป",
    "en": "Missing next action"
  },
  "advisory.closed": {
    "th": "ปิดงานแล้ว",
    "en": "Closed"
  },
  "advisory.client": {
    "th": "ลูกค้า",
    "en": "Client"
  },
  "advisory.type": {
    "th": "ประเภทงาน",
    "en": "Work type"
  },
  "advisory.lead": {
    "th": "ทนายหลัก",
    "en": "Lead"
  },
  "advisory.state": {
    "th": "สถานะการทำงาน",
    "en": "Work state"
  },
  "advisory.sort": {
    "th": "เรียงลำดับ",
    "en": "Sort"
  },
  "advisory.recent": {
    "th": "เปิดงานล่าสุด",
    "en": "Recently opened"
  },
  "advisory.due": {
    "th": "ครบกำหนด",
    "en": "Due date"
  },
  "advisory.matterNo": {
    "th": "เลขที่งาน",
    "en": "Matter no."
  },
  "advisory.matterTitle": {
    "th": "งาน / ชื่อเรื่อง",
    "en": "Matter / Title"
  },
  "advisory.stage": {
    "th": "ขั้นตอนปัจจุบัน",
    "en": "Current stage"
  },
  "advisory.actor": {
    "th": "ผู้ดูแลขั้นตอนถัดไป",
    "en": "Next action owner"
  },
  "advisory.next": {
    "th": "งานถัดไป",
    "en": "Next action"
  },
  "advisory.stageDays": {
    "th": "เวลาในขั้นตอน",
    "en": "Time in stage"
  },
  "advisory.age": {
    "th": "อายุงาน",
    "en": "Matter age"
  },
  "advisory.unset": {
    "th": "ยังไม่กำหนดขั้นตอนปัจจุบัน",
    "en": "Current stage not set"
  },
  "advisory.unassigned": {
    "th": "ยังไม่มอบหมาย",
    "en": "Unassigned"
  },
  "advisory.days": {
    "th": "{n} วัน",
    "en": "{n} days"
  },
  "advisory.minutes": {
    "th": "{n} นาที",
    "en": "{n} min"
  },
  "advisory.loading": {
    "th": "กำลังโหลด…",
    "en": "Loading…"
  },
  "advisory.empty": {
    "th": "ไม่พบรายการ",
    "en": "No records found"
  },
  "advisory.loadError": {
    "th": "โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่",
    "en": "Could not load data. Please retry."
  },
  "advisory.refresh": {
    "th": "รีเฟรช",
    "en": "Refresh"
  },
  "advisory.previous": {
    "th": "ก่อนหน้า",
    "en": "Previous"
  },
  "advisory.nextPage": {
    "th": "ถัดไป",
    "en": "Next"
  },
  "advisory.count": {
    "th": "{n} รายการ",
    "en": "{n} records"
  },
  "advisory.back": {
    "th": "กลับไปงานนอกคดี",
    "en": "Back to matters"
  },
  "advisory.records": {
    "th": "ข้อมูลและรายการเดิม",
    "en": "Existing records"
  },
  "advisory.reports": {
    "th": "รายงาน",
    "en": "Reports"
  },
  "advisory.registry": {
    "th": "ทะเบียนและข้อมูลเพิ่มเติม",
    "en": "Register and additional details"
  },
  "advisory.journey": {
    "th": "แผนที่การดำเนินงาน",
    "en": "Matter journey"
  },
  "advisory.journeyHint": {
    "th": "เลือกขั้นตอนเพื่อดูรายละเอียด ระยะเวลาคือวันปฏิทิน",
    "en": "Select a stage for details. Duration uses calendar days."
  },
  "advisory.stageUnsetHint": {
    "th": "งานเดิมยังไม่มีประวัติขั้นตอน เริ่มนับเวลาเมื่อเลือกขั้นตอนอย่างชัดเจน",
    "en": "Legacy matter has no stage history. Timing starts when a stage is explicitly activated."
  },
  "advisory.template": {
    "th": "รูปแบบขั้นตอน",
    "en": "Journey template"
  },
  "advisory.activate": {
    "th": "เริ่มขั้นตอนนี้",
    "en": "Activate stage"
  },
  "advisory.skip": {
    "th": "ข้ามขั้นตอนนี้",
    "en": "Skip stage"
  },
  "advisory.stageConfirm": {
    "th": "บันทึกการเปลี่ยนขั้นตอน ณ เวลาปัจจุบัน โดยเก็บประวัติเดิม",
    "en": "Record this transition now and retain previous history."
  },
  "advisory.planned": {
    "th": "ยังไม่เริ่ม",
    "en": "Not started"
  },
  "advisory.current": {
    "th": "กำลังดำเนินการ",
    "en": "In progress"
  },
  "advisory.visited": {
    "th": "ผ่านขั้นตอนแล้ว",
    "en": "Previously visited"
  },
  "advisory.skipped": {
    "th": "ข้ามขั้นตอน",
    "en": "Skipped"
  },
  "advisory.finished": {
    "th": "ปิดงานแล้ว",
    "en": "Finished"
  },
  "advisory.entered": {
    "th": "วันที่เข้าสู่ขั้นตอน",
    "en": "Entered stage"
  },
  "advisory.actual": {
    "th": "เวลาทำงานจริงที่มีสิทธิ์ดู",
    "en": "Visible actual effort"
  },
  "advisory.unclassified": {
    "th": "ยังไม่ระบุขั้นตอน",
    "en": "Not assigned to a stage"
  },
  "advisory.timeHint": {
    "th": "เวลาจากบันทึกที่คุณมีสิทธิ์ดู ไม่ใช่ระยะเวลาปฏิทิน",
    "en": "Time logs visible to you, separate from calendar duration."
  },
  "advisory.unclassifiedCount": {
    "th": "บันทึกเวลาเดิม {n} รายการยังไม่ระบุขั้นตอน",
    "en": "{n} time logs have no stage assignment"
  },
  "advisory.core": {
    "th": "งานหลัก",
    "en": "Core work"
  },
  "advisory.support": {
    "th": "งานสนับสนุน",
    "en": "Support work"
  },
  "advisory.team": {
    "th": "ทีมงาน",
    "en": "Matter team"
  },
  "advisory.role": {
    "th": "บทบาทในงาน",
    "en": "Matter role"
  },
  "advisory.tasks": {
    "th": "งานที่ต้องทำ",
    "en": "Tasks"
  },
  "advisory.activity": {
    "th": "กิจกรรมล่าสุด",
    "en": "Recent activity"
  },
  "advisory.deliverables": {
    "th": "งานส่งมอบ",
    "en": "Deliverables"
  },
  "advisory.time": {
    "th": "สรุปเวลาทำงาน",
    "en": "Effort summary"
  },
  "advisory.otherMatters": {
    "th": "งานอื่นของลูกค้านี้",
    "en": "Other client matters"
  },
  "advisory.addTask": {
    "th": "เพิ่มงาน",
    "en": "Add task"
  },
  "advisory.addDeliverable": {
    "th": "เพิ่มงานส่งมอบ",
    "en": "Add deliverable"
  },
  "advisory.addNote": {
    "th": "เพิ่มบันทึก",
    "en": "Add note"
  },
  "advisory.edit": {
    "th": "แก้ไข",
    "en": "Edit"
  },
  "advisory.save": {
    "th": "บันทึก",
    "en": "Save"
  },
  "advisory.cancel": {
    "th": "ยกเลิก",
    "en": "Cancel"
  },
  "advisory.saving": {
    "th": "กำลังบันทึก…",
    "en": "Saving…"
  },
  "advisory.complete": {
    "th": "ทำเสร็จแล้ว",
    "en": "Complete task"
  },
  "advisory.setNext": {
    "th": "ตั้งเป็นงานถัดไป",
    "en": "Set as next action"
  },
  "advisory.standalone": {
    "th": "ระบุงานถัดไปโดยไม่ผูกรายการงาน",
    "en": "Standalone next action"
  },
  "advisory.noNext": {
    "th": "ยังไม่กำหนดงานถัดไป",
    "en": "No next action set"
  },
  "advisory.titleField": {
    "th": "ชื่อ",
    "en": "Title"
  },
  "advisory.owner": {
    "th": "ผู้รับผิดชอบ",
    "en": "Owner"
  },
  "advisory.priority": {
    "th": "ความสำคัญ",
    "en": "Priority"
  },
  "advisory.status": {
    "th": "สถานะ",
    "en": "Status"
  },
  "advisory.note": {
    "th": "หมายเหตุ",
    "en": "Note"
  },
  "advisory.issue": {
    "th": "ประเด็น (ไม่บังคับ)",
    "en": "Issue (optional)"
  },
  "advisory.none": {
    "th": "ไม่ระบุ",
    "en": "None"
  },
  "advisory.legacyPerson": {
    "th": "ชื่อเดิม: {name}",
    "en": "Historical name: {name}"
  },
  "advisory.legacyCompletion": {
    "th": "ข้อมูลเดิมมีวันเสร็จแต่สถานะยังไม่เสร็จ จะไม่แก้ให้อัตโนมัติ",
    "en": "Legacy completion date conflicts with status; no automatic correction."
  },
  "advisory.version": {
    "th": "รุ่นเอกสาร",
    "en": "Document version"
  },
  "advisory.drive": {
    "th": "ลิงก์ Google Drive (ไม่บังคับ)",
    "en": "Google Drive link (optional)"
  },
  "advisory.closeMatter": {
    "th": "ปิดงาน",
    "en": "Close matter"
  },
  "advisory.reopen": {
    "th": "เปิดงานอีกครั้ง",
    "en": "Reopen matter"
  },
  "advisory.outcome": {
    "th": "ผลลัพธ์",
    "en": "Outcome"
  },
  "advisory.summary": {
    "th": "สรุปผล",
    "en": "Outcome summary"
  },
  "advisory.followUp": {
    "th": "สิ่งที่ต้องติดตาม",
    "en": "Follow-up"
  },
  "advisory.caseReference": {
    "th": "อ้างอิงคดี (ไม่สร้างคดีใหม่)",
    "en": "Case reference (does not create a case)"
  },
  "advisory.reason": {
    "th": "เหตุผล / อุปสรรค",
    "en": "Reason / blocker"
  },
  "advisory.remove": {
    "th": "นำออกจากทีม",
    "en": "Remove from team"
  },
  "advisory.saved": {
    "th": "บันทึกแล้ว",
    "en": "Saved"
  },
  "advisory.changed": {
    "th": "ข้อมูลเปลี่ยนไปแล้ว กรุณารีเฟรชก่อนบันทึกอีกครั้ง",
    "en": "This matter changed. Refresh before trying again."
  },
  "advisory.forbidden": {
    "th": "คุณไม่มีสิทธิ์ดำเนินการนี้",
    "en": "You do not have permission for this action."
  },
  "advisory.personUnavailable": {
    "th": "ผู้รับผิดชอบนี้ไม่อยู่ในกลุ่มที่รับมอบหมายงานได้",
    "en": "This person is not eligible for assignment."
  },
  "advisory.issueUnavailable": {
    "th": "ประเด็นนี้ถูกลบหรืออยู่ในงานอื่น กรุณาตรวจสอบ",
    "en": "This issue is deleted or belongs to another matter."
  },
  "advisory.completionInvalid": {
    "th": "สถานะและวันเสร็จไม่สอดคล้องกัน",
    "en": "Status and completion date do not agree."
  },
  "advisory.saveError": {
    "th": "บันทึกไม่สำเร็จ กรุณาตรวจสอบข้อมูลและรีเฟรช",
    "en": "Could not save. Check the details and refresh."
  },
  "advisory.clear": {
    "th": "ล้างตัวกรอง",
    "en": "Clear filters"
  },
  "advisory.details": {
    "th": "รายละเอียด",
    "en": "Details"
  },
  "advisory.overview": {
    "th": "ภาพรวม",
    "en": "Overview"
  },
  "advisory.selectClient": {
    "th": "ค้นหาและเลือกลูกค้า",
    "en": "Search and select client"
  },
  "advisory.selectPerson": {
    "th": "เลือกผู้รับผิดชอบที่รับมอบหมายงานได้",
    "en": "Select an eligible person"
  },
  "advisory.closedHint": {
    "th": "งานปิดแล้ว เปิดงานอีกครั้งก่อนแก้ไข",
    "en": "This matter is closed. Reopen it before editing."
  },
  "advisory.enum.working": {
    "th": "กำลังทำงาน",
    "en": "Working"
  },
  "advisory.enum.waiting_client": {
    "th": "รอลูกค้า",
    "en": "Waiting for client"
  },
  "advisory.enum.waiting_external": {
    "th": "รอหน่วยงานภายนอก",
    "en": "Waiting externally"
  },
  "advisory.enum.waiting_internal": {
    "th": "รอภายใน",
    "en": "Waiting internally"
  },
  "advisory.enum.on_hold": {
    "th": "พักงาน",
    "en": "On hold"
  },
  "advisory.enum.active": {
    "th": "เปิดงาน",
    "en": "Active"
  },
  "advisory.enum.completed": {
    "th": "เสร็จสิ้น",
    "en": "Completed"
  },
  "advisory.enum.cancelled": {
    "th": "ยกเลิก",
    "en": "Cancelled"
  },
  "advisory.enum.pending": {
    "th": "รอดำเนินการ",
    "en": "Pending"
  },
  "advisory.enum.in_progress": {
    "th": "กำลังดำเนินการ",
    "en": "In progress"
  },
  "advisory.enum.general_advisory": {
    "th": "ที่ปรึกษาทั่วไป",
    "en": "General advisory"
  },
  "advisory.enum.contract_review": {
    "th": "ตรวจสัญญา",
    "en": "Contract review"
  },
  "advisory.enum.legal_opinion": {
    "th": "ความเห็นกฎหมาย",
    "en": "Legal opinion"
  },
  "advisory.enum.document_drafting": {
    "th": "ร่างเอกสาร",
    "en": "Document drafting"
  },
  "advisory.enum.meeting_consultation": {
    "th": "ประชุมให้คำปรึกษา",
    "en": "Consultation"
  },
  "advisory.enum.corporate_support": {
    "th": "งานนิติบุคคล",
    "en": "Corporate support"
  },
  "advisory.enum.compliance": {
    "th": "กำกับการปฏิบัติตามกฎหมาย",
    "en": "Compliance"
  },
  "advisory.enum.other": {
    "th": "อื่น ๆ",
    "en": "Other"
  },
  "advisory.enum.lead": {
    "th": "ทนายหลัก",
    "en": "Lead"
  },
  "advisory.enum.co_work": {
    "th": "ผู้ร่วมงาน",
    "en": "Co-worker"
  },
  "advisory.enum.assistant": {
    "th": "ผู้ช่วย",
    "en": "Assistant"
  },
  "advisory.enum.qa": {
    "th": "ผู้ตรวจทาน",
    "en": "Quality review"
  },
  "advisory.enum.low": {
    "th": "ต่ำ",
    "en": "Low"
  },
  "advisory.enum.normal": {
    "th": "ปกติ",
    "en": "Normal"
  },
  "advisory.enum.high": {
    "th": "สูง",
    "en": "High"
  },
  "advisory.enum.urgent": {
    "th": "เร่งด่วน",
    "en": "Urgent"
  },
  "advisory.enum.draft": {
    "th": "ร่างเอกสาร",
    "en": "Draft"
  },
  "advisory.enum.ready": {
    "th": "พร้อมส่ง",
    "en": "Ready"
  },
  "advisory.enum.delivered": {
    "th": "ส่งมอบแล้ว",
    "en": "Delivered"
  },
  "advisory.enum.client_stopped": {
    "th": "ลูกค้ายุติงาน",
    "en": "Client stopped"
  },
  "advisory.enum.external_refusal": {
    "th": "หน่วยงานปฏิเสธ",
    "en": "External refusal"
  },
  "advisory.enum.agreement": {
    "th": "ยุติโดยข้อตกลง",
    "en": "Resolved by agreement"
  },
  "advisory.enum.litigation": {
    "th": "เข้าสู่กระบวนการคดี",
    "en": "Converted to litigation"
  },
  "advisory.enum.intake": {
    "th": "รับเรื่อง",
    "en": "Intake"
  },
  "advisory.enum.information": {
    "th": "เก็บข้อมูล",
    "en": "Gather information"
  },
  "advisory.enum.analysis": {
    "th": "วิเคราะห์",
    "en": "Analysis"
  },
  "advisory.enum.review": {
    "th": "ตรวจทานภายใน",
    "en": "Internal review"
  },
  "advisory.enum.client_delivery": {
    "th": "ส่งให้ลูกค้า",
    "en": "Client delivery"
  },
  "advisory.enum.negotiation": {
    "th": "เจรจา",
    "en": "Negotiation"
  },
  "advisory.enum.final": {
    "th": "จัดทำฉบับสุดท้าย",
    "en": "Finalise"
  },
  "advisory.enum.close": {
    "th": "ปิดงาน",
    "en": "Finish"
  },
  "advisory.enum.requirements": {
    "th": "ตรวจข้อกำหนด",
    "en": "Requirements"
  },
  "advisory.enum.preparation": {
    "th": "เตรียมเอกสาร",
    "en": "Preparation"
  },
  "advisory.enum.submission": {
    "th": "ยื่นคำขอ",
    "en": "Submission"
  },
  "advisory.enum.authority_wait": {
    "th": "รอหน่วยงาน",
    "en": "Await authority"
  },
  "advisory.enum.amendment": {
    "th": "แก้ไขเพิ่มเติม",
    "en": "Amendment"
  },
  "advisory.enum.result": {
    "th": "รับผล",
    "en": "Result"
  },
  "advisory.enum.brief": {
    "th": "รับโจทย์",
    "en": "Brief"
  },
  "advisory.enum.facts": {
    "th": "รวบรวมข้อเท็จจริง",
    "en": "Facts"
  },
  "advisory.enum.research": {
    "th": "ค้นคว้า",
    "en": "Research"
  },
  "advisory.enum.opinion_delivery": {
    "th": "ส่งความเห็น",
    "en": "Deliver opinion"
  },
  "advisory.enum.strategy": {
    "th": "วางกลยุทธ์",
    "en": "Strategy"
  },
  "advisory.enum.contact": {
    "th": "ติดต่อคู่กรณี",
    "en": "Contact"
  },
  "advisory.enum.execution": {
    "th": "ดำเนินงาน",
    "en": "Execution"
  },
  "advisory.enum.delivery": {
    "th": "ส่งมอบ",
    "en": "Delivery"
  },
  "advisory.enum.contract": {
    "th": "งานสัญญา",
    "en": "Contract"
  },
  "advisory.enum.license_regulatory": { th: "ใบอนุญาต / หน่วยงาน", en: "License / Regulatory" },
  "advisory.enum.license": {
    "th": "งานใบอนุญาต",
    "en": "Licensing"
  },
  "advisory.enum.opinion": {
    "th": "ความเห็นกฎหมาย",
    "en": "Legal opinion"
  },
  "advisory.enum.general": {
    "th": "งานทั่วไป",
    "en": "General"
  },
  "advisory.enum.create": {
    "th": "สร้างงาน",
    "en": "Matter created"
  },
  "advisory.enum.team": {
    "th": "ปรับทีมงาน",
    "en": "Team updated"
  },
  "advisory.enum.work_state": {
    "th": "เปลี่ยนสถานะการทำงาน",
    "en": "Work state changed"
  },
  "advisory.enum.stage": {
    "th": "เปลี่ยนขั้นตอน",
    "en": "Stage changed"
  },
  "advisory.enum.stage_skip": {
    "th": "ข้ามขั้นตอน",
    "en": "Stage skipped"
  },
  "advisory.enum.next_action": {
    "th": "กำหนดงานถัดไป",
    "en": "Next action set"
  },
  "advisory.enum.task_created": {
    "th": "เพิ่มงานที่ต้องทำ",
    "en": "Task created"
  },
  "advisory.enum.task_completed": {
    "th": "ทำงานเสร็จ",
    "en": "Task completed"
  },
  "advisory.enum.task_updated": {
    "th": "แก้ไขงาน",
    "en": "Task updated"
  },
  "advisory.enum.task_deleted": {
    "th": "ลบงาน",
    "en": "Task deleted"
  },
  "advisory.enum.deliverable": {
    "th": "ปรับงานส่งมอบ",
    "en": "Deliverable updated"
  },
  "advisory.enum.note": {
    "th": "เพิ่มบันทึก",
    "en": "Note added"
  },
  "advisory.enum.reopen": {
    "th": "เปิดงานอีกครั้ง",
    "en": "Matter reopened"
  }
};
