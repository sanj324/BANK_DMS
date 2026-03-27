import { useEffect, useState } from "react";
import {
  fetchDocuments,
  fetchFolders,
  viewDocument,
  downloadDocument,
  approveDocument,
  rejectDocument
} from "../services/api";

import FolderTree from "../components/FolderTree";
import UploadDocument from "../components/UploadDocument";

export default function Documents() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const role = localStorage.getItem("role");

  /* ================= LOAD FOLDERS ================= */

  useEffect(() => {
    async function loadFolders() {
      try {
        const data = await fetchFolders();
        setFolders(data);
      } catch (err) {
        console.error("Folder load error", err);
      }
    }

    loadFolders();
  }, []);

  /* ================= LOAD DOCUMENTS ================= */

  useEffect(() => {
    loadDocuments();
  }, [selectedFolder]);

  async function loadDocuments() {
    try {
      setLoading(true);

      const data = selectedFolder
        ? await fetchDocuments(selectedFolder)
        : await fetchDocuments();

      setDocuments(data);

    } catch (err) {
      console.error("Document load error", err);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }

  /* ================= APPROVE ================= */

  async function handleApprove(id: number) {
    try {
      await approveDocument(id);
      loadDocuments();
    } catch (err) {
      alert("Approval failed");
    }
  }

  /* ================= REJECT ================= */

  async function handleReject(id: number) {
    try {
      await rejectDocument(id);
      loadDocuments();
    } catch (err) {
      alert("Rejection failed");
    }
  }

  /* ================= UI ================= */

  return (
    <div style={{ display: "flex", height: "100%" }}>
      
      {/* LEFT PANEL – FOLDERS */}
      <div style={{ width: 250, borderRight: "1px solid #ddd", padding: 10 }}>
        <FolderTree
          folders={folders}
          onSelect={setSelectedFolder}
        />
      </div>

      {/* RIGHT PANEL – DOCUMENTS */}
      <div style={{ flex: 1, padding: 20 }}>
        <h2>Documents</h2>

        {/* MAKER UPLOAD PANEL */}
        {role === "MAKER" && (
          <UploadDocument
            folderId={selectedFolder}
            onUpload={loadDocuments}
          />
        )}

        <br />

        {loading ? (
          <p>Loading documents...</p>
        ) : (
          <table
            border={1}
            width="100%"
            cellPadding={8}
            style={{ borderCollapse: "collapse" }}
          >
            <thead style={{ background: "#f0f4f8" }}>
              <tr>
                <th>Name</th>
                <th>Size</th>
                <th>Status</th>
                <th>Uploaded By</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {documents.length === 0 && (
                <tr>
                  <td colSpan={5} align="center">
                    No documents found
                  </td>
                </tr>
              )}

              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td>📄 {doc.name}</td>
                  <td>{doc.file_size || "-"}</td>
                  <td>
                    <span
                      style={{
                        color:
                          doc.status === "APPROVED"
                            ? "green"
                            : doc.status === "REJECTED"
                            ? "red"
                            : "orange"
                      }}
                    >
                      {doc.status}
                    </span>
                  </td>
                  <td>{doc.modified_by || "-"}</td>

                  <td>
                    <button
                      onClick={() => viewDocument(doc.id)}
                      style={{ marginRight: 5 }}
                    >
                      View
                    </button>

                    <button
                      onClick={() => downloadDocument(doc.id)}
                      style={{ marginRight: 5 }}
                    >
                      Download
                    </button>

                    {/* CHECKER APPROVAL */}
                    {role === "CHECKER" &&
                      doc.status === "PENDING" && (
                        <>
                          <button
                            onClick={() => handleApprove(doc.id)}
                            style={{
                              marginRight: 5,
                              background: "#2e7d32",
                              color: "white"
                            }}
                          >
                            Approve
                          </button>

                          <button
                            onClick={() => handleReject(doc.id)}
                            style={{
                              background: "#c62828",
                              color: "white"
                            }}
                          >
                            Reject
                          </button>
                        </>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
