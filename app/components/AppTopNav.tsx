"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Menu, UserRound } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { buildPermissions } from "../../lib/permissions";
import type { UserPermissions, UserRole } from "../../lib/permissions";
import { useI18n } from "../../lib/i18n/provider";
import LanguageSelector from "./LanguageSelector";
import { FinanceSidebar } from "../finance/FinanceSidebar";
import type { UserPermissionProfile } from "../../lib/permissions";
import sidebarCss from "./AppSidebar.module.css";
import { revealActiveNavigation } from "./sidebar-reveal";

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
    | "settings"
    | "documentSettings"
    | "documentTemplates"
    | "documentClauses"
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
  can_view_finance_cash_transactions?: boolean | null;
  can_manage_finance_cash_transactions?: boolean | null;
  can_confirm_finance_cash_transactions?: boolean | null;
  can_reverse_finance_cash_transactions?: boolean | null;
  can_view_finance_billable_charges?: boolean | null;
  can_manage_finance_billable_charges?: boolean | null;
  can_approve_finance_billable_charges?: boolean | null;
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
  | "settings"
  | "templates"
  | "clauses"
  | "account"
  | "logout";

export default function AppTopNav({
  title,
  subtitle,
  activePage,
}: AppTopNavProps) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  const [profile, setProfile] = useState<UserProfile & UserPermissionProfile>({
    role: "",
    financial_access: false,
  });
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [sidebarFocused, setSidebarFocused] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const financePage = pathname.startsWith("/finance");
  const [financePreference, setFinancePreference] = useState<{ pathname: string; expanded: boolean } | null>(null);
  const financeExpanded = financePreference?.pathname === pathname ? financePreference.expanded : financePage;
  const expanded = sidebarExpanded || sidebarFocused;
  const drawerRef = useRef<HTMLElement>(null), menuRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  function revealModule() { if (financePage) setFinancePreference(null); }
  useEffect(() => {
    if (!(isMobile ? drawerOpen : expanded)) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => { if (navigationRef.current) revealActiveNavigation(navigationRef.current, reduced); }, reduced ? 0 : 230);
    return () => clearTimeout(timer);
  }, [expanded, drawerOpen, isMobile, pathname, profile.role]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.activeElement as HTMLElement | null, menu = menuRef.current;
    drawerRef.current?.querySelector<HTMLElement>("button,a")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setDrawerOpen(false); }
      if (event.key !== "Tab") return;
      const items = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>("a,button:not(:disabled)") || []).filter(item => item.getClientRects().length > 0);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); (previous || menu)?.focus(); };
  }, [drawerOpen]);

  const permissions: UserPermissions = useMemo(() => {
    return buildPermissions(profile);
  }, [profile]);
  const financeHref = permissions.canViewFinanceCashTransactions
    ? "/finance/cash-transactions"
    : permissions.canViewCompanyLedger
      ? "/finance/ledger"
      : permissions.canUseExpenseClaims
        ? "/finance/expense-claims"
        : "/finance/compensation";

  const navGroups = useMemo(
    () => [
      {
        title: t("common.nav.command"),
        items: [
          { page: "dashboard" as const, label: t("common.nav.dashboard"), icon: "dashboard" as const, href: "/dashboard", visible: permissions.canViewDashboard },
          { page: "calendar" as const, label: t("common.nav.calendar"), icon: "calendar" as const, href: "/calendar", visible: permissions.canViewDashboard },
          { page: "cases" as const, label: t("common.nav.cases"), icon: "cases" as const, href: "/cases", visible: permissions.canViewCases },
          { page: "advisory" as const, label: t("common.nav.advisory"), icon: "advisory" as const, href: "/advisory", visible: permissions.canViewDashboard },
        ],
      },
      {
        title: t("common.nav.operations"),
        items: [
          { page: "workload" as const, label: t("common.nav.workload"), icon: "workload" as const, href: "/reports/daily-workload", visible: permissions.canViewDashboard },
          { page: "officeWork" as const, label: t("common.nav.officeWork"), icon: "office" as const, href: "/workload/office-work", visible: permissions.canAccessOfficeWorkLogs },
          { page: "workloadSummary" as const, label: t("common.nav.summary"), icon: "summary" as const, href: "/reports/workload-summary", visible: permissions.canViewDashboard },
        ],
      },
      {
        title: t("common.nav.finance"),
        items: [
          { page: "finance" as const, label: t("common.nav.finance"), icon: "finance" as const, href: financeHref, visible: permissions.canViewFinanceModule },
        ],
      },
      {
        title: t("common.nav.management"),
        items: [
          { page: "clients" as const, label: t("common.nav.clients"), icon: "clients" as const, href: "/clients", visible: permissions.canViewDashboard },
          { page: "users" as const, label: t("common.nav.users"), icon: "users" as const, href: "/admin/users", visible: permissions.canManageUsers },
        ],
      },
      {
        title: t("common.nav.settings"),
        items: [
          { page: "documentSettings" as const, label: t("common.nav.documentSettings"), icon: "settings" as const, href: "/settings/document-settings", visible: permissions.role === "admin" || permissions.role === "partner" },
          { page: "documentTemplates" as const, label: t("common.nav.documentTemplates"), icon: "templates" as const, href: "/settings/document-templates", visible: permissions.role === "admin" || permissions.role === "partner" },
          { page: "documentClauses" as const, label: t("common.nav.clauseLibrary"), icon: "clauses" as const, href: "/settings/document-clauses", visible: permissions.role === "admin" || permissions.role === "partner" },
        ],
      },
      {
        title: t("common.nav.account"),
        items: [
          { page: "account" as const, label: t("common.nav.account"), icon: "account" as const, href: "/account/security", visible: true },
        ],
      },
    ],
    [financeHref, permissions, t]
  );

  useEffect(() => {
    const updateViewport = () => {
      setIsMobile(window.innerWidth < 760 || window.matchMedia("(hover: none), (pointer: coarse)").matches);
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
        .select("role, financial_access, can_submit_expense_claim, can_view_own_expense_claims, can_view_all_expense_claims, can_view_company_ledger, can_view_lawyer_compensation, can_view_finance_cash_transactions, can_manage_finance_cash_transactions, can_confirm_finance_cash_transactions, can_reverse_finance_cash_transactions, can_view_finance_billable_charges, can_manage_finance_billable_charges, can_approve_finance_billable_charges, can_submit_office_work_log, can_view_own_office_work_logs, can_view_all_office_work_logs, can_manage_finance_payments, can_confirm_finance_payments, can_reverse_finance_payments, can_reallocate_finance_payments, can_view_finance_receipts, can_manage_finance_receipts, can_issue_finance_receipts, can_void_finance_receipts, can_view_finance_tax_invoices, can_manage_finance_tax_invoices, can_issue_finance_tax_invoices")
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
        ...data,
        role: data.role || "",
        financial_access: data.financial_access === true,
        can_submit_expense_claim: data.can_submit_expense_claim === true,
        can_view_own_expense_claims: data.can_view_own_expense_claims === true,
        can_view_all_expense_claims: data.can_view_all_expense_claims === true,
        can_view_company_ledger: data.can_view_company_ledger === true,
        can_view_lawyer_compensation: data.can_view_lawyer_compensation === true,
        can_view_finance_cash_transactions: data.can_view_finance_cash_transactions === true,
        can_manage_finance_cash_transactions: data.can_manage_finance_cash_transactions === true,
        can_confirm_finance_cash_transactions: data.can_confirm_finance_cash_transactions === true,
        can_reverse_finance_cash_transactions: data.can_reverse_finance_cash_transactions === true,
        can_view_finance_billable_charges: data.can_view_finance_billable_charges === true,
        can_manage_finance_billable_charges: data.can_manage_finance_billable_charges === true,
        can_approve_finance_billable_charges: data.can_approve_finance_billable_charges === true,
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
      | "settings"
      | "documentSettings"
      | "documentTemplates"
      | "documentClauses"
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
    if (page === "settings") return pathname.startsWith("/settings");
    if (page === "documentSettings") return pathname.startsWith("/settings/document-settings");
    if (page === "documentTemplates") return pathname.startsWith("/settings/document-templates");
    if (page === "documentClauses") return pathname.startsWith("/settings/document-clauses");
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
    const confirmed = window.confirm(t("common.nav.confirmLogout"));
    if (!confirmed) return;

    await supabase.auth.signOut();

    router.replace("/login");
    router.refresh();
  };

  const renderNavigation = (collapsed: boolean) => (
    <>
      <div style={brandStyle}>
        <div style={brandMarkStyle}>VP</div>
        {(
          <div data-sidebar-label aria-hidden={collapsed || undefined}>
            <div style={brandTitleStyle}>VP Case System</div>
            <div style={brandSubtitleStyle}>Office OS</div>
          </div>
        )}
      </div>

      <nav ref={navigationRef} style={sidebarNavStyle} data-sidebar-navigation>
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => item.visible);
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.title} style={navGroupBlockStyle}>
              {!collapsed && !visibleItems.some(item => item.page === "finance") && <div style={groupHeadingStyle}>{group.title}</div>}
              {visibleItems.map((item) => item.page === "finance" ? (
                <button key={item.href} type="button" aria-label={item.label} title={item.label}
                  aria-expanded={financeExpanded} aria-controls="finance-sidebar-links"
                  onClick={() => setFinancePreference({ pathname, expanded: !financeExpanded })}
                  style={{ ...getLinkStyle(item.page, collapsed), width: collapsed ? 48 : "100%", font: "inherit", fontWeight: 650, cursor: "pointer", textAlign: "left" }}>
                  <span style={navIconStyle}><NavIcon name={item.icon} /></span>
                  <span data-sidebar-label aria-hidden={collapsed || undefined} style={{ flex: collapsed ? undefined : 1 }}>{item.label}</span><span data-sidebar-label><ChevronDown data-sidebar-chevron size={16} style={{ transform: financeExpanded ? "rotate(180deg)" : undefined }} aria-hidden="true" /></span>
                </button>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    setDrawerOpen(false);
                    setSidebarExpanded(false);
                  }}
                  style={getLinkStyle(item.page, collapsed)}
                  title={item.label}
                  aria-label={item.label}
                  aria-current={isActivePage(item.page) ? "page" : undefined}
                >
                  <span style={navIconStyle}>
                    <NavIcon name={item.icon} />
                  </span>
                  <span data-sidebar-label aria-hidden={collapsed || undefined}>{item.label}</span>
                </Link>
              ))}
              {visibleItems.some(item => item.page === "finance") ? <div id="finance-sidebar-links" data-sidebar-submenu hidden={!financeExpanded} inert={collapsed}><FinanceSidebar permissions={permissions} pathname={pathname} onNavigate={() => setDrawerOpen(false)} /></div> : null}
            </div>
          );
        })}
      </nav>

      <button type="button" onClick={handleLogout} style={collapsed ? compactLogoutButtonStyle : logoutButtonStyle}>
        <span style={navIconStyle}>
          <NavIcon name="logout" />
        </span>
        <span data-sidebar-label aria-hidden={collapsed || undefined}>{t("common.nav.logout")}</span>
      </button>
    </>
  );

  return (
    <>
      {!isMobile && (
        <aside
          data-app-sidebar
          className={sidebarCss.shell}
          data-expanded={expanded}
          style={expanded ? sidebarStyle : collapsedSidebarStyle}
          onFocus={event => { if (!expanded) revealModule(); setSidebarFocused(event.target.matches(":focus-visible")); }}
          onKeyDown={event => { if (event.key === "Tab") setSidebarFocused(true); }}
          onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setSidebarFocused(false); }}
          onMouseEnter={() => { revealModule(); setSidebarExpanded(true); }}
          onMouseLeave={() => setSidebarExpanded(false)}
        >
          {renderNavigation(!expanded)}
        </aside>
      )}

      {isMobile && (
        <div style={mobileTopBarStyle}>
          <button
            ref={menuRef}
            aria-expanded={drawerOpen}
            aria-label={t("common.nav.menu")}
            title={t("common.nav.menu")}
            type="button"
            onClick={() => { revealModule(); setDrawerOpen(true); }}
            style={mobileMenuButtonStyle}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          {financePage ? <span style={{ flex: 1 }} /> : <div style={mobileTitleStyle}>{title}</div>}
          <LanguageSelector />
          {financePage ? <Link href="/account/security" title={t("common.nav.account")} aria-label={t("common.nav.account")} style={utilityLinkStyle}><UserRound size={20} /></Link> : null}
        </div>
      )}

      {isMobile && drawerOpen && (
        <>
          <button
            type="button"
            aria-label={t("common.nav.closeMenu")}
            onClick={() => setDrawerOpen(false)}
            style={drawerOverlayStyle}
          />
          <aside ref={drawerRef} className={sidebarCss.shell} data-expanded="true" role="dialog" aria-modal="true" aria-label={t("common.nav.menu")} style={drawerStyle}>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              style={drawerCloseButtonStyle}
            >
              {t("common.actions.close")}
            </button>
            {renderNavigation(false)}
          </aside>
        </>
      )}

      {financePage && !isMobile ? <header data-finance-utilities style={financeUtilityStyle}>
        <LanguageSelector />
        <Link href="/account/security" title={t("common.nav.account")} aria-label={t("common.nav.account")} style={utilityLinkStyle}><UserRound size={20} /></Link>
      </header> : null}
      {!pathname.startsWith("/finance/payouts/") && pathname !== "/finance/payables" ? <div style={pageHeaderStyle}>
        {!isMobile && !financePage ? <div style={{ float: "right", marginLeft: 12 }}><LanguageSelector /></div> : null}
        <h1 style={titleStyle}>{title}</h1>
        {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
      </div> : null}
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

  if (name === "settings") {
    return (
      <svg {...common}>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M15 3v4h4" />
        <path d="M9 11h6M9 15h6" />
        <circle cx="11" cy="11" r="1" />
        <circle cx="14" cy="15" r="1" />
      </svg>
    );
  }

  if (name === "templates") {
    return (
      <svg {...common}>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M15 3v4h4M9 11h6M9 15h6" />
        <path d="M4 7h2M4 12h2M4 17h2" />
      </svg>
    );
  }

  if (name === "clauses") {
    return (
      <svg {...common}>
        <path d="M5 4h14v16H5z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
        <path d="M3 7h2M3 12h2M3 17h2" />
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

const financeUtilityStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12,
  minHeight: 44, marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid #e5e7eb",
};
const utilityLinkStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 40,
  border: "1px solid #d1d5db", borderRadius: 6, color: "#334155", background: "#ffffff", flexShrink: 0,
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
  overflow: "hidden",
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
  alignContent: "start",
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
  letterSpacing: 0,
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
  display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 40, minHeight: 40,
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
