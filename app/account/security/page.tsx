"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppTopNav from "../../components/AppTopNav";
import AuthGuard from "../../components/AuthGuard";
import LanguageSelector from "../../components/LanguageSelector";
import { supabase } from "../../../lib/supabase";
import { BilingualUiScope, useI18n } from "../../../lib/i18n/provider";
import { PASSWORD_MESSAGES, PASSWORD_MIN_LENGTH, passwordText, validatePassword, type PasswordMessage } from "../../../lib/password-onboarding";

export default function AccountSecurityPage() {
  return <AuthGuard><BilingualUiScope><PasswordForm /></BilingualUiScope></AuthGuard>;
}
export function PasswordForm() {
  const { locale } = useI18n();
  const router = useRouter();
  const [forced, setForced] = useState<boolean | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [completionTicket, setCompletionTicket] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<PasswordMessage | "">("");
  const [success, setSuccess] = useState(false);
  const text = (key: PasswordMessage) => passwordText(key, locale);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const auth = await supabase.auth.getUser();
      if (!auth.data.user) return;
      const result = await supabase.from("user_profiles").select("must_change_password").eq("id", auth.data.user.id).single();
      if (!cancelled) {
        if (result.error || typeof result.data?.must_change_password !== "boolean") setErrorText("PASSWORD_UPDATE_FAILED");
        else setForced(result.data.must_change_password);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const updatePassword = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving) return;
    setErrorText(""); setSuccess(false);
    try {
      if (!completionTicket) validatePassword(newPassword, confirmPassword);
      setSaving(true);
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("PASSWORD_UPDATE_FAILED");
      const response = await fetch("/api/account/password", {
        method: "POST", cache: "no-store", headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(completionTicket ? { action: "complete", ticket: completionTicket } : { action: "change", password: newPassword, confirmation: confirmPassword }),
      });
      const result = await response.json();
      // Drop entered secrets on every completed request, including rejected Auth updates.
      setNewPassword(""); setConfirmPassword("");
      if (result.ticket) setCompletionTicket(result.ticket);
      else if (!response.ok) setCompletionTicket("");
      if (!response.ok || !result.changed) throw new Error(result.error || "PASSWORD_UPDATE_FAILED");
      setCompletionTicket(""); setForced(false); setSuccess(true);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setErrorText(Object.hasOwn(PASSWORD_MESSAGES, code) ? code as PasswordMessage : "PASSWORD_UPDATE_FAILED");
    } finally { setSaving(false); }
  };
  const logout = async () => { await supabase.auth.signOut(); router.replace("/login"); };
  return <main style={pageStyle}>
    {forced !== false ? <header style={{ maxWidth: 560, marginBottom: 18 }}><LanguageSelector /><h1>{text("title")}</h1><p>{text("instruction")}</p></header>
      : <AppTopNav title={text("ordinaryTitle")} subtitle={text("ordinaryHint")} activePage="account" />}
    <section style={panelStyle}>
      <form style={formGridStyle} onSubmit={updatePassword}>
        {!completionTicket && <>
          <label style={labelStyle}>{text("newPassword")}<input type="password" required minLength={PASSWORD_MIN_LENGTH} value={newPassword} onChange={e => setNewPassword(e.target.value)} style={inputStyle} autoComplete="new-password" /></label>
          <label style={labelStyle}>{text("confirmNew")}<input type="password" required minLength={PASSWORD_MIN_LENGTH} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={inputStyle} autoComplete="new-password" /></label>
          <p>{text("minimum")}</p>
        </>}
        {errorText && <div role="alert" style={errorBoxStyle}>{text(errorText)}</div>}
        {success && <div role="status" style={successBoxStyle}>{text("saved")}</div>}
        <button type="submit" disabled={saving || forced === null} style={primaryButtonStyle}>{text(saving ? "saving" : completionTicket ? "retry" : "save")}</button>
        {success && <button type="button" onClick={() => router.push("/cases")}>{text("continue")}</button>}
        <button type="button" onClick={() => void logout()} disabled={saving}>{text("logout")}</button>
      </form>
    </section>
  </main>;
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  padding: 24,
  background: "#f8fafc",
  color: "#111111",
};

const panelStyle: React.CSSProperties = {
  maxWidth: 560,
  border: "1px solid #dddddd",
  borderRadius: 12,
  background: "#ffffff",
  padding: 18,
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
};

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #cccccc",
  borderRadius: 8,
  background: "#ffffff",
  color: "#111111",
  boxSizing: "border-box",
  colorScheme: "light",
};

const primaryButtonStyle: React.CSSProperties = {
  justifySelf: "start",
  padding: "10px 14px",
  border: "1px solid #000000",
  borderRadius: 8,
  background: "#000000",
  color: "#ffffff",
  fontWeight: 800,
};

const errorBoxStyle: React.CSSProperties = {
  padding: 12,
  border: "1px solid #f0c4c4",
  borderRadius: 8,
  background: "#fff5f5",
  color: "#a40000",
  fontWeight: 700,
};

const successBoxStyle: React.CSSProperties = {
  padding: 12,
  border: "1px solid #b9dfc3",
  borderRadius: 8,
  background: "#f0fff4",
  color: "#067647",
  fontWeight: 700,
};
