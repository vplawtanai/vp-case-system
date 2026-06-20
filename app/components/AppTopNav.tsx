"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
    | "finance"
    | "workload"
    | "officeWork"
    | "workloadSummary"
    | "account"
    | "users";
};

type UserProfile = {
  role?: UserRole | string | null;
  financial_access?: boolean | null;
  can_submit_expense_claim?: boolean | null;
  can_view_own_expense_claims?: boolean | null;
  can_view_all_expense_claims?: boolean | null;
  can_view_company_ledger?: boolean | null;
  can_view_lawyer_compensation?: boolean | null;
  can_submit_office_work_log?: boolean | null;
  can_view_own_office_work_logs?: boolean | null;
  can_view_all_office_work_logs?: boolean | null;
};

export default function AppTopNav({
  title,
  subtitle,
  activePage,
}: AppTopNavProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [profile, setProfile] = useState<UserProfile>({
    role: "",
    financial_access: false,
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const permissions: UserPermissions = useMemo(() => {
    return buildPermissions(profile);
  }, [profile]);
  const financeHref = permissions.canViewCompanyLedger
    ? "/finance/ledger"
    : permissions.canUseExpenseClaims
      ? "/finance/expense-claims"
      : "/finance/compensation";

  const navGroups = useMemo(
    () => [
      {
        title: "Command",
        items: [
          { page: "dashboard" as const, label: "Dashboard", shortLabel: "DB", href: "/dashboard", visible: permissions.canViewDashboard },
          { page: "calendar" as const, label: "Calendar", shortLabel: "Cal", href: "/calendar", visible: permissions.canViewDashboard },
          { page: "cases" as const, label: "Cases", shortLabel: "Case", href: "/cases", visible: permissions.canViewCases },
          { page: "advisory" as const, label: "Advisory", shortLabel: "Adv", href: "/advisory", visible: permissions.canViewDashboard },
        ],
      },
      {
        title: "Operations",
        items: [
          { page: "workload" as const, label: "Workload", shortLabel: "Work", href: "/reports/daily-workload", visible: permissions.canViewDashboard },
          { page: "officeWork" as const, label: "Office Work", shortLabel: "Off", href: "/workload/office-work", visible: permissions.canAccessOfficeWorkLogs },
        ],
      },
      {
        title: "Finance",
        items: [
          { page: "finance" as const, label: "Finance", shortLabel: "Fin", href: financeHref, visible: permissions.canViewFinanceModule },
        ],
      },
      {
        title: "Management",
        items: [
          { page: "workloadSummary" as const, label: "Summary", shortLabel: "Sum", href: "/reports/workload-summary", visible: permissions.canViewDashboard },
          { page: "clients" as const, label: "Clients", shortLabel: "Cli", href: "/clients", visible: permissions.canViewDashboard },
          { page: "users" as const, label: "Users", shortLabel: "User", href: "/admin/users", visible: permissions.canManageUsers },
        ],
      },
      {
        title: "Account",
        items: [
          { page: "account" as const, label: "Account", shortLabel: "Acct", href: "/account/security", visible: true },
        ],
      },
    ],
    [financeHref, permissions]
  );

  useEffect(() => {
    const updateViewport = () => {
      setIsMobile(window.innerWidth < 760);
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (isMobile) {
      document.body.style.paddingLeft = "";
      return;
    }

    document.body.style.paddingLeft = sidebarCollapsed ? "88px" : "256px";
    return () => {
      document.body.style.paddingLeft = "";
    };
  }, [isMobile, sidebarCollapsed]);

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
        .select("role, financial_access, can_submit_expense_claim, can_view_own_expense_claims, can_view_all_expense_claims, can_view_company_ledger, can_view_lawyer_compensation, can_submit_office_work_log, can_view_own_office_work_logs, can_view_all_office_work_logs")
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
        can_submit_expense_claim: data.can_submit_expense_claim === true,
        can_view_own_expense_claims: data.can_view_own_expense_claims === true,
        can_view_all_expense_claims: data.can_view_all_expense_claims === true,
        can_view_company_ledger: data.can_view_company_ledger === true,
        can_view_lawyer_compensation: data.can_view_lawyer_compensation === true,
        can_submit_office_work_log: data.can_submit_office_work_log === true,
        can_view_own_office_work_logs: data.can_view_own_office_work_logs === true,
        can_view_all_office_work_logs: data.can_view_all_office_work_logs === true,
      });
    };

    loadCurrentUserProfile();
  }, []);

  const isActivePage = (
    page:
      | "dashboard"
      | "calendar"
      | "cases"
      | "clients"
      | "advisory"
      | "finance"
      | "workload"
      | "officeWork"
      | "workloadSummary"
      | "account"
      | "users"
  ) => {
    if (page === "cases") return pathname.startsWith("/cases");
    if (page === "advisory") return pathname.startsWith("/advisory");
    if (page === "finance") return pathname.startsWith("/finance");
    if (page === "calendar") return pathname === "/calendar";
    if (page === "dashboard") return pathname === "/dashboard";
    if (page === "workload") return pathname === "/reports/daily-workload";
    if (page === "officeWork") return pathname === "/workload/office-work";
    if (page === "workloadSummary") return pathname === "/reports/workload-summary";
    if (page === "clients") return pathname === "/clients";
    if (page === "users") return pathname === "/admin/users";
    if (page === "account") return pathname.startsWith("/account");
    return activePage === page;
  };

  const getLinkStyle = (page: Parameters<typeof isActivePage>[0]): React.CSSProperties => {
    return isActivePage(page) ? primaryLinkButtonStyle : linkButtonStyle;
  };

  const handleLogout = async () => {
    const confirmed = window.confirm("ต้องการออกจากระบบหรือไม่?");
    if (!confirmed) return;

    await supabase.auth.signOut();

    router.replace("/login");
    router.refresh();
  };

  const renderNavigation = (collapsed: boolean, isDrawer = false) => (
    <>
      <div style={brandStyle}>
        <div style={brandMarkStyle}>VP</div>
        {!collapsed && (
          <div>
            <div style={brandTitleStyle}>VP Case System</div>
            <div style={brandSubtitleStyle}>Office OS</div>
          </div>
        )}
      </div>

      {!isDrawer && (
        <button
          type="button"
          onClick={() => setSidebarCollapsed((value) => !value)}
          style={collapseButtonStyle}
        >
          {collapsed ? ">" : "<"}
        </button>
      )}

      <nav style={sidebarNavStyle}>
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => item.visible);
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.title} style={navGroupBlockStyle}>
              {!collapsed && <div style={groupHeadingStyle}>{group.title}</div>}
              {visibleItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setDrawerOpen(false)}
                  style={getLinkStyle(item.page)}
                  title={item.label}
                >
                  <span style={navShortLabelStyle}>{item.shortLabel}</span>
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>

      <button type="button" onClick={handleLogout} style={logoutButtonStyle}>
        <span style={navShortLabelStyle}>Out</span>
        {!collapsed && <span>Logout</span>}
      </button>
    </>
  );

  return (
    <>
      {!isMobile && (
        <aside style={sidebarCollapsed ? collapsedSidebarStyle : sidebarStyle}>
          {renderNavigation(sidebarCollapsed)}
        </aside>
      )}

      {isMobile && (
        <div style={mobileTopBarStyle}>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            style={mobileMenuButtonStyle}
          >
            Menu
          </button>
          <div style={mobileTitleStyle}>{title}</div>
        </div>
      )}

      {isMobile && drawerOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            style={drawerOverlayStyle}
          />
          <aside style={drawerStyle}>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              style={drawerCloseButtonStyle}
            >
              Close
            </button>
            {renderNavigation(false, true)}
          </aside>
        </>
      )}

      <div style={pageHeaderStyle}>
        <h1 style={titleStyle}>{title}</h1>
        {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
      </div>
    </>
  );
}

