"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type AppTopNavProps = {
  title: string;
  subtitle?: string;
  activePage: "dashboard" | "alerts" | "cases";
};

export default function AppTopNav({
  title,
  subtitle,
  activePage,
}: AppTopNavProps) {
  const router = useRouter();

  const getLinkStyle = (
    page: "dashboard" | "alerts" | "cases"
  ): React.CSSProperties => {
    const isActive = activePage === page;

    if (isActive) {
      return primaryLinkButtonStyle;
    }

    return linkButtonStyle;
  };

  const handleLogout = async () => {
    const confirmed = window.confirm("ต้องการออกจากระบบหรือไม่?");
    if (!confirmed) return;

    await supabase.auth.signOut();

    router.replace("/login");
    router.refresh();
  };

  return (
    <div style={topBarStyle}>
      <div>
        <h1 style={titleStyle}>{title}</h1>
        {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
      </div>

      <div style={navGroupStyle}>
        <Link href="/dashboard" style={getLinkStyle("dashboard")}>
          Dashboard
        </Link>

        <Link href="/alerts" style={getLinkStyle("alerts")}>
          Alerts
        </Link>

        <Link href="/cases" style={getLinkStyle("cases")}>
          Cases
        </Link>

        <button type="button" onClick={handleLogout} style={logoutButtonStyle}>
          Logout
        </button>
      </div>
    </div>
  );
}

const topBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 20,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  margin: "8px 0 0 0",
  color: "#555",
};

const navGroupStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const linkButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #ccc",
  color: "#111",
  textDecoration: "none",
  background: "#fff",
  fontWeight: 700,
};

const primaryLinkButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid black",
  color: "white",
  textDecoration: "none",
  background: "black",
  fontWeight: 800,
};

const logoutButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #d0d5dd",
  color: "#a40000",
  background: "#fff5f5",
  cursor: "pointer",
  fontWeight: 800,
};