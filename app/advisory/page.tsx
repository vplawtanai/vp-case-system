"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGuard from "../components/AuthGuard";
import AppTopNav from "../components/AppTopNav";
import { createAuditLog } from "../../lib/auditLog";
import { buildPermissions } from "../../lib/permissions";
import { supabase } from "../../lib/supabase";
import type { UserPermissions, UserRole } from "../../lib/permissions";

type CurrentProfile = {
  role?: UserRole | string | null;
  financial_access?: boolean | null;
  email?: string | null;
  staff_name?: string | null;
};

type ClientOption = {
  id: string;
  name?: string | null;
};

type AdvisoryMatterRow = {
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

type AdvisoryMatterForm = {
  id: string;
  client_id: string;
  matter_no: string;
  title: string;
  matter_type: string;
  matter_type_other: string;
  retainer_type: string;
  status: string;
  responsible_lawyer: string;
  start_date: string;
  end_date: string;
  monthly_retainer_amount: string;
  scope_of_work: string;
  note: string;
};

const emptyForm: AdvisoryMatterForm = {
  id: "",
  client_id: "",
  matter_no: "",
  title: "",
  matter_type: "general_advisory",
  matter_type_other: "",
  retainer_type: "no_retainer",
  status: "active",
  responsible_lawyer: "",
  start_date: "",
  end_date: "",
  monthly_retainer_amount: "",
  scope_of_work: "",
  note: "",
};

const editableRoles: UserRole[] = [
  "admin",
  "partner",
  "lawyer",
  "assistant_lawyer",
];

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

export default function AdvisoryPage() {
  const [profile, setProfile] = useState<CurrentProfile>({
    role: "",
    financial_access: false,
  });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [matters, setMatters] = useState<AdvisoryMatterRow[]>([]);
  const [searchText, setSearchText] = useState("");
  const [form, setForm] = useState<AdvisoryMatterForm>(emptyForm);
  const [isEditing, setIsEditing] = useState(false);
  const [errorText, setErrorText] = useState("");

  const permissions: UserPermissions = useMemo(() => {
    return buildPermissions(profile);
  }, [profile]);

  const canViewAdvisory = permissions.canViewDashboard;
  const canEditAdvisory = editableRoles.includes(permissions.role);
  const canViewAdvisoryFinancials =
    permissions.role === "admin" ||
    permissions.role === "partner" ||
    (profile.email || "").trim().toLowerCase() === "boonyanud2002@gmail.com" ||
    (profile.staff_name || "").trim() === "ทนายแพม";

  const clientNameMap = useMemo(() => {
    return new Map(clients.map((client) => [client.id, client.name || "-"]));
  }, [clients]);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoadingProfile(true);

        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userData.user) {
          setProfile({ role: "", financial_access: false });
          return;
        }

        const { data, error } = await supabase
          .from("user_profiles")
          .select("role, financial_access, email, staff_name")
          .eq("id", userData.user.id)
          .single();

        if (error || !data) {
          setProfile({ role: "", financial_access: false });
          return;
        }

        setProfile({
          role: data.role || "",
          financial_access: data.financial_access === true,
          email: data.email || userData.user.email || "",
          staff_name: data.staff_name || "",
        });
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
  }, []);

  const loadData = useCallback(async () => {
    if (!canViewAdvisory) return;

    try {
      setLoadingData(true);
      setErrorText("");

      const [clientsRes, mattersRes] = await Promise.all([
        supabase.from("clients").select("id, name").order("name"),
        supabase
          .from("advisory_matters")
          .select(
            "id, client_id, matter_no, title, matter_type, retainer_type, status, responsible_lawyer, start_date, end_date, monthly_retainer_amount, scope_of_work, note"
          )
          .order("created_at", { ascending: false }),
      ]);

      if (clientsRes.error) {
        setErrorText(clientsRes.error.message || "Load clients failed");
        return;
      }

      if (mattersRes.error) {
        setErrorText(mattersRes.error.message || "Load advisory matters failed");
        return;
      }

      setClients((clientsRes.data || []) as ClientOption[]);
      setMatters((mattersRes.data || []) as AdvisoryMatterRow[]);
    } finally {
      setLoadingData(false);
    }
  }, [canViewAdvisory]);

  useEffect(() => {
    if (loadingProfile) return;
    loadData();
  }, [loadingProfile, loadData]);

  const filteredMatters = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return matters;

    return matters.filter((matter) =>
      [
        matter.matter_no,
        matter.title,
        clientNameMap.get(matter.client_id || ""),
        matter.responsible_lawyer,
        matter.matter_type,
        renderOptionLabel(matter.matter_type, matterTypeOptions),
        matter.status,
        renderOptionLabel(matter.status, statusOptions),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [clientNameMap, matters, searchText]);

  const resetForm = () => {
    setForm(emptyForm);
    setIsEditing(false);
    setErrorText("");
  };

  const startEdit = (matter: AdvisoryMatterRow) => {
    const isPresetMatterType = matterTypeOptions.some((option) => option.value === matter.matter_type);
    setForm({
      id: matter.id,
      client_id: matter.client_id || "",
      matter_no: matter.matter_no || "",
      title: matter.title || "",
      matter_type: isPresetMatterType ? matter.matter_type || "general_advisory" : "other",
      matter_type_other: isPresetMatterType ? "" : matter.matter_type || "",
      retainer_type: normalizeOptionValue(
        matter.retainer_type,
        retainerTypeOptions
      ),
      status: normalizeOptionValue(matter.status, statusOptions),
      responsible_lawyer: matter.responsible_lawyer || "",
      start_date: matter.start_date || "",
      end_date: matter.end_date || "",
      monthly_retainer_amount:
        matter.monthly_retainer_amount !== null &&
        matter.monthly_retainer_amount !== undefined
          ? String(matter.monthly_retainer_amount)
          : "",
      scope_of_work: matter.scope_of_work || "",
      note: matter.note || "",
    });
    setIsEditing(true);
    setErrorText("");
  };

  const saveMatter = async () => {
    if (!canEditAdvisory) return;

    if (!form.client_id) {
      alert("Client is required");
      return;
    }

    if (!form.title.trim()) {
      alert("Title is required");
      return;
    }

    const monthlyRetainerAmountText = form.monthly_retainer_amount.trim();
    const matterType = form.matter_type === "other" ? form.matter_type_other.trim() : form.matter_type;

    if (!matterType) {
      alert("Custom matter type is required");
      return;
    }

    const monthlyRetainerAmount = monthlyRetainerAmountText
      ? Number(monthlyRetainerAmountText)
      : null;

    if (
      monthlyRetainerAmountText &&
      (monthlyRetainerAmount === null || Number.isNaN(monthlyRetainerAmount))
    ) {
      alert("Monthly retainer amount must be a valid number");
      return;
    }

    const payload: {
      client_id: string;
      title: string;
      matter_type: string;
      retainer_type: string;
      status: string;
      responsible_lawyer: string;
      start_date: string | null;
      end_date: string | null;
      monthly_retainer_amount?: number | null;
      scope_of_work: string;
      note: string;
    } = {
      client_id: form.client_id,
      title: form.title.trim(),
      matter_type: matterType,
      retainer_type: form.retainer_type,
      status: form.status,
      responsible_lawyer: form.responsible_lawyer.trim(),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      scope_of_work: form.scope_of_work.trim(),
      note: form.note.trim(),
    };

    if (canViewAdvisoryFinancials || !isEditing) {
      payload.monthly_retainer_amount = canViewAdvisoryFinancials ? monthlyRetainerAmount : null;
    }

    try {
      setSaving(true);
      setErrorText("");

      if (isEditing) {
        if (!form.id) {
          alert("Missing advisory matter id");
          return;
        }

        const oldData = matters.find((matter) => matter.id === form.id) || null;
        const { data, error } = await supabase
          .from("advisory_matters")
          .update(payload)
          .eq("id", form.id)
          .select("*")
          .maybeSingle();

        if (error || !data) {
          alert(
            "Update advisory matter failed:\n" +
              (error?.message || "No row updated")
          );
          return;
        }

        try {
          await createAuditLog({
            caseId: null,
            tableName: "advisory_matters",
            recordId: data.id,
            action: "update",
            oldData,
            newData: data,
            note: `Update advisory matter: ${data.title || data.id}`,
          });
        } catch (auditError) {
          console.error("CREATE ADVISORY AUDIT LOG FAILED:", auditError);
        }
      } else {
        const { data: generatedMatterNo, error: matterNoError } =
          await supabase.rpc("generate_advisory_matter_no");

        if (matterNoError) {
          alert(
            "Generate advisory matter no failed:\n" +
              (matterNoError.message || "Unknown error")
          );
          return;
        }

        if (!generatedMatterNo) {
          alert("Failed to generate advisory matter no");
          return;
        }

        const { data, error } = await supabase
          .from("advisory_matters")
          .insert([
            {
              ...payload,
              matter_no: generatedMatterNo,
            },
          ])
          .select("*")
          .single();

        if (error || !data) {
          alert(
            "Create advisory matter failed:\n" +
              (error?.message || "No row created")
          );
          return;
        }

        try {
          await createAuditLog({
            caseId: null,
            tableName: "advisory_matters",
            recordId: data.id,
            action: "create",
            oldData: null,
            newData: data,
            note: `Create advisory matter: ${data.title || data.id}`,
          });
        } catch (auditError) {
          console.error("CREATE ADVISORY AUDIT LOG FAILED:", auditError);
        }
      }

      resetForm();
      await loadData();
    } finally {
      setSaving(false);
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

  if (!canViewAdvisory) {
    return (
      <AuthGuard>
        <main style={pageStyle}>
          <AppTopNav
            title="Advisory"
            subtitle="Advisory and retainer matters"
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
          subtitle="Advisory and retainer matters"
          activePage="advisory"
        />

        <section style={panelStyle}>
          <div style={toolbarStyle}>
            <div style={toolbarRowStyle}>
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search matter no, title, client, lawyer, type, status"
                style={inputStyle}
              />
              <Link href="/advisory/reports" style={linkButtonStyle}>
                Reports
              </Link>
            </div>
          </div>
        </section>

        {canEditAdvisory ? (
          <section style={panelStyle}>
            <div style={formTitleStyle}>
              {isEditing ? "Edit advisory matter" : "Create advisory matter"}
            </div>
            <div style={formGridStyle}>
              <SelectField
                label="Client"
                value={form.client_id}
                onChange={(value) => setForm({ ...form, client_id: value })}
                options={[
                  { value: "", label: "Select client" },
                  ...clients.map((client) => ({
                    value: client.id,
                    label: client.name || client.id,
                  })),
                ]}
              />
              {isEditing ? (
                <ReadOnlyField label="Matter no" value={form.matter_no} />
              ) : (
                <ReadOnlyField
                  label="Matter no"
                  value="Auto generated on save"
                />
              )}
              <Field
                label="Title"
                value={form.title}
                onChange={(value) => setForm({ ...form, title: value })}
              />
              <SelectField
                label="Matter type"
                value={form.matter_type}
                onChange={(value) => setForm({ ...form, matter_type: value, matter_type_other: value === "other" ? form.matter_type_other : "" })}
                options={matterTypeOptions}
              />
              {form.matter_type === "other" ? (
                <Field
                  label="Custom matter type"
                  value={form.matter_type_other}
                  onChange={(value) => setForm({ ...form, matter_type_other: value })}
                />
              ) : null}
              <SelectField
                label="Retainer type"
                value={form.retainer_type}
                onChange={(value) => setForm({ ...form, retainer_type: value })}
                options={retainerTypeOptions}
              />
              <SelectField
                label="Status"
                value={form.status}
                onChange={(value) => setForm({ ...form, status: value })}
                options={statusOptions}
              />
              <Field
                label="Responsible lawyer"
                value={form.responsible_lawyer}
                onChange={(value) =>
                  setForm({ ...form, responsible_lawyer: value })
                }
              />
              <Field
                label="Start date"
                value={form.start_date}
                type="date"
                onChange={(value) => setForm({ ...form, start_date: value })}
              />
              <Field
                label="End date"
                value={form.end_date}
                type="date"
                onChange={(value) => setForm({ ...form, end_date: value })}
              />
              {canViewAdvisoryFinancials ? (
                <Field
                  label="Monthly retainer amount"
                  value={form.monthly_retainer_amount}
                  type="number"
                  onChange={(value) =>
                    setForm({ ...form, monthly_retainer_amount: value })
                  }
                />
              ) : null}
              <Field
                label="Scope of work"
                value={form.scope_of_work}
                onChange={(value) => setForm({ ...form, scope_of_work: value })}
              />
              <Field
                label="Note"
                value={form.note}
                onChange={(value) => setForm({ ...form, note: value })}
              />
            </div>
            <div style={buttonRowStyle}>
              <button
                type="button"
                onClick={saveMatter}
                disabled={saving}
                style={primaryButtonStyle}
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                style={secondaryButtonStyle}
              >
                Cancel
              </button>
            </div>
          </section>
        ) : null}

        <section style={panelStyle}>
          {errorText ? <div style={errorBoxStyle}>{errorText}</div> : null}
          {loadingData ? (
            <div style={messageBoxStyle}>Loading advisory matters...</div>
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Matter No</th>
                    <th style={thStyle}>Title</th>
                    <th style={thStyle}>Client</th>
                    <th style={thStyle}>Matter Type</th>
                    <th style={thStyle}>Retainer</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Lawyer</th>
                    <th style={thStyle}>Start</th>
                    <th style={thStyle}>End</th>
                    {canViewAdvisoryFinancials ? <th style={thStyle}>Monthly</th> : null}
                    <th style={thStyle}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMatters.map((matter) => (
                    <tr key={matter.id}>
                      <td style={tdStyle}>{matter.matter_no || "-"}</td>
                      <td style={tdStyle}>{matter.title || "-"}</td>
                      <td style={tdStyle}>
                        {clientNameMap.get(matter.client_id || "") || "-"}
                      </td>
                      <td style={tdStyle}>
                        {matter.matter_type || "-"}
                      </td>
                      <td style={tdStyle}>
                        {renderOptionLabel(
                          matter.retainer_type,
                          retainerTypeOptions
                        )}
                      </td>
                      <td style={tdStyle}>
                        {renderOptionLabel(matter.status, statusOptions)}
                      </td>
                      <td style={tdStyle}>
                        {matter.responsible_lawyer || "-"}
                      </td>
                      <td style={tdStyle}>{matter.start_date || "-"}</td>
                      <td style={tdStyle}>{matter.end_date || "-"}</td>
                      {canViewAdvisoryFinancials ? (
                        <td style={tdStyle}>
                          {formatAmount(matter.monthly_retainer_amount)}
                        </td>
                      ) : null}
                      <td style={tdStyle}>
                        <div style={actionWrapStyle}>
                          <Link
                            href={`/advisory/${matter.id}`}
                            style={linkButtonStyle}
                          >
                            Open
                          </Link>
                          {canEditAdvisory ? (
                          <button
                            type="button"
                            onClick={() => startEdit(matter)}
                            style={smallButtonStyle}
                          >
                            Edit
                          </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredMatters.length === 0 ? (
                <div style={messageBoxStyle}>No advisory matters found.</div>
              ) : null}
            </div>
          )}
        </section>
      </main>
    </AuthGuard>
  );
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
    <label style={labelStyle}>
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

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label style={labelStyle}>
      {label}
      <input value={value || "-"} disabled style={disabledInputStyle} />
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
    <label style={labelStyle}>
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

function normalizeOptionValue(
  value: string | null | undefined,
  options: { value: string; label: string }[]
) {
  if (options.some((option) => option.value === value)) return value || "";
  return options[0]?.value || "";
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
  marginBottom: 16,
  border: "1px solid #dddddd",
  borderRadius: 12,
  background: "#ffffff",
  overflow: "hidden",
};

const toolbarStyle: React.CSSProperties = {
  padding: 16,
};

const toolbarRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const formTitleStyle: React.CSSProperties = {
  padding: "16px 16px 0 16px",
  fontWeight: 900,
};

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 12,
  padding: 16,
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
};

const disabledInputStyle: React.CSSProperties = {
  ...inputStyle,
  background: "#f3f4f6",
  color: "#555555",
};

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  padding: "0 16px 16px 16px",
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

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 1180,
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid #dddddd",
  background: "#f3f4f6",
  textAlign: "left",
  fontSize: 13,
  fontWeight: 800,
};

const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid #eeeeee",
  fontSize: 14,
  verticalAlign: "top",
};

const smallButtonStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid #cccccc",
  borderRadius: 8,
  background: "#ffffff",
  color: "#111111",
  cursor: "pointer",
  fontWeight: 800,
};

const linkButtonStyle: React.CSSProperties = {
  ...smallButtonStyle,
  display: "inline-block",
  textDecoration: "none",
};

const actionWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
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
  margin: 16,
  padding: 14,
  border: "1px solid #f0c4c4",
  borderRadius: 10,
  background: "#fff5f5",
  color: "#a40000",
  fontWeight: 700,
};
