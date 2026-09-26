import type { ReactNode } from "react";
import { FinanceIcon, type FinanceIconName } from "./icons";
import { financeStatusTone, type FinanceTone } from "./status";
import css from "./finance-ui.module.css";

export function FinanceHeader({ title, description, icon, actions }: { title: ReactNode; description?: ReactNode; icon: FinanceIconName; actions?: ReactNode }) {
  return <header className={`${css.scope} ${css.header}`}><div className={css.identity}><span className={css.titleIcon}><FinanceIcon name={icon} size={22}/></span><div><h1>{title}</h1>{description ? <p>{description}</p> : null}</div></div>{actions ? <div className={css.actions}>{actions}</div> : null}</header>;
}
export function FinanceStatusBadge({ status, label, tone }: { status: string; label: ReactNode; tone?: FinanceTone }) {
  const resolved = tone || financeStatusTone(status);
  return <span className={`${css.scope} ${css.badge}`} data-finance-status={status} data-status={status} data-tone={resolved}><span className={css.statusDot} aria-hidden="true"/>{label}</span>;
}
export function FinanceCard({ variant = "summary", tone = "neutral", icon, title, children, action }: { variant?: "metric" | "source" | "action" | "attention" | "compact" | "summary"; tone?: FinanceTone; icon?: FinanceIconName; title: ReactNode; children: ReactNode; action?: ReactNode }) {
  return <section className={`${css.scope} ${css.card}`} data-card-variant={variant} data-tone={tone}><div className={css.cardHeading}>{icon ? <span className={css.cardIcon}><FinanceIcon name={icon}/></span> : null}<h3>{title}</h3></div><div className={css.cardContent}>{children}</div>{action ? <div className={css.cardAction}>{action}</div> : null}</section>;
}
export function FinanceFilterBar({ label, children }: { label: string; children: ReactNode }) {
  return <div className={`${css.scope} ${css.filters}`} role="group" aria-label={label}>{children}</div>;
}
export function FinanceListFrame({ children }: { children: ReactNode }) {
  return <div className={`${css.scope} ${css.listFrame}`}>{children}</div>;
}
