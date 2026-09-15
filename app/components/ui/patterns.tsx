import { cloneElement, type ReactElement, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./vp-ui.module.css";

const classes = (...values: (string | undefined)[]) => values.filter(Boolean).join(" ");

export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={classes(styles.scope, styles.page, className)}>{children}</section>;
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return <header className={classes(styles.scope, styles.header)}><div><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{actions ? <div className={styles.actions}>{actions}</div> : null}</header>;
}

export function FilterToolbar({ label, children }: { label: string; children: ReactNode }) {
  return <div className={classes(styles.scope, styles.toolbar)} role="group" aria-label={label}>{children}</div>;
}

// Colors are shared; domain-owned labels and backend statuses remain distinct.
export function statusTone(status: string): "success" | "warning" | "negative" | "info" | "neutral" {
  switch (status) {
    case "confirmed": case "finalized": case "issued": return "success";
    case "reviewed": return "info";
    case "unclassified": case "pending": return "warning";
    case "cancelled": case "voided": case "reversed": return "negative";
    default: return "neutral";
  }
}

export function StatusBadge({ status, label }: { status: string; label: ReactNode }) {
  const tone = statusTone(status);
  return <span data-status={status} className={classes(styles.scope, styles.badge, tone === "neutral" ? undefined : styles[tone])}>{label}</span>;
}

export function SourceBadge({ label }: { label: ReactNode }) {
  return <span className={classes(styles.scope, styles.badge, styles.info)}>{label}</span>;
}

type Fact = { key: string; label: ReactNode; value: ReactNode; emphasis?: boolean };
export function ReadOnlyGrid({ items, className }: { items: Fact[]; className?: string }) {
  return <dl className={classes(styles.scope, styles.facts, className)}>{items.map(item => <div key={item.key}><dt>{item.label}</dt><dd>{item.emphasis ? <strong>{item.value}</strong> : item.value}</dd></div>)}</dl>;
}

// Formatting only. Callers supply authoritative/calculated amounts; never totals here.
export function MoneySummary({ items, locale, currency, className }: { items: (Omit<Fact, "value"> & { amount: number | null })[]; locale: string; currency: string; className?: string }) {
  return <ReadOnlyGrid className={className} items={items.map(({ amount, ...item }) => ({ ...item, value: amount !== null && Number.isFinite(amount) ? `${amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}` : "-" }))} />;
}

export function FieldGroup({ id, label, children, help, error, className }: { id: string; label: ReactNode; children: ReactElement<{ id?: string; "aria-describedby"?: string }>; help?: ReactNode; error?: ReactNode; className?: string }) {
  const describedBy = [...new Set(classes(children.props["aria-describedby"], help ? `${id}-help` : undefined, error ? `${id}-error` : undefined).split(/\s+/).filter(Boolean))].join(" ");
  return <div className={classes(styles.scope, styles.field, className)}><label htmlFor={id}>{label}</label>{cloneElement(children, { id, "aria-describedby": describedBy || undefined })}{help ? <p id={`${id}-help`} className={styles.help}>{help}</p> : null}{error ? <small id={`${id}-error`} className={styles.fieldError}>{error}</small> : null}</div>;
}

export function Disclosure({ title, children }: { title: ReactNode; children: ReactNode }) {
  return <details className={classes(styles.scope, styles.disclosure)}><summary>{title}<ChevronDown size={16} aria-hidden="true" /></summary>{children}</details>;
}

export function Callout({ tone, children, role }: { tone: "info" | "warning" | "success" | "negative"; children: ReactNode; role?: "alert" | "status" }) {
  return <div role={role} className={classes(styles.scope, styles.callout, styles[tone])}>{children}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p role="status" className={classes(styles.scope, styles.empty)}>{children}</p>;
}
