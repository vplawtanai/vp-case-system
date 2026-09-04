import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { guidedInvoiceDocumentDefaults, invoiceDraftDatesAreValid, invoicePaymentSectionModel } from "./payment-instructions.ts";

test("guided Invoice defaults never expose the billing trigger as payment instructions", () => {
  const source = {
    dueDate: null,
    billingTrigger: "เมื่อลูกค้าตอบรับใบเสนอราคา",
    amountBeforeVat: 11345.79,
    vatAmount: 654.21,
    totalAmount: 12000,
  };

  assert.deepEqual(guidedInvoiceDocumentDefaults(source), {
    dueDate: "",
    paymentInstructions: "",
  });
  assert.deepEqual(
    [source.amountBeforeVat, source.vatAmount, source.totalAmount],
    [11345.79, 654.21, 12000],
  );
});

test("explicit customer payment instructions remain visible", () => {
  const model = invoicePaymentSectionModel({
    paymentDestination: null,
    paymentInstructions: "กรุณาระบุเลขที่ใบแจ้งหนี้ในการโอน",
    customerNote: null,
  });

  assert.equal(model.showSection, true);
  assert.equal(model.paymentInstructions, "กรุณาระบุเลขที่ใบแจ้งหนี้ในการโอน");
});

test("blank payment instructions do not create an empty document block", () => {
  const model = invoicePaymentSectionModel({
    paymentDestination: null,
    paymentInstructions: "   ",
    customerNote: null,
  });

  assert.equal(model.showSection, false);
  assert.equal(model.paymentInstructions, null);
});

test("bank destination remains visible when payment instructions are blank", () => {
  const model = invoicePaymentSectionModel({
    paymentDestination: {
      bankAccountId: "bank-id",
      shortName: "KBANK",
      bankName: "ธนาคารกสิกรไทย จำกัด (มหาชน)",
      accountName: "บริษัท วีพี พาร์ทเนอร์ จำกัด",
      accountNumber: "182-8-12987-9",
    },
    paymentInstructions: "",
    customerNote: null,
  });

  assert.equal(model.showSection, true);
  assert.equal(model.paymentInstructions, null);
});

test("blank due date remains valid", () => {
  assert.equal(invoiceDraftDatesAreValid("2026-09-04", ""), true);
  assert.equal(invoiceDraftDatesAreValid("2026-09-04", "2026-09-03"), false);
});
