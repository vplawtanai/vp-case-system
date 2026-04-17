"use client";

import { useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../../../lib/firebase";

type FeeItem = {
  id: string;
  feeType?: string;
  description?: string;
  amount?: number;
  paidAmount?: number;
  dueDate?: string;
  status?: string;
  note?: string;
};

type Props = {
  caseId: string;
  fees: FeeItem[];
};

export default function FeesSection({ caseId, fees }: Props) {
  const emptyForm = {
    feeType: "legalFee",
    description: "",
    amount: "",
    paidAmount: "",
    dueDate: "",
    status: "unpaid",
    note: "",
  };

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const totalAmount = useMemo(() => {
    return fees.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [fees]);

  const totalPaid = useMemo(() => {
    return fees.reduce((sum, item) => sum + (Number(item.paidAmount) || 0), 0);
  }, [fees]);

  const totalOutstanding = useMemo(() => {
    return totalAmount - totalPaid;
  }, [totalAmount, totalPaid]);

  const sortedFees = useMemo(() => {
    return [...fees].sort((a, b) => {
      const aDate = a.dueDate || "";
      const bDate = b.dueDate || "";
      return aDate.localeCompare(bDate);
    });
  }, [fees]);

  const renderFeeType = (feeType?: string) => {
    if (feeType === "legalFee") return "Legal Fee";
    if (feeType === "serviceFee") return "Service Fee";
    if (feeType === "other") return "Other";
    return feeType || "-";
  };

  const renderStatus = (status?: string) => {
    if (status === "paid") return "Paid";
    if (status === "partial") return "Partial";
    if (status === "unpaid") return "Unpaid";
    return status || "-";
  };

  const formatNumber = (value?: number) => {
    const num = Number(value) || 0;
    return num.toLocaleString();
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const createFee = async () => {
    if (!form.description || !form.amount) {
      alert("Please fill Description and Amount.");
      return;
    }

    try {
      setSaving(true);

      await addDoc(collection(db, "cases", caseId, "fees"), {
        feeType: form.feeType,
        description: form.description,
        amount: Number(form.amount),
        paidAmount: Number(form.paidAmount || 0),
        dueDate: form.dueDate,
        status: form.status,
        note: form.note,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      resetForm();
    } catch (error) {
      console.error(error);
      alert("Create fee failed.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: FeeItem) => {
    setEditingId(item.id);
    setShowForm(true);
    setForm({
      feeType: item.feeType || "legalFee",
      description: item.description || "",
      amount: String(item.amount || ""),
      paidAmount: String(item.paidAmount || ""),
      dueDate: item.dueDate || "",
      status: item.status || "unpaid",
      note: item.note || "",
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!form.description || !form.amount) {
      alert("Please fill Description and Amount.");
      return;
    }

    try {
      setSaving(true);

      await updateDoc(doc(db, "cases", caseId, "fees", editingId), {
        feeType: form.feeType,
        description: form.description,
        amount: Number(form.amount),
        paidAmount: Number(form.paidAmount || 0),
        dueDate: form.dueDate,
        status: form.status,
        note: form.note,
        updatedAt: serverTimestamp(),
      });

      resetForm();
    } catch (error) {
      console.error(error);
      alert("Save fee failed.");
    } finally {
      setSaving(false);
    }
  };

  const removeFee = async (id: string) => {
    const confirmed = window.confirm("Delete this fee item?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "cases", caseId, "fees", id));
      if (editingId === id) resetForm();
    } catch (error) {
      console.error(error);
      alert("Delete fee failed.");
    }
  };

  return (
    <div id="fees" style={cardStyle}>
      <div style={responsiveHeaderStyle}>
        <h3 style={{ margin: 0 }}>Fees</h3>

        <div style={mobileStackButtonWrapStyle}>
          {!showForm ? (
            <button
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
                setShowForm(true);
              }}
              style={buttonPrimary}
            >
              + Add Fee
            </button>
          ) : (
            <button onClick={resetForm} style={buttonSecondary}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <>
          <div style={{ marginBottom: 12, fontWeight: 600 }}>
            {editingId ? "Edit Fee" : "Add Fee"}
          </div>

          <div style={gridStyle}>
            <div>
              <label>Fee Type</label>
              <select
                value={form.feeType}
                onChange={(e) => setForm({ ...form, feeType: e.target.value })}
                style={inputStyle}
              >
                <option value="legalFee">Legal Fee</option>
                <option value="serviceFee">Service Fee</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label>Description</label>
              <input
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                style={inputStyle}
                placeholder="เช่น ค่าทนายงวดแรก"
              />
            </div>

            <div>
              <label>Amount</label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                style={inputStyle}
                placeholder="10000"
              />
            </div>

            <div>
              <label>Paid Amount</label>
              <input
                type="number"
                value={form.paidAmount}
                onChange={(e) =>
                  setForm({ ...form, paidAmount: e.target.value })
                }
                style={inputStyle}
                placeholder="0"
              />
            </div>

            <div>
              <label>Due Date</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                style={inputStyle}
              />
            </div>

            <div>
              <label>Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                style={inputStyle}
              >
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
              </select>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label>Note</label>
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                style={inputStyle}
                placeholder="หมายเหตุ"
              />
            </div>
          </div>

          <button
            onClick={editingId ? saveEdit : createFee}
            disabled={saving}
            style={{ ...buttonPrimary, marginTop: 16, marginBottom: 20 }}
          >
            {saving
              ? "Saving..."
              : editingId
              ? "Save Fee Changes"
              : "Save New Fee"}
          </button>
        </>
      )}

      <div style={summaryStyle}>
        <div style={summaryChipStyle}>
          <strong>Total:</strong> {formatNumber(totalAmount)}
        </div>
        <div style={summaryChipStyle}>
          <strong>Paid:</strong> {formatNumber(totalPaid)}
        </div>
        <div style={summaryChipStyle}>
          <strong>Outstanding:</strong> {formatNumber(totalOutstanding)}
        </div>
      </div>

      {sortedFees.length === 0 ? (
        <p>No fees yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sortedFees.map((item) => (
            <FeeCard
              key={item.id}
              item={item}
              onEdit={() => startEdit(item)}
              onDelete={() => removeFee(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FeeCard({
  item,
  onEdit,
  onDelete,
}: {
  item: FeeItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const amount = Number(item.amount) || 0;
  const paid = Number(item.paidAmount) || 0;
  const outstanding = amount - paid;

  const getStatusColor = () => {
    if (item.status === "paid") return "#2E7D32";
    if (item.status === "partial") return "#ED6C02";
    return "#C62828";
  };

  const renderFeeType = (feeType?: string) => {
    if (feeType === "legalFee") return "Legal Fee";
    if (feeType === "serviceFee") return "Service Fee";
    if (feeType === "other") return "Other";
    return feeType || "-";
  };

  return (
    <div style={feeCardStyle}>
      <div style={feeCardHeaderStyle}>
        <div>
          <div style={{ fontWeight: 700 }}>{item.description || "No description"}</div>
          <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
            {renderFeeType(item.feeType)}
          </div>
        </div>

        <div
          style={{
            ...statusPillStyle,
            color: getStatusColor(),
            borderColor: "#ddd",
          }}
        >
          {item.status || "unpaid"}
        </div>
      </div>

      <div style={feeMetaGridStyle}>
        <div>
          <div style={metaLabelStyle}>Amount</div>
          <div style={metaValueStyle}>{amount.toLocaleString()}</div>
        </div>

        <div>
          <div style={metaLabelStyle}>Paid</div>
          <div style={metaValueStyle}>{paid.toLocaleString()}</div>
        </div>

        <div>
          <div style={metaLabelStyle}>Outstanding</div>
          <div style={metaValueStyle}>{outstanding.toLocaleString()}</div>
        </div>

        <div>
          <div style={metaLabelStyle}>Due Date</div>
          <div style={metaValueStyle}>{item.dueDate || "-"}</div>
        </div>
      </div>

      {item.note ? (
        <div style={feeNoteStyle}>
          <div style={metaLabelStyle}>Note</div>
          <div style={metaValueStyle}>{item.note}</div>
        </div>
      ) : null}

      <div style={rowActionsWrapStyle}>
        <button onClick={onEdit} style={smallButtonStyle}>
          Edit
        </button>
        <button onClick={onDelete} style={smallDangerStyle}>
          Delete
        </button>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  marginTop: 16,
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: 16,
  overflow: "hidden",
};

const responsiveHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 8,
};

const mobileStackButtonWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 8,
  borderRadius: 6,
  border: "1px solid #ccc",
};

const summaryStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  marginBottom: 16,
  flexWrap: "wrap",
};

const summaryChipStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #ddd",
  borderRadius: 999,
  background: "#fafafa",
};

const feeCardStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  padding: 14,
  background: "#fff",
};

const feeCardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 12,
};

const statusPillStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid",
  background: "#fff",
  fontWeight: 600,
  fontSize: 13,
};

const feeMetaGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
  marginBottom: 12,
};

const metaLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  marginBottom: 4,
};

const metaValueStyle: React.CSSProperties = {
  fontSize: 15,
  color: "#111",
  fontWeight: 500,
  wordBreak: "break-word",
};

const feeNoteStyle: React.CSSProperties = {
  marginBottom: 12,
  paddingTop: 8,
  borderTop: "1px solid #f0f0f0",
};

const rowActionsWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const buttonPrimary: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  background: "black",
  color: "white",
  border: "none",
  cursor: "pointer",
};

const buttonSecondary: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  background: "white",
  color: "black",
  border: "1px solid #ccc",
  cursor: "pointer",
};

const smallButtonStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  background: "white",
  color: "black",
  border: "1px solid #ccc",
  cursor: "pointer",
};

const smallDangerStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  background: "white",
  color: "darkred",
  border: "1px solid #ccc",
  cursor: "pointer",
};