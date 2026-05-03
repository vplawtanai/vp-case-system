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
  { id: "judgments", label: "Judgments" },
  { id: "tasks", label: "Tasks" },
  { id: "deadlines", label: "Deadlines" },
  { id: "timelogs", label: "Time Logs" },
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

      for (const section of sections) {
        const el = document.getElementById(section.id);
        if (!el) continue;

        const rect = el.getBoundingClientRect();

        if (rect.top <= 160) {
          current = section.id;
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
          {sections.map((section) => {
            const isActive = active === section.id;

            return (
              <button
                key={section.id}
                type="button"
                onClick={() => handleClick(section.id)}
                style={{
                  ...pillStyle,
                  ...(isActive ? activeStyle : inactiveStyle),
                }}
              >
                {section.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   STYLES
========================================================= */

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

const inactiveStyle: React.CSSProperties = {
  background: "#ffffff",
  color: "#111111",
  border: "1px solid #dddddd",
};

const activeStyle: React.CSSProperties = {
  background: "#000000",
  color: "#ffffff",
  border: "1px solid #000000",
};