"use client";
import { useCaseDetailText } from "../labels";

import CaseEditModal from "../CaseEditModal";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../../../../lib/supabase";
import { createAuditLog } from "../../../../lib/auditLog";

type PartyRole = "plaintiff" | "defendant" | "petitioner" | "objector";
type PartyEntityType = "individual" | "company";

type PartyItem = {
  id: string;
  case_id: number;

  role?: PartyRole | null;
  entity_type?: PartyEntityType | null;

  title?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;

  id_number?: string | null;
  phone?: string | null;

  address_no?: string | null;
  moo?: string | null;
  village_name?: string | null;
  building?: string | null;
  floor?: string | null;
  room?: string | null;
  soi?: string | null;
  road?: string | null;
  subdistrict?: string | null;
  district?: string | null;
  province?: string | null;
  postal_code?: string | null;

  order_no?: number | null;
  created_at?: string | null;
  updated_at?: string | null;

  deleted_at?: string | null;
  deleted_by?: string | null;
};

type PartyForm = {
  role: PartyRole;
  entity_type: PartyEntityType;

  order_no: string;

  title: string;
  first_name: string;
  last_name: string;
  company_name: string;

  id_number: string;
  phone: string;

  address_no: string;
  moo: string;
  village_name: string;
  building: string;
  floor: string;
  room: string;
  soi: string;
  road: string;
  subdistrict: string;
  district: string;
  province: string;
  postal_code: string;
};

type Props = {
  caseId: number;
  canEdit?: boolean;
  canDelete?: boolean;
};

const emptyForm: PartyForm = {
  role: "plaintiff",
  entity_type: "individual",

  order_no: "1",

  title: "นาย",
  first_name: "",
  last_name: "",
  company_name: "",

  id_number: "",
  phone: "",

  address_no: "",
  moo: "",
  village_name: "",
  building: "",
  floor: "",
  room: "",
  soi: "",
  road: "",
  subdistrict: "",
  district: "",
  province: "",
  postal_code: "",
};

