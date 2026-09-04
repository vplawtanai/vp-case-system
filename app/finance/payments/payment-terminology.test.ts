import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { paymentCorrectionCopy, paymentMethodLabels, paymentSettlementLabels, safePaymentReallocationError } from "./shared.ts";

const paymentPageSource = readFileSync(new URL("./[id]/page.tsx", import.meta.url), "utf8");
const invoicePageSource = readFileSync(new URL("../invoices/[id]/page.tsx", import.meta.url), "utf8");

test("bank transfer remains a payment method and is not presented as physical cash", () => {
  assert.equal(paymentMethodLabels.bank_transfer, "โอนเงินผ่านธนาคาร");
  assert.equal(paymentMethodLabels.cash, "เงินสด");
  assert.equal(paymentSettlementLabels.receivedFull, "เงินที่ได้รับจริง");
  assert.equal(paymentSettlementLabels.receivedCompact, "เงินรับจริง");
});

test("settlement components retain their distinct meanings", () => {
  assert.deepEqual(paymentSettlementLabels, {
    receivedFull: "เงินที่ได้รับจริง",
    receivedCompact: "เงินรับจริง",
    whtCredit: "เครดิตภาษีหัก ณ ที่จ่าย",
    settlementTotal: "ยอดตัดชำระรวม",
  });
});

test("post-confirmation correction copy separates allocation from Payment facts", () => {
  assert.equal(paymentCorrectionCopy.sectionTitle, "แก้ไขหลังยืนยัน");
  assert.equal(paymentCorrectionCopy.wrongInvoiceTitle, "เลือกใบแจ้งหนี้ผิด");
  assert.equal(paymentCorrectionCopy.allocationAction, "เปลี่ยนใบแจ้งหนี้ที่ตัดชำระ");
  assert.match(paymentCorrectionCopy.allocationHelper, /ไม่ย้ายเงินจริงระหว่างบัญชี/);
  assert.equal(paymentCorrectionCopy.wrongPaymentTitle, "ข้อมูลรับชำระผิด");
  assert.equal(paymentCorrectionCopy.paymentCorrectionAction, "แก้ไขรายการรับชำระที่บันทึกผิด");
});

test("reallocation errors use Invoice-allocation language", () => {
  assert.equal(
    safePaymentReallocationError({ message: "Not allowed to reallocate" }),
    "คุณไม่มีสิทธิ์เปลี่ยนใบแจ้งหนี้ที่ตัดชำระ",
  );
  assert.equal(
    safePaymentReallocationError({ message: "unexpected failure" }),
    "เปลี่ยนใบแจ้งหนี้ที่ตัดชำระไม่สำเร็จ กรุณารีเฟรชและลองใหม่",
  );
});

test("Payment Draft, review, and confirmed views use actual-money terminology", () => {
  assert.ok((paymentPageSource.match(/paymentSettlementLabels\.receivedFull/g) || []).length >= 3);
  assert.ok((paymentPageSource.match(/paymentSettlementLabels\.receivedCompact/g) || []).length >= 5);
  assert.doesNotMatch(paymentPageSource, /เงินสด/);
});

test("Invoice settlement summary uses the shared actual-money label", () => {
  assert.match(invoicePageSource, /Metric label=\{paymentSettlementLabels\.receivedFull\}/);
  assert.match(invoicePageSource, /Metric label=\{paymentSettlementLabels\.settlementTotal\}/);
  assert.doesNotMatch(invoicePageSource, /เงินสดที่ได้รับ/);
});

test("confirmed correction UI avoids money-movement wording", () => {
  assert.match(paymentPageSource, /paymentCorrectionCopy\.sectionTitle/);
  assert.match(paymentPageSource, /paymentCorrectionCopy\.allocationAction/);
  assert.match(paymentPageSource, /paymentCorrectionCopy\.paymentCorrectionAction/);
  assert.doesNotMatch(paymentPageSource, /ย้ายการจัดสรรยอดรับชำระ|ประวัติการย้ายยอด|ยืนยันการย้าย/);
});
