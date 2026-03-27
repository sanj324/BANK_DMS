import { useState } from "react";
import { uploadDocument } from "../services/api";

type UploadDocumentProps = {
  folderId?: number | null;
  onUpload: () => void;
};

export default function UploadDocument({ folderId, onUpload }: UploadDocumentProps) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const maxSizeBytes = 50 * 1024 * 1024;
  const allowedTypes = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/png",
    "image/jpeg"
  ]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Document name is required");
      return;
    }

    if (!file) {
      setError("Please select a PDF file");
      return;
    }

    if (!allowedTypes.has(file.type)) {
      setError("Allowed file types: PDF, DOCX, XLSX, PNG, JPG");
      return;
    }

    if (file.size > maxSizeBytes) {
      setError("File too large. Maximum allowed size is 50 MB");
      return;
    }

    try {
      setLoading(true);
      const result = await uploadDocument(name, file, folderId ?? undefined);

      setName("");
      setFile(null);
      onUpload();

      alert(result.message);
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <h3>Upload Document</h3>

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.field}>
        <label>Document Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div style={styles.field}>
        <label>Select PDF</label>
        <input
          type="file"
          accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </div>

      <button disabled={loading}>
        {loading ? "Uploading..." : "Upload"}
      </button>
    </form>
  );
}

const styles = {
  form: {
    marginBottom: "20px",
    padding: "15px",
    border: "1px solid #ccc",
    borderRadius: "4px",
    background: "#fff",
    maxWidth: "400px"
  },
  field: {
    marginBottom: "10px",
    display: "flex",
    flexDirection: "column" as const
  },
  error: {
    color: "red",
    marginBottom: "10px"
  }
};
