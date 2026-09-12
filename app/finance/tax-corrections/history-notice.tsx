"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { translate } from "../../../lib/i18n/catalog";
import { correctionError, type CorrectionContext } from "./shared";
import styles from "../tax-invoices/tax-invoices.module.css";

// An annotation alongside frozen content, never a rewrite of the original snapshot.
const documentText = (key: string) => `${translate("th", key)} / ${translate("en", key)}`;
export function TaxCorrectionHistoryNotice({ taxId, combinedId = null }: { taxId: string; combinedId?: string | null }) {
  const [state, setState] = useState<{ key: string; context: CorrectionContext | null; error: string } | null>(null);
  const key = `${taxId}:${combinedId}`;
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const result = await supabase.rpc("get_finance_tax_correction_context", { p_tax_invoice_id: taxId, p_combined_id: combinedId });
        if (result.error) throw result.error;
        if (live) setState({ key, context: result.data, error: "" });
      } catch (error) { if (live) setState({ key, context: null, error: `${correctionError(error, "th")} / ${correctionError(error, "en")}` }); }
    })();
    return () => { live = false; };
  }, [taxId, combinedId, key]);
  if (state?.key !== key) return <p role="status" className={`${styles.notice} ${styles.noPrint}`}>{documentText("taxCorrection.history")} · {documentText("common.state.loading")}</p>;
  if (state.error) return <p role="alert" className={`${styles.error} ${styles.noPrint}`}>{documentText("taxCorrection.history")} · {state.error}</p>;
  const id = state.context?.source.source_correction_id;
  return id ? <p className={styles.warning}>{documentText("taxCorrection.replaced")} <Link href={`/finance/tax-corrections/${id}`}>{state.context?.source.document_no}</Link></p> : null;
}
