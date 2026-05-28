"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabase";

type Props = {
  matterId: string;
};

type AuditLogItem = {
  id: string;
  table_name: string;
  record_id?: string | null;
  action: string;
  user_email?: string | null;
  user_name?: string | null;
  old_data?: unknown;
  new_data?: unknown;
  note?: string | null;
  created_at?: string | null;
};

const tableLabels: Record<string, string> = {
  advisory_matters: "Matter",
  advisory_issues: "Issue",
  advisory_time_logs: "Time Log",
};

export default function AdvisoryHistoryPanel({ matterId }: Props) {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const totalCount = useMemo(() => items.length, [items]);

  useEffect(() => {
    const loadHistory = async () => {
      if (!matterId) return;

      try {
        setLoading(true);
        setErrorText("");

        const [issuesRes, timeLogsRes] = await Promise.all([
          supabase
            .from("advisory_issues")
            .select("id")
            .eq("advisory_matter_id", matterId),
          supabase
            .from("advisory_time_logs")
            .select("id")
            .eq("advisory_matter_id", matterId),
        ]);

        if (issuesRes.error) {
          setErrorText(issuesRes.error.message || "Load advisory issue ids failed");
          setItems([]);
          return;
        }

        if (timeLogsRes.error) {
          setErrorText(
            timeLogsRes.error.message || "Load advisory time log ids failed"
          );
          setItems([]);
          return;
        }

        const issueIds = (issuesRes.data || []).map((item) => String(item.id));
        const timeLogIds = (timeLogsRes.data || []).map((item) =>
          String(item.id)
        );

        const logRequests = [
          supabase
            .from("case_audit_logs")
            .select("*")
            .eq("table_name", "advisory_matters")
            .eq("record_id", matterId),
        ];

        if (issueIds.length > 0) {
          logRequests.push(
            supabase
              .from("case_audit_logs")
              .select("*")
              .eq("table_name", "advisory_issues")
              .in("record_id", issueIds)
          );
        }

        if (timeLogIds.length > 0) {
          logRequests.push(
            supabase
              .from("case_audit_logs")
              .select("*")
              .eq("table_name", "advisory_time_logs")
              .in("record_id", timeLogIds)
          );
        }

        const logResponses = await Promise.all(logRequests);
        const failedLog = logResponses.find((response) => response.error);

        if (failedLog?.error) {
          setErrorText(failedLog.error.message || "Load advisory history failed");
          setItems([]);
          return;
        }

        const merged = logResponses
          .flatMap((response) => response.data || [])
          .sort((a, b) => {
            return (
              new Date(b.created_at || "").getTime() -
              new Date(a.created_at || "").getTime()
            );
          });

        setItems(merged as AuditLogItem[]);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [matterId]);

  return (
    <section style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Advisory History</h3>
          <div style={subTitleStyle}>{totalCount} history item(s)</div>
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
        <div style={messageStyle}>Loading advisory history...</div>
      ) : isOpen && items.length === 0 ? (
        <div style={messageStyle}>No history found.</div>
      ) : isOpen ? (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>User</th>
                <th style={thStyle}>Action</th>
                <th style={thStyle}>Table</th>
                <th style={thStyle}>Note</th>
                <th style={thStyle}>Data</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={tdStyle}>{formatThaiTime(item.created_at)}</td>
                  <td style={tdStyle}>{item.user_name || item.user_email || "-"}</td>
                  <td style={tdStyle}>{item.action || "-"}</td>
                  <td style={tdStyle}>
                    {tableLabels[item.table_name] || item.table_name || "-"}
                  </td>
                  <td style={tdStyle}>{item.note || "-"}</td>
                  <td style={tdStyle}>
                    <details>
                      <summary style={summaryStyle}>View data</summary>
                      <pre style={preStyle}>{formatAuditData(item)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
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

function formatAuditData(item: AuditLogItem) {
  return JSON.stringify(
    {
      old_data: item.old_data || null,
      new_data: item.new_data || null,
    },
    null,
    2
  );
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

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 920,
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

const messageStyle: React.CSSProperties = {
  padding: 16,
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

const summaryStyle: React.CSSProperties = {
  cursor: "pointer",
  fontWeight: 800,
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

const preStyle: React.CSSProperties = {
  maxWidth: 420,
  maxHeight: 220,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  fontSize: 12,
};
