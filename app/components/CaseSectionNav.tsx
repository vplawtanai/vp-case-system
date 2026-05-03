"use client";

import { useEffect, useState } from "react";

type Section = {
  id: string;
  label: string;
};

const sections: Section[] = [
  { id: "info", label: "Info" },
  { id: "parties", label: "Parties" },
  { id: "timeline", label: "Timeline" },
  { id: "tasks", label: "Tasks" },
  { id: "timelogs", label: "Time Logs" },
  { id: "deadlines", label: "Deadlines" },
  { id: "notes", label: "Notes" },
  { id: "fees", label: "Fees" },
];

export default function CaseSectionNav() {
  const [active, setActive] = useState<string>("info");

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;

    const offset = 120;
    const y = el.getBoundingClientRect().top + window.scrollY - offset;

    window.scrollTo({
      top: y,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const handleScroll = () => {
      let current = "info";

      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (!el) continue;

        const rect = el.getBoundingClientRect();
        if (rect.top <= 160) {
          current = s.id;
        }
      }

      setActive(current);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div style={outerWrapStyle}>
      <div style={wrapperStyle}>
        <div style={navContainerStyle}>
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleClick(s.id)}
              style={{
                ...pillStyle,
                ...(active === s.id ? activeStyle : {}),
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const outerWrapStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 30,
  background: "#ffffff",
  marginBottom: 16,
};

const wrapperStyle: React.CSSProperties = {
  borderBottom: "1px solid #eeeeee",
  paddingTop: 8,
  paddingBottom: 8,
};

const navContainerStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
  overflowX: "visible",
  padding: "0 4px 2px 4px",
};

const pillStyle: React.CSSProperties = {
  flex: "0 1 auto",
  whiteSpace: "nowrap",
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid #dddddd",
  background: "#ffffff",
  color: "#111111",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
  minHeight: 40,
};

const activeStyle: React.CSSProperties = {
  background: "#000000",
  color: "#ffffff",
  border: "1px solid #000000",
};