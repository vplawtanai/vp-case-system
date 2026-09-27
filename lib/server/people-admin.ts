import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { isActiveAdmin, validatePeopleInput, PEOPLE_ERRORS, type PeopleProfile } from "../people";

type Clients = { caller: SupabaseClient; privileged: () => SupabaseClient; redirectTo: string };
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
function clientsFor(request: Request): Clients {
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
    // Fixed trusted destination: never use a browser-supplied redirect/Host header.
    redirectTo: "https://vp-case-system.vercel.app/account/security",
  };
}
async function authorize(caller: SupabaseClient) {
  const { data, error } = await caller.auth.getUser();
  if (error || !data.user) throw new AdminError("UNAUTHORIZED", 401);
  const profile = await caller.from("user_profiles").select("id, role, active").eq("id", data.user.id).single();
  if (profile.error || !isActiveAdmin(profile.data)) throw new AdminError("FORBIDDEN", 403);
  return data.user.id;
}
async function readProfile(caller: SupabaseClient, id: string): Promise<PeopleProfile> {
  const result = await caller.rpc("people_admin_get_users");
  check(result.error);
  const profile = (result.data as PeopleProfile[]).find(user => user.id === id);
  if (!profile) throw new AdminError("NOT_FOUND", 404);
  return profile;
}
async function invite(caller: SupabaseClient, admin: SupabaseClient, id: string, redirectTo: string) {
  await authorize(caller); // Recheck immediately before privileged Auth action.
  const profile = await readProfile(caller, id);
  if (!profile.active) throw new AdminError("FORBIDDEN", 403);
  const auth = await admin.auth.admin.getUserById(id);
  if (auth.error || !auth.data.user || auth.data.user.email?.toLowerCase() !== profile.email?.toLowerCase()) throw new AdminError("OPERATION_FAILED", 409);
  if (auth.data.user.email_confirmed_at) throw new AdminError("ALREADY_CONFIRMED", 409);
  // Retry also completes an interrupted onboarding unban, without changing profile data.
  const enabled = await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
  if (enabled.error) throw new AdminError("ONBOARDING_FAILED", 502);
  const sent = await admin.auth.admin.inviteUserByEmail(auth.data.user.email!, { redirectTo });
  if (sent.error || sent.data.user?.id !== id) throw new AdminError("ONBOARDING_FAILED", 502);
}

// Injectable clients are for isolated tests only; the route never accepts this from a request.
export async function handlePeopleRequest(request: Request, supplied?: Clients) {
  try {
    const { caller, privileged, redirectTo } = supplied || clientsFor(request);
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
      const admin = privileged();
      const operation = randomUUID();
      // No password is generated, stored or exposed. A failed/interrupted setup stays banned.
      const created = await admin.auth.admin.createUser({
        email: input.email as string, email_confirm: false, ban_duration: "876000h",
        app_metadata: { vp_people_created_by: actor, vp_people_request: operation },
        user_metadata: { full_name: input.full_name, staff_name: input.staff_name },
      });
      if (created.error || !created.data.user) {
        const duplicate = ["email_exists", "user_already_exists"].includes(created.error?.code || "");
        throw new AdminError(duplicate ? "DUPLICATE_EMAIL" : "AUTH_UNCERTAIN", duplicate ? 409 : 502, operation);
      }
      const id = created.data.user.id;
      const { email: _email, ...profileInput } = input; void _email;
      let initialized = false;
      try {
        const result = await caller.rpc("people_admin_save_profile", {
          p_id: id, p_input: { ...profileInput, active: true }, p_expected: null, p_request_id: operation,
        });
        check(result.error); initialized = !!result.data;
      } catch { /* Compensate only the identity returned by this createUser call. */ }
      if (!initialized) {
        let removed = false;
        try { removed = !(await admin.auth.admin.deleteUser(id)).error; } catch { /* Still banned; report reference. */ }
        throw new AdminError(removed ? "CREATE_FAILED" : "CREATE_RECOVERY_REQUIRED", 502, id);
      }
      try { await invite(caller, admin, id, redirectTo); }
      catch { return reply({ id, warning: "ONBOARDING_FAILED", message: PEOPLE_ERRORS.ONBOARDING_FAILED }, 201); }
      return reply({ id, invitation_sent: true }, 201);
    }
    const id = body.id;
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new AdminError("INVALID_INPUT");
    if (body.action === "save") {
      const input = validatePeopleInput(body.input);
      if (!body.expected || typeof body.expected !== "object" || Array.isArray(body.expected)) throw new AdminError("INVALID_INPUT");
      const result = await caller.rpc("people_admin_save_profile", { p_id: id, p_input: input, p_expected: body.expected, p_request_id: null });
      check(result.error); return reply({ user: result.data });
    }
    if (body.action === "invite") {
      await invite(caller, privileged(), id, redirectTo); return reply({ invitation_sent: true });
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
