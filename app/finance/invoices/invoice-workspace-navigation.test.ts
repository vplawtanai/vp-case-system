import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { financeNavigationLinks } from "../finance-navigation.ts";
// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { buildPermissions } from "../../../lib/permissions.ts";

const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

for (const locale of ["th", "en"] as const) test(`${locale}: module switching stays in the Finance top navigation once per module`, () => {
  const links = financeNavigationLinks(buildPermissions({ role: "admin" }), locale);
  for (const modulePage of ["invoices", "billable-charges"]) assert.equal(links.filter(link => link.href === `/finance/${modulePage}`).length, 1);
  assert.equal(links.find(link => link.page === "billable-charges")?.label, locale === "th" ? "รายการเรียกเก็บนอกใบเสนอราคา" : "Non-Quotation Charges");
});

for (const file of ["page.tsx", "../billable-charges/page.tsx", "compose/page.tsx"]) test(`${file}: no cross-module tabs or replacement navigation`, () => {
  const page = source(file);
  assert.equal((page.match(/<FinanceSubNav\b/g) || []).length, 1);
  assert.doesNotMatch(page, /InvoiceWorkspaceNav|invoice-workspace-navigation|<nav\b/);
  if (file !== "compose/page.tsx") assert.match(page, /<FinanceSubNav[^>]+\/>\s*<header/);
});

test("Invoice creation and Charge creation/filter/search controls remain outside navigation", () => {
  const invoices = source("page.tsx"), charges = source("../billable-charges/page.tsx");
  assert.match(invoices, /canCompose \? <Link[^>]+href="\/finance\/invoices\/compose"/);
  assert.match(charges, /canComposeInvoice \? <Link[^>]+href="\/finance\/invoices\/compose"/);
  assert.match(charges, /permissions\.canManageFinanceBillableCharges \? <button/);
  assert.match(charges, /localizedStatusTabs\(locale\)\.map/);
  assert.match(charges, /aria-label=\{t\("finance\.charge\.ui\.searchLabel"\)\}/);
});

test("The obsolete tab implementation and its dedicated translation keys are removed", () => {
  for (const file of ["InvoiceWorkspaceNav.tsx", "invoice-workspace-navigation.ts", "invoice-workspace-nav.module.css"]) assert.equal(existsSync(new URL(file, import.meta.url)), false);
  assert.doesNotMatch(source("../../../lib/i18n/messages/invoices.ts"), /"finance\.invoice\.ui\.(navigation|listNavigation)"/);
});
