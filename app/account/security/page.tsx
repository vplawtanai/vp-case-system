"use client";

import { useState } from "react";
import AppTopNav from "../../components/AppTopNav";
import AuthGuard from "../../components/AuthGuard";
import { supabase } from "../../../lib/supabase";

export default function AccountSecurityPage() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");

  const updatePassword = async () => {
    setErrorText("");
    setSuccessText("");

    const password = newPassword.trim();
    const confirmation = confirmPassword.trim();

    if (!password) {
      setErrorText("New password is required.");
      return;
    }

    if (password.length < 8) {
      setErrorText("New password must be at least 8 characters.");
      return;
    }

    if (password !== confirmation) {
      setErrorText("Confirm password does not match.");
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setErrorText(error.message || "Unable to update password.");
        return;
      }

      setNewPassword("");
      setConfirmPassword("");
      setSuccessText("Password updated successfully.");
    } catch {
      setErrorText("Unable to update password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthGuard>
      <main style={pageStyle}>
        <AppTopNav
          title="Account Security"
          subtitle="Change the password for your current account."
          activePage="account"
        />

        <section style={panelStyle}>
          <div style={formGridStyle}>
            <label style={labelStyle}>
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                style={inputStyle}
                autoComplete="new-password"
              />
            </label>

            <label style={labelStyle}>
              Confirm new password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                style={inputStyle}
                autoComplete="new-password"
              />
            </label>

            {errorText ? <div style={errorBoxStyle}>{errorText}</div> : null}
            {successText ? (
              <div style={successBoxStyle}>{successText}</div>
            ) : null}

            <button
              type="button"
              onClick={updatePassword}
              disabled={saving}
              style={{
                ...primaryButtonStyle,
                opacity: saving ? 0.65 : 1,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Updating..." : "Update Password"}
            </button>
          </div>
        </section>
      </main>
    </AuthGuard>
  );
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
