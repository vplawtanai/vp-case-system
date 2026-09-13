"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import DetailModal from "../../components/DetailModal";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { moneyAllocationError, type MoneyContext, type MoneySource } from "./money-allocation";
import styles from "./money-allocation.module.css";

export function MoneyAllocationFacts({ source }: { source: MoneySource }) {
  const { t, locale } = useI18n();
  const facts = { settlement: source.payment.settlement, cash: source.payment.cash, wht: source.payment.wht, vat: source.proven_vat, base: source.proven_base, remaining: source.unallocated_settlement };
  return <dl className={styles.facts}>{Object.entries(facts).map(([key, value]) => <div key={key}><dt>{t(`moneyAllocation.${key}`)}</dt><dd>{Number(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {source.payment.currency}</dd></div>)}</dl>;
}

export function MoneyAllocationPanel({ paymentId }: { paymentId: string }) {
  const { t, locale, date } = useI18n();
  const [context, setContext] = useState<MoneyContext | null>(null), [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const lock = useRef(false);
  const install = useCallback((c: MoneyContext) => { setContext(c); }, []);
  const reload = useCallback(async () => {
    const r = await supabase.rpc("get_finance_money_allocation", { p_payment_id: paymentId });
    if (r.error || !r.data?.source) throw r.error || new Error("response");
    install(r.data as MoneyContext);
  }, [paymentId, install]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await supabase.rpc("get_finance_money_allocation", { p_payment_id: paymentId });
        if (r.error || !r.data?.source) throw r.error || new Error("response");
        if (!cancelled) { install(r.data as MoneyContext); setLoadFailed(false); }
      } catch { if (!cancelled) setLoadFailed(true); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [paymentId, install]);
  const current = context?.current;
  async function refresh() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await reload(); setLoadFailed(false); } catch (e) { setError(moneyAllocationError(e, locale)); } finally { lock.current = false; setBusy(false); }
  }
  const amount = (value: number) => Number(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <section className={styles.section}>
    <div className={styles.heading}><h2>{t("moneyAllocation.title")}</h2></div>
    {loading ? <p role="status">{t("moneyAllocation.loading")}</p> : null}
    {!open && (error || loadFailed) ? <p className={styles.error} role="alert">{error || t("moneyAllocation.error.unknown")}</p> : null}
    <p className={styles.muted}>{t("moneyAllocation.boundary")}</p>
    {context ? <button className={styles.button} disabled={busy} onClick={() => { setError(""); setOpen(true); void refresh(); }}>{t("moneyAllocation.open")}</button> : !loading ? <button className={styles.button} disabled={busy} onClick={() => void refresh()}>{t("moneyAllocation.retry")}</button> : null}
    <DetailModal open={open} title={t("moneyAllocation.title")}
      onClose={() => { if (!busy) setOpen(false); }} closeOnBackdrop={!busy}>
      {context ? <div className={styles.body} aria-busy={busy}>
        {error ? <div className={styles.error} role="alert">{error} <button className={styles.button} disabled={busy} onClick={() => void refresh()}>{t("moneyAllocation.retry")}</button></div> : null}
        {current && !context.source_current ? <p className={styles.warning}>{t("moneyAllocation.stale")}</p> : null}
        <MoneyAllocationFacts source={context.source} />
        {context.source.invoices?.map(invoice => <div className={styles.line} key={invoice.invoice_id}>
          <Link href={`/finance/invoices/${invoice.invoice_id}`}>{invoice.invoice_no}</Link>
          <p className={styles.muted}>{t("moneyAllocation.coverage")}: {amount(invoice.settlement)} / {amount(invoice.gross)} {context.source.payment.currency}</p>
        </div>)}
        {context.source.blockers.map(b => <p className={styles.warning} key={b}>{t(`moneyAllocation.block.${b}`)}</p>)}
        <h3>{t("moneyAllocation.lines")}</h3>
        <div className={styles.fields}>
          {context.source.lines.map((line) => <div className={styles.line} key={line.invoice_item_id}>
            <div><Link href={`/finance/invoices/${line.invoice_id}`}>{line.invoice_no}</Link><h4>{line.description}</h4></div>
            <dl className={styles.facts}>{(["base", "vat", "settlement", "cash", "wht"] as const).map(key => <div key={key}><dt>{t(`moneyAllocation.${key}`)}</dt><dd>{amount(line[key])} {context.source.payment.currency}</dd></div>)}</dl>
            <p className={styles.muted}>{t("moneyAllocation.vatTreatment")}: {t(`moneyAllocation.vat.${line.vat_treatment.treatment}`)}
              {line.wht_evidence?.rate_percent != null ? <> · {t("moneyAllocation.whtBasis")}: {amount(line.wht_evidence.base_amount)} · {t("moneyAllocation.whtRate")}: {line.wht_evidence.rate_percent}%</> : null}</p>
          </div>)}
        </div>
        {context.history.length ? <details className={styles.history}><summary>{t("moneyAllocation.history")}</summary>{context.history.map(h => <details className={styles.line} key={h.id}><summary>{t("moneyAllocation.revision", { revision: h.revision })} · {t(`moneyAllocation.${h.status}`)} · {date(h.created_at, true)}</summary>
          <MoneyAllocationFacts source={h.source_snapshot_json} />{h.decisions_json.map(c => <p key={c.invoice_item_id}>{h.source_snapshot_json.lines.find(l => l.invoice_item_id === c.invoice_item_id)?.description} · {t(`moneyAllocation.category.${c.category}`)}: {c.reason}</p>)}{h.supersede_reason ? <p>{h.supersede_reason}</p> : null}
        </details>)}</details> : null}
      </div> : null}
    </DetailModal>
  </section>;
}
