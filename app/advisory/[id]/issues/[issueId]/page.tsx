"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AuthGuard from "../../../../components/AuthGuard";
import AppTopNav from "../../../../components/AppTopNav";
import { buildPermissions } from "../../../../../lib/permissions";
import { supabase } from "../../../../../lib/supabase";
import type { UserPermissions, UserRole } from "../../../../../lib/permissions";
import AdvisoryTimeLogsSection from "../../components/AdvisoryTimeLogsSection";

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
  status?: string | null;
  retainer_type?: string | null;
};

type AdvisoryIssue = {
  id: string;
  advisory_matter_id: string;
  client_id?: string | null;
  issue_no?: string | null;
  title?: string | null;
  issue_type?: string | null;
  status?: string | null;
  priority?: string | null;
  responsible_person?: string | null;
  opened_at?: string | null;
  due_date?: string | null;
  closed_at?: string | null;
  summary?: string | null;
  legal_position?: string | null;
  next_action?: string | null;
  note?: string | null;
};

const editableRoles: UserRole[] = [
  "admin",
  "partner",
  "lawyer",
  "assistant_lawyer",
  "staff",
];
const deleteRoles: UserRole[] = ["admin", "partner"];

const issueTypeOptions = [
  { value: "general", label: "General" },
  { value: "labor", label: "Labor" },
  { value: "contract", label: "Contract" },
  { value: "corporate", label: "Corporate" },
  { value: "compliance", label: "Compliance" },
  { value: "dispute", label: "Dispute" },
  { value: "license", label: "License / Permit" },
  { value: "tax", label: "Tax" },
  { value: "meeting", label: "Meeting" },
  { value: "other", label: "Other" },
];

const issueStatusOptions = [
  { value: "open", label: "Open" },
  { value: "waiting", label: "Waiting" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const priorityOptions = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const retainerTypeOptions = [
  { value: "no_retainer", label: "No Retainer" },
  { value: "monthly_retainer", label: "Monthly Retainer" },
  { value: "project_based", label: "Project-Based" },
  { value: "hourly", label: "Hourly" },
];

export default function AdvisoryIssueDetailPage() {
  const params = useParams();
  const id = String(params?.id || "");
  const issueId = String(params?.issueId || "");

  const [profile, setProfile] = useState<UserProfile>({
    role: "",
    financial_access: false,
    staff_name: "",
  });
  const [actorEmail, setActorEmail] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [matter, setMatter] = useState<AdvisoryMatter | null>(null);
  const [issue, setIssue] = useState<AdvisoryIssue | null>(null);
  const [clientName, setClientName] = useState("-");
  const [errorText, setErrorText] = useState("");

  const permissions: UserPermissions = useMemo(() => {
    return buildPermissions(profile);
  }, [profile]);

  const canView = permissions.canViewDashboard;
  const canEditTimeLogs = editableRoles.includes(permissions.role);
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
    const loadData = async () => {
      if (!id || !issueId || !canView) return;

      try {
        setLoadingData(true);
        setErrorText("");

        const { data: matterData, error: matterError } = await supabase
          .from("advisory_matters")
          .select("id, client_id, matter_no, title, status, retainer_type")
          .eq("id", id)
          .maybeSingle();

        if (matterError || !matterData) {
          setErrorText(matterError?.message || "Advisory matter not found");
          setMatter(null);
          setIssue(null);
          return;
        }

        const { data: issueData, error: issueError } = await supabase
          .from("advisory_issues")
          .select("*")
          .eq("id", issueId)
          .is("deleted_at", null)
          .maybeSingle();

        if (issueError || !issueData) {
          setErrorText(issueError?.message || "Advisory issue not found");
          setMatter(matterData as AdvisoryMatter);
          setIssue(null);
          return;
        }

        if (issueData.advisory_matter_id !== matterData.id) {
          setErrorText("Advisory issue does not belong to this matter");
          setMatter(matterData as AdvisoryMatter);
          setIssue(null);
          return;
        }

        setMatter(matterData as AdvisoryMatter);
        setIssue(issueData as AdvisoryIssue);

        const clientId = issueData.client_id || matterData.client_id;
        if (clientId) {
          const { data: clientData } = await supabase
            .from("clients")
            .select("name")
            .eq("id", clientId)
            .maybeSingle();

          setClientName(clientData?.name || "-");
        }
      } finally {
        setLoadingData(false);
      }
    };

    if (loadingProfile) return;
    loadData();
  }, [canView, id, issueId, loadingProfile]);

  if (loadingProfile) {
    return (
      <AuthGuard>
        <main style={pageStyle}>
          <div style={messageBoxStyle}>Loading permission...</div>
        </main>
      </AuthGuard>
    );
  }

  if (!canView) {
    return (
      <AuthGuard>
        <main style={pageStyle}>
          <AppTopNav
            title="Advisory"
            subtitle="Advisory issue detail"
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
          subtitle="Advisory issue detail"
          activePage="advisory"
        />

        <Link href={`/advisory/${id}`} style={backLinkStyle}>
          Back to Advisory Matter
        </Link>

        {errorText ? <div style={errorBoxStyle}>{errorText}</div> : null}

        {loadingData ? (
          <div style={messageBoxStyle}>Loading advisory issue...</div>
        ) : matter && issue ? (
          <>
            <section style={panelStyle}>
              <h3 style={sectionTitleStyle}>Parent Matter</h3>
              <div style={detailGridStyle}>
                <InfoLine label="Matter No" value={matter.matter_no} />
                <InfoLine label="Title" value={matter.title} />
                <InfoLine label="Client" value={clientName} />
                <InfoLine label="Status" value={matter.status} />
                <InfoLine
                  label="Retainer Type"
                  value={renderOptionLabel(
                    matter.retainer_type,
                    retainerTypeOptions
                  )}
                />
              </div>
            </section>

            <section style={panelStyle}>
              <h3 style={sectionTitleStyle}>Issue Detail</h3>
              <div style={detailGridStyle}>
                <InfoLine label="Issue No" value={issue.issue_no} />
                <InfoLine label="Title" value={issue.title} />
                <InfoLine
                  label="Issue Type"
                  value={renderOptionLabel(issue.issue_type, issueTypeOptions)}
                />
                <InfoLine
                  label="Status"
                  value={renderOptionLabel(issue.status, issueStatusOptions)}
                />
                <InfoLine
                  label="Priority"
                  value={renderOptionLabel(issue.priority, priorityOptions)}
                />
                <InfoLine
                  label="Responsible Person"
                  value={issue.responsible_person}
                />
                <InfoLine label="Opened At" value={issue.opened_at} />
                <InfoLine label="Due Date" value={issue.due_date} />
                <InfoLine label="Closed At" value={issue.closed_at} />
                <InfoLine label="Summary" value={issue.summary} />
                <InfoLine label="Legal Position" value={issue.legal_position} />
                <InfoLine label="Next Action" value={issue.next_action} />
                <InfoLine label="Note" value={issue.note} />
              </div>
            </section>

            <AdvisoryTimeLogsSection
              advisoryMatterId={matter.id}
              clientId={issue.client_id || matter.client_id || ""}
              canEdit={canEditTimeLogs}
              canDelete={canDeleteTimeLogs}
              actorName={actorName}
              issues={[issue]}
              issueIdFilter={issue.id}
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

const sectionTitleStyle: React.CSSProperties = {
  margin: "0 0 14px 0",
  fontSize: 18,
  fontWeight: 900,
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
