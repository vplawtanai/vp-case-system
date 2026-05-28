"use client";

import { useEffect, useMemo, useState } from "react";
import { createAuditLog } from "../../../../lib/auditLog";
import { supabase } from "../../../../lib/supabase";

type Props = {
  matterId: string;
  canRestore: boolean;
  actorName: string;
};

type DeletedIssue = {
  id: string;
  advisory_matter_id: string;
  issue_no?: string | null;
  title?: string | null;
  status?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

type DeletedTimeLog = {
  id: string;
  advisory_matter_id: string;
  work_date?: string | null;
  staff_name?: string | null;
  work_type?: string | null;
  minutes?: number | null;
  note?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

export default function AdvisoryDeletedItemsPanel({
  matterId,
  canRestore,
  actorName,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [issues, setIssues] = useState<DeletedIssue[]>([]);
  const [timeLogs, setTimeLogs] = useState<DeletedTimeLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState("");
  const [errorText, setErrorText] = useState("");

  const totalCount = useMemo(() => {
    return issues.length + timeLogs.length;
  }, [issues.length, timeLogs.length]);

  const loadDeletedItems = async () => {
    if (!matterId || !canRestore) return;

    try {
      setLoading(true);
      setErrorText("");

      const [issuesRes, timeLogsRes] = await Promise.all([
        supabase
          .from("advisory_issues")
          .select("*")
          .eq("advisory_matter_id", matterId)
          .not("deleted_at", "is", null)
          .order("deleted_at", { ascending: false }),
        supabase
          .from("advisory_time_logs")
          .select("*")
          .eq("advisory_matter_id", matterId)
          .not("deleted_at", "is", null)
          .order("deleted_at", { ascending: false }),
      ]);

      if (issuesRes.error) {
        setErrorText(issuesRes.error.message || "Load deleted issues failed");
        setIssues([]);
        setTimeLogs([]);
        return;
      }

      if (timeLogsRes.error) {
        setErrorText(
          timeLogsRes.error.message || "Load deleted time logs failed"
        );
        setIssues([]);
        setTimeLogs([]);
        return;
      }

      setIssues((issuesRes.data || []) as DeletedIssue[]);
      setTimeLogs((timeLogsRes.data || []) as DeletedTimeLog[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeletedItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterId, canRestore]);

  const restoreIssue = async (item: DeletedIssue) => {
    if (!canRestore) return;
    await restoreRecord("advisory_issues", item.id, item);
  };

  const restoreTimeLog = async (item: DeletedTimeLog) => {
    if (!canRestore) return;
    await restoreRecord("advisory_time_logs", item.id, item);
  };

  const restoreRecord = async (
    tableName: "advisory_issues" | "advisory_time_logs",
    recordId: string,
    oldData: DeletedIssue | DeletedTimeLog
  ) => {
    try {
      setRestoringId(`${tableName}:${recordId}`);
      setErrorText("");

      const { data, error } = await supabase
        .from(tableName)
        .update({
          deleted_at: null,
          deleted_by: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", recordId)
        .eq("advisory_matter_id", matterId)
        .not("deleted_at", "is", null)
        .select("*")
        .maybeSingle();

      if (error || !data) {
        const message =
          error?.message ||
          "No row restored. Please check RLS policy or record id.";
        setErrorText(message);
        alert("Restore failed:\n" + message);
        return;
      }

      try {
        await createAuditLog({
          caseId: null,
          tableName,
          recordId,
          action: "restore",
          oldData,
          newData: data,
          note: `Advisory ${tableName} restored by ${actorName || "current_user"}`,
        });
      } catch (auditError) {
        console.error("CREATE ADVISORY RESTORE AUDIT FAILED:", auditError);
      }

      await loadDeletedItems();
    } finally {
      setRestoringId("");
    }
  };

  if (!canRestore) return null;

  return (
    <section style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Deleted Items ({totalCount})</h3>
          <div style={subTitleStyle}>Restore deleted advisory records.</div>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          style={toggleButtonStyle}
        >
          {isOpen ? "Hide" : "Show"}
        </button>
      </div>

      {isOpen && errorText ? <div style={errorStyle}>{errorText}</div> : null}

      {isOpen && loading ? (
        <div style={messageStyle}>Loading deleted items...</div>
      ) : isOpen ? (
        <div style={contentStyle}>
          <DeletedIssuesTable
            items={issues}
            restoringId={restoringId}
            onRestore={restoreIssue}
          />
          <DeletedTimeLogsTable
            items={timeLogs}
            restoringId={restoringId}
            onRestore={restoreTimeLog}
          />
        </div>
      ) : null}
    </section>
  );
}

function DeletedIssuesTable({
  items,
  restoringId,
  onRestore,
}: {
  items: DeletedIssue[];
  restoringId: string;
  onRestore: (item: DeletedIssue) => void;
}) {
  return (
    <div>
      <h4 style={groupTitleStyle}>Deleted Issues</h4>
      {items.length === 0 ? (
        <div style={messageStyle}>No deleted issues found.</div>
      ) : (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Issue No</th>
                <th style={thStyle}>Title</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Deleted At</th>
                <th style={thStyle}>Deleted By</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={tdStyle}>{item.issue_no || "-"}</td>
                  <td style={tdStyle}>{item.title || "-"}</td>
                  <td style={tdStyle}>{item.status || "-"}</td>
                  <td style={tdStyle}>{formatThaiTime(item.deleted_at)}</td>
                  <td style={tdStyle}>{item.deleted_by || "-"}</td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={() => onRestore(item)}
                      disabled={restoringId === `advisory_issues:${item.id}`}
                      style={restoreButtonStyle}
                    >
                      {restoringId === `advisory_issues:${item.id}`
                        ? "Restoring..."
                        : "Restore"}
                    </button>
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

function DeletedTimeLogsTable({
  items,
  restoringId,
  onRestore,
}: {
  items: DeletedTimeLog[];
  restoringId: string;
  onRestore: (item: DeletedTimeLog) => void;
}) {
  return (
    <div>
      <h4 style={groupTitleStyle}>Deleted Time Logs</h4>
      {items.length === 0 ? (
        <div style={messageStyle}>No deleted time logs found.</div>
      ) : (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Work Date</th>
                <th style={thStyle}>Staff</th>
                <th style={thStyle}>Work Type</th>
                <th style={thStyle}>Minutes</th>
                <th style={thStyle}>Note</th>
                <th style={thStyle}>Deleted At</th>
                <th style={thStyle}>Deleted By</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={tdStyle}>{item.work_date || "-"}</td>
                  <td style={tdStyle}>{item.staff_name || "-"}</td>
                  <td style={tdStyle}>{item.work_type || "-"}</td>
                  <td style={tdStyle}>{item.minutes ?? 0}</td>
                  <td style={tdStyle}>{item.note || "-"}</td>
                  <td style={tdStyle}>{formatThaiTime(item.deleted_at)}</td>
                  <td style={tdStyle}>{item.deleted_by || "-"}</td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={() => onRestore(item)}
                      disabled={
                        restoringId === `advisory_time_logs:${item.id}`
                      }
                      style={restoreButtonStyle}
                    >
                      {restoringId === `advisory_time_logs:${item.id}`
                        ? "Restoring..."
                        : "Restore"}
                    </button>
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

function formatThaiTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const sectionStyle: React.CSSProperties = {
  marginTop: 16,
  border: "1px solid #dddddd",
  borderRadius: 12,
  background: "#ffffff",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: 16,
  borderBottom: "1px solid #eeeeee",
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 900,
};

const subTitleStyle: React.CSSProperties = {
  marginTop: 4,
  color: "#666666",
  fontSize: 13,
  fontWeight: 700,
};

const contentStyle: React.CSSProperties = {
  display: "grid",
  gap: 18,
  padding: 16,
};

const groupTitleStyle: React.CSSProperties = {
  margin: "0 0 10px 0",
  fontSize: 15,
  fontWeight: 900,
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 760,
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #dddddd",
  background: "#f3f4f6",
  textAlign: "left",
  fontSize: 13,
  fontWeight: 800,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #eeeeee",
  fontSize: 14,
  verticalAlign: "top",
};

const messageStyle: React.CSSProperties = {
  padding: 12,
  fontWeight: 800,
};

const errorStyle: React.CSSProperties = {
  margin: 16,
  padding: 12,
  border: "1px solid #f0c4c4",
  borderRadius: 10,
  background: "#fff5f5",
  color: "#a40000",
  fontWeight: 700,
};

const toggleButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #cccccc",
  borderRadius: 8,
  background: "#ffffff",
  color: "#111111",
  cursor: "pointer",
  fontWeight: 800,
};

const restoreButtonStyle: React.CSSProperties = {
  ...toggleButtonStyle,
  border: "1px solid #000000",
};
