"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AuthGuard from "../../components/AuthGuard";
import AppTopNav from "../../components/AppTopNav";
import { buildPermissions } from "../../../lib/permissions";
import { supabase } from "../../../lib/supabase";
import type { UserPermissions, UserRole } from "../../../lib/permissions";
import AdvisoryIssuesSection from "./components/AdvisoryIssuesSection";
import AdvisoryTimeLogsSection from "./components/AdvisoryTimeLogsSection";
import AdvisoryHistoryPanel from "./components/AdvisoryHistoryPanel";
import AdvisoryDeletedItemsPanel from "./components/AdvisoryDeletedItemsPanel";
import FinanceQuotationsSection from "../../components/FinanceQuotationsSection";

type UserProfile = {
  role?: UserRole | string | null;
  financial_access?: boolean | null;
  staff_name?: string | null;
};

type AdvisoryMatter = {
  id: string;
  client_id?: string | null;
  matter_no?: string | null;
  title?: string | null;
  matter_type?: string | null;
  retainer_type?: string | null;
  status?: string | null;
  responsible_lawyer?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  monthly_retainer_amount?: number | string | null;
  scope_of_work?: string | null;
  note?: string | null;
};

type AdvisoryIssueOption = {
  id: string;
  issue_no?: string | null;
  title?: string | null;
};

const editableRoles: UserRole[] = [
  "admin",
  "partner",
  "lawyer",
  "assistant_lawyer",
  "staff",
];

const issueEditableRoles: UserRole[] = [
  "admin",
  "partner",
  "lawyer",
  "assistant_lawyer",
];

const deleteRoles: UserRole[] = ["admin", "partner"];

const matterTypeOptions = [
  { value: "general_advisory", label: "General Advisory" },
  { value: "legal_opinion", label: "Legal Opinion" },
  { value: "contract_review", label: "Contract Review" },
  { value: "document_drafting", label: "Document Drafting" },
  { value: "meeting_consultation", label: "Meeting / Consultation" },
  { value: "corporate_support", label: "Corporate Support" },
  { value: "compliance", label: "Compliance" },
  { value: "other", label: "Other" },
];

const retainerTypeOptions = [
  { value: "no_retainer", label: "No Retainer" },
  { value: "monthly_retainer", label: "Monthly Retainer" },
  { value: "project_based", label: "Project-Based" },
  { value: "hourly", label: "Hourly" },
];

