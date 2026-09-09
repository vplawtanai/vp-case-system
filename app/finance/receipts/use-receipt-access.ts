"use client";
import { useI18n } from "../../../lib/i18n/provider";

import { useCallback, useEffect, useState } from "react";
import { buildPermissions, type UserPermissions } from "../../../lib/permissions";
import { supabase } from "../../../lib/supabase";

export function useReceiptAccess(enabled = true) {
  const { t } = useI18n();
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setPermissions(null);
    setError("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw authError || new Error("No user");
      const { data, error: profileError } = await supabase.from("user_profiles").select("*").eq("id", user.id).single();
      if (profileError || !data?.active) throw profileError || new Error("Inactive profile");
      setPermissions(buildPermissions(data));
    } catch {
      setError("finance.receipt.accessFailed");
    } finally { setLoading(false); }
  }, [enabled]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void reload(); }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);
  return { permissions, loading, error: error ? t(error) : "", reload };
}
