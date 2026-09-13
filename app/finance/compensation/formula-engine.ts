import { uiMessage, type UiLocale } from "../../../lib/i18n/core";
import { translate } from "../../../lib/i18n/catalog";
import definitions from "./formula-definitions.json";

export const compensationFormulaDefinitions = definitions;
export const formulaCodes = definitions.formulas.map(formula => formula.code as FormulaCode);
type BatchForm = { received_amount: string; formula_code: FormulaCode };

export type UserProfileRow = { id: string; full_name: string | null; staff_name: string | null; email: string | null };

export type FormulaCode = "pao_line" | "tun_line" | "source_worker_qc" | "travel_fee" | "custom";

export type AllocationRow = {
  id?: string;
  batch_id?: string;
  recipient_type: string;
  recipient_user_id: string;
  recipient_name: string;
  role_label: string;
  custom_role?: string;
  percent: string;
  amount: string;
  is_company_share: boolean;
  payment_status?: string | null;
  paid_at?: string | null;
  note: string;
};

export const otherValue = "__other__";

export const roleLabels = [
  "Client Source / Broker",
  "Company Share",
  "Lead Lawyer / Case Owner",
  "Co-Lawyer / Co-Worker",
  "Assistant",
  "Quality Controller",
  "Other",
];

export const recipientTypes = ["company", "source", "lawyer", "lead_lawyer", "worker", "assistant", "qc", "other"];

export function generateAllocations(formula: FormulaCode, total: number): AllocationRow[] {
  if (!total || total <= 0) return [];
  return (definitions.formulas.find(value => value.code === formula)?.defaults || []).map(row =>
    createAllocation(row.type, row.name, row.percent, row.company, row.role, total));
}

export function createAllocation(type: string, name: string, percent: number | string, isCompany: boolean, roleLabel = "", total = 0): AllocationRow {
  const percentNumber = Number(percent) || 0;
  return {
    recipient_type: type,
    recipient_user_id: "",
    recipient_name: name,
    role_label: roleLabel,
    percent: String(percent),
    amount: total ? String(roundMoney((total * percentNumber) / 100)) : "",
    is_company_share: isCompany,
    payment_status: "unpaid",
    paid_at: null,
    note: "",
  };
}

export function validateAllocations(form: BatchForm, rows: AllocationRow[]) {
  const total = parseMoney(form.received_amount);
  if (total <= 0) return uiMessage("finance.compensation.validation.received");
  if (rows.length === 0) return uiMessage("finance.compensation.validation.allocationsRequired");
  const allocationTotal = rows.reduce((sum, item) => sum + parseMoney(item.amount), 0);
  if (Math.abs(allocationTotal - total) > 0.01) return uiMessage("finance.compensation.validation.total");
  if (rows.some((item) => parseMoney(item.amount) <= 0)) return uiMessage("finance.compensation.validation.rowPositive");
  if (form.formula_code === "custom") {
    const percentTotal = rows.reduce((sum, item) => sum + parseMoney(item.percent), 0);
    if (Math.abs(percentTotal - 100) > 0.01) return uiMessage("finance.compensation.validation.customTotal");
  }
  if (form.formula_code !== "custom" && !rows.some((item) => item.is_company_share)) return uiMessage("finance.compensation.validation.companyRequired");
  if (rows.some((item) => item.is_company_share && item.recipient_type !== "company")) return uiMessage("finance.compensation.validation.companyType");
  if (rows.some((item) => !item.payment_status)) return uiMessage("finance.compensation.validation.paymentStatus");
  if (rows.some((item) => item.recipient_type === "source" && !item.role_label)) return uiMessage("finance.compensation.validation.sourceRole");
  if (rows.some((item) => item.role_label === "Other" && !item.custom_role?.trim())) return uiMessage("finance.compensation.validation.customRole");
  if (rows.some((item) => !getRecipientName(item, []))) return uiMessage("finance.compensation.validation.recipient");
  if (form.formula_code === "travel_fee" && (rows.length !== 1 || !rows[0].is_company_share || parseMoney(rows[0].amount) !== total)) return uiMessage("finance.compensation.validation.travel");
  if (form.formula_code === "source_worker_qc") {
    const source = rows.filter((item) => item.recipient_type === "source").reduce((sum, item) => sum + parseMoney(item.amount), 0);
    const company = rows.filter((item) => item.is_company_share).reduce((sum, item) => sum + parseMoney(item.amount), 0);
    const pool = allocationTotal - source - company;
    const sourceRows = rows.filter((item) => item.recipient_type === "source");
    const companyRows = rows.filter((item) => item.is_company_share);
    const ownerRows = rows.filter((item) => isSourcePoolOwnerRow(item, form.formula_code));
    const poolPercent = rows
      .filter((item) => isSourcePoolRow(item, form.formula_code))
      .reduce((sum, item) => sum + getPoolPercent(item), 0);
    if (sourceRows.length !== 1) return uiMessage("finance.compensation.validation.sourceCount");
    if (companyRows.length !== 1) return uiMessage("finance.compensation.validation.companyCount");
    if (ownerRows.length !== 1) return uiMessage("finance.compensation.validation.ownerCount");
    if (getPoolPercent(ownerRows[0]) < 0) return uiMessage("finance.compensation.validation.ownerPercent");
    if (Math.abs(source - total * 0.2) > 0.01) return uiMessage("finance.compensation.validation.sourcePercent");
    if (Math.abs(company - total * 0.4) > 0.01) return uiMessage("finance.compensation.validation.companyPercent");
    if (Math.abs(pool - total * 0.4) > 0.01) return uiMessage("finance.compensation.validation.poolAmount");
    if (Math.abs(poolPercent - 100) > 0.01) return uiMessage("finance.compensation.validation.poolPercent");
  }
  return "";
}

