"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Banknote, CircleAlert, Landmark, MoreHorizontal, Plus, RotateCcw, Wallet } from "lucide-react";
import DetailModal from "../../components/DetailModal";
import { Disclosure, EmptyState, FieldGroup, ReadOnlyGrid, StatusBadge } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { useI18n } from "../../../lib/i18n/provider";
import { emptyMovementFilters, filterMovements, movementDate, movementSource, treasuryOverview, type CurrencyTotal } from "./dashboard";
import { locationKey, locationName, openingStart, sourceHref, type CashMovement, type Location, type Opening, type TreasuryData, type TreasurySource } from "./shared";
import styles from "./treasury.module.css";

type Props = {
 data: TreasuryData; offset: number; loading: boolean; busy: boolean;
 onPage: (offset: number) => void;
 onOpening: (account: Location, saved?: Opening | null, replace?: boolean) => void;
 onMaterialize: (source: TreasurySource) => void;
};

export function TreasuryDashboard({ data, offset, loading, busy, onPage, onOpening, onMaterialize }: Props) {
 const { t, locale, date } = useI18n(), overview = treasuryOverview(data);
 const [filters, setFilters] = useState(emptyMovementFilters), [detail, setDetail] = useState<CashMovement | null>(null);
 const movementHeading = useRef<HTMLHeadingElement>(null);
 const visible = filterMovements(data.transactions, filters);
 const money = (value: number, currency: string) => `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
 const accountFor = (row: { bank_account_id: string | null; cash_location_id: string | null }) => data.accounts.find(a => locationKey(a) === locationKey(row));
 const totals = (values: CurrencyTotal[]) => values.map(v => <strong key={v.currency} className={styles.summaryValue}><span data-summary-amount>{v.amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><small>{v.currency}</small></strong>);
 const reference = (row: CashMovement) => movementSource(row)?.reference || row.reference_no || row.id.slice(0, 8).toUpperCase();
 function viewAccount(account: Location) {
  setFilters({ ...emptyMovementFilters, account: locationKey(account) }); onPage(0);
  movementHeading.current?.focus({ preventScroll: true }); movementHeading.current?.scrollIntoView({ block: "start" });
 }
 function openingAction(account: Location) {
  onOpening(account, data.openings.find(o => o.status === "draft" && locationKey(o) === locationKey(account)) || null, !!account.opening_id);
 }
 return <>
  <div className={styles.summaries} data-treasury-summary>
   <article className={styles.summaryCard} data-summary="known"><div className={styles.summaryTitle}><Wallet size={21} /><h2>{t("treasury.knownTotal")}</h2></div>
    {overview.balances.length ? totals(overview.balances) : <strong className={styles.summaryText}>{t("treasury.noKnown")}</strong>}<p>{t("treasury.knownHelp")}</p>
   </article>
   <article className={styles.summaryCard} data-summary="pending"><div className={styles.summaryTitle}><ArrowDownToLine size={21} /><h2>{t("treasury.pendingTotal")}</h2></div>
    {overview.pending ? <><strong className={styles.summaryText}>{t("treasury.pendingCount", { count: overview.pending.count })}</strong>{totals(overview.pending.totals)}{!overview.pending.count ? <p>{t("treasury.pendingEmpty")}</p> : null}</> : <p>{t("treasury.pendingRestricted")}</p>}
   </article>
   <article className={styles.summaryCard} data-summary="unknown"><div className={styles.summaryTitle}><CircleAlert size={21} /><h2>{t("treasury.unknownAccounts")}</h2></div>
    <strong className={styles.summaryValue}>{t("treasury.accountCount", { count: overview.unknown.length })}</strong><p>{overview.unknown.length ? overview.unknown.map(a => locationName(a, locale)).join(" · ") : t("treasury.allKnown")}</p>
   </article>
  </div>
  <section className={styles.section} aria-labelledby="treasury-accounts"><h2 id="treasury-accounts">{t("treasury.accounts")}</h2>
   {!overview.accounts.length ? <EmptyState>{t("treasury.accountsEmpty")}</EmptyState> : <div className={styles.accounts}>{overview.accounts.map(a => {
    const known = overview.known.includes(a);
    return <article className={styles.accountCard} data-account={locationKey(a)} data-balance={known ? "known" : "unknown"} key={locationKey(a)}>
     <header><div className={styles.accountTitle}>{a.kind === "bank" ? <Landmark size={20} /> : <Banknote size={20} />}<h3>{locationName(a, locale)}</h3></div>
      {data.can_manage && a.is_active && a.opening_id ? <details className={styles.accountMenu} onKeyDown={e => { if (e.key === "Escape") { e.currentTarget.open = false; e.currentTarget.querySelector("summary")?.focus(); } }} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.open = false; }}>
       <summary title={t("treasury.accountActions", { account: locationName(a, locale) })} aria-label={t("treasury.accountActions", { account: locationName(a, locale) })}><MoreHorizontal size={20} /></summary>
       <div><button type="button" disabled={busy} onClick={e => { const menu = e.currentTarget.closest("details"); if (menu) { menu.querySelector("summary")?.focus(); menu.open = false; } openingAction(a); }}>{t("treasury.replacement")}</button></div>
      </details> : null}
     </header>
     {known ? <><div className={styles.balanceLabel}><span>{t("treasury.balance")}</span><span className={styles.knownState}>{t("treasury.openingSet")}</span></div><strong className={styles.accountAmount}>{money(a.system_balance!, a.currency)}</strong></> : <><strong className={styles.unknownState}>{t("treasury.unavailable")} <small>{a.currency}</small></strong><span className={styles.muted}>{t(a.opening_id ? "treasury.unavailable" : "treasury.unknown")}</span></>}
     {a.kind === "bank" && (a.bank_name || a.account_number) ? <p className={styles.accountMeta}>{[a.bank_name, a.account_number].filter(Boolean).join(" · ")}</p> : null}
     {!a.is_active ? <p className={styles.accountMeta}>{t("treasury.inactive")}</p> : null}
     <footer>{data.can_manage && a.is_active && !a.opening_id ? <button type="button" className={ui.secondary} disabled={busy} onClick={() => openingAction(a)}><Plus size={16} />{t("treasury.opening")}</button> : null}
      <button type="button" className={styles.textAction} onClick={() => viewAccount(a)}>{t("treasury.viewMovements")}<ArrowRight size={15} /></button>
     </footer>
    </article>;
   })}</div>}
  </section>
  {data.can_manage ? <section className={styles.section} aria-labelledby="treasury-pending"><div className={styles.sectionHeading}><h2 id="treasury-pending">{t("treasury.pending")}</h2><span className={styles.queueTotal}>{t("treasury.pendingCount", { count: data.pending_sources.length })}{overview.pending?.totals.map(v => <span key={v.currency}> · {money(v.amount, v.currency)}</span>)}</span></div>
   <p className={styles.muted}>{t("treasury.pendingHelp")}</p>
   {!data.pending_sources.length ? <EmptyState>{t("treasury.pendingEmpty")}</EmptyState> : <table className={`${styles.table} ${styles.pendingTable}`}><thead><tr>
    {["receivedDate", "reference", "amount", "targetAccount", "source", "status", "actions"].map(key => <th key={key} scope="col">{t(`treasury.${key}`)}</th>)}</tr></thead>
    <tbody>{data.pending_sources.map(s => <tr key={`${s.source_type}:${s.source_id}`}>
     <td data-label={t("treasury.receivedDate")}>{date(s.received_on)}</td>
     <td data-label={t("treasury.reference")}><Link href={sourceHref(s)} className={styles.reference}>{s.reference}</Link></td>
     <td data-label={t("treasury.amount")} className={styles.money}>{money(s.cash_amount, s.currency)}</td>
     <td data-label={t("treasury.targetAccount")}>{locationName(accountFor(s), locale)}</td>
     <td data-label={t("treasury.source")}><span>{t(`treasury.${s.source_type}`)}</span>{s.payer_name ? <small>{s.payer_name}</small> : null}</td>
     <td data-label={t("treasury.status")}><StatusBadge status="pending" label={t("treasury.awaiting")} /></td>
     <td className={styles.rowActions}><button type="button" className={ui.secondary} disabled={busy} onClick={() => onMaterialize(s)}><ArrowDownToLine size={16} />{t("treasury.materialize")}</button></td>
    </tr>)}</tbody></table>}
  </section> : null}
  <section className={styles.section} aria-labelledby="treasury-movements"><h2 id="treasury-movements" ref={movementHeading} tabIndex={-1}>{t("treasury.history")}</h2>
   <div className={styles.filters}>
    <FieldGroup id="cashbook-account" label={t("treasury.account")}><select value={filters.account} onChange={e => setFilters({ ...filters, account: e.target.value })}><option value="">{t("treasury.allAccounts")}</option>{data.accounts.map(a => <option key={locationKey(a)} value={locationKey(a)}>{locationName(a, locale)}</option>)}</select></FieldGroup>
    <FieldGroup id="cashbook-direction" label={t("treasury.type")}><select value={filters.direction} onChange={e => setFilters({ ...filters, direction: e.target.value })}><option value="">{t("treasury.allTypes")}</option>{["inflow", "outflow"].map(d => <option key={d} value={d}>{t(`treasury.${d}`)}</option>)}</select></FieldGroup>
    <FieldGroup id="cashbook-from" label={t("treasury.fromDate")}><input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /></FieldGroup>
    <FieldGroup id="cashbook-to" label={t("treasury.toDate")}><input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /></FieldGroup>
    <button type="button" className={ui.secondary} title={t("treasury.resetFilters")} aria-label={t("treasury.resetFilters")} onClick={() => setFilters(emptyMovementFilters)}><RotateCcw size={18} /></button>
   </div>
   <p className={styles.muted}>{t("treasury.pageScope", { page: offset / 50 + 1, count: data.transactions.length })}</p>
   {!visible.length ? <EmptyState>{t(data.transactions.length ? "treasury.noMatches" : "treasury.empty")}</EmptyState> : <table className={`${styles.table} ${styles.movementTable}`}><thead><tr>
    {["date", "account", "type", "entry", "inflow", "outflow", "actions"].map(key => <th scope="col" key={key}>{key === "actions" ? <span className={styles.srOnly}>{t(`treasury.${key}`)}</span> : t(`treasury.${key}`)}</th>)}</tr></thead>
    <tbody>{visible.map(c => { const source = movementSource(c); return <tr key={c.id} data-movement={c.id}>
     <td data-label={t("treasury.date")}>{date(movementDate(c))}</td>
     <td data-label={t("treasury.account")}>{locationName(accountFor(c), locale)}</td>
     <td data-label={t("treasury.type")}><span className={styles.direction} data-direction={c.direction}>{c.direction === "inflow" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}{t(`treasury.${c.direction}`)}</span><small><StatusBadge status={c.status} label={t(`treasury.${c.status}`)} /></small></td>
     <td data-label={t("treasury.entry")}>{source ? <><Link href={sourceHref(source)} className={styles.reference}>{source.reference}</Link><small>{t(`treasury.${source.source_type}`)}</small></> : <><strong>{reference(c)}</strong>{c.description ? <small>{c.description}</small> : null}</>}</td>
     <td data-label={t("treasury.inflow")} className={`${styles.money} ${styles.inflow}`}>{c.direction === "inflow" ? money(c.cash_amount, c.currency) : "-"}</td>
     <td data-label={t("treasury.outflow")} className={styles.money}>{c.direction === "outflow" ? money(c.cash_amount, c.currency) : "-"}</td>
     <td className={styles.rowActions}><button className={ui.secondary} type="button" title={t("treasury.openMovement", { reference: reference(c) })} aria-label={t("treasury.openMovement", { reference: reference(c) })} onClick={() => setDetail(c)}><MoreHorizontal size={18} /></button></td>
    </tr>; })}</tbody></table>}
   {offset || data.has_next ? <div className={styles.pagination}><button className={ui.secondary} disabled={!offset || loading} aria-label={t("finance.receipt.previous")} onClick={() => onPage(Math.max(0, offset - 50))}><ArrowLeft size={18} /></button><button className={ui.secondary} disabled={!data.has_next || loading} aria-label={t("finance.receipt.next")} onClick={() => onPage(offset + 50)}><ArrowRight size={18} /></button></div> : null}
  </section>
  <Disclosure title={t("treasury.openingHistory")}>{data.openings.map(o => <article className={styles.history} key={o.id}>
   <div className={styles.actions}><strong>{locationName(accountFor(o), locale)}</strong><StatusBadge status={o.status} label={t(`treasury.${o.status}`)} /><span>{date(openingStart(o.as_of))} · {money(o.balance_amount, o.currency)}</span></div>
   <p>{o.note}</p>{o.status === "draft" && data.can_manage && accountFor(o) ? <button className={ui.secondary} onClick={() => onOpening(accountFor(o)!, o)}>{t("common.actions.edit")}</button> : null}
  </article>)}</Disclosure>
  <DetailModal open={!!detail} title={t("treasury.movementDetails")} size="edit" onClose={() => setDetail(null)}>{detail ? <>
   <ReadOnlyGrid items={[
    { key: "reference", label: t("treasury.reference"), value: reference(detail) }, { key: "date", label: t("treasury.date"), value: date(movementDate(detail)) },
    { key: "account", label: t("treasury.account"), value: locationName(accountFor(detail), locale) }, { key: "cash", label: t(`treasury.${detail.direction}`), value: money(detail.cash_amount, detail.currency) },
    { key: "status", label: t("treasury.status"), value: <StatusBadge status={detail.status} label={t(`treasury.${detail.status}`)} /> },
   ]} /><p>{detail.description}</p><Disclosure title={t("treasury.technical")}><pre className={styles.technical}>{JSON.stringify(detail, null, 2)}</pre></Disclosure>
  </> : null}</DetailModal>
 </>;
}
