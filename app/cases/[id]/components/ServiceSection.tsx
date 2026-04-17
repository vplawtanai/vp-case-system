"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../../../lib/firebase";

type PartyItem = {
  id: string;
  role?: string;
  entityType?: string;
  title?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  orderNo?: number;
};

type TimelineItem = {
  id: string;
  eventDate?: string;
  appointment?: string;
};

type ServiceItem = {
  id: string;
  defendantId?: string;
  defendantLabel?: string;
  serviceDate?: string;
  method?: string;
  result?: string;
  answerDeadline?: string;
  note?: string;
};

type ServiceRule =
  | "civilOrdinary"
  | "summaryOrSimple"
  | "consumer"
  | "other";

type Props = {
  caseId: string;
  services: ServiceItem[];
  defendants: PartyItem[];
  timeline: TimelineItem[];
  initialRule?: ServiceRule;
};

export default function ServiceSection({
  caseId,
  services,
  defendants,
  timeline,
  initialRule,
}: Props) {
  const emptyForm = {
    defendantId: "",
    serviceDate: "",
    method: "รับเอง",
    result: "ส่งได้",
    note: "",
  };

  const [serviceRule, setServiceRule] = useState<ServiceRule>(
    initialRule || "civilOrdinary"
  );
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (initialRule) setServiceRule(initialRule);
  }, [initialRule]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 820);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const sortedServices = useMemo(() => {
    return [...services].sort((a, b) => {
      const aKey = `${a.serviceDate || ""}-${a.defendantLabel || ""}`;
      const bKey = `${b.serviceDate || ""}-${b.defendantLabel || ""}`;
      return aKey.localeCompare(bKey);
    });
  }, [services]);

  const firstHearingDate = useMemo(() => {
    const found =
      [...timeline]
        .sort((a, b) => (a.eventDate || "").localeCompare(b.eventDate || ""))
        .find((t) => t.appointment?.includes("พิจารณาคดีนัดแรก")) ||
      [...timeline]
        .sort((a, b) => (a.eventDate || "").localeCompare(b.eventDate || ""))
        .find((t) => t.appointment?.includes("พิจารณา")) ||
      null;

    return found?.eventDate || "";
  }, [timeline]);

  const addDays = (dateStr: string, days: number) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const calcAnswerDeadline = () => {
    if (form.result !== "ส่งได้") return "";

    if (serviceRule === "civilOrdinary") {
      if (!form.serviceDate) return "";
      if (form.method === "รับเอง") return addDays(form.serviceDate, 15);
      if (form.method === "ปิดหมาย") return addDays(form.serviceDate, 30);
      return "";
    }

    return firstHearingDate || "";
  };

  const answerDeadline = calcAnswerDeadline();

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const saveRule = async (nextRule: ServiceRule) => {
    setServiceRule(nextRule);
    try {
      await updateDoc(doc(db, "cases", caseId), {
        serviceRule: nextRule,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error(error);
      alert("Save rule failed.");
    }
  };

  const createService = async () => {
    if (!form.defendantId || !form.result) {
      alert("Please fill Defendant and Result.");
      return;
    }

    try {
      setSaving(true);

      const defendant = defendants.find((d) => d.id === form.defendantId);

      await addDoc(collection(db, "cases", caseId, "services"), {
        defendantId: form.defendantId,
        defendantLabel: renderPartyName(defendant),
        serviceDate: form.serviceDate,
        method: form.method,
        result: form.result,
        answerDeadline,
        note: form.note,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      resetForm();
    } catch (error) {
      console.error(error);
      alert("Create service failed.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: ServiceItem) => {
    setEditingId(item.id);
    setShowForm(true);
    setForm({
      defendantId: item.defendantId || "",
      serviceDate: item.serviceDate || "",
      method: item.method || "รับเอง",
      result: item.result || "ส่งได้",
      note: item.note || "",
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!form.defendantId || !form.result) {
      alert("Please fill Defendant and Result.");
      return;
    }

    try {
      setSaving(true);

      const defendant = defendants.find((d) => d.id === form.defendantId);

      await updateDoc(doc(db, "cases", caseId, "services", editingId), {
        defendantId: form.defendantId,
        defendantLabel: renderPartyName(defendant),
        serviceDate: form.serviceDate,
        method: form.method,
        result: form.result,
        answerDeadline,
        note: form.note,
        updatedAt: serverTimestamp(),
      });

      resetForm();
    } catch (error) {
      console.error(error);
      alert("Save service failed.");
    } finally {
      setSaving(false);
    }
  };

  const removeService = async (id: string) => {
    const confirmed = window.confirm("Delete this service row?");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "cases", caseId, "services", id));
      if (editingId === id) resetForm();
    } catch (error) {
      console.error(error);
      alert("Delete service failed.");
    }
  };

  return (
    <div id="service" style={cardStyle}>
      <div style={responsiveHeaderStyle}>
        <h3 style={{ margin: 0 }}>Service of Process</h3>

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
              + Add Service Row
            </button>
          ) : (
            <button onClick={resetForm} style={buttonSecondary}>
              Cancel
            </button>
          )}
        </div>
      </div>

      <div style={ruleCardStyle}>
        <div style={ruleTitleStyle}>
          ผลการส่งหมายและกำหนดยื่นคำให้การจำเลย
        </div>

        <div style={radioWrapStyle}>
          <label>
            <input
              type="radio"
              checked={serviceRule === "civilOrdinary"}
              onChange={() => saveRule("civilOrdinary")}
            />{" "}
            แพ่งสามัญ
          </label>

          <label>
            <input
              type="radio"
              checked={serviceRule === "summaryOrSimple"}
              onChange={() => saveRule("summaryOrSimple")}
            />{" "}
            มโนสาเร่ / ไม่มีข้อยุ่งยาก
          </label>

          <label>
            <input
              type="radio"
              checked={serviceRule === "consumer"}
              onChange={() => saveRule("consumer")}
            />{" "}
            ผู้บริโภค
          </label>

          <label>
            <input
              type="radio"
              checked={serviceRule === "other"}
              onChange={() => saveRule("other")}
            />{" "}
            อื่นๆ
          </label>
        </div>

        <div style={ruleHintStyle}>
          {serviceRule === "civilOrdinary"
            ? "ถ้าเป็นแพ่งสามัญ ระบบจะคำนวณจากผลการส่งหมาย"
            : "ถ้าไม่ใช่แพ่งสามัญ ระบบจะใช้วันนัดพิจารณาคดีนัดแรก"}
        </div>
      </div>

      {showForm && (
        <>
          <div style={{ marginBottom: 12, fontWeight: 600 }}>
            {editingId ? "Edit Service Row" : "Add Service Row"}
          </div>

          <div style={gridStyle}>
            <div>
              <label>Defendant</label>
              <select
                value={form.defendantId}
                onChange={(e) =>
                  setForm({ ...form, defendantId: e.target.value })
                }
                style={inputStyle}
              >
                <option value="">Select Defendant</option>
                {defendants.map((d, index) => (
                  <option key={d.id} value={d.id}>
                    จำเลยที่ {index + 1} {renderPartyName(d)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Service Date</label>
              <input
                type="date"
                value={form.serviceDate}
                onChange={(e) =>
                  setForm({ ...form, serviceDate: e.target.value })
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label>Method</label>
              <select
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value })}
                style={inputStyle}
              >
                <option value="รับเอง">รับเอง</option>
                <option value="ปิดหมาย">ปิดหมาย</option>
              </select>
            </div>

            <div>
              <label>Result</label>
              <select
                value={form.result}
                onChange={(e) => setForm({ ...form, result: e.target.value })}
                style={inputStyle}
              >
                <option value="ส่งได้">ส่งได้</option>
                <option value="ส่งไม่ได้">ส่งไม่ได้</option>
              </select>
            </div>

            <div>
              <label>วันยื่นคำให้การ</label>
              <input value={answerDeadline || "-"} readOnly style={inputStyle} />
            </div>

            <div>
              <label>Note</label>
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                style={inputStyle}
                placeholder="รายละเอียดเพิ่มเติม"
              />
            </div>
          </div>

          <div style={ruleHintStyle}>
            {serviceRule === "civilOrdinary"
              ? "(ระบบคำนวณอัตโนมัติจากกติกาแพ่งสามัญ)"
              : firstHearingDate
                ? "(อ้างอิงจากวันนัดพิจารณาคดีนัดแรก)"
                : "(ยังไม่พบวันนัดพิจารณาคดีนัดแรกใน Timeline)"}
          </div>

          <button
            onClick={editingId ? saveEdit : createService}
            disabled={saving}
            style={{ ...buttonPrimary, marginTop: 16, marginBottom: 20 }}
          >
            {saving
              ? "Saving..."
              : editingId
                ? "Save Service Changes"
                : "Save New Service"}
          </button>
        </>
      )}

      {sortedServices.length === 0 ? (
        <p>No service records yet.</p>
      ) : isMobile ? (
        <div style={mobileCardListStyle}>
          {sortedServices.map((item) => (
            <ServiceCard
              key={item.id}
              item={item}
              onEdit={() => startEdit(item)}
              onDelete={() => removeService(item.id)}
            />
          ))}
        </div>
      ) : (
        <div style={tableScrollWrapStyle}>
          <table style={responsiveTableStyle}>
            <thead>
              <tr style={{ textAlign: "left", background: "#f5f5f5" }}>
                <th style={cellHead}>จำเลย</th>
                <th style={cellHead}>วันที่ส่งหมาย</th>
                <th style={cellHead}>ผลการส่ง</th>
                <th style={cellHead}>วิธีการส่ง</th>
                <th style={cellHead}>กำหนดยื่นคำให้การ</th>
                <th style={cellHead}>หมายเหตุ</th>
                <th style={cellHead}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedServices.map((item) => (
                <tr key={item.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={cellBody}>{item.defendantLabel || "-"}</td>
                  <td style={cellBody}>{item.serviceDate || "-"}</td>
                  <td style={cellBody}>
                    <span style={getResultPillStyle(item.result)}>
                      {item.result || "-"}
                    </span>
                  </td>
                  <td style={cellBody}>{item.method || "-"}</td>
                  <td style={cellBody}>{item.answerDeadline || "-"}</td>
                  <td style={cellBody}>{item.note || "-"}</td>
                  <td style={cellBody}>
                    <div style={rowActionsWrapStyle}>
                      <button
                        onClick={() => startEdit(item)}
                        style={smallButtonStyle}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => removeService(item.id)}
                        style={smallDangerStyle}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ServiceCard({
  item,
  onEdit,
  onDelete,
}: {
  item: ServiceItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={serviceCardStyle}>
      <div style={serviceCardHeaderStyle}>
        <div>
          <div style={serviceTitleStyle}>{item.defendantLabel || "-"}</div>
          <div style={metaLabelStyle}>Service of Process</div>
        </div>

        <span style={getResultPillStyle(item.result)}>{item.result || "-"}</span>
      </div>

      <div style={serviceMetaGridStyle}>
        <div>
          <div style={metaLabelStyle}>Service Date</div>
          <div style={metaValueStyle}>{item.serviceDate || "-"}</div>
        </div>

        <div>
          <div style={metaLabelStyle}>Method</div>
          <div style={metaValueStyle}>{item.method || "-"}</div>
        </div>

        <div>
          <div style={metaLabelStyle}>Answer Deadline</div>
          <div style={metaValueStyle}>{item.answerDeadline || "-"}</div>
        </div>
      </div>

      {item.note ? (
        <div style={noteWrapStyle}>
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

function renderPartyName(party?: PartyItem) {
  if (!party) return "";
  if (party.entityType === "individual") {
    return `${party.title || ""}${party.firstName || ""} ${
      party.lastName || ""
    }`.trim();
  }
  return `${party.title || ""} ${party.companyName || ""}`.trim();
}

function getResultPillStyle(result?: string): React.CSSProperties {
  if (result === "ส่งได้") {
    return {
      ...pillBaseStyle,
      background: "#e6f4ea",
      color: "#067647",
      border: "1px solid #b9dfc3",
    };
  }

  if (result === "ส่งไม่ได้") {
    return {
      ...pillBaseStyle,
      background: "#fff4e5",
      color: "#b54708",
      border: "1px solid #f3d1a7",
    };
  }

  return {
    ...pillBaseStyle,
    background: "#f5f5f5",
    color: "#555",
    border: "1px solid #ddd",
  };
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

const ruleCardStyle: React.CSSProperties = {
  marginBottom: 16,
  padding: 12,
  border: "1px solid #eee",
  borderRadius: 10,
  background: "#fafafa",
};

const ruleTitleStyle: React.CSSProperties = {
  fontWeight: 600,
  marginBottom: 8,
};

const ruleHintStyle: React.CSSProperties = {
  marginTop: 8,
  color: "#666",
};

const radioWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 18,
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

const tableScrollWrapStyle: React.CSSProperties = {
  width: "100%",
  overflowX: "auto",
  WebkitOverflowScrolling: "touch",
};

const responsiveTableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 980,
  borderCollapse: "collapse",
};

const mobileCardListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const serviceCardStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  padding: 14,
  background: "#fff",
};

const serviceCardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 12,
};

const serviceTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1.4,
  wordBreak: "break-word",
};

const serviceMetaGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
  marginBottom: 12,
};

const noteWrapStyle: React.CSSProperties = {
  marginBottom: 12,
  paddingTop: 8,
  borderTop: "1px solid #f0f0f0",
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

const rowActionsWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const pillBaseStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
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

const cellHead: React.CSSProperties = {
  padding: 12,
};

const cellBody: React.CSSProperties = {
  padding: 12,
};