import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React from "react";
import { Document, Font, Page, Text, renderToBuffer } from "@react-pdf/renderer";

const regularFontPath = `${process.cwd()}/assets/fonts/noto-sans-thai/NotoSansThai-Regular.ttf`;
const boldFontPath = `${process.cwd()}/assets/fonts/noto-sans-thai/NotoSansThai-Bold.ttf`;
const fontFamily = "VP-Noto-Sans-Thai";

Font.register({
  family: fontFamily,
  fonts: [
    { src: regularFontPath, fontWeight: 400 },
    { src: boldFontPath, fontWeight: 700 },
  ],
});

const outputDirectory = await mkdtemp(join(tmpdir(), "vp-quotation-font-"));
const outputPath = join(outputDirectory, "quotation-font-smoke-test.pdf");
const pdf = await renderToBuffer(
  React.createElement(
    Document,
    { title: "Quotation Thai font smoke test", language: "th-TH" },
    React.createElement(
      Page,
      { size: "A4", style: { padding: 48, backgroundColor: "#ffffff", color: "#111827", fontFamily, fontSize: 18, lineHeight: 1.5 } },
      React.createElement(Text, { style: { fontWeight: 700, color: "#15803D" } }, "ภาษาไทยทดสอบ"),
      React.createElement(Text, null, "บริษัท วีพี พาร์ทเนอร์ จำกัด"),
      React.createElement(Text, null, "ใบเสนอราคา"),
      React.createElement(Text, null, "102,140.00 บาท"),
      React.createElement(Text, null, "English test"),
      React.createElement(Text, null, "ตัวอย่างน้ำหนักภาษาไทย"),
      React.createElement(Text, { style: { fontWeight: 700 } }, "ตัวหนาภาษาไทย"),
      React.createElement(Text, { style: { fontWeight: 700 } }, "ตัวอย่างน้ำหนักภาษาไทย"),
    ),
  ),
);

await writeFile(outputPath, pdf);
console.log(outputPath);
