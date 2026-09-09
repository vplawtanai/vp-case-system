"use client";
import { useI18n } from "../../../lib/i18n/provider";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { loadReviewedDocumentLogo } from "../../../lib/documentLogo";
import { receiptPresentation, receiptSelect, type FinanceReceipt } from "./shared";

export function useReceipt(id: string) {
  const { t } = useI18n();
  const [receipt, setReceipt] = useState<FinanceReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const blobUrl = useRef("");
  const sequence = useRef(0);
  const invalidate = useCallback(() => {
    sequence.current++;
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    blobUrl.current = "";
  }, []);
  const reload = useCallback(async () => {
    invalidate();
    const request = sequence.current;
    setLoading(true); setReceipt(null); setError(""); setLogoUrl("");
    try {
      const result = await supabase.from("finance_receipts").select(receiptSelect).eq("id", id).maybeSingle();
      if (result.error || !result.data) throw result.error || new Error("No receipt");
      if (request !== sequence.current) return;
      const row = result.data as FinanceReceipt;
      setReceipt(row);
      const presentation = receiptPresentation(row);
      if (presentation.ok && presentation.value.logo) {
        try {
          const url = await loadReviewedDocumentLogo(supabase, presentation.value.logo);
          if (request !== sequence.current) { URL.revokeObjectURL(url); return; }
          blobUrl.current = url; setLogoUrl(url);
        } catch {
          if (request === sequence.current) setError("finance.receipt.logoLoadFailed");
        }
      }
    } catch {
      if (request === sequence.current) setError("finance.receipt.notFound");
    } finally { if (request === sequence.current) setLoading(false); }
  }, [id, invalidate]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void reload(); }, 0);
    return () => { window.clearTimeout(timer); invalidate(); };
  }, [reload, invalidate]);
  return { receipt: receipt?.id === id ? receipt : null, loading, error: error ? t(error) : "", reload, logoUrl };
}
