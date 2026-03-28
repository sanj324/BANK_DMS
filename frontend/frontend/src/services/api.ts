const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg"
]);

export type TenantBranding = {
  client_id: number;
  client_uid: string;
  client_name: string;
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
  status: string;
};

async function sha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function parseApiResponse(res: Response, defaultMessage: string) {
  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.toLowerCase().includes("application/json");
  const payload = isJson ? await res.json() : { message: await res.text() };

  if (res.status === 401) {
    localStorage.clear();
    window.location.href = "/";
    throw new Error("Session expired. Please login again.");
  }

  if (!res.ok) {
    throw new Error(payload?.message || defaultMessage);
  }

  return payload;
}

/* ================= AUTH ================= */

export async function loginUser(username: string, password: string) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();

  if (!res.ok) throw new Error(data.message || "Login failed");

  localStorage.setItem("token", data.token);
  localStorage.setItem("role", data.role);
  localStorage.setItem("username", data.username || username);
  localStorage.setItem("client_id", String(data.client_id || ""));
  if (data.tenant_branding) {
    localStorage.setItem("tenant_branding", JSON.stringify(data.tenant_branding));
  } else {
    localStorage.removeItem("tenant_branding");
  }

  return data;
}

export async function signupUser(username: string, email: string, password: string, role: string) {
  const res = await fetch(`${API_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password, role })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Signup failed");
  return data;
}

/* ================= DASHBOARD ================= */

export async function fetchDashboardStats() {
  const token = localStorage.getItem("token");

  const res = await fetch(`${API_URL}/api/dashboard`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) throw new Error("Failed to fetch dashboard stats");

  return res.json();
}

/* ================= DOCUMENTS ================= */

export async function fetchDocuments(folderId?: number | null) {
  const token = localStorage.getItem("token");

  const url = folderId
    ? `${API_URL}/api/documents?folderId=${folderId}`
    : `${API_URL}/api/documents`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) throw new Error("Failed to fetch documents");

  return res.json();
}
export async function uploadDocument(
  name: string,
  file: File,
  folderId?: number
) {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error("Unsupported file type. Allowed: PDF, DOCX, XLSX, PNG, JPG");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File too large. Maximum allowed is ${MAX_FILE_SIZE_MB} MB`);
  }

  const token = localStorage.getItem("token");
  const checksum = await sha256(file);

  const formData = new FormData();
  formData.append("name", name);
  formData.append("document", file);

  if (folderId) {
    formData.append("folderId", folderId.toString());
  }

  const res = await fetch("http://localhost:5000/api/documents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-file-checksum": checksum
    },
    body: formData
  });

  const data = await res.json();

  console.log("UPLOAD RESPONSE:", data);

  if (!res.ok) {
    throw new Error(data.message || "Upload failed");
  }

  return data;
}


/* ================= FOLDERS ================= */

export async function fetchFolders() {
  const token = localStorage.getItem("token");

  const res = await fetch(`${API_URL}/api/folders`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) throw new Error("Failed to fetch folders");

  return res.json();
}

export async function moveDocument(documentId: number, targetFolderId: number) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/documents/${documentId}/move`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ targetFolderId })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Move failed");
  return data;
}

export async function fetchFolderFiles(folderId: number) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/folders/${folderId}/files`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to fetch folder files");
  return data;
}

export async function createFolder(name: string, parentId?: number | null) {
  const token = localStorage.getItem("token");

  const res = await fetch(`${API_URL}/api/folders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ name, parentId: parentId ?? null })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Folder creation failed");
  return data;
}


/* ================= FILE ACCESS ================= */

export function viewDocument(id: number) {
  const token = localStorage.getItem("token");
  window.open(`${API_URL}/api/files/view/${id}?token=${token}`, "_blank");
}

export function downloadDocument(id: number) {
  const token = localStorage.getItem("token");
  window.open(`${API_URL}/api/files/download/${id}?token=${token}`, "_blank");
}

/* ================= APPROVAL ================= */

export async function approveDocument(id: number) {
  const token = localStorage.getItem("token");

  const res = await fetch(`${API_URL}/api/approval/${id}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) throw new Error("Approval failed");
}

export async function rejectDocument(id: number) {
  const token = localStorage.getItem("token");

  const res = await fetch(`${API_URL}/api/approval/${id}/reject`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) throw new Error("Rejection failed");
}


/* ================= AUDIT ================= */

export async function fetchAuditLogs() {
  const token = localStorage.getItem("token");

  const res = await fetch(`${API_URL}/api/audit`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) throw new Error("Failed to fetch audit logs");

  return res.json();
}

/* ================= ADMIN ================= */

export async function fetchAdminOverview() {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/overview`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseApiResponse(res, "Failed to fetch admin overview");
}

export async function fetchAdminUsers() {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/users`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseApiResponse(res, "Failed to fetch users");
}

export async function adminCreateUser(payload: {
  username: string;
  email: string;
  password: string;
  role: string;
}) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to create user");
  return data;
}

export async function adminUpdateUser(id: number, payload: { email?: string; role?: string }) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/users/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to update user");
  return data;
}

export async function adminDeleteUser(id: number) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/users/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to delete user");
  return data;
}

export async function adminUpdateFolderQuota(folderId: number, quotaMb: number) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/folders/${folderId}/quota`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ quota_mb: quotaMb })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to update quota");
  return data;
}

export async function fetchAdminLogs(filters: {
  userId?: string;
  action?: string;
  from?: string;
  to?: string;
}) {
  const token = localStorage.getItem("token");
  const params = new URLSearchParams();
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.action) params.set("action", filters.action);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);

  const url = `${API_URL}/api/admin/logs${params.toString() ? `?${params.toString()}` : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseApiResponse(res, "Failed to fetch logs");
}

