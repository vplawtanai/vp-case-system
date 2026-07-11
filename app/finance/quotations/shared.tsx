"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGuard from "../../components/AuthGuard";
import AppTopNav from "../../components/AppTopNav";
import { createAuditLog } from "../../../lib/auditLog";
import { buildPermissions } from "../../../lib/permissions";
import type { UserPermissions, UserRole } from "../../../lib/permissions";
import { supabase } from "../../../lib/supabase";

type Profile = {
  role?: UserRole | string | null;
  financial_access?: boolean | null;
  full_name?: string | null;
  staff_name?: string | null;
  can_view_company_ledger?: boolean | null;
  can_submit_expense_claim?: boolean | null;
  can_view_own_expense_claims?: boolean | null;
  can_view_all_expense_claims?: boolean | null;
  can_view_lawyer_compensation?: boolean | null;
};

export type QuotationStatus = "draft" | "sent" | "accepted" | "cancelled";

export type QuotationRow = {
  id: string;
  quotation_no: string;
  client_id: string;
  case_id: number | null;
  advisory_matter_id: string | null;
  issue_date: string;
  valid_until: string | null;
  status: QuotationStatus | string;
  subtotal_vatable: number | string | null;
  subtotal_non_vatable: number | string | null;
  vat_amount: number | string | null;
  grand_total: number | string | null;
  note: string | null;
  internal_note: string | null;
  created_by_user_id: string | null;
  created_by_email: string | null;
  created_by_name: string | null;
  updated_by_user_id: string | null;
  updated_by_email: string | null;
  updated_by_name: string | null;
  sent_at: string | null;
  sent_by_user_id: string | null;
  accepted_at: string | null;
  accepted_by_user_id: string | null;
  cancelled_at: string | null;
  cancelled_by_user_id: string | null;
  cancel_reason: string | null;
  client_snapshot_json?: Record<string, unknown> | null;
  matter_snapshot_json?: Record<string, unknown> | null;
  document_data_snapshot_json?: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

type QuotationItemRow = {
  id?: string;
  quotation_id?: string;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  amount_before_tax: number | string;
  vat_applicable: boolean;
  vat_rate: number | string;
  vat_amount: number | string;
  line_total: number | string;
  sort_order: number;
};

type ClientRow = { id: string; name: string | null; tax_id?: string | null; email?: string | null; phone?: string | null; address?: string | null };
type CaseRow = { id: number; file_no: string | null; title: string | null; client_name: string | null };
type MatterRow = { id: string; matter_no: string | null; title: string | null };

type QuotationAccess = {
  userId: string;
  userEmail: string;
  userName: string;
  profile: Profile | null;
  permissions: UserPermissions;
};

type LookupState = {
  clients: ClientRow[];
  cases: CaseRow[];
  matters: MatterRow[];
};

type FormState = {
  client_id: string;
  case_id: string;
  advisory_matter_id: string;
  issue_date: string;
  valid_until: string;
  note: string;
  internal_note: string;
};

const emptyForm: FormState = {
  client_id: "",
  case_id: "",
  advisory_matter_id: "",
  issue_date: getDateKey(new Date()),
  valid_until: "",
  note: "",
  internal_note: "",
};

const emptyItem: QuotationItemRow = {
  description: "",
  quantity: "1",
  unit_price: "",
  amount_before_tax: 0,
  vat_applicable: true,
  vat_rate: 7,
  vat_amount: 0,
  line_total: 0,
  sort_order: 0,
};

const profileSelect = [
  "role",
  "financial_access",
  "full_name",
  "staff_name",
  "can_view_company_ledger",
  "can_submit_expense_claim",
  "can_view_own_expense_claims",
  "can_view_all_expense_claims",
  "can_view_lawyer_compensation",
].join(", ");

export function QuotationGuard({ children }: { children: (access: QuotationAccess) => ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<QuotationAccess | null>(null);

  useEffect(() => {
    const loadAccess = async () => {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        setAccess(null);
        setLoading(false);
        return;
      }

      const { data: profileData } = await supabase
        .from("user_profiles")
        .select(profileSelect)
        .eq("id", user.id)
        .single();
      const profile = (profileData || { role: "" }) as Profile;
      const permissions = buildPermissions(profile);

      setAccess({
        userId: user.id,
        userEmail: user.email || "",
        userName: profile.staff_name || profile.full_name || user.email || user.id,
        profile,
        permissions,
      });
      setLoading(false);
    };

    loadAccess();
  }, []);

  return (
    <AuthGuard>
      <AppTopNav title="Finance" subtitle="Quotations" activePage="finance" />
      <main style={pageStyle}>
        {loading ? <div style={cardStyle}>Loading quotations...</div> : null}
        {!loading && (!access || !access.permissions.canViewFinanceQuotations) ? (
          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>No access</h2>
            <p style={mutedTextStyle}>You do not have permission to view Finance Quotations.</p>
          </div>
        ) : null}
        {!loading && access?.permissions.canViewFinanceQuotations ? children(access) : null}
      </main>
    </AuthGuard>
  );
}

export function FinanceSubNav({ activePage, permissions }: { activePage: "quotations" | "ledger" | "claims" | "compensation"; permissions: UserPermissions }) {
  return (
    <nav style={subNavStyle}>
      {permissions.canViewFinanceQuotations ? <Link href="/finance/quotations" style={activePage === "quotations" ? subNavActiveLinkStyle : subNavLinkStyle}>Quotations</Link> : null}
      {permissions.canViewCompanyLedger ? <Link href="/finance/ledger" style={activePage === "ledger" ? subNavActiveLinkStyle : subNavLinkStyle}>Ledger</Link> : null}
      {permissions.canSubmitExpenseClaim || permissions.canViewOwnExpenseClaims || permissions.canViewAllExpenseClaims ? <Link href="/finance/expense-claims" style={activePage === "claims" ? subNavActiveLinkStyle : subNavLinkStyle}>Expense Claims</Link> : null}
      {permissions.canViewLawyerCompensation ? <Link href="/finance/compensation" style={activePage === "compensation" ? subNavActiveLinkStyle : subNavLinkStyle}>Lawyer Compensation</Link> : null}
    </nav>
  );
}

export function QuotationList({ access }: { access: QuotationAccess }) {
  const [quotations, setQuotations] = useState<QuotationRow[]>([]);
  const [lookups, setLookups] = useState<LookupState>({ clients: [], cases: [], matters: [] });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [quotationRes, lookupRes] = await Promise.all([
      supabase.from("finance_quotations").select("*").order("created_at", { ascending: false }),
      loadLookups(),
    ]);

    if (quotationRes.error) {
      alert("Unable to load quotations.");
      setLoading(false);
      return;
    }

    setQuotations((quotationRes.data || []) as QuotationRow[]);
    setLookups(lookupRes);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  return (
    <>
      <FinanceSubNav activePage="quotations" permissions={access.permissions} />
      <div style={sectionHeaderStyle}>
        <div>
          <h1 style={pageTitleStyle}>Finance Quotations</h1>
          <p style={mutedTextStyle}>Structured quotation records only. No ledger posting, invoice, receipt, or legacy conversion.</p>
        </div>
        {access.permissions.canCreateFinanceQuotation ? <Link href="/finance/quotations/new" style={primaryButtonStyle}>New Quotation</Link> : null}
      </div>

      <div style={cardStyle}>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Quotation No</th>
                <th style={thStyle}>Client</th>
                <th style={thStyle}>Linked Matter</th>
                <th style={thStyle}>Issue Date</th>
                <th style={thStyle}>Valid Until</th>
                <th style={thStyle}>Status</th>
                <th style={rightThStyle}>Grand Total</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td style={tdStyle} colSpan={8}>Loading...</td></tr> : null}
              {!loading && quotations.length === 0 ? <tr><td style={tdStyle} colSpan={8}>No quotations yet.</td></tr> : null}
              {!loading && quotations.map((quotation) => (
                <tr key={quotation.id}>
                  <td style={tdStyle}><Link href={`/finance/quotations/${quotation.id}`} style={linkStyle}>{quotation.quotation_no}</Link></td>
                  <td style={tdStyle}>{renderClientName(quotation.client_id, lookups.clients)}</td>
                  <td style={tdStyle}>{renderMatterLink(quotation, lookups)}</td>
                  <td style={tdStyle}>{formatDate(quotation.issue_date)}</td>
                  <td style={tdStyle}>{formatDate(quotation.valid_until)}</td>
                  <td style={tdStyle}><StatusBadge status={quotation.status} /></td>
                  <td style={rightTdStyle}>{formatMoney(toAmount(quotation.grand_total))}</td>
                  <td style={tdStyle}>
                    <div style={actionGroupStyle}>
                      <Link href={`/finance/quotations/${quotation.id}`} style={smallButtonStyle}>View</Link>
                      {quotation.status === "draft" && access.permissions.canEditFinanceQuotation ? <Link href={`/finance/quotations/${quotation.id}/edit`} style={smallButtonStyle}>Edit</Link> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function QuotationForm({ access, quotationId }: { access: QuotationAccess; quotationId?: string }) {
  const router = useRouter();
  const isEdit = Boolean(quotationId);
  const [lookups, setLookups] = useState<LookupState>({ clients: [], cases: [], matters: [] });
  const [quotation, setQuotation] = useState<QuotationRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [items, setItems] = useState<QuotationItemRow[]>([{ ...emptyItem }]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => computeTotals(items), [items]);
  const canSave = isEdit ? access.permissions.canEditFinanceQuotation : access.permissions.canCreateFinanceQuotation;

  useEffect(() => {
    const loadFormData = async () => {
      setLoading(true);
      if (!quotationId) {
        const lookupData = await loadLookups();
        setLookups(lookupData);
        setLoading(false);
        return;
      }

      const quotationRes = await supabase.from("finance_quotations").select("*").eq("id", quotationId).maybeSingle();
      if (quotationRes.error || !quotationRes.data) {
        console.error("Failed to load quotation for edit", { quotationId, error: quotationRes.error });
        alert(quotationRes.error ? "Unable to load quotation." : "Quotation not found.");
        setLoading(false);
        return;
      }

      const [itemRes, lookupData] = await Promise.all([
        supabase.from("finance_quotation_items").select("*").eq("quotation_id", quotationId).order("sort_order", { ascending: true }),
        loadLookups(),
      ]);
      if (itemRes.error) {
        console.warn("Failed to load quotation items for edit", { quotationId, error: itemRes.error });
      }

      const loadedQuotation = quotationRes.data as QuotationRow;
      setQuotation(loadedQuotation);
      setLookups(lookupData);
      setForm({
        client_id: loadedQuotation.client_id || "",
        case_id: loadedQuotation.case_id ? String(loadedQuotation.case_id) : "",
        advisory_matter_id: loadedQuotation.advisory_matter_id || "",
        issue_date: loadedQuotation.issue_date || getDateKey(new Date()),
        valid_until: loadedQuotation.valid_until || "",
        note: loadedQuotation.note || "",
        internal_note: loadedQuotation.internal_note || "",
      });
      setItems(((itemRes.data || []) as QuotationItemRow[]).map((item, index) => ({
        ...item,
        quantity: String(item.quantity || 1),
        unit_price: String(item.unit_price || 0),
        vat_rate: String(item.vat_rate || 0),
        sort_order: index,
      })));
      setLoading(false);
    };

    loadFormData();
  }, [quotationId]);

  const updateItem = (index: number, patch: Partial<QuotationItemRow>) => {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? normalizeItem({ ...item, ...patch }, itemIndex) : item));
  };

  const removeItem = (index: number) => {
    setItems((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => normalizeItem(item, itemIndex)));
  };

  const saveDraft = async () => {
    if (saving) return;
    if (!canSave) {
      alert("You do not have permission to save quotations.");
      return;
    }
    if (isEdit && quotation?.status !== "draft") {
      alert("Only draft quotations can be edited.");
      return;
    }

    const validationError = validateForm(form, items);
    if (validationError) {
      alert(validationError);
      return;
    }

    setSaving(true);
    const normalizedItems = items.map((item, index) => normalizeItem(item, index));
    const currentTotals = computeTotals(normalizedItems);
    const quotationNo = quotation?.quotation_no || "";
    const snapshots = buildQuotationSnapshots(form, normalizedItems, currentTotals, lookups, quotationNo);
    const quotationPayload = {
      client_id: form.client_id,
      case_id: form.case_id ? Number(form.case_id) : null,
      advisory_matter_id: form.advisory_matter_id || null,
      issue_date: form.issue_date,
      valid_until: form.valid_until || null,
      status: "draft" as const,
      subtotal_vatable: currentTotals.subtotalVatable,
      subtotal_non_vatable: currentTotals.subtotalNonVatable,
      vat_amount: currentTotals.vatAmount,
      grand_total: currentTotals.grandTotal,
      note: form.note.trim() || null,
      internal_note: form.internal_note.trim() || null,
      client_snapshot_json: snapshots.clientSnapshot,
      matter_snapshot_json: snapshots.matterSnapshot,
      document_data_snapshot_json: snapshots.documentSnapshot,
      updated_by_user_id: access.userId,
      updated_by_email: access.userEmail,
      updated_by_name: access.userName,
      updated_at: new Date().toISOString(),
    };

    if (isEdit && quotationId) {
      const { error: updateError } = await supabase.rpc("save_finance_quotation_draft", {
        p_quotation_id: quotationId,
        p_client_id: quotationPayload.client_id,
        p_case_id: quotationPayload.case_id,
        p_advisory_matter_id: quotationPayload.advisory_matter_id,
        p_issue_date: quotationPayload.issue_date,
        p_valid_until: quotationPayload.valid_until,
        p_note: form.note,
        p_internal_note: form.internal_note,
        p_subtotal_vatable: quotationPayload.subtotal_vatable,
        p_subtotal_non_vatable: quotationPayload.subtotal_non_vatable,
        p_vat_amount: quotationPayload.vat_amount,
        p_grand_total: quotationPayload.grand_total,
        p_client_snapshot_json: quotationPayload.client_snapshot_json,
        p_matter_snapshot_json: quotationPayload.matter_snapshot_json,
        p_document_data_snapshot_json: quotationPayload.document_data_snapshot_json,
        p_updated_by_user_id: access.userId,
        p_updated_by_email: access.userEmail,
        p_updated_by_name: access.userName,
        p_items: buildItemPayload(quotationId, normalizedItems),
      });
      if (updateError) {
        alert("Unable to update quotation.");
        setSaving(false);
        return;
      }

      await createAuditLog({
        tableName: "finance_quotations",
        recordId: quotationId,
        caseId: form.case_id ? Number(form.case_id) : null,
        action: "update",
        note: `Updated quotation ${quotation?.quotation_no || quotationId}; grand total ${formatMoney(toAmount(quotation?.grand_total))} -> ${formatMoney(currentTotals.grandTotal)}`,
      });
      await createAuditLog({
        tableName: "finance_quotation_items",
        recordId: quotationId,
        caseId: form.case_id ? Number(form.case_id) : null,
        action: "update",
        note: `Replaced quotation line items for ${quotation?.quotation_no || quotationId}; item count ${normalizedItems.length}`,
      });
      router.push(`/finance/quotations/${quotationId}`);
      return;
    }

    const { data: docNoData, error: docNoError } = await supabase.rpc("generate_finance_document_no", {
      p_doc_type: "QT",
      p_issue_date: form.issue_date,
    });
    if (docNoError || !docNoData) {
      alert("Unable to generate quotation number.");
      setSaving(false);
      return;
    }
    const createSnapshots = buildQuotationSnapshots(form, normalizedItems, currentTotals, lookups, String(docNoData));

    const { data: insertedQuotation, error: insertError } = await supabase
      .from("finance_quotations")
      .insert({
        ...quotationPayload,
        quotation_no: String(docNoData),
        client_snapshot_json: createSnapshots.clientSnapshot,
        matter_snapshot_json: createSnapshots.matterSnapshot,
        document_data_snapshot_json: createSnapshots.documentSnapshot,
        created_by_user_id: access.userId,
        created_by_email: access.userEmail,
        created_by_name: access.userName,
      })
      .select("*")
      .single();
    if (insertError || !insertedQuotation) {
      alert("Unable to create quotation.");
      setSaving(false);
      return;
    }

    const created = insertedQuotation as QuotationRow;
    const { error: itemError } = await supabase.from("finance_quotation_items").insert(buildItemPayload(created.id, normalizedItems));
    if (itemError) {
      alert("Quotation was created, but items could not be saved. Please review this draft before using it.");
      setSaving(false);
      return;
    }

    await createAuditLog({
      tableName: "finance_quotations",
      recordId: created.id,
      caseId: form.case_id ? Number(form.case_id) : null,
      action: "create",
      note: `Created quotation ${created.quotation_no}; item count ${normalizedItems.length}; grand total ${formatMoney(currentTotals.grandTotal)}`,
    });
    router.push(`/finance/quotations/${created.id}`);
  };

  if (loading) {
    return (
      <>
        <FinanceSubNav activePage="quotations" permissions={access.permissions} />
        <div style={cardStyle}>Loading quotation form...</div>
      </>
    );
  }

  if (!canSave) {
    return (
      <>
        <FinanceSubNav activePage="quotations" permissions={access.permissions} />
        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>No access</h2>
          <p style={mutedTextStyle}>You do not have permission to save quotations.</p>
        </div>
      </>
    );
  }

  if (isEdit && quotation && quotation.status !== "draft") {
    const readonlyMessage = getReadonlyMessage(quotation.status);
    return (
      <>
        <FinanceSubNav activePage="quotations" permissions={access.permissions} />
        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>Readonly quotation</h2>
          <p style={mutedTextStyle}>{readonlyMessage}</p>
          {quotation ? <Link href={`/finance/quotations/${quotation.id}`} style={primaryButtonStyle}>Back to quotation</Link> : null}
        </div>
      </>
    );
  }

  return (
    <>
      <FinanceSubNav activePage="quotations" permissions={access.permissions} />
      <div style={sectionHeaderStyle}>
        <div>
          <h1 style={pageTitleStyle}>{isEdit ? `Edit ${quotation?.quotation_no || "Quotation"}` : "New Quotation"}</h1>
          <p style={mutedTextStyle}>Create a standalone quotation. This does not create invoice, receipt, ledger, compensation, or legacy conversion records.</p>
        </div>
        <Link href={isEdit && quotationId ? `/finance/quotations/${quotationId}` : "/finance/quotations"} style={secondaryButtonStyle}>Cancel</Link>
      </div>

      <div style={cardStyle}>
        <div style={formGridStyle}>
          <label style={labelStyle}>Client
            <select value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value })} style={inputStyle}>
              <option value="">Select client</option>
              {lookups.clients.map((client) => <option key={client.id} value={client.id}>{client.name || client.id}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Case (optional)
            <select value={form.case_id} onChange={(event) => setForm({ ...form, case_id: event.target.value, advisory_matter_id: "" })} style={inputStyle}>
              <option value="">No linked case</option>
              {lookups.cases.map((item) => <option key={item.id} value={item.id}>{renderCaseLabel(item)}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Advisory Matter (optional)
            <select value={form.advisory_matter_id} onChange={(event) => setForm({ ...form, advisory_matter_id: event.target.value, case_id: "" })} style={inputStyle}>
              <option value="">No linked advisory matter</option>
              {lookups.matters.map((item) => <option key={item.id} value={item.id}>{renderMatterLabel(item)}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Issue Date
            <input type="date" value={form.issue_date} onChange={(event) => setForm({ ...form, issue_date: event.target.value })} style={inputStyle} />
          </label>
          <label style={labelStyle}>Valid Until
            <input type="date" value={form.valid_until} onChange={(event) => setForm({ ...form, valid_until: event.target.value })} style={inputStyle} />
          </label>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <h2 style={sectionTitleStyle}>Line Items</h2>
          <button type="button" onClick={() => setItems((current) => [...current, normalizeItem({ ...emptyItem }, current.length)])} style={secondaryButtonStyle}>Add Item</button>
        </div>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Description</th>
                <th style={rightThStyle}>Qty</th>
                <th style={rightThStyle}>Unit Price</th>
                <th style={thStyle}>VAT</th>
                <th style={rightThStyle}>Line Total</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const normalized = normalizeItem(item, index);
                return (
                  <tr key={index}>
                    <td style={tdStyle}><input value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} style={inputStyle} placeholder="Service description" /></td>
                    <td style={rightTdStyle}><input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} style={compactInputStyle} /></td>
                    <td style={rightTdStyle}><input type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateItem(index, { unit_price: event.target.value })} style={compactInputStyle} /></td>
                    <td style={tdStyle}>
                      <label style={checkboxLabelStyle}><input type="checkbox" checked={item.vat_applicable} onChange={(event) => updateItem(index, { vat_applicable: event.target.checked, vat_rate: event.target.checked ? (item.vat_rate || 7) : 0 })} /> VAT</label>
                      {item.vat_applicable ? <input type="number" min="0" step="0.01" value={item.vat_rate} onChange={(event) => updateItem(index, { vat_rate: event.target.value })} style={vatInputStyle} /> : null}
                    </td>
                    <td style={rightTdStyle}>{formatMoney(toAmount(normalized.line_total))}</td>
                    <td style={tdStyle}><button type="button" onClick={() => removeItem(index)} style={dangerSmallButtonStyle} disabled={items.length === 1}>Remove</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={totalsGridStyle}>
          <SummaryLine label="Subtotal Vatable" value={totals.subtotalVatable} />
          <SummaryLine label="Subtotal Non-Vatable" value={totals.subtotalNonVatable} />
          <SummaryLine label="VAT" value={totals.vatAmount} />
          <SummaryLine label="Grand Total" value={totals.grandTotal} strong />
        </div>
      </div>

      <div style={cardStyle}>
        <div style={formGridStyle}>
          <label style={labelStyle}>Note
            <textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} style={textareaStyle} />
          </label>
          <label style={labelStyle}>Internal Note
            <textarea value={form.internal_note} onChange={(event) => setForm({ ...form, internal_note: event.target.value })} style={textareaStyle} />
          </label>
        </div>
        <div style={buttonRowStyle}>
          <button type="button" onClick={saveDraft} disabled={saving} style={primaryButtonStyle}>{saving ? "Saving..." : "Save Draft"}</button>
        </div>
      </div>
    </>
  );
}

export function QuotationDetail({ access, quotationId }: { access: QuotationAccess; quotationId: string }) {
  const [quotation, setQuotation] = useState<QuotationRow | null>(null);
  const [items, setItems] = useState<QuotationItemRow[]>([]);
  const [lookups, setLookups] = useState<LookupState>({ clients: [], cases: [], matters: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    if (!quotationId) {
      console.error("Missing quotation id in quotation detail route");
      alert("Quotation not found.");
      setLoading(false);
      return;
    }

    const quotationRes = await supabase.from("finance_quotations").select("*").eq("id", quotationId).maybeSingle();
    if (quotationRes.error || !quotationRes.data) {
      console.error("Failed to load quotation", { quotationId, error: quotationRes.error });
      alert(quotationRes.error ? "Unable to load quotation." : "Quotation not found.");
      setLoading(false);
      return;
    }

    const [itemRes, lookupRes] = await Promise.all([
      supabase.from("finance_quotation_items").select("*").eq("quotation_id", quotationId).order("sort_order", { ascending: true }),
      loadLookups(),
    ]);
    if (itemRes.error) {
      console.warn("Failed to load quotation items", { quotationId, error: itemRes.error });
    }

    setQuotation(quotationRes.data as QuotationRow);
    setItems((itemRes.data || []) as QuotationItemRow[]);
    setLookups(lookupRes);
    setLoading(false);
  }, [quotationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const updateStatus = async (nextStatus: QuotationStatus) => {
    if (!quotation || saving) return;
    if (nextStatus === "sent" && quotation.status !== "draft") return;
    if (nextStatus === "accepted" && quotation.status !== "sent") return;
    if (nextStatus === "cancelled" && quotation.status !== "draft" && quotation.status !== "sent") return;

    let cancelReason: string | null = null;
    if (nextStatus === "cancelled") {
      cancelReason = window.prompt("Cancel reason") || "Cancelled by user";
      if (!cancelReason.trim()) return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("set_finance_quotation_status", {
      p_quotation_id: quotation.id,
      p_next_status: nextStatus,
      p_cancel_reason: cancelReason,
      p_user_id: access.userId,
      p_user_email: access.userEmail,
      p_user_name: access.userName,
    });
    if (error) {
      alert("Unable to update quotation status.");
      setSaving(false);
      return;
    }

    await createAuditLog({
      tableName: "finance_quotations",
      recordId: quotation.id,
      caseId: quotation.case_id || null,
      action: "update",
      note: `Quotation ${quotation.quotation_no} marked ${nextStatus}`,
    });
    await loadData();
    setSaving(false);
  };

  return (
    <>
      <FinanceSubNav activePage="quotations" permissions={access.permissions} />
      {loading ? <div style={cardStyle}>Loading quotation...</div> : null}
      {!loading && quotation ? (
        <>
          <div style={sectionHeaderStyle}>
            <div>
              <h1 style={pageTitleStyle}>{quotation.quotation_no}</h1>
              <p style={mutedTextStyle}>Quotation document record. No invoice, receipt, ledger posting, or compensation is created from this page.</p>
              {quotation.status !== "draft" ? <p style={noticeTextStyle}>{getReadonlyMessage(quotation.status)}</p> : null}
            </div>
            <div style={actionGroupStyle}>
              <Link href="/finance/quotations" style={secondaryButtonStyle}>Back</Link>
              <Link href={`/finance/quotations/${quotation.id}/preview`} style={secondaryButtonStyle}>Preview</Link>
              {quotation.status === "draft" && access.permissions.canEditFinanceQuotation ? <Link href={`/finance/quotations/${quotation.id}/edit`} style={primaryButtonStyle}>Edit Draft</Link> : null}
              {quotation.status === "draft" && access.permissions.canMarkFinanceQuotationSent ? <button type="button" onClick={() => updateStatus("sent")} disabled={saving} style={secondaryButtonStyle}>Mark Sent</button> : null}
              {quotation.status === "sent" && access.permissions.canMarkFinanceQuotationAccepted ? <button type="button" onClick={() => updateStatus("accepted")} disabled={saving} style={secondaryButtonStyle}>Mark Accepted</button> : null}
              {(quotation.status === "draft" || quotation.status === "sent") && access.permissions.canCancelFinanceQuotation ? <button type="button" onClick={() => updateStatus("cancelled")} disabled={saving} style={dangerButtonStyle}>Cancel</button> : null}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={detailGridStyle}>
              <Detail label="Status" value={<StatusBadge status={quotation.status} />} />
              <Detail label="Client" value={renderClientName(quotation.client_id, lookups.clients)} />
              <Detail label="Linked Matter" value={renderMatterLink(quotation, lookups)} />
              <Detail label="Issue Date" value={formatDate(quotation.issue_date)} />
              <Detail label="Valid Until" value={formatDate(quotation.valid_until)} />
              <Detail label="Grand Total" value={formatMoney(toAmount(quotation.grand_total))} />
            </div>
          </div>

          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>Line Items</h2>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Description</th>
                    <th style={rightThStyle}>Qty</th>
                    <th style={rightThStyle}>Unit Price</th>
                    <th style={rightThStyle}>Before Tax</th>
                    <th style={rightThStyle}>VAT</th>
                    <th style={rightThStyle}>Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id || index}>
                      <td style={tdStyle}>{item.description}</td>
                      <td style={rightTdStyle}>{formatQuantity(toAmount(item.quantity))}</td>
                      <td style={rightTdStyle}>{formatMoney(toAmount(item.unit_price))}</td>
                      <td style={rightTdStyle}>{formatMoney(toAmount(item.amount_before_tax))}</td>
                      <td style={rightTdStyle}>{formatMoney(toAmount(item.vat_amount))}</td>
                      <td style={rightTdStyle}>{formatMoney(toAmount(item.line_total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={totalsGridStyle}>
              <SummaryLine label="Subtotal Vatable" value={toAmount(quotation.subtotal_vatable)} />
              <SummaryLine label="Subtotal Non-Vatable" value={toAmount(quotation.subtotal_non_vatable)} />
              <SummaryLine label="VAT" value={toAmount(quotation.vat_amount)} />
              <SummaryLine label="Grand Total" value={toAmount(quotation.grand_total)} strong />
            </div>
          </div>

          <div style={cardStyle}>
            <div style={detailGridStyle}>
              <Detail label="Note" value={quotation.note || "-"} />
              <Detail label="Internal Note" value={quotation.internal_note || "-"} />
              {quotation.cancel_reason ? <Detail label="Cancel Reason" value={quotation.cancel_reason} /> : null}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

async function loadLookups(): Promise<LookupState> {
  const [clientsRes, casesRes, mattersRes] = await Promise.all([
    supabase.from("clients").select("id, name, tax_id, email, phone, address").order("name", { ascending: true }),
    supabase.from("cases").select("id, file_no, title, client_name").order("created_at", { ascending: false }),
    supabase.from("advisory_matters").select("id, matter_no, title").order("created_at", { ascending: false }),
  ]);

  return {
    clients: (clientsRes.data || []) as ClientRow[],
    cases: (casesRes.data || []) as CaseRow[],
    matters: (mattersRes.data || []) as MatterRow[],
  };
}

function validateForm(form: FormState, items: QuotationItemRow[]) {
  if (!form.client_id) return "Please select client.";
  if (!form.issue_date) return "Please select issue date.";
  if (form.valid_until && form.valid_until < form.issue_date) return "Valid until cannot be before issue date.";
  if (form.case_id && form.advisory_matter_id) return "Select either case or advisory matter, not both.";
  if (items.length === 0) return "Please add at least one line item.";
  for (const item of items) {
    if (!item.description.trim()) return "Every line item needs a description.";
    if (toAmount(item.quantity) <= 0) return "Quantity must be greater than zero.";
    if (toAmount(item.unit_price) < 0) return "Unit price cannot be negative.";
  }
  return "";
}

function buildQuotationSnapshots(
  form: FormState,
  items: QuotationItemRow[],
  totals: ReturnType<typeof computeTotals>,
  lookups: LookupState,
  quotationNo: string
) {
  const client = lookups.clients.find((item) => item.id === form.client_id);
  const caseItem = form.case_id ? lookups.cases.find((item) => String(item.id) === String(form.case_id)) : null;
  const matter = form.advisory_matter_id ? lookups.matters.find((item) => item.id === form.advisory_matter_id) : null;
  const normalizedItems = items.map((item, index) => normalizeItem(item, index));

  const clientSnapshot: Record<string, unknown> = {
    id: form.client_id,
    name: client?.name || null,
    tax_id: client?.tax_id || null,
    email: client?.email || null,
    phone: client?.phone || null,
    address: client?.address || null,
  };

  const matterSnapshot: Record<string, unknown> | null = caseItem
    ? {
        type: "case",
        id: caseItem.id,
        file_no: caseItem.file_no || null,
        title: caseItem.title || null,
        client_name: caseItem.client_name || null,
      }
    : matter
      ? {
          type: "advisory",
          id: matter.id,
          matter_no: matter.matter_no || null,
          title: matter.title || null,
        }
      : form.case_id
        ? { type: "case", id: form.case_id }
        : form.advisory_matter_id
          ? { type: "advisory", id: form.advisory_matter_id }
          : null;

  return {
    clientSnapshot,
    matterSnapshot,
    documentSnapshot: {
      document_type: "quotation",
      quotation_no: quotationNo || null,
      client_id: form.client_id,
      case_id: form.case_id ? Number(form.case_id) : null,
      advisory_matter_id: form.advisory_matter_id || null,
      issue_date: form.issue_date,
      valid_until: form.valid_until || null,
      note: form.note.trim() || null,
      totals,
      items: normalizedItems.map((item) => ({
        description: item.description.trim(),
        quantity: toAmount(item.quantity),
        unit_price: toAmount(item.unit_price),
        amount_before_tax: toAmount(item.amount_before_tax),
        vat_applicable: item.vat_applicable,
        vat_rate: toAmount(item.vat_rate),
        vat_amount: toAmount(item.vat_amount),
        line_total: toAmount(item.line_total),
        sort_order: item.sort_order,
      })),
      snapshot_created_at: new Date().toISOString(),
    },
  };
}

function buildItemPayload(quotationId: string, items: QuotationItemRow[]) {
  return items.map((item, index) => {
    const normalized = normalizeItem(item, index);
    return {
      quotation_id: quotationId,
      description: normalized.description.trim(),
      quantity: toAmount(normalized.quantity),
      unit_price: toAmount(normalized.unit_price),
      amount_before_tax: toAmount(normalized.amount_before_tax),
      vat_applicable: normalized.vat_applicable,
      vat_rate: toAmount(normalized.vat_rate),
      vat_amount: toAmount(normalized.vat_amount),
      line_total: toAmount(normalized.line_total),
      sort_order: index,
    };
  });
}

function normalizeItem(item: QuotationItemRow, index: number): QuotationItemRow {
  const quantity = toAmount(item.quantity);
  const unitPrice = toAmount(item.unit_price);
  const amountBeforeTax = roundMoney(quantity * unitPrice);
  const vatRate = item.vat_applicable ? (toAmount(item.vat_rate) || 7) : 0;
  const vatAmount = item.vat_applicable ? roundMoney((amountBeforeTax * vatRate) / 100) : 0;
  return {
    ...item,
    quantity,
    unit_price: unitPrice,
    amount_before_tax: amountBeforeTax,
    vat_rate: vatRate,
    vat_amount: vatAmount,
    line_total: roundMoney(amountBeforeTax + vatAmount),
    sort_order: index,
  };
}

function computeTotals(items: QuotationItemRow[]) {
  const normalizedItems = items.map((item, index) => normalizeItem(item, index));
  const subtotalVatable = roundMoney(normalizedItems.reduce((sum, item) => sum + (item.vat_applicable ? toAmount(item.amount_before_tax) : 0), 0));
  const subtotalNonVatable = roundMoney(normalizedItems.reduce((sum, item) => sum + (!item.vat_applicable ? toAmount(item.amount_before_tax) : 0), 0));
  const vatAmount = roundMoney(normalizedItems.reduce((sum, item) => sum + toAmount(item.vat_amount), 0));
  return {
    subtotalVatable,
    subtotalNonVatable,
    vatAmount,
    grandTotal: roundMoney(subtotalVatable + subtotalNonVatable + vatAmount),
  };
}

function SummaryLine({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div style={strong ? totalLineStyle : summaryLineStyle}>
      <span>{label}</span>
      <strong>{formatMoney(value)}</strong>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div style={detailLabelStyle}>{label}</div>
      <div style={detailValueStyle}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const normalized = String(status || "draft").toLowerCase();
  const style = statusStyles[normalized] || statusStyles.draft;
  return <span style={{ ...badgeStyle, ...style }}>{normalized}</span>;
}

function getReadonlyMessage(status: string | null) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "accepted") return "Accepted quotations are read-only. To change terms, cancel and create a new quotation.";
  if (normalized === "cancelled") return "Cancelled quotations are read-only.";
  if (normalized === "sent") return "Sent quotations cannot edit line items in this phase. Cancel and create a new quotation if terms change.";
  return "Only draft quotations can be edited.";
}

function renderMatterLink(quotation: Pick<QuotationRow, "case_id" | "advisory_matter_id">, lookups: LookupState) {
  if (quotation.case_id) {
    const caseItem = lookups.cases.find((item) => String(item.id) === String(quotation.case_id));
    return caseItem ? `Case: ${renderCaseLabel(caseItem)}` : `Case: ${quotation.case_id}`;
  }
  if (quotation.advisory_matter_id) {
    const matter = lookups.matters.find((item) => item.id === quotation.advisory_matter_id);
    return matter ? `Advisory: ${renderMatterLabel(matter)}` : `Advisory: ${quotation.advisory_matter_id}`;
  }
  return "Unlinked";
}

function renderClientName(clientId: string, clients: ClientRow[]) {
  return clients.find((client) => client.id === clientId)?.name || clientId || "-";
}

function renderCaseLabel(item: CaseRow) {
  return [item.file_no, item.title || item.client_name].filter(Boolean).join(" - ") || String(item.id);
}

function renderMatterLabel(item: MatterRow) {
  return [item.matter_no, item.title].filter(Boolean).join(" - ") || item.id;
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQuantity(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatDate(value?: string | null) {
  return value ? String(value).slice(0, 10) : "-";
}

function getDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toAmount(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const pageStyle: CSSProperties = {
  maxWidth: "1180px",
  margin: "0 auto",
  padding: "24px",
};

const cardStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 18,
  marginBottom: 16,
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

const subNavStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 18,
};

const subNavLinkStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 999,
  padding: "8px 12px",
  color: "#374151",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 600,
};

const subNavActiveLinkStyle: CSSProperties = {
  ...subNavLinkStyle,
  background: "#111827",
  borderColor: "#111827",
  color: "#ffffff",
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 14,
};

const pageTitleStyle: CSSProperties = { margin: 0, fontSize: 26, color: "#111827" };
const sectionTitleStyle: CSSProperties = { margin: 0, fontSize: 18, color: "#111827" };
const mutedTextStyle: CSSProperties = { color: "#6b7280", margin: "6px 0 0", fontSize: 13 };
const noticeTextStyle: CSSProperties = { color: "#92400e", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 6, padding: "8px 10px", margin: "10px 0 0", fontSize: 13, fontWeight: 700 };

const tableWrapStyle: CSSProperties = { overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 900 };
const thStyle: CSSProperties = { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e5e7eb", fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" };
const rightThStyle: CSSProperties = { ...thStyle, textAlign: "right" };
const tdStyle: CSSProperties = { padding: "10px 8px", borderBottom: "1px solid #f3f4f6", fontSize: 13, verticalAlign: "top" };
const rightTdStyle: CSSProperties = { ...tdStyle, textAlign: "right", whiteSpace: "nowrap" };

const linkStyle: CSSProperties = { color: "#1d4ed8", fontWeight: 700, textDecoration: "none" };
const primaryButtonStyle: CSSProperties = { border: "1px solid #111827", background: "#111827", color: "#ffffff", borderRadius: 6, padding: "9px 12px", fontWeight: 700, fontSize: 13, textDecoration: "none", cursor: "pointer" };
const secondaryButtonStyle: CSSProperties = { border: "1px solid #d1d5db", background: "#ffffff", color: "#111827", borderRadius: 6, padding: "9px 12px", fontWeight: 700, fontSize: 13, textDecoration: "none", cursor: "pointer" };
const smallButtonStyle: CSSProperties = { ...secondaryButtonStyle, padding: "6px 10px", fontSize: 12 };
const dangerButtonStyle: CSSProperties = { ...secondaryButtonStyle, borderColor: "#b91c1c", color: "#b91c1c" };
const dangerSmallButtonStyle: CSSProperties = { ...dangerButtonStyle, padding: "6px 10px", fontSize: 12 };
const actionGroupStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" };

const formGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 };
const labelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, color: "#374151", fontSize: 13, fontWeight: 700, minWidth: 0 };
const inputStyle: CSSProperties = { width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "9px 10px", fontSize: 14, minWidth: 0 };
const compactInputStyle: CSSProperties = { ...inputStyle, width: 110, textAlign: "right" };
const vatInputStyle: CSSProperties = { ...inputStyle, width: 80, marginTop: 6 };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 88, resize: "vertical" };
const checkboxLabelStyle: CSSProperties = { display: "flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 600 };
const buttonRowStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", marginTop: 16 };

const totalsGridStyle: CSSProperties = { maxWidth: 420, marginLeft: "auto", marginTop: 16, display: "grid", gap: 8 };
const summaryLineStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, fontSize: 14, color: "#374151" };
const totalLineStyle: CSSProperties = { ...summaryLineStyle, fontSize: 16, color: "#111827", borderTop: "1px solid #e5e7eb", paddingTop: 8 };

const detailGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 };
const detailLabelStyle: CSSProperties = { color: "#6b7280", fontSize: 12, fontWeight: 700, marginBottom: 4 };
const detailValueStyle: CSSProperties = { color: "#111827", fontSize: 14, fontWeight: 600 };

const badgeStyle: CSSProperties = { display: "inline-flex", borderRadius: 999, padding: "4px 9px", fontSize: 12, fontWeight: 800, textTransform: "capitalize" };
const statusStyles: Record<string, CSSProperties> = {
  draft: { background: "#f3f4f6", color: "#374151" },
  sent: { background: "#dbeafe", color: "#1e40af" },
  accepted: { background: "#dcfce7", color: "#166534" },
  cancelled: { background: "#fee2e2", color: "#991b1b" },
};
