"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  const handleLogin = async () => {
    setErrorText("");

    if (!email.trim()) {
      setErrorText("กรุณากรอกอีเมล");
      return;
    }

    if (!password.trim()) {
      setErrorText("กรุณากรอกรหัสผ่าน");
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorText(error.message || "เข้าสู่ระบบไม่สำเร็จ");
        return;
      }

      if (!data.user) {
        setErrorText("ไม่พบข้อมูลผู้ใช้งาน");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("id, email, full_name, role, active")
        .eq("id", data.user.id)
        .single();

      if (profileError) {
        await supabase.auth.signOut();
        setErrorText(
          "เข้าสู่ระบบได้ แต่ยังไม่พบสิทธิ์ผู้ใช้งานใน user_profiles"
        );
        return;
      }

      if (!profile?.active) {
        await supabase.auth.signOut();
        setErrorText("บัญชีนี้ถูกปิดใช้งาน");
        return;
      }

      router.push("/cases");
      router.refresh();
    } catch (err) {
      setErrorText("เกิดข้อผิดพลาดระหว่างเข้าสู่ระบบ");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      handleLogin();
    }
  };

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <div style={brandBoxStyle}>
          <div style={brandMarkStyle}>VP</div>
          <div>
            <h1 style={titleStyle}>VP Case System</h1>
            <p style={subtitleStyle}>เข้าสู่ระบบจัดการแฟ้มคดี</p>
          </div>
        </div>

        <div style={formStyle}>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="your-email@example.com"
              style={inputStyle}
              autoComplete="email"
            />
          </div>

          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="กรอกรหัสผ่าน"
              style={inputStyle}
              autoComplete="current-password"
            />
          </div>

          {errorText && <div style={errorBoxStyle}>{errorText}</div>}

          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            style={{
              ...primaryButtonStyle,
              opacity: loading ? 0.65 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Signing in..." : "Login"}
          </button>
        </div>

        <div style={footerTextStyle}>
          ใช้บัญชีที่สร้างไว้ใน Supabase Authentication เท่านั้น
        </div>
      </div>
    </main>
  );
}

/* =========================================================
   STYLES
========================================================= */

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background:
    "linear-gradient(135deg, #f8fafc 0%, #eef2f7 45%, #f7f3ea 100%)",
  color: "#111111",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 430,
  border: "1px solid #dddddd",
  borderRadius: 18,
  padding: 26,
  background: "#ffffff",
  boxShadow: "0 18px 45px rgba(0,0,0,0.08)",
};

const brandBoxStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  marginBottom: 24,
};

const brandMarkStyle: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 14,
  background: "#000000",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
  fontSize: 18,
  letterSpacing: 1,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 900,
  color: "#111111",
};

const subtitleStyle: React.CSSProperties = {
  margin: "4px 0 0 0",
  fontSize: 14,
  color: "#666666",
  fontWeight: 600,
};

const formStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 5,
  color: "#222222",
  fontWeight: 800,
  fontSize: 13,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 13px",
  borderRadius: 10,
  border: "1px solid #cfcfcf",
  background: "#ffffff",
  color: "#111111",
  fontSize: 15,
  boxSizing: "border-box",
  colorScheme: "light",
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 10,
  border: "none",
  background: "#000000",
  color: "#ffffff",
  fontWeight: 900,
  fontSize: 15,
};

const errorBoxStyle: React.CSSProperties = {
  padding: 11,
  borderRadius: 10,
  border: "1px solid #f0b4b4",
  background: "#fff5f5",
  color: "#a40000",
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.5,
};

const footerTextStyle: React.CSSProperties = {
  marginTop: 18,
  paddingTop: 14,
  borderTop: "1px solid #eeeeee",
  fontSize: 12,
  color: "#777777",
  lineHeight: 1.5,
};