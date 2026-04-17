"use client";

import Link from "next/link";

type AppTopNavProps = {
  title: string;
  subtitle?: string;
  activePage: "dashboard" | "alerts" | "cases";
};

export default function AppTopNav({
  title,
  subtitle,
  activePage,
}: AppTopNavProps) {
  const getLinkStyle = (
    page: "dashboard" | "alerts" | "cases"
  ): React.CSSProperties => {
    const isActive = activePage === page;

    if (isActive) {
      return primaryLinkButtonStyle;
    }

    return linkButtonStyle;
  };

  return (
    <div style={topBarStyle}>
      <div>
        <h1 style={titleStyle}>{title}</h1>
        {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
      </div>

      <div style={navGroupStyle}>
        <Link href="/dashboard" style={getLinkStyle("dashboard")}>
          Dashboard
        </Link>

        <Link href="/alerts" style={getLinkStyle("alerts")}>
          Alerts
        </Link>

        <Link href="/cases" style={getLinkStyle("cases")}>
          Cases
        </Link>
      </div>
    </div>
  );
}

const topBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 20,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  margin: "8px 0 0 0",
  color: "#555",
};

const navGroupStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const linkButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #ccc",
  color: "#111",
  textDecoration: "none",
  background: "#fff",
};

const primaryLinkButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid black",
  color: "white",
  textDecoration: "none",
  background: "black",
};