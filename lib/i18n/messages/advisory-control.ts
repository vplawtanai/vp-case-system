import type { MessageCatalog } from "../core";
export const advisoryControlMessages: MessageCatalog = {
  "advisory.stageTasksPending": {"th":"มีงานค้างในขั้นตอนนี้","en":"Incomplete tasks in this stage"},
  "advisory.tasksPending": {"th":"มีงานที่ยังไม่เสร็จ","en":"Incomplete tasks remain"},
  "advisory.nextPending": {"th":"ยังมีงานถัดไปค้างอยู่","en":"A next action is still pending"},
  "advisory.deliverablesPending": {"th":"มีงานส่งมอบที่ยังไม่เสร็จ","en":"Pending deliverables remain"},
  "advisory.stagesPending": {"th":"ยังมีขั้นตอนที่ไม่จบ","en":"Stages are not yet complete"},
  "advisory.noCurrentStage": {"th":"ไม่มีขั้นตอนที่กำลังดำเนินการ","en":"No stage in progress"},
  "advisory.noCurrentStageHint": {"th":"ประวัติขั้นตอนยังคงอยู่ เปิดแผนที่เพื่อตรวจสอบ หรือปิดงานเมื่อพร้อม","en":"Recorded stage history is retained. Review the map or close the matter when ready."},
  "advisory.timeStage": {"th":"ขั้นตอนที่บันทึกเวลา","en":"Time-log stage"},
  "advisory.otherTimeType": {"th":"ระบุประเภทงานอื่น","en":"Specify other work type"},
  "advisory.setNextAction": {"th":"กำหนดงานถัดไป","en":"Set next action"},
  "advisory.replaceLead": {"th":"เปลี่ยนทนายหลัก","en":"Replace lead"},
  "advisory.completeStage": {"th": "เสร็จขั้นตอนนี้ → ไปขั้นถัดไป", "en": "Complete stage → Next stage"},
  "advisory.confirmAdvance": {"th": "ยืนยันและไปขั้นถัดไป", "en": "Confirm and advance"},
  "advisory.stageCompletionHint": {"th": "บันทึกเวลาจบขั้นตอนนี้ แล้วเริ่มขั้นถัดไปพร้อมกัน", "en": "Complete this stage and start the next in one action."},
  "advisory.stageTasksClear": {"th": "ไม่มีงานค้างในขั้นตอนนี้", "en": "No incomplete tasks in this stage"},
  "advisory.stageBlocked": {"th": "ยังมีงานค้างในขั้นตอนนี้ กรุณาจัดการงานก่อนไปขั้นถัดไป", "en": "This stage has incomplete tasks. Resolve them before advancing."},
  "advisory.viewTasks": {"th": "ดูงานที่ต้องทำ", "en": "View tasks"},
  "advisory.resolveNextHint": {"th": "ยืนยันล้างงานถัดไปที่ไม่ตรงกับขั้นตอนใหม่ โดยไม่ปิดงานที่ต้องทำ งานที่ตรงกับขั้นตอนใหม่จะคงไว้", "en": "Clear any next action that does not belong to the next stage, without completing its task. A task in the next stage is retained."},
  "advisory.nextResolution": {"th": "กรุณายืนยันการจัดการงานถัดไปก่อนเปลี่ยนขั้นตอน", "en": "Confirm how to resolve the next action before changing stage."},
  "advisory.tasksClear": {"th": "ไม่มีงานค้าง", "en": "No incomplete tasks"},
  "advisory.nextClear": {"th": "ไม่มีงานถัดไปค้างอยู่", "en": "No pending next action"},
  "advisory.deliverablesClear": {"th": "ไม่มีงานส่งมอบค้าง", "en": "No pending deliverables"},
  "advisory.stagesClear": {"th": "ขั้นตอนงานพร้อมสำหรับการปิดงาน", "en": "Stages are ready for closing"},
  "advisory.closeBlocked": {"th": "ยังปิดงานด้วยผลสำเร็จไม่ได้ กรุณาจัดการรายการค้างที่แสดงก่อน", "en": "Successful closing is blocked. Resolve the outstanding items shown above."},
  "advisory.closeResolution": {"th": "กรุณาระบุเหตุผลสำหรับรายการค้างก่อนปิดงาน", "en": "Explain how outstanding items are handled before closing."},
  "advisory.unresolvedReason": {"th": "เหตุผลและการจัดการรายการค้าง", "en": "Reason and resolution of outstanding items"},
  "advisory.exceptionCloseHint": {"th": "รายการค้างจะเก็บไว้ในประวัติ ไม่ถูกทำเครื่องหมายว่าเสร็จโดยอัตโนมัติ", "en": "Outstanding items remain in history; they are not automatically completed."},
  "advisory.optionalDetails": {"th": "รายละเอียดเพิ่มเติม (ถ้ามี)", "en": "Additional details (optional)"},
  "advisory.reopenHint": {"th": "ระบุเหตุผลเพื่อเปิดงานอีกครั้ง ระบบจะเก็บประวัติเดิมและไม่สร้างประวัติขั้นตอนย้อนหลัง", "en": "Give a reason to reopen. Existing history is retained; no past stages are reconstructed."},
  "advisory.addMember": {"th": "เพิ่มสมาชิกทีม", "en": "Add team member"},
  "advisory.editRole": {"th": "แก้ไขบทบาท", "en": "Edit role"},
  "advisory.searchPerson": {"th": "ค้นหาชื่อบุคคล", "en": "Search people"},
  "advisory.requiredFields": {"th": "กรุณากรอกข้อมูลที่จำเป็นให้ครบ", "en": "Complete the required fields."},
  "advisory.duplicateMember": {"th": "บุคคลนี้มีบทบาทนี้ในทีมแล้ว", "en": "This person already has this role in the team."},
  "advisory.leadExists": {"th": "มีทนายหลักแล้ว ให้เปลี่ยนผ่านการเพิ่มสมาชิกบทบาททนายหลักและยืนยันผู้ที่จะรับแทน", "en": "A lead already exists. Add the replacement as lead and confirm the change."},
  "advisory.replaceLeadHint": {"th": "เปลี่ยนทนายหลักผ่านเพิ่มสมาชิกทีม", "en": "Replace lead through Add team member"},
  "advisory.replaceLeadConfirm": {"th": "ยืนยันให้บุคคลนี้เป็นทนายหลักแทน {name}", "en": "Confirm this person replaces {name} as lead"},
  "advisory.removeMemberHint": {"th": "นำออกจากทีมงานนี้เท่านั้น ประวัติและงานที่มอบหมายไว้ยังคงอยู่", "en": "Remove this team membership only. History and assigned tasks remain."},
  "advisory.noChange": {"th": "ข้อมูลยังไม่มีการเปลี่ยนแปลง", "en": "No changes to save."},
  "advisory.stageAlreadyCompleted": {"th": "ขั้นตอนนี้เสร็จแล้ว กรุณารีเฟรชข้อมูล", "en": "This stage is already complete. Refresh to see the latest state."},
  "advisory.taskUnavailable": {"th": "งานนี้ไม่สามารถเป็นงานถัดไปได้ กรุณาเลือกรายการที่ยังไม่เสร็จ", "en": "This task cannot be the next action. Choose an available incomplete task."},
  "advisory.stageHistory": {"th": "ขั้นตอนนี้มีประวัติแล้ว ไม่สามารถข้ามได้", "en": "This stage already has history and cannot be skipped."},
  "advisory.addTime": {"th": "เพิ่มเวลา", "en": "Add time"},
  "advisory.timeLogs": {"th": "บันทึกเวลาของงานนี้", "en": "Time logs for this matter"},
  "advisory.noTime": {"th": "ยังไม่มีบันทึกเวลา", "en": "No time logs yet"},
  "advisory.noDescription": {"th": "ไม่ระบุรายละเอียด", "en": "No description"},
  "advisory.legacyNoStage": {"th": "ไม่ระบุขั้นตอน (ข้อมูลเดิม)", "en": "No stage (legacy record)"},
  "advisory.loadMore": {"th": "ดูเพิ่มเติม", "en": "Load more"},
  "advisory.durationInvalid": {"th": "ระบุระยะเวลาเป็นจำนวนเต็มมากกว่า 0 ช่องนาทีต้องเป็น 0–59", "en": "Enter a positive whole-number duration. Minutes must be 0–59."},
  "advisory.recorder": {"th": "ผู้บันทึก", "en": "Recorded by"},
  "advisory.ownTimeHint": {"th": "บันทึกเวลาของคุณในงานนี้", "en": "Record your own effort in this matter"},
  "advisory.workDate": {"th": "วันที่ทำงาน", "en": "Work date"},
  "advisory.hours": {"th": "ชั่วโมง", "en": "Hours"},
  "advisory.minuteField": {"th": "นาที", "en": "Minutes"},
  "advisory.effortType": {"th": "ลักษณะงาน", "en": "Effort category"},
  "advisory.workDescription": {"th": "รายละเอียดงาน", "en": "Work description"},
  "advisory.noStage": {"th": "ไม่ระบุขั้นตอน", "en": "No stage"},
  "advisory.changeTimeStage": {"th": "เปลี่ยนขั้นตอนที่บันทึกเวลา (ถ้าจำเป็น)", "en": "Change time-log stage (if needed)"},
  "advisory.nextSource": {"th": "ที่มาของงานถัดไป", "en": "Next action source"},
  "advisory.fromTask": {"th": "เลือกจากงานที่ต้องทำ", "en": "Choose an existing task"},
  "advisory.findTask": {"th": "ค้นหางานที่ยังไม่เสร็จ", "en": "Search incomplete tasks"},
  "advisory.chooseTask": {"th": "เลือกงานถัดไป", "en": "Select next task"},
  "advisory.noAvailableTask": {"th": "ไม่พบงานที่เลือกได้ ลองค้นหาหรือเพิ่มงานก่อน", "en": "No available tasks found. Search or add a task first."},
  "advisory.taskDerivedHint": {"th": "ใช้ผู้รับผิดชอบและกำหนดส่งจากงานนี้โดยอัตโนมัติ", "en": "Assignee and due date come from this task automatically."},
  "advisory.enum.stage_complete": {"th": "จบขั้นตอนและดำเนินงานต่อ", "en": "Stage completed and advanced"},
  "advisory.enum.team_edit": {"th": "แก้ไขบทบาทสมาชิกทีม", "en": "Team role changed"},
  "advisory.activityStageTransition": {"th": "จบขั้นตอน {from} → {to}", "en": "Completed {from} → {to}"},
  "advisory.activityTeamRemoved": {"th": "นำสมาชิกออกจากทีม", "en": "Team member removed"},
  "advisory.enum.task_restored": {"th": "คืนงานที่ลบ", "en": "Task restored"},

  "advisory.overviewControlTitle": {"th": "สถานะและความคืบหน้าของงาน", "en": "Matter status and progress"},
  "advisory.workStateUnset": {"th": "ยังไม่กำหนด", "en": "Not set"},
  "advisory.editWorkState": {"th": "แก้ไขสถานะการทำงาน", "en": "Edit work state"},
  "advisory.editNextAction": {"th": "แก้ไขงานถัดไป", "en": "Edit next action"},
  "advisory.unsetStageHelp": {"th": "ยังไม่ได้เริ่มติดตามขั้นตอน คุณสามารถเริ่มกำหนดขั้นตอนเพื่อวางแผนงานได้", "en": "Stage tracking has not started. Open the map to plan the next steps."},
  "advisory.unsetClosedStageHint": {"th": "ไม่มีขั้นตอนปัจจุบันที่บันทึกไว้ในงานนี้", "en": "No current stage was recorded for this matter."},
  "advisory.startStagePlan": {"th": "เริ่มกำหนดขั้นตอนงาน", "en": "Start stage planning"},
  "advisory.matterAgeHint": {"th": "นับจากวันที่เปิดงาน", "en": "Since the matter opened"},
  "advisory.matterSections": {"th": "ส่วนต่าง ๆ ของงาน", "en": "Matter sections"},
  "advisory.viewAll": {"th": "ดูทั้งหมด", "en": "View all"},
  "advisory.manageTeam": {"th": "จัดการทีมงาน", "en": "Manage team"},
  "advisory.noAssignedTeam": {"th": "ยังไม่มีทีมที่มอบหมายในระบบ", "en": "No assigned team yet"},
  "advisory.journeyPlan": {"th": "แผนการดำเนินงาน", "en": "Work journey"},
  "advisory.closingHint": {"th": "เมื่อดำเนินงานเสร็จแล้ว คุณสามารถปิดงานได้ ระบบจะเก็บประวัติงานทั้งหมด", "en": "Close the matter when work is complete. All matter history is retained."},
  "advisory.hoursMinutes": {"th": "{hours} ชม. {minutes} นาที", "en": "{hours} hr {minutes} min"},
  "advisory.empty.tasks": {"th": "ยังไม่มีงานที่ต้องทำ", "en": "No tasks yet"},
  "advisory.emptyHint.tasks": {"th": "เพิ่มงานเพื่อมอบหมาย ติดตาม และขับเคลื่อนงานนี้ให้สำเร็จ", "en": "Add a task to assign ownership and track the next step."},
  "advisory.empty.activity": {"th": "ยังไม่มีกิจกรรม", "en": "No activity yet"},
  "advisory.emptyHint.activity": {"th": "บันทึกความคืบหน้า การประชุม หรือเหตุการณ์สำคัญของงานนี้", "en": "Record progress, meetings or important updates for this matter."},
  "advisory.empty.deliverables": {"th": "ยังไม่มีงานส่งมอบ", "en": "No deliverables yet"},
  "advisory.emptyHint.deliverables": {"th": "เพิ่มเอกสาร รายงาน หรือผลลัพธ์ที่ต้องส่งมอบ", "en": "Add a document, report or outcome to deliver."},
  "advisory.tab.overview": {"th": "ภาพรวม", "en": "Overview"},
  "advisory.tab.tasks": {"th": "งานที่ต้องทำ", "en": "Tasks"},
  "advisory.tab.activity": {"th": "กิจกรรม", "en": "Activity"},
  "advisory.tab.deliverables": {"th": "งานส่งมอบ", "en": "Deliverables"},
  "advisory.tab.time": {"th": "เวลา", "en": "Time"},
  "advisory.tab.team": {"th": "ทีมงาน", "en": "Team"},
  "advisory.tab.records": {"th": "ข้อมูลเดิม", "en": "Existing records"},
  "advisory.presetHint": {"th":"ชุดเริ่มต้นนี้ใช้ลำดับ {template} ที่มีอยู่แล้ว","en":"This starter uses the existing {template} sequence."},
  "advisory.starterCatalog": {"th":"ชุดเริ่มต้นตามประเภทงาน","en":"Work starter catalog"},
  "advisory.previewOnly": {"th":"เลือกเพื่อเตรียมแผน ขั้นตอนจะเริ่มเมื่อบันทึกยืนยันเท่านั้น","en":"Choose a plan; stages start only after explicit confirmation."},
  "advisory.recordedSequence": {"th":"ลำดับงานที่บันทึกไว้","en":"Recorded stage sequence"},
  "advisory.preset.general_advisory": {"th":"งานทั่วไป","en":"General matters"},
  "advisory.preset.contract_work": {"th":"งานสัญญา","en":"Contract work"},
  "advisory.enum.contract_work": {"th":"งานสัญญา","en":"Contract work"},
  "advisory.preset.contract_review": {"th":"ตรวจร่างและทบทวนเอกสาร","en":"Document review"},
  "advisory.preset.legal_opinion": {"th":"ความเห็นกฎหมาย","en":"Legal opinion"},
  "advisory.preset.monthly_advisory": {"th":"ที่ปรึกษารายเดือน","en":"Monthly retainer"},
  "advisory.enum.monthly_advisory": {"th":"ที่ปรึกษารายเดือน","en":"Monthly retainer"},
  "advisory.preset.negotiation": {"th":"เจรจา","en":"Negotiation"},
  "advisory.preset.corporate_registration": {"th":"จดทะเบียนและแก้ไขนิติบุคคล","en":"Company registration and changes"},
  "advisory.enum.corporate_registration": {"th":"จดทะเบียนและแก้ไขนิติบุคคล","en":"Company registration and changes"},
  "advisory.preset.license_regulatory": {"th":"ขอและต่อใบอนุญาต","en":"Licensing and renewals"},
  "advisory.preset.government_registration": {"th":"ขึ้นทะเบียนและขออนุมัติหน่วยงานรัฐ","en":"Government registration and approvals"},
  "advisory.enum.government_registration": {"th":"ขึ้นทะเบียนและขออนุมัติหน่วยงานรัฐ","en":"Government registration and approvals"},
  "advisory.preset.employment_hr": {"th":"แรงงาน ข้อบังคับ และเอกสารบุคลากร","en":"Employment, policies and HR documents"},
  "advisory.enum.employment_hr": {"th":"แรงงาน ข้อบังคับ และเอกสารบุคลากร","en":"Employment, policies and HR documents"},
  "advisory.preset.intellectual_property": {"th":"ทรัพย์สินทางปัญญาและเครื่องหมายการค้า","en":"Intellectual property and trademarks"},
  "advisory.enum.intellectual_property": {"th":"ทรัพย์สินทางปัญญาและเครื่องหมายการค้า","en":"Intellectual property and trademarks"},
  "advisory.preset.compliance": {"th":"ภาษี การกำกับดูแล และตรวจสอบภายใน","en":"Tax, compliance and internal audit"},
  "advisory.preset.real_estate_review": {"th":"อสังหาริมทรัพย์และตรวจสอบกรรมสิทธิ์","en":"Real estate and title review"},
  "advisory.enum.real_estate_review": {"th":"อสังหาริมทรัพย์และตรวจสอบกรรมสิทธิ์","en":"Real estate and title review"},
  "advisory.preset.pre_litigation_debt": {"th":"ทวงถามหนี้และปรับโครงสร้างก่อนฟ้อง","en":"Debt recovery and pre-litigation restructuring"},
  "advisory.enum.pre_litigation_debt": {"th":"ทวงถามหนี้และปรับโครงสร้างก่อนฟ้อง","en":"Debt recovery and pre-litigation restructuring"},
  "advisory.preset.transactions_review": {"th":"ควบรวม ร่วมทุน และตรวจสอบสถานะกิจการ","en":"M&A, joint ventures and due diligence"},
  "advisory.enum.transactions_review": {"th":"ควบรวม ร่วมทุน และตรวจสอบสถานะกิจการ","en":"M&A, joint ventures and due diligence"},
  "advisory.preset.data_privacy": {"th":"คุ้มครองข้อมูลส่วนบุคคล","en":"PDPA and data privacy"},
  "advisory.enum.data_privacy": {"th":"คุ้มครองข้อมูลส่วนบุคคล","en":"PDPA and data privacy"},
  "advisory.preset.government_coordination": {"th":"ประสานงานราชการและหนังสือโต้ตอบ","en":"Government liaison and correspondence"},
  "advisory.enum.government_coordination": {"th":"ประสานงานราชการและหนังสือโต้ตอบ","en":"Government liaison and correspondence"},
  "advisory.controlOverview": {"th": "สถานการณ์ของงาน", "en": "Matter control"},
  "advisory.openMap": {"th": "เปิดแผนที่งาน", "en": "Open matter map"},
  "advisory.closeMap": {"th": "ปิดแผนที่งาน", "en": "Close matter map"},
  "advisory.routeOverview": {"th": "มองเส้นทาง รู้จุดหมาย", "en": "A clear route forward"},
  "advisory.mapLegend": {"th": "สัญลักษณ์สถานะขั้นตอน", "en": "Stage status legend"},
  "advisory.stageOrder": {"th": "ลำดับขั้นตอน", "en": "Stage sequence"},
  "advisory.compactJourneyHint": {"th": "เลือกขั้นตอนเพื่อดูรายละเอียดบนแผนที่", "en": "Select a stage to inspect it on the map"},
  "advisory.stepNumber": {"th": "ขั้นที่ {n}", "en": "Step {n}"},
  "advisory.mainRoute": {"th": "เส้นทางหลักตามลำดับ", "en": "Main route in sequence"},
  "advisory.skipRouteHint": {"th": "เส้นประรอง = การข้ามที่บันทึกไว้", "en": "Secondary dotted route = recorded skip"},
  "advisory.routeProgress": {"th": "เส้นทางที่ผ่านแล้ว", "en": "Journey so far"},
  "advisory.visitedCount": {"th": "ผ่านแล้ว {n} ขั้นตอน", "en": "{n} stages visited"},
  "advisory.skippedCount": {"th": "ข้าม {n} ขั้นตอน", "en": "{n} stages skipped"},
  "advisory.progressHint": {"th": "นับจากประวัติที่บันทึกจริง ไม่ใช่เปอร์เซ็นต์งานสำเร็จ", "en": "Based on recorded history, not a percentage of work completed."},
  "advisory.stageDetails": {"th": "รายละเอียดขั้นตอนที่เลือก", "en": "Selected stage details"},
  "advisory.stageTotalDays": {"th": "เวลารวมในขั้นตอนนี้", "en": "Total time in this stage"},
  "advisory.notAvailable": {"th": "ยังไม่มีข้อมูล", "en": "Not available"},
  "advisory.followingStage": {"th": "ถัดไปตามลำดับ", "en": "Next in sequence"},
  "advisory.endOfRoute": {"th": "สิ้นสุดลำดับขั้นตอน", "en": "End of sequence"},
  "advisory.matterNextAction": {"th": "งานถัดไปของงานนอกคดีนี้", "en": "Next action for this matter"},
  "advisory.closeFromMatter": {"th": "บันทึกผลลัพธ์จากส่วนปิดงานในหน้าหลัก", "en": "Record the outcome in the Close matter section on the main page."},
  "advisory.nextActionHint": {"th": "งานที่ต้องขยับต่อ แยกจากลำดับขั้นตอนและสถานะการทำงาน", "en": "The next actionable work, separate from stage sequence and work state."},
  "advisory.clientMattersHint": {"th": "ลูกค้ารายเดียวมีงานนอกคดีได้หลายงาน", "en": "One client can have several non-litigation matters."},
  "advisory.noOtherMatters": {"th": "ยังไม่มีงานนอกคดีอื่นของลูกค้ารายนี้", "en": "This client has no other non-litigation matters yet."},
  "advisory.openMatter": {"th": "เปิดงาน", "en": "Open matter"},
  "advisory.allClientMatters": {"th": "ดูงานทั้งหมดของลูกค้ารายนี้", "en": "View all matters for this client"},
  "advisory.clientFilter": {"th": "แสดงเฉพาะงานของลูกค้า", "en": "Showing matters for client"},
  "advisory.backToRoute": {"th": "กลับไปเลือกขั้นตอน", "en": "Choose another stage"},
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
    "th": "ผู้รับผิดชอบงานถัดไป",
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
    "th": "กำลังดำเนินการ",
    "en": "Working"
  },
  "advisory.enum.waiting_client": {
    "th": "รอลูกค้า",
    "en": "Waiting for client"
  },
  "advisory.enum.waiting_external": {
    "th": "รอภายนอก",
    "en": "Waiting externally"
  },
  "advisory.enum.waiting_internal": {
    "th": "รอภายใน",
    "en": "Waiting internally"
  },
  "advisory.enum.on_hold": {
    "th": "พักไว้",
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
