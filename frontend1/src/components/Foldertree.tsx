type Folder = {
  id: number;
  name: string;
};

export default function FolderTree({
  folders,
  onSelect
}: {
  folders: Folder[];
  onSelect: (id: number | null) => void;
}) {
  return (
    <div style={{
      width: 240,
      borderRight: "1px solid #ddd",
      padding: 12
    }}>
      <h4>📁 Folders</h4>

      <div
        style={{ cursor: "pointer", marginBottom: 8 }}
        onClick={() => onSelect(null)}
      >
        📂 All Documents
      </div>

      {folders.map(folder => (
        <div
          key={folder.id}
          style={{ cursor: "pointer", marginBottom: 6 }}
          onClick={() => onSelect(folder.id)}
        >
          📁 {folder.name}
        </div>
      ))}
    </div>
  );
}
