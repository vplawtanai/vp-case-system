export type UserRole =
  | "admin"
  | "partner"
  | "lawyer"
  | "assistant_lawyer"
  | "staff"
  | "viewer"
  | "";

export type UserPermissionProfile = {
  active?: boolean | null;
  finance_operator?: boolean | null;
  must_change_password?: boolean | null;
  role?: UserRole | string | null;
  financial_access?: boolean | null;
  staff_name?: string | null;
  can_submit_expense_claim?: boolean | null;
  can_view_own_expense_claims?: boolean | null;
  can_view_all_expense_claims?: boolean | null;
  can_approve_expense_claims?: boolean | null;
  can_pay_expense_claims?: boolean | null;
  can_view_company_ledger?: boolean | null;
  can_edit_company_ledger?: boolean | null;
  can_void_company_ledger?: boolean | null;
  can_view_lawyer_compensation?: boolean | null;
  can_edit_lawyer_compensation?: boolean | null;
  can_void_lawyer_compensation?: boolean | null;
  can_manage_finance_payments?: boolean | null;
  can_confirm_finance_payments?: boolean | null;
  can_reverse_finance_payments?: boolean | null;
  can_reallocate_finance_payments?: boolean | null;
  can_view_finance_receipts?: boolean | null;
  can_manage_finance_receipts?: boolean | null;
  can_issue_finance_receipts?: boolean | null;
  can_void_finance_receipts?: boolean | null;
  can_view_finance_tax_invoices?: boolean | null;
  can_manage_finance_tax_invoices?: boolean | null;
  can_issue_finance_tax_invoices?: boolean | null;
  can_view_finance_cash_transactions?: boolean | null;
  can_manage_finance_cash_transactions?: boolean | null;
  can_confirm_finance_cash_transactions?: boolean | null;
  can_reverse_finance_cash_transactions?: boolean | null;
  can_view_finance_billable_charges?: boolean | null;
  can_manage_finance_billable_charges?: boolean | null;
  can_approve_finance_billable_charges?: boolean | null;
  can_submit_office_work_log?: boolean | null;
  can_view_own_office_work_logs?: boolean | null;
  can_view_all_office_work_logs?: boolean | null;
  can_edit_office_work_logs?: boolean | null;
  can_void_office_work_logs?: boolean | null;
};

/* =========================================================
   ROLE NORMALIZATION
========================================================= */

export function normalizeRole(role?: string | null): UserRole {
  if (role === "admin") return "admin";
  if (role === "partner") return "partner";
  if (role === "lawyer") return "lawyer";
  if (role === "assistant_lawyer") return "assistant_lawyer";
  if (role === "staff") return "staff";
  if (role === "viewer") return "viewer";

  return "";
}

/* =========================================================
   ROLE LEVEL HELPERS
========================================================= */

export function isAdmin(role?: string | null) {
  return normalizeRole(role) === "admin";
}

export function isPartner(role?: string | null) {
  return normalizeRole(role) === "partner";
}

export function isLawyer(role?: string | null) {
  return normalizeRole(role) === "lawyer";
}

export function isAssistantLawyer(role?: string | null) {
  return normalizeRole(role) === "assistant_lawyer";
}

export function isStaff(role?: string | null) {
  return normalizeRole(role) === "staff";
}

export function isViewer(role?: string | null) {
  return normalizeRole(role) === "viewer";
}

export function isPartnerUp(role?: string | null) {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === "admin" || normalizedRole === "partner";
}

export function isLawyerUp(role?: string | null) {
  const normalizedRole = normalizeRole(role);

  return (
    normalizedRole === "admin" ||
    normalizedRole === "partner" ||
    normalizedRole === "lawyer"
  );
}

export function isAssistantLawyerUp(role?: string | null) {
  const normalizedRole = normalizeRole(role);

  return (
    normalizedRole === "admin" ||
    normalizedRole === "partner" ||
    normalizedRole === "lawyer" ||
    normalizedRole === "assistant_lawyer"
  );
}

export function isStaffUp(role?: string | null) {
  const normalizedRole = normalizeRole(role);

  return (
    normalizedRole === "admin" ||
    normalizedRole === "partner" ||
    normalizedRole === "lawyer" ||
    normalizedRole === "assistant_lawyer" ||
    normalizedRole === "staff"
  );
}

