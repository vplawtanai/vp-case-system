export type UserRole =
  | "admin"
  | "partner"
  | "lawyer"
  | "assistant_lawyer"
  | "staff"
  | "viewer"
  | "";

export type UserPermissionProfile = {
  role?: UserRole | string | null;
  financial_access?: boolean | null;
  staff_name?: string | null;
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
  const role = normalizeRole(profile?.role || "");
  const financialAccess = profile?.financial_access === true;
  const staffName = profile?.staff_name || "";

  return {
    role,
    financialAccess,
    staffName,

    canViewCases: canViewCases(role),
    canViewDashboard: canViewDashboard(role),
    canViewAlerts: canViewAlerts(role),
    canViewHistory: canViewHistory(role),
    canViewFees: canViewFees(role, financialAccess),

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

    canSoftDelete: canSoftDelete(role),
    canRestore: canRestore(role),
    canHardDelete: canHardDelete(role),
    canManageUsers: canManageUsers(role),
  };
}

export type UserPermissions = ReturnType<typeof buildPermissions>;