export default function PartiesSection({
  caseId,
  canEdit = false,
  canDelete = false,
}: Props) {
  const { tr } = useCaseDetailText();
  const [parties, setParties] = useState<PartyItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState<PartyForm>(emptyForm);


  const loadParties = async () => {
    if (!caseId) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("parties")
        .select("*")
        .eq("case_id", caseId)
        .is("deleted_at", null)
        .order("role", { ascending: true })
        .order("order_no", { ascending: true });

      if (error) {
        alert(tr("Load parties failed:\n" + JSON.stringify(error, null, 2)));
        setParties([]);
        return;
      }

      setParties((data || []) as PartyItem[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadParties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const getNextOrderNo = (role: PartyRole) => {
    const sameRole = parties.filter((p) => p.role === role);
    const maxOrder = sameRole.reduce((max, p) => {
      const order = p.order_no || 0;
      return order > max ? order : max;
    }, 0);

    return maxOrder + 1;
  };

  const startAdd = () => {
    if (!canEdit) {
      alert(tr("คุณไม่มีสิทธิ์เพิ่มคู่ความ/ผู้เกี่ยวข้อง"));
      return;
    }

    setEditingId(null);
    setForm({
      ...emptyForm,
      order_no: String(getNextOrderNo("plaintiff")),
    });
    setShowForm(true);

  };

  const cancelForm = () => {
    setEditingId(null);
    setShowForm(false);
    setForm(emptyForm);
  };

  const startEdit = (party: PartyItem) => {
    if (!canEdit) {
      alert(tr("คุณไม่มีสิทธิ์แก้ไขคู่ความ/ผู้เกี่ยวข้อง"));
      return;
    }

    setEditingId(party.id);
    setShowForm(true);


    setForm({
      role: party.role || "plaintiff",
      entity_type: party.entity_type || "individual",

      order_no: party.order_no ? String(party.order_no) : "1",

      title: party.title || "นาย",
      first_name: party.first_name || "",
      last_name: party.last_name || "",
      company_name: party.company_name || "",

      id_number: party.id_number || "",
      phone: party.phone || "",

      address_no: party.address_no || "",
      moo: party.moo || "",
      village_name: party.village_name || "",
      building: party.building || "",
      floor: party.floor || "",
      room: party.room || "",
      soi: party.soi || "",
      road: party.road || "",
      subdistrict: party.subdistrict || "",
      district: party.district || "",
      province: party.province || "",
      postal_code: party.postal_code || "",
    });
  };

  const buildPayload = () => {
    const now = new Date().toISOString();

    return {
      case_id: caseId,
      role: form.role,
      entity_type: form.entity_type,
      order_no: form.order_no ? Number(form.order_no) : null,

      title: form.entity_type === "individual" ? form.title : "",
      first_name: form.entity_type === "individual" ? form.first_name : "",
      last_name: form.entity_type === "individual" ? form.last_name : "",
      company_name: form.entity_type === "company" ? form.company_name : "",

      id_number: form.id_number,
      phone: form.phone,

      address_no: form.address_no,
      moo: form.moo,
      village_name: form.village_name,
      building: form.building,
      floor: form.floor,
      room: form.room,
      soi: form.soi,
      road: form.road,
      subdistrict: form.subdistrict,
      district: form.district,
      province: form.province,
      postal_code: form.postal_code,

      updated_at: now,
    };
  };

  const validateForm = () => {
    if (!caseId) {
      alert(tr("Missing case id"));
      return false;
    }

    if (!form.role) {
      alert(tr("กรุณาเลือก Role"));
      return false;
    }

    if (!form.entity_type) {
      alert(tr("กรุณาเลือก Type"));
      return false;
    }

    if (form.entity_type === "individual") {
      if (!form.first_name.trim() && !form.last_name.trim()) {
        alert(tr("กรุณากรอกชื่อหรือนามสกุล"));
        return false;
      }
    }

    if (form.entity_type === "company") {
      if (!form.company_name.trim()) {
        alert(tr("กรุณากรอกชื่อนิติบุคคล"));
        return false;
      }
    }

    return true;
  };

  const createParty = async () => {
    if (!canEdit) {
      alert(tr("คุณไม่มีสิทธิ์เพิ่มคู่ความ/ผู้เกี่ยวข้อง"));
      cancelForm();
      return;
    }

    if (!validateForm()) return;

    try {
      setSaving(true);

      const payload = {
        ...buildPayload(),
        created_at: new Date().toISOString(),
        deleted_at: null,
        deleted_by: null,
      };

      const { data, error } = await supabase
        .from("parties")
        .insert([payload])
        .select("*")
        .single();

      if (error) {
        alert(tr("Create party failed:\n" + JSON.stringify(error, null, 2)));
        return;
      }

      await createAuditLog({
        caseId,
        tableName: "parties",
        recordId: data?.id,
        action: "create",
        oldData: null,
        newData: data || payload,
        note: "Create party",
      });
      window.dispatchEvent(new Event("case-detail-updated"));

      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      await loadParties();
    } finally {
      setSaving(false);
    }
  };

  const updateParty = async () => {
    if (!canEdit) {
      alert(tr("คุณไม่มีสิทธิ์แก้ไขคู่ความ/ผู้เกี่ยวข้อง"));
      cancelForm();
      return;
    }

    if (!editingId) return;
    if (!validateForm()) return;

    try {
      setSaving(true);

      const oldData = parties.find((party) => party.id === editingId) || null;
      const payload = buildPayload();

      const { data, error } = await supabase
        .from("parties")
        .update(payload)
        .eq("id", editingId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) {
        alert(tr("Update party failed:\n" + JSON.stringify(error, null, 2)));
        return;
      }

      await createAuditLog({
        caseId,
        tableName: "parties",
        recordId: editingId,
        action: "update",
        oldData,
        newData: data || (oldData ? { ...oldData, ...payload } : payload),
        note: "Update party",
      });
      window.dispatchEvent(new Event("case-detail-updated"));

      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      await loadParties();
    } finally {
      setSaving(false);
    }
  };

  const deleteParty = async (id: string) => {
    if (!canDelete) {
      alert(tr("คุณไม่มีสิทธิ์ลบคู่ความ/ผู้เกี่ยวข้อง"));
      return;
    }

    const confirmed = window.confirm(
      tr("ต้องการลบคู่ความ/ผู้เกี่ยวข้องรายนี้หรือไม่?\n\nระบบจะซ่อนรายการนี้ออกจากหน้าใช้งาน แต่ยังเก็บข้อมูลไว้ในฐานข้อมูลเพื่อใช้ตรวจสอบย้อนหลัง")
    );

    if (!confirmed) return;

    try {
      setSaving(true);

      const oldData = parties.find((party) => party.id === id) || null;

      const payload = {
        deleted_at: new Date().toISOString(),
        deleted_by: "current_user",
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("parties")
        .update(payload)
        .eq("id", id)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) {
        alert(tr("Soft delete party failed:\n" + JSON.stringify(error, null, 2)));
        return;
      }

      await createAuditLog({
        caseId,
        tableName: "parties",
        recordId: id,
        action: "soft_delete",
        oldData,
        newData: data || (oldData ? { ...oldData, ...payload } : payload),
        note: "Soft delete party",
      });
      window.dispatchEvent(new Event("case-detail-updated"));

      if (editingId === id) cancelForm();

      await loadParties();
    } finally {
      setSaving(false);
    }
  };

  const grouped = useMemo(() => {
    return {
      plaintiff: parties.filter((p) => p.role === "plaintiff"),
      defendant: parties.filter((p) => p.role === "defendant"),
      petitioner: parties.filter((p) => p.role === "petitioner"),
      objector: parties.filter((p) => p.role === "objector"),
    };
  }, [parties]);

  const totalParties = parties.length;

  return (
    <div style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>{tr("Parties")} </h3>
          <div style={subTitleStyle}>
            {tr("คู่ความและผู้เกี่ยวข้องในคดี · รวม")} {totalParties} {tr("รายการ")} </div>
        </div>

        {!showForm ? (
          canEdit ? (
            <button type="button" onClick={startAdd} style={primaryButtonStyle}>
              {tr("+ Add Party")} </button>
          ) : null
        ) : (
          <button type="button" onClick={cancelForm} style={secondaryButtonStyle}>
            {tr("Cancel")} </button>
        )}
      </div>

      {showForm && (
        <CaseEditModal title={editingId ? tr("Edit Party") : tr("Add Party")} onClose={cancelForm} busy={saving}>


          <div style={formSectionStyle}>
            <div style={formSectionTitleStyle}>{tr("Identity")} </div>

            <div style={formGridStyle}>
              <Select
                label={tr("Role")}
                value={form.role}
                onChange={(value) => {
                  const role = value as PartyRole;
                  setForm({
                    ...form,
                    role,
                    order_no: editingId
                      ? form.order_no
                      : String(getNextOrderNo(role)),
                  });
                }}
                options={[
                  { value: "plaintiff", label: "Plaintiff (โจทก์)" },
                  { value: "defendant", label: "Defendant (จำเลย)" },
                  { value: "petitioner", label: "Petitioner (ผู้ร้อง)" },
                  { value: "objector", label: "Objector (ผู้คัดค้าน)" },
                ]}
              />

              <Input
                label={tr("Order No.")}
                value={form.order_no}
                onChange={(value) =>
                  setForm({
                    ...form,
                    order_no: value.replace(/\D/g, ""),
                  })
                }
              />

              <Select
                label={tr("Type")}
                value={form.entity_type}
                onChange={(value) =>
                  setForm({
                    ...form,
                    entity_type: value as PartyEntityType,
                  })
                }
                options={[
                  { value: "individual", label: "Individual (บุคคลธรรมดา)" },
                  { value: "company", label: "Company (นิติบุคคล)" },
                ]}
              />

              {form.entity_type === "individual" ? (
                <>
                  <Select
                    label={tr("Title")}
                    value={form.title}
                    onChange={(value) => setForm({ ...form, title: value })}
                    options={[
                      { value: "นาย", label: "นาย" },
                      { value: "นาง", label: "นาง" },
                      { value: "นางสาว", label: "นางสาว" },
                      { value: "เด็กชาย", label: "เด็กชาย" },
                      { value: "เด็กหญิง", label: "เด็กหญิง" },
                      { value: "", label: "ไม่ระบุ" },
                    ]}
                  />

                  <Input
                    label={tr("First Name")}
                    value={form.first_name}
                    onChange={(value) => setForm({ ...form, first_name: value })}
                  />

                  <Input
                    label={tr("Last Name")}
                    value={form.last_name}
                    onChange={(value) => setForm({ ...form, last_name: value })}
                  />
                </>
              ) : (
                <div style={{ gridColumn: "span 2" }}>
                  <Input
                    label={tr("Company Name")}
                    value={form.company_name}
                    onChange={(value) =>
                      setForm({ ...form, company_name: value })
                    }
                  />
                </div>
              )}

              <Input
                label={tr("ID No. / Tax ID")}
                value={form.id_number}
                onChange={(value) => setForm({ ...form, id_number: value })}
              />

              <Input
                label={tr("Phone")}
                value={form.phone}
                onChange={(value) => setForm({ ...form, phone: value })}
              />
            </div>
          </div>

          <div style={formSectionStyle}>
            <div style={formSectionTitleStyle}>{tr("Address")} </div>

            <div style={formGridStyle}>
              <Input
                label={tr("Address No.")}
                value={form.address_no}
                onChange={(value) => setForm({ ...form, address_no: value })}
              />

              <Input
                label={tr("Moo")}
                value={form.moo}
                onChange={(value) => setForm({ ...form, moo: value })}
              />

              <Input
                label={tr("Village")}
                value={form.village_name}
                onChange={(value) => setForm({ ...form, village_name: value })}
              />

              <Input
                label={tr("Building")}
                value={form.building}
                onChange={(value) => setForm({ ...form, building: value })}
              />

              <Input
                label={tr("Floor")}
                value={form.floor}
                onChange={(value) => setForm({ ...form, floor: value })}
              />

              <Input
                label={tr("Room")}
                value={form.room}
                onChange={(value) => setForm({ ...form, room: value })}
              />

              <Input
                label={tr("Soi")}
                value={form.soi}
                onChange={(value) => setForm({ ...form, soi: value })}
              />

              <Input
                label={tr("Road")}
                value={form.road}
                onChange={(value) => setForm({ ...form, road: value })}
              />

              <Input
                label={tr("Subdistrict")}
                value={form.subdistrict}
                onChange={(value) => setForm({ ...form, subdistrict: value })}
              />

              <Input
                label={tr("District")}
                value={form.district}
                onChange={(value) => setForm({ ...form, district: value })}
              />

              <Input
                label={tr("Province")}
                value={form.province}
                onChange={(value) => setForm({ ...form, province: value })}
              />

              <Input
                label={tr("Postal Code")}
                value={form.postal_code}
                onChange={(value) => setForm({ ...form, postal_code: value })}
              />
            </div>
          </div>

          <div style={formButtonWrapStyle}>
            <button
              type="button"
              onClick={editingId ? updateParty : createParty}
              disabled={saving}
              style={primaryButtonStyle}
            >
              {saving ? tr("Saving...") : tr("Save")}
            </button>

            <button
              type="button"
              onClick={cancelForm}
              disabled={saving}
              style={secondaryButtonStyle}
            >
              {tr("Cancel")} </button>
          </div>
        </CaseEditModal>
      )}

      {loading ? (
        <div style={emptyStyle}>{tr("Loading parties...")} </div>
      ) : parties.length === 0 ? (
        <div style={emptyStyle}>{tr("No parties added.")} </div>
      ) : (
        <div style={partyGroupWrapStyle}>
          <PartyGroup
            title={tr("Plaintiff")}
            subtitle={tr("โจทก์")}
            parties={grouped.plaintiff}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={startEdit}
            onDelete={deleteParty}
          />

          <PartyGroup
            title={tr("Defendant")}
            subtitle={tr("จำเลย")}
            parties={grouped.defendant}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={startEdit}
            onDelete={deleteParty}
          />

          <PartyGroup
            title={tr("Petitioner")}
            subtitle={tr("ผู้ร้อง")}
            parties={grouped.petitioner}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={startEdit}
            onDelete={deleteParty}
          />

          <PartyGroup
            title={tr("Objector")}
            subtitle={tr("ผู้คัดค้าน")}
            parties={grouped.objector}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={startEdit}
            onDelete={deleteParty}
          />
        </div>
      )}
    </div>
  );
}

/* =========================================================
   SUB COMPONENTS
========================================================= */

function PartyGroup({
  title,
  subtitle,
  parties,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  title: string;
  subtitle: string;
  parties: PartyItem[];
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (party: PartyItem) => void;
  onDelete: (id: string) => void;
}) {
  if (parties.length === 0) return null;

  return (
    <div style={partyGroupStyle}>
      <div style={partyGroupTitleStyle}>
        <div>
          {title} <span style={partyGroupSubtitleStyle}>{subtitle}</span>
        </div>
        <span style={countBadgeStyle}>{parties.length}</span>
      </div>

      <div style={partyCardGridStyle}>
        {parties.map((party) => (
          <PartyCard
            key={party.id}
            party={party}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

function PartyCard({
  party,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  party: PartyItem;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (party: PartyItem) => void;
  onDelete: (id: string) => void;
}) {
  const { tr } = useCaseDetailText();
  const showActions = canEdit || canDelete;

  return (
    <div style={partyCardStyle}>
      <div style={partyCardHeaderStyle}>
        <div>
          <div style={partyNameStyle}>{tr(renderPartyName(party))}</div>
          <div style={partyMetaStyle}>
            {tr(renderRole(party.role))} {tr("No.")} {party.order_no || "-"} ·{" "}
            {party.entity_type === "company" ? tr("Company") : tr("Individual")}
          </div>
        </div>
      </div>

      <div style={partyInfoGridStyle}>
        <InfoLine label={tr("ID / Tax ID")} value={party.id_number || "-"} />
        <InfoLine label={tr("Phone")} value={party.phone || "-"} />
      </div>

      <div style={addressTextStyle}>
        <div style={infoLabelStyle}>{tr("Address")} </div>
        <div style={addressValueStyle}>{tr(renderAddress(party)) || "-"}</div>
      </div>

      {showActions && (
        <div style={partyActionStyle}>
          {canEdit && (
            <button
              type="button"
              onClick={() => onEdit(party)}
              style={smallButtonStyle}
            >
              {tr("Edit")} </button>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(party.id)}
              style={dangerButtonStyle}
            >
              {tr("Delete")} </button>
          )}
        </div>
      )}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  const { tr } = useCaseDetailText();
  return (
    <div style={infoLineStyle}>
      <div style={infoLabelStyle}>{tr(label)}</div>
      <div style={infoValueStyle}>{value}</div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { tr } = useCaseDetailText();
  return (
    <div>
      <label style={labelStyle}>{tr(label)}</label>
      <input aria-label={tr(label)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </div>
  );
}

function Select({
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
  const { tr } = useCaseDetailText();
  return (
    <div>
      <label style={labelStyle}>{tr(label)}</label>
      <select aria-label={tr(label)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {tr(option.label)}
          </option>
        ))}
      </select>
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function renderPartyName(party: PartyItem) {
  const orderText = party.order_no ? ` ที่ ${party.order_no}` : "";

  if (party.entity_type === "company") {
    const companyName = party.company_name || "-";
    return `${companyName}${orderText}`;
  }

  const title = party.title || "";
  const firstName = party.first_name || "";
  const lastName = party.last_name || "";

  const fullName = `${title}${firstName} ${lastName}`.trim();

  return fullName ? `${fullName}${orderText}` : "-";
}

function renderRole(role?: PartyRole | null) {
  if (role === "plaintiff") return "Plaintiff";
  if (role === "defendant") return "Defendant";
  if (role === "petitioner") return "Petitioner";
  if (role === "objector") return "Objector";
  return "-";
}

function renderAddress(party: PartyItem) {
  const parts = [
    party.address_no ? `เลขที่ ${party.address_no}` : "",
    party.moo ? `หมู่ ${party.moo}` : "",
    party.village_name ? `หมู่บ้าน${party.village_name}` : "",
    party.building ? `อาคาร${party.building}` : "",
    party.floor ? `ชั้น ${party.floor}` : "",
    party.room ? `ห้อง ${party.room}` : "",
    party.soi ? `ซอย${party.soi}` : "",
    party.road ? `ถนน${party.road}` : "",
    party.subdistrict ? `แขวง/ตำบล${party.subdistrict}` : "",
    party.district ? `เขต/อำเภอ${party.district}` : "",
    party.province ? `จังหวัด${party.province}` : "",
    party.postal_code || "",
  ];

  return parts.filter(Boolean).join(" ");
}

/* =========================================================
   STYLES
========================================================= */

const sectionStyle: CSSProperties = {
  border: "1px solid #dddddd",
  padding: "clamp(12px, 2vw, 16px)",
  borderRadius: 14,
  background: "#ffffff",
  color: "#183854",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 14,
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#183854",
  fontSize: 18,
  fontWeight: 700,
};

const subTitleStyle: CSSProperties = {
  marginTop: 3,
  color: "#666666",
  fontSize: 13,
  lineHeight: 1.45,
};

const primaryButtonStyle: CSSProperties = {
  padding: "8px 13px",
  background: "#000000",
  color: "#ffffff",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
  whiteSpace: "nowrap",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "8px 13px",
  background: "#ffffff",
  color: "#183854",
  borderRadius: 8,
  border: "1px solid #cccccc",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
  whiteSpace: "nowrap",
};


const formSectionStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 12,
  padding: 12,
  background: "#ffffff",
  marginBottom: 10,
};

const formSectionTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#183854",
  marginBottom: 10,
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 3,
  color: "#777777",
  fontWeight: 700,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 9px",
  borderRadius: 8,
  border: "1px solid #bbbbbb",
  background: "#ffffff",
  color: "#183854",
  colorScheme: "light",
  boxSizing: "border-box",
  fontSize: 13,
};

const formButtonWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 12,
  flexWrap: "wrap",
};

const emptyStyle: CSSProperties = {
  padding: 14,
  border: "1px dashed #cccccc",
  borderRadius: 12,
  color: "#555555",
  background: "#ffffff",
  fontSize: 13,
  fontWeight: 700,
};

const partyGroupWrapStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const partyGroupStyle: CSSProperties = {
  display: "grid",
  gap: 9,
};

const partyGroupTitleStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  fontSize: 15,
  fontWeight: 700,
  color: "#183854",
  paddingTop: 10,
  borderTop: "1px solid #eeeeee",
};

const partyGroupSubtitleStyle: CSSProperties = {
  color: "#666666",
  fontSize: 12,
  fontWeight: 700,
};

const countBadgeStyle: CSSProperties = {
  display: "inline-flex",
  minWidth: 26,
  justifyContent: "center",
  padding: "4px 8px",
  borderRadius: 999,
  background: "#f1f5f9",
  color: "#475467",
  border: "1px solid #d0d5dd",
  fontSize: 12,
  fontWeight: 700,
};

const partyCardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: 10,
};

const partyCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 12,
  background: "#ffffff",
  color: "#183854",
  boxShadow: "0 1px 6px rgba(0,0,0,0.04)",
};

const partyCardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
};

const partyNameStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "#183854",
  lineHeight: 1.4,
  wordBreak: "break-word",
};

const partyMetaStyle: CSSProperties = {
  marginTop: 3,
  fontSize: 12,
  color: "#666666",
  fontWeight: 700,
};

const partyInfoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  marginBottom: 8,
};

const infoLineStyle: CSSProperties = {
  padding: "7px 8px",
  border: "1px solid #eeeeee",
  borderRadius: 10,
  background: "#f7f9fc",
  minWidth: 0,
};

const infoLabelStyle: CSSProperties = {
  fontSize: 11,
  color: "#777777",
  marginBottom: 2,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

const infoValueStyle: CSSProperties = {
  fontSize: 13,
  color: "#183854",
  fontWeight: 700,
  wordBreak: "break-word",
  lineHeight: 1.45,
};

const addressTextStyle: CSSProperties = {
  padding: "8px 9px",
  border: "1px solid #eeeeee",
  borderRadius: 10,
  background: "#f7f9fc",
};

const addressValueStyle: CSSProperties = {
  fontSize: 13,
  color: "#183854",
  fontWeight: 700,
  wordBreak: "break-word",
  lineHeight: 1.5,
};

const partyActionStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid #eeeeee",
  flexWrap: "wrap",
};

const smallButtonStyle: CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #cccccc",
  background: "#ffffff",
  color: "#183854",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};

const dangerButtonStyle: CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #e0b4b4",
  background: "#fff5f5",
  color: "#a40000",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};
