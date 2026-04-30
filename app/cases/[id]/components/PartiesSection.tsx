"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabase";

type PartyRole = "plaintiff" | "defendant" | "petitioner" | "objector";
type PartyEntityType = "individual" | "company";

type PartyItem = {
  id: string;
  case_id: number;

  role?: PartyRole;
  entity_type?: PartyEntityType;

  title?: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;

  id_number?: string;
  phone?: string;

  address_no?: string;
  moo?: string;
  village_name?: string;
  building?: string;
  floor?: string;
  room?: string;
  soi?: string;
  road?: string;
  subdistrict?: string;
  district?: string;
  province?: string;
  postal_code?: string;

  order_no?: number;
};

type Props = {
  caseId: number;
};

export default function PartiesSection({ caseId }: Props) {
  const [parties, setParties] = useState<PartyItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const emptyForm = {
    role: "plaintiff" as PartyRole,
    entity_type: "individual" as PartyEntityType,
    title: "นาย",
    first_name: "",
    last_name: "",
    company_name: "",
    phone: "",
  };

  const [form, setForm] = useState(emptyForm);

  // ===== LOAD =====
  const loadParties = async () => {
    const { data } = await supabase
      .from("parties")
      .select("*")
      .eq("case_id", caseId)
      .order("order_no", { ascending: true });

    if (data) setParties(data);
  };

  useEffect(() => {
    loadParties();
  }, []);

  // ===== CREATE =====
  const createParty = async () => {
    await supabase.from("parties").insert([
      {
        case_id: caseId,
        ...form,
      },
    ]);

    setShowForm(false);
    setForm(emptyForm);
    loadParties();
  };

  // ===== UPDATE =====
  const updateParty = async () => {
    if (!editingId) return;

    await supabase
      .from("parties")
      .update(form)
      .eq("id", editingId);

    setEditingId(null);
    setShowForm(false);
    loadParties();
  };

  // ===== DELETE =====
  const deleteParty = async (id: string) => {
    await supabase.from("parties").delete().eq("id", id);
    loadParties();
  };

  const startEdit = (p: PartyItem) => {
    setEditingId(p.id);
    setShowForm(true);
    setForm({
      role: p.role || "plaintiff",
      entity_type: p.entity_type || "individual",
      title: p.title || "นาย",
      first_name: p.first_name || "",
      last_name: p.last_name || "",
      company_name: p.company_name || "",
      phone: p.phone || "",
    });
  };

  // ===== GROUP =====
  const grouped = useMemo(() => {
    return {
      plaintiff: parties.filter((p) => p.role === "plaintiff"),
      defendant: parties.filter((p) => p.role === "defendant"),
      petitioner: parties.filter((p) => p.role === "petitioner"),
      objector: parties.filter((p) => p.role === "objector"),
    };
  }, [parties]);

  const renderName = (p: PartyItem) => {
    if (p.entity_type === "company") return p.company_name;
    return `${p.title}${p.first_name} ${p.last_name}`;
  };

  return (
    <div style={{ border: "1px solid #ddd", padding: 16, borderRadius: 10 }}>
      <h3>Parties</h3>

      {!showForm ? (
        <button onClick={() => setShowForm(true)}>+ Add Party</button>
      ) : (
        <button onClick={() => setShowForm(false)}>Cancel</button>
      )}

      {/* ===== FORM ===== */}
      {showForm && (
        <div style={{ marginTop: 16 }}>
          <input
            placeholder="First name"
            value={form.first_name}
            onChange={(e) =>
              setForm({ ...form, first_name: e.target.value })
            }
          />

          <input
            placeholder="Last name"
            value={form.last_name}
            onChange={(e) =>
              setForm({ ...form, last_name: e.target.value })
            }
          />

          <button
            onClick={editingId ? updateParty : createParty}
            style={{ marginLeft: 10 }}
          >
            Save
          </button>
        </div>
      )}

      {/* ===== LIST ===== */}
      {Object.entries(grouped).map(([role, list]) => {
        if (list.length === 0) return null;

        return (
          <div key={role} style={{ marginTop: 20 }}>
            <b>{role.toUpperCase()}</b>

            {list.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 8,
                }}
              >
                <span>{renderName(p)}</span>

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => startEdit(p)}>Edit</button>
                  <button onClick={() => deleteParty(p.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}