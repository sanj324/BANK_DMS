import { useEffect, useState } from "react";
import { fetchFolders, createFolder } from "../services/api";

export default function FolderSidebar({ onSelect }: any) {
  const [folders, setFolders] = useState<any[]>([]);
  const [newFolder, setNewFolder] = useState("");
  const role = localStorage.getItem("role");

  useEffect(() => {
    loadFolders();
  }, []);

  async function loadFolders() {
    const data = await fetchFolders();
    setFolders(data);
  }

  async function handleCreate() {
    if (!newFolder) return;
    await createFolder(newFolder);
    setNewFolder("");
    loadFolders();
  }

  return (
    <div style={{ width: 250, borderRight: "1px solid #ddd", padding: 10 }}>
      <h3>Folders</h3>

      {role === "MAKER" && (
        <>
          <input
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            placeholder="New folder"
          />
          <button onClick={handleCreate}>Create</button>
        </>
      )}

      <ul>
        <li onClick={() => onSelect(null)}>All Documents</li>
        {folders.map((f) => (
          <li key={f.id} onClick={() => onSelect(f.id)}>
            {f.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
