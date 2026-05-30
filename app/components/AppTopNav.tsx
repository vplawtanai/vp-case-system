"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { buildPermissions } from "../../lib/permissions";
import type { UserPermissions, UserRole } from "../../lib/permissions";

type AppTopNavProps = {
  title: string;
  subtitle?: string;
  activePage:
    | "dashboard"
    | "calendar"
    | "alerts"
    | "cases"
    | "clients"
    | "advisory"
    | "workload"
    | "workloadSummary"
    | "account"
    | "users";
};

type UserProfile = {
  role?: UserRole | string | null;
  financial_access?: boolean | null;
};

export default function AppTopNav({
  title,
  subtitle,
  activePage,
}: AppTopNavProps) {
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile>({
    role: "",
    financial_access: false,
  });

  const permissions: UserPermissions = useMemo(() => {
    return buildPermissions(profile);
  }, [profile]);

  useEffect(() => {
    const loadCurrentUserProfile = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        setProfile({
          role: "",
          financial_access: false,
        });
        return;
      }

      const { data, error } = await supabase
        .from("user_profiles")
        .select("role, financial_access")
        .eq("id", userData.user.id)
        .single();

      if (error || !data) {
        setProfile({
          role: "",
          financial_access: false,
        });
        return;
      }

      setProfile({
        role: data.role || "",
        financial_access: data.financial_access === true,
      });
    };

    loadCurrentUserProfile();
  }, []);

  const getLinkStyle = (
    page:
      | "dashboard"
      | "calendar"
      | "cases"
      | "clients"
      | "advisory"
      | "workload"
      | "workloadSummary"
      | "account"
      | "users"
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
        {permissions.canViewDashboard && (
          <Link href="/dashboard" style={getLinkStyle("dashboard")}>
            Dashboard
          </Link>
        )}

        {permissions.canViewDashboard && (
          <Link href="/calendar" style={getLinkStyle("calendar")}>
            Calendar
          </Link>
        )}

        {permissions.canViewCases && (
          <Link href="/cases" style={getLinkStyle("cases")}>
            Cases
          </Link>
        )}

        {permissions.canViewDashboard && (
          <Link href="/advisory" style={getLinkStyle("advisory")}>
            Advisory
          </Link>
        )}

        {permissions.canViewDashboard && (
          <Link href="/reports/daily-workload" style={getLinkStyle("workload")}>
            Workload
          </Link>
        )}

        {permissions.canViewDashboard && (
          <Link href="/reports/workload-summary" style={getLinkStyle("workloadSummary")}>
            Summary
          </Link>
        )}

        {permissions.canViewDashboard && (
          <Link href="/clients" style={getLinkStyle("clients")}>
            Clients
          </Link>
        )}

        {permissions.canManageUsers && (
          <Link href="/admin/users" style={getLinkStyle("users")}>
            Users
          </Link>
        )}

        <Link href="/account/security" style={getLinkStyle("account")}>
          Account
        </Link>

        <button type="button" onClick={handleLogout} style={logoutButtonStyle}>
          Logout
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   STYLES
========================================================= */

const topBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 20,
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  color: "#111111",
  fontSize: 18,
  fontWeight: 800,
};

const subtitleStyle: React.CSSProperties = {
  margin: "8px 0 0 0",
  color: "#555555",
  fontSize: 14,
  fontWeight: 500,
};

const navGroupStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const linkButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #cccccc",
  color: "#111111",
  textDecoration: "none",
  background: "#ffffff",
  fontWeight: 700,
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};

const primaryLinkButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #000000",
  color: "#ffffff",
  textDecoration: "none",
  background: "#000000",
  fontWeight: 800,
  boxShadow: "0 1px 4px rgba(0,0,0,0.10)",
};

const logoutButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #f0c4c4",
  color: "#a40000",
  background: "#fff5f5",
  cursor: "pointer",
  fontWeight: 800,
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};
