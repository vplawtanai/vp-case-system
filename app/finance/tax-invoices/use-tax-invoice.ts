"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { loadReviewedDocumentLogo } from "../../../lib/documentLogo";
import { taxError, taxInvoiceSelect, taxPresentation, type TaxEligibility, type TaxInvoice } from "./shared";

export function useTaxInvoice(id: string) {
  const [row, setRow] = useState<TaxInvoice | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [blockers, setBlockers] = useState<string[]>([]), [logoUrl, setLogoUrl] = useState("");
  const generation = useRef(0), blob = useRef("");
  const reload = useCallback(async () => {
    const current = ++generation.current; setLoading(true); setError(""); setRow(null); setLogoUrl(""); setBlockers([]);
    if (blob.current) URL.revokeObjectURL(blob.current); blob.current = "";
    try {
      const result = await supabase.from("finance_tax_invoices").select(taxInvoiceSelect).eq("id", id).single();
      if (result.error || !result.data) throw result.error || new Error("not found");
      const value = result.data as TaxInvoice;
      const eligibility = value.status === "draft" ? await supabase.rpc("get_finance_tax_invoice_eligibility", { p_payment_id: value.payment_id }) : null;
      if (eligibility?.error) throw eligibility.error;
      if (generation.current !== current) return;
      setRow(value); setBlockers((eligibility?.data as TaxEligibility | null)?.blockers || []);
      const presentation = taxPresentation(value);
      if (!presentation.ok) { setError(presentation.error); return; }
      const url = await loadReviewedDocumentLogo(supabase, presentation.value.logo);
      if (generation.current !== current) { URL.revokeObjectURL(url); return; }
      blob.current = url; setLogoUrl(url);
    } catch (cause) { if (generation.current === current) setError(taxError(cause)); }
    finally { if (generation.current === current) setLoading(false); }
  }, [id]);
  const dispose = useCallback(() => { generation.current++; if (blob.current) URL.revokeObjectURL(blob.current); }, []);
  useEffect(() => { const timer = setTimeout(() => { void reload(); }, 0); return () => { clearTimeout(timer); dispose(); }; }, [reload, dispose]);
  return { row, loading, error, blockers, logoUrl, reload };
}
