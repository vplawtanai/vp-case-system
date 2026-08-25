import assert from "node:assert/strict";
import test from "node:test";
import { thaiLegalTextUnits } from "./thai-legal-typography.ts";

const thaiProse = "การประมวลผลภาษาไทยควรใช้พื้นที่บรรทัดอย่างเป็นธรรมชาติ";
const mixedProse = "ระบบเอกสารรองรับ API v3.2 และข้อมูลปี 2026 (ทดสอบแล้ว)";

test("reconstructs authoritative source text exactly", () => {
  [thaiProse, mixedProse, `${thaiProse}\n${mixedProse}`].forEach((source) => {
    assert.equal(thaiLegalTextUnits(source).map((unit) => unit.text).join(""), source);
  });
});

test("does not introduce visible spaces", () => {
  const source = thaiProse.replaceAll(" ", "");
  const renderedText = thaiLegalTextUnits(source).map((unit) => unit.text).join("");
  assert.equal(renderedText, source);
  assert.equal(renderedText.includes(" "), false);
});

test("uses generic lexical segments as individual break units", () => {
  const expectedSegments = [...new Intl.Segmenter("th", { granularity: "word" }).segment(thaiProse)]
    .map((entry) => entry.segment);
  const units = thaiLegalTextUnits(thaiProse);

  assert.deepEqual(units.map((unit) => unit.text), expectedSegments);
  assert.ok(units.filter((unit) => unit.protectFromBreak).every((unit) => expectedSegments.includes(unit.text)));
  assert.ok(units.filter((unit) => unit.breakAfter).length > 1);
});

test("keeps Thai, English, numbers, whitespace, and punctuation stable", () => {
  const units = thaiLegalTextUnits(mixedProse);
  assert.equal(units.map((unit) => unit.text).join(""), mixedProse);
  assert.ok(units.some((unit) => unit.isWhitespace));
  assert.ok(units.some((unit) => unit.protectFromBreak));
  assert.ok(units.some((unit) => /2026/u.test(unit.text)));
  assert.ok(units.some((unit) => /[().]/u.test(unit.text)));
});

test("leaves non-Thai content unchanged", () => {
  assert.deepEqual(thaiLegalTextUnits("Legal services agreement", "en"), [
    { text: "Legal services agreement", isWhitespace: false, protectFromBreak: false, breakAfter: false },
  ]);
});
