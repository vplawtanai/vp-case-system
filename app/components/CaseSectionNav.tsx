"use client";

import { useEffect, useMemo, useState } from "react";

type Section = {
  id: string;
  label: string;
  shortLabel?: string;
};

type Props = {
  canViewFees?: boolean;
};

const sections: Section[] = [
  { id: "info", label: "Case Info", shortLabel: "Info" },
  { id: "parties", label: "Parties" },
  { id: "timeline", label: "Timeline" },
  { id: "judgments", label: "Judgments", shortLabel: "Judgment" },
  { id: "enforcement", label: "Enforcement", shortLabel: "Enforce" },
  { id: "tasks", label: "Tasks" },
  { id: "deadlines", label: "Deadlines" },
  { id: "timelogs", label: "Time Logs", shortLabel: "Time" },
  { id: "fees", label: "Fees" },
  { id: "notes", label: "Notes" },
  { id: "history", label: "History" },
];

export default function CaseSectionNav({ canViewFees = false }: Props) {
  const [active, setActive] = useState<string>("info");

  const visibleSections = useMemo(() => {
    return sections.filter((section) => {
      if (section.id === "fees") return canViewFees;
      return true;
    });
  }, [canViewFees]);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;

    const offset = 104;
    const y = el.getBoundingClientRect().top + window.scrollY - offset;

    window.scrollTo({
      top: y,
      behavior: "smooth",
    });

    setActive(id);
  };

  useEffect(() => {
    const handleScroll = () => {
      let current = "info";

      for (const section of visibleSections) {
        const el = document.getElementById(section.id);
        if (!el) continue;

        const rect = el.getBoundingClientRect();

        if (rect.top <= 130) {
          current = section.id;
        }
      }

      setActive(current);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, [visibleSections]);

  return (
    <div style={outerWrapStyle}>
      <div style={navShellStyle}>
        <div style={navContainerStyle}>
          {visibleSections.map((section) => {
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
                aria-current={isActive ? "true" : undefined}
                title={section.label}
              >
                <span style={desktopLabelStyle}>{section.label}</span>
                <span style={mobileLabelStyle}>
                  {section.shortLabel || section.label}
                </span>
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
  background: "rgba(255,255,255,0.92)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  marginBottom: 14,
  borderBottom: "1px solid #eeeeee",
};

const navShellStyle: React.CSSProperties = {
  padding: "8px 0",
};

const navContainerStyle: React.CSSProperties = {
  display: "flex",
  gap: 7,
  alignItems: "center",
  overflowX: "auto",
  overflowY: "hidden",
  whiteSpace: "nowrap",
  padding: "0 2px 3px 2px",
  scrollbarWidth: "thin",
  WebkitOverflowScrolling: "touch",
};

const pillStyle: React.CSSProperties = {
  flex: "0 0 auto",
  whiteSpace: "nowrap",
  padding: "8px 12px",
  borderRadius: 999,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
  minHeight: 34,
  lineHeight: 1,
  transition: "background 0.15s ease, color 0.15s ease, border 0.15s ease",
};

const inactiveStyle: React.CSSProperties = {
  background: "#ffffff",
  color: "#333333",
  border: "1px solid #dddddd",
};

const activeStyle: React.CSSProperties = {
  background: "#000000",
  color: "#ffffff",
  border: "1px solid #000000",
};

const desktopLabelStyle: React.CSSProperties = {
  display: "inline",
};

const mobileLabelStyle: React.CSSProperties = {
  display: "none",
};