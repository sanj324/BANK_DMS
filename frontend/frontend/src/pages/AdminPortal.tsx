import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  adminCreateUser,
  adminDeleteUser,
  adminUpdateFolderQuota,
  createClient,
  deleteClient,
  exportClientsReport,
  fetchAdminLogs,
  fetchAdminOverview,
  fetchAdminUsers,
  fetchClientSummary,
  fetchClients,
  fetchExpiringClientAlerts,
  renewClient,
  resetClientDefaultUserPassword,
  setClientDefaultUserActivation,
  terminateClient,
  updateClientSettings,
  updateClient,
  fetchTenantPanel,
  uploadClientLogo
} from "../services/api";

export default function AdminPortal() {
  const [summary, setSummary] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [tenantPanel, setTenantPanel] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [quotaDraft, setQuotaDraft] = useState<Record<number, string>>({});
  const [newUser, setNewUser] = useState({
    username: "",
    email: "",
    password: "",
    role: "user"
  });
  const [logFilters, setLogFilters] = useState({
    userId: "",
    action: "",
    from: "",
    to: ""
  });
  const [filters, setFilters] = useState({
    status: "",
    industry: "",
    expiryWithinDays: "",
    q: ""
  });
  const [newClient, setNewClient] = useState({
    client_uid: "",
    client_name: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    industry: "",
    subscription_start: "",
    subscription_expiry: "",
    primary_color: "#0f2a44",
    secondary_color: "#2b7cd3",
    storage_quota_mb: 1024,
    allowed_file_types: ["pdf", "docx", "xlsx", "png", "jpg", "jpeg"],
    default_root_folder: "Documents",
    default_folders_text: "Compliance, Legal, HR",
    default_user: {
      username: "",
      email: "",
      password: "",
      role: "client_admin"
    }
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setError("");
      const [s, a, c, ov, us, lg] = await Promise.all([
        fetchClientSummary(),
        fetchExpiringClientAlerts(30),
        fetchClients(),
        fetchAdminOverview(),
        fetchAdminUsers(),
        fetchAdminLogs({})
      ]);
      setSummary(s);
      setAlerts(a);
      setClients(c);
      setOverview(ov);
      setUsers(us);
      setLogs(lg);
    } catch (err: any) {
      setError(err.message || "Failed to load admin data");
    }
  }

  async function applyFilters() {
    try {
      setError("");
      const data = await fetchClients(filters);
      setClients(data);
    } catch (err: any) {
      setError(err.message || "Filter failed");
    }
  }

  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault();
    try {
      setBusy(true);
      await createClient({
        ...newClient,
        default_folders: newClient.default_folders_text
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      });
      setNewClient({
        client_uid: "",
        client_name: "",
        contact_name: "",
        contact_email: "",
        contact_phone: "",
        industry: "",
        subscription_start: "",
        subscription_expiry: "",
        primary_color: "#0f2a44",
        secondary_color: "#2b7cd3",
        storage_quota_mb: 1024,
        allowed_file_types: ["pdf", "docx", "xlsx", "png", "jpg", "jpeg"],
        default_root_folder: "Documents",
        default_folders_text: "Compliance, Legal, HR",
        default_user: { username: "", email: "", password: "", role: "client_admin" }
      });
      await loadData();
    } catch (err: any) {
      setError(err.message || "Create client failed");
    } finally {
      setBusy(false);
    }
  }

  async function openTenantPanel(clientId: number) {
    try {
      const data = await fetchTenantPanel(clientId);
      setSelectedTenantId(clientId);
      setTenantPanel(data);
    } catch (err: any) {
      setError(err.message || "Failed to open tenant panel");
    }
  }

  async function saveTenantSettings() {
    if (!tenantPanel?.client?.client_id) return;
    try {
      await updateClientSettings(tenantPanel.client.client_id, {
        storage_quota_mb: Number(tenantPanel.client.storage_quota_mb || 1024),
        allowed_file_types: tenantPanel.client.allowed_file_types || [],
        default_root_folder: tenantPanel.client.default_root_folder || "Documents",
        default_folders: tenantPanel.client.default_folders || []
      });
      await openTenantPanel(tenantPanel.client.client_id);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to save tenant settings");
    }
  }

  async function handleLogoUpload(clientId: number, file?: File) {
    if (!file) return;
    try {
      await uploadClientLogo(clientId, file);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Logo upload failed");
    }
  }

  async function handleRenew(clientId: number) {
    try {
      await renewClient(clientId, 30);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Renew failed");
    }
  }

  async function handleTerminate(clientId: number) {
    if (!confirm("Terminate this client account?")) return;
    try {
      await terminateClient(clientId);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Terminate failed");
    }
  }

  async function handleDelete(clientId: number) {
    if (!confirm("Delete this client permanently?")) return;
    try {
      await deleteClient(clientId);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Delete failed");
    }
  }

  async function handleResetPassword(clientId: number) {
    const pwd = prompt("Enter new password (min 8 chars):");
    if (!pwd) return;
    try {
      await resetClientDefaultUserPassword(clientId, pwd);
      alert("Password reset complete.");
    } catch (err: any) {
      setError(err.message || "Reset password failed");
    }
  }

  async function handleActivation(clientId: number, active: boolean) {
    try {
      await setClientDefaultUserActivation(clientId, active);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Activation update failed");
    }
  }

  async function handleQuickStatusUpdate(client: any, status: string) {
    try {
      await updateClient(client.client_id, { status });
      await loadData();
    } catch (err: any) {
      setError(err.message || "Status update failed");
    }
  }

  async function handleExport() {
    try {
      const blob = await exportClientsReport();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "clients_report.csv";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "Export failed");
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    try {
      await adminCreateUser(newUser);
      setNewUser({ username: "", email: "", password: "", role: "user" });
      await loadData();
    } catch (err: any) {
      setError(err.message || "Create user failed");
    }
  }

  async function handleDeleteUser(id: number) {
    if (!confirm("Delete this user?")) return;
    try {
      await adminDeleteUser(id);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Delete user failed");
    }
  }

  async function handleQuotaUpdate(folderId: number) {
    const value = Number(quotaDraft[folderId]);
    if (!value) return;
    try {
      await adminUpdateFolderQuota(folderId, value);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Quota update failed");
    }
  }

  async function applyLegacyLogFilters() {
    try {
      const data = await fetchAdminLogs(logFilters);
      setLogs(data);
    } catch (err: any) {
      setError(err.message || "Log filter failed");
    }
  }

  const industries = useMemo(() => {
    return Array.from(new Set(clients.map((c) => c.industry).filter(Boolean))).sort();
  }, [clients]);

  return (
    <div style={{ padding: 24, background: "#f3f7fc", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, color: "#0f2a44" }}>SaaS Client Control Center</h1>
          <p style={{ margin: "6px 0 0", color: "#44617f" }}>
            Onboarding, branding, lifecycle, subscription, and compliance management
          </p>
        </div>
        <button onClick={handleExport} style={primaryBtn}>
          Export Compliance Report
        </button>
      </div>

      {error && <p style={{ color: "#b42318", background: "#fee4e2", padding: 10, borderRadius: 8 }}>{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Stat label="Total Clients" value={summary?.total_clients ?? 0} />
        <Stat label="Active Clients" value={summary?.active_clients ?? 0} />
        <Stat label="Inactive Clients" value={summary?.inactive_clients ?? 0} />
        <Stat label="Expiring in 30 Days" value={summary?.expiring_in_30_days ?? 0} tone="warn" />
      </div>

      <section style={panel}>
        <h2 style={sectionTitle}>Expiry Alerts</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {alerts.length === 0 && <span style={{ color: "#576b82" }}>No upcoming expirations.</span>}
          {alerts.map((a) => (
            <span key={a.client_id} style={pillWarn}>
              {a.client_name} {"->"} {String(a.subscription_expiry).slice(0, 10)}
            </span>
          ))}
        </div>
      </section>

      <section style={panel}>
        <h2 style={sectionTitle}>Onboard New Client</h2>
        <form onSubmit={handleCreateClient}>
          <div style={grid4}>
            <input required placeholder="Client UID" value={newClient.client_uid} onChange={(e) => setNewClient({ ...newClient, client_uid: e.target.value })} />
            <input required placeholder="Client Name" value={newClient.client_name} onChange={(e) => setNewClient({ ...newClient, client_name: e.target.value })} />
            <input placeholder="Contact Name" value={newClient.contact_name} onChange={(e) => setNewClient({ ...newClient, contact_name: e.target.value })} />
            <input type="email" placeholder="Contact Email" value={newClient.contact_email} onChange={(e) => setNewClient({ ...newClient, contact_email: e.target.value })} />
            <input placeholder="Contact Phone" value={newClient.contact_phone} onChange={(e) => setNewClient({ ...newClient, contact_phone: e.target.value })} />
            <input placeholder="Industry" value={newClient.industry} onChange={(e) => setNewClient({ ...newClient, industry: e.target.value })} />
            <input type="date" required value={newClient.subscription_start} onChange={(e) => setNewClient({ ...newClient, subscription_start: e.target.value })} />
            <input type="date" required value={newClient.subscription_expiry} onChange={(e) => setNewClient({ ...newClient, subscription_expiry: e.target.value })} />
            <input
              type="number"
              min={1}
              placeholder="Client Quota (MB)"
              value={newClient.storage_quota_mb}
              onChange={(e) => setNewClient({ ...newClient, storage_quota_mb: Number(e.target.value || 1024) })}
            />
            <input
              placeholder="Root Folder Name"
              value={newClient.default_root_folder}
              onChange={(e) => setNewClient({ ...newClient, default_root_folder: e.target.value })}
            />
            <input
              placeholder="Default folders (comma separated)"
              value={newClient.default_folders_text}
              onChange={(e) => setNewClient({ ...newClient, default_folders_text: e.target.value })}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {["pdf", "docx", "xlsx", "png", "jpg", "jpeg"].map((ext) => (
                <label key={ext} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={newClient.allowed_file_types.includes(ext)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...newClient.allowed_file_types, ext]
                        : newClient.allowed_file_types.filter((x) => x !== ext);
                      setNewClient({ ...newClient, allowed_file_types: next });
                    }}
                  />
                  .{ext}
                </label>
              ))}
            </div>
          </div>

          <h4 style={{ margin: "14px 0 8px" }}>Brand Customization</h4>
          <div style={grid4}>
            <label style={fieldLabel}>
              Primary Color
              <input type="color" value={newClient.primary_color} onChange={(e) => setNewClient({ ...newClient, primary_color: e.target.value })} />
            </label>
            <label style={fieldLabel}>
              Secondary Color
              <input type="color" value={newClient.secondary_color} onChange={(e) => setNewClient({ ...newClient, secondary_color: e.target.value })} />
            </label>
            <div style={{
              gridColumn: "span 2",
              borderRadius: 10,
              border: "1px solid #c8d8eb",
              padding: 12,
              background: `linear-gradient(135deg, ${newClient.primary_color}, ${newClient.secondary_color})`,
              color: "white",
              fontWeight: 700
            }}>
              Branding Preview: {newClient.client_name || "Client Workspace"}
            </div>
          </div>

          <h4 style={{ margin: "14px 0 8px" }}>Default User Assignment</h4>
          <div style={grid4}>
            <input required placeholder="Default Username" value={newClient.default_user.username} onChange={(e) => setNewClient({ ...newClient, default_user: { ...newClient.default_user, username: e.target.value } })} />
            <input required type="email" placeholder="Default User Email" value={newClient.default_user.email} onChange={(e) => setNewClient({ ...newClient, default_user: { ...newClient.default_user, email: e.target.value } })} />
            <input required type="password" placeholder="Default User Password" value={newClient.default_user.password} onChange={(e) => setNewClient({ ...newClient, default_user: { ...newClient.default_user, password: e.target.value } })} />
            <select value={newClient.default_user.role} onChange={(e) => setNewClient({ ...newClient, default_user: { ...newClient.default_user, role: e.target.value } })}>
              <option value="client_admin">Client Admin</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          <div style={{ marginTop: 12 }}>
            <button type="submit" style={primaryBtn} disabled={busy}>
              {busy ? "Creating..." : "Create Client"}
            </button>
          </div>
        </form>
      </section>

      <section style={panel}>
        <h2 style={sectionTitle}>Client Directory</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <input placeholder="Search client name or UID" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select value={filters.industry} onChange={(e) => setFilters({ ...filters, industry: e.target.value })}>
            <option value="">All Industries</option>
            {industries.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <input
            type="number"
            min={1}
            placeholder="Expiry in X days"
            value={filters.expiryWithinDays}
            onChange={(e) => setFilters({ ...filters, expiryWithinDays: e.target.value })}
          />
          <button onClick={applyFilters}>Apply Filters</button>
          <button onClick={loadData}>Reset</button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table width="100%" cellPadding={8} style={{ borderCollapse: "collapse" }}>
            <thead style={{ background: "#eef4fb" }}>
              <tr>
                <th align="left">UID</th>
                <th align="left">Client</th>
                <th align="left">Industry</th>
                <th align="left">Lifecycle</th>
                <th align="left">Brand</th>
                <th align="left">Default User</th>
                <th align="left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.client_id} style={{ borderTop: "1px solid #d8e4f2" }}>
                  <td>{c.client_uid}</td>
                  <td>
                    <div style={{ fontWeight: 700 }}>{c.client_name}</div>
                    <div style={{ fontSize: 12, color: "#607996" }}>{c.contact_email || "-"}</div>
                  </td>
                  <td>{c.industry || "-"}</td>
                  <td>
                    <div>{String(c.subscription_start).slice(0, 10)} to {String(c.subscription_expiry).slice(0, 10)}</div>
                    <span style={c.status === "active" ? pillActive : pillInactive}>{c.status}</span>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 26, height: 26, borderRadius: 6, background: c.primary_color }} />
                      <div style={{ width: 26, height: 26, borderRadius: 6, background: c.secondary_color }} />
                    </div>
                    {c.logo_url ? (
                      <img src={`http://localhost:5000/${c.logo_url}`} alt="logo" style={{ width: 36, height: 36, marginTop: 6, objectFit: "contain" }} />
                    ) : (
                      <div style={{ fontSize: 12, color: "#789" }}>No logo</div>
                    )}
                    <input type="file" accept=".png,.jpg,.jpeg,.svg" onChange={(e) => handleLogoUpload(c.client_id, e.target.files?.[0])} />
                  </td>
                  <td>
                    <div>{c.default_username}</div>
                    <div style={{ fontSize: 12, color: "#6e8199" }}>{c.default_role}</div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button onClick={() => handleRenew(c.client_id)}>Renew +30d</button>
                      <button onClick={() => handleTerminate(c.client_id)}>Terminate</button>
                      <button onClick={() => handleQuickStatusUpdate(c, c.status === "active" ? "inactive" : "active")}>
                        {c.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                      <button onClick={() => handleActivation(c.client_id, true)}>User On</button>
                      <button onClick={() => handleActivation(c.client_id, false)}>User Off</button>
                      <button onClick={() => handleResetPassword(c.client_id)}>Reset Password</button>
                      <button onClick={() => openTenantPanel(c.client_id)}>Tenant Panel</button>
                      <button onClick={() => handleDelete(c.client_id)} style={{ color: "#b42318" }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={7} align="center">No clients found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedTenantId && tenantPanel && (
        <section style={panel}>
          <h2 style={sectionTitle}>Tenant Panel: {tenantPanel.client.client_name}</h2>
          <div style={grid4}>
            <label style={fieldLabel}>
              Client Quota (MB)
              <input
                type="number"
                min={1}
                value={tenantPanel.client.storage_quota_mb || 1024}
                onChange={(e) =>
                  setTenantPanel({
                    ...tenantPanel,
                    client: { ...tenantPanel.client, storage_quota_mb: Number(e.target.value || 1024) }
                  })
                }
              />
            </label>
            <label style={fieldLabel}>
              Root Folder
              <input
                value={tenantPanel.client.default_root_folder || "Documents"}
                onChange={(e) =>
                  setTenantPanel({
                    ...tenantPanel,
                    client: { ...tenantPanel.client, default_root_folder: e.target.value }
                  })
                }
              />
            </label>
            <label style={fieldLabel}>
              Default Folders (comma separated)
              <input
                value={(tenantPanel.client.default_folders || []).join(", ")}
                onChange={(e) =>
                  setTenantPanel({
                    ...tenantPanel,
                    client: {
                      ...tenantPanel.client,
                      default_folders: e.target.value.split(",").map((x: string) => x.trim()).filter(Boolean)
                    }
                  })
                }
              />
            </label>
            <div>
              <div style={{ fontSize: 12, color: "#54708f", marginBottom: 6 }}>Allowed File Types</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["pdf", "docx", "xlsx", "png", "jpg", "jpeg"].map((ext) => (
                  <label key={ext} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={(tenantPanel.client.allowed_file_types || []).includes(ext)}
                      onChange={(e) => {
                        const current = tenantPanel.client.allowed_file_types || [];
                        const next = e.target.checked
                          ? [...current, ext]
                          : current.filter((x: string) => x !== ext);
                        setTenantPanel({
                          ...tenantPanel,
                          client: { ...tenantPanel.client, allowed_file_types: Array.from(new Set(next)) }
                        });
                      }}
                    />
                    .{ext}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <button onClick={saveTenantSettings} style={primaryBtn}>Save Tenant Settings</button>
          </div>

          <div style={{ marginTop: 14 }}>
            <h4>Default Client Admin User</h4>
            {tenantPanel.default_user ? (
              <div>
                {tenantPanel.default_user.username} ({tenantPanel.default_user.email}) -{" "}
                {tenantPanel.default_user.is_active ? "Active" : "Inactive"}
              </div>
            ) : (
              <div>No default client admin user found.</div>
            )}
          </div>
        </section>
      )}

      <section style={panel}>
        <h2 style={sectionTitle}>User Management (Legacy)</h2>
        <form onSubmit={handleCreateUser} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <input
            placeholder="username"
            value={newUser.username}
            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
            required
          />
          <input
            placeholder="email"
            type="email"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            required
          />
          <input
            placeholder="password"
            type="password"
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            required
          />
          <select
            value={newUser.role}
            onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
          >
            <option value="user">user</option>
            <option value="maker">maker</option>
            <option value="checker">checker</option>
            <option value="admin">admin</option>
            <option value="super_admin">super_admin</option>
          </select>
          <button type="submit">Create User</button>
        </form>

        <table width="100%" cellPadding={8} style={{ borderCollapse: "collapse" }}>
          <thead style={{ background: "#eef4fb" }}>
            <tr>
              <th align="left">ID</th>
              <th align="left">Username</th>
              <th align="left">Email</th>
              <th align="left">Role</th>
              <th align="left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid #d8e4f2" }}>
                <td>{u.user_id}</td>
                <td>{u.username}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>
                  <button onClick={() => handleDeleteUser(u.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={panel}>
        <h2 style={sectionTitle}>Folder Quota Management (Legacy)</h2>
        <table width="100%" cellPadding={8} style={{ borderCollapse: "collapse" }}>
          <thead style={{ background: "#eef4fb" }}>
            <tr>
              <th align="left">Folder</th>
              <th align="left">Used (MB)</th>
              <th align="left">Quota (MB)</th>
              <th align="left">Update</th>
            </tr>
          </thead>
          <tbody>
            {overview?.folderUsage?.map((f: any) => (
              <tr key={f.folder_id} style={{ borderTop: "1px solid #d8e4f2" }}>
                <td>{f.folder_path}</td>
                <td>{f.used_mb}</td>
                <td>{f.quota_mb}</td>
                <td>
                  <input
                    style={{ width: 100, marginRight: 8 }}
                    placeholder="new quota"
                    value={quotaDraft[f.folder_id] ?? ""}
                    onChange={(e) => setQuotaDraft({ ...quotaDraft, [f.folder_id]: e.target.value })}
                  />
                  <button onClick={() => handleQuotaUpdate(f.folder_id)}>Save</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={panel}>
        <h2 style={sectionTitle}>Audit Logs (Legacy)</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <input
            placeholder="user id"
            value={logFilters.userId}
            onChange={(e) => setLogFilters({ ...logFilters, userId: e.target.value })}
          />
          <input
            placeholder="action"
            value={logFilters.action}
            onChange={(e) => setLogFilters({ ...logFilters, action: e.target.value })}
          />
          <input
            type="date"
            value={logFilters.from}
            onChange={(e) => setLogFilters({ ...logFilters, from: e.target.value })}
          />
          <input
            type="date"
            value={logFilters.to}
            onChange={(e) => setLogFilters({ ...logFilters, to: e.target.value })}
          />
          <button onClick={applyLegacyLogFilters}>Apply</button>
        </div>
        <table width="100%" cellPadding={8} style={{ borderCollapse: "collapse" }}>
          <thead style={{ background: "#eef4fb" }}>
            <tr>
              <th align="left">User</th>
              <th align="left">Action</th>
              <th align="left">Entity</th>
              <th align="left">Details</th>
              <th align="left">Time</th>
            </tr>
          </thead>
          <tbody>
            {logs.slice(0, 30).map((log) => (
              <tr key={log.id} style={{ borderTop: "1px solid #d8e4f2" }}>
                <td>{log.username || log.user_id}</td>
                <td>{log.action}</td>
                <td>{log.entity}</td>
                <td>{log.details || "-"}</td>
                <td>{new Date(log.timestamp).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "warn" }) {
  return (
    <div style={{ background: "white", border: "1px solid #d7e3f2", borderRadius: 10, padding: 12 }}>
      <div style={{ color: "#667b93", fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: tone === "warn" ? "#b54708" : "#123252" }}>{value}</div>
    </div>
  );
}

const panel: CSSProperties = {
  background: "white",
  border: "1px solid #d7e3f2",
  borderRadius: 12,
  padding: 14,
  marginBottom: 16
};

const sectionTitle: CSSProperties = {
  margin: "2px 0 12px",
  color: "#123252"
};

const grid4: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8
};

const fieldLabel: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  color: "#54708f"
};

const primaryBtn: CSSProperties = {
  border: "1px solid #0f4fa8",
  background: "#1f6fd1",
  color: "white",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer"
};

const pillActive: CSSProperties = {
  display: "inline-block",
  marginTop: 4,
  background: "#dcfae6",
  color: "#067647",
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 12
};

const pillInactive: CSSProperties = {
  display: "inline-block",
  marginTop: 4,
  background: "#fef0c7",
  color: "#b54708",
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 12
};

const pillWarn: CSSProperties = {
  background: "#fff4ed",
  color: "#c4320a",
  border: "1px solid #ffd5c2",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 12
};
