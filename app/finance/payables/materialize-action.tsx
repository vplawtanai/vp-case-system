"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Callout } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import { payableError } from "./shared";
import styles from "./payables.module.css";

// The caller mounts this only for a finalized current distribution.
export function MaterializeEntitlements({ distributionId, version, canManage }: { distributionId: string; version: number; canManage: boolean }) {
  const { t, locale } = useI18n();
  const [state, setState] = useState<"loading" | "missing" | "ready" | "failed">("loading");
  const [ack, setAck] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null);
  const lock = useRef(false);
  const read = useCallback(async () => {
    const result = await supabase.from("finance_payable_entitlement_sources").select("status").eq("distribution_id", distributionId).maybeSingle();
    if (result.error) throw result.error;
    if (result.data && result.data.status !== "open") throw new Error("PAYABLE_SOURCE_CHANGED");
    return result.data ? "ready" as const : "missing" as const;
  }, [distributionId]);
  useEffect(() => {
    let cancelled = false;
    void read().then(value => { if (!cancelled) setState(value); }).catch(failure => { if (!cancelled) { setState("failed"); setError(failure); } });
    return () => { cancelled = true; };
  }, [read]);
  async function run(create: boolean) {
    if (lock.current || (create && (!canManage || state !== "missing"))) return;
    if (create && !ack) { setError({ message: "PAYABLE_ACK_REQUIRED" }); return; }
    lock.current = true; setBusy(true); setError(null);
    try {
      if (create) {
        const result = await supabase.rpc("ensure_finance_payable_entitlements", { p_distribution_id: distributionId, p_expected_version: version, p_acknowledged: ack });
        if (result.error || result.data !== distributionId) throw result.error || new Error("response");
      }
      setState(await read()); setAck(false);
    } catch (failure) { setError(failure); setState("failed"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className={`${ui.scope} ${styles.materialize}`} aria-busy={busy}>
    <h3>{t("payables.title")}</h3><p>{t("payables.materializeHelp")}</p>
    {error ? <Callout tone="negative" role="alert">{payableError(error, locale)}</Callout> : null}
    {state === "loading" ? <p role="status">{t("common.state.loading")}</p> : state === "ready" ? <p role="status">{t("payables.ready")}</p> : null}
    {state === "missing" && canManage ? <label className={styles.check}><input type="checkbox" checked={ack} disabled={busy} onChange={event => { setAck(event.target.checked); setError(null); }} />{t("payables.ack")}</label> : null}
    {state === "missing" && !canManage ? <p>{t("payables.readOnly")}</p> : null}
    <div className={styles.actions}>
      {state === "missing" && canManage ? <button type="button" className={ui.primary} disabled={busy} onClick={() => void run(true)}>{t("payables.materialize")}</button> : null}
      {state === "failed" ? <button type="button" className={ui.secondary} disabled={busy} onClick={() => void run(false)}>{t("common.actions.retry")}</button> : null}
      <Link className={ui.secondary} href="/finance/payables">{t("payables.title")}</Link>
    </div>
  </section>;
}
