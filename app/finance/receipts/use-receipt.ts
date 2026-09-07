"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { receiptSelect, type FinanceReceipt } from "./shared";

export function useReceipt(id: string) {
  const [receipt, setReceipt] = useState<FinanceReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const reload = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setReceipt(null); setError("");
    try {
      const result = await supabase.from("finance_receipts").select(receiptSelect).eq("id", id).maybeSingle();
      if (result.error || !result.data) throw result.error || new Error("No receipt");
      if (request !== sequence.current) return;
      setReceipt(result.data as FinanceReceipt);
    } catch {
      if (request === sequence.current) setError("ไม่พบใบเสร็จรับเงินหรือไม่สามารถโหลดข้อมูลได้");
    } finally { if (request === sequence.current) setLoading(false); }
  }, [id]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void reload(); }, 0);
    return () => { window.clearTimeout(timer); invalidate(); };
  }, [reload, invalidate]);
  return { receipt: receipt?.id === id ? receipt : null, loading, error, reload };
}