export function getRecipientName(row: AllocationRow, users: UserProfileRow[]) {
  if (row.recipient_type === "company") return row.recipient_name.trim() || "Company";
  if (row.recipient_user_id && row.recipient_user_id !== otherValue) {
    const user = users.find((item) => item.id === row.recipient_user_id);
    return user ? renderUserLabel(user) : row.recipient_name.trim();
  }
  return row.recipient_name.trim();
}

export function getRoleLabelForSave(row: AllocationRow) {
  if (row.role_label === "Other" && row.custom_role?.trim()) return row.custom_role.trim();
  return row.role_label || null;
}

export function getWorkPoolRecipientType(roleLabel: string) {
  if (roleLabel === "Lead Lawyer / Case Owner") return "lead_lawyer";
  if (roleLabel === "Co-Lawyer / Co-Worker") return "worker";
  if (roleLabel === "Assistant") return "assistant";
  if (roleLabel === "Quality Controller") return "qc";
  return "other";
}

export function dedupeAllocationRows(rows: AllocationRow[]) {
  const seen = new Set<string>();
  return rows.map(normalizeAllocationForState).filter((row) => {
    const key = [
      row.recipient_type,
      row.recipient_user_id && row.recipient_user_id !== otherValue ? row.recipient_user_id : "",
      getRecipientName(row, []),
      getRoleLabelForSave(row) || "",
      formatPercent(parseMoney(row.percent)),
      String(roundMoney(parseMoney(row.amount))),
      row.is_company_share ? "company" : "recipient",
    ].join("|").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeAllocationsForSave(receivedAmount: number, formula: FormulaCode, rows: AllocationRow[]) {
  if (formula === "custom") {
    return dedupeAllocationRows(
      rows.map((item) => ({
        ...normalizeAllocationForState(item),
        payment_status: item.payment_status || "unpaid",
        paid_at: item.payment_status === "paid" ? item.paid_at || null : null,
      }))
    );
  }
  const normalized = rows.map((item) => normalizeAllocationForState(item));
  if (formula !== "source_worker_qc") {
    return dedupeAllocationRows(normalized.map((item) => ({
      ...item,
      amount: String(roundMoney((receivedAmount * parseMoney(item.percent)) / 100)),
      payment_status: item.payment_status || "unpaid",
    })));
  }

  const sourceRow = normalized.find((item) => item.recipient_type === "source") || createAllocation("source", "", 20, false, "Client Source / Broker");
  const companyRow = normalized.find((item) => item.is_company_share) || createAllocation("company", "Company", 40, true, "Company Share");
  const poolRows = normalized.filter((item) => isSourcePoolRow(item, formula));
  return dedupeAllocationRows([
    {
      ...sourceRow,
      percent: "20",
      amount: String(roundMoney(receivedAmount * 0.2)),
      role_label: sourceRow.role_label || "Client Source / Broker",
      payment_status: sourceRow.payment_status || "unpaid",
    },
    {
      ...companyRow,
      recipient_type: "company",
      recipient_name: "Company",
      role_label: "Company Share",
      percent: "40",
      amount: String(roundMoney(receivedAmount * 0.4)),
      is_company_share: true,
      payment_status: companyRow.payment_status || "unpaid",
    },
    ...poolRows.map((item) => {
      const poolPercent = getPoolPercent(item);
      const actualPercent = (poolPercent * 40) / 100;
      return {
        ...item,
        percent: formatPercent(actualPercent),
        amount: String(roundMoney((receivedAmount * actualPercent) / 100)),
        is_company_share: false,
        payment_status: item.payment_status || "unpaid",
      };
    }),
  ]);
}

export function validateNormalizedRowsForSave(receivedAmount: number, formula: FormulaCode, rows: AllocationRow[]) {
  if (formula !== "source_worker_qc") return "";
  const companyAmount = rows
    .filter((item) => item.is_company_share)
    .reduce((sum, item) => sum + parseMoney(item.amount), 0);
  const expectedCompanyAmount = roundMoney(receivedAmount * 0.4);
  if (Math.abs(companyAmount - expectedCompanyAmount) > 0.01) {
    return uiMessage("finance.compensation.validation.expectedCompany", { expected: formatMoney(expectedCompanyAmount), received: formatMoney(receivedAmount) });
  }
  return "";
}

export function isSourcePoolRow(row: AllocationRow, formula: FormulaCode) {
  return formula === "source_worker_qc" && row.recipient_type !== "source" && !row.is_company_share;
}

export function isSourcePoolOwnerRow(row: AllocationRow, formula: FormulaCode) {
  return isSourcePoolRow(row, formula) && row.role_label === "Lead Lawyer / Case Owner";
}

export function isFixedSourceWorkerRow(row: AllocationRow, formula: FormulaCode) {
  return formula === "source_worker_qc" && (row.recipient_type === "source" || row.is_company_share || isSourcePoolOwnerRow(row, formula));
}

export function getPoolPercent(row: AllocationRow) {
  return (parseMoney(row.percent) / 40) * 100;
}

export function getDisplayPercent(row: AllocationRow, formula: FormulaCode) {
  return isSourcePoolRow(row, formula) ? formatPercent(getPoolPercent(row)) : row.percent;
}

export function rebalanceOwnerWorkPool(rows: AllocationRow[], receivedAmount: number, formula: FormulaCode) {
  if (formula !== "source_worker_qc") return rows;
  const nonOwnerPoolPercent = rows
    .filter((item) => isSourcePoolRow(item, formula) && !isSourcePoolOwnerRow(item, formula))
    .reduce((sum, item) => sum + getPoolPercent(item), 0);
  const ownerPoolPercent = 100 - nonOwnerPoolPercent;
  const ownerActualPercent = (ownerPoolPercent * 40) / 100;
  return rows.map((item) => {
    if (!isSourcePoolOwnerRow(item, formula)) return item;
    return normalizeAllocationForState({
      ...item,
      percent: formatPercent(ownerActualPercent),
      amount: String(roundMoney((receivedAmount * ownerActualPercent) / 100)),
    });
  });
}

export function normalizeAllocationForState(row: AllocationRow): AllocationRow {
  const isPresetRole = !row.role_label || roleLabels.includes(row.role_label);
  return {
    ...row,
    recipient_user_id: row.recipient_user_id || "",
    recipient_name: row.recipient_name || (row.recipient_type === "company" ? "Company" : ""),
    role_label: isPresetRole ? row.role_label || "" : "Other",
    custom_role: isPresetRole ? row.custom_role || "" : row.role_label,
    percent: String(row.percent || ""),
    amount: String(row.amount || ""),
    payment_status: row.payment_status || "unpaid",
    paid_at: row.paid_at || null,
    note: row.note || "",
  };
}

export function prepareAllocationForEdit(row: AllocationRow): AllocationRow {
  return { ...normalizeAllocationForState(row), recipient_user_id: row.recipient_user_id || (row.recipient_name ? otherValue : "") };
}

export function normalizeFormula(value?: string | null): FormulaCode {
  if (value === "tun_line" || value === "source_worker_qc" || value === "travel_fee" || value === "custom") return value;
  return "pao_line";
}

export function renderFormula(value: string | null | undefined, locale: UiLocale) {
  const formula = definitions.formulas.find(row => row.code === value);
  return formula ? translate(locale, formula.label_key) : value || "-";
}

export function renderUserLabel(user: UserProfileRow) { return user.staff_name || user.full_name || user.email || user.id; }

export function parseMoney(value: number | string | null | undefined) { const amount = Number(String(value || "").replace(/,/g, "").trim()); return Number.isFinite(amount) ? amount : 0; }

export function roundMoney(value: number) { return Math.round(value * 100) / 100; }

export function formatPercent(value: number) { return String(Math.round(value * 10000) / 10000); }

export function formatMoney(value: number) { return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
