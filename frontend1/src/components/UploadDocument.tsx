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
    },
    body: formData
  });

  const text = await res.text();
  console.log("SERVER RESPONSE:", text);

  if (!res.ok) {
    throw new Error(text || "Upload failed");
  }

  return text;
}