const statusOptions = [
  { value: "active", label: "Active" },
  { value: "waiting", label: "Waiting" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function AdvisoryDetailPage() {
  const params = useParams();
  const id = String(params?.id || "");

  const [profile, setProfile] = useState<UserProfile>({
    role: "",
    financial_access: false,
    staff_name: "",
  });
  const [actorEmail, setActorEmail] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingMatter, setLoadingMatter] = useState(false);
  const [matter, setMatter] = useState<AdvisoryMatter | null>(null);
  const [issues, setIssues] = useState<AdvisoryIssueOption[]>([]);
  const [clientName, setClientName] = useState("-");
  const [errorText, setErrorText] = useState("");

  const permissions: UserPermissions = useMemo(() => {
    return buildPermissions(profile);
  }, [profile]);

  const canViewAdvisory = permissions.canViewDashboard;
  const canEditTimeLogs = editableRoles.includes(permissions.role);
  const canEditIssues = issueEditableRoles.includes(permissions.role);
  const canDeleteTimeLogs = deleteRoles.includes(permissions.role);
  const actorName = profile.staff_name || actorEmail || "current_user";

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoadingProfile(true);

        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userData.user) {
          setProfile({ role: "", financial_access: false, staff_name: "" });
          return;
        }

        setActorEmail(userData.user.email || userData.user.id || "");

        const { data, error } = await supabase
          .from("user_profiles")
          .select("role, financial_access, staff_name")
          .eq("id", userData.user.id)
          .single();

        if (error || !data) {
          setProfile({ role: "", financial_access: false, staff_name: "" });
          return;
        }

        setProfile({
          role: data.role || "",
          financial_access: data.financial_access === true,
          staff_name: data.staff_name || "",
        });
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
  }, []);

  useEffect(() => {
    const loadMatter = async () => {
      if (!id || !canViewAdvisory) return;

      try {
        setLoadingMatter(true);
        setErrorText("");

        const { data, error } = await supabase
          .from("advisory_matters")
          .select(
            "id, client_id, matter_no, title, matter_type, retainer_type, status, responsible_lawyer, start_date, end_date, monthly_retainer_amount, scope_of_work, note"
          )
          .eq("id", id)
          .maybeSingle();

        if (error || !data) {
          setErrorText(error?.message || "Advisory matter not found");
          setMatter(null);
          return;
        }

        setMatter(data as AdvisoryMatter);

        if (data.client_id) {
          const { data: clientData } = await supabase
            .from("clients")
            .select("name")
            .eq("id", data.client_id)
            .maybeSingle();

          setClientName(clientData?.name || "-");
        }
      } finally {
        setLoadingMatter(false);
      }
    };

    if (loadingProfile) return;
    loadMatter();
  }, [canViewAdvisory, id, loadingProfile]);

  if (loadingProfile) {
    return (
      <AuthGuard>
        <main style={pageStyle}>
          <div style={messageBoxStyle}>Loading permission...</div>
        </main>
      </AuthGuard>
    );
  }

  if (!canViewAdvisory) {
    return (
      <AuthGuard>
        <main style={pageStyle}>
          <AppTopNav
            title="Advisory"
            subtitle="Advisory and retainer matter"
            activePage="advisory"
          />
          <div style={noAccessBoxStyle}>No access</div>
        </main>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <main style={pageStyle}>
        <AppTopNav
          title="Advisory"
          subtitle="Advisory and retainer matter"
          activePage="advisory"
        />

        <Link href="/advisory" style={backLinkStyle}>
          Back to Advisory
        </Link>

        {errorText ? <div style={errorBoxStyle}>{errorText}</div> : null}

        {loadingMatter ? (
          <div style={messageBoxStyle}>Loading advisory matter...</div>
        ) : matter ? (
          <>
            <section style={panelStyle}>
              <div style={detailGridStyle}>
                <InfoLine label="Matter No" value={matter.matter_no} />
                <InfoLine label="Title" value={matter.title} />
                <InfoLine label="Client" value={clientName} />
                <InfoLine
                  label="Matter Type"
                  value={renderOptionLabel(matter.matter_type, matterTypeOptions)}
                />
                <InfoLine
                  label="Retainer Type"
                  value={renderOptionLabel(
                    matter.retainer_type,
                    retainerTypeOptions
                  )}
                />
                <InfoLine
                  label="Status"
                  value={renderOptionLabel(matter.status, statusOptions)}
                />
                <InfoLine
                  label="Responsible Lawyer"
                  value={matter.responsible_lawyer}
                />
                <InfoLine label="Start Date" value={matter.start_date} />
                <InfoLine label="End Date" value={matter.end_date} />
                <InfoLine
                  label="Monthly Retainer"
                  value={formatAmount(matter.monthly_retainer_amount)}
                />
                <InfoLine label="Scope of Work" value={matter.scope_of_work} />
                <InfoLine label="Note" value={matter.note} />
              </div>
            </section>

            <AdvisoryIssuesSection
              advisoryMatterId={matter.id}
              clientId={matter.client_id || ""}
              canEdit={canEditIssues}
              canDelete={canDeleteTimeLogs}
              actorName={actorName}
              onIssuesChange={setIssues}
            />

            <AdvisoryTimeLogsSection
              advisoryMatterId={matter.id}
              clientId={matter.client_id || ""}
              canEdit={canEditTimeLogs}
              canDelete={canDeleteTimeLogs}
              actorName={actorName}
              issues={issues}
            />

            <FinanceQuotationsSection advisoryMatterId={matter.id} />

            <AdvisoryHistoryPanel matterId={matter.id} />

            <AdvisoryDeletedItemsPanel
              matterId={matter.id}
              canRestore={canDeleteTimeLogs}
              actorName={actorName}
            />
          </>
        ) : null}
      </main>
    </AuthGuard>
  );
}

function InfoLine({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>{value || "-"}</div>
    </div>
  );
}

function renderOptionLabel(
  value: string | null | undefined,
  options: { value: string; label: string }[]
) {
  const option = options.find((item) => item.value === value);
  return option?.label || value || "-";
}

function formatAmount(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "-";
  const numberValue = Number(value);
  if (Number.isNaN(numberValue)) return String(value);
  return numberValue.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  padding: 24,
  background: "#f8fafc",
  color: "#111111",
};

const panelStyle: React.CSSProperties = {
  marginTop: 16,
  marginBottom: 16,
  border: "1px solid #dddddd",
  borderRadius: 12,
  background: "#ffffff",
  padding: 16,
};

const detailGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const labelStyle: React.CSSProperties = {
  marginBottom: 4,
  color: "#666666",
  fontSize: 12,
  fontWeight: 800,
};

const valueStyle: React.CSSProperties = {
  color: "#111111",
  fontSize: 14,
  fontWeight: 700,
  whiteSpace: "pre-wrap",
};

const backLinkStyle: React.CSSProperties = {
  display: "inline-block",
  marginBottom: 12,
  color: "#111111",
  fontWeight: 800,
};

const messageBoxStyle: React.CSSProperties = {
  padding: 18,
  fontWeight: 800,
};

const noAccessBoxStyle: React.CSSProperties = {
  padding: 18,
  border: "1px solid #f0c4c4",
  borderRadius: 12,
  background: "#fff5f5",
  color: "#a40000",
  fontWeight: 800,
};

const errorBoxStyle: React.CSSProperties = {
  marginBottom: 16,
  padding: 14,
  border: "1px solid #f0c4c4",
  borderRadius: 10,
  background: "#fff5f5",
  color: "#a40000",
  fontWeight: 700,
};
