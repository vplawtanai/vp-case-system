import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validatePassword } from "../password-onboarding";
import { randomUUID } from "node:crypto";
import { isActiveAdmin, validatePeopleInput, PEOPLE_ERRORS, type PeopleProfile } from "../people";

export type PeopleClients = { caller: SupabaseClient; privileged: () => SupabaseClient };
type PeopleError = { message?: string; code?: string } | null;
class AdminError extends Error {
  constructor(public code: string, public status = 400, public reference?: string) { super(code); }
}
function check(error: PeopleError) {
  if (!error) return;
  const code = Object.keys(PEOPLE_ERRORS).find(key => error.message?.includes(key));
  throw new AdminError(code || "OPERATION_FAILED", code === "FORBIDDEN" ? 403 : 409);
}
function reply(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}
export function peopleClientsFor(request: Request): PeopleClients {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length > 10000) throw new AdminError("UNAUTHORIZED", 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new AdminError("CONFIGURATION_REQUIRED", 503);
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const caller = createClient(url, anon, { ...options, global: { headers: { Authorization: authorization } } });
  return {
    caller,
    privileged: () => {
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!key) throw new AdminError("CONFIGURATION_REQUIRED", 503);
      return createClient(url, key, options);
    },
  };
}
async function authorize(caller: SupabaseClient) {
  const { data, error } = await caller.auth.getUser();
  if (error || !data.user) throw new AdminError("UNAUTHORIZED", 401);
  const profile = await caller.from("user_profiles").select("id, role, active, must_change_password").eq("id", data.user.id).single();
  if (profile.error || !isActiveAdmin(profile.data) || profile.data.must_change_password !== false) throw new AdminError("FORBIDDEN", 403);
  return data.user.id;
}
async function readProfile(caller: SupabaseClient, id: string): Promise<PeopleProfile> {
  const result = await caller.rpc("people_admin_get_users");
  check(result.error);
  const profile = (result.data as PeopleProfile[]).find(user => user.id === id);
  if (!profile) throw new AdminError("NOT_FOUND", 404);
  return profile;
}
// Injectable clients are for isolated tests only; the route never accepts this from a request.
export async function handlePeopleRequest(request: Request, supplied?: PeopleClients) {
  try {
    const { caller, privileged } = supplied || peopleClientsFor(request);
    const actor = await authorize(caller);
    if (request.method === "GET") {
      const result = await caller.rpc("people_admin_get_users"); check(result.error);
      return reply({ users: result.data, actor });
    }
    if (request.method !== "POST") return reply({ error: "INVALID_INPUT" }, 405);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new AdminError("FORBIDDEN", 403);
    if (Number(request.headers.get("content-length") || 0) > 50000) throw new AdminError("INVALID_INPUT");
    const raw = await request.text();
    if (raw.length > 50000) throw new AdminError("INVALID_INPUT");
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { throw new AdminError("INVALID_INPUT"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AdminError("INVALID_INPUT");
    if (body.action === "create") {
      const input = validatePeopleInput(body.input, true);
      const password = validatePassword(body.temporaryPassword, body.confirmTemporaryPassword);
      const admin = privileged();
      const operation = randomUUID();
      // The secret exists only in this request/Auth call. Provisioning stays banned until the profile is ready.
      const created = await admin.auth.admin.createUser({
        email: input.email as string, password, email_confirm: true, ban_duration: "876000h",
        app_metadata: { vp_people_created_by: actor, vp_people_request: operation, vp_temporary_password_nonce: randomUUID() },
        user_metadata: { full_name: input.full_name, staff_name: input.staff_name },
      });
      if (created.error || !created.data.user) {
        const duplicate = ["email_exists", "user_already_exists"].includes(created.error?.code || "");
        throw new AdminError(duplicate ? "DUPLICATE_EMAIL" : created.error?.code === "weak_password" ? "PASSWORD_WEAK" : "AUTH_UNCERTAIN", duplicate ? 409 : 502, operation);
      }
      const id = created.data.user.id;
      const { email: _email, ...profileInput } = input; void _email;
      let initialized = false;
      try {
        const result = await caller.rpc("people_admin_save_profile", {
          p_id: id, p_input: { ...profileInput, active: true }, p_expected: null, p_request_id: operation,
        });
        check(result.error); initialized = result.data?.must_change_password === true;
      } catch { /* Compensate only the identity returned by this createUser call. */ }
      if (!initialized) {
        let removed = false;
        try { removed = !(await admin.auth.admin.deleteUser(id)).error; } catch { /* Still banned; report reference. */ }
        throw new AdminError(removed ? "CREATE_FAILED" : "CREATE_RECOVERY_REQUIRED", 502, id);
      }
      await authorize(caller);
      const enabled = await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
      if (enabled.error) throw new AdminError("CREATE_RECOVERY_REQUIRED", 502, id);
      return reply({ id, must_change_password: true }, 201);
    }
    const id = body.id;
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new AdminError("INVALID_INPUT");
    if (body.action === "save") {
      const input = validatePeopleInput(body.input);
      if (!body.expected || typeof body.expected !== "object" || Array.isArray(body.expected)) throw new AdminError("INVALID_INPUT");
      const result = await caller.rpc("people_admin_save_profile", { p_id: id, p_input: input, p_expected: body.expected, p_request_id: null });
      check(result.error); return reply({ user: result.data });
    }
    if (body.action === "reset-password") {
      const password = validatePassword(body.temporaryPassword, body.confirmTemporaryPassword);
      const profile = await readProfile(caller, id);
      const admin = privileged();
      const target = await admin.auth.admin.getUserById(id);
      if (target.error || target.data.user?.id !== id || target.data.user.email?.toLowerCase() !== profile.email?.toLowerCase()) throw new AdminError("NOT_FOUND", 404);
      await authorize(caller);
      // Auth password and nonce commit together. 075 sets the profile flag in that
      // same transaction. No activation, role, classification or capability write.
      const reset = await admin.auth.admin.updateUserById(id, {
        password, app_metadata: { vp_temporary_password_nonce: randomUUID() },
      });
      if (reset.error) throw new AdminError(reset.error.code === "weak_password" ? "PASSWORD_WEAK" : "AUTH_UNCERTAIN", 502);
      return reply({ id, must_change_password: true });
    }
    if (body.action === "delete-check" || body.action === "delete") {
      if (id === actor) throw new AdminError("SELF_PROTECTION", 409);
      const result = await caller.rpc("people_admin_delete_check", { p_id: id }); check(result.error);
      if (body.action === "delete-check") return reply(result.data);
      if (!result.data?.deletable) throw new AdminError(result.data?.code || "USER_HISTORY_REQUIRED", 409);
      const profile = await readProfile(caller, id);
      if (body.confirmation !== profile.email || !profile.email) throw new AdminError("INVALID_INPUT");
      await authorize(caller);
      // Auth deletion runs the guarded profile cleanup in the SAME DB transaction.
      // FK/name/JSON references are rechecked while business tables are locked.
      const resultAuth = await privileged().auth.admin.deleteUser(id);
      if (resultAuth.error) throw new AdminError("USER_HISTORY_REQUIRED", 409);
      return reply({ deleted: true });
    }
    throw new AdminError("INVALID_INPUT");
  } catch (error) {
    const known = error instanceof AdminError ? error : new AdminError(error instanceof Error && PEOPLE_ERRORS[error.message] ? error.message : "OPERATION_FAILED", 400);
    return reply({ error: known.code, message: PEOPLE_ERRORS[known.code] || PEOPLE_ERRORS.OPERATION_FAILED, ...(known.reference ? { reference: known.reference } : {}) }, known.status);
  }
}
