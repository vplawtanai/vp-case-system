"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../../../../lib/supabase";

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

export default function PartiesSection({ caseId }: Props) {
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
        .order("role", { ascending: true })
        .order("order_no", { ascending: true });

      if (error) {
        alert("Load parties failed:\n" + JSON.stringify(error, null, 2));
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

  const startAdd = () => {
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

  const getNextOrderNo = (role: PartyRole) => {
    const sameRole = parties.filter((p) => p.role === role);
    const maxOrder = sameRole.reduce((max, p) => {
      const order = p.order_no || 0;
      return order > max ? order : max;
    }, 0);

    return maxOrder + 1;
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
      alert("Missing case id");
      return false;
    }

    if (!form.role) {
      alert("กรุณาเลือก Role");
      return false;
    }

    if (!form.entity_type) {
      alert("กรุณาเลือก Type");
      return false;
    }

    if (form.entity_type === "individual") {
      if (!form.first_name.trim() && !form.last_name.trim()) {
        alert("กรุณากรอกชื่อหรือนามสกุล");
        return false;
      }
    }

    if (form.entity_type === "company") {
      if (!form.company_name.trim()) {
        alert("กรุณากรอกชื่อนิติบุคคล");
        return false;
      }
    }

    return true;
  };

  const createParty = async () => {
    if (!validateForm()) return;

    try {
      setSaving(true);

      const payload = {
        ...buildPayload(),
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("parties").insert([payload]);

      if (error) {
        alert("Create party failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      await loadParties();
    } finally {
      setSaving(false);
    }
  };

  const updateParty = async () => {
    if (!editingId) return;
    if (!validateForm()) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from("parties")
        .update(buildPayload())
        .eq("id", editingId);

      if (error) {
        alert("Update party failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      await loadParties();
    } finally {
      setSaving(false);
    }
  };

  const deleteParty = async (id: string) => {
    const confirmed = window.confirm("ต้องการลบคู่ความ/ผู้เกี่ยวข้องรายนี้หรือไม่?");
    if (!confirmed) return;

    const { error } = await supabase.from("parties").delete().eq("id", id);

    if (error) {
      alert("Delete party failed:\n" + JSON.stringify(error, null, 2));
      return;
    }

    await loadParties();
  };

  const grouped = useMemo(() => {
    return {
      plaintiff: parties.filter((p) => p.role === "plaintiff"),
      defendant: parties.filter((p) => p.role === "defendant"),
      petitioner: parties.filter((p) => p.role === "petitioner"),
      objector: parties.filter((p) => p.role === "objector"),
    };
  }, [parties]);

  return (
    <div style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Parties</h3>
          <div style={subTitleStyle}>คู่ความและผู้เกี่ยวข้องในคดี</div>
        </div>

        {!showForm ? (
          <button type="button" onClick={startAdd} style={primaryButtonStyle}>
            + Add Party
          </button>
        ) : (
          <button type="button" onClick={cancelForm} style={secondaryButtonStyle}>
            Cancel
          </button>
        )}
      </div>

      {showForm && (
        <div style={formCardStyle}>
          <h4 style={formTitleStyle}>
            {editingId ? "Edit Party" : "Add Party"}
          </h4>

          <div style={formGridStyle}>
            <Select
              label="Role"
              value={form.role}
              onChange={(value) => {
                const role = value as PartyRole;
                setForm({
                  ...form,
                  role,
                  order_no: editingId ? form.order_no : String(getNextOrderNo(role)),
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
              label="Order No."
              value={form.order_no}
              onChange={(value) =>
                setForm({
                  ...form,
                  order_no: value.replace(/\D/g, ""),
                })
              }
            />

            <Select
              label="Type"
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
                  label="Title"
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
                  label="First Name"
                  value={form.first_name}
                  onChange={(value) => setForm({ ...form, first_name: value })}
                />

                <Input
                  label="Last Name"
                  value={form.last_name}
                  onChange={(value) => setForm({ ...form, last_name: value })}
                />
              </>
            ) : (
              <Input
                label="Company Name"
                value={form.company_name}
                onChange={(value) => setForm({ ...form, company_name: value })}
              />
            )}

            <Input
              label="ID No. / Tax ID"
              value={form.id_number}
              onChange={(value) => setForm({ ...form, id_number: value })}
            />

            <Input
              label="Phone"
              value={form.phone}
              onChange={(value) => setForm({ ...form, phone: value })}
            />
          </div>

          <div style={addressBlockStyle}>
            <div style={addressTitleStyle}>Address</div>

            <div style={formGridStyle}>
              <Input
                label="Address No."
                value={form.address_no}
                onChange={(value) => setForm({ ...form, address_no: value })}
              />

              <Input
                label="Moo"
                value={form.moo}
                onChange={(value) => setForm({ ...form, moo: value })}
              />

              <Input
                label="Village"
                value={form.village_name}
                onChange={(value) => setForm({ ...form, village_name: value })}
              />

              <Input
                label="Building"
                value={form.building}
                onChange={(value) => setForm({ ...form, building: value })}
              />

              <Input
                label="Floor"
                value={form.floor}
                onChange={(value) => setForm({ ...form, floor: value })}
              />

              <Input
                label="Room"
                value={form.room}
                onChange={(value) => setForm({ ...form, room: value })}
              />

              <Input
                label="Soi"
                value={form.soi}
                onChange={(value) => setForm({ ...form, soi: value })}
              />

              <Input
                label="Road"
                value={form.road}
                onChange={(value) => setForm({ ...form, road: value })}
              />

              <Input
                label="Subdistrict"
                value={form.subdistrict}
                onChange={(value) => setForm({ ...form, subdistrict: value })}
              />

              <Input
                label="District"
                value={form.district}
                onChange={(value) => setForm({ ...form, district: value })}
              />

              <Input
                label="Province"
                value={form.province}
                onChange={(value) => setForm({ ...form, province: value })}
              />

              <Input
                label="Postal Code"
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
              {saving ? "Saving..." : "Save"}
            </button>

            <button
              type="button"
              onClick={cancelForm}
              disabled={saving}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={emptyStyle}>Loading parties...</div>
      ) : parties.length === 0 ? (
        <div style={emptyStyle}>No parties added.</div>
      ) : (
        <div style={partyGroupWrapStyle}>
          <PartyGroup
            title="Plaintiff"
            subtitle="โจทก์"
            parties={grouped.plaintiff}
            onEdit={startEdit}
            onDelete={deleteParty}
          />

          <PartyGroup
            title="Defendant"
            subtitle="จำเลย"
            parties={grouped.defendant}
            onEdit={startEdit}
            onDelete={deleteParty}
          />

          <PartyGroup
            title="Petitioner"
            subtitle="ผู้ร้อง"
            parties={grouped.petitioner}
            onEdit={startEdit}
            onDelete={deleteParty}
          />

          <PartyGroup
            title="Objector"
            subtitle="ผู้คัดค้าน"
            parties={grouped.objector}
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
  onEdit,
  onDelete,
}: {
  title: string;
  subtitle: string;
  parties: PartyItem[];
  onEdit: (party: PartyItem) => void;
  onDelete: (id: string) => void;
}) {
  if (parties.length === 0) return null;

  return (
    <div style={partyGroupStyle}>
      <div style={partyGroupTitleStyle}>
        {title} <span style={partyGroupSubtitleStyle}>{subtitle}</span>
      </div>

      <div style={partyCardGridStyle}>
        {parties.map((party) => (
          <PartyCard
            key={party.id}
            party={party}
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
  onEdit,
  onDelete,
}: {
  party: PartyItem;
  onEdit: (party: PartyItem) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div style={partyCardStyle}>
      <div style={partyCardHeaderStyle}>
        <div>
          <div style={partyNameStyle}>{renderPartyName(party)}</div>
          <div style={partyMetaStyle}>
            {renderRole(party.role)} No. {party.order_no || "-"} •{" "}
            {party.entity_type === "company" ? "Company" : "Individual"}
          </div>
        </div>
      </div>

      <div style={partyInfoGridStyle}>
        <InfoLine label="ID / Tax ID" value={party.id_number || "-"} />
        <InfoLine label="Phone" value={party.phone || "-"} />
      </div>

      <div style={addressTextStyle}>
        <div style={infoLabelStyle}>Address</div>
        <div style={infoValueStyle}>{renderAddress(party) || "-"}</div>
      </div>

      <div style={partyActionStyle}>
        <button type="button" onClick={() => onEdit(party)} style={smallButtonStyle}>
          Edit
        </button>

        <button
          type="button"
          onClick={() => onDelete(party.id)}
          style={dangerButtonStyle}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={infoLabelStyle}>{label}</div>
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
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
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
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
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
  padding: 16,
  borderRadius: 12,
  background: "#ffffff",
  color: "#111111",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 16,
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#111111",
};

const subTitleStyle: CSSProperties = {
  marginTop: 4,
  color: "#555555",
  fontSize: 13,
};

const primaryButtonStyle: CSSProperties = {
  padding: "9px 14px",
  background: "#000000",
  color: "#ffffff",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "9px 14px",
  background: "#ffffff",
  color: "#111111",
  borderRadius: 8,
  border: "1px solid #cccccc",
  cursor: "pointer",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const formCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 16,
  background: "#fafafa",
  marginBottom: 18,
};

const formTitleStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: 12,
  color: "#111111",
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 4,
  color: "#222222",
  fontWeight: 600,
  fontSize: 13,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid #bbbbbb",
  background: "#ffffff",
  color: "#111111",
  colorScheme: "light",
  boxSizing: "border-box",
};

const addressBlockStyle: CSSProperties = {
  marginTop: 16,
};

const addressTitleStyle: CSSProperties = {
  fontWeight: 700,
  marginBottom: 10,
  color: "#111111",
};

const formButtonWrapStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 16,
  flexWrap: "wrap",
};

const emptyStyle: CSSProperties = {
  padding: 16,
  border: "1px dashed #cccccc",
  borderRadius: 12,
  color: "#555555",
  background: "#ffffff",
};

const partyGroupWrapStyle: CSSProperties = {
  display: "grid",
  gap: 18,
};

const partyGroupStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const partyGroupTitleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  color: "#111111",
  paddingTop: 8,
  borderTop: "1px solid #eeeeee",
};

const partyGroupSubtitleStyle: CSSProperties = {
  color: "#666666",
  fontSize: 13,
  fontWeight: 500,
};

const partyCardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
};

const partyCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 14,
  background: "#ffffff",
  color: "#111111",
  boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
};

const partyCardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 12,
};

const partyNameStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  color: "#111111",
};

const partyMetaStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#555555",
};

const partyInfoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  marginBottom: 10,
};

const infoLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#666666",
  marginBottom: 2,
};

const infoValueStyle: CSSProperties = {
  fontSize: 14,
  color: "#111111",
  fontWeight: 600,
  wordBreak: "break-word",
  lineHeight: 1.5,
};

const addressTextStyle: CSSProperties = {
  paddingTop: 8,
  borderTop: "1px solid #eeeeee",
};

const partyActionStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 12,
  paddingTop: 10,
  borderTop: "1px solid #eeeeee",
};

const smallButtonStyle: CSSProperties = {
  padding: "7px 11px",
  borderRadius: 8,
  border: "1px solid #cccccc",
  background: "#ffffff",
  color: "#111111",
  cursor: "pointer",
  fontWeight: 600,
};

const dangerButtonStyle: CSSProperties = {
  padding: "7px 11px",
  borderRadius: 8,
  border: "1px solid #e0b4b4",
  background: "#fff5f5",
  color: "#a40000",
  cursor: "pointer",
  fontWeight: 700,
};