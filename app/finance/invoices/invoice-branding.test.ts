import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { resolveDocumentIdentity, resolveFrozenDocumentIdentity, type DocumentIdentity } from "../../../lib/documentIdentity.ts";

const currentIdentity: DocumentIdentity = {
  companyNameTh: "บริษัทปัจจุบัน",
  companyNameEn: "Current Company",
  taxId: "0100000000000",
  branchTh: "สำนักงานใหญ่",
  branchEn: "Head Office",
  addressTh: "ที่อยู่ปัจจุบัน",
  addressEn: "Current address",
  phone: "020000000",
  email: "current@example.com",
  website: "https://example.com",
  description: "Current description",
  logoStoragePath: "company/logo/current.png",
};

test("Draft Invoice identity continues to fill missing seller data from Document Settings", () => {
  const identity = resolveDocumentIdentity({ company_name_th: "บริษัทตามร่าง" }, currentIdentity);

  assert.equal(identity.companyNameTh, "บริษัทตามร่าง");
  assert.equal(identity.taxId, currentIdentity.taxId);
  assert.equal(identity.logoStoragePath, currentIdentity.logoStoragePath);
});

test("Issued Invoice keeps frozen seller text and falls back only to the configured logo", () => {
  const identity = resolveFrozenDocumentIdentity({
    company_name_th: "บริษัท ณ วันที่ออกเอกสาร",
    tax_id: "0999999999999",
  }, currentIdentity);

  assert.equal(identity.companyNameTh, "บริษัท ณ วันที่ออกเอกสาร");
  assert.equal(identity.taxId, "0999999999999");
  assert.equal(identity.addressTh, "");
  assert.equal(identity.logoStoragePath, currentIdentity.logoStoragePath);
});

test("Issued Invoice honors an explicitly frozen logo path", () => {
  const identity = resolveFrozenDocumentIdentity({
    company_name_th: "บริษัท ณ วันที่ออกเอกสาร",
    logo_storage_path: "company/logo/frozen.png",
  }, currentIdentity);

  assert.equal(identity.logoStoragePath, "company/logo/frozen.png");
});

test("Issued Invoice without any configured logo keeps the logo region empty", () => {
  const identity = resolveFrozenDocumentIdentity(
    { company_name_th: "บริษัท ณ วันที่ออกเอกสาร" },
    { ...currentIdentity, logoStoragePath: "" },
  );

  assert.equal(identity.logoStoragePath, "");
});
