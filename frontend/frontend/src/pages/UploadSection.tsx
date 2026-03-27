const API_URL = "http://localhost:5000";

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

  return data;
}

/* ================= DASHBOARD ================= */

export async function fetchDashboardStats() {
  const token = localStorage.getItem("token");

  const res = await fetch(`${API_URL}/api/dashboard`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) throw new Error("Dashboard error");

  return res.json();
}

/* ================= DOCUMENT LIST ================= */

export async function fetchDocuments() {
  const token = localStorage.getItem("token");

  const res = await fetch(`${API_URL}/api/documents`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) throw new Error("Document fetch failed");

  return res.json();
}

/* ================= UPLOAD DOCUMENT ================= */

export async function uploadDocument(
  name: string,
  file: File
) {
  const token = localStorage.getItem("token");

  const formData = new FormData();
  formData.append("name", name);
  formData.append("document", file);

  const res = await fetch(`${API_URL}/api/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: formData
  });

  const data = await res.json();

  if (!res.ok) throw new Error(data.message || "Upload failed");

  return data;
}

/* ================= APPROVAL ================= */

export async function approveDocument(id: number) {
  const token = localStorage.getItem("token");

  const res = await fetch(
    `${API_URL}/api/approval/${id}/approve`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  if (!res.ok) throw new Error("Approval failed");

  return res.json();
}

export async function rejectDocument(id: number) {
  const token = localStorage.getItem("token");

  const res = await fetch(
    `${API_URL}/api/approval/${id}/reject`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  if (!res.ok) throw new Error("Rejection failed");

  return res.json();
}

/* ================= FILE VIEW ================= */

export function viewDocument(id: number) {
  const token = localStorage.getItem("token");
  window.open(`${API_URL}/api/files/view/${id}?token=${token}`, "_blank");
}

export function downloadDocument(id: number) {
  const token = localStorage.getItem("token");
  window.open(`${API_URL}/api/files/download/${id}?token=${token}`, "_blank");
}

/* ================= LOGOUT ================= */

export function logoutUser() {
  localStorage.clear();
  window.location.href = "/";
}