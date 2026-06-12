"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type AuthGuardProps = {
  children: React.ReactNode;
};

export default function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [errorText, setErrorText] = useState("");
  const didStartCheck = useRef(false);

  useEffect(() => {
    if (didStartCheck.current) return;
    didStartCheck.current = true;
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const { data, error } = await getUserWithAbortRetry();

        if (cancelled) return;

        if (error || !data.user) {
          if (isAbortLikeError(error)) {
            setErrorText("ไม่สามารถตรวจสอบสถานะการเข้าสู่ระบบได้ กรุณารีเฟรชหรือลองเข้าสู่ระบบใหม่");
            setChecking(false);
            return;
          }

          router.replace("/login");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("user_profiles")
          .select("id, active")
          .eq("id", data.user.id)
          .single();

        if (cancelled) return;

        if (profileError || !profile || !profile.active) {
          await supabase.auth.signOut();
          router.replace("/login");
          return;
        }

        setChecking(false);
      } catch (error) {
        if (cancelled) return;
        console.warn("Auth check failed", error);
        setErrorText("ไม่สามารถตรวจสอบสถานะการเข้าสู่ระบบได้ กรุณารีเฟรชหรือลองเข้าสู่ระบบใหม่");
        setChecking(false);
      }
    };

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (checking || errorText) {
    return (
      <main style={loadingPageStyle}>
        <div style={loadingCardStyle}>
          {errorText || "Checking login..."}
        </div>
      </main>
    );
  }

  return <>{children}</>;
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
