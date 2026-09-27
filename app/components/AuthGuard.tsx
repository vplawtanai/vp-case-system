"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { passwordDestination } from "../../lib/password-onboarding";
import { useI18n } from "../../lib/i18n/provider";

type AuthGuardProps = { children: React.ReactNode; publicRoutes?: boolean };
const Guarded = createContext(false);

export default function AuthGuard({ children, publicRoutes = false }: AuthGuardProps) {
  const parent = useContext(Guarded);
  const pathname = usePathname();
  if (parent || (publicRoutes && pathname === "/login")) return <>{children}</>;
  return <SessionGuard>{children}</SessionGuard>;
}
function SessionGuard({ children }: AuthGuardProps) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [readyPath, setReadyPath] = useState("");
  const [errorText, setErrorText] = useState("");
  useEffect(() => {
    let cancelled = false;
    let running = false;
    const checkAuth = async () => {
      if (running) return;
      running = true;
      try {
        const { data, error } = await getUserWithAbortRetry();
        if (cancelled) return;
        if (error || !data.user) {
          if (isAbortLikeError(error)) { setErrorText("common.auth.failed"); return; }
          setReadyPath(""); router.replace("/login"); return;
        }
        const { data: profile, error: profileError } = await supabase.from("user_profiles")
          .select("id, active, must_change_password").eq("id", data.user.id).single();
        if (cancelled) return;
        if (profileError || !profile || typeof profile.must_change_password !== "boolean") {
          setErrorText("common.auth.failed"); setReadyPath(""); return;
        }
        const destination = passwordDestination(profile, pathname);
        if (destination) {
          setReadyPath("");
          if (destination === "/login") await supabase.auth.signOut();
          if (!cancelled) router.replace(destination);
          return;
        }
        setErrorText(""); setReadyPath(pathname);
      } catch {
        if (!cancelled) { setErrorText("common.auth.failed"); setReadyPath(""); }
      } finally { running = false; }
    };
    void checkAuth();
    const refresh = () => { void checkAuth(); };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    // Continue-use reset detection; navigation always rechecks before rendering.
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      // Never await Supabase work inside its Auth lock callback.
      window.setTimeout(refresh, 0);
    });
    return () => {
      cancelled = true; window.clearInterval(interval); listener.subscription.unsubscribe();
      window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", visible);
    };
  }, [pathname, router]);
  if (readyPath !== pathname || errorText) return <main style={loadingPageStyle}><div style={loadingCardStyle}>
    {t(errorText || "common.auth.checking")}
    {errorText && <button type="button" onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}>{t("common.nav.logout")}</button>}
  </div></main>;
  return <Guarded.Provider value={true}>{children}</Guarded.Provider>;
}

async function getUserWithAbortRetry() {
  const firstResult = await supabase.auth.getUser();
  if (!isAbortLikeError(firstResult.error)) return firstResult;

  await new Promise((resolve) => window.setTimeout(resolve, 150));
  return supabase.auth.getUser();
}

function isAbortLikeError(error: unknown) {
  if (!error) return false;
  const message = error instanceof Error
    ? `${error.name} ${error.message}`
    : String(error);

  return /abort|lock broken|request was aborted|steal/i.test(message);
}

const loadingPageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f8fafc",
  color: "#111111",
};

const loadingCardStyle: React.CSSProperties = {
  padding: 18,
  border: "1px solid #dddddd",
  borderRadius: 12,
  background: "#ffffff",
  fontWeight: 800,
};
