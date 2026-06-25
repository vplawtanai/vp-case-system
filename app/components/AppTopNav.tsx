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

type NavIconName =
  | "dashboard"
  | "calendar"
  | "cases"
  | "advisory"
  | "workload"
  | "office"
  | "finance"
  | "summary"
  | "clients"
  | "users"
  | "account"
  | "logout";

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
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
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
          { page: "dashboard" as const, label: "Dashboard", icon: "dashboard" as const, href: "/dashboard", visible: permissions.canViewDashboard },
          { page: "calendar" as const, label: "Calendar", icon: "calendar" as const, href: "/calendar", visible: permissions.canViewDashboard },
          { page: "cases" as const, label: "Cases", icon: "cases" as const, href: "/cases", visible: permissions.canViewCases },
          { page: "advisory" as const, label: "Advisory", icon: "advisory" as const, href: "/advisory", visible: permissions.canViewDashboard },
        ],
      },
      {
        title: "Operations",
        items: [
          { page: "workload" as const, label: "Workload", icon: "workload" as const, href: "/reports/daily-workload", visible: permissions.canViewDashboard },
          { page: "officeWork" as const, label: "Office Work", icon: "office" as const, href: "/workload/office-work", visible: permissions.canAccessOfficeWorkLogs },
          { page: "workloadSummary" as const, label: "Summary", icon: "summary" as const, href: "/reports/workload-summary", visible: permissions.canViewDashboard },
        ],
      },
      {
        title: "Finance",
        items: [
          { page: "finance" as const, label: "Finance", icon: "finance" as const, href: financeHref, visible: permissions.canViewFinanceModule },
        ],
      },
      {
        title: "Management",
        items: [
          { page: "clients" as const, label: "Clients", icon: "clients" as const, href: "/clients", visible: permissions.canViewDashboard },
          { page: "users" as const, label: "Users", icon: "users" as const, href: "/admin/users", visible: permissions.canManageUsers },
        ],
      },
      {
        title: "Account",
        items: [
          { page: "account" as const, label: "Account", icon: "account" as const, href: "/account/security", visible: true },
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

    document.body.style.paddingLeft = "88px";
    return () => {
      document.body.style.paddingLeft = "";
    };
  }, [isMobile]);

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

  const getLinkStyle = (page: Parameters<typeof isActivePage>[0], collapsed: boolean): React.CSSProperties => {
    if (collapsed) {
      return isActivePage(page) ? compactPrimaryLinkButtonStyle : compactLinkButtonStyle;
    }

    return isActivePage(page) ? primaryLinkButtonStyle : linkButtonStyle;
  };

  const handleLogout = async () => {
    const confirmed = window.confirm("ต้องการออกจากระบบหรือไม่?");
    if (!confirmed) return;

    await supabase.auth.signOut();

    router.replace("/login");
    router.refresh();
  };

  const renderNavigation = (collapsed: boolean) => (
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
                  onClick={() => {
                    setDrawerOpen(false);
                    setSidebarExpanded(false);
                  }}
                  style={getLinkStyle(item.page, collapsed)}
                  title={item.label}
                >
                  <span style={navIconStyle}>
                    <NavIcon name={item.icon} />
                  </span>
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>

      <button type="button" onClick={handleLogout} style={collapsed ? compactLogoutButtonStyle : logoutButtonStyle}>
        <span style={navIconStyle}>
          <NavIcon name="logout" />
        </span>
        {!collapsed && <span>Logout</span>}
      </button>
    </>
  );

  return (
    <>
      {!isMobile && (
        <aside
          style={sidebarExpanded ? sidebarStyle : collapsedSidebarStyle}
          onMouseEnter={() => setSidebarExpanded(true)}
          onMouseLeave={() => setSidebarExpanded(false)}
        >
          {renderNavigation(!sidebarExpanded)}
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
            {renderNavigation(false)}
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

function NavIcon({ name }: { name: NavIconName }) {
  const common = {
    width: 19,
    height: 19,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "dashboard") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    );
  }

  if (name === "calendar") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M8 2v4M16 2v4M3 10h18" />
      </svg>
    );
  }

  if (name === "cases") {
    return (
      <svg {...common}>
        <path d="M4 7h16v12H4z" />
        <path d="M9 7V5h6v2M4 12h16" />
      </svg>
    );
  }

  if (name === "advisory") {
    return (
      <svg {...common}>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M15 3v4h4" />
        <path d="M9 11h6M9 15h4" />
        <path d="M17 14l2 2 2-2" />
        <path d="M19 16v5" />
      </svg>
    );
  }

  if (name === "workload") {
    return (
      <svg {...common}>
        <path d="M4 19V5M4 19h16" />
        <path d="M8 16v-5M12 16V8M16 16v-8" />
      </svg>
    );
  }

  if (name === "office") {
    return (
      <svg {...common}>
        <path d="M5 21V4h10v17M15 9h4v12" />
        <path d="M8 8h2M8 12h2M8 16h2" />
      </svg>
    );
  }

  if (name === "finance") {
    return (
      <svg {...common}>
        <path d="M4 7h16v12H4z" />
        <path d="M16 12h4M7 7V5h10v2" />
        <circle cx="16" cy="13" r="1" />
      </svg>
    );
  }

  if (name === "summary") {
    return (
      <svg {...common}>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M14 3v4h4M9 12h6M9 16h6" />
      </svg>
    );
  }

  if (name === "clients") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20a6 6 0 0 1 12 0" />
        <path d="M16 11a3 3 0 0 0 0-6M18 20a5 5 0 0 0-3-4" />
      </svg>
    );
  }

  if (name === "users") {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3" />
        <path d="M5 21a7 7 0 0 1 14 0" />
        <path d="M18 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
      </svg>
    );
  }

  if (name === "account") {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M14 4h5v16h-5" />
    </svg>
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
  transition: "width 180ms ease, padding 180ms ease, box-shadow 180ms ease",
};

const collapsedSidebarStyle: React.CSSProperties = {
  ...sidebarStyle,
  width: 72,
  padding: 12,
  alignItems: "center",
  boxShadow: "2px 0 12px rgba(15, 23, 42, 0.04)",
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

const navIconStyle: React.CSSProperties = {
  display: "inline-flex",
  width: 34,
  height: 24,
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 34px",
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

const compactLinkButtonStyle: React.CSSProperties = {
  ...linkButtonStyle,
  width: 48,
  height: 42,
  justifyContent: "center",
  padding: 0,
};

const compactPrimaryLinkButtonStyle: React.CSSProperties = {
  ...primaryLinkButtonStyle,
  width: 48,
  height: 42,
  justifyContent: "center",
  padding: 0,
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

const compactLogoutButtonStyle: React.CSSProperties = {
  ...logoutButtonStyle,
  width: 48,
  height: 42,
  justifyContent: "center",
  padding: 0,
};
