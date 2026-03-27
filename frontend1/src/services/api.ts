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

/* ================= DOCUMENT LIST ================= */

export async function fetchDocuments(folderId?: number | null) {
  const token = localStorage.getItem("token");

  const url = folderId
    ? `${API_URL}/api/documents?folderId=${folderId}`
    : `${API_URL}/api/documents`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) throw new Error("Document fetch failed");

  return res.json();
}

/* ================= UPLOAD DOCUMENT ================= */

export async function uploadDocument(
  name: string,
  file: File,
  folderId?: number | null
) {
  const token = localStorage.getItem("token");

  const formData = new FormData();
  formData.append("name", name);
  formData.append("document", file);

  if (folderId) {
    formData.append("folderId", folderId.toString());
  }

  const res = await fetch("http://localhost:5000/api/documents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
      // ❗ DO NOT ADD Content-Type HERE
    },
    body: formData
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "Upload failed");
  }

  return data;
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