/* =========================================================
   STYLES
========================================================= */

const pageHeaderStyle: React.CSSProperties = {
  marginBottom: 20,
  paddingTop: 4,
};

const sidebarStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  bottom: 0,
  width: 240,
  zIndex: 80,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 16,
  background: "#ffffff",
  borderRight: "1px solid #e5e7eb",
  boxShadow: "2px 0 16px rgba(15, 23, 42, 0.06)",
  overflowY: "auto",
};

const collapsedSidebarStyle: React.CSSProperties = {
  ...sidebarStyle,
  width: 72,
  padding: 12,
  alignItems: "center",
};

const brandStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minHeight: 42,
};

const brandMarkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 38,
  height: 38,
  borderRadius: 10,
  background: "#0f2743",
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 950,
};

const brandTitleStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 14,
  fontWeight: 950,
  lineHeight: 1.2,
};

const brandSubtitleStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 11,
  fontWeight: 800,
  marginTop: 2,
};

const collapseButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 9px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#f8fafc",
  color: "#334155",
  cursor: "pointer",
  fontWeight: 900,
};

const sidebarNavStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
  flex: 1,
};

const navGroupBlockStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const groupHeadingStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 10,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  padding: "2px 4px",
};

const navShortLabelStyle: React.CSSProperties = {
  display: "inline-flex",
  minWidth: 34,
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 950,
};

const mobileTopBarStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 70,
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 14,
  padding: "10px 0",
  background: "#f8fafc",
};

const mobileMenuButtonStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid #0f2743",
  background: "#0f2743",
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: 900,
};

const mobileTitleStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 15,
  fontWeight: 950,
};

const drawerOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  border: "none",
  background: "rgba(15, 23, 42, 0.38)",
  cursor: "pointer",
};

const drawerStyle: React.CSSProperties = {
  ...sidebarStyle,
  width: 260,
  zIndex: 110,
};

const drawerCloseButtonStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#ffffff",
  color: "#334155",
  cursor: "pointer",
  fontWeight: 900,
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

const linkButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 11px",
  borderRadius: 8,
  border: "1px solid transparent",
  color: "#334155",
  textDecoration: "none",
  background: "transparent",
  fontWeight: 850,
  whiteSpace: "nowrap",
};

const primaryLinkButtonStyle: React.CSSProperties = {
  ...linkButtonStyle,
  borderRadius: 8,
  border: "1px solid #0f2743",
  color: "#ffffff",
  background: "#0f2743",
  fontWeight: 950,
  boxShadow: "0 6px 14px rgba(15, 39, 67, 0.16)",
};

const logoutButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "10px 11px",
  borderRadius: 8,
  border: "1px solid #f0c4c4",
  color: "#a40000",
  background: "#fff5f5",
  cursor: "pointer",
  fontWeight: 800,
  whiteSpace: "nowrap",
};
