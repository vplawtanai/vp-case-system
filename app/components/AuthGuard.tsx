"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type AuthGuardProps = {
  children: React.ReactNode;
};

export default function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();

  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("id, active")
        .eq("id", data.user.id)
        .single();

      if (profileError || !profile || !profile.active) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      setChecking(false);
    };

    checkAuth();
  }, [router]);

  if (checking) {
    return (
      <main style={loadingPageStyle}>
        <div style={loadingCardStyle}>Checking login...</div>
      </main>
    );
  }

  return <>{children}</>;
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