import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { calculateGrossFirstPercentageAllocation, type GrossFirstAllocationItem } from "./payment-allocation.ts";

const inclusive20000: GrossFirstAllocationItem = { amountBeforeTax: "18691.59", vatAmount: "1308.41", totalAmount: "20000.00" };
const schedule = ["50", "25", "25"].map((percentage) => ({ percentage }));

function totals(items: GrossFirstAllocationItem[], percentages = schedule) {
  return calculateGrossFirstPercentageAllocation({ allocationMode: "proportional_all_items", items, installments: percentages });
}

function sum(values: number[]) { return Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100; }

test("VAT-inclusive 20,000 uses commercial 50/25/25 gross targets", () => {
  const result = totals([inclusive20000]);
  assert.deepEqual(result.installmentTotals, [
    { beforeTax: 9345.79, vat: 654.21, total: 10000 },
    { beforeTax: 4672.9, vat: 327.1, total: 5000 },
    { beforeTax: 4672.9, vat: 327.1, total: 5000 },
  ]);
});

test("non-VAT allocation preserves gross as before-VAT", () => {
  assert.deepEqual(totals([{ amountBeforeTax: "20000.00", vatAmount: 0, totalAmount: "20000.00" }]).installmentTotals, [
    { beforeTax: 10000, vat: 0, total: 10000 },
    { beforeTax: 5000, vat: 0, total: 5000 },
    { beforeTax: 5000, vat: 0, total: 5000 },
  ]);
});

test("uneven percentages distribute residual satang deterministically", () => {
  const result = totals(
    [{ amountBeforeTax: 100, vatAmount: 0, totalAmount: 100 }],
    ["33.333333", "33.333333", "33.333334"].map((percentage) => ({ percentage })),
  );
  assert.deepEqual(result.installmentTotals.map((entry) => entry.total), [33.33, 33.33, 33.34]);
});

test("multiple VAT-inclusive lines reconcile both matrix axes", () => {
  const result = totals([
    { amountBeforeTax: "9345.79", vatAmount: "654.21", totalAmount: "10000.00" },
    { amountBeforeTax: "9345.80", vatAmount: "654.20", totalAmount: "10000.00" },
  ]);
  assert.deepEqual(result.installmentTotals.map((entry) => entry.total), [10000, 5000, 5000]);
  result.cells.forEach((row, index) => {
    assert.equal(sum(row.map((cell) => cell.beforeTax)), Number(["9345.79", "9345.80"][index]));
    assert.equal(sum(row.map((cell) => cell.vat)), Number(["654.21", "654.20"][index]));
    assert.equal(sum(row.map((cell) => cell.total)), 10000);
  });
});

test("mixed VAT-inclusive and non-VAT lines retain source tax totals", () => {
  const items = [
    { amountBeforeTax: "9345.79", vatAmount: "654.21", totalAmount: "10000.00" },
    { amountBeforeTax: "10000.00", vatAmount: 0, totalAmount: "10000.00" },
  ];
  const result = totals(items);
  assert.deepEqual(result.installmentTotals.map((entry) => entry.total), [10000, 5000, 5000]);
  assert.equal(sum(result.installmentTotals.map((entry) => entry.vat)), 654.21);
  assert.equal(sum(result.installmentTotals.map((entry) => entry.beforeTax)), 19345.79);
});

test("VAT-exclusive and non-VAT lines reconcile gross and tax", () => {
  const result = totals([
    { amountBeforeTax: "10000.00", vatAmount: "700.00", totalAmount: "10700.00" },
    { amountBeforeTax: "9300.00", vatAmount: 0, totalAmount: "9300.00" },
  ]);
  assert.deepEqual(result.installmentTotals.map((entry) => entry.total), [10000, 5000, 5000]);
  assert.equal(sum(result.installmentTotals.map((entry) => entry.beforeTax)), 19300);
  assert.equal(sum(result.installmentTotals.map((entry) => entry.vat)), 700);
});

test("many-installment residual allocation loses no satang", () => {
  const result = totals(
    [{ amountBeforeTax: "93.46", vatAmount: "6.54", totalAmount: "100.00" }],
    ["14.285714", "14.285714", "14.285714", "14.285714", "14.285714", "14.285714", "14.285716"].map((percentage) => ({ percentage })),
  );
  assert.equal(sum(result.installmentTotals.map((entry) => entry.total)), 100);
  assert.equal(sum(result.installmentTotals.map((entry) => entry.beforeTax)), 93.46);
  assert.equal(sum(result.installmentTotals.map((entry) => entry.vat)), 6.54);
});

test("per-item percentages use each line's own gross schedule", () => {
  const result = calculateGrossFirstPercentageAllocation({
    allocationMode: "per_item",
    items: [inclusive20000, { amountBeforeTax: 10000, vatAmount: 0, totalAmount: 10000 }],
    installments: [
      { percentage: 100, itemPercentages: [50, 100] },
      { percentage: 100, itemPercentages: [25, 0] },
      { percentage: 100, itemPercentages: [25, 0] },
    ],
  });
  assert.deepEqual(result.installmentTotals.map((entry) => entry.total), [20000, 5000, 5000]);
  assert.deepEqual(result.cells[0].map((entry) => entry.total), [10000, 5000, 5000]);
  assert.deepEqual(result.cells[1].map((entry) => entry.total), [10000, 0, 0]);
});
