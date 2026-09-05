import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { formatThaiSellerAddress, normalizeDocumentIdentity, resolveDocumentIdentity, resolveFrozenDocumentIdentity } from "./documentIdentity.ts";

const street = "เลขที่ 91/260 ถนนสุวินทวงศ์ แขวงมีนบุรี เขตมีนบุรี";

test("Thai seller address keeps the stored Bangkok/postcode on its final line", () => {
  assert.deepEqual(formatThaiSellerAddress(`${street} กรุงเทพมหานคร 10530`), {
    body: street, localityLine: "กรุงเทพมหานคร 10530",
  });
});

test("existing newlines between locality and postcode do not become separate display lines", () => {
  assert.deepEqual(formatThaiSellerAddress(`${street}\r\nกรุงเทพมหานคร\r\n10530`), {
    body: street, localityLine: "กรุงเทพมหานคร 10530",
  });
});

test("province prefixes, abbreviations, bare province names and Thai digits are retained", () => {
  for (const locality of ["จังหวัดเชียงใหม่", "จังหวัด เชียงใหม่", "จ.เชียงใหม่", "จ. เชียงใหม่", "เชียงใหม่", "กทม.", "กรุงเทพฯ"]) {
    for (const postcode of ["50200", "๕๐๒๐๐"]) {
      assert.deepEqual(formatThaiSellerAddress(`123 ถนนตัวอย่าง ${locality} ${postcode}`), {
        body: "123 ถนนตัวอย่าง", localityLine: `${locality} ${postcode}`,
      });
    }
  }
});

test("no postcode is fabricated, replaced or inferred from the UAT example", () => {
  assert.equal(formatThaiSellerAddress(`${street} กรุงเทพมหานคร 10510`).localityLine, "กรุงเทพมหานคร 10510");
  for (const address of ["", street, `${street} กรุงเทพมหานคร`, "10530", "91 Example Road, Bangkok 10530", `${street} กรุงเทพมหานคร 1053`, `${street} กรุงเทพมหานคร 105300`]) {
    assert.deepEqual(formatThaiSellerAddress(address), { body: address, localityLine: "" });
  }
});

test("formatting preserves address words and punctuation", () => {
  const original = `123 ถนนตัวอย่าง, จังหวัดเชียงใหม่ 50200`;
  const formatted = formatThaiSellerAddress(original);
  assert.equal(`${formatted.body} ${formatted.localityLine}`, original);
  assert.deepEqual(formatThaiSellerAddress("กรุงเทพมหานคร 10530"), { body: "", localityLine: "กรุงเทพมหานคร 10530" });
});

test("Draft uses its resolved authoritative address; Issued keeps its frozen postcode", () => {
  const current = normalizeDocumentIdentity({ address_th: `${street} กรุงเทพมหานคร 10530` });
  const frozen = Object.freeze({ address_th: `${street} กรุงเทพมหานคร 10510` });
  assert.equal(formatThaiSellerAddress(resolveDocumentIdentity({}, current).addressTh).localityLine, "กรุงเทพมหานคร 10530");
  assert.equal(formatThaiSellerAddress(resolveDocumentIdentity(frozen, current).addressTh).localityLine, "กรุงเทพมหานคร 10510");
  assert.equal(formatThaiSellerAddress(resolveFrozenDocumentIdentity(frozen, current).addressTh).localityLine, "กรุงเทพมหานคร 10510");
  assert.equal(resolveFrozenDocumentIdentity({}, current).addressTh, "");
  assert.equal(frozen.address_th, `${street} กรุงเทพมหานคร 10510`);
  assert.equal(current.addressTh, `${street} กรุงเทพมหานคร 10530`);
});

test("Invoice Draft, Issued and Print share the identity renderer with bounded locality wrapping", () => {
  const header = readFileSync(new URL("../app/components/DocumentIdentity.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/components/DocumentIdentity.module.css", import.meta.url), "utf8");
  const invoice = readFileSync(new URL("../app/finance/invoices/invoice-document.tsx", import.meta.url), "utf8");
  const preview = readFileSync(new URL("../app/finance/invoices/[id]/preview/page.tsx", import.meta.url), "utf8");
  assert.match(header, /address === identity.addressTh\s*\? formatThaiSellerAddress\(address\)/);
  assert.match(header, /<span className=\{styles.addressLocality\}>\{addressLines.localityLine\}<\/span>/);
  assert.doesNotMatch(header, /10530|10510/);
  const localityCss = css.match(/\.providerMetadata \.addressLocality\s*\{([^}]+)\}/)?.[1] || "";
  assert.match(localityCss, /display: block/);
  assert.match(localityCss, /max-width: 100%/);
  assert.match(localityCss, /overflow-wrap: anywhere/);
  assert.doesNotMatch(localityCss, /nowrap|\d+(?:px|mm)/);
  assert.match(invoice, /<DocumentIdentityHeader/);
  assert.match(preview, /resolveFrozenDocumentIdentity\(sellerSnapshot/);
  assert.match(preview, /resolveDocumentIdentity\(sellerSnapshot/);
  assert.match(preview, /window.print\(\)/);
  assert.match(preview, /<InvoiceDocument/);
});
