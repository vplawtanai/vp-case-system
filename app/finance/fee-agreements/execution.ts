export const feeAgreementExecutionModes = ["paper", "electronic"] as const;

export type FeeAgreementExecutionMode = (typeof feeAgreementExecutionModes)[number];

export function normalizeFeeAgreementExecutionMode(value: unknown): FeeAgreementExecutionMode {
  return value === "electronic" ? "electronic" : "paper";
}

export function feeAgreementExecutionModeLabel(mode: FeeAgreementExecutionMode) {
  return mode === "electronic" ? "ลงนามทางอิเล็กทรอนิกส์" : "ลงนามบนเอกสาร";
}

export function feeAgreementClosingCopy({
  mode,
  hasWitnesses,
  languageCode,
}: {
  mode: FeeAgreementExecutionMode;
  hasWitnesses: boolean;
  languageCode: string;
}) {
  if (languageCode === "en") {
    if (mode === "electronic") {
      return "The Parties have read and understood this Agreement and intend to be legally bound by it. Acceptance or signing may be completed electronically, and once completed, each Party may access and retain the completed electronic Agreement.";
    }
    return hasWitnesses
      ? "This Agreement is made in two counterparts of identical content. The Parties have read and understood this Agreement in full and have signed it in the presence of witnesses, with each Party retaining one counterpart."
      : "This Agreement is made in two counterparts of identical content. The Parties have read and understood this Agreement in full and have signed it, with each Party retaining one counterpart.";
  }

  if (mode === "electronic") {
    return "คู่สัญญาได้อ่านและเข้าใจข้อความในสัญญาโดยตลอดแล้ว และตกลงมีเจตนาผูกพันตามสัญญานี้ โดยกำหนดให้การแสดงการยอมรับหรือการลงลายมือชื่อสามารถดำเนินการด้วยวิธีการทางอิเล็กทรอนิกส์ได้ และเมื่อดำเนินการดังกล่าวเสร็จสิ้น คู่สัญญาแต่ละฝ่ายสามารถเข้าถึงและเก็บรักษาสัญญาอิเล็กทรอนิกส์ฉบับสมบูรณ์ไว้ได้";
  }
  return hasWitnesses
    ? "สัญญานี้ทำขึ้นเป็นสองฉบับ มีข้อความถูกต้องตรงกัน คู่สัญญาได้อ่านและเข้าใจข้อความในสัญญาโดยตลอดแล้ว จึงลงลายมือชื่อไว้เป็นสำคัญต่อหน้าพยาน และต่างฝ่ายต่างยึดถือไว้ฝ่ายละหนึ่งฉบับ"
    : "สัญญานี้ทำขึ้นเป็นสองฉบับ มีข้อความถูกต้องตรงกัน คู่สัญญาได้อ่านและเข้าใจข้อความในสัญญาโดยตลอดแล้ว จึงลงลายมือชื่อไว้เป็นสำคัญ และต่างฝ่ายต่างยึดถือไว้ฝ่ายละหนึ่งฉบับ";
}
