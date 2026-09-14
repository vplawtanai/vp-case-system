import type { MessageCatalog } from "../core";

const copy: Record<string, [string, string]> = {
  source: ["ที่มา", "Source"], status: ["สถานะ", "Status"], classification: ["การจำแนก", "Classification"], filters: ["ตัวกรองเงินรับ", "Incoming money filters"],
  "status.draft": ["ร่าง", "Draft"], "status.confirmed": ["ยืนยันแล้ว", "Confirmed"], "status.cancelled": ["ยกเลิกร่างแล้ว", "Draft cancelled"], "status.reversed": ["กลับรายการแล้ว", "Reversed"],
  all: ["ทั้งหมด", "All"], "source.all": ["ทั้งหมด", "All"], "source.invoice": ["จากใบแจ้งหนี้", "Invoice-backed"], "source.direct": ["เงินรับโดยตรง", "Direct receipt"],
  "classification.all": ["ทั้งหมด", "All"], "classification.classified": ["จำแนกแล้ว", "Classified"], "classification.unclassified": ["รอจำแนก", "Unclassified"],
  reference: ["รหัสอ้างอิง", "Reference"], payer: ["ลูกค้า / ผู้จ่าย", "Client / payer"], date: ["วันที่รับเงิน", "Received date"],
  cash: ["เงินรับจริง", "Actual money received"], wht: ["WHT", "WHT"], gross: ["ยอดรับรวม", "Gross received"], open: ["เปิดดู", "View"],
  empty: ["ยังไม่มีรายการเงินรับ", "No incoming money records yet"], filteredEmpty: ["ไม่พบรายการที่ตรงกับตัวกรอง", "No records match these filters"],
  failed: ["โหลดรายการเงินรับไม่สำเร็จ กรุณาลองอีกครั้ง", "Unable to load incoming money. Please try again."],
};
export const incomingMoneyMessages: MessageCatalog = Object.fromEntries(Object.entries(copy).map(([key, [th, en]]) => [`incomingMoney.${key}`, { th, en }]));