/* ================= CLIENT ADMIN ================= */

export async function fetchClients(filters?: {
  status?: string;
  industry?: string;
  expiryWithinDays?: string;
  q?: string;
}) {
  const token = localStorage.getItem("token");
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.industry) params.set("industry", filters.industry);
  if (filters?.expiryWithinDays) params.set("expiryWithinDays", filters.expiryWithinDays);
  if (filters?.q) params.set("q", filters.q);
  const url = `${API_URL}/api/admin/clients${params.toString() ? `?${params.toString()}` : ""}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return parseApiResponse(res, "Failed to fetch clients");
}

export async function fetchClientSummary() {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/clients/summary`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseApiResponse(res, "Failed to fetch client summary");
}

export async function fetchExpiringClientAlerts(days = 30) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/clients/alerts/expiring?days=${days}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseApiResponse(res, "Failed to fetch alerts");
}

export async function createClient(payload: any) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/clients`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to create client");
  return data;
}

export async function updateClient(clientId: number, payload: any) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/clients/${clientId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to update client");
  return data;
}

export async function deleteClient(clientId: number) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/clients/${clientId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to delete client");
  return data;
}

export async function renewClient(clientId: number, extraDays: number) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/clients/${clientId}/renew`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ extraDays })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to renew client");
  return data;
}

export async function terminateClient(clientId: number) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/clients/${clientId}/terminate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to terminate client");
  return data;
}

export async function uploadClientLogo(clientId: number, file: File) {
  const token = localStorage.getItem("token");
  const formData = new FormData();
  formData.append("logo", file);
  const res = await fetch(`${API_URL}/api/admin/clients/${clientId}/logo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to upload logo");
  return data;
}

export async function updateClientSettings(
  clientId: number,
  payload: {
    storage_quota_mb: number;
    allowed_file_types: string[];
    default_root_folder: string;
    default_folders: string[];
  }
) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/clients/${clientId}/settings`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to update client settings");
  return data;
}

export async function fetchTenantPanel(clientId: number) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/clients/${clientId}/tenant-panel`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to fetch tenant panel");
  return data;
}

export async function fetchMyTenantPanel() {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/clients/tenant/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseApiResponse(res, "Failed to fetch my tenant panel");
}

export async function updateMyTenantBranding(payload: { primary_color?: string; secondary_color?: string }) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/clients/tenant/me/branding`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to update branding");
  const brandingPayload = data?.client || data;
  if (brandingPayload && (brandingPayload.primary_color || brandingPayload.secondary_color || brandingPayload.logo_url)) {
    const current = getTenantBrandingFromStorage();
    localStorage.setItem(
      "tenant_branding",
      JSON.stringify({
        ...(current || {}),
        ...brandingPayload
      })
    );
    window.dispatchEvent(new Event("tenant-branding-updated"));
  }
  return data;
}

export async function uploadMyTenantLogo(file: File) {
  const token = localStorage.getItem("token");
  const formData = new FormData();
  formData.append("logo", file);
  const res = await fetch(`${API_URL}/api/admin/clients/tenant/me/logo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to upload logo");
  const brandingPayload = data?.client || data;
  if (brandingPayload && (brandingPayload.primary_color || brandingPayload.secondary_color || brandingPayload.logo_url)) {
    const current = getTenantBrandingFromStorage();
    localStorage.setItem(
      "tenant_branding",
      JSON.stringify({
        ...(current || {}),
        ...brandingPayload
      })
    );
    window.dispatchEvent(new Event("tenant-branding-updated"));
  }
  return data;
}

export async function fetchTenantUsers() {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/clients/tenant/me/users`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseApiResponse(res, "Failed to fetch tenant users");
}

export async function createTenantUser(payload: {
  username: string;
  email: string;
  password: string;
  role: string;
}) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/clients/tenant/me/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return parseApiResponse(res, "Failed to create tenant user");
}

export async function updateTenantUserProfile(
  id: number,
  payload: { email?: string; role?: string }
) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/clients/tenant/me/users/${id}/profile`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return parseApiResponse(res, "Failed to update tenant user profile");
}

export async function setTenantUserActivation(id: number, active: boolean) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/clients/tenant/me/users/${id}/activation`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ active })
  });
  return parseApiResponse(res, "Failed to update tenant user activation");
}

export async function updateTenantUserQuota(id: number, quota_mb: number) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/clients/tenant/me/users/${id}/quota`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ quota_mb })
  });
  return parseApiResponse(res, "Failed to update tenant user quota");
}

export async function resetClientDefaultUserPassword(clientId: number, newPassword: string) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/clients/${clientId}/default-user/reset-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ newPassword })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to reset password");
  return data;
}

export async function setClientDefaultUserActivation(clientId: number, active: boolean) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/clients/${clientId}/default-user/activation`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ active })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to update activation");
  return data;
}

export async function exportClientsReport() {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/api/admin/clients/export`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error("Failed to export report");
  return res.blob();
}

/* ================= LOGOUT ================= */

export function logoutUser() {
  localStorage.clear();
  window.location.href = "/";
}

export function getTenantBrandingFromStorage(): TenantBranding | null {
  const raw = localStorage.getItem("tenant_branding");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TenantBranding;
  } catch {
    return null;
  }
}
