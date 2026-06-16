"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AuthGuard from "../../../../components/AuthGuard";
import AppTopNav from "../../../../components/AppTopNav";
import { buildPermissions } from "../../../../../lib/permissions";
import { createAuditLog } from "../../../../../lib/auditLog";
import { supabase } from "../../../../../lib/supabase";
import type { UserPermissions, UserRole } from "../../../../../lib/permissions";
import AdvisoryTimeLogsSection from "../../components/AdvisoryTimeLogsSection";
import AdvisoryIssueTasksSection from "./components/AdvisoryIssueTasksSection";
import AdvisoryAdviceRecordsSection from "./components/AdvisoryAdviceRecordsSection";

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

type IssueForm = {
  issue_no: string;
  title: string;
  issue_type: string;
  status: string;
  priority: string;
  responsible_person: string;
  opened_at: string;
  due_date: string;
  closed_at: string;
  summary: string;
  legal_position: string;
  next_action: string;
  note: string;
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

const emptyIssueForm: IssueForm = {
  issue_no: "",
  title: "",
  issue_type: "general",
  status: "open",
  priority: "normal",
  responsible_person: "",
  opened_at: "",
  due_date: "",
  closed_at: "",
  summary: "",
  legal_position: "",
  next_action: "",
  note: "",
};

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
  { value: "Closed", label: "Closed" },
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
  const router = useRouter();
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
  const [showEditForm, setShowEditForm] = useState(false);
  const [savingIssue, setSavingIssue] = useState(false);
  const [issueForm, setIssueForm] = useState<IssueForm>(emptyIssueForm);

  const permissions: UserPermissions = useMemo(() => {
    return buildPermissions(profile);
  }, [profile]);

  const canView = permissions.canViewDashboard;
  const canEditTimeLogs = editableRoles.includes(permissions.role);
  const canEditIssue = issueEditableRoles.includes(permissions.role);
  const canDeleteTimeLogs = deleteRoles.includes(permissions.role);
  const canDeleteIssue = deleteRoles.includes(permissions.role);
  const actorName = profile.staff_name || actorEmail || "current_user";
  const issueIsClosed = isIssueClosedStatus(issue?.status);

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

  const loadData = useCallback(async () => {
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
      setIssueForm(toIssueForm(issueData as AdvisoryIssue));

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
  }, [canView, id, issueId]);

  useEffect(() => {
    if (loadingProfile) return;
    loadData();
  }, [loadData, loadingProfile]);

  const startEditIssue = () => {
    if (!canEditIssue || !issue) return;
    setIssueForm(toIssueForm(issue));
    setShowEditForm(true);
  };

  const cancelEditIssue = () => {
    setIssueForm(issue ? toIssueForm(issue) : emptyIssueForm);
    setShowEditForm(false);
  };

  const saveIssue = async () => {
    if (!canEditIssue || !issue || !matter) return;

    if (!issueForm.title.trim()) {
      alert("Issue title is required");
      return;
    }

    if (issue.advisory_matter_id !== matter.id) {
      alert("Advisory issue does not belong to this matter");
      return;
    }

    const payload = {
      issue_no: issueForm.issue_no.trim(),
      title: issueForm.title.trim(),
      issue_type: issueForm.issue_type,
      status: issueForm.status,
      priority: issueForm.priority,
      responsible_person: issueForm.responsible_person.trim(),
      opened_at: issueForm.opened_at || null,
      due_date: issueForm.due_date || null,
      closed_at: issueForm.closed_at || null,
      summary: issueForm.summary.trim(),
      legal_position: issueForm.legal_position.trim(),
      next_action: issueForm.next_action.trim(),
      note: issueForm.note.trim(),
      updated_at: new Date().toISOString(),
    };

    try {
      setSavingIssue(true);

      const { data, error } = await supabase
        .from("advisory_issues")
        .update(payload)
        .eq("id", issueId)
        .eq("advisory_matter_id", matter.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();

      if (error || !data) {
        alert("Update advisory issue failed:\n" + (error?.message || "No row updated"));
        return;
      }

      await writeIssueAuditLog("update", issue.id, issue, data);
      setShowEditForm(false);
      await loadData();
    } finally {
      setSavingIssue(false);
    }
  };

  const updateIssueClosedState = async (nextClosed: boolean) => {
    if (!canEditIssue || !issue || !matter) return;

    if (issue.advisory_matter_id !== matter.id) {
      alert("Advisory issue does not belong to this matter");
      return;
    }

    const confirmed = window.confirm(
      nextClosed ? "Confirm close this issue?" : "Confirm reopen this issue?"
    );
    if (!confirmed) return;

    const now = new Date().toISOString();
    const payload = {
      status: nextClosed ? "Closed" : "Open",
      closed_at: nextClosed ? now : null,
      updated_at: now,
    };

    try {
      setSavingIssue(true);

      const { data, error } = await supabase
        .from("advisory_issues")
        .update(payload)
        .eq("id", issueId)
        .eq("advisory_matter_id", matter.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();

      if (error || !data) {
        alert(
          `${nextClosed ? "Close" : "Reopen"} advisory issue failed:\n` +
            (error?.message || "No row updated")
        );
        return;
      }

      await writeIssueAuditLog(
        "update",
        issue.id,
        issue,
        data,
        nextClosed ? "Close advisory issue" : "Reopen advisory issue"
      );
      await loadData();
    } finally {
      setSavingIssue(false);
    }
  };

  const softDeleteIssue = async () => {
    if (!canDeleteIssue || !issue || !matter) return;

    if (issue.advisory_matter_id !== matter.id) {
      alert("Advisory issue does not belong to this matter");
      return;
    }

    const confirmed = window.confirm("Delete this advisory issue?");
    if (!confirmed) return;

    try {
      setSavingIssue(true);

      const payload = {
        deleted_at: new Date().toISOString(),
        deleted_by: actorName || actorEmail || "current_user",
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("advisory_issues")
        .update(payload)
        .eq("id", issueId)
        .eq("advisory_matter_id", matter.id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();

      if (error || !data) {
        alert(
          "Soft delete advisory issue failed:\n" +
            (error?.message || "No row updated")
        );
        return;
      }

      await writeIssueAuditLog("soft_delete", issue.id, issue, data);
      router.push(`/advisory/${id}`);
    } finally {
      setSavingIssue(false);
    }
  };

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
              <div style={sectionHeaderStyle}>
                <h3 style={sectionTitleStyle}>Issue Detail</h3>
                <div style={buttonRowStyle}>
                  {canEditIssue && !showEditForm ? (
                    <button
                      type="button"
                      onClick={startEditIssue}
                      disabled={savingIssue}
                      style={secondaryButtonStyle}
                    >
                      Edit Issue
                    </button>
                  ) : null}
                  {canEditIssue && !showEditForm && !issueIsClosed ? (
                    <button
                      type="button"
                      onClick={() => updateIssueClosedState(true)}
                      disabled={savingIssue}
                      style={primaryButtonStyle}
                    >
                      Close Issue
                    </button>
                  ) : null}
                  {canEditIssue && !showEditForm && issueIsClosed ? (
                    <button
                      type="button"
                      onClick={() => updateIssueClosedState(false)}
                      disabled={savingIssue}
                      style={secondaryButtonStyle}
                    >
                      Reopen Issue
                    </button>
                  ) : null}
                  {canDeleteIssue ? (
                    <button
                      type="button"
                      onClick={softDeleteIssue}
                      disabled={savingIssue}
                      style={dangerButtonStyle}
                    >
                      Soft Delete Issue
                    </button>
                  ) : null}
                </div>
              </div>
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

              {showEditForm ? (
                <div style={formStyle}>
                  <Field
                    label="Issue No"
                    value={issueForm.issue_no}
                    onChange={(value) =>
                      setIssueForm({ ...issueForm, issue_no: value })
                    }
                  />
                  <Field
                    label="Title"
                    value={issueForm.title}
                    onChange={(value) =>
                      setIssueForm({ ...issueForm, title: value })
                    }
                  />
                  <SelectField
                    label="Issue Type"
                    value={issueForm.issue_type}
                    onChange={(value) =>
                      setIssueForm({ ...issueForm, issue_type: value })
                    }
                    options={issueTypeOptions}
                  />
                  <SelectField
                    label="Status"
                    value={issueForm.status}
                    onChange={(value) =>
                      setIssueForm({ ...issueForm, status: value })
                    }
                    options={issueStatusOptions}
                  />
                  <SelectField
                    label="Priority"
                    value={issueForm.priority}
                    onChange={(value) =>
                      setIssueForm({ ...issueForm, priority: value })
                    }
                    options={priorityOptions}
                  />
                  <Field
                    label="Responsible Person"
                    value={issueForm.responsible_person}
                    onChange={(value) =>
                      setIssueForm({
                        ...issueForm,
                        responsible_person: value,
                      })
                    }
                  />
                  <Field
                    label="Opened At"
                    type="date"
                    value={issueForm.opened_at}
                    onChange={(value) =>
                      setIssueForm({ ...issueForm, opened_at: value })
                    }
                  />
                  <Field
                    label="Due Date"
                    type="date"
                    value={issueForm.due_date}
                    onChange={(value) =>
                      setIssueForm({ ...issueForm, due_date: value })
                    }
                  />
                  <Field
                    label="Closed At"
                    type="date"
                    value={issueForm.closed_at}
                    onChange={(value) =>
                      setIssueForm({ ...issueForm, closed_at: value })
                    }
                  />
                  <Field
                    label="Summary"
                    value={issueForm.summary}
                    onChange={(value) =>
                      setIssueForm({ ...issueForm, summary: value })
                    }
                  />
                  <Field
                    label="Legal Position"
                    value={issueForm.legal_position}
                    onChange={(value) =>
                      setIssueForm({ ...issueForm, legal_position: value })
                    }
                  />
                  <Field
                    label="Next Action"
                    value={issueForm.next_action}
                    onChange={(value) =>
                      setIssueForm({ ...issueForm, next_action: value })
                    }
                  />
                  <Field
                    label="Note"
                    value={issueForm.note}
                    onChange={(value) =>
                      setIssueForm({ ...issueForm, note: value })
                    }
                  />
                  <div style={buttonRowStyle}>
                    <button
                      type="button"
                      onClick={saveIssue}
                      disabled={savingIssue}
                      style={primaryButtonStyle}
                    >
                      {savingIssue ? "Saving..." : "Save Issue"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditIssue}
                      disabled={savingIssue}
                      style={secondaryButtonStyle}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            <AdvisoryIssueTasksSection
              advisoryMatterId={matter.id}
              advisoryIssueId={issue.id}
              clientId={issue.client_id || matter.client_id || null}
              canEdit={canEditTimeLogs}
              canDelete={canDeleteTimeLogs}
              actorName={actorName}
            />

            <AdvisoryAdviceRecordsSection
              advisoryMatterId={matter.id}
              advisoryIssueId={issue.id}
              clientId={issue.client_id || matter.client_id || null}
              canEdit={canEditIssue}
              canDelete={canDeleteIssue}
              actorName={actorName}
            />

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
  const option = options.find(
    (item) => item.value.toLowerCase() === String(value || "").toLowerCase()
  );
  return option?.label || value || "-";
}

function toIssueForm(issue: AdvisoryIssue): IssueForm {
  return {
    issue_no: issue.issue_no || "",
    title: issue.title || "",
    issue_type: normalizeOptionValue(issue.issue_type, issueTypeOptions),
    status: normalizeOptionValue(issue.status, issueStatusOptions),
    priority: normalizeOptionValue(issue.priority, priorityOptions),
    responsible_person: issue.responsible_person || "",
    opened_at: issue.opened_at || "",
    due_date: issue.due_date || "",
    closed_at: issue.closed_at || "",
    summary: issue.summary || "",
    legal_position: issue.legal_position || "",
    next_action: issue.next_action || "",
    note: issue.note || "",
  };
}

function normalizeOptionValue(
  value: string | null | undefined,
  options: { value: string; label: string }[]
) {
  const option = options.find(
    (item) => item.value.toLowerCase() === String(value || "").toLowerCase()
  );
  return option?.value || options[0]?.value || "";
}

function isIssueClosedStatus(status?: string | null) {
  return ["closed", "done", "completed", "cancelled"].includes(
    (status || "").trim().toLowerCase()
  );
}

async function writeIssueAuditLog(
  action: "update" | "soft_delete",
  recordId: string,
  oldData: unknown,
  newData: unknown,
  note?: string
) {
  try {
    await createAuditLog({
      caseId: null,
      tableName: "advisory_issues",
      recordId,
      action,
      oldData,
      newData,
      note: note || `Advisory issue ${action}`,
    });
  } catch (auditError) {
    console.error("CREATE ADVISORY ISSUE AUDIT FAILED:", auditError);
  }
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label style={fieldLabelStyle}>
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label style={fieldLabelStyle}>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
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
  margin: 0,
  fontSize: 18,
  fontWeight: 900,
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
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

const formStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginTop: 16,
  paddingTop: 16,
  borderTop: "1px solid #eeeeee",
};

const fieldLabelStyle: React.CSSProperties = {
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
};

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #000000",
  borderRadius: 8,
  background: "#000000",
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: 800,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #cccccc",
  borderRadius: 8,
  background: "#ffffff",
  color: "#111111",
  cursor: "pointer",
  fontWeight: 800,
};

const dangerButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  border: "1px solid #f0c4c4",
  background: "#fff5f5",
  color: "#a40000",
};
