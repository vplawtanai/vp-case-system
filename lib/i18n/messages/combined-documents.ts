import type { MessageCatalog } from "../core";

export const combinedDocumentMessages = {
  "finance.combined.list.failed": { th: "โหลดรายการใบเสร็จรับเงิน/ใบกำกับภาษีไม่สำเร็จ กรุณาลองอีกครั้ง", en: "Unable to load Receipt / Tax Invoice documents. Try again." },
  "finance.combined.list.empty": { th: "ไม่พบเอกสารตามตัวกรอง เอกสารจะแสดงที่นี่เมื่อสร้างผ่านขั้นตอนเอกสารรับเงินของรายการรับชำระที่ยืนยันแล้ว", en: "No documents match this filter. Documents appear here when created through the document workflow for a confirmed Payment." },
  "finance.combined.viewPermission": { th: "ต้องมีสิทธิ์ดูเอกสารทั้งสองประเภท", en: "Viewing requires access to both document types." },
  "finance.combined.loadingDocument": { th: "กำลังโหลดเอกสาร...", en: "Loading document..." },
  "finance.combined.backPayment": { th: "กลับไปรายการรับชำระ", en: "Back to Payment" },
  "finance.combined.draftTitle": { th: "ร่างใบเสร็จรับเงิน/ใบกำกับภาษี", en: "Receipt / Tax Invoice Draft" },
  "finance.combined.backDocument": { th: "กลับไปเอกสาร", en: "Back to Document" },
  "finance.combined.loadingEvidence": { th: "กำลังโหลดหลักฐาน...", en: "Loading evidence..." },
  "finance.combined.linkInvalid": { th: "หลักฐานการเชื่อมโยงเอกสารไม่สอดคล้อง กรุณาโหลดใหม่", en: "The linked document evidence is inconsistent. Reload the document." },
  "finance.combined.issuedReadonly": { th: "เอกสารที่ออกแล้วแก้ไขไม่ได้ การแก้ไขใบเสร็จและเอกสารภาษีต้องใช้ขั้นตอนเฉพาะประเภท", en: "Issued documents are read-only. Receipt and tax document corrections require their respective correction workflows." },
} satisfies MessageCatalog;
