"use client";

import { useEffect, useRef, useState } from "react";

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
  { id: "service", label: "Service" },
  { id: "notes", label: "Notes" },
  { id: "fees", label: "Fees" },
];

export default function CaseSectionNav() {
  const [active, setActive] = useState<string>("info");
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const activeBtn = container.querySelector(
      `[data-id="${active}"]`
    ) as HTMLElement | null;

    if (!activeBtn) return;

    const containerRect = container.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();

    const offset =
      btnRect.left -
      containerRect.left -
      containerRect.width / 2 +
      btnRect.width / 2;

    container.scrollTo({
      left: container.scrollLeft + offset,
      behavior: "smooth",
    });
  }, [active]);

  return (
    <div style={outerWrapStyle}>
      <div style={wrapperStyle}>
        <div ref={containerRef} style={scrollContainerStyle}>
          {sections.map((s) => (
            <button
              key={s.id}
              data-id={s.id}
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
  background: "#fff",
  marginBottom: 16,
};

const wrapperStyle: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  paddingTop: 8,
  paddingBottom: 8,
};

const scrollContainerStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  overflowX: "auto",
  WebkitOverflowScrolling: "touch",
  padding: "0 4px 2px 4px",
  scrollbarWidth: "none",
};

const pillStyle: React.CSSProperties = {
  flexShrink: 0,
  whiteSpace: "nowrap",
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#111",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 500,
  minHeight: 40,
};

const activeStyle: React.CSSProperties = {
  background: "#000",
  color: "#fff",
  border: "1px solid #000",
};