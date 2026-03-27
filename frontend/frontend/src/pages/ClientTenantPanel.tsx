import { useEffect, useState, type CSSProperties } from "react";
import {
  createTenantUser,
  fetchTenantUsers,
  fetchMyTenantPanel,
  getTenantBrandingFromStorage,
  setTenantUserActivation,
  updateTenantUserProfile,
  updateTenantUserQuota,
  updateMyTenantBranding,
  uploadMyTenantLogo
} from "../services/api";

type TenantClient = {
  client_name?: string;
  client_uid?: string;
  primary_color?: string;
  secondary_color?: string;
  logo_url?: string | null;
  storage_quota_mb?: number;
  allowed_file_types?: string[];
};

export default function ClientTenantPanel() {
  const [panel, setPanel] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [primary, setPrimary] = useState("#0f2a44");
  const [secondary, setSecondary] = useState("#2b7cd3");
  const [newUser, setNewUser] = useState({
    username: "",
    email: "",
    password: "",
    role: "maker"
  });
  const [profileDraft, setProfileDraft] = useState<Record<number, { email: string; role: string }>>({});
  const [quotaDraft, setQuotaDraft] = useState<Record<number, string>>({});

  useEffect(() => {
    const fromStorage = getTenantBrandingFromStorage();
    if (fromStorage?.primary_color) setPrimary(fromStorage.primary_color);
    if (fromStorage?.secondary_color) setSecondary(fromStorage.secondary_color);
    loadTenant();
  }, []);

  async function loadTenant() {
    try {
      setError("");
      const [data, tenantUsers] = await Promise.all([fetchMyTenantPanel(), fetchTenantUsers()]);
      setPanel(data);
      setUsers(tenantUsers);
      const client = data?.client as TenantClient | undefined;
      if (client?.primary_color) setPrimary(client.primary_color);
      if (client?.secondary_color) setSecondary(client.secondary_color);
    } catch (err: any) {
      setError(err.message || "Failed to load tenant panel");
    }
  }

  async function saveBranding() {
    try {
      setSaving(true);
      setError("");
      await updateMyTenantBranding({
        primary_color: primary,
        secondary_color: secondary
      });
      await loadTenant();
    } catch (err: any) {
      setError(err.message || "Failed to save branding");
    } finally {
      setSaving(false);
    }
  }

  async function onLogoChange(file?: File) {
    if (!file) return;
    try {
      setError("");
      await uploadMyTenantLogo(file);
      await loadTenant();
    } catch (err: any) {
      setError(err.message || "Failed to upload logo");
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    try {
      setError("");
      await createTenantUser(newUser);
      setNewUser({ username: "", email: "", password: "", role: "maker" });
      await loadTenant();
    } catch (err: any) {
      setError(err.message || "Failed to create user");
    }
  }

  async function handleSaveProfile(user: any) {
    const draft = profileDraft[user.id] || { email: user.email, role: user.role };
    try {
      setError("");
      await updateTenantUserProfile(user.id, draft);
      await loadTenant();
    } catch (err: any) {
      setError(err.message || "Failed to update profile");
    }
  }

  async function handleActivation(userId: number, active: boolean) {
    try {
      setError("");
      await setTenantUserActivation(userId, active);
      await loadTenant();
    } catch (err: any) {
      setError(err.message || "Failed to update activation");
    }
  }

  async function handleQuota(userId: number) {
    const quota = Number(quotaDraft[userId]);
    if (!quota) return;
    try {
      setError("");
      await updateTenantUserQuota(userId, quota);
      await loadTenant();
    } catch (err: any) {
      setError(err.message || "Failed to update quota");
    }
  }

  const client = (panel?.client || {}) as TenantClient;
  const defaultUser = panel?.default_user;
  const usage = panel?.usage;

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ marginTop: 0, color: "#123252" }}>Client Admin Panel</h1>
      <p style={{ color: "#496683", marginTop: 0 }}>
        Manage your tenant branding and view admin profile/quota settings.
      </p>

      {error && <p style={{ color: "#b42318", background: "#fee4e2", padding: 10, borderRadius: 8 }}>{error}</p>}

      <section style={panelStyle}>
        <h3 style={sectionTitle}>Tenant Info</h3>
        <div><strong>Name:</strong> {client.client_name || "-"}</div>
        <div><strong>UID:</strong> {client.client_uid || "-"}</div>
        <div><strong>Quota:</strong> {client.storage_quota_mb ?? 0} MB</div>
        <div><strong>Used:</strong> {usage?.used_mb ?? 0} MB ({usage?.total_files ?? 0} files)</div>
        <div><strong>Allowed Types:</strong> {(client.allowed_file_types || []).join(", ") || "-"}</div>
      </section>

      <section style={panelStyle}>
        <h3 style={sectionTitle}>Branding</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
          <label style={labelStyle}>
            Primary Color
            <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} />
          </label>
          <label style={labelStyle}>
            Secondary Color
            <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} />
          </label>
          <label style={labelStyle}>
            Logo
            <input type="file" accept=".png,.jpg,.jpeg,.svg" onChange={(e) => onLogoChange(e.target.files?.[0])} />
          </label>
        </div>
        <div
          style={{
            marginTop: 12,
            borderRadius: 10,
            padding: 16,
            color: "#fff",
            fontWeight: 700,
            background: `linear-gradient(135deg, ${primary}, ${secondary})`
          }}
        >
          Branding Preview {client.client_name ? `- ${client.client_name}` : ""}
        </div>
        <button style={saveBtn} onClick={saveBranding} disabled={saving}>
          {saving ? "Saving..." : "Save Branding"}
        </button>
      </section>

      <section style={panelStyle}>
        <h3 style={sectionTitle}>Default Client Admin User</h3>
        {defaultUser ? (
          <div>
            <div><strong>Username:</strong> {defaultUser.username}</div>
            <div><strong>Email:</strong> {defaultUser.email}</div>
            <div><strong>Role:</strong> {defaultUser.role}</div>
            <div><strong>Status:</strong> {defaultUser.is_active ? "Active" : "Inactive"}</div>
          </div>
        ) : (
          <div>No default client admin user found for this tenant.</div>
        )}
      </section>

      <section style={panelStyle}>
        <h3 style={sectionTitle}>Create Company User</h3>
        <form onSubmit={handleCreateUser} style={grid4}>
          <input
            required
            placeholder="Username"
            value={newUser.username}
            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
          />
          <input
            required
            type="email"
            placeholder="Email"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
          />
          <input
            required
            type="password"
            placeholder="Password"
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
          />
          <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
            <option value="maker">Maker</option>
            <option value="checker">Checker</option>
            <option value="viewer">Viewer</option>
            <option value="user">User</option>
          </select>
          <button type="submit" style={saveBtn}>Create User</button>
        </form>
      </section>

      <section style={panelStyle}>
        <h3 style={sectionTitle}>Company Users and Quota</h3>
        <div style={{ overflowX: "auto" }}>
          <table width="100%" cellPadding={8} style={{ borderCollapse: "collapse" }}>
            <thead style={{ background: "#eef4fb" }}>
              <tr>
                <th align="left">Username</th>
                <th align="left">Email</th>
                <th align="left">Role</th>
                <th align="left">Status</th>
                <th align="left">Total Quota (MB)</th>
                <th align="left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const draft = profileDraft[u.id] || { email: u.email, role: u.role };
                return (
                  <tr key={u.id} style={{ borderTop: "1px solid #d8e4f2" }}>
                    <td>{u.username}</td>
                    <td>
                      <input
                        value={draft.email}
                        onChange={(e) =>
                          setProfileDraft({ ...profileDraft, [u.id]: { ...draft, email: e.target.value } })
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={draft.role}
                        onChange={(e) =>
                          setProfileDraft({ ...profileDraft, [u.id]: { ...draft, role: e.target.value } })
                        }
                      >
                        <option value="maker">maker</option>
                        <option value="checker">checker</option>
                        <option value="viewer">viewer</option>
                        <option value="user">user</option>
                      </select>
                    </td>
                    <td>{u.is_active ? "Active" : "Inactive"}</td>
                    <td>{u.total_quota_mb ?? 0}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button onClick={() => handleSaveProfile(u)}>Save Profile</button>
                        <button onClick={() => handleActivation(u.id, !u.is_active)}>
                          {u.is_active ? "Deactivate" : "Activate"}
                        </button>
                        <input
                          style={{ width: 90 }}
                          type="number"
                          min={1}
                          placeholder="Quota MB"
                          value={quotaDraft[u.id] ?? ""}
                          onChange={(e) => setQuotaDraft({ ...quotaDraft, [u.id]: e.target.value })}
                        />
                        <button onClick={() => handleQuota(u.id)}>Set Quota</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} align="center">No tenant users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const panelStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #d7e3f2",
  borderRadius: 12,
  padding: 14,
  marginBottom: 16
};

const sectionTitle: CSSProperties = {
  marginTop: 0,
  color: "#123252"
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  color: "#567490",
  fontSize: 13
};

const saveBtn: CSSProperties = {
  marginTop: 12,
  background: "#1f6fd1",
  color: "#fff",
  border: "1px solid #0f4fa8",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer"
};

const grid4: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
  gap: 8,
  alignItems: "center"
};
