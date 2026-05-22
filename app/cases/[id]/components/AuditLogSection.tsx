"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../../../../lib/supabase";
import { createAuditLog } from "../../../../lib/auditLog";

type AuditLogItem = {
  id: string;
  case_id?: number | null;

  table_name: string;
  record_id?: string | null;
  action: string;

  user_id?: string | null;
  user_email?: string | null;
  user_name?: string | null;
  user_role?: string | null;

  old_data?: any;
  new_data?: any;

  note?: string | null;
  created_at?: string | null;
};

type Props = {
  caseId: string;
  canRestore?: boolean;
};

const restorableTables = [
  "parties",
  "case_timeline",
  "case_judgments",
  "case_court_filings",
  "case_enforcements",
  "case_enforcement_assets",
  "case_tasks",
  "case_deadlines",
  "case_deadline_extensions",
  "case_time_logs",
  "case_fee_items",
  "case_expense_items",
  "case_notes",
];

export default function AuditLogSection({ caseId, canRestore = false }: Props) {
  const caseIdNumber = Number(caseId);

  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [actionFilter, setActionFilter] = useState("All");
  const [tableFilter, setTableFilter] = useState("All");

  const historyBodyRef = useRef<HTMLDivElement | null>(null);

  const scrollToHistoryBody = () => {
    window.setTimeout(() => {
      if (!historyBodyRef.current) return;

      const offset = 130;
      const y =
        historyBodyRef.current.getBoundingClientRect().top +
        window.scrollY -
        offset;

      window.scrollTo({
        top: y,
        behavior: "smooth",
      });
    }, 100);
  };

  const loadAuditLogs = async () => {
    if (!caseIdNumber || Number.isNaN(caseIdNumber)) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("case_audit_logs")
        .select("*")
        .eq("case_id", caseIdNumber)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        alert("Load audit logs failed:\n" + JSON.stringify(error, null, 2));
        setItems([]);
        return;
      }

      setItems((data || []) as AuditLogItem[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    loadAuditLogs();
    scrollToHistoryBody();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, isOpen]);

  const handleToggleOpen = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);

    if (nextOpen) {
      scrollToHistoryBody();
    }
  };

  const restoreRecord = async (item: AuditLogItem) => {
    if (!canRestore) {
      alert("คุณไม่มีสิทธิ์กู้คืนข้อมูลนี้");
      return;
    }

    if (!caseIdNumber || Number.isNaN(caseIdNumber)) {
      alert("Missing case id");
      return;
    }

    if (item.action !== "soft_delete") {
      alert("รายการนี้ไม่ใช่รายการที่ถูก Soft Delete");
      return;
    }

    if (!item.table_name || !restorableTables.includes(item.table_name)) {
      alert("ตารางนี้ยังไม่รองรับการ Restore");
      return;
    }

    if (!item.record_id) {
      alert("Missing record id");
      return;
    }

    const confirmed = window.confirm(
      `ต้องการกู้คืนรายการนี้หรือไม่?\n\nTable: ${renderTableName(
        item.table_name
      )}\nRecord ID: ${item.record_id}`
    );

    if (!confirmed) return;

    try {
      setRestoringId(item.id);

      const { data: currentRow, error: readError } = await supabase
        .from(item.table_name)
        .select("*")
        .eq("id", item.record_id)
        .maybeSingle();

      if (readError) {
        alert("Read deleted record failed:\n" + JSON.stringify(readError, null, 2));
        return;
      }

      if (!currentRow) {
        alert(
          "ไม่พบ record นี้ในตารางแล้ว อาจถูกลบถาวร หรือ record id ไม่ตรงกับตาราง"
        );
        return;
      }

      if (!currentRow.deleted_at) {
        alert("รายการนี้ถูกกู้คืนแล้ว หรือยังไม่ได้ถูกลบ");
        await loadAuditLogs();
        return;
      }

      const payload = {
        deleted_at: null,
        deleted_by: null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from(item.table_name)
        .update(payload)
        .eq("id", item.record_id)
        .select("*")
        .single();

      if (error) {
        alert("Restore failed:\n" + JSON.stringify(error, null, 2));
        return;
      }

      await createAuditLog({
        caseId: caseIdNumber,
        tableName: item.table_name,
        recordId: item.record_id,
        action: "restore",
        oldData: currentRow,
        newData: data || {
          ...currentRow,
          ...payload,
        },
        note: `Restore ${renderTableName(item.table_name)}`,
      });

      alert("Restore สำเร็จแล้ว");

      await loadAuditLogs();
    } finally {
      setRestoringId(null);
    }
  };

  const tableOptions = useMemo(() => {
    const values = items
      .map((item) => item.table_name)
      .filter((value) => !!value);

    return ["All", ...Array.from(new Set(values))];
  }, [items]);

  const actionOptions = useMemo(() => {
    const values = items.map((item) => item.action).filter((value) => !!value);

    return ["All", ...Array.from(new Set(values))];
  }, [items]);

  const summary = useMemo(() => {
    const createCount = items.filter((item) => item.action === "create").length;
    const updateCount = items.filter((item) => item.action === "update").length;
    const softDeleteCount = items.filter(
      (item) => item.action === "soft_delete"
    ).length;
    const restoreCount = items.filter((item) => item.action === "restore").length;

    return {
      total: items.length,
      createCount,
      updateCount,
      softDeleteCount,
      restoreCount,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchAction = actionFilter === "All" || item.action === actionFilter;
      const matchTable = tableFilter === "All" || item.table_name === tableFilter;

      return matchAction && matchTable;
    });
  }, [items, actionFilter, tableFilter]);

  return (
    <div id="history" style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>History / Audit Log</h3>
          <div style={subTitleStyle}>
            ประวัติการเพิ่ม แก้ไข ลบ และกู้คืนข้อมูลในคดีนี้
          </div>
        </div>

        <div style={buttonWrapStyle}>
          {isOpen && (
            <button
              type="button"
              onClick={loadAuditLogs}
              style={secondaryButtonStyle}
            >
              Refresh
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleOpen}
            style={primaryButtonStyle}
          >
            {isOpen ? "Hide History" : "Show History"}
          </button>
        </div>
      </div>

      {!isOpen ? (
        <div style={collapsedBoxStyle}>
          History ถูกพับไว้ กด “Show History” เพื่อดูประวัติการแก้ไขข้อมูล
        </div>
      ) : (
        <div ref={historyBodyRef} style={historyBodyStyle}>
          <div style={historyTopBarStyle}>
            <div>
              <div style={historyTopTitleStyle}>Audit Trail</div>
              <div style={historyTopHintStyle}>
                แสดงรายการล่าสุดไม่เกิน 100 รายการ ใช้ตรวจสอบว่าใครเพิ่ม แก้ไข ลบ หรือกู้คืนข้อมูลใดในคดีนี้
              </div>
            </div>

            <span style={canRestore ? restoreAccessBadgeStyle : viewOnlyBadgeStyle}>
              {canRestore ? "RESTORE ENABLED" : "VIEW ONLY"}
            </span>
          </div>

          <div style={summaryGridStyle}>
            <SummaryCard label="Total Logs" value={String(summary.total)} />
            <SummaryCard label="Create" value={String(summary.createCount)} />
            <SummaryCard label="Update" value={String(summary.updateCount)} />
            <SummaryCard
              label="Soft Delete"
              value={String(summary.softDeleteCount)}
            />
            <SummaryCard label="Restore" value={String(summary.restoreCount)} />
          </div>

          <div style={filterBoxStyle}>
            <div style={filterTitleStyle}>Filter History</div>

            <div style={filterGridStyle}>
              <div>
                <label style={labelStyle}>Table</label>
                <select
                  value={tableFilter}
                  onChange={(e) => setTableFilter(e.target.value)}
                  style={inputStyle}
                >
                  {tableOptions.map((option) => (
                    <option key={option} value={option}>
                      {renderTableName(option)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Action</label>
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  style={inputStyle}
                >
                  {actionOptions.map((option) => (
                    <option key={option} value={option}>
                      {renderAction(option)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {loading ? (
            <div style={emptyStyle}>Loading history...</div>
          ) : filteredItems.length === 0 ? (
            <div style={emptyStyle}>No audit logs found.</div>
          ) : (
            <div style={logListStyle}>
              {filteredItems.map((item) => (
                <AuditLogCard
                  key={item.id}
                  item={item}
                  restoring={restoringId === item.id}
                  canRestore={canRestore}
                  onRestore={restoreRecord}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   SUB COMPONENTS
========================================================= */

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryCardStyle}>
      <div style={summaryLabelStyle}>{label}</div>
      <div style={summaryValueStyle}>{value}</div>
    </div>
  );
}

function AuditLogCard({
  item,
  restoring,
  canRestore,
  onRestore,
}: {
  item: AuditLogItem;
  restoring: boolean;
  canRestore: boolean;
  onRestore: (item: AuditLogItem) => void;
}) {
  const changedFields = getChangedFields(item.old_data, item.new_data);
  const canShowRestoreButton =
    canRestore &&
    item.action === "soft_delete" &&
    !!item.record_id &&
    restorableTables.includes(item.table_name);

  return (
    <div style={logCardStyle}>
      <div style={logHeaderStyle}>
        <div>
          <div style={logTitleStyle}>
            {renderAction(item.action)} · {renderTableName(item.table_name)}
          </div>

          <div style={logMetaStyle}>
            {formatDateTime(item.created_at)} ·{" "}
            {item.user_name || item.user_email || "-"} · {item.user_role || "-"}
          </div>

          {item.note && <div style={noteStyle}>{item.note}</div>}
        </div>

        <div style={badgeAndButtonWrapStyle}>
          <span style={getActionBadgeStyle(item.action)}>
            {item.action || "-"}
          </span>

          {canShowRestoreButton && (
            <button
              type="button"
              onClick={() => onRestore(item)}
              disabled={restoring}
              style={restoreButtonStyle}
            >
              {restoring ? "Restoring..." : "Restore"}
            </button>
          )}
        </div>
      </div>

      <div style={smallInfoGridStyle}>
        <InfoLine label="Record ID" value={item.record_id || "-"} />
        <InfoLine label="User Email" value={item.user_email || "-"} />
      </div>

      {changedFields.length > 0 ? (
        <div style={changeBoxStyle}>
          <div style={changeTitleStyle}>Changed Fields</div>

          <div style={changeListStyle}>
            {changedFields.map((row) => (
              <div key={row.field} style={changeItemStyle}>
                <div style={fieldNameStyle}>{row.field}</div>

                <div style={beforeAfterGridStyle}>
                  <div>
                    <div style={beforeLabelStyle}>Before</div>
                    <div style={beforeValueStyle}>{formatValue(row.before)}</div>
                  </div>

                  <div>
                    <div style={afterLabelStyle}>After</div>
                    <div style={afterValueStyle}>{formatValue(row.after)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <details style={detailsStyle}>
          <summary style={summaryStyle}>View raw data</summary>

          <div style={rawGridStyle}>
            <div>
              <div style={rawTitleStyle}>Old Data</div>
              <pre style={preStyle}>{safeStringify(item.old_data)}</pre>
            </div>

            <div>
              <div style={rawTitleStyle}>New Data</div>
              <pre style={preStyle}>{safeStringify(item.new_data)}</pre>
            </div>
          </div>
        </details>
      )}
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

/* =========================================================
   HELPERS
========================================================= */

function getChangedFields(oldData: any, newData: any) {
  if (!oldData || !newData) return [];

  const oldFlat = flattenObject(oldData);
  const newFlat = flattenObject(newData);

  const keys = Array.from(
    new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)])
  );

  return keys
    .filter((key) => {
      return normalizeValue(oldFlat[key]) !== normalizeValue(newFlat[key]);
    })
    .map((key) => ({
      field: key,
      before: oldFlat[key],
      after: newFlat[key],
    }));
}

function flattenObject(input: any, prefix = ""): Record<string, any> {
  const result: Record<string, any> = {};

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return result;
  }

  Object.keys(input).forEach((key) => {
    const value = input[key];
    const nextKey = prefix ? `${prefix}.${key}` : key;

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      Object.assign(result, flattenObject(value, nextKey));
      return;
    }

    result[nextKey] = value;
  });

  return result;
}

function normalizeValue(value: any) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatValue(value: any) {
  if (value === null || value === undefined || value === "") return "-";

  if (typeof value === "object") {
    return safeStringify(value);
  }

  return String(value);
}

function safeStringify(value: any) {
  if (value === null || value === undefined) return "-";

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function renderAction(value?: string | null) {
  if (!value) return "-";
  if (value === "create") return "Create";
  if (value === "update") return "Update";
  if (value === "delete") return "Delete";
  if (value === "soft_delete") return "Soft Delete";
  if (value === "restore") return "Restore";
  if (value === "All") return "All";
  return value;
}

function renderTableName(value?: string | null) {
  if (!value) return "-";
  if (value === "All") return "All";

  if (value === "parties") return "Parties";
  if (value === "case_deadlines") return "Legal Deadlines";
  if (value === "case_deadline_extensions") return "Deadline Extensions";
  if (value === "case_timeline") return "Timeline";
  if (value === "case_judgments") return "Judgments";
  if (value === "case_court_filings") return "Court Filings";
  if (value === "case_enforcements") return "Enforcement";
  if (value === "case_enforcement_assets") return "Enforcement Assets";
  if (value === "case_fee_items") return "Professional Fees";
  if (value === "case_expense_items") return "Expenses";
  if (value === "case_tasks") return "Tasks";
  if (value === "case_time_logs") return "Time Logs";
  if (value === "case_notes") return "Notes";
  if (value === "cases") return "Case Information";

  return value;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString("th-TH");
  } catch {
    return value;
  }
}

function getActionBadgeStyle(action: string): CSSProperties {
  if (action === "create") {
    return {
      ...badgeBaseStyle,
      background: "#e6f4ea",
      color: "#067647",
      border: "1px solid #b9dfc3",
    };
  }

  if (action === "update") {
    return {
      ...badgeBaseStyle,
      background: "#fff8e1",
      color: "#b54708",
      border: "1px solid #eedc9a",
    };
  }

  if (action === "delete" || action === "soft_delete") {
    return {
      ...badgeBaseStyle,
      background: "#fff5f5",
      color: "#a40000",
      border: "1px solid #e0b4b4",
    };
  }

  if (action === "restore") {
    return {
      ...badgeBaseStyle,
      background: "#edf4ff",
      color: "#175cd3",
      border: "1px solid #b2ccff",
    };
  }

  return {
    ...badgeBaseStyle,
    background: "#f1f5f9",
    color: "#475467",
    border: "1px solid #d0d5dd",
  };
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

const buttonWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
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

const collapsedBoxStyle: CSSProperties = {
  padding: 14,
  border: "1px dashed #cccccc",
  borderRadius: 12,
  background: "#fafafa",
  color: "#555555",
  fontSize: 14,
  fontWeight: 600,
};

const historyBodyStyle: CSSProperties = {
  border: "1px solid #c9d7ef",
  borderLeft: "5px solid #000000",
  borderRadius: 14,
  padding: 16,
  background: "#fbfcff",
  boxShadow: "0 8px 24px rgba(15, 39, 67, 0.08)",
};

const historyTopBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};

const historyTopTitleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
  color: "#111111",
};

const historyTopHintStyle: CSSProperties = {
  marginTop: 4,
  color: "#555555",
  fontSize: 13,
  lineHeight: 1.5,
};

const restoreAccessBadgeStyle: CSSProperties = {
  display: "inline-flex",
  padding: "6px 10px",
  borderRadius: 999,
  background: "#edf4ff",
  color: "#175cd3",
  border: "1px solid #b2ccff",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const viewOnlyBadgeStyle: CSSProperties = {
  ...restoreAccessBadgeStyle,
  background: "#f1f5f9",
  color: "#475467",
  border: "1px solid #d0d5dd",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
  marginBottom: 14,
};

const summaryCardStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 12,
  padding: 14,
  background: "#ffffff",
};

const summaryLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#666666",
  marginBottom: 6,
  fontWeight: 700,
};

const summaryValueStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  color: "#111111",
};

const filterBoxStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 12,
  padding: 12,
  background: "#ffffff",
  marginBottom: 14,
};

const filterTitleStyle: CSSProperties = {
  fontWeight: 900,
  color: "#111111",
  marginBottom: 10,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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

const emptyStyle: CSSProperties = {
  padding: 16,
  border: "1px dashed #cccccc",
  borderRadius: 12,
  color: "#555555",
  background: "#ffffff",
};

const logListStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const logCardStyle: CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  padding: 14,
  background: "#ffffff",
  color: "#111111",
  boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
};

const logHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 10,
};

const logTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  color: "#111111",
};

const logMetaStyle: CSSProperties = {
  marginTop: 4,
  color: "#555555",
  fontSize: 13,
  fontWeight: 600,
};

const noteStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  color: "#333333",
  fontWeight: 700,
};

const badgeAndButtonWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const badgeBaseStyle: CSSProperties = {
  display: "inline-flex",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const restoreButtonStyle: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #b2ccff",
  background: "#edf4ff",
  color: "#175cd3",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const smallInfoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
  marginBottom: 10,
};

const infoLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#666666",
  marginBottom: 2,
  fontWeight: 700,
};

const infoValueStyle: CSSProperties = {
  fontSize: 13,
  color: "#111111",
  fontWeight: 700,
  wordBreak: "break-word",
};

const changeBoxStyle: CSSProperties = {
  marginTop: 10,
  padding: 12,
  borderRadius: 12,
  border: "1px solid #eeeeee",
  background: "#fafafa",
};

const changeTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  marginBottom: 10,
  color: "#111111",
};

const changeListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const changeItemStyle: CSSProperties = {
  border: "1px solid #eeeeee",
  borderRadius: 10,
  padding: 10,
  background: "#ffffff",
};

const fieldNameStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  marginBottom: 8,
  color: "#111111",
};

const beforeAfterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const beforeLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#a40000",
  fontWeight: 800,
  marginBottom: 4,
};

const afterLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#067647",
  fontWeight: 800,
  marginBottom: 4,
};

const beforeValueStyle: CSSProperties = {
  padding: 8,
  borderRadius: 8,
  background: "#fff5f5",
  color: "#111111",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: 13,
};

const afterValueStyle: CSSProperties = {
  padding: 8,
  borderRadius: 8,
  background: "#e6f4ea",
  color: "#111111",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: 13,
};

const detailsStyle: CSSProperties = {
  marginTop: 10,
};

const summaryStyle: CSSProperties = {
  cursor: "pointer",
  fontWeight: 800,
  color: "#333333",
};

const rawGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 10,
  marginTop: 10,
};

const rawTitleStyle: CSSProperties = {
  fontWeight: 900,
  marginBottom: 6,
  color: "#111111",
};

const preStyle: CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #eeeeee",
  background: "#f8fafc",
  color: "#111111",
  overflowX: "auto",
  fontSize: 12,
  maxHeight: 280,
};