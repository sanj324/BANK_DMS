import { useEffect, useMemo, useState } from "react";
import {
  fetchDocuments,
  fetchFolders,
  fetchFolderFiles,
  createFolder,
  moveDocument,
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
  const [folderFiles, setFolderFiles] = useState<any[]>([]);
  const [folderUsage, setFolderUsage] = useState<{ used_mb: number; quota_mb: number } | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderError, setFolderError] = useState("");
  const [moveTargets, setMoveTargets] = useState<Record<number, number>>({});
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [uploaderFilter, setUploaderFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("newest");
  const [loading, setLoading] = useState(false);

  const role = localStorage.getItem("role");
  const username = localStorage.getItem("username");
  const normalizedRole = String(role || "").toLowerCase();
  const canUpload = ["maker", "admin", "super_admin", "client_admin"].includes(normalizedRole);
  const canCreateFolder = ["maker", "admin", "super_admin", "client_admin"].includes(normalizedRole);
  const canApprove = ["checker", "admin", "super_admin", "client_admin"].includes(normalizedRole);

  useEffect(() => {
    loadFolders();
  }, []);

  useEffect(() => {
    loadDocuments();
    if (selectedFolder) {
      fetchFolderFiles(selectedFolder)
        .then((data) => {
          setFolderFiles(data.files || []);
          setFolderUsage({
            used_mb: data.used_mb || 0,
            quota_mb: data.folder?.quota_mb || 50
          });
        })
        .catch(() => {
          setFolderFiles([]);
          setFolderUsage(null);
        });
    } else {
      setFolderFiles([]);
      setFolderUsage(null);
    }
  }, [selectedFolder]);

  async function loadFolders() {
    try {
      const data = await fetchFolders();
      setFolders(data);
    } catch (err) {
      console.error("Folder load error", err);
    }
  }

  async function loadDocuments() {
    try {
      setLoading(true);
      const data = selectedFolder ? await fetchDocuments(selectedFolder) : await fetchDocuments();
      setDocuments(data);
    } catch (err) {
      console.error("Document load error", err);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id: number) {
    try {
      await approveDocument(id);
      loadDocuments();
    } catch {
      alert("Approval failed");
    }
  }

  async function handleReject(id: number) {
    try {
      await rejectDocument(id);
      loadDocuments();
    } catch {
      alert("Rejection failed");
    }
  }

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    setFolderError("");

    const trimmed = newFolderName.trim();
    if (!trimmed) {
      setFolderError("Folder name is required");
      return;
    }

    try {
      setCreatingFolder(true);
      await createFolder(trimmed, selectedFolder);
      setNewFolderName("");
      await loadFolders();
    } catch (err: any) {
      setFolderError(err.message || "Failed to create folder");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleMoveDocument(documentId: number) {
    const targetFolderId = Number(moveTargets[documentId]);
    if (!targetFolderId) {
      alert("Please select target folder");
      return;
    }

    try {
      await moveDocument(documentId, targetFolderId);
      await loadDocuments();
      if (selectedFolder) {
        const data = await fetchFolderFiles(selectedFolder);
        setFolderFiles(data.files || []);
        setFolderUsage({
          used_mb: data.used_mb || 0,
          quota_mb: data.folder?.quota_mb || 50
        });
      }
      setMoveTargets((prev) => ({ ...prev, [documentId]: 0 }));
    } catch (err: any) {
      alert(err.message || "Move failed");
    }
  }

  const uploaderOptions = useMemo(() => {
    const unique = Array.from(new Set(documents.map((d) => d.modified_by).filter(Boolean)));
    return unique;
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const list = documents.filter((doc) => {
      const matchesSearch =
        !q ||
        String(doc.name || "").toLowerCase().includes(q) ||
        String(doc.folder_name || "").toLowerCase().includes(q);

      const matchesStatus = statusFilter === "ALL" || doc.status === statusFilter;
      const matchesUploader = uploaderFilter === "ALL" || doc.modified_by === uploaderFilter;

      return matchesSearch && matchesStatus && matchesUploader;
    });

    const sorted = [...list];
    if (sortBy === "newest") sorted.sort((a, b) => Number(b.id) - Number(a.id));
    if (sortBy === "oldest") sorted.sort((a, b) => Number(a.id) - Number(b.id));
    if (sortBy === "name_asc") sorted.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    if (sortBy === "name_desc") sorted.sort((a, b) => String(b.name).localeCompare(String(a.name)));
    return sorted;
  }, [documents, searchText, statusFilter, uploaderFilter, sortBy]);

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ width: 250, borderRight: "1px solid #ddd", padding: 10 }}>
        <FolderTree
          folders={folders}
          onSelect={setSelectedFolder}
          selectedId={selectedFolder}
        />
      </div>

      <div style={{ flex: 1, padding: 20 }}>
        <h2>Documents</h2>

        {canCreateFolder && (
          <form
            onSubmit={handleCreateFolder}
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 12,
              alignItems: "center",
              background: "#fff",
              border: "1px solid #ddd",
              padding: 10
            }}
          >
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={selectedFolder ? "New subfolder name" : "New folder name"}
              style={{ flex: 1, padding: 8 }}
            />
            <button type="submit" disabled={creatingFolder}>
              {creatingFolder ? "Creating..." : "+ New Folder"}
            </button>
            <span style={{ fontSize: 12, color: "#555" }}>
              {selectedFolder ? "inside selected folder" : "at root level"}
            </span>
          </form>
        )}

        {folderError && <p style={{ color: "red", marginTop: -4 }}>{folderError}</p>}

        {canUpload && (
          <UploadDocument
            folderId={selectedFolder}
            onUpload={loadDocuments}
          />
        )}

        <br />

        {selectedFolder && (
          <div style={{ background: "#fff", border: "1px solid #ddd", padding: 12, marginBottom: 16 }}>
            <h4>Folder Metadata</h4>
            <p>
              Usage: {folderUsage?.used_mb ?? 0} MB / {folderUsage?.quota_mb ?? 50} MB
            </p>
            <table width="100%" cellPadding={6} style={{ borderCollapse: "collapse" }}>
              <thead style={{ background: "#f4f6f8" }}>
                <tr>
                  <th align="left">Filename</th>
                  <th align="left">Size (MB)</th>
                  <th align="left">Uploaded At</th>
                  <th align="left">Checksum</th>
                </tr>
              </thead>
              <tbody>
                {folderFiles.length === 0 && (
                  <tr>
                    <td colSpan={4}>No files in this folder</td>
                  </tr>
                )}
                {folderFiles.map((f) => (
                  <tr key={f.file_id} style={{ borderTop: "1px solid #eee" }}>
                    <td>{f.filename}</td>
                    <td>{f.file_size_mb}</td>
                    <td>{new Date(f.uploaded_at).toLocaleString()}</td>
                    <td>{f.checksum?.slice(0, 16)}...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div
          style={{
            background: "linear-gradient(135deg, #ffffff 0%, #f5f9ff 100%)",
            border: "1px solid #d9e6f7",
            borderRadius: 10,
            padding: 14,
            marginBottom: 14
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search by file name or folder..."
              style={{ minWidth: 240, flex: 1, padding: 8, border: "1px solid #b9cde7", borderRadius: 6 }}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: 8, border: "1px solid #b9cde7", borderRadius: 6 }}
            >
              <option value="ALL">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
            <select
              value={uploaderFilter}
              onChange={(e) => setUploaderFilter(e.target.value)}
              style={{ padding: 8, border: "1px solid #b9cde7", borderRadius: 6 }}
            >
              <option value="ALL">All Uploaders</option>
              {uploaderOptions.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ padding: 8, border: "1px solid #b9cde7", borderRadius: 6 }}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name_asc">Name A-Z</option>
              <option value="name_desc">Name Z-A</option>
            </select>
            <button
              onClick={() => {
                setSearchText("");
                setStatusFilter("ALL");
                setUploaderFilter("ALL");
                setSortBy("newest");
              }}
              style={{ padding: "8px 12px" }}
            >
              Clear
            </button>
          </div>
          <div style={{ fontSize: 12, color: "#385676" }}>
            Showing {filteredDocuments.length} of {documents.length} documents
          </div>
        </div>

        {loading ? (
          <p>Loading documents...</p>
        ) : (
          <table border={1} width="100%" cellPadding={8} style={{ borderCollapse: "collapse" }}>
            <thead style={{ background: "#f0f4f8" }}>
              <tr>
                <th>Name</th>
                <th>Folder</th>
                <th>Size</th>
                <th>Status</th>
                <th>Uploaded By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.length === 0 && (
                <tr>
                  <td colSpan={6} align="center">
                    No documents found
                  </td>
                </tr>
              )}

              {filteredDocuments.map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.name}</td>
                  <td>{doc.folder_name || "-"}</td>
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
                    <button onClick={() => viewDocument(doc.id)} style={{ marginRight: 5 }}>
                      View
                    </button>
                    <button onClick={() => downloadDocument(doc.id)} style={{ marginRight: 5 }}>
                      Download
                    </button>
                    {doc.modified_by === username && (
                      <>
                        <select
                          value={moveTargets[doc.id] || ""}
                          onChange={(e) =>
                            setMoveTargets({
                              ...moveTargets,
                              [doc.id]: Number(e.target.value)
                            })
                          }
                          style={{ marginRight: 5 }}
                        >
                          <option value="">Move to...</option>
                          {folders.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                        <button onClick={() => handleMoveDocument(doc.id)} style={{ marginRight: 5 }}>
                          Move
                        </button>
                      </>
                    )}
                    {canApprove && doc.status === "PENDING" && (
                      <>
                        <button
                          onClick={() => handleApprove(doc.id)}
                          style={{ marginRight: 5, background: "#2e7d32", color: "white" }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(doc.id)}
                          style={{ background: "#c62828", color: "white" }}
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
