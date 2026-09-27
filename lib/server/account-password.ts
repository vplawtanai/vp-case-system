import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { peopleClientsFor } from "./people-admin";
import { validatePassword } from "../password-onboarding";

type Dependencies = {
  caller: SupabaseClient; privileged: () => SupabaseClient; signingKey: string;
  updatePassword: (password: string) => Promise<{ ok: boolean; code?: string }>;
};
function dependencies(request: Request): Dependencies {
  const clients = peopleClientsFor(request);
  const signingKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!signingKey) throw new Error("PASSWORD_UPDATE_FAILED");
  return { ...clients, signingKey, updatePassword: async password => {
    // Same Auth PUT /user operation used by installed GoTrueClient.updateUser.
    // Use the caller's JWT, NOT an Admin password write, so Auth's own password
    // policy / recent-session requirements remain authoritative.
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, {
      method: "PUT", cache: "no-store", headers: { "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: request.headers.get("authorization")! },
      body: JSON.stringify({ password }),
    });
    const body = await response.json();
    return { ok: response.ok, code: body?.error_code ?? body?.code }; // Never forward Auth error bodies.
  } };
}
function signature(payload: string, key: string) { return createHmac("sha256", key).update(`vp-password-completion-v1:${payload}`).digest("hex"); }
function ticket(id: string, nonce: unknown, key: string) {
  const payload = Buffer.from(JSON.stringify({ id, nonce: nonce ?? null, expires: Date.now() + 300_000 })).toString("base64url");
  return `${payload}.${signature(payload, key)}`;
}
function verifyTicket(value: unknown, id: string, key: string): { nonce: string | null } {
  if (typeof value !== "string" || value.length > 1500) throw new Error("PASSWORD_UPDATE_FAILED");
  const [payload, mac, extra] = value.split(".");
  if (extra || !/^[a-f0-9]{64}$/.test(mac || "") || !timingSafeEqual(Buffer.from(mac), Buffer.from(signature(payload, key)))) throw new Error("PASSWORD_UPDATE_FAILED");
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (parsed.id !== id || parsed.expires < Date.now() || !(parsed.nonce === null || typeof parsed.nonce === "string")) throw new Error("PASSWORD_UPDATE_FAILED");
  return parsed;
}
export async function handlePasswordRequest(request: Request, supplied?: Dependencies) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  try {
    if (request.method !== "POST") return reply({ error: "PASSWORD_UPDATE_FAILED" }, 405);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return reply({ error: "FORBIDDEN" }, 403);
    const { caller, privileged, signingKey, updatePassword } = supplied || dependencies(request);
    const auth = await caller.auth.getUser();
    if (auth.error || !auth.data.user) return reply({ error: "UNAUTHORIZED" }, 401);
    const user = auth.data.user;
    const profile = await caller.from("user_profiles").select("active, must_change_password").eq("id", user.id).single();
    if (profile.error || profile.data?.active !== true || typeof profile.data.must_change_password !== "boolean") return reply({ error: "FORBIDDEN" }, 403);
    if (Number(request.headers.get("content-length") || 0) > 16000) throw new Error("PASSWORD_UPDATE_FAILED");
    const raw = await request.text();
    if (raw.length > 16000) throw new Error("PASSWORD_UPDATE_FAILED");
    const body = JSON.parse(raw);
    let completionTicket: string;
    if (body.action === "complete") {
      completionTicket = body.ticket;
    } else if (body.action === "change") {
      const password = validatePassword(body.password, body.confirmation);
      const nonce = user.app_metadata?.vp_temporary_password_nonce ?? null;
      const result = await updatePassword(password);
      if (!result.ok) return reply({ error: result.code === "weak_password" ? "PASSWORD_WEAK" : "PASSWORD_UPDATE_FAILED" }, 400);
      completionTicket = ticket(user.id, nonce, signingKey);
    } else throw new Error("PASSWORD_UPDATE_FAILED");
    const proof = verifyTicket(completionTicket, user.id, signingKey);
    // No browser-callable clear flag RPC. The signed, short-lived receipt permits
    // retry after an Auth success + RPC/network failure without re-entering a secret.
    try {
      const result = await privileged().rpc("people075_complete_password_change", { p_id: user.id, p_nonce: proof.nonce });
      if (result.error || result.data !== true) {
        if (result.error?.message?.includes("PASSWORD_RESET_CHANGED")) return reply({ error: "PASSWORD_RESET_CHANGED" }, 409);
        throw new Error("PASSWORD_COMPLETION_FAILED");
      }
    } catch { return reply({ error: "PASSWORD_COMPLETION_FAILED", ticket: completionTicket }, 503); }
    return reply({ changed: true });
  } catch (error) {
    const code = error instanceof Error && ["PASSWORD_REQUIRED", "PASSWORD_MISMATCH", "PASSWORD_WEAK"].includes(error.message) ? error.message : "PASSWORD_UPDATE_FAILED";
    return reply({ error: code }, 400);
  }
}
