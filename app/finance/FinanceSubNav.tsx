"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { UserPermissions } from "../../lib/permissions";
import { activeFinancePage, financeNavigationItems, type FinanceNavigationGroup, type FinanceSubNavPage } from "./finance-navigation";
import styles from "./finance-sub-nav.module.css";
import { useI18n } from "../../lib/i18n/provider";

export default function FinanceSubNav({
  activePage,
  permissions,
}: {
  activePage: FinanceSubNavPage;
  permissions: UserPermissions;
}) {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const items = financeNavigationItems(permissions, locale);
  const currentPage = activeFinancePage(pathname, activePage);

  return (
    <nav className={styles.nav} aria-label={t("finance.nav.label")}>
      {items.map((link) => "group" in link ? (
        <NavigationGroup key={`${pathname}:${link.group}`} group={link} activePage={currentPage} />
      ) : (
        <Link
          key={link.href}
          href={link.href}
          className={`${styles.link} ${currentPage === link.page ? styles.activeLink : ""}`}
          aria-current={currentPage === link.page ? "page" : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

function NavigationGroup({ group, activePage }: { group: FinanceNavigationGroup; activePage: FinanceSubNavPage }) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const active = group.children.some(link => link.page === activePage);

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const resize = () => setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      window.removeEventListener("resize", resize);
    };
  }, [open]);

  const show = (focus?: "first" | "last") => {
    const left = root.current?.getBoundingClientRect().left || 0;
    const width = Math.min(280, window.innerWidth - 32);
    setOffset(Math.max(16, Math.min(left, window.innerWidth - width - 16)) - left);
    setOpen(true);
    if (focus) requestAnimationFrame(() => {
      const links = panel.current?.querySelectorAll<HTMLAnchorElement>("a");
      links?.[focus === "last" ? links.length - 1 : 0]?.focus();
    });
  };

  return <div ref={root} className={styles.group} onKeyDown={event => {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} type="button" className={`${styles.link} ${styles.groupTrigger} ${active ? styles.activeLink : ""}`}
      aria-expanded={open} aria-controls={id} onClick={() => open ? setOpen(false) : show()}
      onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); show(event.key === "ArrowUp" ? "last" : "first"); } }}>
      {group.label}<span className={styles.chevron} aria-hidden="true" />
    </button>
    {open ? <div id={id} ref={panel} className={styles.dropdown} style={{ left: offset }} onKeyDown={event => {
      const links = Array.from(panel.current?.querySelectorAll<HTMLAnchorElement>("a") || []);
      const index = links.indexOf(document.activeElement as HTMLAnchorElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? links.length - 1 : event.key === "ArrowDown" ? (index + 1) % links.length : event.key === "ArrowUp" ? (index - 1 + links.length) % links.length : null;
      if (next !== null) { event.preventDefault(); links[next]?.focus(); }
    }}>
      {group.children.map(link => <Link key={link.href} href={link.href} className={`${styles.dropdownLink} ${activePage === link.page ? styles.currentChild : ""}`}
        aria-current={activePage === link.page ? "page" : undefined} onClick={() => setOpen(false)}>{link.label}</Link>)}
    </div> : null}
  </div>;
}
