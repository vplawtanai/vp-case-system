import assert from "node:assert/strict";
import test from "node:test";
import { thaiLegalTextUnits } from "./thai-legal-typography.ts";

const samples = [
  "ผู้ว่าจ้างตกลงชำระค่าบริการให้แก่ผู้ให้บริการตามกำหนดและเงื่อนไขแห่งสัญญานี้",
  "คู่สัญญาตกลงให้สัญญานี้อยู่ภายใต้บังคับแห่งกฎหมายที่เกี่ยวข้อง",
  "ผู้ให้บริการและผู้ว่าจ้างตกลงร่วมกันตามขอบเขตการให้บริการและการดำเนินคดี",
];

test("preserves authoritative Thai text exactly", () => {
  samples.forEach((sample) => {
    assert.equal(thaiLegalTextUnits(sample).map((unit) => unit.text).join(""), sample);
  });
});

test("protects common short lexical fragments without a phrase dictionary", () => {
  samples.forEach((sample) => {
    const units = thaiLegalTextUnits(sample).filter((unit) => !unit.isWhitespace);
    assert.ok(units.every((unit) => !["ผู้", "ให้", "แห่ง", "การ"].includes(unit.text)));
  });
});

test("leaves non-Thai content unchanged", () => {
  assert.deepEqual(thaiLegalTextUnits("Legal services agreement", "en"), [
    { text: "Legal services agreement", isWhitespace: false },
  ]);
});

test("adds bounded break opportunities to long future Thai prose", () => {
  const source = samples.join("");
  const units = thaiLegalTextUnits(source).filter((unit) => !unit.isWhitespace);
  assert.ok(units.length > 1);
  assert.ok(units.every((unit) => [...unit.text].length <= 84));
  assert.equal(units.map((unit) => unit.text).join(""), source);
});
