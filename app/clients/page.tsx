"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ClientFormFields, { emptyForm, clientTypeOptions, statusOptions, type ClientFormValues } from "./ClientFormFields";
import ClientEditForm from "./ClientEditForm";
import ClientModal from "./ClientModal";
import { CustomerTaxIdentityEditor } from "./CustomerTaxIdentityEditor";
import { useI18n } from "../../lib/i18n/provider";
import AuthGuard from "../components/AuthGuard";
import AppTopNav from "../components/AppTopNav";
import { createAuditLog } from "../../lib/auditLog";
import { buildPermissions } from "../../lib/permissions";
import { supabase } from "../../lib/supabase";
import type { UserPermissions, UserRole } from "../../lib/permissions";

type CurrentProfile = {
  role?: UserRole | string | null;
  financial_access?: boolean | null;
  can_view_finance_tax_invoices?: boolean;
  can_manage_finance_tax_invoices?: boolean;
  can_issue_finance_tax_invoices?: boolean;
};

type ClientRow = {
  id: string;
  client_type?: string | null;
  name?: string | null;
  tax_id?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  line_id?: string | null;
  address?: string | null;
  status?: string | null;
  note?: string | null;
};

const editableRoles: UserRole[] = [
  "admin",
  "partner",
  "lawyer",
  "assistant_lawyer",
];

