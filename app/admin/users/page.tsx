"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type EditUserForm = {
  id: string;
  email: string;
  full_name: string;
  staff_name: string;
  role: UserRole;
  financial_access: boolean;
  active: boolean;
};

const ROLE_OPTIONS: UserRole[] = [
  "admin",
  "partner",
  "lawyer",
  "assistant_lawyer",
  "staff",
  "viewer",
];

export default function UsersPage() {
  const [profile, setProfile] = useState<CurrentProfile>({
    role: "",
    financial_access: false,
  });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<UserProfileRow[]>([]);
  const [editingUser, setEditingUser] = useState<EditUserForm | null>(null);
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

  const loadUsers = useCallback(async () => {
    if (!permissions.canManageUsers) return;

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
  }, [permissions.canManageUsers]);

  useEffect(() => {
    if (loadingProfile) return;
    loadUsers();
  }, [loadingProfile, loadUsers]);

  const startEdit = (user: UserProfileRow) => {
    setErrorText("");
    setEditingUser({
      id: user.id,
      email: user.email || "",
      full_name: user.full_name || "",
      staff_name: user.staff_name || "",
      role: normalizeEditableRole(user.role),
      financial_access: user.financial_access === true,
      active: user.active === true,
    });
  };

  const cancelEdit = () => {
    setEditingUser(null);
    setErrorText("");
  };

  const saveUser = async () => {
    if (!editingUser || !permissions.canManageUsers) return;

    console.log("Updating user profile id:", editingUser.id);

    if (!editingUser.id) {
      alert("Missing user id");
      return;
    }

    try {
      setSaving(true);
      setErrorText("");

      const { data, error } = await supabase
        .from("user_profiles")
        .update({
          full_name: editingUser.full_name.trim(),
          staff_name: editingUser.staff_name.trim(),
          role: editingUser.role,
          financial_access: editingUser.financial_access,
          active: editingUser.active,
        })
        .eq("id", editingUser.id)
        .select("id, full_name, staff_name, role, financial_access, active")
        .maybeSingle();

      if (error) {
        console.error("UPDATE USER PROFILE FAILED:", error);
        alert(
          "Update user profile failed:\n" +
            [
              `message: ${error.message || "-"}`,
              `details: ${error.details || "-"}`,
              `hint: ${error.hint || "-"}`,
              `code: ${error.code || "-"}`,
            ].join("\n")
        );
        setErrorText(error.message || "Save user failed");
        return;
      }

      if (!data) {
        alert(
          "No user profile was updated. Please check user id or RLS policy."
        );
        setErrorText("No user profile was updated");
        return;
      }

      setEditingUser(null);
      await loadUsers();
      alert("Updated user profile successfully");
    } finally {
      setSaving(false);
    }
  };

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
          subtitle="User profiles"
          activePage="users"
        />

        <section style={panelStyle}>
          {errorText ? <div style={errorBoxStyle}>{errorText}</div> : null}

          {editingUser ? (
            <div style={editPanelStyle}>
              <div style={editTitleStyle}>Edit user: {editingUser.email}</div>

              <div style={formGridStyle}>
                <label style={fieldLabelStyle}>
                  Full name
                  <input
                    value={editingUser.full_name}
                    onChange={(event) =>
                      setEditingUser({
                        ...editingUser,
                        full_name: event.target.value,
                      })
                    }
                    style={inputStyle}
                  />
                </label>

                <label style={fieldLabelStyle}>
                  Staff name
                  <input
                    value={editingUser.staff_name}
                    onChange={(event) =>
                      setEditingUser({
                        ...editingUser,
                        staff_name: event.target.value,
                      })
                    }
                    style={inputStyle}
                  />
                </label>

                <label style={fieldLabelStyle}>
                  Role
                  <select
                    value={editingUser.role}
                    onChange={(event) =>
                      setEditingUser({
                        ...editingUser,
                        role: event.target.value as UserRole,
                      })
                    }
                    style={inputStyle}
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={checkboxLabelStyle}>
                  <input
                    type="checkbox"
                    checked={editingUser.financial_access}
                    onChange={(event) =>
                      setEditingUser({
                        ...editingUser,
                        financial_access: event.target.checked,
                      })
                    }
                  />
                  Financial access
                </label>

                <label style={checkboxLabelStyle}>
                  <input
                    type="checkbox"
                    checked={editingUser.active}
                    onChange={(event) =>
                      setEditingUser({
                        ...editingUser,
                        active: event.target.checked,
                      })
                    }
                  />
                  Active
                </label>
              </div>

              <div style={buttonRowStyle}>
                <button
                  type="button"
                  onClick={saveUser}
                  disabled={saving}
                  style={primaryButtonStyle}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  style={secondaryButtonStyle}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

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
                    {permissions.canManageUsers ? (
                      <th style={thStyle}>Action</th>
                    ) : null}
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
                      {permissions.canManageUsers ? (
                        <td style={tdStyle}>
                          <button
                            type="button"
                            onClick={() => startEdit(user)}
                            style={smallButtonStyle}
                          >
                            Edit
                          </button>
                        </td>
                      ) : null}
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

function normalizeEditableRole(role?: string | null): UserRole {
  if (ROLE_OPTIONS.includes(role as UserRole)) return role as UserRole;
  return "viewer";
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
  minWidth: 920,
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

const editPanelStyle: React.CSSProperties = {
  padding: 16,
  borderBottom: "1px solid #dddddd",
  background: "#fbfbfb",
};

const editTitleStyle: React.CSSProperties = {
  marginBottom: 14,
  fontWeight: 900,
};

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  alignItems: "end",
};

const fieldLabelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 800,
};

const checkboxLabelStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  minHeight: 40,
  fontSize: 13,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #cccccc",
  borderRadius: 8,
  background: "#ffffff",
  color: "#111111",
};

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 14,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #000000",
  borderRadius: 8,
  background: "#000000",
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: 800,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #cccccc",
  borderRadius: 8,
  background: "#ffffff",
  color: "#111111",
  cursor: "pointer",
  fontWeight: 800,
};

const smallButtonStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid #cccccc",
  borderRadius: 8,
  background: "#ffffff",
  color: "#111111",
  cursor: "pointer",
  fontWeight: 800,
};
