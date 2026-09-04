export type InvoiceWorkspacePage = "invoices" | "billable-charges";

export type InvoiceWorkspaceNavigationLink = {
  href: string;
  page: InvoiceWorkspacePage;
  label: string;
};

const invoiceWorkspaceLinks: InvoiceWorkspaceNavigationLink[] = [
  { href: "/finance/invoices", page: "invoices", label: "รายการใบแจ้งหนี้" },
  { href: "/finance/billable-charges", page: "billable-charges", label: "รายการเรียกเก็บเพิ่มเติม" },
];

export function invoiceWorkspaceNavigationLinks(showAdditionalCharges = true): InvoiceWorkspaceNavigationLink[] {
  return showAdditionalCharges ? invoiceWorkspaceLinks : invoiceWorkspaceLinks.slice(0, 1);
}
