import { supabase } from "./supabase";

type AuditAction = "create" | "update" | "delete" | "soft_delete" | "restore";

type CreateAuditLogParams = {
  caseId?: number | string | null;
  tableName: string;
  recordId?: string | number | null;
  action: AuditAction;
  oldData?: unknown;
  newData?: unknown;
  note?: string;
};

type UserProfile = {
  full_name?: string | null;
  role?: string | null;
};

export async function createAuditLog({
  caseId,
  tableName,
  recordId,
  action,
  oldData = null,
  newData = null,
  note = "",
}: CreateAuditLogParams) {
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      console.error("AUDIT LOG SKIPPED: no authenticated user", userError);
      return;
    }

    const user = userData.user;

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("AUDIT LOG PROFILE ERROR:", profileError);
    }

    const userProfile = (profile || {}) as UserProfile;

    const { error } = await supabase.from("case_audit_logs").insert([
      {
        case_id: toNullableNumber(caseId),
        table_name: tableName,
        record_id:
          recordId !== null && recordId !== undefined ? String(recordId) : null,
        action,

        user_id: user.id,
        user_email: user.email || "",
        user_name: userProfile.full_name || user.email || "",
        user_role: userProfile.role || "",

        old_data: oldData,
        new_data: newData,
        note,

        created_at: new Date().toISOString(),
      },
    ]);

    if (error) {
      console.error("CREATE AUDIT LOG FAILED:", error);
    }
  } catch (error) {
    console.error("CREATE AUDIT LOG CATCH ERROR:", error);
  }
}

function toNullableNumber(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return null;

  const num = Number(value);
  if (Number.isNaN(num)) return null;

  return num;
}