export default function ClientsPage() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<CurrentProfile>({
    role: "",
    financial_access: false,
  });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingClients, setLoadingClients] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [searchText, setSearchText] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [form, setForm] = useState<ClientFormValues>(emptyForm);
  const [edit, setEdit] = useState<{ client: ClientRow; baseline: ClientFormValues; values: ClientFormValues } | null>(null);
  const [editError, setEditError] = useState("");
  const [taxClient, setTaxClient] = useState<ClientRow | null>(null);
  const [taxState, setTaxState] = useState({ dirty: false, busy: false });
  const saveLock = useRef(false);
  const [errorText, setErrorText] = useState("");
  const [openActionMenuId, setOpenActionMenuId] = useState("");

  const permissions: UserPermissions = useMemo(() => {
    return buildPermissions(profile);
  }, [profile]);

  const canViewClients = permissions.canViewDashboard;
  const canEditClients = editableRoles.includes(permissions.role);
  const isAdmin = permissions.role === "admin";

  useEffect(() => {
    if (!openActionMenuId) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest("[data-action-menu-root='true']")) setOpenActionMenuId("");
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenActionMenuId("");
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openActionMenuId]);

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
          .select("role, financial_access, can_view_finance_tax_invoices, can_manage_finance_tax_invoices, can_issue_finance_tax_invoices")
          .eq("id", userData.user.id)
          .single();

        if (error || !data) {
          setProfile({ role: "", financial_access: false });
          return;
        }

        setProfile({
          role: data.role || "",
          financial_access: data.financial_access === true,
          can_view_finance_tax_invoices: data.can_view_finance_tax_invoices === true,
          can_manage_finance_tax_invoices: data.can_manage_finance_tax_invoices === true,
          can_issue_finance_tax_invoices: data.can_issue_finance_tax_invoices === true,
        });
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
  }, []);

  const loadClients = useCallback(async () => {
    if (!canViewClients) return;

    try {
      setLoadingClients(true);
      setErrorText("");

      const { data, error } = await supabase
        .from("clients")
        .select(
          "id, client_type, name, tax_id, contact_name, phone, email, line_id, address, status, note"
        )
        .order("name", { ascending: true });

      if (error) {
        setErrorText(error.message || "Load clients failed");
        return;
      }

      setClients((data || []) as ClientRow[]);
    } finally {
      setLoadingClients(false);
    }
  }, [canViewClients]);

  useEffect(() => {
    if (loadingProfile) return;
    loadClients();
  }, [loadingProfile, loadClients]);

  const filteredClients = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    const visibleClients = clients.filter((client) =>
      showDeleted ? isClientDeleted(client) : !isClientDeleted(client)
    );
    if (!keyword) return visibleClients;

    return visibleClients.filter((client) =>
      [
        client.name,
        client.contact_name,
        client.phone,
        client.email,
        client.tax_id,
        client.client_type,
        renderClientType(client.client_type),
        client.status,
        renderClientStatus(client.status),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [clients, searchText, showDeleted]);

  const resetForm = () => {
    setForm(emptyForm);
    setErrorText("");
  };

  const loadDuplicateTaxIdClient = async (
    taxId: string,
    currentClientId?: string,
    editing = false
  ) => {
    const normalizedTaxId = normalizeTaxId(taxId);
    if (!normalizedTaxId) return null;

    const { data, error } = await supabase
      .from("clients")
      .select("id, client_type, name, tax_id, contact_name, phone, email, line_id, address, status, note")
      .neq("tax_id", "");

    if (error) {
      if (editing) setEditError("client.edit.error.duplicateCheck");
      else alert("Cannot check duplicate Tax ID. Please try again.");
      return "error";
    }

    return (
      ((data || []) as ClientRow[]).find((client) => {
        if (currentClientId && client.id === currentClientId) return false;
        return normalizeTaxId(client.tax_id || "") === normalizedTaxId;
      }) || null
    );
  };

  const validateClientDuplicateBeforeSave = async (payload: {
    name: string;
    tax_id: string;
  }, values: ClientFormValues, isEditing: boolean) => {
    const currentClientId = isEditing ? values.id : "";
    const normalizedTaxId = normalizeTaxId(payload.tax_id);

    if (normalizedTaxId) {
      const duplicate = await loadDuplicateTaxIdClient(
        payload.tax_id,
        currentClientId,
        isEditing
      );
      if (duplicate === "error") return false;

      if (duplicate && isClientDeleted(duplicate)) {
        if (isEditing) setEditError("client.edit.error.deletedDuplicate");
        else alert("ลูกความรายนี้เคยถูกลบไว้ กรุณา Restore แทนการสร้างใหม่");
        return false;
      }

      if (duplicate) {
        if (isEditing) setEditError("client.edit.error.duplicate");
        else alert("มีลูกความที่ใช้ Tax ID นี้อยู่แล้ว กรุณาตรวจสอบก่อนสร้างใหม่");
        return false;
      }

      return true;
    }

    if (!isEditing) {
      const normalizedName = normalizeClientName(payload.name);
      const similarClient = clients.find((client) => {
        if (isClientDeleted(client)) return false;
        return normalizeClientName(client.name || "") === normalizedName;
      });

      if (similarClient) {
        return window.confirm(
          `พบชื่อลูกความคล้ายกันอยู่แล้ว: ${similarClient.name || "-"}\n\nต้องการสร้างลูกความใหม่ต่อหรือไม่?`
        );
      }
    }

    return true;
  };

  const startEdit = (client: ClientRow) => {
    setOpenActionMenuId("");
    const values = {
      id: client.id,
      client_type: normalizeOptionValue(client.client_type, clientTypeOptions),
      name: client.name || "",
      tax_id: client.tax_id || "",
      contact_name: client.contact_name || "",
      phone: client.phone || "",
      email: client.email || "",
      line_id: client.line_id || "",
      address: client.address || "",
      status: normalizeOptionValue(client.status, statusOptions),
      note: client.note || "",
    };
    setTaxClient(null);
    setEdit({ client, baseline: values, values });
    setEditError("");
  };

  const saveClient = async (form: ClientFormValues, isEditing: boolean) => {
    if (!canEditClients || saveLock.current) return;

    const payload = {
      client_type: form.client_type.trim() || "limited_company",
      name: form.name.trim(),
      tax_id: form.tax_id.trim(),
      contact_name: form.contact_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      line_id: form.line_id.trim(),
      address: form.address.trim(),
      status: form.status.trim() || "active",
      note: form.note.trim(),
    };

    if (!payload.name) {
      if (isEditing) setEditError("client.edit.error.name");
      else alert("Client name is required");
      return;
    }

    saveLock.current = true;
    setSaving(true);
    try {
      setErrorText("");
      setEditError("");
      const canSave = await validateClientDuplicateBeforeSave(payload, form, isEditing);
      if (!canSave) return;

      if (isEditing) {
        const editingClient = { id: form.id };

        if (!editingClient.id) {
          setEditError("client.edit.error.missingId");
          return;
        }

        const oldData =
          clients.find((client) => client.id === editingClient.id) || null;
        const { data, error } = await supabase
          .from("clients")
          .update(payload)
          .eq("id", editingClient.id)
          .select(
            "id, client_type, name, tax_id, contact_name, phone, email, line_id, address, status, note, created_at, updated_at"
          )
          .maybeSingle();

        if (error) {
          setEditError(renderClientSaveErrorMessage(error, "") ? "client.edit.error.duplicate" : "client.edit.error.save");
          return;
        }

        if (!data) {
          setEditError("client.edit.error.noUpdate");
          return;
        }

        try {
          await createAuditLog({
            caseId: null,
            tableName: "clients",
            recordId: data.id,
            action: "update",
            oldData,
            newData: data,
            note: `Update client: ${data.name || data.id}`,
          });
        } catch (auditError) {
          console.error("CREATE CLIENT AUDIT LOG FAILED:", auditError);
        }

        setClients(previous => previous.map(client => client.id === data.id ? data as ClientRow : client));
        setEdit(null);
        return;
      } else {
        const { data, error } = await supabase
          .from("clients")
          .insert([payload])
          .select("*")
          .single();

        if (error || !data) {
          alert(renderClientSaveErrorMessage(error, "Create client failed."));
          return;
        }

        try {
          await createAuditLog({
            caseId: null,
            tableName: "clients",
            recordId: data.id,
            action: "create",
            oldData: null,
            newData: data,
            note: `Create client: ${data.name || data.id}`,
          });
        } catch (auditError) {
          console.error("CREATE CLIENT AUDIT LOG FAILED:", auditError);
        }
      }

      resetForm();
      await loadClients();
    } catch {
      if (isEditing) setEditError("client.edit.error.save");
      else alert("Create client failed.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const softDeleteClient = async (client: ClientRow) => {
    if (!isAdmin || isClientDeleted(client)) return;

    try {
      setSaving(true);
      setErrorText("");

      const [{ count: caseCount, error: caseError }, { count: advisoryCount, error: advisoryError }] =
        await Promise.all([
          supabase
            .from("cases")
            .select("id", { count: "exact", head: true })
            .eq("client_id", client.id),
          supabase
            .from("advisory_matters")
            .select("id", { count: "exact", head: true })
            .eq("client_id", client.id),
        ]);

      if (caseError || advisoryError) {
        alert("Cannot verify linked cases/advisory matters. Please try again.");
        return;
      }

      const linkedCount = (caseCount || 0) + (advisoryCount || 0);
      const confirmed = window.confirm(
        linkedCount > 0
          ? `Confirm soft delete this client?\n\nThis client is linked to ${caseCount || 0} case(s) and ${advisoryCount || 0} advisory matter(s). Those records will not be deleted; the client will only be hidden from the normal client list.`
          : "Confirm soft delete this client?"
      );

      if (!confirmed) return;

      const oldData = client;
      const { data, error } = await supabase
        .from("clients")
        .update({ status: "deleted" })
        .eq("id", client.id)
        .select(
          "id, client_type, name, tax_id, contact_name, phone, email, line_id, address, status, note"
        )
        .maybeSingle();

      if (error || !data) {
        alert("Soft delete client failed. Please try again.");
        return;
      }

      try {
        await createAuditLog({
          caseId: null,
          tableName: "clients",
          recordId: data.id,
          action: "soft_delete",
          oldData,
          newData: data,
          note: `Soft delete client: ${data.name || data.id}`,
        });
      } catch (auditError) {
        console.error("CREATE CLIENT AUDIT LOG FAILED:", auditError);
      }

      resetForm();
      await loadClients();
    } finally {
      setSaving(false);
    }
  };

  const restoreClient = async (client: ClientRow) => {
    if (!isAdmin || !isClientDeleted(client)) return;

    const confirmed = window.confirm("Restore this client?");
    if (!confirmed) return;

    try {
      setSaving(true);
      setErrorText("");

      const duplicate = await loadDuplicateTaxIdClient(client.tax_id || "", client.id);
      if (duplicate === "error") return;

      if (duplicate && !isClientDeleted(duplicate)) {
        alert(
          "ไม่สามารถ Restore ได้ เพราะมีลูกความ active ที่ใช้ Tax ID นี้อยู่แล้ว"
        );
        return;
      }

      const oldData = client;
      const { data, error } = await supabase
        .from("clients")
        .update({ status: "active" })
        .eq("id", client.id)
        .select(
          "id, client_type, name, tax_id, contact_name, phone, email, line_id, address, status, note"
        )
        .maybeSingle();

      if (error || !data) {
        alert("Restore client failed. Please try again.");
        return;
      }

      try {
        await createAuditLog({
          caseId: null,
          tableName: "clients",
          recordId: data.id,
          action: "restore",
          oldData,
          newData: data,
          note: `Restore client: ${data.name || data.id}`,
        });
      } catch (auditError) {
        console.error("CREATE CLIENT AUDIT LOG FAILED:", auditError);
      }

      resetForm();
      await loadClients();
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

  if (!canViewClients) {
    return (
      <AuthGuard>
        <main style={pageStyle}>
          <AppTopNav
            title="Clients"
            subtitle="Client and company management"
            activePage="clients"
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
          title="Clients"
          subtitle="Client and company management"
          activePage="clients"
        />

        <section style={panelStyle}>
          <div style={toolbarStyle}>
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search name, contact, phone, email, tax id"
              style={inputStyle}
            />
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setShowDeleted((value) => !value)}
                style={showDeleted ? primaryButtonStyle : secondaryButtonStyle}
              >
                {showDeleted ? "Show active clients" : "Show deleted clients"}
              </button>
            ) : null}
          </div>
        </section>

        {canEditClients ? (
          <section style={panelStyle}>
            <div style={formTitleStyle}>Create client</div>
            <ClientFormFields value={form} onChange={setForm} />
            <div style={buttonRowStyle}>
              <button
                type="button"
                onClick={() => void saveClient(form, false)}
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
          {loadingClients ? (
            <div style={messageBoxStyle}>Loading clients...</div>
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Contact</th>
                    <th style={thStyle}>Phone</th>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Line ID</th>
                    <th style={thStyle}>Tax ID</th>
                    <th style={thStyle}>Status</th>
                    {canEditClients || isAdmin || permissions.canViewFinanceTaxInvoices ? <th style={{ ...thStyle, ...actionColumnStyle }}>Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((client) => (
                    <tr key={client.id} style={isClientDeleted(client) ? deletedRowStyle : undefined}>
                      <td style={tdStyle}>
                        <div style={clientNameTextStyle}>{client.name || "-"}</div>
                        {client.address ? (
                          <div style={clientAddressTextStyle}>{client.address}</div>
                        ) : null}
                        {isClientDeleted(client) ? (
                          <div style={deletedTextStyle}>Deleted</div>
                        ) : null}
                      </td>
                      <td style={tdStyle}>
                        {renderClientType(client.client_type)}
                      </td>
                      <td style={tdStyle}>{client.contact_name || "-"}</td>
                      <td style={tdStyle}>{client.phone || "-"}</td>
                      <td style={tdStyle}>{client.email || "-"}</td>
                      <td style={tdStyle}>{client.line_id || "-"}</td>
                      <td style={tdStyle}>{client.tax_id || "-"}</td>
                      <td style={tdStyle}>
                        {renderClientStatus(client.status)}
                      </td>
                      {canEditClients || isAdmin || permissions.canViewFinanceTaxInvoices ? (
                        <td style={{ ...tdStyle, ...actionColumnStyle }}>
                          <div style={actionButtonRowStyle}>
                            {permissions.canViewFinanceTaxInvoices && !isClientDeleted(client) ? <button type="button" onClick={() => { setOpenActionMenuId(""); setTaxState({ dirty: false, busy: false }); setTaxClient(client); }} style={smallButtonStyle}>{t("client.tax.title")}</button> : null}
                            {canEditClients && !isClientDeleted(client) ? (
                              <button
                                type="button"
                                onClick={() => startEdit(client)}
                                style={smallButtonStyle}
                              >
                                Edit
                              </button>
                            ) : null}
                            {isAdmin ? (
                              <details data-action-menu-root="true" open={openActionMenuId === client.id} style={moreMenuStyle}>
                                <summary
                                  aria-label="More actions"
                                  title="More actions"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    setOpenActionMenuId((current) => current === client.id ? "" : client.id);
                                  }}
                                  style={moreButtonStyle}
                                >
                                  ...
                                </summary>
                                <div style={moreMenuContentStyle}>
                                  {!isClientDeleted(client) ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenActionMenuId("");
                                        softDeleteClient(client);
                                      }}
                                      disabled={saving}
                                      style={dangerMenuButtonStyle}
                                    >
                                      Delete
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenActionMenuId("");
                                        restoreClient(client);
                                      }}
                                      disabled={saving}
                                      style={menuButtonStyle}
                                    >
                                      Restore
                                    </button>
                                  )}
                                </div>
                              </details>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredClients.length === 0 ? (
                <div style={messageBoxStyle}>No clients found.</div>
              ) : null}
            </div>
          )}
        </section>
      </main>
      {edit ? <ClientModal titleKey="client.edit.title" clientName={edit.client.name || "-"}
        dirty={JSON.stringify(edit.values) !== JSON.stringify(edit.baseline)} busy={saving} onClose={() => setEdit(null)}>
        {requestLeave => <ClientEditForm value={edit.values} onChange={values => { setEdit({ ...edit, values }); setEditError(""); }}
          onSave={() => void saveClient(edit.values, true)} onCancel={() => requestLeave(() => setEdit(null))}
          busy={saving} dirty={JSON.stringify(edit.values) !== JSON.stringify(edit.baseline)} error={editError} />}
      </ClientModal> : null}
      {taxClient ? <ClientModal titleKey="client.tax.title" clientName={taxClient.name || "-"}
        dirty={taxState.dirty} busy={taxState.busy} onClose={() => setTaxClient(null)}>
        {requestLeave => <CustomerTaxIdentityEditor key={taxClient.id} clientId={taxClient.id} embedded onStateChange={setTaxState}
          onEditClient={canEditClients ? () => requestLeave(() => startEdit(taxClient)) : undefined} />}
      </ClientModal> : null}
    </AuthGuard>
  );
}

function normalizeOptionValue(
  value: string | null | undefined,
  options: { value: string; label: string }[]
) {
  if (options.some((option) => option.value === value)) return value || "";
  return options[0]?.value || "";
}

function renderClientType(value?: string | null) {
  return renderOptionLabel(value, clientTypeOptions);
}

function renderClientStatus(value?: string | null) {
  return renderOptionLabel(value, statusOptions);
}

function isClientDeleted(client: ClientRow) {
  return (client.status || "").trim().toLowerCase() === "deleted";
}

function normalizeTaxId(value: string | null | undefined) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeClientName(value: string | null | undefined) {
  return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function renderClientSaveErrorMessage(
  error: { code?: string; message?: string } | null | undefined,
  fallback: string
) {
  if (
    error?.code === "23505" ||
    (error?.message || "").toLowerCase().includes("duplicate") ||
    (error?.message || "").includes("uq_clients_active_normalized_tax_id")
  ) {
    return "ไม่สามารถสร้างลูกความได้ เพราะ Tax ID นี้มีอยู่ในระบบแล้ว";
  }

  return fallback;
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
  marginBottom: 16,
  border: "1px solid #dddddd",
  borderRadius: 12,
  background: "#ffffff",
  overflow: "hidden",
};

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
  padding: 16,
};

const formTitleStyle: React.CSSProperties = {
  padding: "16px 16px 0 16px",
  fontWeight: 900,
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
  minWidth: 980,
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

const clientNameTextStyle: React.CSSProperties = {
  fontWeight: 800,
};

const clientAddressTextStyle: React.CSSProperties = {
  marginTop: 4,
  color: "#666666",
  fontSize: 12,
  lineHeight: 1.4,
  maxWidth: 320,
  whiteSpace: "normal",
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

const dangerButtonStyle: React.CSSProperties = {
  ...smallButtonStyle,
  border: "1px solid #f0c4c4",
  color: "#a40000",
  background: "#fff5f5",
};

const actionButtonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "nowrap",
  alignItems: "center",
};

const actionColumnStyle: React.CSSProperties = {
  minWidth: 148,
  whiteSpace: "nowrap",
};

const moreMenuStyle: React.CSSProperties = {
  position: "relative",
};

const moreButtonStyle: React.CSSProperties = {
  ...smallButtonStyle,
  listStyle: "none",
  padding: "8px 11px",
};

const moreMenuContentStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  right: 0,
  zIndex: 20,
  display: "grid",
  gap: 4,
  minWidth: 132,
  padding: 6,
  border: "1px solid #dddddd",
  borderRadius: 8,
  background: "#ffffff",
  boxShadow: "0 10px 20px rgba(15, 23, 42, 0.12)",
};

const menuButtonStyle: React.CSSProperties = {
  ...smallButtonStyle,
  textAlign: "left",
};

const dangerMenuButtonStyle: React.CSSProperties = {
  ...dangerButtonStyle,
  textAlign: "left",
};

const deletedRowStyle: React.CSSProperties = {
  background: "#fff7f7",
};

const deletedTextStyle: React.CSSProperties = {
  marginTop: 4,
  color: "#a40000",
  fontSize: 12,
  fontWeight: 900,
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