export function isInternalUser(role?: string | null) {
  return isStaffUp(role);
}

/* =========================================================
   PAGE / MODULE VIEW PERMISSIONS
========================================================= */

export function canViewCases(role?: string | null) {
  return isStaffUp(role) || isViewer(role);
}

export function canViewDashboard(role?: string | null) {
  return isStaffUp(role);
}

export function canViewAlerts(role?: string | null) {
  return isStaffUp(role);
}

export function canViewHistory(role?: string | null) {
  return isLawyerUp(role);
}

export function canViewFees(
  role?: string | null,
  financialAccess?: boolean | null
) {
  return isPartnerUp(role) || financialAccess === true;
}

export function canViewFinanceModule(profile?: UserPermissionProfile | null) {
  const role = normalizeRole(profile?.role || "");

  return (
    profile?.can_submit_expense_claim === true ||
    profile?.can_view_own_expense_claims === true ||
    profile?.can_view_all_expense_claims === true ||
    profile?.can_view_company_ledger === true ||
    profile?.can_view_lawyer_compensation === true ||
    profile?.can_view_finance_cash_transactions === true ||
    profile?.can_manage_finance_cash_transactions === true ||
    profile?.can_confirm_finance_cash_transactions === true ||
    profile?.can_reverse_finance_cash_transactions === true ||
    profile?.can_view_finance_billable_charges === true ||
    profile?.can_manage_finance_billable_charges === true ||
    profile?.can_approve_finance_billable_charges === true ||
    profile?.can_view_finance_receipts === true ||
    profile?.can_manage_finance_receipts === true ||
    profile?.can_issue_finance_receipts === true ||
    profile?.can_void_finance_receipts === true ||
    profile?.can_view_finance_tax_invoices === true ||
    profile?.can_manage_finance_tax_invoices === true ||
    profile?.can_issue_finance_tax_invoices === true ||
    isStaffUp(role)
  );
}

/* =========================================================
   TIME / WORKLOAD VIEW PERMISSIONS
========================================================= */

export function canViewTimeOverview(role?: string | null) {
  return isStaffUp(role);
}

export function canViewOwnTimeDetail(role?: string | null) {
  return isInternalUser(role);
}

export function canViewTeamTimeDetail(role?: string | null) {
  return isPartnerUp(role);
}

export function canViewTeamWorkload(role?: string | null) {
  return canViewTeamTimeDetail(role);
}

export function canViewDailyStaffWorkload(role?: string | null) {
  return canViewTeamTimeDetail(role);
}

export function canViewCaseCost(role?: string | null) {
  return canViewTeamTimeDetail(role);
}

/* =========================================================
   CASE CREATION PERMISSION
========================================================= */

export function canCreateCase(role?: string | null) {
  return isLawyerUp(role);
}

/* =========================================================
   CASE DETAIL EDIT PERMISSIONS
========================================================= */

export function canEditCaseInfo(role?: string | null) {
  return isAssistantLawyerUp(role);
}

export function canEditParties(role?: string | null) {
  return isAssistantLawyerUp(role);
}

export function canEditTimeline(role?: string | null) {
  return isAssistantLawyerUp(role);
}

export function canEditJudgments(role?: string | null) {
  return isAssistantLawyerUp(role);
}

export function canEditEnforcement(role?: string | null) {
  return isAssistantLawyerUp(role);
}

export function canEditDeadlines(role?: string | null) {
  return isAssistantLawyerUp(role);
}

export function canEditTasks(role?: string | null) {
  return isStaffUp(role);
}

export function canEditNotes(role?: string | null) {
  return isStaffUp(role);
}

export function canEditTimeLogs(role?: string | null) {
  return isStaffUp(role);
}

export function canEditFees(
  role?: string | null,
  financialAccess?: boolean | null
) {
  return isPartnerUp(role) || financialAccess === true;
}

export function canEditFinanceModule(role?: string | null) {
  return isAdmin(role);
}

/* =========================================================
   HIGH-RISK ACTION PERMISSIONS
========================================================= */

export function canSoftDelete(role?: string | null) {
  return isPartnerUp(role);
}

export function canRestore(role?: string | null) {
  return isPartnerUp(role);
}

export function canHardDelete(role?: string | null) {
  return isAdmin(role);
}

