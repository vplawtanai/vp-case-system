"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import AuthGuard from "../../components/AuthGuard";
import AppTopNav from "../../components/AppTopNav";
import { buildPermissions } from "../../../lib/permissions";
import type { UserPermissions, UserRole } from "../../../lib/permissions";
import { supabase } from "../../../lib/supabase";

type Profile = {
  role?: UserRole | string | null;
  financial_access?: boolean | null;
  full_name?: string | null;
  staff_name?: string | null;
  can_submit_office_work_log?: boolean | null;
  can_view_own_office_work_logs?: boolean | null;
  can_view_all_office_work_logs?: boolean | null;
  can_edit_office_work_logs?: boolean | null;
  can_void_office_work_logs?: boolean | null;
};

type OfficeWorkLogRow = {
  id: string;
  work_date: string;
  staff_user_id: string | null;
  staff_name: string | null;
  work_scope: WorkScope | string;
  work_type: string | null;
  work_other: string | null;
  minutes: number | string | null;
  description: string | null;
  note: string | null;
  related_client_id: string | null;
  related_case_id: number | string | null;
  related_advisory_matter_id: string | null;
  business_development_stage: string | null;
  status: "active" | "voided" | string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_by_user_id: string | null;
  created_by_email: string | null;
  created_by_name: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type UserProfileRow = { id: string; full_name: string | null; staff_name: string | null; email: string | null };
type ClientRow = { id: string; name: string | null };
type CaseRow = { id: number; file_no: string | null; title: string | null; client_name: string | null };
type MatterRow = { id: string; matter_no: string | null; title: string | null };
type WorkScope = "office_work" | "business_development" | "internal_support" | "other";

type OfficeWorkForm = {
  id: string;
  work_date: string;
  staff_user_id: string;
  staff_name: string;
  work_scope: WorkScope;
  work_type: string;
  work_other: string;
  hours: string;
  minutes: string;
  description: string;
  note: string;
  related_client_id: string;
  related_case_id: string;
  related_advisory_matter_id: string;
  business_development_stage: string;
};

const workTypeOptions: Record<WorkScope, string[]> = {
  office_work: [
    "ธุรการสำนักงาน",
    "จัดเอกสาร / สแกน / อัปโหลด",
    "ทำความสะอาด / จัดพื้นที่",
    "ประสานงานทั่วไป",
    "บันทึกข้อมูลเข้าระบบ",
    "จัดซื้อ / ดูแลอุปกรณ์",
    "อื่น ๆ",
  ],
  business_development: [
    "พบลูกค้าใหม่",
    "โทรติดตามลูกค้า",
    "เตรียมข้อเสนอ",
    "ประชุมก่อนรับงาน",
    "ลงพื้นที่",
    "ทำคอนเทนต์ / การตลาด",
    "ติดตาม lead",
    "อื่น ๆ",
  ],
  internal_support: [
    "ช่วยงาน Finance",
    "ช่วยงานระบบคดี",
    "ตรวจข้อมูลในระบบ",
    "เตรียมรายงาน",
    "ประสานงานภายใน",
    "อื่น ๆ",
  ],
  other: ["อื่น ๆ"],
};

const businessDevelopmentStages = ["none", "lead", "contacted", "meeting", "proposal", "follow_up", "converted", "lost"];

const emptyForm: OfficeWorkForm = {
  id: "",
  work_date: getDateKey(new Date()),
  staff_user_id: "",
  staff_name: "",
  work_scope: "office_work",
  work_type: "ธุรการสำนักงาน",
  work_other: "",
  hours: "0",
  minutes: "0",
  description: "",
  note: "",
  related_client_id: "",
  related_case_id: "",
  related_advisory_matter_id: "",
  business_development_stage: "none",
};

export default function OfficeWorkPage() {
  const [profile, setProfile] = useState<Profile>({ role: "", financial_access: false });
  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<OfficeWorkLogRow[]>([]);
  const [users, setUsers] = useState<UserProfileRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [matters, setMatters] = useState<MatterRow[]>([]);
  const [form, setForm] = useState<OfficeWorkForm>(emptyForm);
  const [isEditing, setIsEditing] = useState(false);
  const [monthFilter, setMonthFilter] = useState(getMonthKey(new Date()));
  const [staffFilter, setStaffFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [errorText, setErrorText] = useState("");

  const permissions: UserPermissions = useMemo(() => buildPermissions(profile), [profile]);
  const actorName = profile.full_name || profile.staff_name || userEmail;

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoadingProfile(true);
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) return;

        setUserId(userData.user.id);
        setUserEmail(userData.user.email || "");

        const { data } = await supabase
          .from("user_profiles")
          .select("role, financial_access, full_name, staff_name, can_submit_office_work_log, can_view_own_office_work_logs, can_view_all_office_work_logs, can_edit_office_work_logs, can_void_office_work_logs")
          .eq("id", userData.user.id)
          .single();

        const profileData = {
          role: data?.role || "",
          financial_access: data?.financial_access === true,
          full_name: data?.full_name || "",
          staff_name: data?.staff_name || "",
          can_submit_office_work_log: data?.can_submit_office_work_log === true,
          can_view_own_office_work_logs: data?.can_view_own_office_work_logs === true,
          can_view_all_office_work_logs: data?.can_view_all_office_work_logs === true,
          can_edit_office_work_logs: data?.can_edit_office_work_logs === true,
          can_void_office_work_logs: data?.can_void_office_work_logs === true,
        };

        setProfile(profileData);
        setForm((current) => ({
          ...current,
          staff_user_id: userData.user.id,
          staff_name: data?.staff_name || data?.full_name || userData.user.email || "",
        }));
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
  }, []);

  const loadData = useCallback(async () => {
    if (!permissions.canAccessOfficeWorkLogs || !userId) return;

    try {
      setLoading(true);
      setErrorText("");

      let logQuery = supabase.from("office_work_logs").select("*").order("work_date", { ascending: false }).order("created_at", { ascending: false });
      if (!permissions.canViewAllOfficeWorkLogs) {
        logQuery = logQuery.or(`created_by_user_id.eq.${userId},staff_user_id.eq.${userId}`);
      }

      const [logsRes, usersRes, clientsRes, casesRes, mattersRes] = await Promise.all([
        logQuery,
        supabase.from("user_profiles").select("id, full_name, staff_name, email").eq("active", true).order("full_name", { ascending: true }),
        supabase.from("clients").select("id, name").order("name", { ascending: true }),
        supabase.from("cases").select("id, file_no, title, client_name").order("id", { ascending: false }),
        supabase.from("advisory_matters").select("id, matter_no, title").order("created_at", { ascending: false }),
      ]);

      if (logsRes.error) {
        setErrorText(logsRes.error.message);
        return;
      }

      setRows((logsRes.data || []) as OfficeWorkLogRow[]);
      setUsers(((usersRes.data || []) as UserProfileRow[]).filter(isRealUserProfile));
      setClients((clientsRes.data || []) as ClientRow[]);
      setCases((casesRes.data || []) as CaseRow[]);
      setMatters((mattersRes.data || []) as MatterRow[]);
    } finally {
      setLoading(false);
    }
  }, [permissions.canAccessOfficeWorkLogs, permissions.canViewAllOfficeWorkLogs, userId]);

  useEffect(() => {
    if (loadingProfile) return;
    loadData();
  }, [loadingProfile, loadData]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (monthFilter && !String(row.work_date || "").startsWith(monthFilter)) return false;
      if (staffFilter !== "all" && row.staff_user_id !== staffFilter && row.staff_name !== staffFilter) return false;
      if (scopeFilter !== "all" && row.work_scope !== scopeFilter) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      return true;
    });
  }, [monthFilter, rows, scopeFilter, staffFilter, statusFilter]);

  const summary = useMemo(() => {
    const activeRows = filteredRows.filter((row) => row.status === "active");
    const byStaff = new Map<string, number>();
    const byScope = new Map<string, number>();
    const byType = new Map<string, number>();
    let totalMinutes = 0;
    let businessMinutes = 0;

    activeRows.forEach((row) => {
      const minutes = toMinutes(row.minutes);
      const staff = row.staff_name || "Unknown";
      const scope = renderScope(row.work_scope);
      const type = renderWorkType(row);
      totalMinutes += minutes;
      if (row.work_scope === "business_development") businessMinutes += minutes;
      byStaff.set(staff, (byStaff.get(staff) || 0) + minutes);
      byScope.set(scope, (byScope.get(scope) || 0) + minutes);
      byType.set(type, (byType.get(type) || 0) + minutes);
    });

    return {
      totalMinutes,
      businessMinutes,
      byStaff: mapToSortedRows(byStaff),
      byScope: mapToSortedRows(byScope),
      byType: mapToSortedRows(byType),
    };
  }, [filteredRows]);

  const updateScope = (scope: WorkScope) => {
    setForm({
      ...form,
      work_scope: scope,
      work_type: workTypeOptions[scope][0],
      work_other: "",
      business_development_stage: scope === "business_development" ? form.business_development_stage : "none",
    });
  };

  const updateStaffUser = (staffUserId: string) => {
    const selectedUser = users.find((user) => user.id === staffUserId);
    setForm({
      ...form,
      staff_user_id: staffUserId,
      staff_name: selectedUser ? renderUserLabel(selectedUser) : "",
    });
  };

  const resetForm = () => {
    setForm({
      ...emptyForm,
      staff_user_id: userId,
      staff_name: profile.staff_name || profile.full_name || userEmail,
    });
    setIsEditing(false);
  };

  const saveLog = async () => {
    if (!permissions.canSubmitOfficeWorkLog && !isEditing) return;
    if (!permissions.canEditOfficeWorkLogs && isEditing) return;
    if (saving) return;

    const totalMinutes = parseWholeNumber(form.hours) * 60 + parseWholeNumber(form.minutes);
    const workType = form.work_type === "อื่น ๆ" ? form.work_other.trim() : form.work_type;
    const staffName = form.staff_name.trim();

    if (!form.work_date) {
      alert("Please select work date.");
      return;
    }
    if (!staffName) {
      alert("Please select staff.");
      return;
    }
    if (!workType) {
      alert("Please enter work type.");
      return;
    }
    if (totalMinutes <= 0) {
      alert("Please enter time.");
      return;
    }

    try {
      setSaving(true);
      const now = new Date().toISOString();
      const payload = {
        work_date: form.work_date,
        staff_user_id: form.staff_user_id || null,
        staff_name: staffName,
        work_scope: form.work_scope,
        work_type: workType,
        work_other: form.work_type === "อื่น ๆ" ? form.work_other.trim() || null : null,
        minutes: totalMinutes,
        description: form.description.trim() || null,
        note: form.note.trim() || null,
        related_client_id: form.related_client_id || null,
        related_case_id: form.related_case_id ? Number(form.related_case_id) : null,
        related_advisory_matter_id: form.related_advisory_matter_id || null,
        business_development_stage: form.work_scope === "business_development" ? form.business_development_stage || "none" : "none",
        updated_at: now,
      };

      const result = isEditing
        ? await supabase.from("office_work_logs").update(payload).eq("id", form.id).eq("status", "active")
        : await supabase.from("office_work_logs").insert({
            ...payload,
            status: "active",
            created_by_user_id: userId || null,
            created_by_email: userEmail || null,
            created_by_name: actorName || null,
          });

      if (result.error) {
        alert(result.error.message);
        return;
      }

      await loadData();
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: OfficeWorkLogRow) => {
    if (!permissions.canEditOfficeWorkLogs || row.status !== "active") return;
    const minutes = toMinutes(row.minutes);
    const typeOptions = workTypeOptions[normalizeScope(row.work_scope)];
    const isPresetType = typeOptions.includes(row.work_type || "");

    setForm({
      id: row.id,
      work_date: row.work_date || getDateKey(new Date()),
      staff_user_id: row.staff_user_id || "",
      staff_name: row.staff_name || "",
      work_scope: normalizeScope(row.work_scope),
      work_type: isPresetType ? row.work_type || typeOptions[0] : "อื่น ๆ",
      work_other: isPresetType ? row.work_other || "" : row.work_type || row.work_other || "",
      hours: String(Math.floor(minutes / 60)),
      minutes: String(minutes % 60),
      description: row.description || "",
      note: row.note || "",
      related_client_id: row.related_client_id || "",
      related_case_id: row.related_case_id ? String(row.related_case_id) : "",
      related_advisory_matter_id: row.related_advisory_matter_id || "",
      business_development_stage: row.business_development_stage || "none",
    });
    setIsEditing(true);
  };

  const voidLog = async (row: OfficeWorkLogRow) => {
    if (!permissions.canVoidOfficeWorkLogs || row.status !== "active") return;
    const reason = window.prompt("Void reason");
    if (!reason?.trim()) return;

    const { error } = await supabase
      .from("office_work_logs")
      .update({
        status: "voided",
        voided_at: new Date().toISOString(),
        voided_by: actorName || userEmail || null,
        void_reason: reason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "active");

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
  };

  if (loadingProfile) {
    return (
      <AuthGuard>
        <main style={pageStyle}>Loading...</main>
      </AuthGuard>
    );
  }

  if (!permissions.canAccessOfficeWorkLogs) {
    return (
      <AuthGuard>
        <main style={pageStyle}>
          <AppTopNav title="Office & Business Work Log" activePage="officeWork" />
          <section style={noAccessStyle}>No access.</section>
        </main>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <main style={pageStyle}>
        <AppTopNav
          title="Office & Business Work Log"
          subtitle="Office, internal support, and business development work not tied directly to a case or advisory matter."
          activePage="officeWork"
        />

        {errorText ? <section style={errorStyle}>{errorText}</section> : null}

        <section style={summaryGridStyle}>
          <SummaryCard label="Total hours this month" value={formatHours(summary.totalMinutes)} />
          <SummaryCard label="Business development" value={formatHours(summary.businessMinutes)} />
          <SummaryCard label="Active logs" value={String(filteredRows.filter((row) => row.status === "active").length)} />
          <SummaryCard label="Visible logs" value={String(filteredRows.length)} />
        </section>

        <section style={panelStyle}>
          <h2 style={sectionTitleStyle}>Filters</h2>
          <div style={filterGridStyle}>
            <label style={labelStyle}>Month<input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} style={inputStyle} /></label>
            <label style={labelStyle}>Staff<select value={staffFilter} onChange={(event) => setStaffFilter(event.target.value)} style={inputStyle}><option value="all">All</option>{users.map((user) => <option key={user.id} value={user.id}>{renderUserLabel(user)}</option>)}</select></label>
            <label style={labelStyle}>Scope<select value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value)} style={inputStyle}><option value="all">All</option><option value="office_work">Office Work</option><option value="business_development">Business Development</option><option value="internal_support">Internal Support</option><option value="other">Other</option></select></label>
            <label style={labelStyle}>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={inputStyle}><option value="active">Active</option><option value="voided">Voided</option><option value="all">All</option></select></label>
          </div>
        </section>

        {permissions.canSubmitOfficeWorkLog || (isEditing && permissions.canEditOfficeWorkLogs) ? (
          <section style={panelStyle}>
            <h2 style={sectionTitleStyle}>{isEditing ? "Edit office work log" : "Create office work log"}</h2>
            <div style={formGridStyle}>
              <label style={labelStyle}>Work Date<input type="date" value={form.work_date} onChange={(event) => setForm({ ...form, work_date: event.target.value })} style={inputStyle} /></label>
              <label style={labelStyle}>Staff<select value={form.staff_user_id} onChange={(event) => updateStaffUser(event.target.value)} style={inputStyle}><option value="">-</option>{users.map((user) => <option key={user.id} value={user.id}>{renderUserLabel(user)}</option>)}</select></label>
              <label style={labelStyle}>Staff Name<input value={form.staff_name} onChange={(event) => setForm({ ...form, staff_name: event.target.value })} style={inputStyle} /></label>
              <label style={labelStyle}>Scope<select value={form.work_scope} onChange={(event) => updateScope(event.target.value as WorkScope)} style={inputStyle}><option value="office_work">Office Work</option><option value="business_development">Business Development</option><option value="internal_support">Internal Support</option><option value="other">Other</option></select></label>
              <label style={labelStyle}>Work Type<select value={form.work_type} onChange={(event) => setForm({ ...form, work_type: event.target.value })} style={inputStyle}>{workTypeOptions[form.work_scope].map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
              {form.work_type === "อื่น ๆ" ? <label style={labelStyle}>Other Work Type<input value={form.work_other} onChange={(event) => setForm({ ...form, work_other: event.target.value })} style={inputStyle} /></label> : null}
              <label style={labelStyle}>Hours<input value={form.hours} onChange={(event) => setForm({ ...form, hours: event.target.value })} style={inputStyle} /></label>
              <label style={labelStyle}>Minutes<input value={form.minutes} onChange={(event) => setForm({ ...form, minutes: event.target.value })} style={inputStyle} /></label>
              {form.work_scope === "business_development" ? <label style={labelStyle}>BD Stage<select value={form.business_development_stage} onChange={(event) => setForm({ ...form, business_development_stage: event.target.value })} style={inputStyle}>{businessDevelopmentStages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select></label> : null}
              <label style={labelStyle}>Related Client<select value={form.related_client_id} onChange={(event) => setForm({ ...form, related_client_id: event.target.value })} style={inputStyle}><option value="">-</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name || client.id}</option>)}</select></label>
              <label style={labelStyle}>Related Case<select value={form.related_case_id} onChange={(event) => setForm({ ...form, related_case_id: event.target.value })} style={inputStyle}><option value="">-</option>{cases.map((item) => <option key={item.id} value={item.id}>{renderCaseLabel(item)}</option>)}</select></label>
              <label style={labelStyle}>Related Advisory Matter<select value={form.related_advisory_matter_id} onChange={(event) => setForm({ ...form, related_advisory_matter_id: event.target.value })} style={inputStyle}><option value="">-</option>{matters.map((item) => <option key={item.id} value={item.id}>{renderMatterLabel(item)}</option>)}</select></label>
              <label style={wideLabelStyle}>Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} style={textareaStyle} /></label>
              <label style={wideLabelStyle}>Note<textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} style={textareaStyle} /></label>
            </div>
            <div style={actionRowStyle}>
              <button type="button" onClick={saveLog} disabled={saving} style={primaryButtonStyle}>{saving ? "Saving..." : "Save Log"}</button>
              {isEditing ? <button type="button" onClick={resetForm} style={secondaryButtonStyle}>Cancel</button> : null}
            </div>
          </section>
        ) : null}

        <section style={summaryGridStyle}>
          <Breakdown title="By Staff" rows={summary.byStaff} />
          <Breakdown title="By Scope" rows={summary.byScope} />
          <Breakdown title="By Work Type" rows={summary.byType} />
        </section>

        <section style={panelStyle}>
          <h2 style={sectionTitleStyle}>Office Work Logs</h2>
          {loading ? <div style={emptyStyle}>Loading...</div> : null}
          {!loading && filteredRows.length === 0 ? <div style={emptyStyle}>No office work logs.</div> : null}
          {filteredRows.length > 0 ? (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Staff</th>
                    <th style={thStyle}>Scope</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Time</th>
                    <th style={thStyle}>Related Matter</th>
                    <th style={thStyle}>Description / Note</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id}>
                      <td style={tdStyle}>{row.work_date || "-"}</td>
                      <td style={tdStyle}>{row.staff_name || "-"}</td>
                      <td style={tdStyle}>{renderScope(row.work_scope)}</td>
                      <td style={tdStyle}>{renderWorkType(row)}{row.business_development_stage && row.business_development_stage !== "none" ? <div style={mutedTextStyle}>{row.business_development_stage}</div> : null}</td>
                      <td style={tdStyle}>{formatHours(toMinutes(row.minutes))}</td>
                      <td style={tdStyle}>{renderRelatedMatter(row, clients, cases, matters)}</td>
                      <td style={tdStyle}><div style={detailStackStyle}>{row.description ? <span>{row.description}</span> : null}{row.note ? <span style={mutedTextStyle}>{row.note}</span> : null}{row.void_reason ? <span style={voidReasonTextStyle}>Void reason: {row.void_reason}</span> : null}</div></td>
                      <td style={tdStyle}>{row.status || "-"}</td>
                      <td style={tdStyle}>
                        {permissions.canEditOfficeWorkLogs && row.status === "active" ? <button type="button" onClick={() => startEdit(row)} style={smallButtonStyle}>Edit</button> : null}
                        {permissions.canVoidOfficeWorkLogs && row.status === "active" ? <button type="button" onClick={() => voidLog(row)} style={dangerButtonStyle}>Void</button> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </main>
    </AuthGuard>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <section style={summaryCardStyle}>
      <div style={summaryLabelStyle}>{label}</div>
      <div style={summaryValueStyle}>{value}</div>
    </section>
  );
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ label: string; minutes: number }> }) {
  return (
    <section style={summaryCardStyle}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      <div style={breakdownStackStyle}>
        {rows.length === 0 ? <div style={emptyStyle}>No data.</div> : null}
        {rows.slice(0, 8).map((row) => (
          <div key={row.label} style={breakdownRowStyle}>
            <span>{row.label}</span>
            <strong>{formatHours(row.minutes)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function getDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getMonthKey(value: Date) {
  return value.toISOString().slice(0, 7);
}

function parseWholeNumber(value: string) {
  const parsed = Number(value.trim().replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function toMinutes(value: number | string | null) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatHours(minutes: number) {
  const hours = minutes / 60;
  return `${hours.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;
}

function mapToSortedRows(map: Map<string, number>) {
  return Array.from(map.entries())
    .map(([label, minutes]) => ({ label, minutes }))
    .sort((a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label));
}

function normalizeScope(value: string | null | undefined): WorkScope {
  if (value === "business_development") return "business_development";
  if (value === "internal_support") return "internal_support";
  if (value === "other") return "other";
  return "office_work";
}

function renderScope(value: string | null | undefined) {
  if (value === "business_development") return "Business Development";
  if (value === "internal_support") return "Internal Support";
  if (value === "other") return "Other";
  return "Office Work";
}

function renderWorkType(row: OfficeWorkLogRow) {
  return row.work_type || row.work_other || "-";
}

function renderUserLabel(user: UserProfileRow) {
  return user.staff_name || user.full_name || user.email || user.id;
}

function renderCaseLabel(item: CaseRow) {
  return [item.file_no, item.title || item.client_name].filter(Boolean).join(" - ") || String(item.id);
}

function renderMatterLabel(item: MatterRow) {
  return [item.matter_no, item.title].filter(Boolean).join(" - ") || item.id;
}

function renderRelatedMatter(row: OfficeWorkLogRow, clients: ClientRow[], cases: CaseRow[], matters: MatterRow[]) {
  const related: string[] = [];
  const client = clients.find((item) => item.id === row.related_client_id);
  const caseItem = cases.find((item) => String(item.id) === String(row.related_case_id));
  const matter = matters.find((item) => item.id === row.related_advisory_matter_id);
  if (client) related.push(client.name || client.id);
  if (caseItem) related.push(renderCaseLabel(caseItem));
  if (matter) related.push(renderMatterLabel(matter));
  return related.length > 0 ? related.join(" / ") : "-";
}

function isRealUserProfile(user: UserProfileRow) {
  const email = (user.email || "").trim().toLowerCase();
  const fullName = (user.full_name || "").trim().toLowerCase();
  const staffName = (user.staff_name || "").trim().toLowerCase();
  if (email.includes("test") || email.endsWith("@example.com")) return false;
  if (fullName.startsWith("test") || staffName.startsWith("test")) return false;
  return true;
}

const pageStyle: CSSProperties = { minHeight: "100vh", padding: 24, background: "#f7f7f8", color: "#111111", overflowX: "hidden" };
const panelStyle: CSSProperties = { border: "1px solid #dddddd", borderRadius: 8, background: "#ffffff", padding: 16, marginBottom: 16 };
const noAccessStyle: CSSProperties = { ...panelStyle, color: "#a40000", background: "#fff5f5" };
const errorStyle: CSSProperties = { ...panelStyle, color: "#a40000", background: "#fff5f5" };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 };
const summaryCardStyle: CSSProperties = { ...panelStyle, marginBottom: 0 };
const summaryLabelStyle: CSSProperties = { color: "#666666", fontSize: 12, fontWeight: 700 };
const summaryValueStyle: CSSProperties = { color: "#111111", fontSize: 24, fontWeight: 900, marginTop: 6 };
const filterGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 };
const formGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", columnGap: 16, rowGap: 14, alignItems: "start" };
const labelStyle: CSSProperties = { display: "grid", gap: 7, fontSize: 13, fontWeight: 700, minWidth: 0 };
const wideLabelStyle: CSSProperties = { ...labelStyle, gridColumn: "1 / -1" };
const inputStyle: CSSProperties = { width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: 10, border: "1px solid #cccccc", borderRadius: 6, fontSize: 14, minWidth: 0 };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 76 };
const sectionTitleStyle: CSSProperties = { margin: "0 0 12px", fontSize: 18, fontWeight: 900 };
const actionRowStyle: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 };
const primaryButtonStyle: CSSProperties = { padding: "10px 14px", border: "1px solid #111111", borderRadius: 6, background: "#111111", color: "#ffffff", cursor: "pointer", fontWeight: 800 };
const secondaryButtonStyle: CSSProperties = { padding: "10px 14px", border: "1px solid #cccccc", borderRadius: 6, background: "#ffffff", cursor: "pointer", fontWeight: 800 };
const tableWrapStyle: CSSProperties = { overflowX: "auto", maxWidth: "100%" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 980 };
const thStyle: CSSProperties = { padding: 10, borderBottom: "1px solid #dddddd", textAlign: "left", fontSize: 12 };
const tdStyle: CSSProperties = { padding: 10, borderBottom: "1px solid #eeeeee", fontSize: 13, verticalAlign: "top" };
const detailStackStyle: CSSProperties = { display: "grid", gap: 4 };
const mutedTextStyle: CSSProperties = { color: "#6b7280", fontSize: 12, lineHeight: 1.35 };
const voidReasonTextStyle: CSSProperties = { color: "#991b1b", fontSize: 12, lineHeight: 1.35, fontWeight: 700 };
const smallButtonStyle: CSSProperties = { ...secondaryButtonStyle, padding: "6px 9px", marginRight: 6 };
const dangerButtonStyle: CSSProperties = { padding: "6px 9px", border: "1px solid #a40000", borderRadius: 6, background: "#fff5f5", color: "#a40000", cursor: "pointer", fontWeight: 800 };
const emptyStyle: CSSProperties = { padding: 12, border: "1px dashed #cccccc", borderRadius: 6, color: "#666666" };
const breakdownStackStyle: CSSProperties = { display: "grid", gap: 8 };
const breakdownRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, color: "#333333", fontSize: 13 };
