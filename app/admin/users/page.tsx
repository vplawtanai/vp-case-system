"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGuard from "../../components/AuthGuard";
import AppTopNav from "../../components/AppTopNav";
import { supabase } from "../../../lib/supabase";
import { buildPermissions } from "../../../lib/permissions";
import type { UserPermissions, UserRole } from "../../../lib/permissions";

type CurrentProfile = {
  role?: UserRole | string | null;
  financial_access?: boolean | null;
};

type UserProfileRow = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  staff_name?: string | null;
  role?: string | null;
  financial_access?: boolean | null;
  active?: boolean | null;
};

export default function UsersPage() {
  const [profile, setProfile] = useState<CurrentProfile>({
    role: "",
    financial_access: false,
  });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [users, setUsers] = useState<UserProfileRow[]>([]);
  const [errorText, setErrorText] = useState("");

  const permissions: UserPermissions = useMemo(() => {
    return buildPermissions(profile);
  }, [profile]);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoadingProfile(true);

        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userData.user) {
          setProfile({ role: "", financial_access: false });
          return;
        }

        const { data, error } = await supabase
          .from("user_profiles")
          .select("role, financial_access")
          .eq("id", userData.user.id)
          .single();

        if (error || !data) {
          setProfile({ role: "", financial_access: false });
          return;
        }

        setProfile({
          role: data.role || "",
          financial_access: data.financial_access === true,
        });
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
  }, []);

  useEffect(() => {
    const loadUsers = async () => {
      if (loadingProfile || !permissions.canManageUsers) return;

      try {
        setLoadingUsers(true);
        setErrorText("");

        const { data, error } = await supabase
          .from("user_profiles")
          .select("id, email, full_name, staff_name, role, financial_access, active")
          .order("email", { ascending: true });

        if (error) {
          setErrorText(error.message || "Load users failed");
          setUsers([]);
          return;
        }

        setUsers((data || []) as UserProfileRow[]);
      } finally {
        setLoadingUsers(false);
      }
    };

    loadUsers();
  }, [loadingProfile, permissions.canManageUsers]);

  if (loadingProfile) {
    return (
      <AuthGuard>
        <main style={pageStyle}>
          <div style={loadingBoxStyle}>Loading permission...</div>
        </main>
      </AuthGuard>
    );
  }

  if (!permissions.canManageUsers) {
    return (
      <AuthGuard>
        <main style={pageStyle}>
          <AppTopNav
            title="User Management"
            subtitle="Admin users"
            activePage="users"
          />
          <div style={noAccessBoxStyle}>No access</div>
        </main>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <main style={pageStyle}>
        <AppTopNav
          title="User Management"
          subtitle="Read-only user profiles"
          activePage="users"
        />

        <section style={panelStyle}>
          {errorText ? <div style={errorBoxStyle}>{errorText}</div> : null}

          {loadingUsers ? (
            <div style={loadingBoxStyle}>Loading users...</div>
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Full name</th>
                    <th style={thStyle}>Staff name</th>
                    <th style={thStyle}>Role</th>
                    <th style={thStyle}>Financial access</th>
                    <th style={thStyle}>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td style={tdStyle}>{user.email || "-"}</td>
                      <td style={tdStyle}>{user.full_name || "-"}</td>
                      <td style={tdStyle}>{user.staff_name || "-"}</td>
                      <td style={tdStyle}>{user.role || "-"}</td>
                      <td style={tdStyle}>
                        {user.financial_access ? "Yes" : "No"}
                      </td>
                      <td style={tdStyle}>{user.active ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {users.length === 0 ? (
                <div style={emptyStyle}>No users found.</div>
              ) : null}
            </div>
          )}
        </section>
      </main>
    </AuthGuard>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  padding: 24,
  background: "#f8fafc",
  color: "#111111",
};

const panelStyle: React.CSSProperties = {
  border: "1px solid #dddddd",
  borderRadius: 12,
  background: "#ffffff",
  overflow: "hidden",
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 820,
};

const thStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid #dddddd",
  background: "#f3f4f6",
  textAlign: "left",
  fontSize: 13,
  fontWeight: 800,
};

const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid #eeeeee",
  fontSize: 14,
  verticalAlign: "top",
};

const loadingBoxStyle: React.CSSProperties = {
  padding: 18,
  fontWeight: 800,
};

const noAccessBoxStyle: React.CSSProperties = {
  padding: 18,
  border: "1px solid #f0c4c4",
  borderRadius: 12,
  background: "#fff5f5",
  color: "#a40000",
  fontWeight: 800,
};

const errorBoxStyle: React.CSSProperties = {
  margin: 16,
  padding: 14,
  border: "1px solid #f0c4c4",
  borderRadius: 10,
  background: "#fff5f5",
  color: "#a40000",
  fontWeight: 700,
};

const emptyStyle: React.CSSProperties = {
  padding: 18,
  color: "#666666",
  fontWeight: 700,
};