export function canVoidFinanceEntry(role?: string | null) {
  return isAdmin(role);
}

export function canManageUsers(role?: string | null) {
  return isAdmin(role);
}

/* =========================================================
   ROLE LABELS
========================================================= */

export function renderRoleLabel(role?: string | null) {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === "admin") return "Admin";
  if (normalizedRole === "partner") return "Partner";
  if (normalizedRole === "lawyer") return "Lawyer";
  if (normalizedRole === "assistant_lawyer") return "Assistant Lawyer";
  if (normalizedRole === "staff") return "Staff";
  if (normalizedRole === "viewer") return "Viewer";

  return "-";
}

/* =========================================================
   ONE-SHOT PERMISSION OBJECT
========================================================= */

export function buildPermissions(profile?: UserPermissionProfile | null) {
  // Legacy UI projections omit active; AuthGuard/QuotationGuard validate it before
  // exposing those pages. A known inactive profile must never inherit operational authority.
  if ((profile?.active !== undefined && profile.active !== true) || profile?.must_change_password === true) profile = null;
  const role = normalizeRole(profile?.role || "");
  const admin = isAdmin(role);
  const partner = role === "partner";
  const financeOperator = profile?.finance_operator === true && ["lawyer", "assistant_lawyer", "staff"].includes(role);
  const financeOperations = admin || partner || financeOperator;
  const financeSelfService = ["admin", "partner", "lawyer", "assistant_lawyer", "staff"].includes(role);
  const financialAccess = admin || profile?.financial_access === true;
  const staffName = profile?.staff_name || "";
  const canSubmitExpenseClaim =
    profile?.can_submit_expense_claim === true || isStaffUp(role);
  const canViewOwnExpenseClaims =
    profile?.can_view_own_expense_claims === true || isStaffUp(role);
  const canViewAllExpenseClaims =
    profile?.can_view_all_expense_claims === true || isPartnerUp(role);
  const canApproveExpenseClaims =
    profile?.can_approve_expense_claims === true || isPartnerUp(role);
  const canPayExpenseClaims = admin || profile?.can_pay_expense_claims === true;
  const canViewCompanyLedger =
    isPartnerUp(role);
  const canEditCompanyLedger = admin;
  const canVoidCompanyLedger = admin;
  const canCreateCompensationBatch = admin;
  const canViewLawyerCompensation = admin;
  const canEditLawyerCompensation = admin;
  const canVoidLawyerCompensation = admin;
  // 078: routine document authority is separate from money/control authority.
  const canManageFinanceQuotations = financeOperations;
  const canManageFinancePayments = financeOperations;
  const canConfirmFinancePayments = admin;
  const canReverseFinancePayments = admin;
  const canReallocateFinancePayments = admin;
  // This permits entering the scoped workspace; the server returns only authorized accounts.
  const canViewFinanceCashTransactions = financeOperations;
  const canManageFinanceReceipts = financeOperations;
  const canManageFinanceTaxInvoices = financeOperations;
  const canIssueFinanceTaxInvoices = financeOperations;
  const canViewFinanceTaxInvoices = financeOperations;
  const canIssueFinanceReceipts = financeOperations;
  const canVoidFinanceReceipts = admin;
  const canViewFinanceReceipts = financeOperations;
  const canManageFinanceCashTransactions = admin;
  const canConfirmFinanceCashTransactions = admin;
  const canReverseFinanceCashTransactions = admin;
  const canViewFinanceBillableCharges = financeOperations;
  const canManageFinanceBillableCharges = financeOperations;
  const canApproveFinanceBillableCharges = financeOperations;
  const canSubmitOfficeWorkLog = admin || profile?.can_submit_office_work_log === true;
  const canViewOwnOfficeWorkLogs = admin || profile?.can_view_own_office_work_logs === true;
  const canViewAllOfficeWorkLogs = admin || profile?.can_view_all_office_work_logs === true;
  const canEditOfficeWorkLogs = admin || profile?.can_edit_office_work_logs === true;
  const canVoidOfficeWorkLogs = admin || profile?.can_void_office_work_logs === true;

  return {
    role,
    financialAccess,
    staffName,
    financeOperator,
    canViewFinanceDistribution: admin || partner,
    canViewFinanceBusiness: admin || partner,
    canUseNewFinanceExpenses: financeSelfService,
    canViewFinancePayables: financeOperations,
    canViewOwnCompensation: financeSelfService,
    canExecuteParticipantPayments: admin || financeOperator,
    canFileFinanceTax: admin || financeOperator,

    canViewCases: canViewCases(role),
    canViewDashboard: canViewDashboard(role),
    canViewAlerts: canViewAlerts(role),
    canViewHistory: canViewHistory(role),
    canViewFees: canViewFees(role, financialAccess),
    canSubmitExpenseClaim,
    canViewOwnExpenseClaims,
    canViewAllExpenseClaims,
    canApproveExpenseClaims,
    canPayExpenseClaims,
    canViewCompanyLedger,
    canEditCompanyLedger,
    canVoidCompanyLedger,
    canViewLawyerCompensation,
    canCreateCompensationBatch,
    canEditLawyerCompensation,
    canVoidLawyerCompensation,
    canViewFinanceQuotations: canManageFinanceQuotations,
    canCreateFinanceQuotation: canManageFinanceQuotations,
    canEditFinanceQuotation: canManageFinanceQuotations,
    canCancelFinanceQuotation: admin,
    canMarkFinanceQuotationSent: canManageFinanceQuotations,
    canMarkFinanceQuotationAccepted: canManageFinanceQuotations,
    canManageFinancePayments,
    canConfirmFinancePayments,
    canReverseFinancePayments,
    canReallocateFinancePayments,
    canViewFinancePayments: isPartnerUp(role) || canManageFinancePayments || canConfirmFinancePayments || canReverseFinancePayments || canReallocateFinancePayments,
    canViewFinanceReceipts,
    canManageFinanceReceipts,
    canIssueFinanceReceipts,
    canVoidFinanceReceipts,
    canViewFinanceTaxInvoices,
    canManageFinanceTaxInvoices,
    canIssueFinanceTaxInvoices,
    canViewFinanceCashTransactions,
    canManageFinanceCashTransactions,
    canConfirmFinanceCashTransactions,
    canReverseFinanceCashTransactions,
    canViewFinanceBillableCharges,
    canManageFinanceBillableCharges,
    canApproveFinanceBillableCharges,
    canUseExpenseClaims: canSubmitExpenseClaim || canViewOwnExpenseClaims || canViewAllExpenseClaims,
    canSubmitOfficeWorkLog,
    canViewOwnOfficeWorkLogs,
    canViewAllOfficeWorkLogs,
    canEditOfficeWorkLogs,
    canVoidOfficeWorkLogs,
    canViewOfficeWorkLogs: canViewOwnOfficeWorkLogs || canViewAllOfficeWorkLogs,
    canAccessOfficeWorkLogs: canSubmitOfficeWorkLog || canViewOwnOfficeWorkLogs || canViewAllOfficeWorkLogs,
    canViewFinanceModule: canViewFinanceModule(profile),

    canViewTimeOverview: canViewTimeOverview(role),
    canViewOwnTimeDetail: canViewOwnTimeDetail(role),
    canViewTeamTimeDetail: canViewTeamTimeDetail(role),

    canViewTeamWorkload: canViewTeamWorkload(role),
    canViewDailyStaffWorkload: canViewDailyStaffWorkload(role),
    canViewCaseCost: canViewCaseCost(role),

    canCreateCase: canCreateCase(role),

    canEditCaseInfo: canEditCaseInfo(role),
    canEditParties: canEditParties(role),
    canEditTimeline: canEditTimeline(role),
    canEditJudgments: canEditJudgments(role),
    canEditEnforcement: canEditEnforcement(role),
    canEditDeadlines: canEditDeadlines(role),
    canEditTasks: canEditTasks(role),
    canEditNotes: canEditNotes(role),
    canEditTimeLogs: canEditTimeLogs(role),
    canEditFees: canEditFees(role, financialAccess),
    canEditFinanceModule: canEditCompanyLedger || canEditLawyerCompensation || canApproveExpenseClaims || canPayExpenseClaims,

    canSoftDelete: canSoftDelete(role),
    canRestore: canRestore(role),
    canHardDelete: canHardDelete(role),
    canVoidFinanceEntry: canVoidCompanyLedger || canVoidLawyerCompensation,
    canManageUsers: canManageUsers(role),
  };
}

export type UserPermissions = ReturnType<typeof buildPermissions>;
